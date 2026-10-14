// User-supplied replacements for F/G and new I. Sent verbatim, without a prefix.
export const USER_PROMPTS = {
  'sparse-identity': `Use the attached photograph as a fixed reference and reduce the face to only the lines that carry the most identity. Preserve the exact head pose, expression, asymmetry, eye spacing, brow angle, nose shape, mouth shape, jaw, glasses if present, and outer hair silhouette. The finished drawing should still unmistakably resemble the person when viewed small or overlaid on the photograph.

Think like a master caricature draftsman without caricaturing: identify the few unusual relationships that distinguish this face from an average face, then preserve those relationships precisely. Do not spend marks on generic anatomy. If a contour does not help recognition, omit it. Prioritize the most characteristic eyebrow or eye shapes, the bridge and underside of the nose, the mouth corners and smile shape, jaw turns, and the distinctive outer rhythm of the hair.

Use no more than about five continuous pen strokes total. Each stroke should accomplish several jobs rather than describing one isolated feature. For example, one stroke may discover an eyebrow, pass around part of an eye, descend beside the nose and continue toward the mouth; another may travel from cheek into jaw and neck. Allow selective retracing of an existing contour when necessary, but do not create arbitrary connector lines across blank areas merely to keep a stroke alive.

Use a single opaque black line of constant width on pure white, approximately 2–3 pixels at 1024 px. No shading, hatching, gray, tapering, texture, brush effects, dots, individual hairs, individual teeth, filled black shapes or background.

Avoid symbolic or generic facial shorthand: no almond-shaped stock eyes, triangle noses, outlined cartoon lips, symmetrical beautification, complete rings around features, or closed coloring-book contours. The drawing should feel observed rather than designed.

Aim for the economy of a great editorial portrait: very few marks, but every bend in the line should contain information about this specific person. White space should do most of the work.`,
  'sparse-pen-routes': `Treat the portrait as a path-planning problem for a physical pen that should remain on the page for as long as possible. Use the attached photograph as an exact positional reference: preserve the subject's identity, pose, expression, facial proportions, feature positions, jaw, glasses if present, and hair silhouette.

Construct the portrait from ideally one to three continuous journeys and never more than five strokes total. Before drawing, mentally plan each route so that it can pass naturally through several important facial structures. Prefer routes that follow real observed contours: brow into eye socket, eye toward nose, nose toward mouth, mouth toward cheek, cheek into jaw, jaw toward hair or neck. A line may reverse direction or retrace a short section of itself when this produces a believable continuous gesture.

Think of the line as if it were a bent piece of wire describing the face in space. Continuity must come from meaningful contour transitions, not from visible bridges drawn across empty skin. If two features cannot be joined without an artificial connector, lift the pen and begin a new stroke.

Keep the face sparse. Draw only the strongest identity-bearing portions of the eyes, brows, nose, mouth, jaw and outer hair mass. Leave contours unfinished. Hair should usually be a single open silhouette with a completely white interior. Do not draw individual strands.

Use one constant-width, solid opaque black line on pure white, approximately 3 pixels at 1024 px. No pressure variation, tapering, fading, dry brush, texture, shading, hatching, dots or filled shapes.

The result should look like a real artist solved the face as a small number of elegant continuous routes. It should remain recognizable because the routes pass through the correct landmarks, not because many details were included.`,
  'sparse-economical': `Make an extremely economical observational portrait from the attached photograph using only a handful of graceful black lines. Preserve the exact person, pose, expression, framing and proportions, but deliberately leave most of the photograph undrawn.

Search for the longest meaningful contours in the face. Favor elegant chains such as forehead → nose → lips → chin, brow → eye → cheek, or jaw → neck → outer hair silhouette. Let one line change function as it travels through the portrait. Use open contours and strategic gaps rather than completing every shape.

Use around three to five strokes total. Each stroke should be long, intentional and visually calm. Do not subdivide the portrait into separate little marks for each eye, nostril, lip corner or strand of hair. A feature may be represented by only one side or one accent if that is enough to preserve the likeness.

Accuracy is more important than decorative elegance: the face should align closely with the reference if overlaid. Preserve characteristic asymmetry and unusual proportions. Do not idealize or make the two eyes, brows or sides of the jaw more similar than they actually are.

Use a single-value, constant-width opaque black pen on pure white, approximately 2–3 pixels wide at 1024 px. No gray, shading, hatching, filled areas, texture, pressure changes, tapering, individual hairs or background.

Avoid logo-like smoothness and avoid generic continuous-line-art tropes such as decorative spirals, arbitrary loops, complete eye symbols or closed lip shapes. The line should feel like an economical observation of this particular face.

The final image should feel incomplete in a deliberate way: only the contours necessary for likeness remain, and the untouched white space completes the portrait.`
};
