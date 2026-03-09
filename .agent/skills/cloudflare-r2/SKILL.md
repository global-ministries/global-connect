---
name: cloudflare-r2
description: Cloudflare R2 S3-compatible object storage with zero egress fees. For GlobalConnect, Supabase Storage is the current solution. Use this skill when evaluating migration to R2 or integrating R2 for specific use cases where egress costs are a concern.
metadata:
  author: global-connect
  scope: global
  auto_invoke:
    - Migrating file storage from Supabase Storage to R2
    - Evaluating object storage costs and egress fees
    - Uploading large files or bulk assets to R2
    - Configuring R2 bucket with S3 SDK
    - Generating signed URLs for R2 objects
    - Setting up CORS for R2 in Next.js
    - Implementing CDN for media files via Cloudflare
---

# Cloudflare R2 — Object Storage

## Current State (GlobalConnect)
> **Supabase Storage is currently in use** for profile photos and assets (configured with RLS and signed URLs). This skill is for future migration planning or new high-volume asset use cases.

## When to Migrate to R2
- File storage exceeds Supabase free tier limits  
- Egress costs become significant (R2 = $0 egress vs S3/Supabase per-GB)
- Need CDN-level distribution via Cloudflare network
- Multi-region asset delivery required

## Setup
```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

```env
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_R2_ACCESS_KEY_ID=xxx
CLOUDFLARE_R2_SECRET_ACCESS_KEY=xxx
CLOUDFLARE_R2_BUCKET_NAME=global-connect-assets
CLOUDFLARE_R2_PUBLIC_URL=https://assets.yourdomain.com
```

## Client Setup (reuse S3 SDK)
```ts
import { S3Client } from '@aws-sdk/client-s3'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
})
```

## Signed Upload URL (Server Action)
```ts
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function getUploadUrl(key: string, contentType: string) {
  const url = await getSignedUrl(r2, new PutObjectCommand({
    Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 }) // 5 min

  return { url, publicUrl: `${process.env.CLOUDFLARE_R2_PUBLIC_URL}/${key}` }
}
```

## Comparison: Supabase Storage vs R2

| Factor | Supabase Storage | Cloudflare R2 |
|--------|-----------------|---------------|
| RLS integration | ✅ Native | ❌ Manual |
| Egress cost | Per GB | Free |
| CDN | Basic | Cloudflare global |
| Auth | Supabase JWT | Manual signing |
| Setup effort | Low | Medium |
