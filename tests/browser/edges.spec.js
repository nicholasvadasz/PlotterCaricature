import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {edgeStyles} from '../../src/edges.js';
for(const mode of ['glasses','photo'])test(`edge studies on ${mode}`,async({page})=>{
  test.skip(mode==='photo'&&!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#collection').selectOption('edges');
  if(mode==='photo')await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);else await page.locator('#glassesDemo').click();
  await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('6 studies ready',{timeout:90000});
  await expect(page.locator('#edgeFigure')).toBeVisible();
  const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const download=await waiting;
  const files=unzipSync(await readFile(await download.path())),settings=JSON.parse(strFromU8(files['settings.json']));
  expect(settings.studies.every(s=>s.strokes===1&&s.lengthMm<=settings.travelBudget*1000+.1)).toBe(true);
  const folder=`examples/edges-v5/${mode}`;await mkdir(folder,{recursive:true});await download.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/settings.json`,files['settings.json']);
  await page.locator('#original').screenshot({path:`${folder}/source.png`});await page.locator('#edgePreview').screenshot({path:`${folder}/edges.png`});
  for(const [id,name]of edgeStyles){const svg=strFromU8(files[`${id}.svg`]);expect((svg.match(/<path d="M/g)||[]).length).toBe(1);await writeFile(`${folder}/${id}.svg`,svg);await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();}
  expect(errors).toEqual([]);
});
