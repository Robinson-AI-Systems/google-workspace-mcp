import { ok } from './util.js';

export const tools = [
  { name: 'slides_create_presentation', description: 'Create a new Google Slides presentation', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
  { name: 'slides_get_presentation', description: 'Get the full structure of a presentation', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] } },
  { name: 'slides_get_slide', description: 'Get one slide from a presentation', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' } }, required: ['presentationId', 'pageObjectId'] } },
  { name: 'slides_create_slide', description: 'Add a new slide to a presentation', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, layout: { type: 'string', enum: ['BLANK', 'TITLE', 'TITLE_AND_BODY', 'TITLE_AND_TWO_COLUMNS', 'TITLE_ONLY', 'SECTION_HEADER', 'CAPTION_ONLY', 'BIG_NUMBER'], default: 'TITLE_AND_BODY' }, insertionIndex: { type: 'number' } }, required: ['presentationId'] } },
  { name: 'slides_delete_slide', description: 'Delete a slide from a presentation', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' } }, required: ['presentationId', 'pageObjectId'] } },
  { name: 'slides_create_textbox', description: 'Add a text box to a slide', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' }, text: { type: 'string' }, x: { type: 'number', default: 100 }, y: { type: 'number', default: 100 }, width: { type: 'number', default: 300 }, height: { type: 'number', default: 50 } }, required: ['presentationId', 'pageObjectId', 'text'] } },
  { name: 'slides_insert_text', description: "Insert text into an existing shape/placeholder on a slide", inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, objectId: { type: 'string' }, text: { type: 'string' } }, required: ['presentationId', 'objectId', 'text'] } },
  { name: 'slides_replace_all_text', description: 'Find and replace text across the whole presentation', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, find: { type: 'string' }, replacement: { type: 'string' }, matchCase: { type: 'boolean', default: false } }, required: ['presentationId', 'find', 'replacement'] } },
  { name: 'slides_create_image', description: 'Add an image to a slide from a public URL', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' }, imageUrl: { type: 'string' }, x: { type: 'number', default: 100 }, y: { type: 'number', default: 100 }, width: { type: 'number', default: 300 }, height: { type: 'number', default: 200 } }, required: ['presentationId', 'pageObjectId', 'imageUrl'] } },
  { name: 'slides_create_shape', description: 'Add a shape (rectangle, ellipse, arrow, etc) to a slide', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' }, shapeType: { type: 'string', default: 'RECTANGLE' }, x: { type: 'number', default: 100 }, y: { type: 'number', default: 100 }, width: { type: 'number', default: 200 }, height: { type: 'number', default: 100 } }, required: ['presentationId', 'pageObjectId'] } },
  { name: 'slides_delete_text', description: 'Delete text from a shape on a slide', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, objectId: { type: 'string' } }, required: ['presentationId', 'objectId'] } },
  { name: 'slides_get_thumbnail', description: 'Get a thumbnail image URL for a slide', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, pageObjectId: { type: 'string' } }, required: ['presentationId', 'pageObjectId'] } },
  { name: 'slides_batch_update', description: 'Run a raw batchUpdate request (advanced/escape-hatch)', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' }, requests: { type: 'array', items: { type: 'object' } } }, required: ['presentationId', 'requests'] } },
  { name: 'slides_export_as_pdf', description: 'Export the presentation as a PDF (base64)', inputSchema: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] } }
];

const EMU_PER_PT = 12700;

export const handlers = {
  slides_create_presentation: async (args, { slides }) => {
    const res = await slides.presentations.create({ requestBody: { title: args.title } });
    return ok(res.data);
  },
  slides_get_presentation: async (args, { slides }) => {
    const res = await slides.presentations.get({ presentationId: args.presentationId });
    return ok(res.data);
  },
  slides_get_slide: async (args, { slides }) => {
    const res = await slides.presentations.pages.get({ presentationId: args.presentationId, pageObjectId: args.pageObjectId });
    return ok(res.data);
  },
  slides_create_slide: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: [{ createSlide: { insertionIndex: args.insertionIndex, slideLayoutReference: { predefinedLayout: args.layout || 'TITLE_AND_BODY' } } }] } });
    return ok(res.data);
  },
  slides_delete_slide: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: [{ deleteObject: { objectId: args.pageObjectId } }] } });
    return ok(res.data);
  },
  slides_create_textbox: async (args, { slides }) => {
    const objectId = 'textbox_' + Date.now();
    const res = await slides.presentations.batchUpdate({
      presentationId: args.presentationId,
      requestBody: {
        requests: [
          { createShape: { objectId, shapeType: 'TEXT_BOX', elementProperties: { pageObjectId: args.pageObjectId, size: { width: { magnitude: args.width || 300, unit: 'PT' }, height: { magnitude: args.height || 50, unit: 'PT' } }, transform: { scaleX: 1, scaleY: 1, translateX: (args.x || 100) * EMU_PER_PT, translateY: (args.y || 100) * EMU_PER_PT, unit: 'EMU' } } } },
          { insertText: { objectId, text: args.text } }
        ]
      }
    });
    return ok({ objectId, response: res.data });
  },
  slides_insert_text: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: [{ insertText: { objectId: args.objectId, text: args.text } }] } });
    return ok(res.data);
  },
  slides_replace_all_text: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: [{ replaceAllText: { containsText: { text: args.find, matchCase: args.matchCase }, replaceText: args.replacement } }] } });
    return ok(res.data);
  },
  slides_create_image: async (args, { slides }) => {
    const objectId = 'image_' + Date.now();
    const res = await slides.presentations.batchUpdate({
      presentationId: args.presentationId,
      requestBody: { requests: [{ createImage: { objectId, url: args.imageUrl, elementProperties: { pageObjectId: args.pageObjectId, size: { width: { magnitude: args.width || 300, unit: 'PT' }, height: { magnitude: args.height || 200, unit: 'PT' } }, transform: { scaleX: 1, scaleY: 1, translateX: (args.x || 100) * EMU_PER_PT, translateY: (args.y || 100) * EMU_PER_PT, unit: 'EMU' } } } }] }
    });
    return ok({ objectId, response: res.data });
  },
  slides_create_shape: async (args, { slides }) => {
    const objectId = 'shape_' + Date.now();
    const res = await slides.presentations.batchUpdate({
      presentationId: args.presentationId,
      requestBody: { requests: [{ createShape: { objectId, shapeType: args.shapeType || 'RECTANGLE', elementProperties: { pageObjectId: args.pageObjectId, size: { width: { magnitude: args.width || 200, unit: 'PT' }, height: { magnitude: args.height || 100, unit: 'PT' } }, transform: { scaleX: 1, scaleY: 1, translateX: (args.x || 100) * EMU_PER_PT, translateY: (args.y || 100) * EMU_PER_PT, unit: 'EMU' } } } }] }
    });
    return ok({ objectId, response: res.data });
  },
  slides_delete_text: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: [{ deleteText: { objectId: args.objectId, textRange: { type: 'ALL' } } }] } });
    return ok(res.data);
  },
  slides_get_thumbnail: async (args, { slides }) => {
    const res = await slides.presentations.pages.getThumbnail({ presentationId: args.presentationId, pageObjectId: args.pageObjectId });
    return ok(res.data);
  },
  slides_batch_update: async (args, { slides }) => {
    const res = await slides.presentations.batchUpdate({ presentationId: args.presentationId, requestBody: { requests: args.requests } });
    return ok(res.data);
  },
  slides_export_as_pdf: async (args, { drive }) => {
    const res = await drive.files.export({ fileId: args.presentationId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
    return ok({ base64Data: Buffer.from(res.data).toString('base64') });
  }
};
