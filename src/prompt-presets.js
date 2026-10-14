// Shared by the app and comparison script. Replacement F/G use new IDs so
// cached images from the retired prompts are never reused for these treatments.
export const PROMPT_PRESETS = [
  {id:'sparse-five',label:'A · Your five-stroke prompt'},
  {id:'sparse-hair',label:'B · Hair silhouette only'},
  {id:'sparse-face',label:'C · Face first, minimal hair'},
  {id:'sparse-previous',label:'D · Previous gesture + sparse hair'},
  {id:'archive-five-fifteen',label:'E · Earlier 5–15 stroke prompt'},
  {id:'sparse-identity',label:'F · Identity-first editorial portrait'},
  {id:'sparse-pen-routes',label:'G · Physical pen journeys'},
  {id:'sparse-connected',label:'H · Connected sparse gesture'},
  {id:'sparse-economical',label:'I · Economical open contours'}
];

// Production order is intentional; reuse the same prompt IDs and exact text.
export const PROD_PROMPT_PRESETS = ['sparse-five','sparse-identity','sparse-hair',
  'sparse-face','sparse-pen-routes','sparse-connected'].map(id=>PROMPT_PRESETS.find(p=>p.id===id));
export const SWATCH_STYLE = 'prod-swatch';
export const SWATCH_LAYOUT = {columns:3,rows:2,aspectRatio:'3:2'};
