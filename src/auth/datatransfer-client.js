// The Data Transfer API (admin.datatransfer) was dropped from the googleapis
// npm package's generated clients (Google no longer publishes a discovery
// doc for it), but the REST API itself is still live and documented at
// https://developers.google.com/workspace/admin/data-transfer . This is a
// thin hand-written client that calls it directly through the same
// authenticated `auth` object every other Google client here uses, so it
// behaves exactly like a real googleapis-generated client (same call shape,
// same auth, same error format) instead of silently doing nothing.
const BASE = 'https://admin.googleapis.com/admin/datatransfer/v1';

export function buildDataTransferClient(auth) {
  return {
    transfers: {
      list: async ({ customerId }) => {
        const res = await auth.request({ url: `${BASE}/transfers`, params: { customerId } });
        return res;
      },
      insert: async ({ requestBody }) => {
        const res = await auth.request({ url: `${BASE}/transfers`, method: 'POST', data: requestBody });
        return res;
      },
      get: async ({ dataTransferId }) => {
        const res = await auth.request({ url: `${BASE}/transfers/${encodeURIComponent(dataTransferId)}` });
        return res;
      }
    },
    applications: {
      list: async ({ customerId }) => {
        const res = await auth.request({ url: `${BASE}/applications`, params: { customerId } });
        return res;
      },
      get: async ({ applicationId }) => {
        const res = await auth.request({ url: `${BASE}/applications/${encodeURIComponent(applicationId)}` });
        return res;
      }
    }
  };
}
