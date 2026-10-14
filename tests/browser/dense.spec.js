import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {denseStyles} from '../../src/dense.js';
for(const mode of ['demo','glasses','photo'])test(`dense portraits on ${mode}`,async({page})=>{
 test.skip(mode==='photo'&&!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE.');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#collection').selectOption('dense');
 if(mode==='photo')await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);else await page.locator(mode==='glasses'?'#glassesDemo':'#demo').click();
 await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('5 studies ready',{timeout:90000});
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const download=await waiting;
 const files=unzipSync(await readFile(await download.path())),settings=JSON.parse(strFromU8(files['settings.json']));
 const base=settings.studies[0].lengthMm;
 for(const s of settings.studies){expect(s.strokes).toBe(1);expect(s.lengthMm).toBeLessThanOrEqual(settings.travelBudget*1000*(s.id==='dense-control'?1:settings.inkMultiplier)+.1);if(s.id!=='dense-control')expect(s.lengthMm).toBeGreaterThan(base*2);}
 const folder=`examples/dense-v6/${mode}`;await mkdir(folder,{recursive:true});await download.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/settings.json`,files['settings.json']);await page.locator('#original').screenshot({path:`${folder}/source.png`});
 for(const [id,name]of denseStyles){await writeFile(`${folder}/${id}.svg`,files[`${id}.svg`]);await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();}expect(errors).toEqual([]);
});
