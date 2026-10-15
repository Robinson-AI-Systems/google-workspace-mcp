import test from 'node:test';
import assert from 'node:assert/strict';
import { readQueue, planQueue, summarizeRoadmap, readRoadmapLedger, readEngineeringQueue, run } from './session-status.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
const row = (id = 'READ', revision = a) => ({ id, priority: 1, requiredRevision: revision, task: 'Read custom service', procedure: 'docs/ACCEPTANCE.md', gates: 'Existing scoped owner grant', lastEvidence: 'Not run', dependsOn: [], status: 'PENDING' });
const fixtureLedger = '## Status ledger\n| Card | Status | PR | Notes |\n| P0-1 | MERGED | | built |\n| P0-2 | IN_PROGRESS | | pending |\n| P1-1 | TODO | | pending |\n';
const engineeringBlock = '<!-- engineering-readiness:start -->\n```json\n' + JSON.stringify(['P0-2','P1-1'].map(id => ({id,state:'REVIEW',remaining:'Review original acceptance',evidence:'fixture source and tests',next:'Trace caller and tests'}))) + '\n```\n<!-- engineering-readiness:end -->\n';
const block = rows => fixtureLedger + engineeringBlock + '<!-- release-acceptance:start -->\n```json\n' + JSON.stringify(rows) + '\n```\n<!-- release-acceptance:end -->';
const obs = { main: c, live: b, deployed: b, deploymentState: 'READY' };
const fixtureRoadmap = {
  order: ['K', 'H', 'S'],
  cards: [
    { id: 'K-1', batch: 'K', units: ['K-1', 'K-1-extra'], status: 'MERGED' },
    { id: 'H-1', batch: 'H', units: ['H-1'], status: 'IN_PROGRESS' },
    { id: 'H-2', batch: 'H', units: ['H-2'], status: 'APPROVED' },
    { id: 'H-3', batch: 'H', units: ['H-3'], status: 'BLOCKED' },
    { id: 'S-future', batch: 'S', units: ['S-future'], status: 'ON_REQUEST' }
  ]
};
const ancestor = (x, y) => [a, b, c].indexOf(x) <= [a, b, c].indexOf(y);

