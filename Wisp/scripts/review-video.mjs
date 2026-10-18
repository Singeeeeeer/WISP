import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out = 'docs/reference-review';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto('file:///C:/Users/jiyu1/xwechat_files/wxid_n77fmcijp97521_758c/msg/video/2026-10/c7e39e5afcba465ae0a779f7e59d4ea0.mp4');
  await page.waitForFunction(() => { const v=document.querySelector('video'); return v && v.readyState>=2; },null,{timeout:12000});
  const info = await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
  console.log(JSON.stringify(info));
  for (const [i, fraction] of [0,.25,.5,.75].entries()) {
    await page.locator('video').evaluate(async (v,f)=>{v.pause(); await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=Math.max(.01,v.duration*f);});},fraction);
    await page.screenshot({path:`${out}/video-${i}.png`});
  }
} catch(e) { console.log('VIDEO_SKIPPED: '+e.message); } finally { await browser.close(); }
