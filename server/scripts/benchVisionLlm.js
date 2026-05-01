#!/usr/bin/env node
/**
 * Vision-LLM Benchmark Runner
 * --------------------------------------------------------------------
 * 对一组病历文件（PDF / 图片）跑 MiniMax / Kimi / Doubao 三家视觉 LLM，
 * 采集 token 用量、耗时、CNY 成本、产出 markdown，便于人工对比质量。
 *
 * 设计要点：
 *  - 不复用 services/llmClient.chatJson —— 那条路会做 zod 校验并丢掉 raw response，
 *    benchmark 需要 raw markdown + 完整 usage，所以直接走 axios。
 *  - PDF 路径分两种：
 *      · 有文本层（markitdown 抽出 markdown >= 50B 含中文字符）→ mode='text'，
 *        LLM 把 markitdown 输出再润色 / 结构化为 markdown
 *      · 无文本层（扫描件）→ mode='vision_pdf'，pdftoppm 拆 N 页 PNG → 多 image_url
 *        喂同一个 user message
 *  - 图片直接 base64，mode='vision_image'
 *  - 单 task 失败不阻塞其他，错误信息写到 CSV.error，进程退出码 0
 *  - 启动时打印「估算总成本上限」并 sleep 5s 给中止机会（防 24MB×3 provider 失控烧钱）
 *
 * CLI:
 *   node server/scripts/benchVisionLlm.js \
 *     [--files <comma-paths|"default">]   # 默认 6 份 fixture
 *     [--providers minimax,kimi,doubao]   # 默认三家全跑
 *     [--out ./bench-out]                  # 输出目录（CSV + markdown + summary）
 *     [--max-pages 3]                      # PDF vision 模式拆页上限
 *     [--repeat 1]                         # 同组合重复次数取均值（默认 1）
 *     [--concurrency 2]                    # 同 provider 内并发
 *     [--dry-run]                          # 只打印计划不真调
 */

/* eslint-disable no-console */

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const axios = require('axios');

// 加载 .env（脚本独立可执行，不依赖 server 启动）
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* dotenv 缺失也允许，依赖 shell 注入 */ }

const { computeCost, estimateUpperBound } = require('../utils/llmPricing');
const markitdown = require('../services/markitdown');

// ============================================================================
// 配置
// ============================================================================

const DATASET_ROOT = '/Users/lijinming/Documents/Commerce/AItrial/data/dataset_patient';

const DEFAULT_FIXTURES = [
  // 文本型 PDF（验 markitdown 路径）
  `${DATASET_ROOT}/LSLI-女-71y-胰腺Ca-G12V-MTAP-一线后.pdf`,
  // 大型扫描压力
  `${DATASET_ROOT}/MSHU尿路上皮癌.pdf`,
  // 文本基因报告
  `${DATASET_ROOT}/基因检测报告/黄志直百适博plus基因检测报告P227035-2.pdf`,
  // 图片标准
  `${DATASET_ROOT}/t1.png`,
  `${DATASET_ROOT}/t4.png`,
  // 大型混合基因报告
  `${DATASET_ROOT}/基因检测报告/A于莉-ID30024070311-实体瘤TC209+MSI+PD-L1-20240712.pdf`
];

