// Read-only claim checks, not a certificate of functionality or permission.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRoadmapLedger, readEngineeringQueue } from './session-status.mjs';

const SHA = /^[a-f0-9]{40}$/;
function text(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 1800; }
function evidence(value) { return Array.isArray(value) && value.length > 0 && value.every(text); }

export function assessCompletion(report, { target, index, baselineIndex, baselineEngineering, engineering, mergedAfterBase }) {
  if (!Number.isSafeInteger(target) || target < 1 || target > 1000) throw Error('Use the current owner bundle target (1–1000).');
  if (!report || !SHA.test(report.baseRevision) || !Array.isArray(report.bundles)) throw Error('Report needs exact session baseRevision and bundles.');
  const cards = new Set(index.cards.filter(card => !['ON_REQUEST', 'PLANNED'].includes(card.status)).map(card => card.id));
  const eligibleAtStart = new Set(baselineIndex.cards.filter(card => ['IN_PROGRESS', 'APPROVED', 'BLOCKED'].includes(card.status)).map(card => card.id));
  const alreadyComplete = new Set(baselineIndex.cards.filter(card => ['MERGED', 'COMPLETE'].includes(card.status)).map(card => card.id));
  for (const row of baselineEngineering) if (row.state === 'EXTERNAL_ONLY') alreadyComplete.add(row.id);
  const seen = new Set();
  for (const bundle of report.bundles) {
    if (!bundle || !text(bundle.outcome) || !evidence(bundle.proof) ||
        !Array.isArray(bundle.subsections) || !bundle.subsections.length ||
        !Array.isArray(bundle.merges) || !bundle.merges.length ||
        !Number.isSafeInteger(bundle.productionAdded) || bundle.productionAdded < 0 ||
        !Number.isSafeInteger(bundle.productionRemoved) || bundle.productionRemoved < 0 ||
        bundle.productionAdded + bundle.productionRemoved === 0)
      throw Error('Bundle needs a full outcome, subsection IDs, merged revisions, production counts and acceptance proof.');
    // Workload averages are not hard thresholds. Review whether the stated
    // scope is substantial; the checker must not encourage line-count padding.
    for (const id of bundle.subsections) {
      if (!cards.has(id) || !eligibleAtStart.has(id) || seen.has(id) || alreadyComplete.has(id))
        throw Error('Unknown, unapproved, repeated or previously completed subsection: ' + id);
      if (!engineering.some(row => row.id === id && row.state === 'EXTERNAL_ONLY'))
        throw Error('Unfinished engineering cannot count as a completed subsection: ' + id);
      seen.add(id);
    }
    const revisions = new Set();
    for (const sha of bundle.merges) {
      if (!SHA.test(sha) || revisions.has(sha) || !mergedAfterBase(sha, report.baseRevision))
        throw Error('Merge must be unique, on current main and new since the session base.');
      revisions.add(sha);
    }
  }
  const count = report.bundles.length;
  if (count >= target) return { status: 'TARGET_CLAIM_CHECKED', completed: count, target };
  const stop = report.stop;
  if (!stop || !evidence(stop.evidence) || !text(stop.nextAction))
    throw Error(`${count}/${target} bundles: continue eligible implementation; a clean merge or pending release is not a stop reason.`);
  if (stop.kind === 'EXTERNAL_EXHAUSTION') {
    const unresolved = engineering.filter(row => ['OPEN', 'REVIEW'].includes(row.state));
    if (unresolved.length) throw Error('External-only exhaustion refused; engineering/review remains: ' + unresolved.map(row => row.id).join(', '));
    const active = index.cards.filter(card => ['IN_PROGRESS', 'APPROVED', 'BLOCKED'].includes(card.status));
    if (!active.every(card => engineering.some(row => row.id === card.id && row.gate && evidence(stop.bySubsection?.[card.id]))))
      throw Error('Early stop requires attempted remedies and source/proof/gate evidence for EVERY remaining approved subsection.');
  } else if (stop.kind === 'EXECUTION_LIMIT') {
    if (!SHA.test(stop.checkpoint) || !text(stop.constraint) || !mergedAfterBase(stop.checkpoint, null))
      throw Error('Execution limit needs an actual constraint, recoverable current-main checkpoint and exact resume action.');
  } else throw Error('Unsupported early-stop reason; investigate, ask missing owner input promptly, and continue independent work.');
  return { status: 'INCOMPLETE_CHECKPOINT', completed: count, target, reason: stop.kind };
}

export function run(root, args) {
  if (args.length !== 4 || args[0] !== '--bundles' || !/^[1-9]\d*$/.test(args[1]) || args[2] !== '--report')
    throw Error('Usage: npm run session:finish -- --bundles OWNER_TARGET --report PATH');
  const report = JSON.parse(readFileSync(resolve(root, args[3]), 'utf8'));
  if (!report || !SHA.test(report.baseRevision)) throw Error('Report needs an exact session baseRevision.');
  const git = (...values) => execFileSync('git', values, { cwd: root, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const ancestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  const main = git('rev-parse', 'refs/remotes/origin/main^{commit}');
  if (!ancestor(report.baseRevision, main)) throw Error('Fetch refs; session base must be in actual current main history.');
  const path = 'docs/plan/TASKS.md';
  // Read main, never a local unmerged edit that claims engineering is complete.
  const current = git('show', `${main}:${path}`), baseline = git('show', `${report.baseRevision}:${path}`);
  const index = readRoadmapLedger(current), baselineIndex = readRoadmapLedger(baseline);
  const engineering = readEngineeringQueue(current, index);
  const baselineEngineering = baseline.includes('<!-- engineering-readiness:start -->') ? readEngineeringQueue(baseline, baselineIndex) : [];
  return assessCompletion(report, {
    target: Number(args[1]), index, baselineIndex, baselineEngineering, engineering,
    mergedAfterBase: (sha, base) => ancestor(sha, main) && (!base || !ancestor(sha, base))
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run(resolve(fileURLToPath(new URL('..', import.meta.url))), process.argv.slice(2));
    console.log(JSON.stringify(result));
    console.log('Claim validation only: independently review whole-subsection scope, CI, reviews and real acceptance. No permission or functionality is attested.');
    if (result.status === 'INCOMPLETE_CHECKPOINT') process.exitCode = 2;
  } catch (error) { console.error(`Session finish refused: ${error.message}`); process.exitCode = 1; }
}
