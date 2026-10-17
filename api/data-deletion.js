import {sendPage,deletionInfo} from '../src/principals/public-information.js';
export default (req,res)=>sendPage(req,res,'Disconnect and deletion',deletionInfo);
