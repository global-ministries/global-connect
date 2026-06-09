import { supportAttachmentDownloadHeadRoute, supportAttachmentDownloadRoute } from '@/lib/support/r2-routes'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params
  return supportAttachmentDownloadRoute(request, attachmentId)
}

export async function HEAD(request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await context.params
  return supportAttachmentDownloadHeadRoute(request, attachmentId)
}
