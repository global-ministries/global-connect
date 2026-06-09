import { supportAttachmentFinalizeRoute } from '@/lib/support/r2-routes'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  return supportAttachmentFinalizeRoute(request)
}
