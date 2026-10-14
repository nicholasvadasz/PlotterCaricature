import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
test('demo generates nine studies and a valid downloadable archive',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await page.locator('#collection').selectOption('original');await page.locator('#resolution').selectOption('480');await page.getByRole('button',{name:'Try demo'}).click();await page.getByRole('button',{name:'Generate studies'}).click();
  await expect(page.locator('#status')).toContainText('9 studies ready',{timeout:90000});
  await expect(page.locator('.card')).toHaveCount(9);await expect(page.locator('.badge').filter({hasText:'Continuous'})).toHaveCount(4);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download ZIP'}).click();const download=await downloadPromise;
  const files=unzipSync(await readFile(await download.path()));expect(Object.keys(files).length).toBe(11);
  for(const id of ['connected','serpentine','spiral','tsp'])expect((strFromU8(files[`${id}.svg`]).match(/<path d="M/g)||[]).length).toBe(1);
  await page.getByRole('button',{name:'Enlarge One-line face',exact:true}).click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'Close'}).click();
  await page.screenshot({path:'test-results/contact-sheet.png',fullPage:true});expect(errors).toEqual([]);
});
test('real photo runs local face and segmentation models',async({page})=>{
  test.skip(!process.env.PORTRAIT_TEST_IMAGE,'Set PORTRAIT_TEST_IMAGE to a local front-facing portrait.');
  await page.goto('/');await page.locator('#collection').selectOption('portrait');await page.locator('#upload').setInputFiles(process.env.PORTRAIT_TEST_IMAGE);await page.getByRole('button',{name:'Generate studies'}).click();
  await expect(page.locator('#status')).toContainText('5 studies ready',{timeout:90000});await expect(page.locator('#notice')).toHaveText('');
  await expect(page.locator('.card')).toHaveCount(5);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', {name:'Download ZIP'}).click();
  const result = await downloadPromise; await result.saveAs('test-results/real-portrait-studies.zip');
  for (const name of ['Flow portrait','Form-following etching','Tonal engraving','Relaxed stipple','Particle one-line']) {
    await page.getByRole('button',{name:`Enlarge ${name}`,exact:true}).click();
    await page.locator('#largePreview').screenshot({path:`test-results/${name.toLowerCase().replaceAll(' ','-')}.png`});
    await page.getByRole('button',{name:'Close'}).click();
  }
  const maskStats=await page.locator('#prepared').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let white=0,dark=0;for(let i=0;i<d.length;i+=4){if(d[i]>250)white++;if(d[i]<180)dark++;}return{white,dark};});
  expect(maskStats.white).toBeGreaterThan(1000);expect(maskStats.dark).toBeGreaterThan(1000);
  await page.screenshot({path:'test-results/real-portrait.png',fullPage:true});
});
test('camera capture works through browser media interface',async({browser})=>{
  const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();
  await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#abc';ctx.fillRect(0,0,640,480);return c.captureStream(10);};navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'test-camera',label:'Test C920'}];});
  await page.goto('/');await page.getByRole('button',{name:'Start camera',exact:true}).click();await expect(page.getByRole('button',{name:'Take photo'})).toBeEnabled();await page.getByRole('button',{name:'Take photo'}).click();await expect(page.getByRole('button',{name:'Generate studies'})).toBeEnabled();await page.getByRole('button',{name:'Stop',exact:true}).click();await expect(page.getByRole('button',{name:'Take photo'})).toBeDisabled();await context.close();
});

test('new controls support all studies, seeds and canceling without losing completed downloads',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Try demo'}).click();
  await page.locator('#collection').selectOption('all');await page.locator('#resolution').selectOption('480');
  await page.locator('#detail').fill('10');await page.locator('#relaxation').fill('4');
  await page.getByRole('button',{name:'Next seed'}).click();await expect(page.locator('#seed')).toHaveValue('43');
  await page.getByRole('button',{name:'Generate studies'}).click();
  await expect(page.locator('#status')).toContainText('14 studies ready',{timeout:90000});await expect(page.locator('.card')).toHaveCount(14);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download ZIP'}).click();
  const files=unzipSync(await readFile(await (await downloadPromise).path()));expect(Object.keys(files).length).toBe(16);
  expect(JSON.parse(strFromU8(files['settings.json'])).seed).toBe(43);
  await page.locator('#detail').fill('100');await page.locator('#relaxation').fill('40');
  await page.getByRole('button',{name:'Generate studies'}).click();await expect(page.locator('#cancel')).toBeEnabled();
  await expect(page.locator('#seed')).toBeDisabled();await page.locator('#cancel').click();
  await expect(page.locator('#status')).toContainText('Drawing canceled');await expect(page.locator('#downloadAll')).toBeEnabled();
  await expect(page.locator('.card')).toHaveCount(14);await expect(page.locator('#seed')).toBeEnabled();
});

