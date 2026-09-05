#!/usr/bin/env node
// Checks index.html's FLOWS array against the repo it claims to document.
//
// The WhatHow page's whole claim is that every step points at real code. Nothing has
// ever enforced that, so a rename or a deleted file leaves a node pointing at a path
// that stopped existing — and a doc that is wrong in a way nobody can see is worse
// than no doc, because it is still believed. This makes that failure detectable.
//
// Two classes of finding, and the difference matters:
//
//   ERRORS   — a referenced FILE does not exist, or the flow graph is malformed
//              (dangling edge, duplicate id, node outside its lane range). Both are
//              provable from the repo alone. These exit 1.
//   WARNINGS — a code-shaped SYMBOL in a code_ref's parenthetical was not found in
//              the file. `code_ref` is prose, not a machine reference, so this is a
//              heuristic and is advisory by default. --strict makes it exit 1.
//
// Blocking policy follows check-roadmap-sync.mjs: advisory from the pre-commit hook,
// enforcing in CI. Local commits stay fast, the branch gate stays honest.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRICT = process.argv.includes('--strict');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

/* --- pulling FLOWS out of a 2,800-line HTML file --------------------------
   FLOWS lives in an inline <script> alongside DOM code that throws outside a
   browser, so the file cannot simply be imported. Instead: bracket-match the
   array literal (respecting strings, escapes and comments so a `]` inside a
   detail string doesn't end it early) and evaluate that slice alone in a bare
   VM context. It is pure data with no identifiers, so it needs no globals.

   Known limit: a regex literal containing an unbalanced bracket would confuse
   the matcher. FLOWS has never contained one; if it ever does, this throws
   loudly rather than silently truncating. */
function extractArrayLiteral(src, name) {
  const m = new RegExp(`const\\s+${name}\\s*=\\s*\\[`).exec(src);
  if (!m) throw new Error(`could not find \`const ${name} = [\` in index.html`);
  const start = m.index + m[0].length - 1;
  let depth = 0, quote = null, esc = false, lineComment = false, blockComment = false;

  for (let i = start; i < src.length; i++) {
    const c = src[i], next = src[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
      if (depth < 0) throw new Error(`unbalanced bracket while reading ${name}`);
    }
  }
  throw new Error(`unterminated ${name} array`);
}

/* --- what files actually exist ------------------------------------------- */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.github', 'shots', 'build']);
const filesByPath = new Set();
const filesByBase = new Map(); // basename -> [repo-relative paths]

(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) { walk(abs); continue; }
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    filesByPath.add(rel);
    if (!filesByBase.has(entry)) filesByBase.set(entry, []);
    filesByBase.get(entry).push(rel);
  }
})(ROOT);

