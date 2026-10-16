// The pinned generated Forms client predates setPublishSettings. Keep all of
// its existing resources and use Google's documented endpoint for this method.
// This is a transport adapter; the final registry still owns write approval.
export function withFormsPublishing(client, auth) {
  if (typeof client.forms.setPublishSettings === 'function') return client;
  const forms = Object.create(client.forms, {
    setPublishSettings: { enumerable: true, value: async ({formId, requestBody} = {}) => {
      if (typeof formId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(formId))
        throw Error('invalid_args: exact formId required');
      return auth.request({
        url: `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}:setPublishSettings`,
        method: 'POST', data: requestBody
      });
    }}
  });
  return {...client, forms};
}
