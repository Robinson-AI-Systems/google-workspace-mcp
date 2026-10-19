import {sendPage,homeInfo} from '../src/principals/public-information.js';
import {PRODUCT_DISPLAY_NAME} from '../src/branding.js';
// No unscoped owner account enumeration or Google client construction on /.
export default (req,res)=>sendPage(req,res,PRODUCT_DISPLAY_NAME,homeInfo);
