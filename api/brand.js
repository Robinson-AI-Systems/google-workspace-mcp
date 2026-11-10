// Brand images: the product mark, the company icon and the favicon. Embedded
// in source (src/brand/assets.js), so serving them needs no file system and
// no outside request. Public, cacheable, and nothing but these four paths.
import {assetBytes} from '../src/brand/brand.js';
export default function handler(req,res){
 if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).send('Method not allowed');}
 const asked=typeof req.query?.asset==='string'?req.query.asset:'';
 const path=asked==='favicon.ico'?'/favicon.ico':'/brand/'+asked;
 const bytes=/^[a-z0-9.-]{1,40}$/.test(asked)?assetBytes(path):null;
 if(!bytes){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.status(404).send('Not found');}
 res.setHeader('Content-Type','image/png');
 res.setHeader('Cache-Control','public, max-age=86400');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='HEAD')return res.status(200).end();
 return res.status(200).send(bytes);
}
