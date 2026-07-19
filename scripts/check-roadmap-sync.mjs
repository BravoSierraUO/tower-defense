#!/usr/bin/env node
// Cross-checks "Phase N" mentions between changelog.md (prose, hand-written, the real
// record of what shipped) and whatever.html's ROADMAP array (structured status/items/notes
// per phase). changelog.md isn't structured data, so this can't safely regenerate Roadmap
// text automatically — it flags drift for a human to reconcile instead. Advisory only: runs
// from the pre-commit hook (scripts/hooks/pre-commit) but never fails the commit.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const changelog = readFileSync(path.join(ROOT, 'changelog.md'), 'utf8');
const doc = readFileSync(path.join(ROOT, 'whatever.html'), 'utf8');

const roadmapNums = new Set([...doc.matchAll(/num:\s*'([0-9]+[a-z]?)'/g)].map(m => m[1]));
const changelogNums = new Set([...changelog.matchAll(/\bPhase\s+([0-9]+[a-z]?)\b/g)].map(m => m[1]));

const missingFromRoadmap = [...changelogNums].filter(n => !roadmapNums.has(n)).sort();
const missingFromChangelog = [...roadmapNums].filter(n => !changelogNums.has(n)).sort();

if (missingFromRoadmap.length === 0 && missingFromChangelog.length === 0) {
  console.log('check-roadmap-sync: changelog.md and whatever.html ROADMAP phase numbers match.');
  process.exit(0);
}

if (missingFromRoadmap.length) {
  console.warn(`check-roadmap-sync: changelog.md mentions Phase(s) ${missingFromRoadmap.join(', ')} with no matching card in whatever.html's ROADMAP.`);
}
if (missingFromChangelog.length) {
  console.warn(`check-roadmap-sync: whatever.html's ROADMAP has Phase(s) ${missingFromChangelog.join(', ')} never mentioned in changelog.md.`);
}
console.warn('check-roadmap-sync: advisory only, not blocking this commit — reconcile by hand.');
