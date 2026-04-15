/**
 * 批量解析试验入组条件 → 结构化 JSON
 * 使用 OpenAI 兼容 API（支持自定义 base_url）
 *
 * 用法：
 *   OPENAI_API_KEY=xxx OPENAI_BASE_URL=xxx node scripts/parseInclusion.js
 *
 * 支持断点续跑：已有 structured_inclusion 的记录会跳过
 */
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// ---- 配置（默认用 Kimi，也兼容 OpenAI 格式 API）----
const dotenvPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(dotenvPath)) require('dotenv').config({ path: dotenvPath });

const API_KEY = process.env.OPENAI_API_KEY || process.env.KIMI_API_KEY || '';
const BASE_URL = (process.env.OPENAI_BASE_URL || process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
const MODEL = process.env.OPENAI_MODEL || process.env.KIMI_MODEL || 'kimi-k2.5';
const CONCURRENCY = parseInt(process.env.PARSE_CONCURRENCY || '3', 10);
const TIMEOUT_MS = 90000;
const DATA_PATH = process.env.TRIAL_DATA_PATH
  || path.join(__dirname, '..', 'data', 'trials_data.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'structured_inclusion.json');

if (!API_KEY) {
  console.error('请设置 OPENAI_API_KEY 环境变量');
  process.exit(1);
}

// ---- Prompt ----
const SYSTEM_PROMPT = `你是临床试验入排标准解析专家。从入组条件文本中提取结构化信息，返回 JSON。

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
7. 必须返回合法 JSON，不要输出其他文本`;

const buildUserPrompt = (trial) => {
  const parts = [`项目名称: ${trial['项目名称'] || ''}`];
  if (trial['适应症']) parts.push(`适应症: ${trial['适应症']}`);
  if (trial['基因要求'] && `${trial['基因要求']}` !== 'nan') {
    parts.push(`基因要求: ${trial['基因要求']}`);
  }
  parts.push(`\n入组条件:\n${(trial['入组条件'] || '无').substring(0, 1200)}`);
  if (trial['排除条件']) {
    parts.push(`\n排除条件（仅前几条）:\n${trial['排除条件'].substring(0, 400)}`);
  }
  return parts.join('\n');
};

// ---- API 调用 ----
const callLLM = async (userPrompt, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const body = {
        model: MODEL,
        temperature: MODEL.includes('kimi') ? 1 : 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      };
      // 只有 OpenAI 系模型才加 response_format（Kimi 不支持）
      if (MODEL.startsWith('gpt') || MODEL.includes('claude')) {
        body.response_format = { type: 'json_object' };
      }
      const resp = await axios.post(
        `${BASE_URL}/chat/completions`,
        body,
        {
          timeout: TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const content = resp?.data?.choices?.[0]?.message?.content || '';
      const cleaned = content.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      if (attempt < retries) {
        const wait = (attempt + 1) * 2000;
        const detail = err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : '';
        console.warn(`  重试 (${attempt + 1}/${retries}): ${err.message} ${detail}, 等待 ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
};

// ---- 并发控制 ----
const runWithConcurrency = async (tasks, concurrency) => {
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
};

// ---- 主流程 ----
const run = async () => {
  console.log(`模型: ${MODEL}`);
  console.log(`并发: ${CONCURRENCY}`);
  console.log(`API: ${BASE_URL}`);

  // 加载试验数据
  let trials;
  if (fs.existsSync(DATA_PATH)) {
    const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
    trials = Array.isArray(raw) ? raw : (raw['1.招募中项目'] || []);
  } else {
    console.error(`数据文件不存在: ${DATA_PATH}`);
    process.exit(1);
  }
  console.log(`共 ${trials.length} 条试验`);

  // 加载已有结果（支持断点续跑）
  let existing = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`已有 ${Object.keys(existing).length} 条解析结果，将跳过`);
  }

  // 筛选需要解析的
  const toParse = trials.filter((t) => {
    const id = t['项目编码'];
    return id && !existing[id] && t['入组条件'];
  });
  console.log(`待解析: ${toParse.length} 条\n`);

  if (toParse.length === 0) {
    console.log('全部已完成');
    return;
  }

  let done = 0;
  let failed = 0;

  const tasks = toParse.map((trial) => async () => {
    const id = trial['项目编码'];
    try {
      const userPrompt = buildUserPrompt(trial);
      const result = callLLM(userPrompt);
      const parsed = await result;
      existing[id] = parsed;
      done++;
      if (done % 10 === 0 || done === toParse.length) {
        // 每 10 条保存一次（断点续跑）
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
        console.log(`进度: ${done}/${toParse.length} (失败 ${failed})`);
      }
    } catch (err) {
      failed++;
      console.error(`  失败 [${id}]: ${err.message}`);
      existing[id] = { _error: err.message };
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);

  // 最终保存
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`\n完成: 成功 ${done - failed}, 失败 ${failed}`);
  console.log(`结果保存至: ${OUTPUT_PATH}`);
};

run().catch((err) => {
  console.error('脚本异常:', err);
  process.exit(1);
});
