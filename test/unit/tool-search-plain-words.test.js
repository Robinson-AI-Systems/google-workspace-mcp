// 2026-11-10 live test with a stranger's account: "drive list files" and
// "create draft email" found no tools because only an exact phrase matched.
// Search now matches every meaningful word, in any order, with everyday words.
import {describe,it,expect} from 'vitest';
const parse=r=>JSON.parse(r.content[0].text);
const names=async(query,policy={profile:'full'})=>{
 const {handlers}=await import('../../src/tools/rtc-meta.js');
 return parse(await handlers.workspace_search_tools({query,limit:30},{rtcPolicy:policy})).tools.map(t=>t.name);
};
describe('tool search in plain words',()=>{
 it('finds tools from the words people use',async()=>{
  expect(await names('drive list files')).toContain('drive_list_files');
  expect(await names('create draft email')).toContain('gmail_create_draft');
  expect(await names('make a new calendar event')).toContain('calendar_create_event');
  expect(await names('delete drafts')).toContain('gmail_delete_draft');
 });
 it('exact phrase matches still come first, and nonsense still finds nothing',async()=>{
  const found=await names('list gmail messages');
  expect(found[0]).toBe('gmail_list_messages');
  expect(await names('zzqx unicorn')).toEqual([]);
 });
 it('never shows a tool the connection may not use',async()=>{
  const found=await names('create draft email',{profile:'read_only'});
  expect(found).not.toContain('gmail_create_draft');
 });
});
