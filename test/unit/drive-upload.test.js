import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { makeFakeClients } from '../helpers/fake-google.js';
import { handlers } from '../../src/tools/drive.js';

const readAll = async (stream) => {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
};

describe('drive_upload_file', () => {
  it('hands Google a stream (not a Buffer) that carries exactly the uploaded bytes', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('drive.files.create').resolves({ data: { id: 'f1', name: 'note.txt' } });
    const result = await handlers.drive_upload_file(
      { name: 'note.txt', base64Data: Buffer.from('hello brand kit').toString('base64'), mimeType: 'text/plain', parentFolderId: 'folder1' },
      clients
    );
    const call = calls.find((c) => c.path === 'drive.files.create');
    const { body, mimeType } = call.args[0].media;
    expect(Buffer.isBuffer(body)).toBe(false);
    expect(body).toBeInstanceOf(Readable);
    expect(typeof body.pipe).toBe('function');
    expect(await readAll(body)).toBe('hello brand kit');
    expect(mimeType).toBe('text/plain');
    expect(call.args[0].requestBody).toEqual({ name: 'note.txt', parents: ['folder1'] });
    expect(JSON.parse(result.content[0].text)).toEqual({ id: 'f1', name: 'note.txt' });
  });

  it('defaults to a generic file type and no parent folder', async () => {
    const { clients, calls } = makeFakeClients();
    await handlers.drive_upload_file({ name: 'x.bin', base64Data: Buffer.from([1, 2, 3]).toString('base64') }, clients);
    const arg = calls.find((c) => c.path === 'drive.files.create').args[0];
    expect(arg.media.mimeType).toBe('application/octet-stream');
    expect(arg.requestBody.parents).toBeUndefined();
  });
});
