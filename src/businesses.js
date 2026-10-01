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
  driver: { calendar: 'writer', drive: 'reader', blurb: 'sees and edits the business calendar, can view the business folder' },
  technician: { calendar: 'writer', drive: 'reader', blurb: 'sees and edits the business calendar, can view the business folder' },
  office: { calendar: 'owner', drive: 'writer', blurb: 'changes and shares the business calendar, edits the business folder' },
  admin: { calendar: 'owner', drive: 'writer', blurb: 'changes and shares the business calendar, edits the business folder (this does NOT make them a Workspace super admin)' }
};

// The standard folder set under a business's main Drive folder. The first five names are the ones
// already in use for Appliance Rentals; the rest are a sensible default and can be replaced per call.
export const STANDARD_FOLDERS = [
  '01 Business Admin', '02 Customers', '03 Agreements (signed)', '04 Invoices & Statements', '05 Inventory Photos',
  '06 Insurance & Legal', '07 Vehicles & Equipment', '08 Marketing & Brand', '09 Accounting & Taxes'
];
