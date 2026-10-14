// Fixture outputs mirror our wrapped handler responses with RTC detail:'full'.
// They contain only synthetic identities and IDs. Raw Google list envelopes
// differ from handlers that intentionally map absent arrays to [].
export function providerReadFixture(name, account='scratch@example.test') {
 const data = {
  workspace_gmail_get_profile:{emailAddress:account,messagesTotal:0,threadsTotal:0},
  workspace_gmail_list_labels:[],
  workspace_gmail_list_messages:{resultSizeEstimate:0},
  workspace_gmail_list_threads:{resultSizeEstimate:0},
  workspace_gmail_list_drafts:{resultSizeEstimate:0},
  workspace_gmail_list_filters:[],
  workspace_gmail_list_send_as:[],
  workspace_gmail_get_imap_settings:{enabled:false},
  workspace_gmail_get_pop_settings:{accessWindow:'disabled'},
  workspace_gmail_get_vacation_settings:{enableAutoReply:false},
  workspace_gmail_get_forwarding_settings:{enabled:false},
  workspace_gmail_list_forwarding_addresses:[],
  workspace_gmail_list_delegates:[],
  workspace_drive_get_about:{user:{emailAddress:account}},
  workspace_drive_get_start_page_token:{startPageToken:'next-change-token'},
  workspace_drive_list_files:{files:[]},
  workspace_drive_list_shared_drives:{drives:[]},
  workspace_drive_list_recent_files:[],
  workspace_drive_list_starred:[],
  workspace_drive_list_trash:[],
  workspace_drive_list_shared_with_me:[],
  workspace_drive_get_storage_quota:{usage:'0'},
  workspace_calendar_get_settings:[],
  workspace_calendar_list_calendars:[],
  workspace_calendar_list_event_colors:{calendar:{'1':{background:'#123456',foreground:'#eeeeee'}},
    event:{'1':{background:'#123456',foreground:'#eeeeee'}}},
  workspace_calendar_list_events:[],
  workspace_tasks_list_tasklists:[],
  workspace_tasks_list_tasks:[],
  workspace_recent_changes:{changes:[],note:'No changes recorded'}
 };
 if(!Object.hasOwn(data,name))throw Error('missing reviewed fixture for '+name);
 return structuredClone(data[name]);
}
