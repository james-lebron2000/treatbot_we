#!/usr/bin/env python3
"""
本地从 Excel 批量解析试验入组条件 → 结构化 JSON
支持断点续跑，结果写入 data/structured_inclusion.json

用法:
  OPENAI_API_KEY=xxx OPENAI_BASE_URL=xxx python3 scripts/parseInclusionLocal.py
  OPENAI_API_KEY=xxx python3 scripts/parseInclusionLocal.py  # 默认用 Kimi
  PARSE_CONCURRENCY=5 python3 scripts/parseInclusionLocal.py  # 并发 5

结果文件可直接通过 loadStructuredInclusion.js 写入数据库。
"""

import os
import sys
import json
import time
import threading
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    import openpyxl
except ImportError:
    print("请安装 openpyxl: pip3 install openpyxl")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("请安装 requests: pip3 install requests")
    sys.exit(1)

# ---- 配置 ----
API_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("KIMI_API_KEY", "")
BASE_URL = (os.environ.get("OPENAI_BASE_URL") or os.environ.get("KIMI_BASE_URL", "https://api.moonshot.cn/v1")).rstrip("/")
MODEL = os.environ.get("OPENAI_MODEL") or os.environ.get("KIMI_MODEL", "kimi-k2.5")
CONCURRENCY = int(os.environ.get("PARSE_CONCURRENCY", "5"))
TIMEOUT = 90

SCRIPT_DIR = Path(__file__).parent
EXCEL_PATH = Path(os.environ.get("EXCEL_PATH", str(SCRIPT_DIR.parent.parent.parent.parent / "Trials_20250908.xlsx")))
OUTPUT_PATH = SCRIPT_DIR.parent / "data" / "structured_inclusion.json"

if not API_KEY:
    print("请设置 OPENAI_API_KEY 或 KIMI_API_KEY 环境变量")
    sys.exit(1)

# ---- Prompt ----
SYSTEM_PROMPT = """你是临床试验入排标准解析专家。从入组条件文本中提取结构化信息，返回 JSON。

必须返回以下格式（字段不存在则填 null）：
{
  "age_min": 18,
  "age_max": 75,
  "ecog_max": 1,
  "survival_months_min": 3,
  "required_histology": true,
  "required_measurable_lesion": true,
  "required_genes": ["EGFR activating mutation", "ALK fusion"],
  "required_pdl1": "TPS>=50%",
  "prior_lines_min": null,
  "prior_lines_max": null,
  "required_prior_therapies": ["含铂化疗"],
  "excluded_prior_therapies": ["PD-1/PD-L1单抗"],
  "allowed_cancer_types": ["非小细胞肺癌", "NSCLC"],
  "required_stage": ["III期", "IV期", "晚期"],
  "organ_function_requirements": ["ALT/AST≤2.5xULN", "CrCl≥50ml/min"],
  "other_key_criteria": ["至少1个可测量病灶(RECIST 1.1)"]
}

规则：
1. age_min/age_max：从"年龄≥X且≤Y周岁"提取，只返回数字
2. ecog_max：从"ECOG评分≤N"提取，只返回数字（0-4）
3. required_genes：具体基因要求，包括变异类型（如"KRAS G12C突变"），不确定填null
4. required_pdl1：PD-L1表达要求（如"TPS≥1%"/"CPS≥10"），不确定填null
5. allowed_cancer_types：允许入组的癌种列表，用标准中文名
6. 只提取明确写在文本中的条件，不要推测
7. 必须返回合法 JSON，不要输出其他文本"""


def build_user_prompt(row: dict) -> str:
    parts = [f"项目名称: {row.get('项目名称', '')}"]
    if row.get('适应症'):
        parts.append(f"适应症: {row['适应症']}")
    gene_req = row.get('基因要求', '')
    if gene_req and str(gene_req) not in ('None', 'nan', ''):
        parts.append(f"基因要求: {gene_req}")
    inclusion = str(row.get('入组条件') or '无')[:1200]
    parts.append(f"\n入组条件:\n{inclusion}")
    exclusion = str(row.get('排除条件') or '')[:400]
    if exclusion:
        parts.append(f"\n排除条件（仅前几条）:\n{exclusion}")
    return '\n'.join(parts)


