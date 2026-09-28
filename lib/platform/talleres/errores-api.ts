/**
 * T3 (odd/tasks/talleres-asistencia-lider.md) — shared translator from the
 * RAISE EXCEPTION messages of talleres-asistencia-lider's SQL functions into
 * an HTTP status plus a Spanish, user-facing message.
 *
 * T4 widens it one step: `reporte/enviar` also faces taller_reportes_lock_
 * after_send (the BEFORE UPDATE trigger that refuses to re-send an already
 * `enviado` reporte), whose message is English by design — it is translated
 * here too, so no RAISE text ever reaches the browser.
 *
 * The DB is the authorization authority: routes never re-implement who may
 * pass list or close a class, they only translate what the function refused.
 * The machine-readable `error` code mirrors what the rest of the talleres
 * routes already emit (`forbidden`, `not-found`, …) so no SQLSTATE or RAISE
 * text ever reaches the browser.
 */

/** Statuses shared by every translated failure. */
export interface ErrorTalleres {
  readonly status: number
  readonly error: string
  readonly message: string
}

interface Entrada {
  readonly status: number
  readonly error: string
  readonly message: string
}

/** Longest keys first so a key can never shadow a longer one. */
const MAPA: Readonly<Record<string, Entrada>> = {
  solo_el_lider_puede_cerrar_la_clase: {
    status: 403,
    error: 'forbidden',
    message: 'Sólo el líder de este grupo puede cerrar la clase.',
  },
  solo_el_lider_puede_enviar_el_reporte: {
    status: 403,
    error: 'forbidden',
    message: 'Sólo el líder de este grupo puede enviar el reporte.',
  },
  sin_permisos_para_este_grupo: {
    status: 403,
    error: 'forbidden',
    message: 'No tenés permisos para este grupo.',
  },
  INSCRIPCION_NO_ENCONTRADA: {
    status: 404,
    error: 'not-found',
    message: 'No existe esa inscripción.',
  },
  INSCRIPCION_NO_EN_GRUPO: {
    status: 409,
    error: 'conflict',
    message: 'Esa inscripción no pertenece a este grupo.',
  },
  INSCRIPCION_NO_APROBADA: {
    status: 409,
    error: 'conflict',
    message: 'Esa inscripción no está aprobada.',
  },
  REPORTE_NO_ENCONTRADO: {
    status: 404,
    error: 'not-found',
    message: 'No existe ese reporte.',
  },
  // taller_reportes_lock_after_send Rule 1 — a second send of a reporte
  // that is already `enviado` (English by design, translated here).
  'enviado can only transition to reabierto or cerrado': {
    status: 409,
    error: 'conflict',
    message: 'Este reporte ya fue enviado.',
  },
  SESION_NO_ENCONTRADA: {
    status: 404,
    error: 'not-found',
    message: 'No existe esa clase.',
  },
  CLASES_ABIERTAS: {
    status: 409,
    error: 'conflict',
    message: 'Hay clases todavía abiertas; cerralas antes de enviar el reporte.',
  },
  CLASE_CERRADA: {
    status: 409,
    error: 'conflict',
    message: 'Esta clase ya está cerrada; no admite cambios.',
  },
  MARCAS_INVALIDAS: {
    status: 400,
    error: 'bad-request',
    message: 'La lista de marcas no es válida.',
  },
  // T3 (odd/tasks/talleres-configuracion-del-taller.md) — the
  // taller_plantilla_facilitadores/taller_grupo_asignaciones BEFORE
  // triggers (20260926150000_talleres_plantillas_del_taller.sql) both
  // raise this exact message with ERRCODE P0001 when the target persona
  // is not an active servidor of the taller's node tree.
  NO_ES_SERVIDOR_ACTIVO_DEL_TALLER: {
    status: 409,
    error: 'conflict',
    message:
      'Esa persona no es un servidor activo de este taller. Asignala primero en Dream Team → Servidores.',
  },
}

/** Ordered longest-first so a substring match can't pick the wrong entry. */
const CLAVES: readonly string[] = Object.keys(MAPA).sort((a, b) => b.length - a.length)

/** Fallbacks — never leak the RAISE text or the SQLSTATE. */
const INTERNO: Entrada = {
  status: 500,
  error: 'internal',
  message: 'No se pudo completar la operación.',
}

/**
 * Translate a Supabase/PostgREST error into an HTTP answer. Unknown messages
 * collapse to a 500 with a generic Spanish message.
 */
export function traducirErrorTalleres(
  error: { readonly message?: string; readonly code?: string } | null | undefined,
  mensajePorDefecto: string = INTERNO.message,
): ErrorTalleres {
  const crudo = `${error?.code ?? ''} ${error?.message ?? ''}`
  for (const clave of CLAVES) {
    if (crudo.includes(clave)) return MAPA[clave]
  }
  // T3 (odd/tasks/talleres-configuracion-del-taller.md) — the taller
  // plantilla tables are written directly through RLS (no RPC of their
  // own — see 20260926150000_talleres_plantillas_del_taller.sql), so a
  // denial surfaces as Postgres's own generic RLS message ("new row
  // violates row-level security policy for table ..."), which never
  // matches a MAPA key above. Without this, every plain RLS denial fell
  // through to the 500 fallback below instead of a 403 — checked AFTER
  // the specific-message loop so an already-mapped 42501 (like
  // sin_permisos_para_este_grupo) keeps its own friendlier message.
  if (error?.code === '42501') {
    return { status: 403, error: 'forbidden', message: 'No tenés permisos para hacer este cambio.' }
  }
  // A duplicate insert against one of the plantilla tables' UNIQUE
  // constraints (e.g. the same facilitador added twice to a grupo, or a
  // repeated clase numero/grupo nombre) — same reasoning as above: these
  // tables have no RPC of their own to phrase the message.
  if (error?.code === '23505') {
    return { status: 409, error: 'conflict', message: 'Ese valor ya existe.' }
  }
  if (!error) return { ...INTERNO, message: mensajePorDefecto }
  return { status: 500, error: 'internal', message: mensajePorDefecto }
}
