import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');

const body = (r) => JSON.parse(r.content[0].text);
const READ_ONLY = /\.(get|list|search)[A-Za-z]*$/;
const mutations = (calls) => calls.filter((c) => !READ_ONLY.test(c.path));
const run = async (name, args, setup) => {
  const f = makeFakeClients();
  setup?.(f.when, f);
  const out = body(await registry.handlers[name](args, f.clients));
  return { out, calls: f.calls };
};

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

// Each of these must refuse to do anything until confirm: true.
const NEEDS_CONFIRM = {
  drive_upload_from_url: { url: 'https://example.test/a.pdf?token=secret', name: 'a.pdf' },
  drive_create_drive_label_assignment: { fileId: 'f1', labelId: 'l1' },
  sheets_update_values: { spreadsheetId: 's1', range: 'A1:B2', values: [['a', 'b'], ['c', 'd']] },
  sheets_batch_update_values: { spreadsheetId: 's1', data: [{ range: 'A1', values: [['x']] }] },
  sheets_find_replace: { spreadsheetId: 's1', find: 'old', replacement: 'new' },
  docs_replace_text: { documentId: 'd1', find: 'old', replacement: 'new' },
  slides_replace_all_text: { presentationId: 'p1', find: 'old', replacement: 'new' },
  forms_set_publish_settings: { formId: 'form1', acceptingResponses: true }
};

