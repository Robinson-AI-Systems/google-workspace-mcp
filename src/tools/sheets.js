import { ok } from './util.js';

export const tools = [
  { name: 'sheets_create_spreadsheet', description: 'Create a new Google Sheet', inputSchema: { type: 'object', properties: { title: { type: 'string' }, sheetTitles: { type: 'array', items: { type: 'string' } } }, required: ['title'] } },
  { name: 'sheets_get_spreadsheet', description: 'Get spreadsheet metadata (sheet names, IDs, dimensions)', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' } }, required: ['spreadsheetId'] } },
  { name: 'sheets_get_values', description: 'Read cell values from a range', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheetId', 'range'] } },
  { name: 'sheets_batch_get', description: 'Read multiple ranges at once', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, ranges: { type: 'array', items: { type: 'string' } } }, required: ['spreadsheetId', 'ranges'] } },
  { name: 'sheets_update_values', description: 'Write values into a range (overwrites)', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' }, values: { type: 'array', items: { type: 'array' } } }, required: ['spreadsheetId', 'range', 'values'] } },
  { name: 'sheets_batch_update_values', description: 'Write to multiple ranges in one call', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, data: { type: 'array', items: { type: 'object', properties: { range: { type: 'string' }, values: { type: 'array' } } } } }, required: ['spreadsheetId', 'data'] } },
  { name: 'sheets_append_values', description: 'Append rows after the last row of data', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' }, values: { type: 'array', items: { type: 'array' } } }, required: ['spreadsheetId', 'range', 'values'] } },
  { name: 'sheets_clear_values', description: 'Clear values from a range (keeps formatting)', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, range: { type: 'string' } }, required: ['spreadsheetId', 'range'] } },
  { name: 'sheets_find_replace', description: 'Find and replace text across a sheet', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, find: { type: 'string' }, replacement: { type: 'string' }, sheetId: { type: 'number' }, matchCase: { type: 'boolean', default: false } }, required: ['spreadsheetId', 'find', 'replacement'] } },
  { name: 'sheets_add_sheet', description: 'Add a new tab/sheet to a spreadsheet', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, title: { type: 'string' } }, required: ['spreadsheetId', 'title'] } },
  { name: 'sheets_delete_sheet', description: 'Delete a tab/sheet from a spreadsheet', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' } }, required: ['spreadsheetId', 'sheetId'] } },
  { name: 'sheets_duplicate_sheet', description: 'Duplicate a tab within the same spreadsheet', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, newSheetName: { type: 'string' } }, required: ['spreadsheetId', 'sheetId'] } },
  { name: 'sheets_copy_to_spreadsheet', description: 'Copy a sheet/tab into a different spreadsheet', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, destinationSpreadsheetId: { type: 'string' } }, required: ['spreadsheetId', 'sheetId', 'destinationSpreadsheetId'] } },
  { name: 'sheets_format_cells', description: 'Apply formatting (bold, colors, number format) to a range', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' }, format: { type: 'object', description: 'Google Sheets CellFormat object' } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn', 'format'] } },
  { name: 'sheets_freeze_rows', description: 'Freeze header rows/columns', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, frozenRowCount: { type: 'number' }, frozenColumnCount: { type: 'number' } }, required: ['spreadsheetId', 'sheetId'] } },
  { name: 'sheets_autoresize_columns', description: 'Auto-resize column widths to fit content', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' } }, required: ['spreadsheetId', 'sheetId', 'startColumn', 'endColumn'] } },
  { name: 'sheets_sort_range', description: 'Sort a range by one or more columns', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' }, sortColumnIndex: { type: 'number' }, ascending: { type: 'boolean', default: true } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn', 'sortColumnIndex'] } },
  { name: 'sheets_merge_cells', description: 'Merge a range of cells', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' }, mergeType: { type: 'string', enum: ['MERGE_ALL', 'MERGE_COLUMNS', 'MERGE_ROWS'], default: 'MERGE_ALL' } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn'] } },
  { name: 'sheets_unmerge_cells', description: 'Unmerge a range of cells', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn'] } },
  { name: 'sheets_add_conditional_formatting', description: 'Add a conditional formatting rule to a range', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' }, condition: { type: 'object', description: 'Google Sheets BooleanCondition object' }, backgroundColor: { type: 'object', description: '{red,green,blue} 0-1 each' } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn', 'condition'] } },
  { name: 'sheets_protect_range', description: 'Protect a range so only specific editors can change it', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' }, startRow: { type: 'number' }, endRow: { type: 'number' }, startColumn: { type: 'number' }, endColumn: { type: 'number' }, warningOnly: { type: 'boolean', default: false }, editorEmails: { type: 'array', items: { type: 'string' } } }, required: ['spreadsheetId', 'sheetId', 'startRow', 'endRow', 'startColumn', 'endColumn'] } },
  { name: 'sheets_batch_update', description: 'Run a raw batchUpdate request (advanced/escape-hatch for anything not covered above)', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, requests: { type: 'array', items: { type: 'object' } } }, required: ['spreadsheetId', 'requests'] } },
  { name: 'sheets_get_sheet_as_csv', description: 'Export one tab as CSV text', inputSchema: { type: 'object', properties: { spreadsheetId: { type: 'string' }, sheetId: { type: 'number' } }, required: ['spreadsheetId', 'sheetId'] } }
];