const sourceCache = new Map();
const sourceOf = (rel) => {
  if (!sourceCache.has(rel)) sourceCache.set(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
  return sourceCache.get(rel);
};

/* --- parsing a code_ref ---------------------------------------------------
   These are written for a human eye, not for a parser, and the real corpus
   includes all of:
       'js/missions.js (MissionTracker#update)'
       'js/ui/bottomBar.js, js/ui/radialMenu.js'
       'game.js (handleInput) + js/ui/radialMenu.js'
       'world.js (buildRoom) · room.js'
       "js/renderer.js (drawFieldGhost, drawCore's hover-cell outline)"
   So: split on , · ; + but only at paren depth 0, because a comma inside the
   parenthetical separates hints, not files. Each segment is a path with an
   optional parenthetical after it. Keeping the format prose-shaped is the
   right call — it is read far more often than it is parsed — so the parser
   bends to the prose rather than the other way round. */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    // ' / ' with spaces separates two files ("tower.js / scavenger.js"); a bare
    // slash is a path separator and has to survive.
    if (depth === 0 && c === '/' && s[i - 1] === ' ' && s[i + 1] === ' ') { parts.push(buf); buf = ''; continue; }
    if (depth === 0 && (c === ',' || c === '·' || c === ';' || c === '+')) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const FILE_EXT = /\.(js|mjs|css|html|json|md)$/;

// A ref may name a set rather than a single file — 'tests/*.test.mjs' is a fair
// way to point at a suite. Satisfied if it matches anything at all.
function resolveGlob(candidate, where) {
  const rx = new RegExp('^' + candidate.split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
  if ([...filesByPath].some((f) => rx.test(f))) return null; // matched; no single file to scan
  err(`${where}: pattern '${candidate}' matches no file in the repo.`);
  return null;
}

function resolveFile(candidate, where) {
  if (filesByPath.has(candidate)) return candidate;
  if (candidate.includes('*')) return resolveGlob(candidate, where);
  const base = candidate.split('/').pop();
  const hits = filesByBase.get(base) || [];
  if (hits.length === 1) {
    // Bare `game.js` for `js/game.js` reads fine and is not worth failing over,
    // but it is worth surfacing once so refs can be tightened when convenient.
    if (VERBOSE && candidate !== hits[0]) warn(`${where}: '${candidate}' resolved by basename to ${hits[0]}`);
    return hits[0];
  }
  if (hits.length > 1) {
    err(`${where}: '${candidate}' is ambiguous — matches ${hits.join(', ')}. Qualify the path.`);
    return null;
  }
  err(`${where}: references '${candidate}', which does not exist in the repo.`);
  return null;
}

/* A hint token is only checked when it is code-shaped: it contains a dot, a hash,
   or an interior capital. `drawFieldGhost`, `MissionTracker#update` and
   `missions.update` qualify. The prose that shares those parentheses —
   "hover-cell outline", "handler", "update" — does not, and is skipped rather
   than reported. Under-reporting is deliberate: a symbol check that cries wolf on
   English gets switched off within a week, and then the file check goes with it. */
const CODE_SHAPED = /^[A-Za-z_$][\w$]*(?:[.#][A-Za-z_$][\w$]*)*$/;
const isCodeShaped = (t) => CODE_SHAPED.test(t) && (/[.#]/.test(t) || /[a-z].*[A-Z]/.test(t));

function checkHints(hint, file, where) {
  const tokens = hint
    .split(/[,·;+→>/\s]+/)
    .map((t) => t.replace(/^[('"`]+|[)'"`.]+$/g, ''))
    .filter(isCodeShaped);
  const src = sourceOf(file);
  for (const token of tokens) {
    const leaf = token.split(/[.#]/).pop();
    if (!new RegExp(`\\b${leaf.replace(/[$]/g, '\\$&')}\\b`).test(src)) {
      warn(`${where}: '${token}' not found in ${file}.`);
    }
  }
}

/* --- the graph itself -----------------------------------------------------
   A dangling edge is the quiet failure mode of a data-driven renderer: it draws
   nothing and the diagram just looks finished. Same for a node sitting in a
   column past the last lane — it renders, unlabelled, and reads as intentional. */
function checkFlow(flow, seenFlowIds) {
  const fid = flow.id || '(no id)';
  const where0 = `FLOWS[${fid}]`;
  if (seenFlowIds.has(fid)) err(`${where0}: duplicate flow id.`);
  seenFlowIds.add(fid);

  const ids = new Set();
  const lanes = Array.isArray(flow.lanes) ? flow.lanes.length : 0;
  const linked = new Set();

  for (const node of flow.nodes || []) {
    const where = `${where0}.${node.id}`;
    if (ids.has(node.id)) err(`${where}: duplicate node id within this flow.`);
    ids.add(node.id);
    // Advisory, not an error. The renderer places nodes absolutely and sizes the
    // canvas from lanes.length (index.html: `const W=PAD*2+f.lanes.length*COL_W...`),
    // so a node past the last lane still draws — it just has no lane label above it
    // and sits outside the computed width. What is provable from here is the missing
    // label; whether that clips or merely overflows is the browser's business, so it
    // does not block.
    if (lanes && typeof node.col === 'number' && (node.col < 0 || node.col >= lanes)) {
      warn(`${where}: col ${node.col} has no lane label — this flow declares ${lanes} lanes.`);
    }
    if (!node.code_ref) continue;

    for (const segment of splitTopLevel(node.code_ref)) {
      const m = /^([^(\s]+)\s*(?:\((.*)\))?$/s.exec(segment);
      // Extension is only a heuristic for "is this a filename at all". An
      // extensionless file that demonstrably exists (scripts/hooks/pre-commit) is a
      // perfectly good reference and must not be rejected on shape alone.
      if (!m || (!FILE_EXT.test(m[1]) && !filesByPath.has(m[1]) && !m[1].includes('*'))) {
        warn(`${where}: could not read a filename out of "${segment}".`);
        continue;
      }
      const file = resolveFile(m[1], where);
      if (file && m[2]) checkHints(m[2], file, where);
    }
  }

  for (const edge of flow.edges || []) {
    const where = `${where0}: edge ${edge.from}->${edge.to}`;
    if (!ids.has(edge.from)) err(`${where}: 'from' is not a node in this flow.`);
    if (!ids.has(edge.to)) err(`${where}: 'to' is not a node in this flow.`);
    linked.add(edge.from); linked.add(edge.to);
  }

  for (const node of flow.nodes || []) {
    if (!linked.has(node.id) && (flow.edges || []).length) {
      warn(`${where0}.${node.id}: drawn but connected to nothing.`);
    }
  }
}

/* --- run ------------------------------------------------------------------ */
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FLOWS = vm.runInNewContext(`(${extractArrayLiteral(html, 'FLOWS')})`);

const seen = new Set();
for (const flow of FLOWS) checkFlow(flow, seen);

const nodes = FLOWS.reduce((n, f) => n + (f.nodes || []).length, 0);
const refs = FLOWS.reduce((n, f) => n + (f.nodes || []).filter((x) => x.code_ref).length, 0);

for (const w of warnings) console.warn(`check-flow-refs: ${w}`);
for (const e of errors) console.error(`check-flow-refs: ERROR ${e}`);

console.log(
  `check-flow-refs: ${FLOWS.length} flows, ${nodes} nodes, ${refs} with a code_ref — ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`
);

if (errors.length) process.exit(1);
if (STRICT && warnings.length) {
  console.error('check-flow-refs: --strict, so warnings are failures.');
  process.exit(1);
}
