import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 45000,
 reporter: [['list'],['json',{outputFile:'test-results/browser-results.json'}]],
 use: { baseURL: 'http://127.0.0.1:18974', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
 webServer: { command: 'cd .. && uv run --frozen python tests/browser_server.py', url: 'http://127.0.0.1:18974', reuseExistingServer: false, timeout: 30000 },
});
