// Workspace Unleashed by Robinson AI Systems: the one look for every page this
// server shows people. Company tokens are the Robinson AI Systems brand
// (robinsonaisystems.com/assets/brand.css, the same values GitHub Unleashed
// uses: charcoal surfaces, emerald-to-teal gradient, Mist White text). This
// product's own accent is Violet #9A7BFF (docs/UNLEASHED-BRAND-SPEC.md §3,
// Library claims registry D-005). System fonts only: no outside font request.
// Owner ruling 2026-11-09: no page may carry another business's brand (the
// Robinson Appliance Rentals kit that had leaked onto the sign-in page).
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../branding.js';
import {ICON_256_PNG_BASE64,ICON_64_PNG_BASE64,UNLEASHED_WORKSPACE_256_PNG_BASE64} from './assets.js';

export const BRAND=Object.freeze({
 name:'Robinson AI Systems',website:'https://www.robinsonaisystems.com',
 product:PRODUCT_DISPLAY_NAME,productShort:'Workspace Unleashed',
 tagline:'Practical software. More capable AI.',
 disclaimer:PROVIDER_DISCLOSURE,
 reassurance:'We never ask for your Google password here.',
 emerald:'#00B67A',teal:'#00E3C2',charcoal:'#0C0C0C',graphite:'#1E1E1E',mist:'#F8FAF8',grey:'#9FA5A3',
 violet:'#9A7BFF' // Workspace Unleashed accent (brand spec §3, claims registry D-005)
});
export const ICON_PATH='/brand/icon-256.png';
export const PRODUCT_MARK_PATH='/brand/unleashed-workspace.png';
export const BRAND_ASSETS=Object.freeze({
 '/brand/icon-256.png':ICON_256_PNG_BASE64,
 '/brand/icon-64.png':ICON_64_PNG_BASE64,
 '/favicon.ico':ICON_64_PNG_BASE64,
 '/brand/unleashed-workspace.png':UNLEASHED_WORKSPACE_256_PNG_BASE64
});
export const assetBytes=path=>Object.hasOwn(BRAND_ASSETS,path)?Buffer.from(BRAND_ASSETS[path],'base64'):null;

export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Dark surface, Violet accent (links, focus ring, chosen option, primary
// button with Charcoal text: about 6:1 contrast), comfortable on a 412px phone.
export const BRAND_CSS=`:root{--bg:${BRAND.charcoal};--surface:${BRAND.graphite};--text:${BRAND.mist};--muted:${BRAND.grey};--border:#333;--brand:${BRAND.emerald};--teal:${BRAND.teal};--accent:${BRAND.violet};--on-accent:${BRAND.charcoal};--grad:linear-gradient(90deg,${BRAND.emerald},${BRAND.teal});--err:#FF6B6B}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:28px 18px 48px}main.wide{max-width:640px}
header.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}header.brand img{width:44px;height:44px;border-radius:10px}header.brand b{display:block;font:700 18px/1.2 Inter,-apple-system,'Segoe UI',sans-serif}header.brand small{color:var(--muted)}
h1{font:700 26px/1.2 Inter,-apple-system,'Segoe UI',sans-serif;margin:0 0 12px;letter-spacing:-.02em}h2{font:700 19px/1.3 Inter,-apple-system,'Segoe UI',sans-serif;margin:26px 0 8px}h3{font:700 16px/1.3 Inter,-apple-system,sans-serif;margin:16px 0 6px}
p{margin:0 0 14px}small,.muted,.hint{color:var(--muted)}.hint{font-size:14px}a{color:var(--accent)}ul,ol{padding-left:22px;margin:0 0 14px}li{margin:4px 0}
section{border-top:1px solid var(--border);padding-top:14px;margin-top:18px}
.addr{display:block;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:14px;margin:10px 0 18px;font:600 15px/1.4 ui-monospace,Menlo,Consolas,monospace;word-break:break-all;user-select:all}
code{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:1px 6px;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
form{display:grid;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;margin:14px 0}form.inline{display:inline;background:none;border:0;padding:0;margin:0}
label{display:grid;gap:6px}input[type=text],input[type=email],input[type=password],input:not([type]),select,textarea{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:11px;width:100%}
input:focus,select:focus,textarea:focus,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.choice{display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg)}.choice:has(input:checked){border-color:var(--accent);box-shadow:0 0 18px rgba(154,123,255,.25)}.choice input{margin-top:6px;accent-color:var(--accent)}.choice b{display:block}.choice span{display:block;color:var(--muted);font-size:14px}
button,a.button{display:inline-block;text-align:center;font:600 16px Inter,-apple-system,'Segoe UI',sans-serif;color:var(--on-accent);background:var(--accent);border:0;border-radius:50px;padding:13px 20px;cursor:pointer;text-decoration:none;width:100%}button:hover,a.button:hover{box-shadow:0 0 20px rgba(154,123,255,.35)}
button.secondary{background:transparent;color:var(--accent);border:1px solid var(--accent)}button.small{width:auto;padding:7px 14px;font-size:14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin:12px 0}.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
.tag{display:inline-block;font-size:13px;border-radius:20px;padding:1px 10px;border:1px solid var(--border);color:var(--muted)}.tag.good{border-color:var(--brand);color:var(--teal)}.tag.warn{border-color:var(--accent);color:var(--accent)}
.error,p[role=alert]{color:var(--err)}details{margin:12px 0}summary{cursor:pointer;color:var(--accent);font-weight:600}
footer{margin-top:28px;color:var(--muted);font-size:14px}footer nav{margin-top:8px}`;

export const brandHeader=()=>`<header class="brand"><img src="${PRODUCT_MARK_PATH}" alt="" width="44" height="44"><div><b>${esc(BRAND.product)}</b><small>${esc(BRAND.tagline)}</small></div></header>`;
export const brandFooter=()=>`<footer>${esc(BRAND.disclaimer)} ${esc(BRAND.reassurance)}<nav><a href="/">Home</a> · <a href="/api/account">My Workspace connections</a> · <a href="/api/privacy">Privacy</a> · <a href="/api/support">Support</a> · <a href="/api/data-deletion">Disconnect and delete</a> · <a href="${BRAND.website}" rel="noopener noreferrer">${esc(BRAND.name)}</a></nav></footer>`;

// One shell for every page and every state (approve, problem, expired, info).
export function brandPage(title,body,{wide=false}={}){
 const full=title===BRAND.product?title:title+' — '+BRAND.productShort;
 return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+esc(full)+'</title><link rel="icon" type="image/png" href="'+ICON_PATH+'">'+
  '<style>'+BRAND_CSS+'</style></head><body><main'+(wide?' class="wide"':'')+'>'+
  brandHeader()+body+brandFooter()+'</main></body></html>';
}
// Pages built on the shell allow their own images; nothing else changes.
export const BRAND_CSP="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'";
