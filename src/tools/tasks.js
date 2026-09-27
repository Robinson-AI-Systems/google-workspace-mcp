import { ok } from './util.js';

export const tools = [
  { name: 'tasks_list_tasklists', description: 'List all task lists', inputSchema: { type: 'object', properties: {} } },
  { name: 'tasks_create_tasklist', description: 'Create a new task list', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
  { name: 'tasks_get_tasklist', description: 'Get one task list', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string' } }, required: ['tasklistId'] } },
  { name: 'tasks_update_tasklist', description: 'Rename a task list', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string' }, title: { type: 'string' } }, required: ['tasklistId', 'title'] } },
  { name: 'tasks_delete_tasklist', description: 'Delete a task list', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string' } }, required: ['tasklistId'] } },
  { name: 'tasks_list_tasks', description: 'List tasks in a task list', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' }, showCompleted: { type: 'boolean', default: true } } } },
  { name: 'tasks_get_task', description: 'Get one task', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' }, taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'tasks_create_task', description: 'Create a task', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' }, title: { type: 'string' }, notes: { type: 'string' }, due: { type: 'string', description: 'RFC3339 date' } }, required: ['title'] } },
  { name: 'tasks_update_task', description: 'Update a task (title, notes, due date, status)', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' }, taskId: { type: 'string' }, title: { type: 'string' }, notes: { type: 'string' }, due: { type: 'string' }, status: { type: 'string', enum: ['needsAction', 'completed'] } }, required: ['taskId'] } },
  { name: 'tasks_delete_task', description: 'Delete a task', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' }, taskId: { type: 'string' } }, required: ['taskId'] } },
  { name: 'tasks_clear_completed', description: 'Clear all completed tasks from a task list', inputSchema: { type: 'object', properties: { tasklistId: { type: 'string', default: '@default' } } } }
];

export const handlers = {
  tasks_list_tasklists: async (_args, { tasks }) => {
    const res = await tasks.tasklists.list({});
    return ok(res.data.items || []);
  },
  tasks_create_tasklist: async (args, { tasks }) => {
    const res = await tasks.tasklists.insert({ requestBody: { title: args.title } });
    return ok(res.data);
  },
  tasks_get_tasklist: async (args, { tasks }) => {
    const res = await tasks.tasklists.get({ tasklist: args.tasklistId });
    return ok(res.data);
  },
  tasks_update_tasklist: async (args, { tasks }) => {
    const res = await tasks.tasklists.patch({ tasklist: args.tasklistId, requestBody: { title: args.title } });
    return ok(res.data);
  },
  tasks_delete_tasklist: async (args, { tasks }) => {
    await tasks.tasklists.delete({ tasklist: args.tasklistId });
    return ok({ deleted: args.tasklistId });
  },
  tasks_list_tasks: async (args, { tasks }) => {
    const res = await tasks.tasks.list({ tasklist: args.tasklistId || '@default', showCompleted: args.showCompleted !== false });
    return ok(res.data.items || []);
  },
  tasks_get_task: async (args, { tasks }) => {
    const res = await tasks.tasks.get({ tasklist: args.tasklistId || '@default', task: args.taskId });
    return ok(res.data);
  },
  tasks_create_task: async (args, { tasks }) => {
    const res = await tasks.tasks.insert({ tasklist: args.tasklistId || '@default', requestBody: { title: args.title, notes: args.notes, due: args.due } });
    return ok(res.data);
  },
  tasks_update_task: async (args, { tasks }) => {
    const res = await tasks.tasks.patch({ tasklist: args.tasklistId || '@default', task: args.taskId, requestBody: { title: args.title, notes: args.notes, due: args.due, status: args.status } });
    return ok(res.data);
  },
  tasks_delete_task: async (args, { tasks }) => {
    await tasks.tasks.delete({ tasklist: args.tasklistId || '@default', task: args.taskId });
    return ok({ deleted: args.taskId });
  },
  tasks_clear_completed: async (args, { tasks }) => {
    await tasks.tasks.clear({ tasklist: args.tasklistId || '@default' });
    return ok({ status: 'cleared' });
  }
};
