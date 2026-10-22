// Writes the iOS app's copy of the plain-English glossary from
// shared/glossary.js, so the app's ⓘ definitions match the website's.
//
//   node scripts/sync-glossary.mjs           write if changed
//   node scripts/sync-glossary.mjs --check   exit 1 if the copy is stale

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GLOSSARY, GLOSSARY_GROUPS } from '../shared/glossary.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'ios/BallotWatch/Resources/glossary.json')

const terms = {}
for (const [id, e] of Object.entries(GLOSSARY)) terms[id] = { term: e.term, group: e.group, def: e.def }
const json = `${JSON.stringify({ groups: GLOSSARY_GROUPS, order: Object.keys(GLOSSARY), terms }, null, 2)}\n`

const current = existsSync(out) ? readFileSync(out, 'utf8') : ''
if (process.argv.includes('--check')) {
  if (current !== json) {
    console.error('ios/BallotWatch/Resources/glossary.json is stale: run node scripts/sync-glossary.mjs')
    process.exit(1)
  }
  console.log('glossary.json is up to date')
} else if (current !== json) {
  writeFileSync(out, json)
  console.log('wrote ios/BallotWatch/Resources/glossary.json')
} else {
  console.log('glossary.json already up to date')
}
