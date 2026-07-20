#!/usr/bin/env node
// Regenerates stats.json (canonical, git-log-derived velocity data) and re-inlines the same
// object into index.html's STATS block, between the STATS_GENERATED_START/END markers.
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
  if (file.startsWith('css/') || file === 'game.html') return 'Game shell (HTML/CSS)';
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

// "Hours" used to be a hand-typed string in whatever.html's Velocity section — it drifted
// stale for days while commits/lines kept auto-updating underneath it (caught 2026-07-19,
// sitting at "~58h" long after real elapsed time had passed it). Same fix already applied
// to commit count in v2.2 (auto-derive instead of hand-type): compute it here from real
// commit timestamps instead.
//
// A raw first-commit-to-last-commit span isn't "hours worked" — it swallows every overnight
// gap between sessions. So this clusters commits into sessions first: consecutive commits
// within SESSION_GAP_HOURS of each other count as the same session (still working); a wider
// gap means time off, not counted. Each session's duration is its own first-to-last-commit
// span, floored at SESSION_FLOOR_HOURS so a session that's just one or two rapid-fire commits
// doesn't count as ~0 hours. This isn't a precise time-tracker reading — no such thing exists
// for an agent-paired workflow with dense commit bursts — it's a best-effort, disclosed
// estimate (see the Velocity section's own methodology note, right where this number renders).
const SESSION_GAP_HOURS = 5;
const SESSION_FLOOR_HOURS = 0.25;
const epochs = git('log', '--reverse', '--format=%at').trim().split('\n').filter(Boolean).map(Number);
const sessions = [];
let current = [epochs[0]];
for (const t of epochs.slice(1)) {
  if (t - current[current.length - 1] <= SESSION_GAP_HOURS * 3600) current.push(t);
  else { sessions.push(current); current = [t]; }
}
sessions.push(current);
const activeHours = Math.round(
  sessions.reduce((sum, s) => sum + Math.max(s[s.length - 1] - s[0], SESSION_FLOOR_HOURS * 3600), 0) / 3600 * 10
) / 10;
const sessionCount = sessions.length;
const activeDays = new Set(growth.map(g => g.date)).size;

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
  velocity: { activeHours, sessionCount, activeDays, sessionGapHours: SESSION_GAP_HOURS },
};

writeFileSync(path.join(ROOT, 'stats.json'), JSON.stringify(stats, null, 2) + '\n');

const docPath = path.join(ROOT, 'index.html');
const doc = readFileSync(docPath, 'utf8');
const START = '// STATS_GENERATED_START';
const END = '// STATS_GENERATED_END';
const startIdx = doc.indexOf(START);
const endIdx = doc.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error('gen-stats: STATS_GENERATED_START/END markers not found in index.html');
  process.exit(1);
}
const inlineStats = { growth: stats.growth, categories: stats.categories, velocity: stats.velocity };
const replacement = `${START}\nconst STATS = ${JSON.stringify(inlineStats, null, 2)};\n${END}`;
const updatedDoc = doc.slice(0, startIdx) + replacement + doc.slice(endIdx + END.length);
writeFileSync(docPath, updatedDoc);

console.log(`gen-stats: wrote stats.json + refreshed index.html (${growth.length} commits, ${categories.reduce((s, c) => s + c.value, 0)} lines, ~${activeHours}h across ${sessionCount} sessions/${activeDays} days)`);
