import { ok } from './util.js';

export const tools = [
  { name: 'calendar_list_calendars', description: 'List all calendars this account can see', inputSchema: { type: 'object', properties: {} } },
  { name: 'calendar_get_settings', description: "Get this user's calendar settings (timezone, format, etc)", inputSchema: { type: 'object', properties: {} } },
  { name: 'calendar_create_calendar', description: 'Create a new secondary calendar', inputSchema: { type: 'object', properties: { summary: { type: 'string' }, description: { type: 'string' }, timeZone: { type: 'string' } }, required: ['summary'] } },
  { name: 'calendar_delete_calendar', description: 'Delete a secondary calendar', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' } }, required: ['calendarId'] } },
  { name: 'calendar_share_calendar', description: 'Share a calendar with a user, group, or the whole domain', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, scopeType: { type: 'string', enum: ['user', 'group', 'domain', 'default'], default: 'user' }, scopeValue: { type: 'string' }, role: { type: 'string', enum: ['owner', 'writer', 'reader', 'freeBusyReader'], default: 'reader' } }, required: ['calendarId', 'role'] } },
  { name: 'calendar_unshare_calendar', description: 'Remove sharing access from a calendar', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, ruleId: { type: 'string' } }, required: ['calendarId', 'ruleId'] } },
  { name: 'calendar_list_acl', description: 'List who a calendar is shared with', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' } }, required: ['calendarId'] } },
  { name: 'calendar_list_events', description: 'List events on a calendar', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, timeMin: { type: 'string' }, timeMax: { type: 'string' }, q: { type: 'string' }, maxResults: { type: 'number', default: 25 } } } },
  { name: 'calendar_get_event', description: 'Get one calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' } }, required: ['eventId'] } },
  { name: 'calendar_create_event', description: 'Create a calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, summary: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, start: { type: 'string', description: 'ISO datetime' }, end: { type: 'string', description: 'ISO datetime' }, timeZone: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'], default: 'all' } }, required: ['summary', 'start', 'end'] } },
  { name: 'calendar_create_recurring_event', description: 'Create a repeating calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, timeZone: { type: 'string' }, recurrenceRule: { type: 'string', description: "RFC5545 RRULE e.g. 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10'" }, attendees: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'start', 'end', 'recurrenceRule'] } },
  { name: 'calendar_create_video_meeting', description: 'Create a calendar event with a Google Meet video link attached', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, summary: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, attendees: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'start', 'end'] } },
  { name: 'calendar_quick_add', description: "Create an event from natural language, e.g. \"Lunch with Sam tomorrow 1pm\"", inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, text: { type: 'string' } }, required: ['text'] } },
  { name: 'calendar_update_event', description: 'Update a calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' }, updates: { type: 'object' }, sendUpdates: { type: 'string', enum: ['all', 'externalOnly', 'none'], default: 'all' } }, required: ['eventId', 'updates'] } },
  { name: 'calendar_move_event', description: 'Move an event to a different calendar', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, eventId: { type: 'string' }, destinationCalendarId: { type: 'string' } }, required: ['calendarId', 'eventId', 'destinationCalendarId'] } },
  { name: 'calendar_delete_event', description: 'Delete a calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' }, sendUpdates: { type: 'string', default: 'all' } }, required: ['eventId'] } },
  { name: 'calendar_add_attendee', description: 'Add an attendee to an existing event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' }, email: { type: 'string' } }, required: ['eventId', 'email'] } },
  { name: 'calendar_list_event_instances', description: 'List individual occurrences of a recurring event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' } }, required: ['eventId'] } },
  { name: 'calendar_set_event_color', description: 'Set the color of a calendar event', inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, eventId: { type: 'string' }, colorId: { type: 'string' } }, required: ['eventId', 'colorId'] } },
  { name: 'calendar_list_event_colors', description: 'List available calendar/event color IDs', inputSchema: { type: 'object', properties: {} } },
  { name: 'calendar_get_freebusy', description: 'Check free/busy status for one or more calendars', inputSchema: { type: 'object', properties: { calendarIds: { type: 'array', items: { type: 'string' } }, timeMin: { type: 'string' }, timeMax: { type: 'string' } }, required: ['calendarIds', 'timeMin', 'timeMax'] } }
];

