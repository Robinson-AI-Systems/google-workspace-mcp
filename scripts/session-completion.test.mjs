import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { assessCompletion, run } from './session-completion.mjs';

const base = 'a'.repeat(40), merge = 'b'.repeat(40);
const index = { cards: [
  { id: 'P0-1', status: 'MERGED' }, { id: 'P0-2', status: 'IN_PROGRESS' },
  { id: 'P7-1', status: 'IN_PROGRESS' }
] };
const review = id => ({ id, state: 'REVIEW', remaining: 'Trace complete acceptance', evidence: 'actual code/tests', next: 'finish connected outcome' });
const external = id => ({ ...review(id), state: 'EXTERNAL_ONLY', gate: 'Exact original owner TEST pass and fixture approval' });
const config = { target: 5, index, baselineIndex: index, baselineEngineering: [],
  engineering: [review('P0-2'), review('P7-1')], mergedAfterBase: sha => sha === merge };
const report = () => ({ baseRevision: base, bundles: [] });
const bundle = () => ({ outcome: 'Complete original P0-2 outcome', subsections: ['P0-2'], merges: [merge],
  productionAdded: 650, productionRemoved: 50, proof: ['Full original acceptance matrix and exact-head CI links'] });

test('the reported 0/5 session cannot finish after a small corrective PR', () => {
  assert.throws(() => assessCompletion(report(), config), /0\/5 bundles: continue/);
  assert.throws(() => assessCompletion({ ...report(), stop: { kind: 'CLEAN_MAIN', evidence: ['one fix merged'], nextAction: 'wait for release' } }, config), /Unsupported early-stop/);
});
test('blanket external-only claims fail when even one engineering review remains', () => {
  const r = { ...report(), stop: { kind: 'EXTERNAL_EXHAUSTION', evidence: ['READY is behind main'], nextAction: 'wait' } };
  assert.throws(() => assessCompletion(r, config), /P0-2, P7-1/);
});
test('completed claims need whole existing IDs and no remaining engineering', () => {
  const r = { ...report(), bundles: [bundle()] };
  assert.throws(() => assessCompletion(r, config), /Unfinished engineering/);
  const c = { ...config, target: 1, engineering: [external('P0-2'), review('P7-1')] };
  assert.equal(assessCompletion(r, c).status, 'TARGET_CLAIM_CHECKED');
  for (const change of [
    { subsections: ['P0-2-helper'] }, { subsections: ['P0-2','P0-2'] },
    { subsections: ['P0-1'] }, { merges: [base] }, { merges: [merge, merge] },
    { proof: [] }, { productionAdded: 0, productionRemoved: 0 }
  ]) assert.throws(() => assessCompletion({ ...report(), bundles: [{ ...bundle(), ...change }] }, c));
  assert.throws(() => assessCompletion({ ...report(), bundles: [bundle(), bundle()] }, { ...c, target: 2 }), /repeated/);
  assert.throws(() => assessCompletion(r, { ...c, baselineEngineering: [external('P0-2')] }), /previously completed/);
});
test('optional and planned scope cannot satisfy a target even with a new merged commit', () => {
  for (const status of ['ON_REQUEST','PLANNED']) {
    const expanded = { cards: [...index.cards, { id: 'P8-6', status }] };
    const c = { ...config, target: 1, index: expanded, baselineIndex: expanded };
    const r = { ...report(), bundles: [{ ...bundle(), subsections: ['P8-6'] }] };
    assert.throws(() => assessCompletion(r, c), /unapproved/);
    // A local/new status or row is not evidence that optional scope was part
    // of the original approved session. Reconcile actual owner scope first.
    c.index = { cards: expanded.cards.map(card => card.id === 'P8-6' ? { ...card, status: 'MERGED' } : card) };
    assert.throws(() => assessCompletion(r, c), /unapproved/);
  }
});
test('genuine exhaustion requires each remaining subsection and remains incomplete', () => {
  const c = { ...config, engineering: [external('P0-2'), external('P7-1')] };
  const r = { ...report(), stop: { kind: 'EXTERNAL_EXHAUSTION', evidence: ['complete source inspection'],
    nextAction: 'Ask owner for exact isolated TEST fixture permission', bySubsection: { 'P0-2': ['all read probes and proof inspected'] } } };
  assert.throws(() => assessCompletion(r, c), /EVERY remaining/);
  r.stop.bySubsection['P7-1'] = ['all six tools and full lifecycle proof inspected; exact permission request'];
  assert.deepEqual(assessCompletion(r, c), { status: 'INCOMPLETE_CHECKPOINT', completed: 0, target: 5, reason: 'EXTERNAL_EXHAUSTION' });
});
test('real execution limits need a recoverable checkpoint, never fake target completion', () => {
  const r = { ...report(), stop: { kind: 'EXECUTION_LIMIT', evidence: ['runner terminated with recorded command failure'],
    nextAction: 'resume exact branch and outcome', constraint: 'runner unavailable', checkpoint: merge } };
  assert.equal(assessCompletion(r, config).status, 'INCOMPLETE_CHECKPOINT');
  for (const change of [{ checkpoint: base }, { constraint: '' }, { evidence: [] }])
    assert.throws(() => assessCompletion({ ...r, stop: { ...r.stop, ...change } }, config));
  for (const target of [0, -1, 1.5, '5', 1001]) assert.throws(() => assessCompletion(r, { ...config, target }));
});
test('CLI reads merged main proof, rejects old/unmerged commits and cannot mutate the checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'session-finish-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
  const ledger = state => '## Status ledger\n| P0-2 | IN_PROGRESS | | scope |\n' +
    '<!-- engineering-readiness:start -->\n```json\n' + JSON.stringify([{ ...review('P0-2'), state,
      ...(state === 'EXTERNAL_ONLY' ? { gate: 'Original TEST pass' } : {}) }]) + '\n```\n<!-- engineering-readiness:end -->';
  try {
    git('init'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
    mkdirSync(join(root,'docs/plan'), { recursive: true });
    writeFileSync(join(root,'docs/plan/TASKS.md'), ledger('REVIEW'));
    git('add','.'); git('commit','-m','baseline'); const first = git('rev-parse','HEAD');
    writeFileSync(join(root,'docs/plan/TASKS.md'), ledger('EXTERNAL_ONLY'));
    git('add','.'); git('commit','-m','completed outcome'); const second = git('rev-parse','HEAD');
    git('update-ref','refs/remotes/origin/main',second);
    const r = { baseRevision: first, bundles: [{ ...bundle(), merges: [second] }] };
    const path = join(root,'report.json'); writeFileSync(path,JSON.stringify(r));
    const args = ['--bundles','1','--report',path];
    assert.equal(run(root,args).status,'TARGET_CLAIM_CHECKED');
    r.bundles[0].merges = [first]; writeFileSync(path,JSON.stringify(r));
    assert.throws(() => run(root,args), /new since/);
    // A local claim is not merged source proof.
    writeFileSync(join(root,'docs/plan/TASKS.md'),ledger('EXTERNAL_ONLY'));
    git('update-ref','refs/remotes/origin/main',first);
    r.bundles[0].merges = [second]; writeFileSync(path,JSON.stringify(r));
    const before = git('status','--porcelain');
    assert.throws(() => run(root,args), /Unfinished engineering/);
    assert.equal(git('status','--porcelain'),before);
    assert.throws(() => run(root,['--bundles','0','--report',path]), /Usage/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
