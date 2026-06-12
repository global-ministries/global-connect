import { supportInngestRoute } from '@/lib/support/inngest-route'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return supportInngestRoute(request)
}
