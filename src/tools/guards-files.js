// Safety table, part: Drive, Sheets, Docs, Slides, Forms.
// Same entry shape as guards.js (describe / before / after / destructive / confirmWhen / verify); see write.js.
//
// Rules used here:
//   - Creating things and adding content is reversible: preview + read back, no confirm.
//   - Anything that OVERWRITES cells, replaces text across a whole file, fetches from an outside address,
//     applies a compliance label or opens a form to the public needs confirm: true.
//   - describe() never carries full text or secrets: only lengths and short excerpts.
//   - after() asks Google again; verify() compares that with what was asked for. When nothing can be read back
//     (a find-and-replace on a sheet), the tool has no after(), so it never claims "confirmed".
import { pick, data, D } from './guard-helpers.js';

// ---------- small helpers ----------
const str = (v) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const excerpt = (s, n = 40) => { const t = str(s).replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}...` : t; };
const quoted = (s) => `"${excerpt(s)}" (${str(s).length} characters)`;
/** An address without its query string or credentials, so a token in the link is never repeated back. */
const safeUrl = (u) => { try { const x = new URL(String(u)); return `${x.protocol}//${x.host}${x.pathname}`.slice(0, 200); } catch { return excerpt(u, 60); } };
const bytesOfBase64 = (b64) => Math.floor((str(b64).replace(/=+$/, '').length * 3) / 4);
const rowsOf = (values) => (Array.isArray(values) ? values : []).map((r) => (Array.isArray(r) ? r : [r]));
const countCells = (values) => rowsOf(values).reduce((n, r) => n + r.length, 0);
const needle = (text, find, matchCase) => (matchCase ? str(text).includes(str(find)) : str(text).toLowerCase().includes(str(find).toLowerCase()));
const occurrences = (text, find, matchCase) => {
  const f = matchCase ? str(find) : str(find).toLowerCase();
  const t = matchCase ? str(text) : str(text).toLowerCase();
  if (!f) return 0;
  let n = 0; let at = t.indexOf(f);
  while (at !== -1) { n += 1; at = t.indexOf(f, at + f.length); }
  return n;
};
/** Every piece of text in a Docs/Slides JSON tree, in order. */
const collectText = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((n) => collectText(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node.textRun?.content === 'string') out.push(node.textRun.content);
    for (const v of Object.values(node)) if (v && typeof v === 'object') collectText(v, out);
  }
  return out;
};
const bodyLength = (doc) => { const c = doc?.body?.content || []; return c.length ? c[c.length - 1].endIndex : undefined; };
const countWhere = (list, test) => (Array.isArray(list) ? list.filter(test).length : 0);

/** After creating something: read it back by the id Google returned. Without an id nothing can be read back, which is reported as not confirmed. */
const createdId = (details, ...keys) => {
  for (const k of keys) if (details && typeof details[k] === 'string' && details[k]) return details[k];
  throw new Error('Google did not return the id of the new item, so it could not be read back');
};

// ---------- Drive ----------
const FILE_FIELDS = 'id,name,mimeType,parents,starred,trashed,size,webViewLink,shortcutDetails';
const driveFile = (drive, fileId, fields = FILE_FIELDS) => data(drive.files.get({ fileId, fields, supportsAllDrives: true }));
const parentsOf = (a) => (a.parentFolderId ? [a.parentFolderId] : undefined);
const inParent = (a, after) => !a.parentFolderId || (after?.parents || []).includes(a.parentFolderId);

const driveCreate = (kind, mime) => ({
  describe: (a) => ({ target: a.name, summary: `Create a new ${kind} named ${quoted(a.name)}${a.parentFolderId ? ` in the folder ${a.parentFolderId}` : ' in My Drive'}` }),
  after: (a, { drive }, details) => driveFile(drive, createdId(details, 'id')),
  verify: (a, b, after) => after?.name === a.name && after?.mimeType === mime && inParent(a, after)
});

const driveFlag = (word, flag) => ({
  describe: (a) => ({ target: a.fileId, summary: `${word} the Drive file ${a.fileId}` }),
  before: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,starred'),
  after: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,starred'),
  verify: (a, b, after) => !!after?.starred === flag
});

// ---------- Sheets ----------
const sheetValues = async (sheets, spreadsheetId, range) => (await data(sheets.spreadsheets.values.get({ spreadsheetId, range }))).values || [];
/** Google returns what a cell shows, so compare by what a person would see. A formula cannot be compared (it shows its result). */
const sameCell = (wanted, got) => {
  const w = str(wanted).trim(); const g = str(got).trim();
  if (w.startsWith('=')) return true;
  if (w === g) return true;
  return w !== '' && g !== '' && !Number.isNaN(Number(w)) && !Number.isNaN(Number(g)) && Number(w) === Number(g);
};
const valuesMatch = (wanted, got) => rowsOf(wanted).every((row, r) => row.every((cell, c) => sameCell(cell, got?.[r]?.[c])));
const firstRows = (values) => (values || []).slice(0, 5);
const rangeItems = (a) => (Array.isArray(a.data) ? a.data : []).filter((d) => d && typeof d.range === 'string').slice(0, 20);

