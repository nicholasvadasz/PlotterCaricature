# MAI-Image-2.6 via OpenRouter

MAI uses OpenRouter's dedicated Image API. You need an OpenRouter key and credits; no personal Azure resource, region, deployment or quota allocation is required by this adapter.

1. Add `OPENROUTER_API_KEY=your-key` to the existing `.env.local`, preserving your Gemini key. An environment variable with the same name takes precedence. Keep the key server-side; do not use a `VITE_` prefix.
2. Run `npm start` (or refresh the running app after it reloads). Select **MAI-Image-2.6 via OpenRouter** under **Image provider**. Expand **Image model and configuration** to see whether the local server found the key. This is a configuration check, not an authenticated generation test.
3. Upload/capture a portrait, review the color crop, choose **Full fidelity** or **Line minimization** and a pen treatment, then click **Generate portrait**. Production and All Prompts batches make four or nine image requests; Prod Swatch makes one request containing six panels.

The server posts JSON to `https://openrouter.ai/api/v1/images` with Bearer authentication, model `microsoft/mai-image-2.6`, the selected archived prompt and the unchanged crop as a base64 data URL in `input_references`. It requests one image (`n: 1`), uses `aspect_ratio: "auto"` for portraits or `"3:2"` for swatches, and disables web grounding through `provider.options.azure.web_grounding`. It does not request unsupported resolution settings. See the [OpenRouter Image API documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) and [MAI endpoint capabilities](https://openrouter.ai/api/v1/images/models/microsoft/mai-image-2.6/endpoints).

Both prompt modes apply to single portraits, batches and swatches. Tracing, route selection, SVG export and Inkscape remain local. Retracing makes no new image request and retains the original generation metadata.

Recovery copies are saved in `.private/mai/<generation-id>/`: `reference.png`, the generated image and `generation.json`. Metadata records the model, `apiProvider: "openrouter"`, prompt mode/version, full prompt and returned usage/cost. Keys are never included. Existing Gemini and older MAI archives remain readable.

The app explains authentication, credit and rate-limit errors without silently switching providers or retrying paid generations. Mocked tests cover reference-image requests, both prompt modes, swatches, errors, cancellation and local archives.
