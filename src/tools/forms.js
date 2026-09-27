import { ok } from './util.js';

export const tools = [
  { name: 'forms_create', description: 'Create a new Google Form', inputSchema: { type: 'object', properties: { title: { type: 'string' }, documentTitle: { type: 'string' } }, required: ['title'] } },
  { name: 'forms_get', description: 'Get a form definition (questions, structure)', inputSchema: { type: 'object', properties: { formId: { type: 'string' } }, required: ['formId'] } },
  { name: 'forms_batch_update', description: 'Add/update/delete questions and settings on a form', inputSchema: { type: 'object', properties: { formId: { type: 'string' }, requests: { type: 'array', items: { type: 'object' } } }, required: ['formId', 'requests'] } },
  { name: 'forms_add_text_question', description: 'Add a short/long text question to a form', inputSchema: { type: 'object', properties: { formId: { type: 'string' }, title: { type: 'string' }, paragraph: { type: 'boolean', default: false }, required: { type: 'boolean', default: false }, index: { type: 'number', default: 0 } }, required: ['formId', 'title'] } },
  { name: 'forms_add_multiple_choice_question', description: 'Add a multiple-choice or checkbox question to a form', inputSchema: { type: 'object', properties: { formId: { type: 'string' }, title: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, allowMultipleAnswers: { type: 'boolean', default: false }, required: { type: 'boolean', default: false }, index: { type: 'number', default: 0 } }, required: ['formId', 'title', 'options'] } },
  { name: 'forms_list_responses', description: 'List all responses submitted to a form', inputSchema: { type: 'object', properties: { formId: { type: 'string' } }, required: ['formId'] } },
  { name: 'forms_get_response', description: 'Get one specific form response', inputSchema: { type: 'object', properties: { formId: { type: 'string' }, responseId: { type: 'string' } }, required: ['formId', 'responseId'] } },
  { name: 'forms_set_publish_settings', description: 'Control whether a form is accepting responses', inputSchema: { type: 'object', properties: { formId: { type: 'string' }, acceptingResponses: { type: 'boolean' } }, required: ['formId', 'acceptingResponses'] } }
];

export const handlers = {
  forms_create: async (args, { forms }) => {
    const res = await forms.forms.create({ requestBody: { info: { title: args.title, documentTitle: args.documentTitle || args.title } } });
    return ok(res.data);
  },
  forms_get: async (args, { forms }) => {
    const res = await forms.forms.get({ formId: args.formId });
    return ok(res.data);
  },
  forms_batch_update: async (args, { forms }) => {
    const res = await forms.forms.batchUpdate({ formId: args.formId, requestBody: { requests: args.requests } });
    return ok(res.data);
  },
  forms_add_text_question: async (args, { forms }) => {
    const res = await forms.forms.batchUpdate({
      formId: args.formId,
      requestBody: { requests: [{ createItem: { item: { title: args.title, questionItem: { question: { required: !!args.required, textQuestion: { paragraph: !!args.paragraph } } } }, location: { index: args.index || 0 } } }] }
    });
    return ok(res.data);
  },
  forms_add_multiple_choice_question: async (args, { forms }) => {
    const res = await forms.forms.batchUpdate({
      formId: args.formId,
      requestBody: {
        requests: [{
          createItem: {
            item: { title: args.title, questionItem: { question: { required: !!args.required, choiceQuestion: { type: args.allowMultipleAnswers ? 'CHECKBOX' : 'RADIO', options: args.options.map(value => ({ value })) } } } },
            location: { index: args.index || 0 }
          }
        }]
      }
    });
    return ok(res.data);
  },
  forms_list_responses: async (args, { forms }) => {
    const res = await forms.forms.responses.list({ formId: args.formId });
    return ok(res.data.responses || []);
  },
  forms_get_response: async (args, { forms }) => {
    const res = await forms.forms.responses.get({ formId: args.formId, responseId: args.responseId });
    return ok(res.data);
  },
  forms_set_publish_settings: async (args, { forms }) => {
    const res = await forms.forms.setPublishSettings({
      formId: args.formId,
      requestBody: { publishSettings: { publishState: { isPublished: true, isAcceptingResponses: args.acceptingResponses } } }
    });
    return ok(res.data);
  }
};
