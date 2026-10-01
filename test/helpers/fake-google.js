// A stand-in for the object of Google clients that tool handlers receive
// (`clients.gmail`, `clients.drive`, ...). Any method path works without being
// declared: it records the call and returns { data: {} } unless a test
// configured something else with `when(path)`.
//
//   const { clients, calls, when } = makeFakeClients();
//   when('gmail.users.settings.sendAs.list').resolves({ data: { sendAs: [] } });
//   await handlers.some_tool({}, clients);
//   calls.filter((c) => c.path === 'gmail.users.settings.sendAs.create');

/** Build an error shaped like the ones the googleapis library throws. */
export function googleError(code, reason, message) {
  const err = new Error(message);
  err.code = code;
  err.response = { status: code, data: { error: { code, message, errors: [{ reason, message }] } } };
  return err;
}

export function makeFakeClients({ actingAs = 'ops@example.test' } = {}) {
  const calls = [];
  const rules = new Map(); // path -> { queue: [rule], fallback: rule }

  const ruleFor = (path) => {
    if (!rules.has(path)) rules.set(path, { queue: [], fallback: null });
    return rules.get(path);
  };

  const node = (path) => new Proxy(function fakeGoogleMethod() {}, {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined; // never look like a promise
      return node([...path, prop]);
    },
    apply(_target, _this, args) {
      const full = path.join('.');
      calls.push({ path: full, args });
      const entry = rules.get(full);
      const rule = entry?.queue.length ? entry.queue.shift() : entry?.fallback;
      if (!rule) return Promise.resolve({ data: {} });
      if (rule.type === 'reject') return Promise.reject(rule.error);
      const value = typeof rule.value === 'function' ? rule.value(...args) : rule.value;
      return Promise.resolve(value);
    }
  });

  const when = (path) => ({
    resolves(value) { ruleFor(path).fallback = { type: 'resolve', value }; },
    resolvesOnce(value) { ruleFor(path).queue.push({ type: 'resolve', value }); },
    rejects(error) { ruleFor(path).fallback = { type: 'reject', error }; }
  });

  const services = ['gmail', 'drive', 'calendar', 'sheets', 'docs', 'slides', 'forms', 'tasks', 'people', 'chat', 'classroom',
    'admin', 'adminReports', 'groupssettings', 'licensing', 'datatransfer', 'alertcenter', 'chromepolicy', 'cloudidentity',
    'siteVerification', 'vault'];
  const clients = { auth: {}, actingAs };
  for (const name of services) clients[name] = node([name]);

  return { clients, calls, when };
}
