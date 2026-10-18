import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/canvas',testMatch:'*.spec.ts',workers:1,fullyParallel:false,timeout:45000,
 reporter:[['list'],['json',{outputFile:'test-results/email-canvas-results.json'}]],
 use:{baseURL:'http://127.0.0.1:18979',headless:true,actionTimeout:10000,viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'npm exec vite -- --host 127.0.0.1 --port 18979 --strictPort',url:'http://127.0.0.1:18979/tests/canvas/index.html',reuseExistingServer:false,timeout:30000},
});
