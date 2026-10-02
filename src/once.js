// Cache asynchronous initialization after it succeeds, while allowing a later
// request to retry if initialization fails. This is intentionally process-local:
// Vercel may reuse a warm function instance, but a cold start gets a fresh cache.
export function onceSuccessful(fn) {
  let ready;
  return async (...args) => {
    if (!ready) {
      ready = Promise.resolve().then(() => fn(...args));
      ready.catch(() => {
        ready = undefined;
      });
    }
    return ready;
  };
}
