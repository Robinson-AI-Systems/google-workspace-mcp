import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {testAccountEnrolled,passOptions} from '../../src/rtc/pass-options.js';
import {createFakeDb} from '../helpers/fake-db.js';

let original;
beforeEach(()=>{original=process.env.RTC_TEST_ACCOUNT_EMAILS;});
afterEach(()=>{if(original===undefined)delete process.env.RTC_TEST_ACCOUNT_EMAILS;
 else process.env.RTC_TEST_ACCOUNT_EMAILS=original;});

describe('P8-3 immediate TEST pass enrollment withdrawal',()=>{
 it('uses exact case-insensitive account identity and rejects malformed grants',()=>{
   expect(testAccountEnrolled('ops@rentals.test','ops@rentals.test')).toBe(true);
   expect(testAccountEnrolled('OPS@RENTALS.TEST','  first@other.test , ops@rentals.test ')).toBe(true);
   expect(testAccountEnrolled('ops@rentals.test','ops@rentals.test.evil.test')).toBe(false);
   expect(testAccountEnrolled('ops@rentals.test','ops@rentals.test.evil.test, nope')).toBe(false);
   expect(testAccountEnrolled('ops@rentals.test','')).toBe(false);
   expect(testAccountEnrolled(null,'ops@rentals.test')).toBe(false);
   expect(passOptions({googleAccount:'ops@rentals.test',areas:['workspace']}).profile).toBe('read_only');
 });
 it('stops every issued credential when TEST enrollment is removed, without provider writes',async()=>{
   const db=createFakeDb();
   await db.saveGoogleTokensFor('ops@rentals.test',{access_token:'FAKE_TEST_ONLY'});
   process.env.RTC_TEST_ACCOUNT_EMAILS='ops@rentals.test';
   const read=await db.createRtcPass({googleAccount:'ops@rentals.test',areas:['workspace']});
   const write=await db.createRtcPass({googleAccount:'ops@rentals.test',areas:['workspace'],
     allowWrites:true,confirmedAccount:'ops@rentals.test',hours:1});
   expect((await db.getRtcPass(read.token)).profile).toBe('read_only');
   expect((await db.getRtcPass(write.token)).allow_writes).toBe(true);
   process.env.RTC_TEST_ACCOUNT_EMAILS='different@other.test';
   expect(await db.getRtcPass(read.token)).toBeNull();
   expect(await db.getRtcPass(write.token)).toBeNull();
   expect(await db.rtcPassFailureCode(read.token)).toBe('permission');
   expect(await db.rtcPassFailureCode(write.token)).toBe('permission');
   await expect(db.createRtcPass({googleAccount:'ops@rentals.test'}))
     .rejects.toThrow('Scratch account not authorized');
   // Changing a process value neither widens nor revokes the durable pass;
   // permanent revocation remains a separate owner action.
   process.env.RTC_TEST_ACCOUNT_EMAILS='ops@rentals.test';
   expect(await db.getRtcPass(read.token)).not.toBeNull();
   expect(await db.revokeRtcPass(read.id)).toBe(1);
   expect(await db.getRtcPass(read.token)).toBeNull();
 });
});
