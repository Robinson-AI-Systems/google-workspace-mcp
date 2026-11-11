import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizedReleaseInvocation, checksPass, checksFailed, decide, denverDay, ownerReleaseInvocation, run } from './promote-live.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
const main = 'a'.repeat(40), live = 'b'.repeat(40);
const good = { id: 1, name: 'ci', head_sha: main, app: { slug: 'github-actions' },
  status: 'completed', conclusion: 'success' };
test('Actions repository identity matches the deployed policy', () => {
  const path = new URL('./policy.json', import.meta.url);
  if (process.env.GITHUB_REPOSITORY && existsSync(path)) {
    const policy = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(policy.repository, process.env.GITHUB_REPOSITORY);
    assert.ok(policy.requiredChecks.includes('release-policy'));
  }
});
test('Denver calendar dates honor midnight and DST', () => {
  assert.equal(denverDay(new Date('2026-10-12T05:59:59Z')), '2026-10-11');
  assert.equal(denverDay(new Date('2026-10-12T06:00:00Z')), '2026-10-12');
  assert.equal(denverDay(new Date('2026-12-12T06:59:59Z')), '2026-12-11');
});
test('requires successful latest exact-head trusted checks', () => {
  assert.equal(checksPass([good], ['ci'], main), true);
  for (const change of [{ conclusion: 'failure' }, { conclusion: 'skipped' },
    { status: 'in_progress' }, { head_sha: live }, { app: { slug: 'other' } }])
    assert.equal(checksPass([{ ...good, ...change }], ['ci'], main), false);
  assert.equal(checksPass([], ['ci'], main), false);
  assert.equal(checksPass([good, { ...good, id: 2, conclusion: 'failure' }], ['ci'], main), false);
  assert.equal(checksPass([good], ['ci', 'missing'], main), false);
  assert.equal(checksFailed([{ ...good, conclusion: 'failure' }], ['ci'], main), true);
  assert.equal(checksFailed([{ ...good, status: 'in_progress', conclusion: null }], ['ci'], main), false);
  assert.equal(checksFailed([{ ...good, head_sha: live, conclusion: 'failure' }], ['ci'], main), false);
});
test('one checked fast-forward daily; reruns and unchanged heads skip', () => {
  const state = { main, live, ancestor: true, green: true, alreadyToday: false };
  assert.equal(decide(state), 'promote');
  assert.equal(decide({ ...state, alreadyToday: true }), 'skip');
  assert.equal(decide({ ...state, live: main }), 'skip');
  assert.throws(() => decide({ ...state, ancestor: false }), /rewrite/);
  assert.throws(() => decide({ ...state, green: false }), /checks/);
  assert.throws(() => decide({ ...state, main: 'main' }), /identity/);
});
test('owner release bypasses the daily cap only for the exact expected SHA', () => {
  const state = { main, live, ancestor: true, green: true, alreadyToday: true,
    ownerRelease: true, expectedMainSha: main };
  assert.equal(decide(state), 'promote');
  assert.equal(decide({ ...state, alreadyToday: false }), 'promote');
  assert.equal(decide({ ...state, live: main }), 'skip');
  assert.throws(() => decide({ ...state, expectedMainSha: live }), /expected main SHA/);
  assert.throws(() => decide({ ...state, expectedMainSha: 'not-a-sha' }), /expected main SHA/);
  assert.throws(() => decide({ ...state, expectedMainSha: undefined }), /expected main SHA/);
  assert.throws(() => decide({ ...state, ancestor: false }), /rewrite/);
  assert.throws(() => decide({ ...state, green: false }), /checks/);
});
test('owner release invocation requires the owner pair and a well-formed expected SHA', () => {
  const env = { GITHUB_REPOSITORY: 'example/repo', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'christcr2012', GITHUB_TRIGGERING_ACTOR: 'christcr2012',
    OWNER_RELEASE: 'true', EXPECTED_MAIN_SHA: main, GH_TOKEN: 'fixture' };
  const time = new Date('2026-10-14T11:00:00Z');
  assert.equal(ownerReleaseInvocation(env), true);
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', time), true);
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', new Date('2026-10-14T06:00:00Z')), true);
  for (const change of [{ GITHUB_ACTOR: 'other' }, { GITHUB_TRIGGERING_ACTOR: 'other' },
    { GITHUB_TRIGGERING_ACTOR: undefined }, { OWNER_RELEASE: 'false' }, { OWNER_RELEASE: undefined },
    { EXPECTED_MAIN_SHA: undefined }, { EXPECTED_MAIN_SHA: '' }, { EXPECTED_MAIN_SHA: 'abc' },
    { EXPECTED_MAIN_SHA: 'A'.repeat(40) }, { EXPECTED_MAIN_SHA: 'g'.repeat(40) },
    { EXPECTED_MAIN_SHA: main.slice(0, 39) }, { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_REF: 'refs/heads/live' }, { GITHUB_REPOSITORY: 'other/repo' }, { GH_TOKEN: '' }])
    assert.equal(authorizedReleaseInvocation({ ...env, ...change }, 'example/repo', time), false);
});
test('workflow exposes the owner release inputs and passes them to the promoter', () => {
  const workflow = readFileSync(new URL('../workflows/daily-live.yml', import.meta.url), 'utf8');
  assert.match(workflow, /owner_release:/);
  assert.match(workflow, /expected_main_sha:/);
  assert.match(workflow, /inputs\.owner_release == true/);
  assert.match(workflow, /OWNER_RELEASE:/);
  assert.match(workflow, /EXPECTED_MAIN_SHA:/);
});
test('real atomic git promotion, read-back and second same-day update refusal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-policy-'));
  const cwd = process.cwd(), fetchBefore = globalThis.fetch;
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GH_TOKEN'];
  const before = keys.map(k => process.env[k]);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init', '--bare', join(dir, 'remote.git'));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Release test');
    git('remote', 'add', 'origin', join(dir, 'remote.git'));
    writeFileSync(join(dir, 'fixture.txt'), 'first');
    git('add', 'fixture.txt'); git('commit', '-m', 'first');
    git('push', 'origin', 'main', 'main:live');
    const original = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'fixture.txt'), 'second');
    git('commit', '-am', 'second'); git('push', 'origin', 'main');
    const second = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'fixture.txt'), 'concurrent agent');
    git('commit', '-am', 'concurrent main');
    const checked = git('rev-parse', 'HEAD');
    git('checkout', '--detach', original);
    Object.assign(process.env, { GITHUB_REPOSITORY: 'example/repo', GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'schedule', GH_TOKEN: 'fixture' });
    process.chdir(dir);
    const policy = { repository: 'example/repo', requiredChecks: ['ci'] };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ total_count: 1,
      check_runs: [{ ...good, head_sha: second, conclusion: 'failure' }] }) });
    await assert.rejects(run(policy), /check failed/);
    assert.equal(git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0], original);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ total_count: 0, check_runs: [] }) });
    await assert.rejects(run(policy, { attempts: 2, pause: async () => {} }), /window exhausted/);
    assert.equal(git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0], original);
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) git('push', 'origin', checked + ':refs/heads/main');
      return { ok: true, json: async () => ({ total_count: 1, check_runs: [{ ...good,
        head_sha: calls === 1 ? second : checked,
        status: calls === 2 ? 'in_progress' : 'completed' }] }) };
    };
    await run(policy, { attempts: 3, pause: async () => {} });
    assert.equal(calls, 3);
    assert.equal(git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0], checked);
    assert.equal(git('ls-remote', 'origin', 'refs/tags/live-promotion/' + denverDay()).split(/\s+/)[0], checked);
    // An explicitly approved recovery can promote via a guarded ref update
    // rather than this script's atomic push. Its day-specific branch receipt
    // must prevent a later scheduled retry from publishing a second revision.
    git('push', 'origin', ':refs/tags/live-promotion/' + denverDay());
    git('push', 'origin', checked + ':refs/heads/release-markers/' + denverDay());
    assert.equal(git('ls-remote', 'origin', 'refs/heads/release-markers/' + denverDay()).split(/\s+/)[0], checked);
    git('checkout', 'main');
    writeFileSync(join(dir, 'fixture.txt'), 'third');
    git('commit', '-am', 'third'); git('push', 'origin', 'main');
    await run({ repository: 'example/repo', requiredChecks: ['ci'] });
    assert.equal(git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0], checked);
    process.env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    await assert.rejects(run({ repository: 'example/repo', requiredChecks: ['ci'] }), /Scheduled/);
  } finally {
    process.chdir(cwd); globalThis.fetch = fetchBefore;
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('bounded schedule backups preserve midnight, daily marker and owner recovery', () => {
  const workflow = readFileSync(new URL('../workflows/daily-live.yml', import.meta.url), 'utf8');
  const crons = [...workflow.matchAll(/cron: '([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(crons, ['19 20 * * *', '35 20 * * *', '35 21 * * *', '55 1 * * *', '1 9 * * *']);
  assert.equal((workflow.match(/timezone: America\/Denver/g) || []).length, 4);
  assert.match(workflow, /recover_missed_daily:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /github.actor == 'christcr2012'/);
  assert.match(workflow, /RECOVER_MISSED_DAILY:/);
  assert.match(workflow, /cancel-in-progress: false/);
});
test('recovery requires explicit owner, expected repository, main and elapsed midnight', async () => {
  const { authorizedReleaseInvocation } = await import('./promote-live.mjs');
  const env = { GITHUB_REPOSITORY: 'example/repo', GITHUB_REF: 'refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'christcr2012', GITHUB_TRIGGERING_ACTOR: 'christcr2012',
    RECOVER_MISSED_DAILY: 'true', GH_TOKEN: 'fixture' };
  const time = new Date('2026-10-14T11:00:00Z');
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', time), true);
  for (const change of [{ GITHUB_TRIGGERING_ACTOR: 'other' }, { GITHUB_TRIGGERING_ACTOR: undefined }, { GITHUB_ACTOR: 'other' }, { RECOVER_MISSED_DAILY: 'false' },
    { RECOVER_MISSED_DAILY: undefined }, { GITHUB_REF: 'refs/heads/live' },
    { GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_EVENT_NAME: 'push' },
    { GH_TOKEN: '' }])
    assert.equal(authorizedReleaseInvocation({ ...env, ...change }, 'example/repo', time), false);
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', new Date('2026-10-14T06:00:00Z')), false);
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', new Date('2026-12-14T07:00:00Z')), false);
  assert.equal(authorizedReleaseInvocation(env, 'example/repo', new Date('2026-12-14T07:01:00Z')), true);
  assert.equal(authorizedReleaseInvocation({ ...env, GITHUB_EVENT_NAME: 'schedule' }, 'example/repo', time), true);
});

test('successful no-change run records a receipt and suppresses later development', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-no-change-'));
  const cwd = process.cwd(), fetchBefore = globalThis.fetch;
  const tokenKey = 'GH_TOKEN';
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', tokenKey];
  const before = keys.map(k => process.env[k]);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init', '--bare', join(dir, 'remote.git'));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Release test');
    git('remote', 'add', 'origin', join(dir, 'remote.git'));
    writeFileSync(join(dir, 'fixture.txt'), 'initial');
    git('add', 'fixture.txt'); git('commit', '-m', 'initial');
    git('push', 'origin', 'main', 'main:live');
    const original = git('rev-parse', 'HEAD');
    Object.assign(process.env, { GITHUB_REPOSITORY: 'example/repo',
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'schedule', [tokenKey]: 'fixture' });
    process.chdir(dir);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ total_count: 1,
      check_runs: [{ ...good, head_sha: original }] }) });
    const policy = { repository: 'example/repo', requiredChecks: ['ci'] };
    await run(policy, { attempts: 1 });
    assert.equal(git('ls-remote', 'origin', 'refs/tags/live-promotion/' + denverDay()).split(/\s+/)[0], original);
    writeFileSync(join(dir, 'fixture.txt'), 'later development');
    git('commit', '-am', 'later'); git('push', 'origin', 'main');
    await run(policy, { attempts: 1 });
    assert.equal(git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0], original);
  } finally {
    process.chdir(cwd); globalThis.fetch = fetchBefore;
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('owner release promotes past the daily marker with its own receipt, exact-SHA and check guards', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-owner-'));
  const cwd = process.cwd(), fetchBefore = globalThis.fetch;
  const keys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_EVENT_NAME', 'GH_TOKEN',
    'GITHUB_ACTOR', 'GITHUB_TRIGGERING_ACTOR', 'OWNER_RELEASE', 'EXPECTED_MAIN_SHA', 'RECOVER_MISSED_DAILY'];
  const before = keys.map(k => process.env[k]);
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: 'pipe' }).trim();
  const remoteTag = name => git('ls-remote', 'origin', 'refs/tags/' + name).split(/\s+/)[0];
  const remoteLive = () => git('ls-remote', 'origin', 'refs/heads/live').split(/\s+/)[0];
  try {
    git('init', '--bare', join(dir, 'remote.git'));
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Release test');
    git('remote', 'add', 'origin', join(dir, 'remote.git'));
    writeFileSync(join(dir, 'fixture.txt'), 'first');
    git('add', 'fixture.txt'); git('commit', '-m', 'first');
    git('push', 'origin', 'main', 'main:live');
    const original = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'fixture.txt'), 'second');
    git('commit', '-am', 'second'); git('push', 'origin', 'main');
    const second = git('rev-parse', 'HEAD');
    git('push', 'origin', original + ':refs/tags/live-promotion/' + denverDay());
    const marker = 'live-promotion/' + denverDay();
    const receiptFor = sha => 'owner-release/' + denverDay() + '-' + sha.slice(0, 8);
    Object.assign(process.env, { GITHUB_REPOSITORY: 'example/repo', GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_ACTOR: 'christcr2012',
      GITHUB_TRIGGERING_ACTOR: 'christcr2012', OWNER_RELEASE: 'true',
      EXPECTED_MAIN_SHA: second, GH_TOKEN: 'fixture' });
    delete process.env.RECOVER_MISSED_DAILY;
    process.chdir(dir);
    const policy = { repository: 'example/repo', requiredChecks: ['ci'] };
    let checkSha = second, checkConclusion = 'success';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ total_count: 1,
      check_runs: [{ ...good, head_sha: checkSha, conclusion: checkConclusion }] }) });
    await run(policy, { attempts: 1 });
    assert.equal(remoteLive(), second);
    assert.equal(remoteTag(receiptFor(second)), second);
    assert.equal(remoteTag(marker), original);
    writeFileSync(join(dir, 'fixture.txt'), 'third');
    git('commit', '-am', 'third'); git('push', 'origin', 'main');
    const third = git('rev-parse', 'HEAD');
    await assert.rejects(run(policy, { attempts: 1 }), /Owner release refused/);
    assert.equal(remoteLive(), second);
    process.env.EXPECTED_MAIN_SHA = third; checkSha = third; checkConclusion = 'failure';
    await assert.rejects(run(policy, { attempts: 1 }), /check failed/);
    assert.equal(remoteLive(), second);
    checkConclusion = 'success';
    await run(policy, { attempts: 1 });
    assert.equal(remoteLive(), third);
    assert.equal(remoteTag(receiptFor(third)), third);
    assert.equal(remoteTag(marker), original);
    await run(policy, { attempts: 1 });
    assert.equal(remoteLive(), third);
    assert.equal(remoteTag(receiptFor(third)), third);
    assert.equal(remoteTag(marker), original);
    writeFileSync(join(dir, 'fixture.txt'), 'fourth');
    git('commit', '-am', 'fourth'); git('push', 'origin', 'main');
    const fourth = git('rev-parse', 'HEAD');
    // A side commit on top of the original that is NOT in main's history:
    // live pointing at it has genuinely diverged from main.
    git('checkout', '--detach', original);
    writeFileSync(join(dir, 'divergent.txt'), 'divergent');
    git('add', 'divergent.txt'); git('commit', '-m', 'divergent');
    const divergent = git('rev-parse', 'HEAD');
    git('push', 'origin', divergent + ':refs/heads/live', '--force');
    git('checkout', 'main');
    process.env.EXPECTED_MAIN_SHA = fourth; checkSha = fourth;
    await assert.rejects(run(policy, { attempts: 1 }), /diverged|rewrite/);
    assert.equal(remoteLive(), divergent);
  } finally {
    process.chdir(cwd); globalThis.fetch = fetchBefore;
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i]; });
    rmSync(dir, { recursive: true, force: true });
  }
});
