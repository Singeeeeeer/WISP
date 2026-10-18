const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();let modelRequests=0;
  await page.route('**/api/check',route=>{modelRequests++;return route.abort();});
  await page.goto(process.argv[2]);
  await page.getByRole('button',{name:'Open Bookstore event proposal',exact:true}).click();
  await page.getByLabel('Bookstore event proposal text').click({button:'right'});
  await page.getByRole('menuitem',{name:'Check',exact:true}).click();
  await page.getByLabel('Execution mode',{exact:true}).selectOption('gemini');
  const check=await page.getByLabel('Execution mode',{exact:true}).inputValue();
  await page.getByLabel('Execution mode',{exact:true}).selectOption('local');
  await page.getByRole('button',{name:'Run local check',exact:true}).click();
  await page.getByRole('button',{name:'Summon familiar again',exact:true}).click();
  await page.getByLabel('Execution mode',{exact:true}).selectOption('gemini');
  const scout=await page.getByLabel('Execution mode',{exact:true}).inputValue();
  if(check!=='gemini'||scout!=='gemini'||modelRequests!==0)throw Error('Browser verification failed');
  console.log(JSON.stringify({localCheck:'passed',checkSelected:check,scoutSelected:scout,modelRequests}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
