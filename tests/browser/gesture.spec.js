import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
test('single-line real portrait and live spring snapshot',async({page})=>{
  test.skip(!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE to a local portrait.');
  await page.goto('/');await page.locator('#collection').selectOption('gesture');await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);
  await page.getByRole('button',{name:'Generate studies'}).click();
  await expect(page.locator('#status')).toContainText('3 studies ready',{timeout:90000});
  const waiting=page.waitForEvent('download');await page.locator('#downloadAll').click();
  const download=await waiting,files=unzipSync(await readFile(await download.path()));
  await mkdir('examples/gesture-v3',{recursive:true});
  for(const id of ['spring','sparse','scribble']){
    const svg=strFromU8(files[`${id}.svg`]);expect((svg.match(/<path d="M/g)||[]).length).toBe(1);
    await writeFile(`examples/gesture-v3/${id}.svg`,svg);
  }
  await writeFile('examples/gesture-v3/settings.json',files['settings.json']);await download.saveAs('examples/gesture-v3/studies.zip');
  for(const name of ['Spring single-line','Sparse contrast gesture','Residual scribble']){
    await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();
    await page.locator('#largePreview').screenshot({path:`examples/gesture-v3/${name.toLowerCase().replaceAll(' ','-')}.png`});
    await page.getByRole('button',{name:'Close'}).click();
  }
  await page.locator('#liveSpring').click();await expect(page.locator('#status')).toContainText('simulation updates/s',{timeout:30000});
  await expect(page.locator('#springPreview')).toBeVisible();await page.locator('#freezeSpring').click();
  await expect(page.locator('#status')).toContainText('Spring gesture frozen');await expect(page.locator('.card')).toHaveCount(1);
});

test('live spring camera updates use persistent worker and can be canceled',async({page})=>{
  await page.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#999';ctx.fillRect(0,0,640,480);return c.captureStream(10);};
    navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'test',label:'Test camera'}];
  });
  await page.goto('/');await page.locator('#startCamera').click();await page.locator('#capture').click();
  await page.locator('#removeBg').uncheck();await page.locator('#followCamera').check();await page.locator('#gesturePoints').fill('500');await page.locator('#resolution').selectOption('480');
  await page.locator('#liveSpring').click();await expect(page.locator('#status')).toContainText('camera frames',{timeout:30000});
  await expect(page.locator('#status')).toContainText(/· [1-9]\d* camera frames/,{timeout:30000});
  await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('Spring animation canceled');await expect(page.locator('#generate')).toBeEnabled();
});
