// Directory's empty/root GET path addresses the collection, not a root resource.
// Ask for the parent explicitly and select only the exact requested root.
export async function exactOrgUnit(orgUnitPath, {admin}) {
  if (typeof orgUnitPath !== 'string' || !orgUnitPath.trim())
    throw Error('invalid_args: orgUnitPath required');
  if (orgUnitPath === '/') {
    const response = await admin.orgunits.list({customerId:'my_customer',type:'all_including_parent'});
    const rows = response.data?.organizationUnits;
    if (!Array.isArray(rows) || response.data.nextPageToken)
      throw Error('Google did not provide a complete organizational unit collection.');
    const roots = rows.filter(row => row?.orgUnitPath === '/');
    if (roots.length !== 1 || typeof roots[0].orgUnitId !== 'string' || !roots[0].orgUnitId)
      throw Error('Google did not provide one exact root organizational unit.');
    return roots[0];
  }
  const response = await admin.orgunits.get({customerId:'my_customer',orgUnitPath:orgUnitPath.replace(/^\//,'')});
  if (orgUnitPath.startsWith('/') && response.data?.orgUnitPath !== orgUnitPath)
    throw Error('Google returned a different organizational unit.');
  if (!response.data || Array.isArray(response.data) || !response.data.orgUnitId)
    throw Error('Google did not provide an exact organizational unit ID.');
  return response.data;
}

// Chrome Policy targets use Directory OU IDs, not human-readable OU paths.
export async function chromeTarget(orgUnitPath, clients) {
  if (typeof orgUnitPath !== 'string' || !orgUnitPath.trim())
    throw Error('invalid_args: orgUnitPath required');
  let id = orgUnitPath;
  if (orgUnitPath.startsWith('/')) {
    id = (await exactOrgUnit(orgUnitPath, clients)).orgUnitId;
  }
  id = String(id || '').replace(/^id:/,'');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
    throw Error('Google did not provide an exact organizational unit ID.');
  return 'orgunits/' + id;
}
