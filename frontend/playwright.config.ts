import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests. They start (or reuse) the Django API and the Vite dev server.
 *
 *   npm run e2e                       # uses installed Chromium (npx playwright install chromium)
 *   $env:PW_CHANNEL="msedge"; npm run e2e   # Windows: use the installed Microsoft Edge instead
 *
 * WebGL runs on SwiftShader (software) so the suite also works on CI machines
 * without a GPU; timeouts are generous for that reason.
 */
// E2E_BASE_URL points the suite at an already running deployment (e.g. the
// production build via `vite preview`, or the Docker stack) and skips the dev servers.
const external = process.env.E2E_BASE_URL
const python = process.env.PYTHON ?? (process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python')

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: external ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PW_CHANNEL,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: external
    ? undefined
    : [
    {
      command: `${python} manage.py runserver 127.0.0.1:8000 --noreload`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/health/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
