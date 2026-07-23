/**
 * W10 — DT-059 — GDV mentor adapter interface.
 *
 * Read-only: NO writes, NO side effects.
 * Byte-identity: does NOT modify lib/platform/adapters/grupos-vida.ts.
 *
 * Production implementation: createGdvMentorSupabaseAdapter (gdv-mentor-supabase-adapter.ts)
 * Test implementation: createFakeGdvMentorAdapter (mentor-cascade-fakes.ts)
 */
import type { GdvMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

export { type GdvMentorAdapter }