describe('files tools that need confirm', () => {
  for (const [name, args] of Object.entries(NEEDS_CONFIRM)) {
    it(`${name}: without confirm it asks first, makes no Google change and logs nothing`, async () => {
      const { out, calls } = await run(name, args);
      expect(out).toMatchObject({ done: false, needsConfirmation: true });
      expect(mutations(calls)).toEqual([]);
      expect(await holder.db.listRecentChanges()).toEqual([]);
    });
    it(`${name}: a dry run makes no Google change and says confirm will be needed`, async () => {
      const { out, calls } = await run(name, { ...args, dryRun: true });
      expect(out).toMatchObject({ done: false, dryRun: true });
      expect(out.note).toMatch(/confirm: true/);
      expect(mutations(calls)).toEqual([]);
    });
  }

  it('drive_upload_from_url never repeats the query string of the link (it can hold a token)', async () => {
    const { out } = await run('drive_upload_from_url', NEEDS_CONFIRM.drive_upload_from_url);
    expect(out.summary).toContain('https://example.test/a.pdf');
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('forms_set_publish_settings: only stopping responses goes ahead without confirm; opening them asks', async () => {
    expect((await run('forms_set_publish_settings', { formId: 'f', acceptingResponses: false })).out.done).toBe(true);
    expect((await run('forms_set_publish_settings', { formId: 'f', acceptingResponses: true })).out.needsConfirmation).toBe(true);
  });

  it('long text is summarised, never copied whole, in the description', async () => {
    const { out } = await run('docs_insert_text', { documentId: 'd1', text: 'x'.repeat(5000), dryRun: true });
    expect(out.summary.length).toBeLessThan(300);
    expect(out.summary).toContain('5000 characters');
  });

  it('a dry run of an ordinary tool changes nothing and shows what is there now', async () => {
    const { out, calls } = await run('sheets_append_values', { spreadsheetId: 's1', range: 'A1', values: [['n']], dryRun: true }, (when) => when('sheets.spreadsheets.values.get').resolves({ data: { values: [['h1', 'h2']] } }));
    expect(out).toMatchObject({ done: false, dryRun: true, before: { firstRowsNow: [['h1', 'h2']] } });
    expect(mutations(calls)).toEqual([]);
  });
});

describe('"confirmed" means Google shows what was asked for', () => {
  it('drive_rename_file: confirmed when the name matches, not confirmed (with a warning) when Google still shows the old name', async () => {
    const good = await run('drive_rename_file', { fileId: 'f1', newName: 'New' }, (when) => when('drive.files.get').resolves({ data: { id: 'f1', name: 'New' } }));
    expect(good.out).toMatchObject({ done: true, confirmed: true, after: { name: 'New' } });
    const bad = await run('drive_rename_file', { fileId: 'f1', newName: 'New' }, (when) => when('drive.files.get').resolves({ data: { id: 'f1', name: 'Old' } }));
    expect(bad.out.confirmed).toBe(false);
    expect(bad.out.warning).toMatch(/does not show/);
    expect(bad.calls.some((c) => c.path === 'drive.files.update')).toBe(true);
  });

  it('sheets_update_values: not confirmed when the range holds different values, confirmed when it holds them', async () => {
    const args = { spreadsheetId: 's1', range: 'A1:B1', values: [['a', 5]], confirm: true };
    const bad = await run('sheets_update_values', args, (when) => when('sheets.spreadsheets.values.get').resolves({ data: { values: [['zzz', '5']] } }));
    expect(bad.out.confirmed).toBe(false);
    const good = await run('sheets_update_values', args, (when) => when('sheets.spreadsheets.values.get').resolves({ data: { values: [['a', '5']] } }));
    expect(good.out).toMatchObject({ done: true, confirmed: true });
    const sent = good.calls.find((c) => c.path === 'sheets.spreadsheets.values.update');
    expect(sent.args[0]).toMatchObject({ spreadsheetId: 's1', range: 'A1:B1' });
    expect(JSON.stringify(sent.args)).not.toMatch(/confirm|dryRun/);
  });

  it('sheets_batch_update_values: not confirmed when only one of two ranges holds its values', async () => {
    const { out } = await run('sheets_batch_update_values', { spreadsheetId: 's1', confirm: true, data: [{ range: 'A1', values: [['x']] }, { range: 'B1', values: [['y']] }] }, (when) => {
      when('sheets.spreadsheets.values.get').resolvesOnce({ data: { values: [['old']] } }); // before A1
      when('sheets.spreadsheets.values.get').resolvesOnce({ data: { values: [['old']] } }); // before B1
      when('sheets.spreadsheets.values.get').resolvesOnce({ data: { values: [['x']] } }); // after A1
      when('sheets.spreadsheets.values.get').resolves({ data: { values: [['nope']] } }); // after B1
    });
    expect(out.confirmed).toBe(false);
  });

  it('sheets_find_replace claims nothing it cannot read back (confirmed: null)', async () => {
    const { out, calls } = await run('sheets_find_replace', { spreadsheetId: 's1', find: 'a', replacement: 'b', confirm: true });
    expect(out).toMatchObject({ done: true, confirmed: null });
    expect(calls.some((c) => c.path === 'sheets.spreadsheets.batchUpdate')).toBe(true);
  });

  const doc = (t, end = 20) => ({ data: { body: { content: [{ endIndex: end, paragraph: { elements: [{ textRun: { content: t } }] } }] } } });

  it('docs_replace_text: not confirmed while the old text is still in the document', async () => {
    const args = { documentId: 'd1', find: 'old', replacement: 'new', confirm: true };
    const bad = await run('docs_replace_text', args, (when) => when('docs.documents.get').resolves(doc('old and new\n')));
    expect(bad.out.confirmed).toBe(false);
    const good = await run('docs_replace_text', args, (when) => {
      when('docs.documents.get').resolvesOnce(doc('old text\n'));
      when('docs.documents.get').resolves(doc('new text\n'));
    });
    expect(good.out).toMatchObject({ confirmed: true, before: { matchesNow: 1 }, after: { matchesNow: 0 } });
  });

  it('docs_insert_text: confirmed only when the text is there and the length grew by exactly that much', async () => {
    const good = await run('docs_insert_text', { documentId: 'd1', text: 'hi' }, (when) => { when('docs.documents.get').resolvesOnce(doc('abc\n', 5)); when('docs.documents.get').resolves(doc('hiabc\n', 7)); });
    expect(good.out.confirmed).toBe(true);
    const bad = await run('docs_insert_text', { documentId: 'd1', text: 'hi' }, (when) => when('docs.documents.get').resolves(doc('abc\n', 5)));
    expect(bad.out.confirmed).toBe(false);
  });

  it('drive_move_file: not confirmed when the old folder is still a parent', async () => {
    const args = { fileId: 'f1', newParentFolderId: 'new' };
    const bad = await run('drive_move_file', args, (when) => when('drive.files.get').resolves({ data: { id: 'f1', parents: ['old', 'new'] } }));
    expect(bad.out.confirmed).toBe(false);
    const good = await run('drive_move_file', args, (when) => {
      when('drive.files.get').resolvesOnce({ data: { id: 'f1', parents: ['old'] } }); // before
      when('drive.files.get').resolvesOnce({ data: { parents: ['old'] } }); // the handler's own look
      when('drive.files.get').resolves({ data: { id: 'f1', parents: ['new'] } }); // after
    });
    expect(good.out.confirmed).toBe(true);
  });

  it('drive_star_file and drive_unstar_file check the flag', async () => {
    expect((await run('drive_star_file', { fileId: 'f' }, (when) => when('drive.files.get').resolves({ data: { starred: true } }))).out.confirmed).toBe(true);
    expect((await run('drive_star_file', { fileId: 'f' }, (when) => when('drive.files.get').resolves({ data: {} }))).out.confirmed).toBe(false);
    expect((await run('drive_unstar_file', { fileId: 'f' }, (when) => when('drive.files.get').resolves({ data: {} }))).out.confirmed).toBe(true);
  });

  it('forms_set_publish_settings (confirmed): compared with the publish state Google shows', async () => {
    const args = { formId: 'f', acceptingResponses: true, confirm: true };
    const state = (s) => (when) => when('forms.forms.get').resolves({ data: { publishSettings: { publishState: s } } });
    expect((await run('forms_set_publish_settings', args, state({ isPublished: true, isAcceptingResponses: true }))).out.confirmed).toBe(true);
    expect((await run('forms_set_publish_settings', args, state({ isPublished: true }))).out.confirmed).toBe(false);
  });

  it('drive_create_drive_label_assignment: confirmed only when the label is listed on the file afterwards', async () => {
    const args = { fileId: 'f', labelId: 'lab1', confirm: true };
    expect((await run('drive_create_drive_label_assignment', args, (when) => when('drive.files.listLabels').resolves({ data: { labels: [{ id: 'lab1' }] } }))).out.confirmed).toBe(true);
    expect((await run('drive_create_drive_label_assignment', args, (when) => when('drive.files.listLabels').resolves({ data: { labels: [] } }))).out.confirmed).toBe(false);
  });

  it('forms_add_text_question: the new question is found at the asked position, with the asked settings', async () => {
    const args = { formId: 'f', title: 'Your name?', paragraph: false, required: true };
    const item = { title: 'Your name?', questionItem: { question: { required: true, textQuestion: {} } } };
    const good = await run('forms_add_text_question', args, (when) => { when('forms.forms.get').resolvesOnce({ data: { items: [] } }); when('forms.forms.get').resolves({ data: { items: [item] } }); });
    expect(good.out.confirmed).toBe(true);
    const bad = await run('forms_add_text_question', args, (when) => when('forms.forms.get').resolves({ data: { items: [] } }));
    expect(bad.out.confirmed).toBe(false);
  });

  it('slides_create_slide: confirmed when the new slide id is in the deck and the count went up by one', async () => {
    const { out } = await run('slides_create_slide', { presentationId: 'p1' }, (when) => {
      when('slides.presentations.get').resolvesOnce({ data: { slides: [{ objectId: 'a' }] } });
      when('slides.presentations.batchUpdate').resolves({ data: { replies: [{ createSlide: { objectId: 'new1' } }] } });
      when('slides.presentations.get').resolves({ data: { slides: [{ objectId: 'a' }, { objectId: 'new1' }] } });
    });
    expect(out).toMatchObject({ confirmed: true, after: { newSlideId: 'new1', slides: 2 } });
  });

  it('sheets_add_conditional_formatting: confirmed only when one more rule exists on the right range', async () => {
    const args = { spreadsheetId: 's', sheetId: 3, startRow: 0, endRow: 5, startColumn: 1, endColumn: 2, condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '1' }] } };
    const sheet = (rules) => ({ data: { sheets: [{ properties: { sheetId: 3 }, conditionalFormats: rules }] } });
    const rule = { ranges: [{ sheetId: 3, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 }] };
    expect((await run('sheets_add_conditional_formatting', args, (when) => { when('sheets.spreadsheets.get').resolvesOnce(sheet([])); when('sheets.spreadsheets.get').resolves(sheet([rule])); })).out.confirmed).toBe(true);
    expect((await run('sheets_add_conditional_formatting', args, (when) => when('sheets.spreadsheets.get').resolves(sheet([])))).out.confirmed).toBe(false);
  });
});

