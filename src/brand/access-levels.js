// The three access levels, in the words people read on every page that
// offers them (Approve page, My Workspace connections).
export const ACCESS_LEVELS=Object.freeze([
 // Checked against the enforcement in src/rtc/catalog.js allowedTool():
 // read_only blocks every write; everyday blocks writes in the admin,
 // workspace-settings, DNS, licensing and Vault areas; full blocks none.
 {id:'full',label:'Full',says:'Your assistant can read and make changes everywhere your Google account allows, including admin, domain and licensing changes if your account is an administrator.'},
 {id:'everyday',label:'Everyday',says:'Your assistant can read everything and make everyday changes (mail, files, calendar, tasks, contacts), but not admin, domain, DNS or licensing changes.'},
 {id:'read_only',label:'Read only',says:'Your assistant can look but cannot change anything.'}
]);
