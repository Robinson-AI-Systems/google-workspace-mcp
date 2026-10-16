// googleapis 144 predates the v1 Policy resource. Use Google's documented
// read-only REST method with the same account-bound OAuth client.
// https://docs.cloud.google.com/identity/docs/reference/rest/v1/policies/list
export function buildCloudIdentityPolicyClient(auth) {
  return {
    list: ({filter, pageSize, pageToken} = {}) => auth.request({
      url: 'https://cloudidentity.googleapis.com/v1/policies',
      method: 'GET',
      params: {filter, pageSize, ...(pageToken === undefined ? {} : {pageToken})}
    })
  };
}