test('partial release clears older work without main/live equality', () => {
  const plan = planQueue([row('OLD', a), row('NEW', c)], obs, ancestor);
  assert.equal(plan.find(x => x.id === 'OLD').disposition, 'DEPLOYED_CANDIDATE_CHECK_GATES');
  assert.equal(plan.find(x => x.id === 'NEW').disposition, 'WAIT_RELEASE_OR_FETCH_HISTORY');
});
test('equal branches without READY production do not clear work', () => {
  for (const change of [{ deployed: null }, { deploymentState: 'BUILDING' }, { live: null }]) {
    assert.equal(planQueue([row()], { ...obs, main: b, ...change }, ancestor)[0].disposition, 'VERIFY_DEPLOYMENT');
  }
});
test('divergent refs, unknown history and production ahead of live fail closed', () => {
  assert.equal(planQueue([row()], obs, () => false)[0].disposition, 'VERIFY_DEPLOYMENT');
  assert.equal(planQueue([row()], { ...obs, deployed: c }, ancestor)[0].disposition, 'VERIFY_DEPLOYMENT');
  assert.equal(planQueue([row()], obs, (x, y) => x === y ? true : null)[0].disposition, 'VERIFY_DEPLOYMENT');
});
test('passed dependencies require their deployed code; rollback reopens proof', () => {
  const first = { ...row('FIRST', c), status: 'PASSED' };
  const second = { ...row('SECOND', a), dependsOn: ['FIRST'] };
  const plan = planQueue([first, second], obs, ancestor);
  assert.equal(plan[0].disposition, 'RECHECK_AFTER_ROLLBACK');
  assert.equal(plan[1].disposition, 'WAIT_ACCEPTANCE_DEPENDENCY');
  first.requiredRevision = a;
  assert.equal(planQueue([first, second], obs, ancestor)[1].disposition, 'DEPLOYED_CANDIDATE_CHECK_GATES');
});
test('external gates are reconsidered; priority is stable and source rows are untouched', () => {
  const rows = [{ ...row('LATER'), priority: 2 }, { ...row('BLOCKED'), status: 'BLOCKED' }];
  const before = JSON.stringify(rows);
  assert.equal(planQueue(rows, obs, ancestor)[0].disposition, 'RECHECK_EXTERNAL_GATE');
  assert.equal(JSON.stringify(rows), before);
});
test('invalid, duplicate, missing, unknown and cyclic queue entries are refused', () => {
  for (const text of ['none', block([]) + block([]), block([row(), row()]), block([{ ...row(), requiredRevision: 'main' }]), block([{ ...row(), dependsOn: ['MISSING'] }]), block([{ ...row(), dependsOn: ['READ'] }]), block([{ ...row(), procedure: '' }])]) assert.throws(() => readQueue(text));
  assert.deepEqual(readQueue(block([])), []);
});
test('PR count is informational and cannot dictate a session boundary', () => {
  assert.doesNotMatch(run.toString(), /Next session boundary/);
});
test('real git refs and ancestry drive the offline CLI without network/mutations', () => {
  const root = mkdtempSync(join(tmpdir(), 'session-status-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    mkdirSync(join(root, 'docs')); writeFileSync(join(root, 'file'), 'first'); git('add', '.'); git('commit', '-m', 'first'); const first = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'file'), 'second'); git('add', '.'); git('commit', '-m', 'second'); const second = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', second); git('update-ref', 'refs/remotes/origin/live', first);
    writeFileSync(join(root, 'docs/session-policy.json'), JSON.stringify({ repository: 'fixture/repo', ledger: 'docs/STATUS.md', instructions: 'AGENTS.md' }));
    writeFileSync(join(root, 'docs/STATUS.md'), block([row('FIRST', first), row('SECOND', second)]));
    const before = git('status', '--porcelain');
    const output = run(root, ['--deployed', first, '--state', 'READY', '--latest-pr', '104']);
    assert.match(output, /PR work unit = one whole predefined batch subsection/);
    assert.match(output, /Partial subsection = zero completed batch subsections/);
    assert.match(output, /remaining approved/);
    assert.match(output, /PR planning averages: 400–800 changed production lines and 2–5/);
    assert.match(output, /FIRST DEPLOYED_CANDIDATE_CHECK_GATES/); assert.match(output, /SECOND WAIT_RELEASE_OR_FETCH_HISTORY/); assert.match(output, /Latest observed PR: #104 \(informational only/); assert.doesNotMatch(output, /Next session boundary/);
    assert.equal(git('status', '--porcelain'), before);
    assert.match(run(root, []), /VERIFY_DEPLOYMENT/);
    assert.throws(() => run(root, ['--deployed', first])); assert.throws(() => run(root, ['--deployed', first, '--state', 'FAKE'])); assert.throws(() => run(root, ['--latest-pr', '1.5']));
    writeFileSync(join(root, 'docs/STATUS.md'), block(Array.from({ length: 12 }, (_, i) => row(`TASK-${i}`, first))));
    assert.match(run(root, []), /2 additional tasks/);
    assert.doesNotMatch(run(root, ['--limit', '12']), /additional tasks/);
    assert.throws(() => run(root, ['--limit', '0']));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('roadmap progress counts coarse indexed units without promoting in-progress or blocked work', () => {
  const before = JSON.stringify(fixtureRoadmap);
  const summary = summarizeRoadmap(fixtureRoadmap);
  assert.deepEqual({
    total: summary.total, merged: summary.merged,
    inProgress: summary.inProgress, approved: summary.approved,
    blocked: summary.blocked, onRequest: summary.onRequest,
    remainingApproved: summary.remainingApproved,
    unfinishedWithBlocked: summary.unfinishedWithBlocked
  }, {
    total: 6, merged: 2, inProgress: 1, approved: 1,
    blocked: 1, onRequest: 1, remainingApproved: 2,
    unfinishedWithBlocked: 3
  });
  assert.deepEqual(summary.batches[1].remaining, ['H-1', 'H-2']);
  assert.deepEqual(summary.batches[1].blocked, ['H-3']);
  assert.deepEqual(summary.batches[2].onRequest, ['S-future']);
  assert.equal(JSON.stringify(fixtureRoadmap), before);
});

test('roadmap summary refuses missing, duplicate or unknown units/status/batches', () => {
  for (const broken of [
    { ...fixtureRoadmap, cards: [] , order: ['K', 'K'] },
    { ...fixtureRoadmap, cards: [
      ...fixtureRoadmap.cards, { ...fixtureRoadmap.cards[0], id: 'duplicate' }] },
    { ...fixtureRoadmap, cards: [
      ...fixtureRoadmap.cards.slice(0, 1),
      { ...fixtureRoadmap.cards[1], status: 'PENDING_BUT_UNTRACKED' },
      ...fixtureRoadmap.cards.slice(2)] },
    { ...fixtureRoadmap, cards: [
      { ...fixtureRoadmap.cards[0], units: [] }, ...fixtureRoadmap.cards.slice(1)] },
    { ...fixtureRoadmap, cards: [
      { ...fixtureRoadmap.cards[0], batch: 'UNLISTED' },
      ...fixtureRoadmap.cards.slice(1)] }
  ]) assert.throws(() => summarizeRoadmap(broken));
});

test('roadmap totals count the actual local index and never infer fine-grained PR slices', () => {
  const small = summarizeRoadmap({ order: ['H'], cards: [
    { id: 'H-1', batch: 'H', status: 'IN_PROGRESS', units: ['H-1'] },
    { id: 'H-2', batch: 'H', status: 'MERGED', units: ['H-2'] }
  ] });
  assert.equal(small.remainingApproved, 1);
  assert.equal(small.merged, 1);
  assert.equal(Object.hasOwn(small, 'completedPrSlices'), false);
});


test('Google ledger preserves review, time gates and optional work', () => {
  const table = '## Status ledger\n| Card | Status | PR | Notes |\n' +
    '| P0-1 | DONE (automated) | #1 | external proof open |\n' +
    '| P5-2 | TODO | | time gated |\n| P6-1 | IN_REVIEW | | incomplete |\n' +
    '| P7-6 | SUPERSEDED | | replaced |\n| P8-6 | WAITING (optional reuse) | | optional |\n## Audit\n';
  const summary = summarizeRoadmap(readRoadmapLedger(table));
  assert.equal(summary.total, 4); assert.equal(summary.merged, 1);
  assert.equal(summary.remainingApproved, 2); assert.equal(summary.onRequest, 1);
  assert.throws(() => readRoadmapLedger('missing'));
  assert.throws(() => readRoadmapLedger(table.replace('TODO', 'UNKNOWN')));
  assert.throws(() => readRoadmapLedger(table.replace('| P5-2', '| P0-1')));
});

test('native COMPLETE and PLANNED statuses remain distinct from merged and approved', () => {
  const result = summarizeRoadmap({ order: ['A'], cards: [
    { id: 'A-1', batch: 'A', units: ['A-1'], status: 'COMPLETE' },
    { id: 'A-2', batch: 'A', units: ['A-2'], status: 'PLANNED' }
  ] });
  assert.equal(result.merged, 0); assert.equal(result.complete, 1);
  assert.equal(result.planned, 1); assert.equal(result.remainingApproved, 0);
  assert.equal(result.remainingIncludingPlanned, 1);
  assert.deepEqual(result.batches[0].planned, ['A-2']);
});


test('engineering view preserves actionable work independently of old READY deployment', () => {
  const index = readRoadmapLedger(block([]));
  const rows = readEngineeringQueue(block([]), index);
  assert.deepEqual(rows.map(row => [row.id,row.state]), [['P0-2','REVIEW'], ['P1-1','REVIEW']]);
  assert.equal(rows[0].next, 'Trace caller and tests');
  for (const broken of [
    block([]).replace('"P0-2","state"', '"P9-9","state"'),
    block([]).replace('"REVIEW"', '"READY_ENOUGH"'),
    block([]).replace('"REVIEW"', '"EXTERNAL_ONLY"'),
    block([]).replace('"evidence":"fixture source and tests"', '"evidence":""'),
    block([]).replace(engineeringBlock, ''),
    block([]) + engineeringBlock,
    block([]).replace('"P1-1","state"', '"P0-2","state"')
  ]) assert.throws(() => readEngineeringQueue(broken, index));
  const incomplete = block([]).replace(/,\{"id":"P1-1"[^}]*\}/, '');
  assert.throws(() => readEngineeringQueue(incomplete, index), /Missing engineering disposition/);
});
