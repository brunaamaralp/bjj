import fs from 'fs';
import path from 'path';

const SYMBOLS = [
  'LEAD_STATUS',
  'LEAD_ORIGIN',
  'STUDENT_STATUS',
  'STUDENTS_COL',
  'LEADS_COL',
  'PIPELINE_WAITING_DECISION_STAGE',
  'PIPELINE_STAGES',
  'useStudentStore',
  'performEnrollment',
  'moveLeadToStudent',
  'mapAppwriteDocToStudent',
  'filterStudentsByStatus',
  'buildPlanSelectOptions',
  'APPWRITE_PROJECT',
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

function hasImport(src, sym) {
  if (new RegExp(`import\\s+[\\s\\S]*?\\b${sym}\\b[\\s\\S]*?from`).test(src)) return true;
  if (new RegExp(`import\\s*\\{[^}]*\\b${sym}\\b`).test(src)) return true;
  if (new RegExp(`import\\s+\\b${sym}\\b`).test(src)) return true;
  return false;
}

function isDefined(src, sym) {
  if (new RegExp(`export\\s+(const|function|class|async function)\\s+${sym}\\b`).test(src)) return true;
  if (new RegExp(`export\\s*\\{[^}]*\\b${sym}\\b`).test(src)) return true;
  return false;
}

function isDynamicImport(src, sym) {
  return new RegExp(`import\\([^)]*${sym}`).test(src);
}

const issues = [];
for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');
  for (const sym of SYMBOLS) {
    const useRe = new RegExp(`\\b${sym}\\b`);
    if (!useRe.test(src) || isDefined(src, sym)) continue;
    if (hasImport(src, sym) || isDynamicImport(src, sym)) continue;

    const lines = src.split('\n');
    const bad = lines.filter((line) => {
      if (!useRe.test(line)) return false;
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/**')) return false;
      return true;
    });
    if (bad.length === 0) continue;
    issues.push({ file: file.replace(/\\/g, '/'), sym, line: bad[0].trim().slice(0, 100) });
  }
}

if (issues.length === 0) {
  console.log('OK: no missing imports for tracked symbols');
} else {
  console.log(`Found ${issues.length} potential missing import(s):\n`);
  for (const i of issues) {
    console.log(`  ${i.file}`);
    console.log(`    ${i.sym} — ${i.line}\n`);
  }
  process.exit(1);
}
