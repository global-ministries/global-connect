import { supportExternalInboundRoute } from '@/lib/support/external-bridge'

export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  return supportExternalInboundRoute(request)
}
