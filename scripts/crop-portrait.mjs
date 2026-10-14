// Reuse the app's actual face detector and color-crop pipeline, without a paid call.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [input,output,baseURL='http://127.0.0.1:5195']=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/crop-portrait.mjs photo output-directory [app-url]');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/api/gemini/generate',route=>route.abort());
 let resolveReference;
 const captured=new Promise(resolve=>{resolveReference=resolve;});
 await page.route('**/api/gemini/reference',async route=>{resolveReference(route.request().postDataJSON());await route.fulfill({json:{id:'local-crop-export'}});});
 await page.goto(baseURL);
 await page.locator('#upload').setInputFiles(input);
 const timeout=setTimeout(()=>resolveReference(null),60000);
 const result=await captured;clearTimeout(timeout);
 if(!result)throw new Error('The app did not prepare a reference in time. Check the face model and app URL.');
 await mkdir(output,{recursive:true});
 await writeFile(path.join(output,'reference.png'),Buffer.from(result.image.split(',')[1],'base64'));
 await writeFile(path.join(output,'reference.json'),JSON.stringify({input:path.resolve(input),...result.inputCrop},null,2));
 console.log(JSON.stringify({reference:path.resolve(output,'reference.png'),...result.inputCrop}));
}finally{await browser.close();}