describe('creating things: the new item is read back by the id Google returned', () => {
  it('drive_create_folder reads the new folder by its id', async () => {
    const { out, calls } = await run('drive_create_folder', { name: 'Reports', parentFolderId: 'root1' }, (when) => {
      when('drive.files.create').resolves({ data: { id: 'new1', name: 'Reports' } });
      when('drive.files.get').resolves({ data: { id: 'new1', name: 'Reports', mimeType: 'application/vnd.google-apps.folder', parents: ['root1'] } });
    });
    expect(out).toMatchObject({ done: true, confirmed: true, after: { id: 'new1', name: 'Reports' }, details: { id: 'new1' } });
    expect(calls.find((c) => c.path === 'drive.files.get').args[0].fileId).toBe('new1');
  });

  it('drive_create_folder: a folder that Google shows with another name is not confirmed', async () => {
    const { out } = await run('drive_create_folder', { name: 'Reports' }, (when) => {
      when('drive.files.create').resolves({ data: { id: 'new1' } });
      when('drive.files.get').resolves({ data: { id: 'new1', name: 'Other', mimeType: 'application/vnd.google-apps.folder' } });
    });
    expect(out.confirmed).toBe(false);
  });

  it('a create whose reply has no id cannot be read back, so it is not confirmed', async () => {
    const { out } = await run('drive_create_doc', { name: 'Notes' }, (when) => when('drive.files.create').resolves({ data: {} }));
    expect(out).toMatchObject({ done: true, confirmed: false });
    expect(out.after.unreadable).toMatch(/did not return the id/);
  });

  it('drive_create_shortcut checks what the shortcut points at', async () => {
    const mk = (target) => (when) => { when('drive.files.create').resolves({ data: { id: 's1' } }); when('drive.files.get').resolves({ data: { id: 's1', name: 'Link', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: target } } }); };
    expect((await run('drive_create_shortcut', { targetFileId: 't1', name: 'Link' }, mk('t1'))).out.confirmed).toBe(true);
    expect((await run('drive_create_shortcut', { targetFileId: 't1', name: 'Link' }, mk('other'))).out.confirmed).toBe(false);
  });

  it('drive_upload_file checks the size that arrived', async () => {
    const b64 = Buffer.from('hello').toString('base64');
    const mk = (size) => (when) => { when('drive.files.create').resolves({ data: { id: 'u1' } }); when('drive.files.get').resolves({ data: { id: 'u1', name: 'h.txt', size } }); };
    expect((await run('drive_upload_file', { name: 'h.txt', base64Data: b64 }, mk('5'))).out.confirmed).toBe(true);
    expect((await run('drive_upload_file', { name: 'h.txt', base64Data: b64 }, mk('9'))).out.confirmed).toBe(false);
  });

  it('sheets_create_spreadsheet reads back the title and tabs', async () => {
    const { out } = await run('sheets_create_spreadsheet', { title: 'Budget', sheetTitles: ['Q1', 'Q2'] }, (when) => {
      when('sheets.spreadsheets.create').resolves({ data: { spreadsheetId: 'sp1' } });
      when('sheets.spreadsheets.get').resolves({ data: { spreadsheetId: 'sp1', properties: { title: 'Budget' }, sheets: [{ properties: { title: 'Q1' } }, { properties: { title: 'Q2' } }] } });
    });
    expect(out).toMatchObject({ confirmed: true, after: { spreadsheetId: 'sp1', title: 'Budget', tabs: ['Q1', 'Q2'] } });
  });

  it('docs_create_document, slides_create_presentation and forms_create read the new item back by id', async () => {
    const d = await run('docs_create_document', { title: 'Plan' }, (when) => { when('docs.documents.create').resolves({ data: { documentId: 'doc1' } }); when('docs.documents.get').resolves({ data: { documentId: 'doc1', title: 'Plan' } }); });
    expect(d.out).toMatchObject({ confirmed: true, after: { documentId: 'doc1' } });
    expect(d.calls.find((c) => c.path === 'docs.documents.get').args[0].documentId).toBe('doc1');
    const p = await run('slides_create_presentation', { title: 'Deck' }, (when) => { when('slides.presentations.create').resolves({ data: { presentationId: 'pr1' } }); when('slides.presentations.get').resolves({ data: { presentationId: 'pr1', title: 'Deck' } }); });
    expect(p.out).toMatchObject({ confirmed: true, after: { presentationId: 'pr1' } });
    const f = await run('forms_create', { title: 'Survey' }, (when) => { when('forms.forms.create').resolves({ data: { formId: 'fm1' } }); when('forms.forms.get').resolves({ data: { formId: 'fm1', info: { title: 'Survey', documentTitle: 'Survey' } } }); });
    expect(f.out).toMatchObject({ confirmed: true, after: { formId: 'fm1', title: 'Survey' } });
    const wrong = await run('forms_create', { title: 'Survey' }, (when) => { when('forms.forms.create').resolves({ data: { formId: 'fm1' } }); when('forms.forms.get').resolves({ data: { formId: 'fm1', info: { title: 'Different' } } }); });
    expect(wrong.out.confirmed).toBe(false);
  });

  it('slides_create_textbox finds the new text box on its slide by the object id the handler returns', async () => {
    const page = (elements) => (when) => when('slides.presentations.pages.get').resolves({ data: { pageElements: elements } });
    const box = (id) => ({ objectId: id, shape: { shapeType: 'TEXT_BOX', text: { textElements: [{ textRun: { content: 'Hello\n' } }] } } });
    const args = { presentationId: 'p1', pageObjectId: 'pg1', text: 'Hello' };
    expect((await run('slides_create_textbox', args, page([]))).out.confirmed).toBe(false); // an empty slide does not show the box
    // the handler names the box from the clock, so pin the clock
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1234);
    try {
      const good = await run('slides_create_textbox', args, page([box('textbox_1234')]));
      expect(good.out).toMatchObject({ confirmed: true, after: { objectId: 'textbox_1234', onSlide: true, shapeType: 'TEXT_BOX' } });
    } finally { clock.mockRestore(); }
  });
});
