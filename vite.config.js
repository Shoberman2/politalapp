import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    // E2E specs use @playwright/test (not installed by default in devDeps)
    // and run via `npm run test:e2e`. Exclude from vitest so unit-test runs
    // don't trip on the playwright import.
    exclude: ['node_modules', 'dist', 'test/e2e/**'],
  },
})
