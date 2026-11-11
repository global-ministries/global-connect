/**
 * /talleres/[taller]/compartir (T6 of odd/tasks/talleres-reserva-publica.md,
 * S2 S18; design/talleres-reserva/08): the public link, its QR and the code
 * to embed the reservation on any website, with a live preview.
 *
 * GATE, the same as /talleres/[taller]: flag -> user -> session, then the
 * slug lookup (notFound for an unknown slug). Only who can manage the taller
 * (cargarPermisos(...).editarTaller for THIS taller's node, the predicate the
 * taller page uses for its own edit controls) gets the screen; the taller
 * page shows "Compartir" only to them. Making a taller public is
 * configuration (T9), not here: this page only reads talleres.publico to
 * warn when the public page does not list it yet.
 */
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { BotonSistema, PaginaSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { CompartirTaller } from '@/components/talleres/compartir/compartir-taller'
import { urlPublica } from '@/components/talleres/compartir/codigo-incrustar'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { cargarPermisos } from '@/lib/platform/talleres/permisos'
import { rutaTaller } from '@/lib/platform/talleres/rutas'

export const metadata = { title: 'Compartir taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
}

function Aviso({ texto }: { texto: string }) {
  return (
    <PaginaSistema titulo="Compartir">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

/** The app's public origin: NEXT_PUBLIC_SITE_URL, else this request's host (like the Niños poster). */
async function origenPublico(): Promise<string> {
  const configurado = process.env.NEXT_PUBLIC_SITE_URL
  if (configurado) return configurado.replace(/\/+$/, '')
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host') ?? 'miembros.yosoyglobal.org'}`
}

export default async function CompartirTallerPage(ctx: RouteContext) {
  if (!isTalleresEnabled()) return <Aviso texto="El módulo de talleres está deshabilitado." />

  const { taller: slug } = await ctx.params
  const supabase = await createSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const client: any = supabase
  const { data: { user } } = await client.auth.getUser()
  if (!user) return <Aviso texto="Necesitas iniciar sesión." />

  const session = await resolveReadOnlyPlatformSession({
    subjectAuthId: user.id,
    findPersonaByAuthId: (authId) => findPlatformSessionPersonaByAuthId(supabase, authId),
    capabilitySupabase: supabase,
  })
  if (!session) return <Aviso texto="No se pudo resolver tu sesión." />

  const taller = await loadTallerDetalle(client, slug)
  if (!taller) notFound()

  const permisos = await cargarPermisos(client, taller.dream_team_equipo_id)
  if (!permisos.editarTaller) return <Aviso texto="Solo quien gestiona este taller puede compartirlo." />

  const [{ data: fila }, base] = await Promise.all([
    client.from('talleres').select('publico').eq('id', taller.id).maybeSingle(),
    origenPublico(),
  ])
  const publico = (fila as { publico?: unknown } | null)?.publico === true
  const ediciones = taller.ediciones.filter((e) => e.estado === 'abierto').map((e) => ({ id: e.id, nombre: e.nombre_snapshot }))
  const abiertas = ediciones.length
  const resumen =
    abiertas > 0 ? (
      <>
        <strong className="font-mono font-semibold tabular-nums text-foreground">{abiertas}</strong>{' '}
        {abiertas === 1 ? 'edición con inscripciones abiertas' : 'ediciones con inscripciones abiertas'} · cada inscripción pasa por tu aprobación.
      </>
    ) : (
      'Sin ediciones con inscripciones abiertas · cada inscripción pasa por tu aprobación.'
    )

  return (
    <PaginaSistema
      titulo={`Compartir ${taller.nombre}`}
      regreso={{ href: rutaTaller(taller.slug), texto: taller.nombre }}
      acciones={
        publico ? (
          <BotonSistema asChild variante="outline" tamaño="sm" icono={ExternalLink}>
            <a href={urlPublica(base, taller.slug)} target="_blank" rel="noopener noreferrer">
              Ver página pública
            </a>
          </BotonSistema>
        ) : undefined
      }
    >
      {/* Phones: back to the taller, large title and the summary; from md the desktop header has them. */}
      <div className="-mt-2 grid gap-1">
        <BotonAtrasMovil atras={{ etiqueta: taller.nombre, href: rutaTaller(taller.slug) }} className="-ml-2 justify-self-start md:hidden" />
        <TituloGrande nivel={2} titulo="Compartir" resumen={resumen} />
        <p className="hidden text-[15px] text-muted-foreground md:block">{resumen}</p>
      </div>
      <CompartirTaller base={base} slug={taller.slug} nombre={taller.nombre} publico={publico} ediciones={ediciones} />
    </PaginaSistema>
  )
}
