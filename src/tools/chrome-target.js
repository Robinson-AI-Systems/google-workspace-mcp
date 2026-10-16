// Chrome Policy targets use Directory OU IDs, not human-readable OU paths.
export async function chromeTarget(orgUnitPath, {admin}) {
  if (typeof orgUnitPath !== 'string' || !orgUnitPath.trim())
    throw Error('invalid_args: orgUnitPath required');
  let id = orgUnitPath;
  if (orgUnitPath.startsWith('/')) {
    const response = await admin.orgunits.get({customerId:'my_customer',orgUnitPath:orgUnitPath === '/' ? '/' : orgUnitPath.slice(1)});
    if (response.data?.orgUnitPath !== orgUnitPath)
      throw Error('Google returned a different organizational unit.');
    id = response.data.orgUnitId;
  }
  id = String(id || '').replace(/^id:/,'');
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
    throw Error('Google did not provide an exact organizational unit ID.');
  return 'orgunits/' + id;
}
