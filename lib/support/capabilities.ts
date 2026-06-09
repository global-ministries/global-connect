export const SUPPORT_CAPABILITIES = [
  'support.view',
  'support.reply',
  'support.manage',
] as const

export type SupportCapability = (typeof SUPPORT_CAPABILITIES)[number]

export const SUPPORT_CAPABILITY_LABELS = {
  'support.view': 'View support tickets',
  'support.reply': 'Reply to support tickets',
  'support.manage': 'Manage support tickets',
} satisfies Record<SupportCapability, string>

export function isSupportCapability(value: string): value is SupportCapability {
  return SUPPORT_CAPABILITIES.some((capability) => capability === value)
}
