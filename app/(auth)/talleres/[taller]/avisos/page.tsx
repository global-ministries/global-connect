/**
 * /talleres/[taller]/avisos (T7 of odd/tasks/talleres-reserva-publica.md,
 * S6 S11 S14; design/talleres-reserva/15): the taller's automatic notices
 * (switch, channels, when, this month's count, preview) and the history of
 * the last 50 emails with their delivery state.
 *
 * GATE, the same as /talleres/[taller]/compartir: flag -> user -> session,
 * then the slug lookup (notFound for an unknown slug). Coordinators and
 * directors of the taller's node (read or write) and admin.manage see it —
 * the RPC talleres_avisos_panel enforces exactly that and the page shows a
 * notice to anyone it refuses. Switching needs write (the RPC says so).
 *
 * R4b (odd/tasks/talleres-rediseno.md, S10; design/talleres-avisos 01–04):
 * the custom texts come with the panel; the variables of each kind come
 * from talleres_aviso_variables() (the one list) and the active plantilla
 * clases feed the per-clase class reminder. ?texto=personalizados opens
 * the «Personalizados» filter.
 */
import { notFound } from 'next/navigation'

import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { PaginaSistema, TarjetaSistema, TextoSistema } from '@/components/ui/sistema-diseno'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'
import { isTalleresEnabled } from '@/lib/platform/talleres/flags'
import { loadTallerDetalle } from '@/lib/platform/talleres/catalogo'
import { rutaTaller } from '@/lib/platform/talleres/rutas'
import { AVISOS_TALLER, avisoActivo } from '@/lib/platform/talleres/avisos-catalogo'
import { cargarPanelAvisos } from '@/lib/platform/talleres/avisos-panel'
import { cargarVariablesAvisos } from '@/lib/platform/talleres/avisos-textos'
import { loadPlantillaClases } from '@/lib/platform/talleres/plantilla'

import { CentroAvisos } from './centro-avisos.client'

export const metadata = { title: 'Avisos del taller' }

interface RouteContext {
  readonly params: Promise<{ readonly taller: string }>
  readonly searchParams?: Promise<{ readonly texto?: string | string[] }>
}

function Aviso({ texto }: { texto: string }) {
  return (
    <PaginaSistema titulo="Avisos">
      <TarjetaSistema variante="outlined" className="p-6 text-center">
        <TextoSistema variante="sutil">{texto}</TextoSistema>
      </TarjetaSistema>
    </PaginaSistema>
  )
}

function Numero({ valor }: { valor: number }) {
  return <strong className="font-mono font-semibold tabular-nums text-foreground">{valor}</strong>
}

export default async function AvisosTallerPage(ctx: RouteContext) {
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

  const panel = await cargarPanelAvisos(client, taller.id)
  if (!panel) return <Aviso texto="Solo la coordinación o la dirección de este taller puede ver sus avisos." />

  const [variables, plantilla, busqueda] = await Promise.all([
    cargarVariablesAvisos(client),
    loadPlantillaClases(client, taller.id),
    ctx.searchParams ?? Promise.resolve({} as { texto?: string | string[] }),
  ])
  const clases = plantilla.filter((clase) => clase.activo).map(({ id, numero, tema }) => ({ id, numero, tema }))
  const filtroInicial = busqueda.texto === 'personalizados' ? 'personalizados' : 'todos'

  const activos = AVISOS_TALLER.filter((aviso) => aviso.fijo || avisoActivo(panel.config, aviso.tipo)).length
  const personalizados = new Set(panel.textos.map((texto) => texto.tipo)).size
  const resumen = (
    <>
      <Numero valor={activos} /> automáticos activos · <Numero valor={personalizados} /> con texto personalizado ·{' '}
      <Numero valor={panel.resumen.enviadosMes} /> este mes
      {panel.resumen.sinEntregar > 0 && (
        <>
          {' '}
          · <Numero valor={panel.resumen.sinEntregar} /> sin entregar
        </>
      )}
      {panel.resumen.sinCorreo > 0 && (
        <>
          {' '}
          · <Numero valor={panel.resumen.sinCorreo} /> sin correo
        </>
      )}
    </>
  )

  return (
    <PaginaSistema titulo={`Avisos de ${taller.nombre}`} regreso={{ href: rutaTaller(taller.slug), texto: taller.nombre }}>
      {/* Phones: back to the taller, large title and the summary; from md the desktop header has them. */}
      <div className="-mt-2 grid gap-1">
        <BotonAtrasMovil atras={{ etiqueta: taller.nombre, href: rutaTaller(taller.slug) }} className="-ml-2 justify-self-start md:hidden" />
        <TituloGrande nivel={2} titulo="Avisos" resumen={resumen} />
        <p className="hidden text-[15px] text-muted-foreground md:block">{resumen}</p>
        <p className="text-[13px] text-muted-foreground">
          Correo y en la app: automáticos. WhatsApp: no se envía solo; solo el botón «Abrir en WhatsApp» para escribir a mano.
        </p>
      </div>
      <CentroAvisos
        tallerId={taller.id}
        tallerNombre={taller.nombre}
        panel={panel}
        variables={variables}
        clases={clases}
        filtroInicial={filtroInicial}
      />
    </PaginaSistema>
  )
}
