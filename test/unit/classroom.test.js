import {describe,it,expect} from 'vitest';
import {makeFakeClients} from '../helpers/fake-google.js';
import {tools,handlers} from '../../src/tools/classroom.js';
import {registry} from '../../src/tools/index.js';
import {isWrite,rtcArea} from '../../src/rtc/catalog.js';
import {isGuardedWrite} from '../../src/tools/write.js';

const value=r=>JSON.parse(r.content[0].text);
const named=(name)=>registry.tools.find(t=>t.name===name);
const READS=['classroom_list_courses','classroom_get_course','classroom_list_course_aliases',
 'classroom_list_students','classroom_get_student','classroom_list_teachers','classroom_get_teacher',
 'classroom_list_invitations','classroom_get_invitation','classroom_list_coursework','classroom_get_coursework',
 'classroom_list_submissions','classroom_get_submission'];
const WRITES=['classroom_create_course','classroom_update_course','classroom_patch_course','classroom_delete_course',
 'classroom_create_course_alias','classroom_delete_course_alias','classroom_add_student','classroom_remove_student',
 'classroom_add_teacher','classroom_remove_teacher','classroom_create_invitation','classroom_delete_invitation',
 'classroom_accept_invitation','classroom_create_coursework','classroom_update_coursework','classroom_patch_coursework',
 'classroom_delete_coursework','classroom_grade_submission','classroom_return_submission','classroom_turn_in_submission',
 'classroom_reclaim_submission','classroom_modify_submission_attachments'];
const DESTRUCTIVE=['classroom_delete_course','classroom_delete_course_alias','classroom_add_student','classroom_remove_student',
 'classroom_add_teacher','classroom_remove_teacher','classroom_create_invitation','classroom_delete_invitation',
 'classroom_delete_coursework'];