def call_llm(user_prompt: str, retries: int = 2) -> dict:
    temperature = 1 if 'kimi' in MODEL.lower() else 0
    body = {
        "model": MODEL,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]
    }
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    for attempt in range(retries + 1):
        try:
            resp = requests.post(
                f"{BASE_URL}/chat/completions",
                json=body,
                headers=headers,
                timeout=TIMEOUT
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            # 去除 markdown 代码块
            cleaned = re.sub(r'^```[a-zA-Z]*\n?', '', content.strip())
            cleaned = re.sub(r'\n?```$', '', cleaned).strip()
            return json.loads(cleaned)
        except Exception as e:
            if attempt < retries:
                wait = (attempt + 1) * 2
                print(f"  重试 ({attempt + 1}/{retries}): {e}, 等待 {wait}s")
                time.sleep(wait)
            else:
                raise


def load_excel(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
    ws = wb['1.招募中项目']
    rows = list(ws.iter_rows(values_only=True))
    headers = [str(h) if h is not None else '' for h in rows[0]]
    result = []
    for row in rows[1:]:
        d = {headers[i]: row[i] for i in range(len(headers))}
        result.append(d)
    wb.close()
    return result


def save_checkpoint(data: dict, path: Path):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def main():
    print(f"模型: {MODEL}")
    print(f"API: {BASE_URL}")
    print(f"并发: {CONCURRENCY}")
    print(f"Excel: {EXCEL_PATH}")
    print(f"输出: {OUTPUT_PATH}")

    if not EXCEL_PATH.exists():
        print(f"\n错误: Excel 文件不存在: {EXCEL_PATH}")
        print("请设置 EXCEL_PATH 环境变量，或将文件放到默认路径")
        sys.exit(1)

    print("\n读取 Excel...")
    trials = load_excel(EXCEL_PATH)
    print(f"共 {len(trials)} 条试验")

    # 加载已有结果
    existing = {}
    if OUTPUT_PATH.exists():
        existing = json.loads(OUTPUT_PATH.read_text(encoding='utf-8'))
        print(f"已有 {len(existing)} 条解析结果，将跳过")

    # 筛选待解析
    to_parse = [t for t in trials
                if t.get('项目编码') and
                str(t.get('项目编码')) not in existing and
                t.get('入组条件')]
    print(f"待解析: {len(to_parse)} 条\n")

    if not to_parse:
        print("全部已完成！")
        return

    lock = threading.Lock()
    done = [0]
    failed = [0]

    def parse_one(trial):
        tid = str(trial['项目编码'])
        try:
            prompt = build_user_prompt(trial)
            result = call_llm(prompt)
            with lock:
                existing[tid] = result
                done[0] += 1
                if done[0] % 10 == 0 or done[0] == len(to_parse):
                    save_checkpoint(existing, OUTPUT_PATH)
                    print(f"进度: {done[0]}/{len(to_parse)} (失败 {failed[0]})")
        except Exception as e:
            with lock:
                failed[0] += 1
                existing[tid] = {"_error": str(e)}
                print(f"  失败 [{tid}]: {e}")

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = [executor.submit(parse_one, t) for t in to_parse]
        for f in as_completed(futures):
            f.result()  # re-raise if needed

    save_checkpoint(existing, OUTPUT_PATH)
    success_count = done[0] - failed[0]
    print(f"\n完成: 成功 {success_count}, 失败 {failed[0]}")
    print(f"结果保存至: {OUTPUT_PATH}")
    print("\n下一步: 运行以下命令将结果写入数据库")
    print("  ssh ubuntu@49.235.162.129 'docker exec treatbot-api node scripts/loadStructuredInclusion.js'")


if __name__ == "__main__":
    main()