const PROVIDER_CFG = {
  minimax: () => ({
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: (process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1').replace(/\/+$/, ''),
    chatPath: process.env.MINIMAX_CHAT_PATH || '/text/chatcompletion_v2',
    visionModel: process.env.MINIMAX_VISION_MODEL || 'abab6.5s-chat',
    textModel: process.env.MINIMAX_MODEL || 'MiniMax-Text-01',
    timeoutMs: parseInt(process.env.MINIMAX_TIMEOUT_MS || '60000', 10)
  }),
  kimi: () => ({
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: (process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, ''),
    chatPath: '/chat/completions',
    visionModel: process.env.KIMI_VISION_MODEL || 'moonshot-v1-128k-vision-preview',
    textModel: process.env.KIMI_MODEL || 'moonshot-v1-128k',
    timeoutMs: parseInt(process.env.KIMI_TIMEOUT_MS || '60000', 10)
  }),
  doubao: () => ({
    apiKey: process.env.ARK_API_KEY || '',
    baseUrl: (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, ''),
    chatPath: '/chat/completions',
    // Ark 必须用带版本后缀的具体模型 ID（短名 doubao-seed-1.6-vision 会 404）。
    visionModel: process.env.ARK_VISION_MODEL || 'doubao-seed-1-6-vision-250815',
    textModel: process.env.ARK_VISION_MODEL || 'doubao-seed-1-6-vision-250815',
    timeoutMs: parseInt(process.env.ARK_TIMEOUT_MS || '60000', 10)
  })
};

// 视觉转 markdown 提示词（与生产 OcrExtractionSchema JSON prompt 不同 —— 本轮要 raw markdown）
const VISION_SYSTEM_PROMPT = '你是一名医疗病历转写助手。把图片中的所有可读内容（基本信息、诊断、检查、化验、影像、病理、用药、医嘱等）按原始结构转写为整洁的 Markdown。保留小标题、段落、表格；数值和单位完整保留；如有手写或模糊文字按"[?]"标注。不要添加图片中没有的内容，不要解读或诊断。';
const VISION_USER_PROMPT = '请将下面的病历图片完整转写为 Markdown。如有多页，请按页顺序输出，每页之间用 `\\n\\n---\\n\\n` 分隔。';

const TEXT_SYSTEM_PROMPT = '你是一名医疗病历整理助手。把下面的病历原文（已是 markdown 或纯文本）整理为更整洁、可读的 Markdown：合并重复段落、规范化标题层级、对齐表格列、补全单位。不要新增原文没有的事实，不要做诊断推断。';
const TEXT_USER_PROMPT_PREFIX = '请整理以下病历文本为干净的 Markdown：\n\n';

// ============================================================================
// CLI 参数解析
// ============================================================================

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const opts = {
    files: null,
    providers: ['minimax', 'kimi', 'doubao'],
    out: path.resolve(process.cwd(), 'bench-out'),
    maxPages: 3,
    repeat: 1,
    concurrency: 2,
    dryRun: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case '--files':
        opts.files = next; i++; break;
      case '--providers':
        opts.providers = next.split(',').map((s) => s.trim()).filter(Boolean); i++; break;
      case '--out':
        opts.out = path.resolve(process.cwd(), next); i++; break;
      case '--max-pages':
        opts.maxPages = parseInt(next, 10); i++; break;
      case '--repeat':
        opts.repeat = parseInt(next, 10); i++; break;
      case '--concurrency':
        opts.concurrency = parseInt(next, 10); i++; break;
      case '--dry-run':
        opts.dryRun = true; break;
      case '--help':
      case '-h':
        opts.help = true; break;
      default:
        console.warn(`[warn] 未知参数: ${a}`);
    }
  }
  return opts;
};

const printHelp = () => {
  console.log(`
Vision-LLM Benchmark Runner

Usage:
  node server/scripts/benchVisionLlm.js [options]

Options:
  --files <paths|"default">   Comma-separated file paths, or "default" for built-in 6 fixtures
  --providers <list>          minimax,kimi,doubao (default: all three)
  --out <dir>                 Output dir (default: ./bench-out)
  --max-pages <n>             PDF vision mode page limit (default: 3)
  --repeat <n>                Repeat same combo n times (default: 1)
  --concurrency <n>           Per-provider concurrency (default: 2)
  --dry-run                   Print plan only, no API calls
  -h, --help                  Show this help

Required env (per provider):
  MINIMAX_API_KEY  + MINIMAX_VISION_MODEL (e.g. abab6.5s-chat)
  KIMI_API_KEY     + KIMI_VISION_MODEL (default: moonshot-v1-128k-vision-preview)
  ARK_API_KEY      + ARK_VISION_MODEL (default: doubao-seed-1.6-vision)

Outputs (in --out dir):
  bench-results.csv          (one row per file × provider × repeat)
  bench-summary.json         (aggregate per provider)
  <provider>/<basename>.md   (raw markdown output for human comparison)
`);
};

