const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();let modelRequests=0;
  await page.route('**/api/check',route=>{modelRequests++;return route.abort();});
  await page.goto(process.argv[2]);
  await page.getByRole('button',{name:'打开书店活动提案',exact:true}).click();
  await page.getByLabel('书店活动提案正文').click({button:'right'});
  await page.getByRole('menuitem',{name:'Check',exact:true}).click();
  await page.getByLabel('执行方式',{exact:true}).selectOption('gemini');
  const check=await page.getByLabel('执行方式',{exact:true}).inputValue();
  await page.getByLabel('执行方式',{exact:true}).selectOption('local');
  await page.getByRole('button',{name:'运行本地检查',exact:true}).click();
  await page.getByRole('button',{name:'继续召唤使魔',exact:true}).click();
  await page.getByLabel('执行方式',{exact:true}).selectOption('gemini');
  const scout=await page.getByLabel('执行方式',{exact:true}).inputValue();
  if(check!=='gemini'||scout!=='gemini'||modelRequests!==0)throw Error('Browser verification failed');
  console.log(JSON.stringify({localCheck:'passed',checkSelected:check,scoutSelected:scout,modelRequests}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
