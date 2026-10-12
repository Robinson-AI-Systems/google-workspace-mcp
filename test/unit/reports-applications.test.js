import { describe, expect, it, vi } from 'vitest';
import { handlers, REPORT_APPLICATIONS, tools } from '../../src/tools/admin-reports.js';
import { registry } from '../../src/tools/index.js';
import { allowedTool, isWrite } from '../../src/rtc/catalog.js';

const invoke = async (args, data={ items: [] }) => {
  const list = vi.fn(async () => ({ data }));
  const out = await handlers.reports_activity(args, { adminReports: { activities: { list } } });
  return { list, out: JSON.parse(out.content[0].text) };
};

describe('P7-3 paginated multi-application audit', () => {
  it('exposes one read-only, fully categorized tool with no new OAuth scope', async () => {
    expect(tools.find(x=>x.name==='reports_activity').inputSchema.properties.application.enum).toEqual(REPORT_APPLICATIONS);
    expect(REPORT_APPLICATIONS).toEqual([...new Set(REPORT_APPLICATIONS)]);
    expect(REPORT_APPLICATIONS).toContain('meet');
    expect(REPORT_APPLICATIONS).toContain('saml');
    expect(REPORT_APPLICATIONS).toContain('access_transparency');
    expect(isWrite('reports_activity')).toBe(false);
    expect(allowedTool('reports_activity',{profile:'read_only',areas:['admin']})).toBe(true);
    expect(allowedTool('reports_activity',{profile:'read_only',areas:['mail']})).toBe(false);
    expect(registry.handlers.reports_activity).toBeTypeOf('function');
  });
  it('passes only safe allowlisted fields and preserves page tokens', async () => {
    const { list, out } = await invoke({ application:'calendar',maxResults:17,userKey:'all',pageToken:'next',includeSensitiveData:true },{items:[{id:{uniqueQualifier:'1'}}],nextPageToken:'another'});
    expect(list).toHaveBeenCalledExactlyOnceWith({applicationName:'calendar',userKey:'all',maxResults:17,pageToken:'next'});
    expect(out).toEqual({application:'calendar',activities:[{id:{uniqueQualifier:'1'}}],nextPageToken:'another'});
  });
  it('rejects unknown/retired names before any API calls and gives allowlist', async () => {
    const list=vi.fn();
    for (const application of ['unknown','gplus','jamboard','calendar;delete']) {
      await expect(handlers.reports_activity({application},{adminReports:{activities:{list}}})).rejects.toThrow(/Allowed:/);
    }
    expect(list).not.toHaveBeenCalled();
  });
  it('bounds requests and enforces valid date windows, including Gmail', async () => {
    const list=vi.fn();
    for (const args of [
      {application:'meet',maxResults:0},
      {application:'meet',maxResults:201},
      {application:'meet',maxResults:'50'},
      {application:'calendar',endTime:'2026-10-11T00:00:00Z'},
      {application:'calendar',startTime:'bad'},
      {application:'calendar',startTime:'2026-10-12T00:00:00Z',endTime:'2026-10-10T00:00:00Z'},
      {application:'gmail',startTime:'2026-09-01T00:00:00Z',endTime:'2026-10-12T00:00:00Z'},
      {application:'gmail'},
      {application:'rules',pageToken:''}
    ]) await expect(handlers.reports_activity(args,{adminReports:{activities:{list}}})).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
    const good=await invoke({application:'gmail',startTime:'2026-10-01T00:00:00Z',endTime:'2026-10-03T00:00:00Z'});
    expect(good.list).toHaveBeenCalledOnce();
  });
});
