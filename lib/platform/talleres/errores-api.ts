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
      'Esa persona no es un servidor activo de este taller. Asígnala primero en Dream Team → Servidores.',
  },
  // T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // talleres_crear_edicion (migration 20260928110000_talleres_crear_
  // edicion.sql), the one-question "Crear edición" RPC.
  TEMPORADA_REQUERIDA: {
    status: 400,
    error: 'invalid-input',
    message: 'Elige una temporada para crear la edición.',
  },
  FECHA_REQUERIDA: {
    status: 400,
    error: 'invalid-input',
    message: 'Elige la fecha de la primera clase.',
  },
  EDICION_YA_EXISTE: {
    status: 409,
    error: 'conflict',
    message: 'Este taller ya tiene una edición en esa temporada.',
  },
  ADELANTAR_MAXIMO_6: {
    status: 400,
    error: 'invalid-input',
    message: 'Puedes adelantar como máximo 6 ediciones más.',
  },
  SIN_INTERVALO: {
    status: 409,
    error: 'conflict',
    message: 'Este taller no tiene un intervalo entre ediciones configurado.',
  },
  TEMPORADA_NO_PERMITIDA: {
    status: 400,
    error: 'invalid-input',
    message: 'Este taller no crea ediciones por temporada.',
  },
  ADELANTAR_INVALIDO: {
    status: 400,
    error: 'invalid-input',
    message: 'La cantidad de ediciones a adelantar no es válida.',
  },
  TEMPORADA_NOT_FOUND: {
    status: 404,
    error: 'not-found',
    message: 'La temporada no existe.',
  },
  sin_permisos_para_este_taller: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes permisos para crear ediciones en este taller.',
  },
  // T5 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // talleres_crear_temporada/talleres_agregar_taller_a_temporada/
  // talleres_quitar_taller_de_temporada (migration 20260928120000_talleres_
  // temporadas_por_direccion.sql), the "temporadas por dirección" screens.
  sin_permisos_para_esta_direccion: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes permisos para crear temporadas en esta dirección.',
  },
  sin_permisos_para_esta_temporada: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes permisos para modificar esta temporada.',
  },
  EQUIPO_NOT_FOUND: {
    status: 404,
    error: 'not-found',
    message: 'La dirección elegida ya no existe.',
  },
  EQUIPO_INACTIVE: {
    status: 409,
    error: 'conflict',
    message: 'La dirección elegida está inactiva.',
  },
  EQUIPO_WRONG_EXPERIENCE: {
    status: 400,
    error: 'invalid-input',
    message: 'Ese nodo no pertenece a talleres; elige otro.',
  },
  NOMBRE_REQUERIDO: {
    status: 400,
    error: 'invalid-input',
    message: 'El nombre debe tener al menos 2 caracteres.',
  },
  FECHAS_REQUERIDAS: {
    status: 400,
    error: 'invalid-input',
    message: 'Las fechas de apertura y cierre son requeridas.',
  },
  FECHA_CIERRE_ANTES_DE_APERTURA: {
    status: 400,
    error: 'invalid-input',
    message: 'La fecha de cierre no puede ser anterior a la de apertura.',
  },
  SLUG_TOO_SHORT: {
    status: 400,
    error: 'invalid-input',
    message: 'Ese nombre no genera un identificador válido; elige otro.',
  },
  TALLER_NOT_FOUND: {
    status: 404,
    error: 'not-found',
    message: 'El taller elegido ya no existe.',
  },
  TALLER_NO_ES_POR_TEMPORADA: {
    status: 400,
    error: 'invalid-input',
    message: 'Ese taller no abre por temporada.',
  },
  TALLER_FUERA_DE_LA_DIRECCION: {
    status: 400,
    error: 'invalid-input',
    message: 'Ese taller no pertenece a esta dirección.',
  },
  EDICION_NOT_FOUND: {
    status: 404,
    error: 'not-found',
    message: 'No se encontró la edición de este taller en esta temporada.',
  },
  EDICION_CON_INSCRITOS: {
    status: 409,
    error: 'conflict',
    message: 'No se puede quitar: la edición ya tiene inscritos. Cancela la edición desde su pantalla.',
  },
  // T6 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — cupo
  // (migration 20260928130000_talleres_cupo.sql). CUPO_LLENO gets its own
  // distinct `error` code (not the generic 'conflict') so the edición
  // page's "Inscribir persona" control can tell this failure apart from
  // any other and offer its second step ("Inscribir igual (sobre el
  // cupo)") only for this one.
  CUPO_LLENO: {
    status: 409,
    error: 'cupo-lleno',
    message: 'Este taller ya está en su cupo máximo.',
  },
  YA_INSCRITO: {
    status: 409,
    error: 'conflict',
    message: 'Esta persona ya está inscrita en esta edición.',
  },
  // Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md
  // P1/P2) — trg_taller_inscripciones_una_aparicion raises it on every
  // insert path (coordinator ones included) when the principal or the
  // companero already appears in an active row of the same edición.
  PERSONA_YA_EN_EDICION: {
    status: 409,
    error: 'conflict',
    message: 'Esta persona ya figura en otra inscripción de esta edición.',
  },
  // T7 hardening (odd/tasks/talleres-temporadas-y-ediciones.md,
  // 20260928140000_talleres_paso6_hardening.sql) — every remaining paso-6
  // RAISE code that had no MAPA entry of its own yet (it fell through to
  // the generic 500/42501 fallback below instead of a specific message).
  FECHA_INICIO_REQUIRED: {
    status: 400,
    error: 'invalid-input',
    message: 'Elige la fecha de inicio.',
  },
  TALLER_NOT_FOUND_OR_INACTIVE: {
    status: 404,
    error: 'not-found',
    message: 'El taller no existe o no está activo.',
  },
  TALLER_MISSING_EQUIPO: {
    status: 409,
    error: 'conflict',
    message: 'Este taller no tiene un equipo asignado en el organigrama.',
  },
  sin_permisos_para_esta_edicion: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes permisos para ver esta edición.',
  },
  UNAUTHENTICATED: {
    status: 401,
    error: 'unauthorized',
    message: 'Debes iniciar sesión.',
  },
  FORBIDDEN: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes permisos para hacer este cambio.',
  },
  NOMBRE_EDICION_REQUIRED: {
    status: 400,
    error: 'invalid-input',
    message: 'El nombre de la edición es obligatorio.',
  },
  SESIONES_MUST_BE_POSITIVE: {
    status: 400,
    error: 'invalid-input',
    message: 'La cantidad de sesiones debe ser mayor a cero.',
  },
  SOBRE_CUPO_NO_AUTORIZADO: {
    status: 403,
    error: 'forbidden',
    message: 'No tienes autorización para inscribir por encima del cupo.',
  },
  TEMPORADA_NO_DISPONIBLE: {
    status: 409,
    error: 'conflict',
    message: 'Esta temporada no está disponible para crear ediciones.',
  },
  EDICION_NO_ABIERTA: {
    status: 409,
    error: 'conflict',
    message: 'Esta edición no está abierta para inscripciones.',
  },
  COMPANERO_REQUERIDO: {
    status: 400,
    error: 'invalid-input',
    message: 'Elige el compañero o la compañera para esta inscripción de pareja.',
  },
  INVALID_REGIMEN: {
    status: 400,
    error: 'invalid-input',
    message: 'El régimen elegido no es válido.',
  },
  // T7b (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) —
  // talleres_reprogramar_edicion (migration
  // 20260928150000_talleres_reprogramar_edicion.sql), the Ventana
  // "Reprogramar" dialog.
  NADA_QUE_CAMBIAR: {
    status: 400,
    error: 'invalid-input',
    message: 'Elige al menos una fecha para cambiar.',
  },
  EDICION_NO_REPROGRAMABLE: {
    status: 409,
    error: 'conflict',
    message: 'Esta edición ya no se puede reprogramar.',
  },
  CIERRE_POSTERIOR_AL_FIN: {
    status: 400,
    error: 'invalid-input',
    message: 'El cierre de inscripción no puede ser posterior a la última clase.',
  },
  EDICION_YA_EMPEZO: {
    status: 409,
    error: 'conflict',
    message: 'La primera clase de esta edición ya se dictó; no se puede mover el inicio.',
  },
  // Cierre de edición (odd/tasks/talleres-cierre-de-edicion.md T2) —
  // talleres_previsualizar_cierre/talleres_cerrar_edicion. A denial keeps
  // the existing 42501 path below.
  EDICION_YA_CERRADA: {
    status: 409,
    error: 'conflict',
    message: 'Esta edición ya está cerrada.',
  },
  EDICION_NO_CERRABLE: {
    status: 409,
    error: 'conflict',
    message: 'Una edición en borrador o cancelada no se puede cerrar.',
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
    return { status: 403, error: 'forbidden', message: 'No tienes permisos para hacer este cambio.' }
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
