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
const totalLines = categories.reduce((s, c) => s + c.value, 0);

// The test count used to be hand-typed in ~6 places across index.html and README.md, and it drifted
// every single time the suite grew — caught at 183/203/226/335 all live on the same page at once
// (2026-07-25). Everything else on that page is derived; this was the last hand-maintained number.
// So: run the suite and read its own TAP summary. That's the only source that can't be wrong —
// grepping for `test(` would miss the loop-generated cases balance.test.mjs and spawner.test.mjs
// both use. Cost is ~0.5s on the pre-commit hook, which is cheaper than the drift was.
//
// This must NEVER block a commit. A failing suite still prints a well-formed summary, so a red run
// records its real numbers; only a suite that can't run at all (syntax error, no node) falls back
// to the previous stats.json values rather than writing nulls into the page.
function testStats() {
  let out;
  try {
    out = execFileSync('node', ['--test', 'tests/'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    out = err.stdout || ''; // non-zero exit just means red tests — the summary is still there
  }
  const num = key => {
    const m = out.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const count = num('tests');
  if (count === null) {
    console.warn('gen-stats: could not read a TAP summary from `node --test tests/` — reusing previous test counts');
    try {
      return JSON.parse(readFileSync(path.join(ROOT, 'stats.json'), 'utf8')).tests ?? null;
    } catch { return null; }
  }
  const files = lsTree('HEAD').filter(e => /^tests\/.*\.test\.mjs$/.test(e.file)).length;
  return { count, suites: num('suites'), pass: num('pass'), fail: num('fail'), files };
}
const tests = testStats();

// BUILD in `0.MINOR.BUILD` is the number of THIS commit, not the count of the ones before it.
// The +1 is the whole point: this script runs from the pre-commit hook, so the commit being made
// doesn't exist yet and `growth.length` is one short. Without it the version in a commit message
// is permanently off by one against `git rev-list --count` — 0.1.70 was really commit 71. See
// changelog.md's version-scheme header, which documents this as the convention.
const build = growth.length + 1;

const stats = {
  generatedAt: new Date().toISOString().slice(0, 10),
  build,
  growth,
  categories,
  tests,
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
const inlineStats = {
  build: stats.build,
  growth: stats.growth,
  categories: stats.categories,
  tests: stats.tests,
  velocity: stats.velocity,
};
const replacement = `${START}\nconst STATS = ${JSON.stringify(inlineStats, null, 2)};\n${END}`;
const updatedDoc = doc.slice(0, startIdx) + replacement + doc.slice(endIdx + END.length);
writeFileSync(docPath, updatedDoc);

// README.md carried its own hand-typed copies of the same numbers and went stale harder than
// index.html ever did (it was still claiming 203 tests / 55 commits / 12,000+ lines at 335/71/20k).
// index.html can read the inlined STATS const at render time; a markdown file has no render step,
// so the values get substituted in place here instead, between HTML comment markers GitHub hides.
// Add a new one by wrapping any number in <!--S:key-->…<!--/S:key--> and adding the key below.
const engineLines = totals['Engine (JS)'];
const testLines = totals['Tests'];
const MARKER_VALUES = {
  tests: tests ? tests.count : null,
  pass: tests ? tests.pass : null,
  testFiles: tests ? tests.files : null,
  testFails: tests ? tests.fail : null,
  commits: growth.length,
  build,
  engineLines: engineLines.toLocaleString('en-US'),
  testLines: testLines.toLocaleString('en-US'),
  totalLines: totalLines.toLocaleString('en-US'),
  density: `${Math.round((testLines / engineLines) * 100)}%`,
  activeHours,
  sessionCount,
  activeDays,
};
const readmePath = path.join(ROOT, 'README.md');
let readme = readFileSync(readmePath, 'utf8');
const unknown = new Set();
readme = readme.replace(/<!--S:(\w+)-->[\s\S]*?<!--\/S:\1-->/g, (whole, key) => {
  if (!(key in MARKER_VALUES)) { unknown.add(key); return whole; }
  const value = MARKER_VALUES[key];
  return value === null ? whole : `<!--S:${key}-->${value}<!--/S:${key}-->`;
});
if (unknown.size) console.warn(`gen-stats: README.md has unknown stat markers: ${[...unknown].join(', ')}`);
writeFileSync(readmePath, readme);

const testNote = tests ? `${tests.count} tests` : 'tests unknown';
console.log(`gen-stats: wrote stats.json + refreshed index.html/README.md (build ${build}, ${growth.length} commits, ${totalLines} lines, ${testNote}, ~${activeHours}h across ${sessionCount} sessions/${activeDays} days)`);