const sheetTabs = async (sheets, spreadsheetId) => ((await data(sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' }))).sheets || []).map((s) => ({ sheetId: s.properties?.sheetId, title: s.properties?.title }));

// ---------- Docs / Slides ----------
const docInfo = async (docs, documentId) => {
  const doc = await data(docs.documents.get({ documentId }));
  return { doc, length: bodyLength(doc), tables: countWhere(doc.body?.content, (e) => e.table), images: Object.keys(doc.inlineObjects || {}).length, text: collectText(doc.body?.content).join('') };
};
const slideTexts = (pres) => collectText((pres.slides || []).map((s) => s.pageElements || [])).join('');
const findElement = (nodes, objectId) => {
  for (const el of nodes || []) {
    if (el.objectId === objectId) return el;
    const inner = findElement(el.elementGroup?.children, objectId);
    if (inner) return inner;
  }
  return undefined;
};
const elementOnSlides = (pres, objectId) => { for (const s of pres.slides || []) { const e = findElement(s.pageElements, objectId); if (e) return e; } return undefined; };
const elementText = (el) => collectText(el?.shape?.text).join('');
const sameShapeText = (got, wanted) => str(got).replace(/\n$/, '') === str(wanted).replace(/\n$/, ''); // Slides adds a closing line break
const presentation = (slides, presentationId) => data(slides.presentations.get({ presentationId }));
const onSlide = async (slides, a, details) => {
  const objectId = createdId(details, 'objectId');
  const page = await data(slides.presentations.pages.get({ presentationId: a.presentationId, pageObjectId: a.pageObjectId }));
  const el = findElement(page.pageElements, objectId);
  return { objectId, onSlide: !!el, shapeType: el?.shape?.shapeType, hasImage: !!el?.image, text: excerpt(elementText(el), 60) };
};

// ---------- Forms ----------
const formItems = async (forms, formId) => { const f = await data(forms.forms.get({ formId })); return { form: f, items: f.items || [] }; };
const itemSummary = (item) => item && ({ title: item.title, required: !!item.questionItem?.question?.required, type: item.questionItem?.question?.textQuestion ? (item.questionItem.question.textQuestion.paragraph ? 'PARAGRAPH' : 'SHORT_ANSWER') : item.questionItem?.question?.choiceQuestion?.type, options: (item.questionItem?.question?.choiceQuestion?.options || []).map((o) => o.value) });
const questionAfter = async (a, { forms }) => {
  const { items } = await formItems(forms, a.formId);
  return { itemCount: items.length, item: itemSummary(items[a.index || 0]) };
};
const questionBefore = async (a, { forms }) => ({ itemCount: (await formItems(forms, a.formId)).items.length });
const addedOne = (a, before, after) => typeof before?.itemCount !== 'number' || after?.itemCount === before.itemCount + 1;


// ---------- helpers for the Sheets layout tools ----------
const colLetter = (i) => { let n = Number(i) + 1; let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const blockText = (a) => `rows ${Number(a.startRow) + 1}-${a.endRow}, columns ${colLetter(a.startColumn)}-${colLetter(Number(a.endColumn) - 1)}`;
const sheetsOf = async (sheets, spreadsheetId, fields) => (await data(sheets.spreadsheets.get({ spreadsheetId, fields }))).sheets || [];
const tabList = async (sheets, spreadsheetId) => { const tabs = await sheetsOf(sheets, spreadsheetId, 'sheets(properties(sheetId,title))'); return { count: tabs.length, titles: tabs.map((t) => t.properties?.title) }; };
const tabInfo = async (sheets, a) => (await sheetsOf(sheets, a.spreadsheetId, 'sheets(properties(sheetId,title,gridProperties),merges,protectedRanges)')).find((t) => t.properties?.sheetId === a.sheetId) || {};
const tabProps = async (sheets, a) => pick((await tabInfo(sheets, a)).properties?.gridProperties || {}, ['frozenRowCount', 'frozenColumnCount']);
const tabMerges = async (sheets, a) => (await tabInfo(sheets, a)).merges || [];
const blockValues = async (sheets, a) => {
  const title = (await tabInfo(sheets, a)).properties?.title;
  if (!title) return [];
  const range = `'${String(title).replace(/'/g, "''")}'!${colLetter(a.startColumn)}${Number(a.startRow) + 1}:${colLetter(Number(a.endColumn) - 1)}${a.endRow}`;
  return (await data(sheets.spreadsheets.values.get({ spreadsheetId: a.spreadsheetId, range, valueRenderOption: 'UNFORMATTED_VALUE' }))).values || [];
};
const cornerFormat = async (sheets, a) => {
  const title = (await tabInfo(sheets, a)).properties?.title;
  if (!title) return { note: 'That tab was not found.' };
  const cell = `'${String(title).replace(/'/g, "''")}'!${colLetter(a.startColumn)}${Number(a.startRow) + 1}`;
  const r = await data(sheets.spreadsheets.get({ spreadsheetId: a.spreadsheetId, ranges: [cell], fields: 'sheets(data(rowData(values(userEnteredFormat))))' }));
  return { format: r.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.userEnteredFormat || {} };
};
/** true when every field in `want` is present with the same value in `got` (Google drops fields it holds as false/default). */
function coversDeep(got, want) {
  if (want && typeof want === 'object' && !Array.isArray(want)) return Object.entries(want).every(([k, v]) => coversDeep(got?.[k], v));
  if (typeof want === 'number' && (typeof got === 'number' || got === undefined)) return Math.abs(want - (got ?? 0)) < 0.001; // Google leaves out a 0 colour channel
  if (typeof want === 'boolean') return !!got === want;
  return JSON.stringify(got) === JSON.stringify(want);
}
const sameBlock = (r, a) => (r?.sheetId ?? 0) === a.sheetId && (r?.startRowIndex ?? 0) === a.startRow && r?.endRowIndex === a.endRow && (r?.startColumnIndex ?? 0) === a.startColumn && r?.endColumnIndex === a.endColumn;
const cellMerged = (merges, r, c) => (merges || []).some((m) => (m.startRowIndex ?? 0) <= r && r < m.endRowIndex && (m.startColumnIndex ?? 0) <= c && c < m.endColumnIndex);
const mergeCovers = (merges, a) => {
  // every cell of the block must sit inside some merge (MERGE_COLUMNS / MERGE_ROWS make one merge per column / row)
  if ((a.endRow - a.startRow) * (a.endColumn - a.startColumn) > 20000) return (merges || []).some((m) => (m.startRowIndex ?? 0) <= a.startRow && m.endRowIndex >= a.endRow && (m.startColumnIndex ?? 0) <= a.startColumn && m.endColumnIndex >= a.endColumn);
  for (let r = a.startRow; r < a.endRow; r += 1) for (let c = a.startColumn; c < a.endColumn; c += 1) if (!cellMerged(merges, r, c)) return false;
  return true;
};
const mergesTouch = (merges, a) => (merges || []).some((m) => (m.startRowIndex ?? 0) < a.endRow && m.endRowIndex > a.startRow && (m.startColumnIndex ?? 0) < a.endColumn && m.endColumnIndex > a.startColumn);
// Sheets orders numbers, then text, then true/false, and always puts blanks last. Compared the way Sheets does it.
const rank = (v) => (v === '' || v === undefined || v === null ? 9 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
const order = (x, y) => (rank(x) !== rank(y) ? rank(x) - rank(y) : typeof x === 'number' ? x - y : typeof x === 'string' ? x.toLowerCase().localeCompare(y.toLowerCase()) : Number(x) - Number(y));
const isSorted = (rows, a) => {
  const col = Number(a.sortColumnIndex) - Number(a.startColumn);
  if (!(col >= 0 && col < Number(a.endColumn) - Number(a.startColumn))) return false; // the sort column is not inside the block: nothing to check it against
  const vals = rows.map((r) => r[col]);
  return vals.every((v, i) => {
    if (i === 0) return true;
    const p = vals[i - 1];
    if (rank(v) === 9 || rank(p) === 9) return !(rank(p) === 9 && rank(v) !== 9); // blanks last, whichever direction
    return a.ascending === false ? order(p, v) >= 0 : order(p, v) <= 0;
  });
};

export const GUARDS_FILES = {
  // ---------- Drive: creating ----------
  drive_upload_file: { destructive: false,
    describe: (a) => ({ target: a.name, summary: `Upload a new file named ${quoted(a.name)} (${bytesOfBase64(a.base64Data)} bytes, ${a.mimeType || 'application/octet-stream'})${a.parentFolderId ? ` into the folder ${a.parentFolderId}` : ' into My Drive'}` }),
    after: (a, { drive }, details) => driveFile(drive, createdId(details, 'id')),
    verify: (a, b, after) => after?.name === a.name && inParent(a, after) && (after?.size === undefined || Number(after.size) === bytesOfBase64(a.base64Data)) },
  drive_upload_from_url: { destructive: false,
    // The server itself goes and fetches an outside address, so a person confirms first.
    confirmWhen: () => true,
    describe: (a) => ({ target: a.name, summary: `FETCH ${safeUrl(a.url)} from the internet and save it in Drive as ${quoted(a.name)}${a.parentFolderId ? ` in the folder ${a.parentFolderId}` : ' in My Drive'} (nothing is overwritten)` }),
    after: (a, { drive }, details) => driveFile(drive, createdId(details, 'id')),
    verify: (a, b, after) => after?.name === a.name && inParent(a, after) },
  drive_create_folder: { destructive: false, ...driveCreate('folder', 'application/vnd.google-apps.folder') },
  drive_create_doc: { destructive: false, ...driveCreate('Google Doc', 'application/vnd.google-apps.document') },
  drive_create_spreadsheet: { destructive: false, ...driveCreate('Google Sheet', 'application/vnd.google-apps.spreadsheet') },
  drive_create_shortcut: { destructive: false,
    describe: (a) => ({ target: a.name, summary: `Create a shortcut named ${quoted(a.name)} pointing at ${a.targetFileId}${a.parentFolderId ? ` in the folder ${a.parentFolderId}` : ' in My Drive'}` }),
    before: (a, { drive }) => driveFile(drive, a.targetFileId, 'id,name,mimeType'),
    after: (a, { drive }, details) => driveFile(drive, createdId(details, 'id')),
    verify: (a, b, after) => after?.name === a.name && after?.mimeType === 'application/vnd.google-apps.shortcut' && after?.shortcutDetails?.targetId === a.targetFileId && inParent(a, after) },
  drive_copy_file: { destructive: false,
    describe: (a) => ({ target: a.fileId, summary: `Copy the Drive file ${a.fileId}${a.name ? ` as ${quoted(a.name)}` : ''}${a.parentFolderId ? ` into the folder ${a.parentFolderId}` : ''}` }),
    before: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,mimeType,parents'),
    after: (a, { drive }, details) => driveFile(drive, createdId(details, 'id')),
    verify: (a, before, after) => !!after?.id && after.id !== a.fileId && (!a.name || after.name === a.name) && inParent(a, after) },

  // ---------- Drive: changing existing files ----------
  drive_rename_file: { destructive: false,
    describe: (a) => ({ target: a.fileId, summary: `Rename the Drive file ${a.fileId} to ${quoted(a.newName)}` }),
    before: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,mimeType'),
    after: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,mimeType'),
    verify: (a, b, after) => after?.name === a.newName },
  // Moving changes which folder (and so which inherited sharing) the file sits under. That cannot be judged from the arguments alone,
  // so it is previewed with the current location and checked afterwards instead of asking every time.
  drive_move_file: { destructive: false,
    describe: (a) => ({ target: a.fileId, summary: `Move the Drive file ${a.fileId} into the folder ${a.newParentFolderId}${a.removeFromCurrentParents === false ? ' (it also stays in its current folders)' : ' (taking it out of its current folders; it may pick up that folder\'s sharing)'}` }),
    before: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,parents'),
    after: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,parents'),
    verify: (a, before, after) => {
      const now = after?.parents || [];
      if (!now.includes(a.newParentFolderId)) return false;
      if (a.removeFromCurrentParents === false) return true;
      return !(before?.parents || []).some((p) => p !== a.newParentFolderId && now.includes(p));
    } },
  drive_restore_from_trash: { destructive: false,
    describe: (a) => ({ target: a.fileId, summary: `Restore the Drive file ${a.fileId} from the trash` }),
    before: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,trashed'),
    after: (a, { drive }) => driveFile(drive, a.fileId, 'id,name,trashed'),
    verify: (a, b, after) => !after?.trashed },
  drive_star_file: { destructive: false, ...driveFlag('Star', true) },
  drive_unstar_file: { destructive: false, ...driveFlag('Remove the star from', false) },
  drive_create_drive_label_assignment: { destructive: D, // classification / compliance tagging can change who may see or share the file
    describe: (a) => ({ target: a.fileId, summary: `Apply the Drive Label ${a.labelId} to the file ${a.fileId}${a.fieldValues && typeof a.fieldValues === 'object' ? ` (setting ${Object.keys(a.fieldValues).length} label field(s))` : ''}; labels can change who may see or share it` }),
    before: async (a, { drive }) => ({ labels: ((await data(drive.files.listLabels({ fileId: a.fileId }))).labels || []).map((l) => l.id) }),
    after: async (a, { drive }) => ({ labels: ((await data(drive.files.listLabels({ fileId: a.fileId }))).labels || []).map((l) => l.id) }),
    verify: (a, b, after) => (after?.labels || []).includes(a.labelId) },

  // ---------- Sheets ----------
  sheets_create_spreadsheet: { destructive: false,
    describe: (a) => ({ target: a.title, summary: `Create a new Google Sheet titled ${quoted(a.title)}${Array.isArray(a.sheetTitles) && a.sheetTitles.length ? ` with the tabs ${a.sheetTitles.map((t) => excerpt(t, 30)).join(', ')}` : ''}` }),
    after: async (a, { sheets }, details) => {
      const sheet = await data(sheets.spreadsheets.get({ spreadsheetId: createdId(details, 'spreadsheetId'), fields: 'spreadsheetId,properties.title,sheets.properties.title' }));
      return { spreadsheetId: sheet.spreadsheetId, title: sheet.properties?.title, tabs: (sheet.sheets || []).map((s) => s.properties?.title) };
    },
    verify: (a, b, after) => after?.title === a.title && (Array.isArray(a.sheetTitles) ? a.sheetTitles : []).every((t) => (after?.tabs || []).includes(t)) },
  // The handler always writes over whatever is in the range, and the arguments cannot show whether the cells are empty: so it asks first.
  sheets_update_values: { destructive: D,
    describe: (a) => ({ target: `${a.spreadsheetId} ${a.range}`, summary: `OVERWRITE ${a.range} in spreadsheet ${a.spreadsheetId} with ${rowsOf(a.values).length} row(s), ${countCells(a.values)} cell(s) (anything already there is replaced)` }),
    before: async (a, { sheets }) => ({ firstRowsNow: firstRows(await sheetValues(sheets, a.spreadsheetId, a.range)) }),
    after: async (a, { sheets }) => { const v = await sheetValues(sheets, a.spreadsheetId, a.range); return { rows: v.length, firstRows: firstRows(v), holdsRequestedValues: valuesMatch(a.values, v) }; },
    verify: (a, b, after) => after?.holdsRequestedValues === true },
  sheets_batch_update_values: { destructive: D,
    describe: (a) => ({ target: a.spreadsheetId, summary: `OVERWRITE ${rangeItems(a).length} range(s) in spreadsheet ${a.spreadsheetId}: ${rangeItems(a).map((d) => d.range).slice(0, 5).join(', ')} (anything already there is replaced)` }),
    before: async (a, { sheets }) => ({ ranges: await Promise.all(rangeItems(a).map(async (d) => ({ range: d.range, firstRowsNow: firstRows(await sheetValues(sheets, a.spreadsheetId, d.range)) }))) }),
    after: async (a, { sheets }) => {
      const ranges = await Promise.all(rangeItems(a).map(async (d) => { const v = await sheetValues(sheets, a.spreadsheetId, d.range); return { range: d.range, rows: v.length, firstRows: firstRows(v), holdsRequestedValues: valuesMatch(d.values, v) }; }));
      return { ranges };
    },
    verify: (a, b, after) => (after?.ranges || []).length > 0 && after.ranges.every((r) => r.holdsRequestedValues === true) },
  sheets_append_values: { destructive: false,
    describe: (a) => ({ target: `${a.spreadsheetId} ${a.range}`, summary: `Append ${rowsOf(a.values).length} row(s), ${countCells(a.values)} cell(s), after the last row of ${a.range} in spreadsheet ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => ({ firstRowsNow: firstRows(await sheetValues(sheets, a.spreadsheetId, a.range)) }),
    after: async (a, { sheets }, details) => {
      const where = details?.updates?.updatedRange;
      if (!where) throw new Error('Google did not say where the rows were added, so they could not be read back');
      const v = await sheetValues(sheets, a.spreadsheetId, where);
      return { updatedRange: where, rows: v.length, firstRows: firstRows(v), holdsRequestedValues: valuesMatch(a.values, v) };
    },
    verify: (a, b, after) => after?.holdsRequestedValues === true },
  // Counting matches without reading the whole spreadsheet is not possible and a read-back of "the text is gone" cannot be told apart
  // from "it was never there", so there is no after(): the result will say it was not confirmed by a read-back. Always asks first.
  sheets_find_replace: { destructive: D,
    describe: (a) => ({ target: a.spreadsheetId, summary: `REPLACE every ${a.matchCase ? 'case-matching ' : ''}"${excerpt(a.find)}" with "${excerpt(a.replacement)}" ${a.sheetId === undefined ? 'across ALL tabs' : `on the tab ${a.sheetId}`} of spreadsheet ${a.spreadsheetId}` }) },
  sheets_add_sheet: { destructive: false,
    describe: (a) => ({ target: a.spreadsheetId, summary: `Add a tab named ${quoted(a.title)} to spreadsheet ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => ({ tabs: (await sheetTabs(sheets, a.spreadsheetId)).map((t) => t.title) }),
    after: async (a, { sheets }) => ({ tabs: (await sheetTabs(sheets, a.spreadsheetId)).map((t) => t.title) }),
    verify: (a, b, after) => (after?.tabs || []).includes(a.title) },
  sheets_copy_to_spreadsheet: { destructive: false,
    describe: (a) => ({ target: a.destinationSpreadsheetId, summary: `Copy the tab ${a.sheetId} of spreadsheet ${a.spreadsheetId} into spreadsheet ${a.destinationSpreadsheetId}` }),
    before: async (a, { sheets }) => ({ tabsInDestination: (await sheetTabs(sheets, a.destinationSpreadsheetId)).length }),
    after: async (a, { sheets }, details) => {
      const tabs = await sheetTabs(sheets, a.destinationSpreadsheetId);
      return { tabsInDestination: tabs.length, newTab: tabs.find((t) => details?.sheetId !== undefined && t.sheetId === details.sheetId) };
    },
    verify: (a, b, after) => !!after?.newTab },
  sheets_add_conditional_formatting: { destructive: false,
    describe: (a) => ({ target: `${a.spreadsheetId} tab ${a.sheetId}`, summary: `Add a conditional-formatting rule to rows ${a.startRow}-${a.endRow}, columns ${a.startColumn}-${a.endColumn} of tab ${a.sheetId} in spreadsheet ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => {
      const s = (await data(sheets.spreadsheets.get({ spreadsheetId: a.spreadsheetId, fields: 'sheets(properties.sheetId,conditionalFormats)' }))).sheets?.find((x) => x.properties?.sheetId === a.sheetId);
      return { rules: (s?.conditionalFormats || []).length };
    },
    after: async (a, { sheets }) => {
      const s = (await data(sheets.spreadsheets.get({ spreadsheetId: a.spreadsheetId, fields: 'sheets(properties.sheetId,conditionalFormats)' }))).sheets?.find((x) => x.properties?.sheetId === a.sheetId);
      const rules = s?.conditionalFormats || [];
      return { rules: rules.length, newestRange: rules[0]?.ranges?.[0] };
    },
    verify: (a, before, after) => {
      const r = after?.newestRange;
      const there = !!r && (r.startRowIndex ?? 0) === a.startRow && (r.endRowIndex ?? 0) === a.endRow && (r.startColumnIndex ?? 0) === a.startColumn && (r.endColumnIndex ?? 0) === a.endColumn;
      return there && (typeof before?.rules !== 'number' || after.rules === before.rules + 1);
    } },

  // ---------- Docs ----------
  docs_create_document: { destructive: false,
    describe: (a) => ({ target: a.title, summary: `Create a new Google Doc titled ${quoted(a.title)}` }),
    after: async (a, { docs }, details) => pick(await data(docs.documents.get({ documentId: createdId(details, 'documentId') })), ['documentId', 'title']),
    verify: (a, b, after) => after?.title === a.title },
  docs_insert_text: { destructive: false,
    describe: (a) => ({ target: a.documentId, summary: `Insert ${quoted(a.text)} at position ${a.index ?? 1} of the Google Doc ${a.documentId}` }),
    before: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { length: i.length }; },
    after: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { length: i.length, textPresent: i.text.includes(str(a.text)) }; },
    verify: (a, before, after) => after?.textPresent === true && typeof after.length === 'number' && (typeof before?.length !== 'number' || after.length === before.length + str(a.text).length) },
  docs_append_paragraph: { destructive: false,
    describe: (a) => ({ target: a.documentId, summary: `Append a paragraph ${quoted(a.text)} to the end of the Google Doc ${a.documentId}` }),
    before: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { length: i.length }; },
    after: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { length: i.length, textPresent: i.text.includes(str(a.text)), endsWithText: i.text.trimEnd().endsWith(str(a.text).trimEnd()) }; },
    verify: (a, before, after) => after?.endsWithText === true && (typeof before?.length !== 'number' || after.length === before.length + str(a.text).length + 1) },
  docs_replace_text: { destructive: D, // changes every match in the document at once
    describe: (a) => ({ target: a.documentId, summary: `REPLACE every ${a.matchCase ? 'case-matching ' : ''}"${excerpt(a.find)}" with "${excerpt(a.replacement)}" throughout the Google Doc ${a.documentId}` }),
    before: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { length: i.length, matchesNow: occurrences(i.text, a.find, a.matchCase) }; },
    after: async (a, { docs }) => {
      const i = await docInfo(docs, a.documentId);
      return { length: i.length, matchesNow: occurrences(i.text, a.find, a.matchCase), replacementPresent: str(a.replacement) === '' || i.text.includes(str(a.replacement)) };
    },
    verify: (a, before, after) => after?.replacementPresent === true && (str(a.replacement).toLowerCase().includes(str(a.find).toLowerCase()) || after.matchesNow === 0) },
  docs_insert_table: { destructive: false,
    describe: (a) => ({ target: a.documentId, summary: `Insert a ${a.rows} x ${a.columns} table at position ${a.index} of the Google Doc ${a.documentId}` }),
    before: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { tables: i.tables, length: i.length }; },
    after: async (a, { docs }) => { const i = await docInfo(docs, a.documentId); return { tables: i.tables, length: i.length }; },
    verify: (a, before, after) => typeof before?.tables === 'number' && after?.tables === before.tables + 1 },
  docs_insert_image: { destructive: false,
    describe: (a) => ({ target: a.documentId, summary: `Insert the image ${safeUrl(a.imageUrl)} at position ${a.index} of the Google Doc ${a.documentId}${a.width ? ` (${a.width} x ${a.height || a.width} pt)` : ''}` }),
    before: async (a, { docs }) => ({ images: (await docInfo(docs, a.documentId)).images }),
    after: async (a, { docs }) => ({ images: (await docInfo(docs, a.documentId)).images }),
    verify: (a, before, after) => typeof before?.images === 'number' && after?.images === before.images + 1 },
  docs_create_named_range: { destructive: false,
    describe: (a) => ({ target: a.documentId, summary: `Name the range ${a.startIndex}-${a.endIndex} of the Google Doc ${a.documentId} as ${quoted(a.name)}` }),
    before: async (a, { docs }) => ({ namedRanges: Object.keys((await docInfo(docs, a.documentId)).doc.namedRanges || {}) }),
    after: async (a, { docs }) => ({ namedRanges: Object.keys((await docInfo(docs, a.documentId)).doc.namedRanges || {}) }),
    verify: (a, b, after) => (after?.namedRanges || []).includes(a.name) },

  // ---------- Slides ----------
  slides_create_presentation: { destructive: false,
    describe: (a) => ({ target: a.title, summary: `Create a new Google Slides presentation titled ${quoted(a.title)}` }),
    after: async (a, { slides }, details) => pick(await presentation(slides, createdId(details, 'presentationId')), ['presentationId', 'title']),
    verify: (a, b, after) => after?.title === a.title },
  slides_create_slide: { destructive: false,
    describe: (a) => ({ target: a.presentationId, summary: `Add a ${a.layout || 'TITLE_AND_BODY'} slide${a.insertionIndex !== undefined ? ` at position ${a.insertionIndex}` : ' at the end'} of presentation ${a.presentationId}` }),
    before: async (a, { slides }) => ({ slides: ((await presentation(slides, a.presentationId)).slides || []).length }),
    after: async (a, { slides }, details) => {
      const ids = ((await presentation(slides, a.presentationId)).slides || []).map((s) => s.objectId);
      const newId = details?.replies?.[0]?.createSlide?.objectId;
      return { slides: ids.length, newSlideId: newId, newSlidePresent: !!newId && ids.includes(newId), newSlideIndex: newId ? ids.indexOf(newId) : -1 };
    },
    verify: (a, before, after) => after?.newSlidePresent === true && (typeof before?.slides !== 'number' || after.slides === before.slides + 1) && (a.insertionIndex === undefined || after.newSlideIndex === a.insertionIndex) },
  slides_create_textbox: { destructive: false,
    describe: (a) => ({ target: `${a.presentationId} / ${a.pageObjectId}`, summary: `Add a text box with ${quoted(a.text)} to slide ${a.pageObjectId} of presentation ${a.presentationId}` }),
    after: async (a, { slides }, details) => {
      const out = await onSlide(slides, a, details);
      const page = await data(slides.presentations.pages.get({ presentationId: a.presentationId, pageObjectId: a.pageObjectId }));
      return { ...out, textMatches: sameShapeText(elementText(findElement(page.pageElements, out.objectId)), a.text) };
    },
    verify: (a, b, after) => after?.onSlide === true && after.shapeType === 'TEXT_BOX' && after.textMatches === true },
  slides_insert_text: { destructive: false,
    describe: (a) => ({ target: `${a.presentationId} / ${a.objectId}`, summary: `Insert ${quoted(a.text)} at the start of the text in ${a.objectId} in presentation ${a.presentationId}` }),
    before: async (a, { slides }) => { const t = elementText(elementOnSlides(await presentation(slides, a.presentationId), a.objectId)); return { length: t.length, startsWith: excerpt(t) }; },
    after: async (a, { slides }) => {
      const el = elementOnSlides(await presentation(slides, a.presentationId), a.objectId);
      const t = elementText(el);
      return { found: !!el, length: t.length, startsWithText: t.startsWith(str(a.text)) };
    },
    verify: (a, before, after) => after?.found === true && after.startsWithText === true && (typeof before?.length !== 'number' || after.length === before.length + str(a.text).length) },
  slides_replace_all_text: { destructive: D, // changes every match on every slide at once
    describe: (a) => ({ target: a.presentationId, summary: `REPLACE every ${a.matchCase ? 'case-matching ' : ''}"${excerpt(a.find)}" with "${excerpt(a.replacement)}" on all slides of presentation ${a.presentationId}` }),
    before: async (a, { slides }) => ({ matchesNow: occurrences(slideTexts(await presentation(slides, a.presentationId)), a.find, a.matchCase) }),
    after: async (a, { slides }) => {
      const t = slideTexts(await presentation(slides, a.presentationId));
      return { matchesNow: occurrences(t, a.find, a.matchCase), replacementPresent: str(a.replacement) === '' || t.includes(str(a.replacement)) };
    },
    verify: (a, before, after) => after?.replacementPresent === true && (str(a.replacement).toLowerCase().includes(str(a.find).toLowerCase()) || after.matchesNow === 0) },
  slides_create_image: { destructive: false,
    describe: (a) => ({ target: `${a.presentationId} / ${a.pageObjectId}`, summary: `Add the image ${safeUrl(a.imageUrl)} to slide ${a.pageObjectId} of presentation ${a.presentationId}` }),
    after: (a, { slides }, details) => onSlide(slides, a, details),
    verify: (a, b, after) => after?.onSlide === true && after.hasImage === true },
  slides_create_shape: { destructive: false,
    describe: (a) => ({ target: `${a.presentationId} / ${a.pageObjectId}`, summary: `Add a ${a.shapeType || 'RECTANGLE'} shape to slide ${a.pageObjectId} of presentation ${a.presentationId}` }),
    after: (a, { slides }, details) => onSlide(slides, a, details),
    verify: (a, b, after) => after?.onSlide === true && after.shapeType === (a.shapeType || 'RECTANGLE') },

  // ---------- Forms ----------
  forms_create: { destructive: false,
    describe: (a) => ({ target: a.title, summary: `Create a new Google Form titled ${quoted(a.title)}` }),
    after: async (a, { forms }, details) => { const f = await data(forms.forms.get({ formId: createdId(details, 'formId') })); return { formId: f.formId, title: f.info?.title, documentTitle: f.info?.documentTitle }; },
    verify: (a, b, after) => after?.title === a.title && (!a.documentTitle || after.documentTitle === a.documentTitle) },
  forms_add_text_question: { destructive: false,
    describe: (a) => ({ target: a.formId, summary: `Add the ${a.paragraph ? 'long' : 'short'} text question ${quoted(a.title)}${a.required ? ' (required)' : ''} at position ${a.index || 0} of the form ${a.formId}` }),
    before: questionBefore, after: questionAfter,
    verify: (a, before, after) => addedOne(a, before, after) && after?.item?.title === a.title && after.item.type === (a.paragraph ? 'PARAGRAPH' : 'SHORT_ANSWER') && after.item.required === !!a.required },
  forms_add_multiple_choice_question: { destructive: false,
    describe: (a) => ({ target: a.formId, summary: `Add the ${a.allowMultipleAnswers ? 'checkbox' : 'multiple-choice'} question ${quoted(a.title)} with ${(Array.isArray(a.options) ? a.options : []).length} option(s)${a.required ? ' (required)' : ''} at position ${a.index || 0} of the form ${a.formId}` }),
    before: questionBefore, after: questionAfter,
    verify: (a, before, after) => addedOne(a, before, after) && after?.item?.title === a.title && after.item.type === (a.allowMultipleAnswers ? 'CHECKBOX' : 'RADIO') && after.item.required === !!a.required && JSON.stringify(after.item.options) === JSON.stringify(a.options || []) },
  // The handler always publishes the form. Publishing with responses switched on opens it to whoever has the link, so that asks first.
  forms_set_publish_settings: { destructive: false,
    confirmWhen: (a) => a.acceptingResponses !== false,
    describe: (a) => ({ target: a.formId, summary: `PUBLISH the form ${a.formId} and ${a.acceptingResponses === false ? 'stop it accepting responses' : 'START ACCEPTING RESPONSES from anyone it is shared with'}` }),
    before: async (a, { forms }) => (await data(forms.forms.get({ formId: a.formId }))).publishSettings?.publishState || {},
    after: async (a, { forms }) => (await data(forms.forms.get({ formId: a.formId }))).publishSettings?.publishState || {},
    verify: (a, b, after) => after?.isPublished === true && !!after.isAcceptingResponses === (a.acceptingResponses !== false) },

  // ---------- Sheets: layout and formatting tools ----------
  sheets_duplicate_sheet: { destructive: false,
    verify: (a, b, after) => (b?.count === undefined || after?.count === b.count + 1) && (!a.newSheetName || (after?.titles || []).includes(a.newSheetName)),
    describe: (a) => ({ target: a.spreadsheetId, summary: `Duplicate tab ${a.sheetId} of the spreadsheet ${a.spreadsheetId}${a.newSheetName ? ` as "${a.newSheetName}"` : ''}` }),
    before: (a, { sheets }) => tabList(sheets, a.spreadsheetId),
    after: (a, { sheets }) => tabList(sheets, a.spreadsheetId) },
  sheets_format_cells: { destructive: false,
    verify: (a, b, after) => coversDeep(after?.format, a.format),
    describe: (a) => ({ target: a.spreadsheetId, summary: `Change the formatting (${Object.keys(a.format || {}).join(', ') || 'nothing given'}) of ${blockText(a)} in tab ${a.sheetId} of ${a.spreadsheetId}` }),
    before: (a, { sheets }) => cornerFormat(sheets, a),
    after: (a, { sheets }) => cornerFormat(sheets, a) },
  sheets_freeze_rows: { destructive: false,
    verify: (a, b, after) => (a.frozenRowCount === undefined || (after?.frozenRowCount || 0) === a.frozenRowCount) && (a.frozenColumnCount === undefined || (after?.frozenColumnCount || 0) === a.frozenColumnCount),
    describe: (a) => ({ target: a.spreadsheetId, summary: `Freeze ${a.frozenRowCount ?? 0} row(s) and ${a.frozenColumnCount ?? 0} column(s) in tab ${a.sheetId} of ${a.spreadsheetId}` }),
    before: (a, { sheets }) => tabProps(sheets, a),
    after: (a, { sheets }) => tabProps(sheets, a) },
  sheets_autoresize_columns: { destructive: false, // widths cannot be read back in a cheap, reliable way, so nothing is claimed
    describe: (a) => ({ target: a.spreadsheetId, summary: `Resize columns ${a.startColumn} to ${a.endColumn} to fit their content in tab ${a.sheetId} of ${a.spreadsheetId}` }) },
  sheets_sort_range: { destructive: D, // rows end up in a different order and the original order cannot be restored through the API
    verify: (a, b, after) => after?.sorted === true,
    describe: (a) => ({ target: a.spreadsheetId, summary: `SORT ${blockText(a)} in tab ${a.sheetId} of ${a.spreadsheetId} by column ${a.sortColumnIndex} ${a.ascending === false ? 'descending' : 'ascending'} (the original order is lost)` }),
    before: async (a, { sheets }) => ({ rows: (await blockValues(sheets, a)).length }),
    after: async (a, { sheets }) => { const rows = await blockValues(sheets, a); return { rows: rows.length, sorted: isSorted(rows, a) }; } },
  sheets_merge_cells: { destructive: D, // only the top-left value of the merged block survives
    verify: (a, b, after) => after?.merged === true,
    describe: (a) => ({ target: a.spreadsheetId, summary: `MERGE ${blockText(a)} in tab ${a.sheetId} of ${a.spreadsheetId} (${a.mergeType || 'MERGE_ALL'}); values other than the top-left one are lost` }),
    before: async (a, { sheets }) => ({ nonEmptyCells: (await blockValues(sheets, a)).flat().filter((v) => v !== '' && v !== undefined).length }),
    after: async (a, { sheets }) => ({ merged: mergeCovers(await tabMerges(sheets, a), a) }) },
  sheets_unmerge_cells: { destructive: false,
    verify: (a, b, after) => after?.stillMerged === false,
    describe: (a) => ({ target: a.spreadsheetId, summary: `Unmerge ${blockText(a)} in tab ${a.sheetId} of ${a.spreadsheetId}` }),
    before: async (a, { sheets }) => ({ stillMerged: mergesTouch(await tabMerges(sheets, a), a) }),
    after: async (a, { sheets }) => ({ stillMerged: mergesTouch(await tabMerges(sheets, a), a) }) },
  sheets_protect_range: { destructive: D, // decides who is allowed to edit
    verify: (a, b, after) => after?.protectedNow === true && (b?.protectedRanges === undefined || after.count === b.protectedRanges + 1),
    describe: (a) => ({ target: a.spreadsheetId, summary: `PROTECT ${blockText(a)} in tab ${a.sheetId} of ${a.spreadsheetId}: ${a.warningOnly ? 'editors only get a warning' : `only ${(a.editorEmails || []).join(', ') || 'the owner'} can edit it`}` }),
    before: async (a, { sheets }) => ({ protectedRanges: (await tabInfo(sheets, a)).protectedRanges?.length || 0 }),
    after: async (a, { sheets }) => { const pr = (await tabInfo(sheets, a)).protectedRanges || []; return { count: pr.length, protectedNow: pr.some((r) => sameBlock(r.range, a)) }; } }
};
