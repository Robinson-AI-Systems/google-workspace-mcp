// Read-only v1 early-release preflight. NEVER a deployment, Google, security, or CI attestation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readQueue } from './session-status.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const queueStart = '<!-- release-acceptance:start -->';
const queueEnd = '<!-- release-acceptance:end -->';

export function assessV1(manifest, rows, observation = {}) {
  if (manifest?.schemaVersion !== 1 || manifest.stage !== 'v1-invite-only-early-release' ||
      !Array.isArray(manifest.mandatoryAcceptanceIds) || !manifest.mandatoryAcceptanceIds.length ||
      !manifest.deferredAcceptance || typeof manifest.deferredAcceptance !== 'object' ||
      Array.isArray(manifest.deferredAcceptance)) throw new Error('Malformed v1 release manifest');
  const required = manifest.mandatoryAcceptanceIds;
  const excluded = Object.keys(manifest.deferredAcceptance);
  if (new Set([...required, ...excluded]).size !== required.length + excluded.length ||
      [...required, ...excluded].some(id => typeof id !== 'string' || !id)) {
    throw new Error('Duplicate or invalid v1 classification ID');
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  if (byId.size !== rows.length) throw new Error('Duplicate acceptance ledger ID');
  for (const id of [...required, ...excluded]) {
    if (!byId.has(id)) throw new Error('Unknown v1 acceptance ID: ' + id);
  }
  const unclassified = rows.filter(row => row.status !== 'PASSED' &&
    !required.includes(row.id) && !excluded.includes(row.id));
  const unfinished = required.filter(id => byId.get(id).status !== 'PASSED');
  // Dependencies are never waived: if a mandatory task depends on a pending
  // task classified "deferred", the required task must still remain blocked.
  const dependencyGaps = required.flatMap(id => byId.get(id).dependsOn
    .filter(dep => byId.get(dep)?.status !== 'PASSED').map(dep => ({ id, dependency: dep })));
  const { main, live, deployed, state } = observation;
  const validSource = [main, live, deployed].every(x => SHA.test(x || ''));
  const provenance = validSource && main === live && live === deployed && state === 'READY';
  const status = unfinished.length || unclassified.length || dependencyGaps.length || !provenance
    ? 'BLOCKED' : 'PREFLIGHT_CLEAR_NOT_LIVE_ATTESTATION';
  return {
    status,stage:manifest.stage,
    source: { main:main || null,live:live || null,deployed:deployed || null,state:state || 'UNKNOWN',
      matchedReadySnapshot:Boolean(provenance) },
    required:required.map(id=>({id,status:byId.get(id).status})),
    pendingMandatory:unfinished,
    missingDependencyPasses:dependencyGaps,
    newlyPendingUnclassified:unclassified.map(row=>row.id),
    excludedPending:excluded.filter(id=>byId.get(id).status !== 'PASSED'),
    cannotInfer:'Static local record checks only. Independently verify actual Vercel READY and served SHA, exact-head CI, original real provider/client evidence, negative auth/refresh/revocation, privacy/legal disclosures, platform support, and owner-authorized release. No release or enrollment permission is granted.'
  };
}

export function runV1(root, argv) {
  const accepted = new Set(['--main','--live','--deployed','--state','--json']);
  const opts = {};
  for(let i=0;i<argv.length;i++) {
    const key=argv[i];
    if (!accepted.has(key) || key in opts) throw new Error('Usage: v1-readiness.mjs [--main SHA --live SHA --deployed SHA --state READY] [--json]');
    if(key==='--json') opts[key]=true;
    else {
      if(!argv[i+1] || argv[i+1].startsWith('--')) throw new Error('Missing value for '+key);
      opts[key]=argv[++i];
    }
  }
  const ledger=readFileSync(resolve(root,'docs/plan/TASKS.md'),'utf8');
  if(!ledger.includes(queueStart) || !ledger.includes(queueEnd)) throw new Error('Authoritative release-acceptance ledger missing');
  const rows=readQueue(ledger);
  const manifest=JSON.parse(readFileSync(resolve(root,'docs/plan/v1-release-gates.json'),'utf8'));
  const report=assessV1(manifest,rows,{main:opts['--main'],live:opts['--live'],deployed:opts['--deployed'],state:opts['--state']});
  const output=opts['--json']?JSON.stringify(report,null,2):[
    'v1 early-release preflight: '+report.status,
    'Required original acceptance remaining: '+(report.pendingMandatory.join(', ')||'none'),
    'Pending dependencies: '+(report.missingDependencyPasses.map(g=>g.id+' -> '+g.dependency).join(', ')||'none'),
    'NEW unclassified pending acceptance (fail-closed): '+(report.newlyPendingUnclassified.join(', ')||'none'),
    'Explicit later feature-validation tasks (still PENDING): '+(report.excludedPending.join(', ')||'none'),
    'Verified-source observations supplied and exact match READY: '+report.source.matchedReadySnapshot,
    report.cannotInfer
  ].join('\n');
  return {report,output,exitCode:report.status==='BLOCKED'?2:0};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { const {output,exitCode}=runV1(ROOT,process.argv.slice(2));console.log(output);process.exitCode=exitCode; }
  catch(err){console.error('v1 preflight error: '+err.message);process.exitCode=2;}
}
