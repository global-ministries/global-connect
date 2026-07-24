/**
 * W10 — Pastoral mentor cascade adapters.
 * Read-only adapters for GDV, taller, and servicio mentor resolution.
 *
 * Production (Supabase): use the *-supabase-adapter.ts files
 * Tests (in-memory): use mentor-cascade-fakes.ts
 */
export type { GdvMentorAdapter } from './gdv-mentor-adapter'
export type { GrupoCortoPlazoMentorAdapter, ServicioMentorAdapter } from '@/lib/platform/pastoral/mentor-cascade/types'

export { createGdvMentorSupabaseAdapter } from './gdv-mentor-supabase-adapter'
export { createGrupoCortoPlazoMentorAdapter as createGrupoCortoPlazoSupabaseAdapter } from './grupo-corto-plazo-supabase-adapter'
export { createServicioMentorAdapter as createServicioMentorSupabaseAdapter } from './servicio-mentor-supabase-adapter'