describe('Google Classroom tools (the four requested scopes, fully tooled)',()=>{
 it('registers exactly the 35 classroom tools in order',()=>{
  expect(tools.map(t=>t.name)).toEqual([...READS.slice(0,2),
   'classroom_create_course','classroom_update_course','classroom_patch_course','classroom_delete_course',
   'classroom_list_course_aliases','classroom_create_course_alias','classroom_delete_course_alias',
   'classroom_list_students','classroom_get_student','classroom_add_student','classroom_remove_student',
   'classroom_list_teachers','classroom_get_teacher','classroom_add_teacher','classroom_remove_teacher',
   'classroom_list_invitations','classroom_get_invitation','classroom_create_invitation','classroom_delete_invitation',
   'classroom_accept_invitation','classroom_list_coursework','classroom_get_coursework','classroom_create_coursework',
   'classroom_update_coursework','classroom_patch_coursework','classroom_delete_coursework',
   'classroom_list_submissions','classroom_get_submission','classroom_grade_submission','classroom_return_submission',
   'classroom_turn_in_submission','classroom_reclaim_submission','classroom_modify_submission_attachments']);
  for(const t of tools)expect(registry.tools.some(r=>r.name===t.name),t.name).toBe(true);
 });
 it('classifies reads as reads and every write as a provenance-guarded write in the classroom area',()=>{
  for(const name of READS){
   expect(isWrite(name),name).toBe(false);
   expect(isGuardedWrite(registry.handlers[name]),name).toBe(false);
  }
  for(const name of WRITES){
   expect(isWrite(name),name).toBe(true);
   expect(isGuardedWrite(registry.handlers[name]),name).toBe(true);
   expect(named(name).inputSchema.properties.dryRun?.type,name).toBe('boolean');
   expect(rtcArea(name),name).toBe('classroom');
  }
  for(const name of DESTRUCTIVE)expect(named(name).inputSchema.properties.confirm?.type,name).toBe('boolean');
 });
 it('lists courses with the tasks-style paging contract and never hides a cursor',async()=>{
  const f=makeFakeClients();
  f.when('classroom.courses.list').resolves({data:{courses:[{id:'c1'}],nextPageToken:'next'}});
  expect(value(await handlers.classroom_list_courses({},f.clients))).toEqual({items:[{id:'c1'}],nextPageToken:'next',complete:false});
  expect(value(await handlers.classroom_list_courses({teacherId:'me',pageSize:10},f.clients)))
   .toEqual({items:[{id:'c1'}],nextPageToken:'next',complete:false});
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.list',args:[{teacherId:'me',pageSize:10}]});
  f.when('classroom.courses.list').resolves({data:{}});
  expect(value(await handlers.classroom_list_courses({includePageInfo:true},f.clients)))
   .toEqual({items:[],nextPageToken:null,complete:true});
 });
 it('rejects malformed list responses instead of misreporting them as empty',async()=>{
  const f=makeFakeClients();
  f.when('classroom.courses.list').resolves({data:{courses:{}}});
  await expect(handlers.classroom_list_courses({},f.clients)).rejects.toThrow(/Google returned/);
 });
 it('creates a course as "me" unless another owner is named, and patches by field mask',async()=>{
  const f=makeFakeClients();
  f.when('classroom.courses.create').resolves({data:{id:'c9',name:'Algebra'}});
  expect(value(await handlers.classroom_create_course({name:'Algebra',section:'Period 2'},f.clients))).toEqual({id:'c9',name:'Algebra'});
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.create',args:[{requestBody:{ownerId:'me',name:'Algebra',section:'Period 2'}}]});
  await handlers.classroom_patch_course({courseId:'c9',room:'204',courseState:'ARCHIVED'},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.patch',args:[{id:'c9',updateMask:'room,courseState',requestBody:{room:'204',courseState:'ARCHIVED'}}]});
 });
 it('adds roster members directly or by enrollment code, for students and teachers alike',async()=>{
  const f=makeFakeClients();
  await handlers.classroom_add_student({courseId:'c1',userId:'sam@example.test'},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.students.create',args:[{courseId:'c1',requestBody:{userId:'sam@example.test'}}]});
  await handlers.classroom_add_student({courseId:'c1',userId:'sam@example.test',enrollmentCode:'abc123'},f.clients);
  expect(f.calls.at(-1).args[0]).toMatchObject({enrollmentCode:'abc123'});
  await handlers.classroom_remove_teacher({courseId:'c1',userId:'pat@example.test'},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.teachers.delete',args:[{courseId:'c1',userId:'pat@example.test'}]});
 });
 it('creates invitations with the exact role and accepts by id',async()=>{
  const f=makeFakeClients();
  await handlers.classroom_create_invitation({userId:'sam@example.test',courseId:'c1',role:'TEACHER'},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.invitations.create',args:[{requestBody:{userId:'sam@example.test',courseId:'c1',role:'TEACHER'}}]});
  expect(value(await handlers.classroom_accept_invitation({invitationId:'inv1'},f.clients))).toEqual({accepted:'inv1'});
  expect(f.calls.at(-1).path).toBe('classroom.invitations.accept');
 });
 it('builds coursework bodies per work type and patches by field mask',async()=>{
  const f=makeFakeClients();
  await handlers.classroom_create_coursework({courseId:'c1',title:'Quiz 1',workType:'MULTIPLE_CHOICE_QUESTION',multipleChoiceChoices:['a','b']},f.clients);
  expect(f.calls.at(-1).args[0].requestBody).toEqual({title:'Quiz 1',workType:'MULTIPLE_CHOICE_QUESTION',multipleChoiceQuestion:{choices:['a','b']}});
  await handlers.classroom_create_coursework({courseId:'c1',title:'Essay',state:'DRAFT'},f.clients);
  expect(f.calls.at(-1).args[0].requestBody).toEqual({title:'Essay',state:'DRAFT',assignment:{}});
  await handlers.classroom_patch_coursework({courseId:'c1',courseWorkId:'w1',maxPoints:50},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.courseWork.patch',args:[{courseId:'c1',id:'w1',updateMask:'maxPoints',requestBody:{maxPoints:50}}]});
 });
 it('grades by mask, and turns in / returns / reclaims submissions through the right methods',async()=>{
  const f=makeFakeClients();
  await handlers.classroom_grade_submission({courseId:'c1',courseWorkId:'w1',submissionId:'s1',draftGrade:8,assignedGrade:9},f.clients);
  expect(f.calls.at(-1)).toEqual({path:'classroom.courses.courseWork.studentSubmissions.patch',args:[{courseId:'c1',courseWorkId:'w1',id:'s1',updateMask:'assignedGrade,draftGrade',requestBody:{assignedGrade:9,draftGrade:8}}]});
  for(const [handler,method] of [[handlers.classroom_turn_in_submission,'turnIn'],[handlers.classroom_return_submission,'return'],[handlers.classroom_reclaim_submission,'reclaim']]){
   await handler({courseId:'c1',courseWorkId:'w1',submissionId:'s1'},f.clients);
   expect(f.calls.at(-1)).toEqual({path:`classroom.courses.courseWork.studentSubmissions.${method}`,args:[{courseId:'c1',courseWorkId:'w1',id:'s1',requestBody:{}}]});
  }
  await handlers.classroom_modify_submission_attachments({courseId:'c1',courseWorkId:'w1',submissionId:'s1',addAttachments:[{link:{url:'https://example.test/x'}}]},f.clients);
  expect(f.calls.at(-1).args[0].requestBody).toEqual({addAttachments:[{link:{url:'https://example.test/x'}}]});
 });
});
