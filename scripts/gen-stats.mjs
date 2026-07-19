#!/usr/bin/env node
// Regenerates stats.json (canonical, git-log-derived velocity data) and re-inlines the same
// object into whatever.html's STATS block, between the STATS_GENERATED_START/END markers.
// Run manually via `npm run stats`, or automatically from the pre-commit hook
// (scripts/hooks/pre-commit, installed via `npm run hooks:install`).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function lsTree(ref) {
  return git('ls-tree', '-r', ref).trim().split('\n').filter(Boolean).map(line => {
    const [meta, file] = line.split('\t');
    const [, , sha] = meta.split(' ');
    return { file, sha };
  });
}

const blobLineCache = new Map();
function blobLines(sha) {
  if (blobLineCache.has(sha)) return blobLineCache.get(sha);
  const content = git('cat-file', 'blob', sha);
  const n = (content.match(/\n/g) || []).length;
  blobLineCache.set(sha, n);
  return n;
}

function categoryFor(file) {
  if (file.startsWith('tests/')) return 'Tests';
  if (file.startsWith('js/')) return 'Engine (JS)';
  if (file.startsWith('css/') || file === 'index.html') return 'Game shell (HTML/CSS)';
  return 'Docs & tooling';
}

const log = git('log', '--reverse', '--format=%H%x09%h%x09%ad%x09%s', '--date=format:%m-%d')
  .trim().split('\n').filter(Boolean);

const growth = log.map(line => {
  const [hash, short, date, ...subjectParts] = line.split('\t');
  const subject = subjectParts.join('\t');
  const cum = lsTree(hash).reduce((sum, e) => sum + blobLines(e.sha), 0);
  return { hash: short, date, cum, subject };
});

const CATEGORY_ORDER = [
  ['Engine (JS)', 'sig'],
  ['Docs & tooling', 'special'],
  ['Game shell (HTML/CSS)', 'info'],
  ['Tests', 'ok'],
];
const totals = Object.fromEntries(CATEGORY_ORDER.map(([label]) => [label, 0]));
for (const { file, sha } of lsTree('HEAD')) {
  totals[categoryFor(file)] += blobLines(sha);
}
const categories = CATEGORY_ORDER.map(([label, tone]) => ({ label, value: totals[label], tone }));

const stats = {
  generatedAt: new Date().toISOString().slice(0, 10),
  growth,
  categories,
};

writeFileSync(path.join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');

const docPath = path.join(ROOT, 'whatever.html');
const doc = readFileSync(docPath, 'utf8');
const START = '// STATS_GENERATED_START';
const END = '// STATS_GENERATED_END';
const startIdx = doc.indexOf(START);
const endIdx = doc.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error('gen-stats: STATS_GENERATED_START/END markers not found in whatever.html');
  process.exit(1);
}
const inlineStats = { growth: stats.growth, categories: stats.categories };
const replacement = `${START}\nconst STATS = ${JSON.stringify(inlineStats, null, 2)};\n${END}`;
const updatedDoc = doc.slice(0, startIdx) + replacement + doc.slice(endIdx + END.length);
writeFileSync(docPath, updatedDoc);

console.log(`gen-stats: wrote stats.json + refreshed whatever.html (${growth.length} commits, ${categories.reduce((s, c) => s + c.value, 0)} lines)`);
