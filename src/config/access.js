// The account gate for the web app. The list itself lives in shared/access.js
// so the server (sitemap) and the app read the same patterns; AccessGate
// (src/components/AccessGate.jsx) imports it from here and enforces it.
export { DEFAULT_SIGNED_IN_PATH, GATED_PATHS, isGatedPath } from '../../shared/access.js'