// ============================================================================
// 工具函数
// ============================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fileExists = async (p) => {
  try { await fsp.access(p); return true; } catch { return false; }
};

const which = (cmd) => new Promise((resolve) => {
  execFile('which', [cmd], (err, stdout) => resolve(err ? null : stdout.trim() || null));
});

const sanitizeFilename = (s) => s.replace(/[^\w一-龥.-]+/g, '_').slice(0, 80);

const fileBasenameNoExt = (p) => path.basename(p, path.extname(p));

const guessMime = (p) => {
  const ext = path.extname(p).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.bmp': 'image/bmp', '.pdf': 'application/pdf'
  }[ext] || 'application/octet-stream';
};

const readFileAsDataUrl = async (filepath) => {
  const buf = await fsp.readFile(filepath);
  const mime = guessMime(filepath);
  return `data:${mime};base64,${buf.toString('base64')}`;
};

/**
 * pdftoppm: PDF → PNG 多页。失败则 reject。
 * 输出路径：{tmpDir}/page-{1,2,3,...}.png
 */
const pdfToPngPages = (pdfPath, maxPages, tmpDir) => new Promise((resolve, reject) => {
  const prefix = path.join(tmpDir, 'page');
  const args = ['-png', '-r', '150', '-f', '1', '-l', String(maxPages), pdfPath, prefix];
  const proc = spawn('pdftoppm', args, { stdio: 'pipe' });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.on('error', (e) => reject(new Error(`pdftoppm spawn failed: ${e.message}`)));
  proc.on('close', async (code) => {
    if (code !== 0) {
      return reject(new Error(`pdftoppm exit ${code}: ${stderr.slice(0, 200)}`));
    }
    try {
      const files = (await fsp.readdir(tmpDir))
        .filter((f) => /^page-\d+\.png$/i.test(f))
        .sort((a, b) => {
          const na = parseInt(a.match(/(\d+)/)[1], 10);
          const nb = parseInt(b.match(/(\d+)/)[1], 10);
          return na - nb;
        })
        .slice(0, maxPages)
        .map((f) => path.join(tmpDir, f));
      resolve(files);
    } catch (e) { reject(e); }
  });
});

// 中文医学关键词，用于判断 markitdown 输出是否「可用文本」
const MEANINGFUL_TEXT_RE = /(诊断|患者|住院|姓名|性别|主诉|检查|检验|影像|肿瘤|分期|基因|治疗|医嘱|化疗|放疗|靶向)/;

const isMeaningfulText = (md) => {
  if (!md) return false;
  if (md.length < 50) return false;
  return MEANINGFUL_TEXT_RE.test(md);
};

// ============================================================================
// LLM 调用（直接 axios，不走 chatJson）
// ============================================================================

/**
 * 构造 OpenAI 兼容的 vision messages：单个 user message 内多段 content
 * @param {string[]} imageDataUrls
 * @param {boolean} isVision
 */
