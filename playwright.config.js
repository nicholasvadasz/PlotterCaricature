import { defineConfig } from '@playwright/test';
// The product UI focuses on image generation and local tracing. The older browser specs
// exercise collections and controls that were removed from the page.
export default defineConfig({testDir:'./tests/browser',testMatch:'gemini.spec.js',timeout:120000,workers:1,use:{browserName:'chromium',channel:'msedge',baseURL:'http://127.0.0.1:5182',viewport:{width:1440,height:1000}},webServer:{command:'npm run dev -- --port 5182 --strictPort',url:'http://127.0.0.1:5182',reuseExistingServer:false}});
