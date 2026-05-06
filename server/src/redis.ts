import Redis from 'ioredis'

const password = process.env.REDIS_PASSWORD

export const redisClient: Redis | null = password
  ? (() => {
      const c = new Redis(
        `redis://default:${password}@redis-17645.c77.eu-west-1-1.ec2.cloud.redislabs.com:17645`,
        {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          lazyConnect: false,
        }
      )
      c.on('error', () => {})
      return c
    })()
  : (console.warn('[Redis] REDIS_PASSWORD not set — reporting disabled'), null)
