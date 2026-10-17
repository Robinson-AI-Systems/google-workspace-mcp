import {sendPage,privacyInfo} from '../src/principals/public-information.js';
export default (req,res)=>sendPage(req,res,'Privacy and data use',privacyInfo);
