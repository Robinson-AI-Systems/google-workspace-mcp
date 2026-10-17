import {sendPage,supportInfo} from '../src/principals/public-information.js';
export default (req,res)=>sendPage(req,res,'Support',supportInfo());
