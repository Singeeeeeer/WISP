// Explicit live validation with synthetic material in an isolated browser context.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=process.argv[2];
if(!config||!process.argv.includes('--live'))throw Error('Provide config path and explicit --live');
let occupied=false;try{await fetch('http://127.0.0.1:15189/api/health',{signal:AbortSignal.timeout(1000)});occupied=true;}catch{}if(occupied)throw Error('Validation port already in use');
const server=spawn(path.join(root,'.venv/Scripts/python.exe'),[path.join(root,'scripts/run_gemini_validation_api.py'),'--config',config],{cwd:root,windowsHide:true,stdio:'ignore'});
let browser;
const reports=[];
try {
 let ready=false;
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Validation server exited');try{const r=await fetch('http://127.0.0.1:15189/api/health');const h=await r.json();if(h.service==='wisp'&&h.model_status==='configured'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Validation server not ready');
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();page.setDefaultTimeout(200000);
 await page.route('**/api/check',async route=>{const response=await route.fetch({url:'http://127.0.0.1:15189/api/check',timeout:195000});const body=await response.json();reports.push({sample_kind:'synthetic live browser validation',http_status:response.status(),request:route.request().postDataJSON(),response:body});await route.fulfill({response});});
 await page.goto('http://127.0.0.1:15178/');
 const editor=page.getByLabel('Bookstore event proposal text');await editor.fill('合成验收提案。活动于11月8日开放。海报于11月10日定稿，随后开放报名。预算8000元，已报价6500元。');
 await page.getByTestId('save-proposal').filter({hasText:'Saved'}).waitFor();
 await page.getByRole('button',{name:'Open core abilities'}).click();await page.getByRole('menuitem',{name:'Check',exact:true}).click();await page.getByLabel('Execution mode',{exact:true}).selectOption('gemini');await page.getByRole('button',{name:'Run Gemini Check',exact:true}).click();
 await page.getByRole('heading',{name:/^Gemini:/}).waitFor();await page.getByText('Execution details',{exact:true}).click();await page.screenshot({path:path.join(root,'docs/screenshots/gemini-check-live.png')});await page.getByRole('button',{name:'Close check result'}).click();
 await page.getByRole('button',{name:'Open core abilities'}).click();await page.getByRole('menuitem',{name:'Summon',exact:true}).click();await page.getByRole('button',{name:'Scout Bat',exact:false}).click();await page.getByLabel('Execution mode',{exact:true}).selectOption('gemini');await page.getByRole('button',{name:'Summon familiar',exact:true}).click();
 await page.getByRole('complementary',{name:'Familiar task status'}).getByText(/1 unread/).waitFor();await page.getByRole('button',{name:'View familiar tasks'}).click();await page.getByRole('button',{name:'View reply'}).click();await page.getByRole('heading',{name:/^Gemini:/}).waitFor();await page.screenshot({path:path.join(root,'docs/screenshots/gemini-scout-live.png')});
 const stored=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('wisp-module-one');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const all=store=>new Promise((resolve,reject)=>{const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});const data={checks:await all('checks'),tasks:await all('tasks'),version:db.version};db.close();return data;});
 if(stored.checks.length!==1||stored.tasks.length!==1||stored.tasks[0].status!=='completed'||stored.tasks[0].result.execution!=='gemini'||stored.version!==6)throw Error('Persistence mismatch');
 console.log(JSON.stringify({success:true,calls:reports.length,records:stored.checks.length,tasks:stored.tasks.length,metadata:reports.map(x=>x.response.metadata)}));
} catch(e){console.log(JSON.stringify({success:false,error:e instanceof Error?e.message.slice(0,200):'validation failed',responses:reports.map(x=>({status:x.http_status,error_code:x.response.error?.code}))}));process.exitCode=1;}
finally {await writeFile(path.join(root,'docs/gemini-live-browser-20261018.json'),JSON.stringify(reports,null,2));await browser?.close();if(server.exitCode===null){const stopped=once(server,'exit');server.kill();await stopped;}}
