/**
 * S18 — Operating Core template render helper
 * Dispatches to the correct versioned template based on key
 */

import type {
  OperatingCoreTemplateKey,
  OperatingCoreTemplateProps,
  OperatingCoreTemplateVersionedKey,
} from './template-keys'

import { RegistrationConfirmedEmail } from '../../../../emails/operating-core/registration_confirmed.v1'
import { WaitlistPlacedEmail } from '../../../../emails/operating-core/waitlist_placed.v1'
import { WaitlistPromotedEmail } from '../../../../emails/operating-core/waitlist_promoted.v1'
import { CancellationLeaderEmail } from '../../../../emails/operating-core/cancellation_leader.v1'
import { EventReminderEmail } from '../../../../emails/operating-core/event_reminder.v1'
import { NoShowEmail } from '../../../../emails/operating-core/no_show.v1'

import type { ReactElement } from 'react'

export function renderOperatingCoreTemplate<
  K extends OperatingCoreTemplateKey,
>(
  key: K,
  versionedKey: OperatingCoreTemplateVersionedKey,
  props: OperatingCoreTemplateProps<K>
): ReactElement {
  // Enforce version suffix
  const expectedVersionedKey = `${key}.v1` as OperatingCoreTemplateVersionedKey
  if (versionedKey !== expectedVersionedKey) {
    throw new Error(
      `version mismatch: expected "${expectedVersionedKey}", got "${versionedKey}"`
    )
  }

  switch (key) {
    case 'registration_confirmed':
      return RegistrationConfirmedEmail(
        props as OperatingCoreTemplateProps<'registration_confirmed'>
      )
    case 'waitlist_placed':
      return WaitlistPlacedEmail(
        props as OperatingCoreTemplateProps<'waitlist_placed'>
      )
    case 'waitlist_promoted':
      return WaitlistPromotedEmail(
        props as OperatingCoreTemplateProps<'waitlist_promoted'>
      )
    case 'cancellation_leader':
      return CancellationLeaderEmail(
        props as OperatingCoreTemplateProps<'cancellation_leader'>
      )
    case 'event_reminder':
      return EventReminderEmail(
        props as OperatingCoreTemplateProps<'event_reminder'>
      )
    case 'no_show':
      return NoShowEmail(props as OperatingCoreTemplateProps<'no_show'>)
    default:
      // Exhaustiveness check — TypeScript will error if a case is missing
      const _exhaustive: never = key
      return _exhaustive
  }
}
