import { defineConfig } from '@playwright/test';

const discoveryOnly = process.env.GRANT_BROWSER_DISCOVERY === '1';
const e2ePort = process.env.GRANT_E2E_PORT ?? '18974';
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const e2eOutputDir = process.env.GRANT_E2E_OUTPUT_DIR ?? 'test-results';

export default defineConfig({
 testDir: './tests/browser', outputDir: e2eOutputDir, fullyParallel: false, workers: 1, timeout: 45000,
 reporter: [['list'],['json',{outputFile:`${e2eOutputDir}/browser-results.json`}]],
 use: { baseURL: e2eBaseUrl, headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
 ...(discoveryOnly ? {} : {
  webServer: { command: 'cd .. && uv run --frozen python tests/browser_server.py', url: e2eBaseUrl, reuseExistingServer: false, timeout: 30000 },
 }),
});