export const handlers = {
  sheets_create_spreadsheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.create({ requestBody: { properties: { title: args.title }, sheets: (args.sheetTitles || []).map(title => ({ properties: { title } })) } });
    return ok(res.data);
  },
  sheets_get_spreadsheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.get({ spreadsheetId: args.spreadsheetId });
    return ok(res.data);
  },
  sheets_get_values: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: args.spreadsheetId, range: args.range });
    return ok(res.data);
  },
  sheets_batch_get: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: args.spreadsheetId, ranges: args.ranges });
    return ok(res.data);
  },
  sheets_update_values: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.update({ spreadsheetId: args.spreadsheetId, range: args.range, valueInputOption: 'USER_ENTERED', requestBody: { values: args.values } });
    return ok(res.data);
  },
  sheets_batch_update_values: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data: args.data } });
    return ok(res.data);
  },
  sheets_append_values: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.append({ spreadsheetId: args.spreadsheetId, range: args.range, valueInputOption: 'USER_ENTERED', requestBody: { values: args.values } });
    return ok(res.data);
  },
  sheets_clear_values: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.values.clear({ spreadsheetId: args.spreadsheetId, range: args.range });
    return ok(res.data);
  },
  sheets_find_replace: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ findReplace: { find: args.find, replacement: args.replacement, matchCase: args.matchCase, sheetId: args.sheetId, allSheets: args.sheetId === undefined } }] } });
    return ok(res.data);
  },
  sheets_add_sheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: args.title } } }] } });
    return ok(res.data);
  },
  sheets_delete_sheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId: args.sheetId } }] } });
    return ok(res.data);
  },
  sheets_duplicate_sheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ duplicateSheet: { sourceSheetId: args.sheetId, newSheetName: args.newSheetName } }] } });
    return ok(res.data);
  },
  sheets_copy_to_spreadsheet: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.sheets.copyTo({ spreadsheetId: args.spreadsheetId, sheetId: args.sheetId, requestBody: { destinationSpreadsheetId: args.destinationSpreadsheetId } });
    return ok(res.data);
  },
  sheets_format_cells: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const fields = 'userEnteredFormat(' + Object.keys(args.format).join(',') + ')';
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ repeatCell: { range, cell: { userEnteredFormat: args.format }, fields } }] } });
    return ok(res.data);
  },
  sheets_freeze_rows: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: args.sheetId, gridProperties: { frozenRowCount: args.frozenRowCount, frozenColumnCount: args.frozenColumnCount } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } }] } });
    return ok(res.data);
  },
  sheets_autoresize_columns: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ autoResizeDimensions: { dimensions: { sheetId: args.sheetId, dimension: 'COLUMNS', startIndex: args.startColumn, endIndex: args.endColumn } } }] } });
    return ok(res.data);
  },
  sheets_sort_range: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ sortRange: { range, sortSpecs: [{ dimensionIndex: args.sortColumnIndex, sortOrder: args.ascending === false ? 'DESCENDING' : 'ASCENDING' }] } }] } });
    return ok(res.data);
  },
  sheets_merge_cells: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ mergeCells: { range, mergeType: args.mergeType || 'MERGE_ALL' } }] } });
    return ok(res.data);
  },
  sheets_unmerge_cells: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ unmergeCells: { range } }] } });
    return ok(res.data);
  },
  sheets_add_conditional_formatting: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ addConditionalFormatRule: { rule: { ranges: [range], booleanRule: { condition: args.condition, format: { backgroundColor: args.backgroundColor } } }, index: 0 } }] } });
    return ok(res.data);
  },
  sheets_protect_range: async (args, { sheets }) => {
    const range = { sheetId: args.sheetId, startRowIndex: args.startRow, endRowIndex: args.endRow, startColumnIndex: args.startColumn, endColumnIndex: args.endColumn };
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: [{ addProtectedRange: { protectedRange: { range, warningOnly: args.warningOnly, editors: args.editorEmails ? { users: args.editorEmails } : undefined } } }] } });
    return ok(res.data);
  },
  sheets_batch_update: async (args, { sheets }) => {
    const res = await sheets.spreadsheets.batchUpdate({ spreadsheetId: args.spreadsheetId, requestBody: { requests: args.requests } });
    return ok(res.data);
  },
  sheets_get_sheet_as_csv: async (args, { sheets, auth }) => {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: args.spreadsheetId });
    const sheet = meta.data.sheets.find(s => s.properties.sheetId === args.sheetId);
    const range = sheet ? sheet.properties.title : undefined;
    const values = await sheets.spreadsheets.values.get({ spreadsheetId: args.spreadsheetId, range });
    const csv = (values.data.values || []).map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    return ok(csv);
  }
};