const buildMessages = ({ mode, dataUrls, textContent }) => {
  if (mode === 'text') {
    return [
      { role: 'system', content: TEXT_SYSTEM_PROMPT },
      { role: 'user', content: TEXT_USER_PROMPT_PREFIX + (textContent || '') }
    ];
  }
  // vision_image / vision_pdf：多张图都塞同一个 user message
  const userContent = [{ type: 'text', text: VISION_USER_PROMPT }];
  for (const url of dataUrls) {
    userContent.push({ type: 'image_url', image_url: { url } });
  }
  return [
    { role: 'system', content: VISION_SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ];
};

/**
 * 直接调 provider 的 chat completion 端点。
 * 返回完整 response 数据 + 计时，便于 benchmark 采集。
 */
const callProvider = async ({ provider, model, messages, timeoutMs, maxTokens = 4000 }) => {
  const cfgFn = PROVIDER_CFG[provider];
  if (!cfgFn) throw new Error(`未知 provider: ${provider}`);
  const cfg = cfgFn();
  if (!cfg.apiKey) throw new Error(`provider_not_configured:${provider}`);

  const body = {
    model,
    messages,
    temperature: 0.2,
    max_tokens: maxTokens
  };

  const t0 = process.hrtime.bigint();
  let resp;
  try {
    resp = await axios.post(
      `${cfg.baseUrl}${cfg.chatPath}`,
      body,
      {
        timeout: timeoutMs || cfg.timeoutMs,
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    const elapsedMs = Number((process.hrtime.bigint() - t0) / 1_000_000n);
    const status = err.response?.status;
    const errBody = err.response?.data;
    const detail = typeof errBody === 'string'
      ? errBody.slice(0, 300)
      : (errBody ? JSON.stringify(errBody).slice(0, 300) : err.message);
    const e2 = new Error(`provider_http_error[${status || 'no_response'}] ${detail}`);
    e2.elapsedMs = elapsedMs;
    e2.httpStatus = status;
    throw e2;
  }
  const elapsedMs = Number((process.hrtime.bigint() - t0) / 1_000_000n);

  const choice = resp?.data?.choices?.[0];
  const content = choice?.message?.content || '';
  // OpenAI / MiniMax / Kimi / Doubao Ark usage 字段都叫这名
  const usage = resp?.data?.usage || null;

  return {
    content: typeof content === 'string' ? content : JSON.stringify(content),
    usage,
    elapsedMs,
    raw: resp.data
  };
};

// ============================================================================
// 任务规划与执行
// ============================================================================

const planTaskMode = async (filepath) => {
  const ext = path.extname(filepath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
    return { mode: 'vision_image' };
  }
  if (ext === '.pdf') {
    // 先试 markitdown
    if (await markitdown.isAvailable()) {
      const result = await markitdown.convertToMarkdown(filepath);
      if (result.success && isMeaningfulText(result.markdown)) {
        return { mode: 'text', preExtracted: result.markdown };
      }
    }
    return { mode: 'vision_pdf' };
  }
  return { mode: 'unsupported' };
};

const runOneTask = async ({ task, opts, pdftoppmAvailable, tmpRoot }) => {
  const { file, provider, mode, preExtracted, repeatIndex } = task;
  const cfg = PROVIDER_CFG[provider]();
  const isText = mode === 'text';
  const model = isText ? cfg.textModel : cfg.visionModel;

  // 准备输入
  let messages;
  let pagesProcessed = 0;
  let stat;
  try {
    stat = await fsp.stat(file);
  } catch (statErr) {
    return makeRow(task, model, null, null, 'error', statErr.message);
  }

  if (mode === 'unsupported') {
    return makeRow(task, model, null, null, 'error', `unsupported_ext:${path.extname(file)}`);
  }

  let tmpDir = null;
  try {
    if (mode === 'vision_image') {
      const dataUrl = await readFileAsDataUrl(file);
      messages = buildMessages({ mode: 'vision_image', dataUrls: [dataUrl] });
      pagesProcessed = 1;
    } else if (mode === 'vision_pdf') {
      if (!pdftoppmAvailable) {
        return makeRow(task, model, null, null, 'error', 'no_pdftoppm: brew install poppler');
      }
      tmpDir = await fsp.mkdtemp(path.join(tmpRoot, 'pdf-'));
      const pages = await pdfToPngPages(file, opts.maxPages, tmpDir);
      pagesProcessed = pages.length;
      if (pagesProcessed === 0) {
        return makeRow(task, model, null, null, 'error', 'pdftoppm produced 0 pages');
      }
      const dataUrls = await Promise.all(pages.map(readFileAsDataUrl));
      messages = buildMessages({ mode: 'vision_pdf', dataUrls });
    } else {
      // text mode：把 markitdown 输出截到 8000 字符（防 token 爆炸）
      const textInput = (preExtracted || '').slice(0, 8000);
      messages = buildMessages({ mode: 'text', textContent: textInput });
      pagesProcessed = 0;
    }

    // 真调
    if (opts.dryRun) {
      return makeRow(task, model, { prompt_tokens: '?', completion_tokens: '?', total_tokens: '?' }, 0, 'dry-run', null, { pagesProcessed });
    }

    const result = await callProvider({
      provider, model, messages,
      timeoutMs: cfg.timeoutMs,
      maxTokens: 4000
    });

    // 写 markdown 文件
    const outDir = path.join(opts.out, provider);
    await fsp.mkdir(outDir, { recursive: true });
    const baseName = sanitizeFilename(fileBasenameNoExt(file));
    const suffix = opts.repeat > 1 ? `.r${repeatIndex + 1}` : '';
    const mdPath = path.join(outDir, `${baseName}${suffix}.md`);
    await fsp.writeFile(mdPath, result.content || '(empty)', 'utf-8');

    return makeRow(task, model, result.usage, result.elapsedMs, 'ok', null, {
      pagesProcessed,
      markdownPath: mdPath,
      fileSize: stat.size
    });
  } catch (err) {
    const stack = (err.stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 300);
    return makeRow(task, model, null, err.elapsedMs || null, 'error', `${err.message} :: ${stack}`, {
      pagesProcessed,
      fileSize: stat ? stat.size : null
    });
  } finally {
    if (tmpDir) {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
};

const makeRow = (task, model, usage, elapsedMs, status, error, extra = {}) => {
  const cost = usage && typeof usage === 'object' && typeof usage.prompt_tokens === 'number'
    ? computeCost(task.provider, model, usage)
    : { inputCost: null, outputCost: null, totalCost: null, currency: 'CNY', rateFound: false };
  return {
    timestamp: new Date().toISOString(),
    file_basename: path.basename(task.file),
    file_size_bytes: extra.fileSize ?? null,
    provider: task.provider,
    model,
    mode: task.mode,
    repeat: task.repeatIndex + 1,
    pages_processed: extra.pagesProcessed ?? 0,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    input_cost_cny: cost.inputCost,
    output_cost_cny: cost.outputCost,
    total_cost_cny: cost.totalCost,
    rate_found: cost.rateFound,
    latency_ms: elapsedMs ?? null,
    markdown_path: extra.markdownPath ?? null,
    status,
    error: error ? String(error).slice(0, 500) : null
  };
};

// ============================================================================
// CSV / JSON / 控制台输出
// ============================================================================

const CSV_COLUMNS = [
  'timestamp', 'file_basename', 'file_size_bytes', 'provider', 'model', 'mode', 'repeat',
  'pages_processed', 'prompt_tokens', 'completion_tokens', 'total_tokens',
  'input_cost_cny', 'output_cost_cny', 'total_cost_cny', 'rate_found',
  'latency_ms', 'markdown_path', 'status', 'error'
];

const csvEscape = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const writeCsv = async (rows, outPath) => {
  const header = CSV_COLUMNS.join(',');
  const body = rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(',')).join('\n');
  await fsp.writeFile(outPath, header + '\n' + body + '\n', 'utf-8');
};

const aggregateSummary = (rows) => {
  const summary = {};
  for (const r of rows) {
    const p = r.provider;
    if (!summary[p]) {
      summary[p] = {
        successCount: 0, failCount: 0,
        totalLatencyMs: 0, totalCostCny: 0,
        totalPromptTokens: 0, totalCompletionTokens: 0,
        rateFoundCount: 0,
        errors: []
      };
    }
    const s = summary[p];
    if (r.status === 'ok') {
      s.successCount += 1;
      s.totalLatencyMs += Number(r.latency_ms) || 0;
      if (r.rate_found) s.rateFoundCount += 1;
      s.totalCostCny += Number(r.total_cost_cny) || 0;
      s.totalPromptTokens += Number(r.prompt_tokens) || 0;
      s.totalCompletionTokens += Number(r.completion_tokens) || 0;
    } else if (r.status === 'error') {
      s.failCount += 1;
      s.errors.push({ file: r.file_basename, mode: r.mode, error: r.error });
    }
  }
  // 平均 token
  for (const p of Object.keys(summary)) {
    const s = summary[p];
    const n = Math.max(1, s.successCount);
    s.avgPromptTokens = Math.round(s.totalPromptTokens / n);
    s.avgCompletionTokens = Math.round(s.totalCompletionTokens / n);
    s.avgLatencyMs = Math.round(s.totalLatencyMs / n);
    s.totalCostCny = Number(s.totalCostCny.toFixed(4));
  }
  return summary;
};

const printAsciiTable = (summary) => {
  console.log('\n=== Benchmark Summary ===');
  const cols = ['provider', 'success', 'fail', 'total_cny', 'avg_latency_ms', 'avg_prompt_tokens', 'avg_completion_tokens'];
  console.log(cols.join(' | '));
  console.log('-'.repeat(120));
  for (const [provider, s] of Object.entries(summary)) {
    const row = [
      provider.padEnd(10),
      String(s.successCount).padStart(7),
      String(s.failCount).padStart(4),
      `¥${s.totalCostCny.toFixed(4)}`.padStart(9),
      String(s.avgLatencyMs).padStart(14),
      String(s.avgPromptTokens).padStart(17),
      String(s.avgCompletionTokens).padStart(20)
    ];
    console.log(row.join(' | '));
  }
  console.log('');
};

// ============================================================================
// 并发 runner（按 provider 限并发）
// ============================================================================

const runWithConcurrency = async (tasks, opts, ctx) => {
  const rows = [];
  // 按 provider 分组，每组限 concurrency
  const groups = {};
  for (const t of tasks) {
    if (!groups[t.provider]) groups[t.provider] = [];
    groups[t.provider].push(t);
  }
  const promises = Object.entries(groups).map(async ([provider, tList]) => {
    const limit = opts.concurrency;
    let idx = 0;
    const localRows = [];
    const workers = Array.from({ length: limit }).map(async () => {
      while (idx < tList.length) {
        const myIdx = idx++;
        const task = tList[myIdx];
        process.stdout.write(`[${provider}] ${myIdx + 1}/${tList.length} ${path.basename(task.file)} (${task.mode}) ... `);
        const row = await runOneTask({ task, opts, ...ctx });
        const tag = row.status === 'ok'
          ? `✓ ${row.latency_ms}ms ¥${row.total_cost_cny ?? 'N/A'}`
          : `✗ ${row.status} ${(row.error || '').slice(0, 80)}`;
        process.stdout.write(tag + '\n');
        localRows.push(row);
      }
    });
    await Promise.all(workers);
    return localRows;
  });
  for (const r of await Promise.all(promises)) {
    rows.push(...r);
  }
  return rows;
};

// ============================================================================
// 启动估算 + 资源校验
// ============================================================================

const estimateTotalCostUpperBound = (tasks) => {
  let total = 0;
  for (const t of tasks) {
    const cfg = PROVIDER_CFG[t.provider]();
    const model = t.mode === 'text' ? cfg.textModel : cfg.visionModel;
    const upper = estimateUpperBound(t.provider, model, {
      maxPromptTokens: t.mode === 'vision_pdf' ? 6000 : 4000,
      maxCompletionTokens: 2500
    });
    total += upper.totalCost || 0;
  }
  return total;
};

const validateProviderCreds = (providers) => {
  const valid = [];
  for (const p of providers) {
    if (!PROVIDER_CFG[p]) {
      console.warn(`[warn] 未知 provider: ${p}（跳过）`);
      continue;
    }
    const cfg = PROVIDER_CFG[p]();
    if (!cfg.apiKey) {
      console.warn(`[warn] ${p} 缺凭证（${p === 'minimax' ? 'MINIMAX_API_KEY' : p === 'kimi' ? 'KIMI_API_KEY' : 'ARK_API_KEY'}），跳过该 provider 的所有 task`);
      continue;
    }
    valid.push(p);
  }
  return valid;
};

// ============================================================================
// main
// ============================================================================

const main = async () => {
  const opts = parseArgs();
  if (opts.help) { printHelp(); process.exit(0); }

  // 1. 解析文件清单
  let files;
  if (!opts.files || opts.files === 'default') {
    files = DEFAULT_FIXTURES;
  } else {
    files = opts.files.split(',').map((s) => path.resolve(process.cwd(), s.trim())).filter(Boolean);
  }

  // 2. 校验文件存在
  const validFiles = [];
  for (const f of files) {
    if (await fileExists(f)) {
      validFiles.push(f);
    } else {
      console.warn(`[warn] 文件不存在，跳过: ${f}`);
    }
  }
  if (validFiles.length === 0) {
    console.error('[error] 没有可用文件，退出');
    process.exit(1);
  }

  // 3. 校验 provider 凭证
  const validProviders = validateProviderCreds(opts.providers);
  if (validProviders.length === 0) {
    console.error('[error] 没有可用 provider，退出');
    process.exit(1);
  }

  // 4. 校验 pdftoppm
  const pdftoppmPath = await which('pdftoppm');
  const pdftoppmAvailable = !!pdftoppmPath;
  if (!pdftoppmAvailable) {
    console.warn('[warn] pdftoppm 未安装（brew install poppler），扫描件 PDF 的 vision 路径将跳过');
  }

  // 5. 决定每个文件的 mode
  console.log('\n=== 文件 mode 规划 ===');
  const fileModes = [];
  for (const f of validFiles) {
    const planned = await planTaskMode(f);
    fileModes.push({ file: f, ...planned });
    console.log(`  ${planned.mode.padEnd(14)} ${path.basename(f)}`);
  }

  // 6. 展开 (file × provider × repeat) tasks
  const tasks = [];
  for (const fm of fileModes) {
    for (const provider of validProviders) {
      for (let r = 0; r < opts.repeat; r++) {
        tasks.push({
          file: fm.file,
          provider,
          mode: fm.mode,
          preExtracted: fm.preExtracted || null,
          repeatIndex: r
        });
      }
    }
  }

  // 7. 估算成本 + 5s 等待
  const upperBound = estimateTotalCostUpperBound(tasks);
  console.log(`\n=== 估算上限成本 ===\n  ${tasks.length} tasks (${validFiles.length} files × ${validProviders.length} providers × ${opts.repeat} repeats)`);
  console.log(`  Upper bound: ¥${upperBound.toFixed(4)} (按 vision_pdf 6k prompt + 2.5k output 上限算)`);
  console.log(`  Out dir: ${opts.out}`);

  if (opts.dryRun) {
    console.log('\n[dry-run] 不实跑。打印每个 task 的计划：');
    for (const t of tasks.slice(0, 50)) {
      console.log(`  ${t.provider.padEnd(8)} ${t.mode.padEnd(14)} ${path.basename(t.file)} (repeat ${t.repeatIndex + 1})`);
    }
    if (tasks.length > 50) console.log(`  ... 共 ${tasks.length} tasks`);
    return;
  }

  console.log('\n  5 秒后开始（Ctrl+C 中止）...');
  await sleep(5000);

  // 8. 准备输出目录
  await fsp.mkdir(opts.out, { recursive: true });

  // 9. 准备 tmpRoot
  const tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'bench-vision-'));

  // 10. 跑！
  const startedAt = Date.now();
  const rows = await runWithConcurrency(tasks, opts, { pdftoppmAvailable, tmpRoot });
  const finishedAt = Date.now();

  // 11. 写 CSV
  const csvPath = path.join(opts.out, 'bench-results.csv');
  await writeCsv(rows, csvPath);
  console.log(`\nCSV: ${csvPath}`);

  // 12. 写 summary.json
  const summary = aggregateSummary(rows);
  const summaryPath = path.join(opts.out, 'bench-summary.json');
  await fsp.writeFile(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalTasks: tasks.length,
    durationMs: finishedAt - startedAt,
    rateTableVerifiedAt: '2026-05-01',
    providers: summary
  }, null, 2), 'utf-8');
  console.log(`Summary: ${summaryPath}`);

  // 13. ASCII 表
  printAsciiTable(summary);

  // 14. 清理 tmp
  await fsp.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});

  // 总成功率
  const okCount = rows.filter((r) => r.status === 'ok').length;
  console.log(`Total: ${okCount}/${rows.length} ok, duration ${(finishedAt - startedAt) / 1000}s`);
  process.exit(0);
};

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
