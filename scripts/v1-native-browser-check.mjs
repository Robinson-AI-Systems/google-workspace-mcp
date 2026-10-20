// Local forms only. No browser control, cookie/profile access, credentials or dependencies.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {configuration,startCrossSiteForms,ORIGIN} from './v1-live-csrf-browser.mjs';
import {clientScript} from './native-browser-client.mjs';

export async function prepare(expectedSha,directory){
 const forms=await startCrossSiteForms();
 try{
  await mkdir(directory,{recursive:true});
  const snippet=resolve(directory,'native-browser-snippet.js');
  await writeFile(snippet,clientScript(forms.origin,expectedSha),'utf8');
  return {...forms,snippet};
 }catch(error){await forms.close();throw error;}
}
async function main(argv){
 const prepareOnly=argv.at(-1)==='--prepare-only';
 const {expectedSha}=configuration(prepareOnly?argv.slice(0,-1):argv);
 const run=await prepare(expectedSha,resolve('native-browser-check-output'));
 try{
  console.log('Snippet: '+run.snippet);
  if(process.platform==='win32'){
   try{
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
     'Set-Clipboard -Value ([IO.File]::ReadAllText($env:WORKSPACE_CHECK_SNIPPET))'],
    {env:{...process.env,WORKSPACE_CHECK_SNIPPET:run.snippet},stdio:'ignore',timeout:10000});
    console.log('The reviewed snippet is copied to your clipboard. It contains no credentials.');
   }catch{console.log('Open the snippet in Notepad and copy its contents.');}
  }
  console.log('Keep this window open. Local form origin: '+run.origin);
  console.log('In regular Chrome/Edge, open a fresh private window: '+ORIGIN+'/api/account');
  console.log('Sign in normally. F12 > Sources > Snippets > New snippet. Paste the generated script and press Ctrl+Enter.');
  console.log('Follow the panel, copy the sanitized report after logout, close ALL private windows, then repeat for the other approved identity.');
  console.log('Ctrl+C stops the local form server. It does not log out your browser; finish logout in the panel first.');
  if(prepareOnly){console.log('PREPARE_ONLY: no browser opened or live service contacted.');return;}
  await new Promise(done=>{process.once('SIGINT',done);process.once('SIGTERM',done);});
 }finally{await run.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(()=>{
 console.error('INCOMPLETE: native launcher setup failed. No acceptance pass.');process.exitCode=2;
});
