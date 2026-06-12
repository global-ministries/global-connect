import { serve } from 'inngest/next'

import { supportInngestFunctions } from '@/lib/support/inngest-functions'
import { inngest } from '@/lib/support/inngest-client'

export const runtime = 'nodejs'

export const { GET, POST, PUT } = serve({ client: inngest, functions: supportInngestFunctions })
