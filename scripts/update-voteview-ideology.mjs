import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const CONGRESS = 119
const SOURCE_URL = `https://voteview.com/static/data/out/members/HS${CONGRESS}_members.csv`
const OUTPUT_PATH = resolve(`public/data/voteview-${CONGRESS}-members.json`)

function parseCsvLine(line) {
  const values = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(value)
      value = ''
    } else {
      value += character
    }
  }
  values.push(value)
  return values
}

const response = await fetch(SOURCE_URL)
if (!response.ok) {
  throw new Error(`Voteview download failed: HTTP ${response.status}`)
}

const lines = (await response.text()).trim().split(/\r?\n/)
const headers = parseCsvLine(lines.shift())
const index = Object.fromEntries(headers.map((header, position) => [header, position]))
const required = [
  'bioguide_id',
  'chamber',
  'nominate_dim1',
  'nominate_dim2',
  'nominate_geo_mean_probability',
  'nominate_number_of_votes',
  'nominate_number_of_errors',
]

for (const field of required) {
  if (index[field] == null) throw new Error(`Voteview CSV missing ${field}`)
}

const members = {}
for (const line of lines) {
  const row = parseCsvLine(line)
  const bioguideId = row[index.bioguide_id]
  const dimension1 = Number(row[index.nominate_dim1])
  if (!bioguideId || !Number.isFinite(dimension1)) continue

  members[bioguideId] = {
    chamber: row[index.chamber],
    dimension1,
    dimension2: Number(row[index.nominate_dim2]) || 0,
    geometricMeanProbability: Number(row[index.nominate_geo_mean_probability]) || 0,
    votes: Number(row[index.nominate_number_of_votes]) || 0,
    errors: Number(row[index.nominate_number_of_errors]) || 0,
  }
}

const payload = {
  congress: CONGRESS,
  source: 'Voteview Congressional Roll-Call Votes Database',
  sourceUrl: SOURCE_URL,
  methodologyUrl: 'https://voteview.com/articles/data_help_members',
  fetchedAt: new Date().toISOString(),
  members,
}

await mkdir(dirname(OUTPUT_PATH), { recursive: true })
await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`Wrote ${Object.keys(members).length} Voteview member records to ${OUTPUT_PATH}`)
