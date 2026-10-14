import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
for(const mode of ['photo','astronaut','glasses'])test(`face curves retain details on ${mode}`,async({page})=>{
 const photo=mode==='astronaut'?process.env.PORTRAIT_SECOND_IMAGE:process.env.PORTRAIT_TEST_IMAGE;
 test.skip(mode!=='glasses'&&!photo,'Set PORTRAIT_TEST_IMAGE / PORTRAIT_SECOND_IMAGE');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#collection').selectOption('facegraph');
 if(mode!=='glasses')await page.locator('#upload').setInputFiles(photo);else await page.locator('#glassesDemo').click();
 await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('3 studies ready',{timeout:90000});
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const dl=await waiting,files=unzipSync(await readFile(await dl.path()));
 const settings=JSON.parse(strFromU8(files['settings.json']));expect(settings.studies[0].strokes).toBeGreaterThan(10);expect(settings.studies.slice(1).every(s=>s.strokes===1)).toBe(true);
 const folder=`examples/face-v8/${mode}`;await mkdir(folder,{recursive:true});await dl.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/settings.json`,files['settings.json']);await page.locator('#original').screenshot({path:`${folder}/source.png`});
 for(const [id,name] of [['face-reference','Facial detail reference'],['face-routed','Detailed continuous face'],['face-shaded','Shaded continuous face']]){
   const svg=strFromU8(files[`${id}.svg`]);expect(svg).not.toMatch(/NaN|Infinity/);if(id!=='face-reference')expect((svg.match(/<path d="M/g)||[]).length).toBe(1);await writeFile(`${folder}/${id}.svg`,svg);
   await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();
 }expect(errors).toEqual([]);
});
