import {test,expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';

for(const mode of ['demo','photo'])test(`actual PyTSPArt API on ${mode}`,async({page})=>{
 test.skip(mode==='photo'&&!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE');
 await page.goto('/');await page.locator('#collection').selectOption('pytspart');await expect(page.locator('#backendStatus')).toContainText('installed');
 if(mode==='photo')await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);else await page.locator('#demo').click();
 if(mode==='demo'){await page.locator('#tspPoints').fill('600');await page.locator('#tspIterations').fill('5');await page.locator('#tspSeconds').fill('3');}
 await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('1 studies ready',{timeout:110000});
 const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();const dl=await waiting;
 const files=unzipSync(await readFile(await dl.path())),svg=strFromU8(files['pytspart.svg']);expect((svg.match(/<path d="M/g)||[]).length).toBe(1);expect(svg).not.toMatch(/NaN|Infinity/);
 const settings=JSON.parse(strFromU8(files['settings.json']));expect(settings.studies[0].vertices).toBe(settings.tspPoints+1);
 const folder=`examples/library-v7/${mode}`;await mkdir(folder,{recursive:true});await dl.saveAs(`${folder}/studies.zip`);await writeFile(`${folder}/pytspart.svg`,svg);await writeFile(`${folder}/settings.json`,files['settings.json']);await page.locator('#original').screenshot({path:`${folder}/source.png`});
 await page.getByRole('button',{name:'Enlarge PyTSPArt + OR-Tools',exact:true}).click();await page.locator('#largePreview').screenshot({path:`${folder}/pytspart.png`});
});

test('API rejects invalid requests and cancellation releases worker',async({page,request})=>{
 const rejected=await request.post('/api/portrait',{headers:{Origin:'https://example.org'},data:{engine:'pytspart'}});expect(rejected.status()).toBe(403);
 const invalid=await request.post('/api/portrait',{data:{engine:'arbitrary-command'}});expect(invalid.status()).toBe(400);
 await page.goto('/');await page.locator('#collection').selectOption('pytspart');await page.locator('#demo').click();await page.locator('#tspIterations').fill('80');await page.locator('#generate').click();await expect(page.locator('#status')).toContainText('Voronoi',{timeout:30000});await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('canceled');
 await expect.poll(async()=> (await (await request.get('/api/portrait/health')).json()).busy).toBe(false);
});