export const handlers = {
  calendar_list_calendars: async (_args, { calendar }) => {
    const res = await calendar.calendarList.list({});
    return ok(res.data.items || []);
  },
  calendar_get_settings: async (_args, { calendar }) => {
    const res = await calendar.settings.list({});
    return ok(res.data.items || []);
  },
  calendar_create_calendar: async (args, { calendar }) => {
    const res = await calendar.calendars.insert({ requestBody: { summary: args.summary, description: args.description, timeZone: args.timeZone } });
    return ok(res.data);
  },
  calendar_delete_calendar: async (args, { calendar }) => {
    await calendar.calendars.delete({ calendarId: args.calendarId });
    return ok({ deleted: args.calendarId });
  },
  calendar_share_calendar: async (args, { calendar }) => {
    const res = await calendar.acl.insert({ calendarId: args.calendarId, requestBody: { role: args.role, scope: { type: args.scopeType || 'user', value: args.scopeValue } } });
    return ok(res.data);
  },
  calendar_unshare_calendar: async (args, { calendar }) => {
    await calendar.acl.delete({ calendarId: args.calendarId, ruleId: args.ruleId });
    return ok({ removed: args.ruleId });
  },
  calendar_list_acl: async (args, { calendar }) => {
    const res = await calendar.acl.list({ calendarId: args.calendarId });
    return ok(res.data.items || []);
  },
  calendar_list_events: async (args, { calendar }) => {
    const res = await calendar.events.list({ calendarId: args.calendarId || 'primary', timeMin: args.timeMin, timeMax: args.timeMax, q: args.q, maxResults: args.maxResults || 25, singleEvents: true, orderBy: 'startTime' });
    return ok(res.data.items || []);
  },
  calendar_get_event: async (args, { calendar }) => {
    const res = await calendar.events.get({ calendarId: args.calendarId || 'primary', eventId: args.eventId });
    return ok(res.data);
  },
  calendar_create_event: async (args, { calendar }) => {
    const res = await calendar.events.insert({
      calendarId: args.calendarId || 'primary',
      sendUpdates: args.sendUpdates || 'all',
      requestBody: {
        summary: args.summary, description: args.description, location: args.location,
        start: { dateTime: args.start, timeZone: args.timeZone },
        end: { dateTime: args.end, timeZone: args.timeZone },
        attendees: (args.attendees || []).map(email => ({ email }))
      }
    });
    return ok(res.data);
  },
  calendar_create_recurring_event: async (args, { calendar }) => {
    const res = await calendar.events.insert({
      calendarId: args.calendarId || 'primary',
      requestBody: {
        summary: args.summary,
        start: { dateTime: args.start, timeZone: args.timeZone },
        end: { dateTime: args.end, timeZone: args.timeZone },
        recurrence: [args.recurrenceRule],
        attendees: (args.attendees || []).map(email => ({ email }))
      }
    });
    return ok(res.data);
  },
  calendar_create_video_meeting: async (args, { calendar }) => {
    const res = await calendar.events.insert({
      calendarId: args.calendarId || 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: args.summary,
        start: { dateTime: args.start },
        end: { dateTime: args.end },
        attendees: (args.attendees || []).map(email => ({ email })),
        conferenceData: { createRequest: { requestId: 'gwsmcp-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      }
    });
    return ok(res.data);
  },
  calendar_quick_add: async (args, { calendar }) => {
    const res = await calendar.events.quickAdd({ calendarId: args.calendarId || 'primary', text: args.text });
    return ok(res.data);
  },
  calendar_update_event: async (args, { calendar }) => {
    const res = await calendar.events.patch({ calendarId: args.calendarId || 'primary', eventId: args.eventId, sendUpdates: args.sendUpdates || 'all', requestBody: args.updates });
    return ok(res.data);
  },
  calendar_move_event: async (args, { calendar }) => {
    const res = await calendar.events.move({ calendarId: args.calendarId, eventId: args.eventId, destination: args.destinationCalendarId });
    return ok(res.data);
  },
  calendar_delete_event: async (args, { calendar }) => {
    await calendar.events.delete({ calendarId: args.calendarId || 'primary', eventId: args.eventId, sendUpdates: args.sendUpdates || 'all' });
    return ok({ deleted: args.eventId });
  },
  calendar_add_attendee: async (args, { calendar }) => {
    const event = await calendar.events.get({ calendarId: args.calendarId || 'primary', eventId: args.eventId });
    const attendees = [...(event.data.attendees || []), { email: args.email }];
    const res = await calendar.events.patch({ calendarId: args.calendarId || 'primary', eventId: args.eventId, requestBody: { attendees } });
    return ok(res.data);
  },
  calendar_list_event_instances: async (args, { calendar }) => {
    const res = await calendar.events.instances({ calendarId: args.calendarId || 'primary', eventId: args.eventId });
    return ok(res.data.items || []);
  },
  calendar_set_event_color: async (args, { calendar }) => {
    const res = await calendar.events.patch({ calendarId: args.calendarId || 'primary', eventId: args.eventId, requestBody: { colorId: args.colorId } });
    return ok(res.data);
  },
  calendar_list_event_colors: async (_args, { calendar }) => {
    const res = await calendar.colors.get({});
    return ok(res.data);
  },
  calendar_get_freebusy: async (args, { calendar }) => {
    const res = await calendar.freebusy.query({ requestBody: { timeMin: args.timeMin, timeMax: args.timeMax, items: args.calendarIds.map(id => ({ id })) } });
    return ok(res.data);
  }
};
