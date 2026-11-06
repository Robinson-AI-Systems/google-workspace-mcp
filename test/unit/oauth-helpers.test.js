import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { parseBody } from '../../src/oauth/helpers.js';

// A request whose stream must never be read: any listener registration
// is a bug in these cases, because a hosting entrypoint that already
// consumed the body leaves a stream that never emits 'end' again.
function consumedRequest(body, contentType = 'application/x-www-form-urlencoded') {
  return {
    body,
    headers: { 'content-type': contentType },
    on() { throw new Error('stream must not be re-read'); }
  };
}

function streamRequest(chunks, contentType) {
  const req = new EventEmitter();
  req.headers = { 'content-type': contentType };
  queueMicrotask(() => {
    for (const chunk of chunks) req.emit('data', chunk);
    req.emit('end');
  });
  return req;
}

describe('parseBody body-contract handling', () => {
  it('prefers an already-parsed object body without touching the stream', async () => {
    const req = consumedRequest({ client_id: 'abc', response_type: 'code' });
    await expect(parseBody(req)).resolves.toEqual({ client_id: 'abc', response_type: 'code' });
  });

  it('parses an already-read raw form string exactly as the stream path would', async () => {
    const req = consumedRequest('client_id=abc&response_type=code');
    await expect(parseBody(req)).resolves.toEqual({ client_id: 'abc', response_type: 'code' });
  });

  it('parses an already-read raw JSON string', async () => {
    const req = consumedRequest('{"client_id":"abc"}', 'application/json');
    await expect(parseBody(req)).resolves.toEqual({ client_id: 'abc' });
  });

  it('treats an empty pre-parsed body as no fields', async () => {
    await expect(parseBody(consumedRequest(''))).resolves.toEqual({});
    await expect(parseBody(consumedRequest(null))).resolves.toEqual({});
  });

  it('still reads the stream when no entrypoint parsed the body', async () => {
    const form = streamRequest(['client_id=abc&response_type=code'], 'application/x-www-form-urlencoded');
    await expect(parseBody(form)).resolves.toEqual({ client_id: 'abc', response_type: 'code' });
    const json = streamRequest(['{"client_id":"abc"}'], 'application/json');
    await expect(parseBody(json)).resolves.toEqual({ client_id: 'abc' });
    const empty = streamRequest([], 'application/x-www-form-urlencoded');
    await expect(parseBody(empty)).resolves.toEqual({});
  });
});
