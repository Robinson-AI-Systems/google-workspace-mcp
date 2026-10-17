import {sendPage,homeInfo} from '../src/principals/public-information.js';
// No unscoped owner account enumeration or Google client construction on /.
export default (req,res)=>sendPage(req,res,'Robinson Google Workspace MCP',homeInfo);
