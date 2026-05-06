import Redis from 'ioredis'
import * as fs from 'fs'
import * as path from 'path'

const INTERVAL_MINUTES = parseInt(process.argv[2] ?? '5', 10)
const INTERVAL_MS = (isNaN(INTERVAL_MINUTES) ? 5 : INTERVAL_MINUTES) * 60_000
const OUTPUT_FILE = path.join(__dirname, 'reported_facts.txt')

function buildUrl(): string {
  const password = process.argv[3] ?? process.env.REDIS_PASSWORD
  if (!password) throw new Error('Provide password as second argument or set REDIS_PASSWORD')
  return `redis://default:${password}@redis-17645.c77.eu-west-1-1.ec2.cloud.redislabs.com:17645`
}

async function scanAllKeys(client: Redis): Promise<string[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, batch] = await client.scan(cursor, 'MATCH', 'report:*', 'COUNT', 100)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  return keys
}

async function poll(client: Redis, known: Set<string>): Promise<void> {
  const keys = await scanAllKeys(client)
  const newIds = keys.map((k) => k.slice('report:'.length)).filter((id) => !known.has(id))
  if (newIds.length > 0) {
    fs.appendFileSync(OUTPUT_FILE, newIds.join('\n') + '\n')
    newIds.forEach((id) => known.add(id))
  }
  console.log(`[${new Date().toISOString()}] +${newIds.length} new | total: ${known.size}`)
}

async function main() {
  const client = new Redis(buildUrl())
  const known = new Set<string>(
    fs.existsSync(OUTPUT_FILE)
      ? fs.readFileSync(OUTPUT_FILE, 'utf8').split('\n').filter(Boolean)
      : []
  )
  console.log(`Polling every ${INTERVAL_MINUTES}m. Known: ${known.size}`)
  while (true) {
    await poll(client, known)
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
}

main().catch(console.error)
