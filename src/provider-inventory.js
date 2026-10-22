// Offline P11-1 provider-method inventory checks. A tool registration is not provider parity.
// No network, secrets, Google calls, or writes are performed by this module.
const STATUS = new Set(['mapped', 'missing', 'unknown', 'provider_unavailable']);
const LIVE = new Set(['unverified', 'verified']);
const EFFECTS = new Set(['read', 'write', 'delete', 'mixed', 'unknown']);
const CREDENTIALS = new Set(['user_oauth', 'service_account', 'dwd', 'api_key', 'unknown']);
const key = (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value);

export function inspectProviderInventory(inventory, registeredToolNames) {
  const problems = [];
  const families = [];
  const seenFamilies = new Set();
  const seenOperations = new Set();
  const linkedTools = new Set();
  const toolNames = Array.isArray(registeredToolNames) ? registeredToolNames : [];
  const registered = new Set(toolNames);

  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return { ok: false, problems: ['Inventory must be an object.'], families: [], partial: true };
  }
  if (inventory.schemaVersion !== 1) problems.push('Unsupported inventory schema version.');
  if (inventory.complete !== false) problems.push('Initial baseline must explicitly declare complete:false; full coverage is not certified.');
  if (registered.size !== toolNames.length) problems.push('Duplicate name in runtime registered tool set.');
  if (!Array.isArray(inventory.families) || inventory.families.length === 0) problems.push('Inventory must include families.');
  for (const family of (Array.isArray(inventory.families) ? inventory.families : [])) {
    const familyName = family?.api + '/' + family?.version;
    if (!key(family?.api) || !key(family?.version)) problems.push('Invalid API family/version: ' + familyName);
    if (seenFamilies.has(familyName)) problems.push('Duplicate API family: ' + familyName);
    seenFamilies.add(familyName);
    if (!/^https:\/\//.test(family?.reference || '')) problems.push('Missing official HTTPS reference: ' + familyName);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(family?.checkedOn || '')) problems.push('Invalid reference check date: ' + familyName);
    if (!Array.isArray(family?.referenceMethodIds) || family.referenceMethodIds.length === 0) {
      problems.push('Missing pinned reference method IDs: ' + familyName);
    }
    if (!Array.isArray(family?.operations)) {
      problems.push('Missing operation rows: ' + familyName);
      continue;
    }
    const expected = new Set();
    for (const method of family.referenceMethodIds || []) {
      if (!key(method)) problems.push('Invalid reference method key: ' + method);
      if (expected.has(method)) problems.push('Duplicate reference method: ' + familyName + ':' + method);
      expected.add(method);
    }
    const observed = new Set();
    const statuses = { mapped: 0, missing: 0, unknown: 0, provider_unavailable: 0 };
    let liveVerified = 0;
    for (const operation of family.operations) {
      const method = operation?.method;
      const fullId = familyName + ':' + method;
      if (!key(method) || !expected.has(method)) problems.push('Unknown/unpinned operation: ' + fullId);
      if (observed.has(method) || seenOperations.has(fullId)) problems.push('Duplicate operation row: ' + fullId);
      observed.add(method);
      seenOperations.add(fullId);
      if (!STATUS.has(operation?.sourceStatus)) problems.push('Invalid source disposition: ' + fullId);
      else statuses[operation.sourceStatus]++;
      if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(operation?.httpMethod || '')) problems.push('Missing/invalid official HTTP method: ' + fullId);
      if (typeof operation?.httpPath !== 'string' || !/^\/[A-Za-z0-9_@./{}-]+$/.test(operation.httpPath)) problems.push('Missing/invalid official HTTP route: ' + fullId);
      if (!/^[a-z0-9.-]+\.googleapis\.com$/.test(operation?.host || '')) problems.push('Missing/invalid provider hostname: ' + fullId);
      if (!EFFECTS.has(operation?.effect)) problems.push('Missing/invalid side-effect class: ' + fullId);
      if (!CREDENTIALS.has(operation?.credentialKind)) problems.push('Missing/invalid credential type: ' + fullId);
      if (!operation?.roleOrEntitlement || !operation?.scopeAssessment) problems.push('Missing authority assessment: ' + fullId);
      if (!operation?.sourceOwner || !operation?.sourcePath) problems.push('Missing source ownership/path: ' + fullId);
      if (!Array.isArray(operation?.testEvidence)) problems.push('Missing independent test evidence field: ' + fullId);
      if (!LIVE.has(operation?.liveStatus)) problems.push('Missing/invalid live status: ' + fullId);
      if (operation?.liveStatus === 'verified') {
        liveVerified++;
        if (!operation?.liveRevision || !operation?.liveEvidence) problems.push('Live verified without exact revision and evidence: ' + fullId);
      }
      if (operation?.liveStatus === 'unverified' && (operation.liveRevision || operation.liveEvidence)) {
        problems.push('Unverified method must not carry claimed live proof: ' + fullId);
      }
      if (operation?.sourceStatus === 'mapped') {
        if (!key(operation.tool) || !registered.has(operation.tool)) problems.push('Mapped operation has no registered tool: ' + fullId + ' => ' + operation.tool);
        else linkedTools.add(operation.tool);
        if (typeof operation.sourcePath !== 'string' || !operation.sourcePath.startsWith('src/')) problems.push('Mapped source must cite a source path: ' + fullId);
      } else if (operation?.tool) {
        problems.push('Unmapped operation cannot cite a working tool: ' + fullId);
      }
      if (operation?.sourceStatus === 'provider_unavailable' && !operation?.dispositionEvidence) {
        problems.push('Provider-unavailable method requires documented evidence: ' + fullId);
      }
    }
    for (const method of expected) if (!observed.has(method)) problems.push('Missing reference operation: ' + familyName + ':' + method);
    families.push({
      api: family.api, version: family.version, referenceMethods: expected.size,
      recordedOperations: family.operations.length, source: statuses, liveVerified,
      referenceCheckedOn: family.checkedOn
    });
  }
  const unlinkedRegistry = [...registered].filter((name) => !linkedTools.has(name)).sort();
  return {
    ok: problems.length === 0, problems, partial: true, families,
    referenceMethods: families.reduce((sum, row) => sum + row.referenceMethods, 0),
    linkedRegistryTools: linkedTools.size,
    registryToolsNotYetReconciled: unlinkedRegistry.length,
    nextUnlinkedToolNames: unlinkedRegistry.slice(0, 12),
    caveat: 'Partial reference-method snapshots only. Do not compute provider coverage percentages or infer source/provider/credential acceptance from registered tool names.'
  };
}
