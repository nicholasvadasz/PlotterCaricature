import { mkdir, cp, stat, writeFile, rename, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('public/models/', root), { recursive: true });
await cp(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root), new URL('public/wasm/', root), { recursive: true });
const models = {
  'selfie_segmenter.tflite': 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
  'face_landmarker.task': 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};
for (const [name, url] of Object.entries(models)) {
  const dest = new URL(`public/models/${name}`, root);
  if (await stat(dest).then(s => s.size > 100000).catch(() => false)) { console.log(`${name} already installed`); continue; }
  console.log(`Downloading ${name} from Google…`);
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 100000) throw new Error(`Incomplete model: ${name}`);
  const temp = new URL(`${dest.href}.partial`);
  await writeFile(temp, bytes);
  await rename(temp, dest).catch(async error => { await rm(temp, { force: true }); throw error; });
  console.log(`Saved ${name} (${bytes.length} bytes)`);
}
console.log('Ready. Run npm run dev. Models and processing are local.');
