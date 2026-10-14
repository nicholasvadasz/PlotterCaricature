// Explicit paid experiment CLI. Uses the same prompt and model code as the app.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {geminiKey,generateGemini} from '../backend/gemini.mjs';
const [input,output,style='gestural']=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/gemini-study.mjs color-crop.png output-directory [treatment-id]');
const root=process.cwd();
const image='data:image/png;base64,'+(await readFile(input)).toString('base64');
console.log(`Requesting one ${style} portrait from Gemini...`);
const result=await generateGemini({image,style},{key:await geminiKey(root),signal:AbortSignal.timeout(240000)});
await mkdir(output,{recursive:true});
const mime=result.image.slice(5,result.image.indexOf(';')),extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
await writeFile(path.join(output,`line-art.${extension}`),Buffer.from(result.image.split(',')[1],'base64'));
await writeFile(path.join(output,'reference.png'),Buffer.from(image.split(',')[1],'base64'));
const {image:generated,...metadata}=result;await writeFile(path.join(output,'generation.json'),JSON.stringify(metadata,null,2));
console.log(`Saved ${style} image and prompt to ${output}`);
