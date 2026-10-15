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
test('a merged label cannot replace a missing engineering-completion record', () => {
  const r = { ...report(), bundles: [bundle()] };
  const c = { ...config, target: 1,
    index: { cards: index.cards.map(card => card.id === 'P0-2' ? { ...card, status: 'MERGED' } : card) },
    engineering: [review('P7-1')] };
  assert.throws(() => assessCompletion(r, c), /Unfinished engineering/);
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

test('new sessions require scope comparison, never a bare green accounting claim', () => {
  const r = { ...report(), bundles: [bundle()] };
  const c = { ...config, target: 1, engineering: [external('P0-2')], requireScopePlans: true };
  assert.throws(() => assessCompletion(r, c), /frozen pre-code scope/);
  assert.throws(() => assessCompletion(r, { ...c, scopeCheck: () => ({ status: 'CONTINUE_BUNDLE' }) }), /incomplete contributions/);
  assert.equal(assessCompletion(r, { ...c, scopeCheck: () => ({ status: 'SCOPE_ACCOUNTING_CHECKED' }) }).status, 'TARGET_CLAIM_CHECKED');
});

test('preserved small contributions combine once, with all original criteria and exact totals', async () => {
  const { checkBundleScope } = await import('./session-completion.mjs');
  const root = mkdtempSync(join(tmpdir(), 'combined-bundle-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
  try {
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    mkdirSync(join(root, 'docs/pr-cards'), { recursive: true });
    writeFileSync(join(root, 'docs/base.md'), 'Approved original roadmap'); git('add','.'); git('commit','-m','baseline');
    const plans = [];
    for (const [id, lines] of [['P0-2',186], ['P7-1',250]]) {
      const p = { baseRevision: git('rev-parse','HEAD'), outcome: 'Complete related approved domain behavior',
        integrationBoundary: 'Service, domain, callers and shared persistence', newEngineering: 'New missing provider and caller behavior',
        relatedWorkDecision: 'Keep related whole approved subsections in one bundle', estimatedProductionLines: 300,
        subsections: [{ id, acceptance: ['Complete original domain behavior and refused paths'], remainingEngineering: ['Build missing domain behavior and persistence'] }] };
      const cardPath = 'docs/pr-cards/' + id + '.md';
      writeFileSync(join(root,cardPath), '<!-- bundle-plan:start -->\n```json\n'+JSON.stringify(p)+'\n```\n<!-- bundle-plan:end -->');
      git('add','.'); git('commit','-m','plan '+id); const plannedAt = git('rev-parse','HEAD');
      writeFileSync(join(root,id+'.js'), 'export const actual = true;'); git('add','.'); git('commit','-m','implement '+id);
      plans.push({ cardPath, plannedAt, delivery: { subsections: [{ id, remainingEngineering: [],
        criteria: [{ criterion: p.subsections[0].acceptance[0], evidence: 'Actual provider request and proving domain regression references' }] }],
        productionAdded: lines, productionRemoved: 0, decision: 'CONTINUE',
        newEngineering: 'Completed related actual new domain behavior', planComparison: 'Original criterion delivered with actual regression evidence',
        relatedWorkDecision: 'Contribute this small outcome to the same coherent bundle' } });
    }
    const b = { outcome: 'Complete the related coherent domain workflow', subsections: ['P0-2','P7-1'], productionAdded: 436, productionRemoved: 0,
      scopeReview: { plans, decision: 'SUBSTANTIAL', newEngineering: 'Both related domain behaviors and callers now integrated',
        planComparison: 'Every criterion from both original plans delivered and verified', relatedWorkDecision: 'Combined two small completed outcomes once rather than two bundles' } };
    assert.equal(checkBundleScope(root,b).status,'SCOPE_ACCOUNTING_CHECKED');
    assert.throws(() => checkBundleScope(root,{ ...b, productionAdded: 500 }), /totals must agree/);
    plans[1].delivery.subsections[0].remainingEngineering = ['Actual unfinished persistence and recovery'];
    assert.equal(checkBundleScope(root,b).status,'CONTINUE_BUNDLE');
    plans[1].delivery.subsections[0].criteria = [];
    assert.throws(() => checkBundleScope(root,b), /Every planned criterion/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('CLI turns scope enforcement on from the actual session-baseline ledger', () => {
  const root = mkdtempSync(join(tmpdir(), 'scope-enforcement-'));
  const git = (...args) => execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const ledger = state => '<!-- BUNDLE_SCOPE_VERSION_1 -->\n## Status ledger\n| P0-2 | IN_PROGRESS | | scope |\n' +
    '<!-- engineering-readiness:start -->\n```json\n'+JSON.stringify([{...review('P0-2'),state,...(state==='EXTERNAL_ONLY'?{gate:'Original TEST pass'}:{})}])+'\n```\n<!-- engineering-readiness:end -->';
  try {
    git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
    mkdirSync(join(root,'docs/plan'),{recursive:true});
    writeFileSync(join(root,'docs/plan/TASKS.md'),ledger('REVIEW'));git('add','.');git('commit','-m','baseline');const first=git('rev-parse','HEAD');
    writeFileSync(join(root,'docs/plan/TASKS.md'),ledger('EXTERNAL_ONLY'));git('add','.');git('commit','-m','completed source');const second=git('rev-parse','HEAD');
    git('update-ref','refs/remotes/origin/main',second);
    writeFileSync(join(root,'report.json'),JSON.stringify({baseRevision:first,bundles:[{...bundle(),merges:[second]}]}));
    assert.throws(()=>run(root,['--bundles','1','--report','report.json']),/Bundle needs scopeReview/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('completion counts newly passed original work on already-merged source, never old code or audit prose', () => {
  const before = { id: 'P0-2-PROVIDER', status: 'PENDING', requiredRevision: base,
    task: 'Original full provider acceptance workflow', procedure: 'Original card', gates: 'Original scoped TEST permission',
    dependsOn: [], lastEvidence: 'Not performed' };
  const after = { ...before, status: 'PASSED', lastEvidence: 'New exact deployed provider readback, denied path, recovery and cleanup evidence' };
  const b = { ...bundle(), workKind: 'COMPLETION', productionAdded: 0, productionRemoved: 0,
    acceptanceTasks: [before.id] };
  const r = { ...report(), bundles: [b] };
  const mergedIndex = { cards: index.cards.map(row => ({ ...row, status: 'MERGED' })) };
  const c = { ...config, target: 1, index: mergedIndex, baselineIndex: mergedIndex,
    baselineEngineering: [external('P0-2')], engineering: [external('P0-2')],
    baselineQueue: [before], queue: [after], scopeCheck: () => ({ status: 'SCOPE_ACCOUNTING_CHECKED' }) };
  assert.equal(assessCompletion(r, c).status, 'TARGET_CLAIM_CHECKED');
  // Removing the completion declaration cannot turn inherited source into new engineering.
  assert.throws(() => assessCompletion({ ...r, bundles: [{ ...b, workKind: 'ENGINEERING', productionAdded: 650 }] }, c), /previously completed/);
  for (const change of [
    { baselineQueue: [after] }, { queue: [{ ...after, status: 'PENDING' }] },
    { queue: [{ ...after, gates: 'Weakened gate' }] }, { queue: [{ ...after, requiredRevision: merge }] },
    { queue: [{ ...after, task: 'Only easier discovery' }] }, { queue: [{ ...after, lastEvidence: before.lastEvidence }] },
    { baselineQueue: [] }, { queue: [] }, { scopeCheck: () => ({ status: 'CONTINUE_BUNDLE' }) }
  ]) assert.throws(() => assessCompletion(r, { ...c, ...change }));
  assert.throws(() => assessCompletion({ ...r, bundles: [{ ...b, subsections: ['P7-1'] }] }, c), /not mapped/);
  assert.throws(() => assessCompletion({ ...r, bundles: [{ ...b, acceptanceTasks: [before.id,before.id] }] }, c), /distinct/);
  const dep = { ...before, id: 'DEPENDENCY', status: 'PENDING' };
  assert.throws(() => assessCompletion(r, { ...c, baselineQueue: [{ ...before, dependsOn: [dep.id] }, dep],
    queue: [{ ...after, dependsOn: [dep.id] }, dep] }), /dependency/);
});

test('real Git CLI accepts newly merged zero-code provider evidence and rejects republishing its prior pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'completion-evidence-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
  const task = { id: 'P0-2-REAL', priority: 1, status: 'PENDING', requiredRevision: base,
    task: 'Original full approved provider lifecycle', procedure: 'Original card and approved runner',
    gates: 'Unchanged original permission and cleanup', dependsOn: [], lastEvidence: 'Not performed' };
  const ledger = row => '<!-- BUNDLE_SCOPE_VERSION_1 -->\n## Status ledger\n| P0-2 | MERGED | | Original requirement |\n' +
    '<!-- engineering-readiness:start -->\n```json\n'+JSON.stringify([external('P0-2')])+'\n```\n<!-- engineering-readiness:end -->\n'+
    '<!-- release-acceptance:start -->\n```json\n'+JSON.stringify([row])+'\n```\n<!-- release-acceptance:end -->';
  try {
    git('init'); git('config','user.name','Fixture'); git('config','user.email','fixture@example.invalid');
    mkdirSync(join(root,'docs/plan'),{recursive:true}); mkdirSync(join(root,'docs/pr-cards'),{recursive:true});
    writeFileSync(join(root,'docs/plan/TASKS.md'),ledger(task)); git('add','.'); git('commit','-m','original source already complete');
    const first = git('rev-parse','HEAD');
    const plan = { workKind: 'COMPLETION', baseRevision: first, estimatedProductionLines: 0,
      outcome: 'Complete the full original real-provider workflow', integrationBoundary: 'Actual deployed service, provider and exact cleanup',
      newEngineering: 'No new application code; original provider proof remains', relatedWorkDecision: 'One coherent original full workflow, not an isolated read',
      acceptanceTasks: [task.id], subsections: [{ id: 'P0-2', acceptance: [task.task], remainingEngineering: [],
        remainingWork: ['Perform the original authorized lifecycle with positive, denied, recovery and cleanup evidence'] }] };
    const cardPath='docs/pr-cards/existing.md';
    writeFileSync(join(root,cardPath),'<!-- bundle-plan:start -->\n```json\n'+JSON.stringify(plan)+'\n```\n<!-- bundle-plan:end -->');
    git('add','.'); git('commit','-m','freeze original completion scope'); const plannedAt=git('rev-parse','HEAD');
    writeFileSync(join(root,'docs/plan/TASKS.md'),ledger({...task,status:'PASSED',lastEvidence:'New exact deployed provider readback, denial and cleanup receipts'}));
    git('add','.'); git('commit','-m','record original full completion evidence'); const final=git('rev-parse','HEAD');
    git('update-ref','refs/remotes/origin/main',final);
    const proof={ decision:'SUBSTANTIAL_EXCEPTION', productionAdded:0, productionRemoved:0,
      newEngineering:plan.newEngineering, relatedWorkDecision:plan.relatedWorkDecision,
      planComparison:'Every frozen original criterion completed, including provider cleanup',
      exceptionEvidence:['Substantial original full lifecycle verification across positive/denied/recovery paths; no inherited code counted'],
      subsections:[{id:'P0-2',remainingEngineering:[],remainingWork:[],criteria:[{criterion:task.task,evidence:'New exact provider lifecycle and cleanup evidence in permanent merged ledger'}]}] };
    const b={workKind:'COMPLETION',outcome:plan.outcome,subsections:['P0-2'],acceptanceTasks:[task.id],merges:[final],
      productionAdded:0,productionRemoved:0,proof:['Original full workflow with actual provider readback and cleanup'],
      scopeReview:{...proof,plans:[{cardPath,plannedAt,delivery:proof}]}};
    const path=join(root,'report.json');writeFileSync(path,JSON.stringify({baseRevision:first,bundles:[b]}));
    const args=['--bundles','1','--report',path];const before=git('status','--porcelain');
    assert.equal(run(root,args).status,'TARGET_CLAIM_CHECKED');
    assert.equal(git('status','--porcelain'),before);
    // New evidence commits cannot recount a pass already present at the session baseline.
    writeFileSync(path,JSON.stringify({baseRevision:final,bundles:[b]}));
    assert.throws(()=>run(root,args),/NEW passed acceptance/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
