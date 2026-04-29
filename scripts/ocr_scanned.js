#!/usr/bin/env node
/**
 * ocr_scanned.js — OCR scanned patient PDFs using pdftoppm + tesseract
 * Writes text into scripts/output/raw_texts/<name>.txt
 * Uses ASCII workdir names to avoid tesseract's known issues with non-ASCII paths.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DATA_DIR = '/Users/lijinming/Documents/Commerce/AItrial/data/dataset_patient';
const OUT_DIR = path.join(__dirname, 'output', 'raw_texts');
const WORK_DIR = path.join(__dirname, 'output', 'ocr_work');
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

const SCANNED = [
  'CHQI胰腺癌辽宁沈阳',
  'HAQI胃癌一线进展',
  'HZZH胰腺癌无锡',
  'LHBI胰腺癌上海',
  'LUFE胶质母36沧州',
  'LWPI胃癌山东',
  'MSHU尿路上皮癌',
  'TARU胶质母长春',
  'WHFU胃癌合肥',
  'YHBI肝癌保定',
  'YUYI胰腺癌',
  'ZCHO 胰腺癌 北京',
  '姓名：CHRO胆管癌 四川'
];

const PAGES = 3;
const DPI = 180;

let i = 0;
for (const name of SCANNED) {
  i += 1;
  const pdf = path.join(DATA_DIR, `${name}.pdf`);
  if (!fs.existsSync(pdf)) { console.log(`MISSING: ${pdf}`); continue; }
  const stub = path.join(WORK_DIR, `p${i}`);
  // Clean previous
  for (const f of fs.readdirSync(WORK_DIR)) {
    if (f.startsWith(`p${i}-`)) fs.unlinkSync(path.join(WORK_DIR, f));
  }
  // pdftoppm
  try {
    execFileSync('pdftoppm', ['-r', String(DPI), '-f', '1', '-l', String(PAGES), pdf, stub, '-png'], { stdio: 'inherit' });
  } catch (e) {
    console.log(`pdftoppm failed for ${name}: ${e.message}`);
    continue;
  }
  const imgs = fs.readdirSync(WORK_DIR).filter(f => f.startsWith(`p${i}-`) && f.endsWith('.png')).sort();
  let text = '';
  for (const img of imgs) {
    const imgPath = path.join(WORK_DIR, img);
    const res = spawnSync('tesseract', [imgPath, '-', '-l', 'chi_sim+eng'], { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 });
    if (res.status !== 0) {
      console.log(`tesseract failed ${img}: ${res.stderr?.toString().slice(0, 200)}`);
      continue;
    }
    text += res.stdout.toString('utf8');
    text += '\n----PAGE-BREAK----\n';
  }
  // Write via ASCII-safe id in a mapping file, and via node fs to Chinese name
  const outPath = path.join(OUT_DIR, `${name}.txt`);
  fs.writeFileSync(outPath, text);
  console.log(`OCR[${i}] ${name} → ${text.length} chars, ${imgs.length} pages`);
}
console.log('ALL_DONE');
