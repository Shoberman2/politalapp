import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

// api/prerender.js injects records into the built index.html. Vercel moves
// dist/ into its static output before it bundles the functions, so a copy of
// the shell is written under api/_shell/ at the end of the Vite build; the
// function references that path with `new URL(..., import.meta.url)`, which
// the file tracer picks up and bundles. The directory is gitignored.
function copyShellForPrerender() {
  return {
    name: 'ballotwatch-copy-shell-for-prerender',
    apply: 'build',
    closeBundle() {
      const src = 'dist/index.html'
      if (!existsSync(src)) return
      mkdirSync('api/_shell', { recursive: true })
      copyFileSync(src, 'api/_shell/index.html')
    },
  }
}

export default defineConfig({
  plugins: [react(), copyShellForPrerender()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    // E2E specs use @playwright/test (not installed by default in devDeps)
    // and run via `npm run test:e2e`. Exclude from vitest so unit-test runs
    // don't trip on the playwright import.
    exclude: ['node_modules', 'dist', 'test/e2e/**'],
  },
})
