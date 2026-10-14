import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {scribbleStyles} from '../../src/scribble.js';
for(const mode of ['photo','demo'])test(`scribble hybrids on ${mode}: single paths, budget and preview`,async({page})=>{
  test.skip(mode==='photo'&&!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE to a portrait.');
  await page.goto('/');await page.locator('#collection').selectOption('scribble');
  if(mode==='photo')await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);else await page.locator('#demo').click();
  await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('5 studies ready',{timeout:90000});
  const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const download=await waiting;
  const files=unzipSync(await readFile(await download.path())),settings=JSON.parse(strFromU8(files['settings.json']));
  expect(settings.studies.every(s=>s.strokes===1&&s.lengthMm<=settings.travelBudget*1000+.1)).toBe(true);
  const folder=`examples/scribble-v4/${mode}`;await mkdir(folder,{recursive:true});
  await download.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/settings.json`,files['settings.json']);
  for(const [id,name]of scribbleStyles){
    const svg=strFromU8(files[`${id}.svg`]);expect((svg.match(/<path d="M/g)||[]).length).toBe(1);await writeFile(`${folder}/${id}.svg`,svg);
    await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/${id}.png`});await page.locator('#closeLightbox').click();
  }
});
