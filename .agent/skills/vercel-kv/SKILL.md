---
name: vercel-kv
description: Vercel KV (serverless Redis via Upstash) for caching, rate limiting, and shared state between serverless functions deployed on Vercel. Use only for dynamic shared state — static/page caching uses Next.js ISR and Edge Network automatically.
metadata:
  author: global-connect
  scope: global
  auto_invoke:
    - Implementing rate limiting in API routes
    - Caching expensive Supabase RPC results
    - Sharing transient state between serverless function invocations
    - Implementing server-side session tokens
    - Adding KV storage to Next.js route handlers
    - Setting up Vercel KV or Upstash Redis
    - Caching with expiration (TTL)
    - Preventing duplicate requests
---

# Vercel KV (Redis Serverless)

## When to Use
- ✅ Rate limiting (e.g., max 10 requests/min per user)
- ✅ Caching heavy RPC results with TTL (e.g., dashboard KPIs)
- ✅ Idempotency keys for critical actions
- ✅ Shared counters between separate serverless invocations
- ❌ Static pages → Use Next.js ISR / `revalidate`
- ❌ Per-request session → Use Supabase Auth (already has sessions)

## Setup
```bash
# Vercel CLI
vercel env pull .env.local
# Env vars added automatically:
# KV_URL, KV_REST_API_URL, KV_REST_API_TOKEN, KV_REST_API_READ_ONLY_TOKEN
```

```bash
pnpm add @vercel/kv
```

## Usage Patterns

### Rate Limiting
```ts
import { kv } from '@vercel/kv'

export async function rateLimit(userId: string, limit = 10, windowSec = 60) {
  const key = `rate:${userId}`
  const count = await kv.incr(key)
  if (count === 1) await kv.expire(key, windowSec)
  return count <= limit
}
```

### Cache Expensive RPC
```ts
import { kv } from '@vercel/kv'

export async function getCachedKPIs(temporadaId: string) {
  const cacheKey = `kpis:${temporadaId}`
  const cached = await kv.get(cacheKey)
  if (cached) return cached

  const data = await calcularKPIs(temporadaId) // heavy RPC
  await kv.set(cacheKey, data, { ex: 300 }) // 5 min TTL
  return data
}
```

### Invalidate Cache
```ts
await kv.del(`kpis:${temporadaId}`)
```

## Architecture Decision
In GlobalConnect on Vercel:
- **Primary cache**: Next.js ISR + Edge Network (free, automatic, zero config)
- **KV**: Only for dynamic shared state needing persistence across invocations
- **Cost model**: Pay-per-request (Upstash) — use TTL aggressively
