// What this server knows about Chris's businesses. Used by the staff and business workflows.
// Only facts already written down in docs/plan/ are here. A business with no calendar or folder
// listed simply skips those steps and says so; nothing is guessed.
export const BUSINESSES = {
  'appliance-rentals': {
    label: 'Appliance Rentals',
    domain: 'robinsonappliancerentals.com',
    calendarId: 'c_dd214eeba2ec27ed60d341f7aed60beb32c7a883034f39be4153111ce846996d@group.calendar.google.com',
    calendarName: 'Deliveries & Service',
    driveFolderId: '13yNQodb3ELaaOwnjziqpolwHtVYbKLaJ',
    driveFolderName: 'Robinson Appliance Rentals'
  },
  'ai-systems': {
    label: 'AI Systems',
    domain: 'robinsonaisystems.com',
    calendarId: null,
    calendarName: null,
    driveFolderId: null,
    driveFolderName: null
  }
};

// What each job may do. Calendar roles are Google's own words: writer = see and edit events,
// owner = make changes and manage sharing. Drive: reader = view, writer = edit.
export const ROLES = {
  driver: { calendar: 'writer', drive: null, blurb: 'sees and edits the business calendar; no Drive folder access' },
  technician: { calendar: 'writer', drive: null, blurb: 'sees and edits the business calendar; no Drive folder access' },
  office: { calendar: 'owner', drive: 'writer', blurb: 'changes and shares the business calendar, edits the business folder' },
  admin: { calendar: 'owner', drive: 'writer', blurb: 'changes and shares the business calendar, edits the business folder (this does NOT make them a Workspace super admin)' }
};

// The standard folder set under a business's main Drive folder: exactly the nine folders that
// already exist under "Robinson Appliance Rentals" (read from the live Drive, 2026-10-01).
// Can be replaced per call.
export const STANDARD_FOLDERS = [
  '01 Brand Kit', '02 Customers', '03 Agreements (signed)', '04 Invoices & Statements', '05 Receipts & Expenses',
  '06 Inventory & Appliance Photos', '07 Legal & Insurance', '08 Marketing', '09 Taxes & Accounting Exports'
];
