import {ok,googleList} from './util.js';

const string={type:'string'};
const bool={type:'boolean'};
const num={type:'number'};
const positivePage={type:'integer',minimum:1,maximum:1000};
const paging={pageSize:positivePage,pageToken:string,includePageInfo:bool};
const props=(fields,required=[])=>({type:'object',properties:fields,required});
const only=(a,fields)=>Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
const listResult=(args,data,field)=>{
 const result=googleList(data,field,['kind','etag','nextPageToken']);
 const more=result.nextPageToken||null;
 return ok(args.includePageInfo===true||args.pageToken!==undefined||args.pageSize!==undefined||more
  ?{items:result[field],nextPageToken:more,complete:!more}
  :result[field]);
};
// The four Classroom scopes this server requests (classroom.courses,
// classroom.rosters, classroom.coursework.students, classroom.coursework.me)
// cover every method below. Announcements, topics, coursework materials,
// guardians and user profiles need scopes the server does not request, so
// they are deliberately not tools here.
const courseStates={type:'array',items:{type:'string',enum:['ACTIVE','ARCHIVED','PROVISIONED','DECLINED','SUSPENDED']},description:'Only return courses in these states'};
const courseFields={name:string,section:string,descriptionHeading:string,description:string,room:string,courseState:{type:'string',enum:['ACTIVE','ARCHIVED','PROVISIONED','DECLINED','SUSPENDED']}};
const courseArg={courseId:string};
const workStates={type:'array',items:{type:'string',enum:['PUBLISHED','DRAFT','DELETED']}};
const dateObj={type:'object',description:'Calendar date as {year, month, day}',properties:{year:{type:'integer'},month:{type:'integer'},day:{type:'integer'}}};
const timeObj={type:'object',description:'Time of day as {hours, minutes, seconds} (UTC unless the course sets otherwise)',properties:{hours:{type:'integer'},minutes:{type:'integer'},seconds:{type:'integer'}}};
const workFields={title:string,description:string,state:{type:'string',enum:['PUBLISHED','DRAFT']},maxPoints:num,dueDate:dateObj,dueTime:timeObj,scheduledTime:{type:'string',description:'RFC3339 time the work becomes visible to students'},topicId:string,materials:{type:'array',description:'Attached materials as Google CourseWork material objects (driveFile, link, youTubeVideo or form)',items:{type:'object'}}};
const workArg={courseId:string,courseWorkId:string};
const subArg={courseId:string,courseWorkId:string,submissionId:string};

