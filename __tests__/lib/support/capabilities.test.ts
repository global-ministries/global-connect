import {
  SUPPORT_CAPABILITIES,
  SUPPORT_CAPABILITY_LABELS,
  isSupportCapability,
} from '@/lib/support/capabilities'

describe('support capabilities', () => {
  it('exports the support capability tags required by the support ticket spec', () => {
    expect(SUPPORT_CAPABILITIES).toEqual([
      'support.view',
      'support.reply',
      'support.manage',
    ])
  })

  it('keeps a readable label for each support capability', () => {
    expect(SUPPORT_CAPABILITY_LABELS).toEqual({
      'support.view': 'View support tickets',
      'support.reply': 'Reply to support tickets',
      'support.manage': 'Manage support tickets',
    })
  })

  it('narrows only valid support capability strings', () => {
    expect(isSupportCapability('support.reply')).toBe(true)
    expect(isSupportCapability('support.delete')).toBe(false)
    expect(isSupportCapability('admin')).toBe(false)
  })
})
