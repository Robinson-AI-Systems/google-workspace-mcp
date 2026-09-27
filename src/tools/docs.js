import { ok } from './util.js';

export const tools = [
  { name: 'docs_create_document', description: 'Create a new Google Doc', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
  { name: 'docs_get_document', description: 'Get the full structure of a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } },
  { name: 'docs_get_text', description: 'Get just the plain text content of a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } },
  { name: 'docs_insert_text', description: 'Insert text at a position in a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, text: { type: 'string' }, index: { type: 'number', default: 1 } }, required: ['documentId', 'text'] } },
  { name: 'docs_append_paragraph', description: 'Append a paragraph to the end of a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, text: { type: 'string' } }, required: ['documentId', 'text'] } },
  { name: 'docs_replace_text', description: 'Find and replace text throughout a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, find: { type: 'string' }, replacement: { type: 'string' }, matchCase: { type: 'boolean', default: false } }, required: ['documentId', 'find', 'replacement'] } },
  { name: 'docs_delete_content', description: 'Delete a range of content from a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, startIndex: { type: 'number' }, endIndex: { type: 'number' } }, required: ['documentId', 'startIndex', 'endIndex'] } },
  { name: 'docs_insert_table', description: 'Insert a table into a Google Doc', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, index: { type: 'number' }, rows: { type: 'number' }, columns: { type: 'number' } }, required: ['documentId', 'index', 'rows', 'columns'] } },
  { name: 'docs_insert_image', description: 'Insert an image into a Google Doc from a public URL', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, index: { type: 'number' }, imageUrl: { type: 'string' }, width: { type: 'number' }, height: { type: 'number' } }, required: ['documentId', 'index', 'imageUrl'] } },
  { name: 'docs_create_named_range', description: 'Name a range of content so it can be referenced later', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, name: { type: 'string' }, startIndex: { type: 'number' }, endIndex: { type: 'number' } }, required: ['documentId', 'name', 'startIndex', 'endIndex'] } },
  { name: 'docs_list_headings', description: 'List all headings in a Google Doc (for a table of contents view)', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } },
  { name: 'docs_batch_update', description: 'Run a raw batchUpdate request (advanced/escape-hatch)', inputSchema: { type: 'object', properties: { documentId: { type: 'string' }, requests: { type: 'array', items: { type: 'object' } } }, required: ['documentId', 'requests'] } },
  { name: 'docs_export_as_pdf', description: 'Export a Google Doc as PDF (base64)', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } },
  { name: 'docs_export_as_docx', description: 'Export a Google Doc as a .docx file (base64)', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } },
  { name: 'docs_export_as_html', description: 'Export a Google Doc as HTML', inputSchema: { type: 'object', properties: { documentId: { type: 'string' } }, required: ['documentId'] } }
];

function extractText(doc) {
  let text = '';
  for (const el of doc.body?.content || []) {
    for (const p of el.paragraph?.elements || []) {
      text += p.textRun?.content || '';
    }
  }
  return text;
}

export const handlers = {
  docs_create_document: async (args, { docs }) => {
    const res = await docs.documents.create({ requestBody: { title: args.title } });
    return ok(res.data);
  },
  docs_get_document: async (args, { docs }) => {
    const res = await docs.documents.get({ documentId: args.documentId });
    return ok(res.data);
  },
  docs_get_text: async (args, { docs }) => {
    const res = await docs.documents.get({ documentId: args.documentId });
    return ok(extractText(res.data));
  },
  docs_insert_text: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ insertText: { location: { index: args.index ?? 1 }, text: args.text } }] } });
    return ok(res.data);
  },
  docs_append_paragraph: async (args, { docs }) => {
    const doc = await docs.documents.get({ documentId: args.documentId });
    const endIndex = (doc.data.body.content[doc.data.body.content.length - 1]?.endIndex || 1) - 1;
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ insertText: { location: { index: Math.max(endIndex, 1) }, text: '\n' + args.text } }] } });
    return ok(res.data);
  },
  docs_replace_text: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ replaceAllText: { containsText: { text: args.find, matchCase: args.matchCase }, replaceText: args.replacement } }] } });
    return ok(res.data);
  },
  docs_delete_content: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ deleteContentRange: { range: { startIndex: args.startIndex, endIndex: args.endIndex } } }] } });
    return ok(res.data);
  },
  docs_insert_table: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ insertTable: { location: { index: args.index }, rows: args.rows, columns: args.columns } }] } });
    return ok(res.data);
  },
  docs_insert_image: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ insertInlineImage: { location: { index: args.index }, uri: args.imageUrl, objectSize: args.width ? { width: { magnitude: args.width, unit: 'PT' }, height: { magnitude: args.height || args.width, unit: 'PT' } } : undefined } }] } });
    return ok(res.data);
  },
  docs_create_named_range: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: [{ createNamedRange: { name: args.name, range: { startIndex: args.startIndex, endIndex: args.endIndex } } }] } });
    return ok(res.data);
  },
  docs_list_headings: async (args, { docs }) => {
    const doc = await docs.documents.get({ documentId: args.documentId });
    const headings = [];
    for (const el of doc.data.body?.content || []) {
      const style = el.paragraph?.paragraphStyle?.namedStyleType;
      if (style && style.startsWith('HEADING')) {
        const text = (el.paragraph.elements || []).map(e => e.textRun?.content || '').join('').trim();
        headings.push({ level: style, text, startIndex: el.startIndex });
      }
    }
    return ok(headings);
  },
  docs_batch_update: async (args, { docs }) => {
    const res = await docs.documents.batchUpdate({ documentId: args.documentId, requestBody: { requests: args.requests } });
    return ok(res.data);
  },
  docs_export_as_pdf: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.documentId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64') });
  },
  docs_export_as_docx: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.documentId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64') });
  },
  docs_export_as_html: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.documentId, mimeType: 'text/html' }, { responseType: 'arraybuffer' });
    return ok({ html: Buffer.from(res.data).toString('utf8') });
  }
};