export const tools=[
 {name:'classroom_list_courses',description:'List Google Classroom courses this account teaches or is enrolled in. Pass teacherId or studentId ("me" works), pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({teacherId:string,studentId:string,courseStates,...paging})},
 {name:'classroom_get_course',description:'Get one Google Classroom course',inputSchema:props(courseArg,['courseId'])},
 {name:'classroom_create_course',description:'Create a Google Classroom course. ownerId defaults to "me"; set courseState PROVISIONED to create it without activating it.',inputSchema:props({ownerId:string,...courseFields},['name'])},
 {name:'classroom_update_course',description:'PUT replace a Classroom course: fields you leave out may be cleared by Google. Use classroom_patch_course to change only some fields.',inputSchema:props({courseId:string,...courseFields},['courseId','name'])},
 {name:'classroom_patch_course',description:'PATCH selected fields of a Classroom course; only the fields you pass change.',inputSchema:props({courseId:string,...courseFields},['courseId'])},
 {name:'classroom_delete_course',description:'Delete a Google Classroom course. Only the course owner can delete it, and it must be archived first.',inputSchema:props(courseArg,['courseId'])},
 {name:'classroom_list_course_aliases',description:'List the aliases of a Classroom course. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({courseId:string,...paging},['courseId'])},
 {name:'classroom_create_course_alias',description:'Add an alias to a Classroom course, e.g. a domain-scoped alias like "d:math-101" or a project-scoped "p:algebra".',inputSchema:props({courseId:string,alias:string},['courseId','alias'])},
 {name:'classroom_delete_course_alias',description:'Remove an alias from a Classroom course',inputSchema:props({courseId:string,alias:string},['courseId','alias'])},
 {name:'classroom_list_students',description:'List the students of a Classroom course. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({courseId:string,...paging},['courseId'])},
 {name:'classroom_get_student',description:'Get one student of a Classroom course (userId may be an email address or "me")',inputSchema:props({courseId:string,userId:string},['courseId','userId'])},
 {name:'classroom_add_student',description:'Add a student to a Classroom course directly (userId may be an email address). To invite by enrollment code instead, pass enrollmentCode.',inputSchema:props({courseId:string,userId:string,enrollmentCode:string},['courseId','userId'])},
 {name:'classroom_remove_student',description:'Remove a student from a Classroom course',inputSchema:props({courseId:string,userId:string},['courseId','userId'])},
 {name:'classroom_list_teachers',description:'List the teachers of a Classroom course. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({courseId:string,...paging},['courseId'])},
 {name:'classroom_get_teacher',description:'Get one teacher of a Classroom course (userId may be an email address or "me")',inputSchema:props({courseId:string,userId:string},['courseId','userId'])},
 {name:'classroom_add_teacher',description:'Add a teacher to a Classroom course (userId may be an email address)',inputSchema:props({courseId:string,userId:string},['courseId','userId'])},
 {name:'classroom_remove_teacher',description:'Remove a teacher from a Classroom course',inputSchema:props({courseId:string,userId:string},['courseId','userId'])},
 {name:'classroom_list_invitations',description:'List Classroom course invitations, optionally filtered by userId or courseId. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({userId:string,courseId:string,...paging})},
 {name:'classroom_get_invitation',description:'Get one Classroom course invitation',inputSchema:props({invitationId:string},['invitationId'])},
 {name:'classroom_create_invitation',description:'Invite a person to join a Classroom course as a STUDENT or TEACHER. Google emails them the invitation.',inputSchema:props({userId:string,courseId:string,role:{type:'string',enum:['STUDENT','TEACHER']}},['userId','courseId','role'])},
 {name:'classroom_delete_invitation',description:'Delete (withdraw) a Classroom course invitation',inputSchema:props({invitationId:string},['invitationId'])},
 {name:'classroom_accept_invitation',description:'Accept a Classroom course invitation addressed to this account',inputSchema:props({invitationId:string},['invitationId'])},
 {name:'classroom_list_coursework',description:'List the coursework of a Classroom course. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({courseId:string,courseWorkStates:workStates,orderBy:{type:'string',description:'e.g. "updateTime desc" or "dueDate asc"'},...paging},['courseId'])},
 {name:'classroom_get_coursework',description:'Get one piece of Classroom coursework',inputSchema:props(workArg,['courseId','courseWorkId'])},
 {name:'classroom_create_coursework',description:'Create coursework in a Classroom course. workType defaults to ASSIGNMENT; for MULTIPLE_CHOICE_QUESTION pass multipleChoiceChoices. state defaults to PUBLISHED; use DRAFT to hold it back.',inputSchema:props({courseId:string,...workFields,workType:{type:'string',enum:['ASSIGNMENT','SHORT_ANSWER_QUESTION','MULTIPLE_CHOICE_QUESTION']},multipleChoiceChoices:{type:'array',items:string}},['courseId','title'])},
 {name:'classroom_update_coursework',description:'PUT replace a piece of Classroom coursework: fields you leave out may be cleared by Google. Use classroom_patch_coursework to change only some fields.',inputSchema:props({courseId:string,courseWorkId:string,...workFields},['courseId','courseWorkId','title'])},
 {name:'classroom_patch_coursework',description:'PATCH selected fields of a piece of Classroom coursework; only the fields you pass change.',inputSchema:props({courseId:string,courseWorkId:string,...workFields},['courseId','courseWorkId'])},
 {name:'classroom_delete_coursework',description:'Delete a piece of Classroom coursework (it must be a draft, or already deleted, per Google\'s rules)',inputSchema:props(workArg,['courseId','courseWorkId'])},
 {name:'classroom_list_submissions',description:'List student submissions for one piece of coursework (courseWorkId "-" means all coursework in the course). Teachers see every student; students see only their own. Pass pageSize/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:props({courseId:string,courseWorkId:string,userId:string,states:{type:'array',items:{type:'string',enum:['NEW','CREATED','TURNED_IN','RETURNED','RECLAIMED_BY_STUDENT']}},late:{type:'string',enum:['LATE_VALUES_UNSPECIFIED','LATE_ONLY','NOT_LATE_ONLY']},...paging},['courseId','courseWorkId'])},
 {name:'classroom_get_submission',description:'Get one student submission',inputSchema:props(subArg,['courseId','courseWorkId','submissionId'])},
 {name:'classroom_grade_submission',description:'Grade a student submission as the teacher: draftGrade is a working grade the student cannot see yet; assignedGrade is the final grade the student sees.',inputSchema:props({...subArg,draftGrade:num,assignedGrade:num},['courseId','courseWorkId','submissionId'])},
 {name:'classroom_return_submission',description:'Return a turned-in submission to the student as the teacher',inputSchema:props(subArg,['courseId','courseWorkId','submissionId'])},
 {name:'classroom_turn_in_submission',description:'Turn in your own student submission (transfers ownership of attached Drive files to the teacher)',inputSchema:props(subArg,['courseId','courseWorkId','submissionId'])},
 {name:'classroom_reclaim_submission',description:'Reclaim (unsubmit) your own turned-in submission so you can change it',inputSchema:props(subArg,['courseId','courseWorkId','submissionId'])},
 {name:'classroom_modify_submission_attachments',description:'Add attachments to your own student submission. Each attachment is a Google attachment object: {driveFile:{id}}, {link:{url}}, {youTubeVideo:{id}} or {form:{formUrl}}.',inputSchema:props({...subArg,addAttachments:{type:'array',items:{type:'object'}}},['courseId','courseWorkId','submissionId','addAttachments'])}
];
const courseBody=(a)=>({ownerId:a.ownerId||'me',...only(a,['name','section','descriptionHeading','description','room','courseState'])});
const courseReplaceBody=(a)=>({id:a.courseId,...only(a,['name','section','descriptionHeading','description','room','courseState'])});
const patchMask=(a,fields)=>fields.filter(k=>a[k]!==undefined);
const workBody=(a,withId)=>({
 ...(withId?{id:a.courseWorkId}:{}),
 ...only(a,['title','description','workType','state','maxPoints','dueDate','dueTime','scheduledTime','topicId','materials']),
 ...(a.workType==='SHORT_ANSWER_QUESTION'?{shortAnswerQuestion:{}}:{}),
 ...(a.workType==='MULTIPLE_CHOICE_QUESTION'?{multipleChoiceQuestion:{choices:a.multipleChoiceChoices||[]}}:{}),
 ...(a.workType===undefined||a.workType==='ASSIGNMENT'?{assignment:{}}:{})
});
const roster=(kind)=>({
 list:async(args,{classroom})=>listResult(args,(await classroom.courses[kind].list({courseId:args.courseId,...only(args,['pageSize','pageToken'])})).data,kind),
 get:async(args,{classroom})=>ok((await classroom.courses[kind].get({courseId:args.courseId,userId:args.userId})).data),
 add:async(args,{classroom})=>ok((await classroom.courses[kind].create({courseId:args.courseId,...only(args,['enrollmentCode']),requestBody:{userId:args.userId}})).data),
 remove:async(args,{classroom})=>{await classroom.courses[kind].delete({courseId:args.courseId,userId:args.userId});return ok({removed:args.userId});}
});
const students=roster('students'),teachers=roster('teachers');
const subCall=(method,extra={})=>async(args,{classroom})=>ok((await classroom.courses.courseWork.studentSubmissions[method]({courseId:args.courseId,courseWorkId:args.courseWorkId,id:args.submissionId,...extra})).data);
export const handlers={
 classroom_list_courses:async(args,{classroom})=>listResult(args,(await classroom.courses.list(only(args,['teacherId','studentId','courseStates','pageSize','pageToken']))).data,'courses'),
 classroom_get_course:async(args,{classroom})=>ok((await classroom.courses.get({id:args.courseId})).data),
 classroom_create_course:async(args,{classroom})=>ok((await classroom.courses.create({requestBody:courseBody(args)})).data),
 classroom_update_course:async(args,{classroom})=>ok((await classroom.courses.update({id:args.courseId,requestBody:courseReplaceBody(args)})).data),
 classroom_patch_course:async(args,{classroom})=>{
  const fields=patchMask(args,['name','section','descriptionHeading','description','room','courseState']);
  return ok((await classroom.courses.patch({id:args.courseId,updateMask:fields.join(','),requestBody:only(args,fields)})).data);
 },
 classroom_delete_course:async(args,{classroom})=>{await classroom.courses.delete({id:args.courseId});return ok({deleted:args.courseId});},
 classroom_list_course_aliases:async(args,{classroom})=>listResult(args,(await classroom.courses.aliases.list({courseId:args.courseId,...only(args,['pageSize','pageToken'])})).data,'aliases'),
 classroom_create_course_alias:async(args,{classroom})=>ok((await classroom.courses.aliases.create({courseId:args.courseId,requestBody:{alias:args.alias}})).data),
 classroom_delete_course_alias:async(args,{classroom})=>{await classroom.courses.aliases.delete({courseId:args.courseId,alias:args.alias});return ok({deleted:args.alias});},
 classroom_list_students:students.list,
 classroom_get_student:students.get,
 classroom_add_student:students.add,
 classroom_remove_student:students.remove,
 classroom_list_teachers:teachers.list,
 classroom_get_teacher:teachers.get,
 classroom_add_teacher:teachers.add,
 classroom_remove_teacher:teachers.remove,
 classroom_list_invitations:async(args,{classroom})=>listResult(args,(await classroom.invitations.list(only(args,['userId','courseId','pageSize','pageToken']))).data,'invitations'),
 classroom_get_invitation:async(args,{classroom})=>ok((await classroom.invitations.get({id:args.invitationId})).data),
 classroom_create_invitation:async(args,{classroom})=>ok((await classroom.invitations.create({requestBody:only(args,['userId','courseId','role'])})).data),
 classroom_delete_invitation:async(args,{classroom})=>{await classroom.invitations.delete({id:args.invitationId});return ok({deleted:args.invitationId});},
 classroom_accept_invitation:async(args,{classroom})=>{await classroom.invitations.accept({id:args.invitationId});return ok({accepted:args.invitationId});},
 classroom_list_coursework:async(args,{classroom})=>listResult(args,(await classroom.courses.courseWork.list({courseId:args.courseId,...only(args,['courseWorkStates','orderBy','pageSize','pageToken'])})).data,'courseWork'),
 classroom_get_coursework:async(args,{classroom})=>ok((await classroom.courses.courseWork.get({courseId:args.courseId,id:args.courseWorkId})).data),
 classroom_create_coursework:async(args,{classroom})=>ok((await classroom.courses.courseWork.create({courseId:args.courseId,requestBody:workBody(args,false)})).data),
 classroom_update_coursework:async(args,{classroom})=>ok((await classroom.courses.courseWork.update({courseId:args.courseId,id:args.courseWorkId,requestBody:workBody(args,true)})).data),
 classroom_patch_coursework:async(args,{classroom})=>{
  const fields=patchMask(args,['title','description','state','dueDate','dueTime','maxPoints','topicId','materials','scheduledTime']);
  return ok((await classroom.courses.courseWork.patch({courseId:args.courseId,id:args.courseWorkId,updateMask:fields.join(','),requestBody:only(args,fields)})).data);
 },
 classroom_delete_coursework:async(args,{classroom})=>{await classroom.courses.courseWork.delete({courseId:args.courseId,id:args.courseWorkId});return ok({deleted:args.courseWorkId});},
 classroom_list_submissions:async(args,{classroom})=>listResult(args,(await classroom.courses.courseWork.studentSubmissions.list({courseId:args.courseId,courseWorkId:args.courseWorkId,...only(args,['userId','states','late','pageSize','pageToken'])})).data,'studentSubmissions'),
 classroom_get_submission:async(args,{classroom})=>ok((await classroom.courses.courseWork.studentSubmissions.get({courseId:args.courseId,courseWorkId:args.courseWorkId,id:args.submissionId})).data),
 classroom_grade_submission:async(args,{classroom})=>{
  const fields=patchMask(args,['assignedGrade','draftGrade']);
  return ok((await classroom.courses.courseWork.studentSubmissions.patch({courseId:args.courseId,courseWorkId:args.courseWorkId,id:args.submissionId,updateMask:fields.join(','),requestBody:only(args,fields)})).data);
 },
 classroom_return_submission:subCall('return',{requestBody:{}}),
 classroom_turn_in_submission:subCall('turnIn',{requestBody:{}}),
 classroom_reclaim_submission:subCall('reclaim',{requestBody:{}}),
 classroom_modify_submission_attachments:async(args,{classroom})=>ok((await classroom.courses.courseWork.studentSubmissions.modifyAttachments({courseId:args.courseId,courseWorkId:args.courseWorkId,id:args.submissionId,requestBody:{addAttachments:args.addAttachments}})).data)
};
