/**
 * T4 (odd/tasks/talleres-temporadas-y-ediciones.md, paso 6) — calls
 * `talleres_refrescar_estados` before a page's own loaders read
 * `taller_ediciones`, so a director never sees a stale STORED estado when
 * the DERIVED one (from dates, `talleres_estado_efectivo`) has since moved
 * past it. Decisiones: "la llaman los loaders del catálogo, explorar,
 * taller y edición antes de leer" — this is the one shared call site both
 * the taller and edición pages use.
 *
 * Best effort, same contract as every other loader in this module family
 * (catalogo.ts, plantilla.ts, permisos.ts's cargarPermisos): an RPC error,
 * or a client whose `.rpc` throws outright, never blocks the read that
 * follows — the page still renders with whatever estado is currently
 * stored (talleres_estado_efectivo also backs the read-time fallback for
 * every consumer, per the RPC's own migration comment).
 */

interface RefrescarEstadosClient {
  rpc(
    name: 'talleres_refrescar_estados',
    args: { p_taller_id: string | null },
  ): Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * `tallerId: null` (the default) refreshes EVERY taller's ediciones — the
 * taller page's own case, since the taller's DB id is only known AFTER the
 * slug lookup this call must run before. A caller that already knows the
 * taller's id (the edición page, right after its own taller lookup) should
 * pass it, to avoid touching unrelated talleres.
 */
export async function refrescarEstadosEdiciones(
  client: RefrescarEstadosClient,
  tallerId: string | null = null,
): Promise<void> {
  try {
    await client.rpc('talleres_refrescar_estados', { p_taller_id: tallerId })
  } catch {
    // best effort — a stale estado is a cosmetic issue, never a page failure.
  }
}
