'use client'

/**
 * Planner — the publish review /grupos-vida/planificar/publicar (T8a of
 * odd/tasks/planner-gdv.md; artboard 04; S6–S8, S12, S14, S16, S19, S24).
 * Only admin, pastor and director general reach it (the page redirects
 * anyone else; planner_publicar checks it again).
 *
 * Four numbered sections over the saved data: 1 the blockers by kind
 * (planner_bloqueos, as the alerts panel counts them) with their groups and
 * a link back to the board's alerts; 2 the warnings, which do not block;
 * 3 each segment with its directores de etapa and "Terminado por X ·
 * fecha" or "Sin terminar · N bloqueos" (planner_estado_publicacion, S14);
 * 4 what publishing does: the season becomes active, only the origin season
 * of its cohort closes and archives its groups (S19), other active seasons
 * are untouched, attendance is kept.
 *
 * "Publicar y activar <temporada>" stays disabled with the reason until
 * planner_estado_publicacion says it can publish; a confirm dialog restates
 * the effects; then publicarTemporadaAction runs planner_publicar and the
 * page shows the result or the refusal. The board's draft (S24) lives in
 * this browser per user and season: when this user has unsaved changes the
 * page says they are not part of what gets published.
 *
 * Planning style (S25): the planner's page frame (marco-planner.tsx: header
 * band, 24px gutters); each section is one flat `rounded-md` surface with a
 * head row (number + 14px / 650 title) and 13px rows split by light
 * dividers, numbers in mono; the confirm is the style's 420px dialog.
 */
import { useId, useState, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { contar, enLista, nombrePersona, type Bloqueo, type EstadoPublicacion, type SegmentoConDirectores, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import type { TemporadaPublicada } from '@/lib/platform/grupos-vida/planner/acciones'
import { publicarTemporadaAction } from '@/app/(auth)/grupos-vida/planificar/actions'
import { cn } from '@/lib/utils'

import { useBorradorLocal } from './borrador-local'
import { hrefTemporada } from './cabecera-temporada'
import { EtiquetaPlanner } from './etiqueta'
import { CLASE_DIALOGO, CLASE_SUPERFICIE, CLASE_TITULO_DIALOGO } from './estilo-planner'
import { CLASE_RESUMEN_PAGINA, CLASE_TITULO_PAGINA, MarcoPlanner } from './marco-planner'
import { MigasPlanner } from './migas-planner'
import { estadoTemporada, seccionesBloqueos } from './modelo'
import { efectosPublicar, estadoSegmento, motivoNoPublicar, textoConfirmar, textoListo, textoPublicada } from './modelo-publicar'

const ERROR_RED = 'No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.'
const GRUPOS_VISIBLES = 3

export interface ResumenAviso {
  readonly id: string
  /** "24 personas de 2025 - II sin ubicar". */
  readonly titulo: string
  readonly cantidad: number
}

export interface PublicarTemporadaProps {
  readonly temporada: TemporadaPlanner
  readonly usuarioId: string
  readonly estado: EstadoPublicacion
  /** planner_bloqueos rows (every segment for whoever publishes). */
  readonly bloqueos: readonly Bloqueo[]
  /** planner_temporadas segments, for the directores de etapa of each one. */
  readonly segmentos: readonly SegmentoConDirectores[]
  readonly avisos: readonly ResumenAviso[]
  readonly totalAvisos: number
}

function Seccion({ numero, titulo, children, nota }: { readonly numero: number; readonly titulo: string; readonly children: ReactNode; readonly nota?: ReactNode }): ReactElement {
  const id = useId()
  return (
    <section aria-label={`${numero}. ${titulo}`} aria-describedby={nota ? id : undefined} className={CLASE_SUPERFICIE}>
      <h2 className="flex min-h-11 items-center gap-2.5 border-b border-border px-4 py-2 text-sm font-[650] text-foreground">
        <span aria-hidden="true" className="grid size-[22px] shrink-0 place-items-center rounded-full bg-muted font-mono text-xs font-medium tabular-nums text-muted-foreground">
          {numero}
        </span>
        {titulo}
      </h2>
      <div className="space-y-3 px-4 py-3">{children}</div>
      {nota && (
        <p id={id} className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          {nota}
        </p>
      )}
    </section>
  )
}

function Bloqueos({ bloqueos, temporada }: { readonly bloqueos: readonly Bloqueo[]; readonly temporada: TemporadaPlanner }): ReactElement {
  const revisar = `${hrefTemporada(temporada.id)}&alertas=1`
  return (
    <ul className="-my-3 divide-y divide-border/60">
      {seccionesBloqueos(bloqueos, [], temporada.nombre).map((s) => {
        const nombres = [...new Set(s.items.map((i) => i.titulo))]
        const resto = nombres.length - GRUPOS_VISIBLES
        return (
          <li key={s.id} aria-label={s.titulo} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span
              className={`w-8 shrink-0 font-mono text-xl font-semibold tabular-nums tracking-[-0.02em] ${s.cantidad === 0 ? 'text-success-text' : 'text-danger-text'}`}
            >
              {s.cantidad}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-[13px] font-medium text-foreground">{s.titulo}</p>
              <p className="break-words text-xs text-muted-foreground">
                {s.vacio ?? `${enLista(nombres.slice(0, GRUPOS_VISIBLES))}${resto > 0 ? ` y ${contar(resto, 'más', 'más')}` : ''}`}
              </p>
            </div>
            {s.cantidad > 0 && (
              <BotonSistema asChild variante="outline" tamaño="sm">
                <Link href={revisar}>Revisar en el tablero</Link>
              </BotonSistema>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Segmentos({ estado, segmentos }: Pick<PublicarTemporadaProps, 'estado' | 'segmentos'>): ReactElement {
  const directores = new Map(segmentos.map((s) => [s.id, enLista(s.directores.map(nombrePersona))]))
  return (
    <ul className="-my-3 divide-y divide-border/60">
      {estado.segmentos.map((s) => {
        const marca = estadoSegmento(s)
        return (
          <li key={s.id} aria-label={s.nombre} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-2.5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-[13px] font-semibold text-foreground">
                {s.nombre} · <span className="font-mono tabular-nums">{s.grupos}</span> {s.grupos === 1 ? 'grupo' : 'grupos'}
              </p>
              <p className="break-words text-xs text-muted-foreground">{directores.get(s.id) || 'Sin director de etapa asignado'}</p>
            </div>
            <EtiquetaPlanner tono={marca.tono}>{marca.texto}</EtiquetaPlanner>
          </li>
        )
      })}
    </ul>
  )
}

function Publicada({ publicada, temporada }: { readonly publicada: TemporadaPublicada; readonly temporada: TemporadaPlanner }): ReactElement {
  return (
    <div className={cn(CLASE_SUPERFICIE, 'px-4 py-4')}>
      <div role="status" className="space-y-3">
        <PuntoEstado tono="success" etiqueta="Publicada" className="text-sm" />
        <p className="text-[17px] font-[650] text-foreground">{textoPublicada(publicada, temporada.nombre)}</p>
        <p className="text-[13px] text-muted-foreground">La asistencia de las dos temporadas se conserva.</p>
        <div className="flex flex-wrap gap-2">
          <BotonSistema asChild variante="primario" tamaño="sm">
            <Link href="/grupos-vida">Ir a los grupos</Link>
          </BotonSistema>
          <BotonSistema asChild variante="outline" tamaño="sm">
            <Link href="/grupos-vida/temporadas">Ver temporadas</Link>
          </BotonSistema>
        </div>
      </div>
    </div>
  )
}

/** S24: the user's unsaved board changes of this season are not published. */
function AvisoBorrador({ usuarioId, temporada }: { readonly usuarioId: string; readonly temporada: TemporadaPlanner }): ReactElement | null {
  const [borrador] = useBorradorLocal(usuarioId, temporada.id)
  const n = borrador.cambios.length
  if (n === 0) return null
  return (
    <AvisoFormulario tono="info" role="note" className="flex flex-wrap items-center justify-between gap-3 py-3">
      <p>
        Tienes {contar(n, 'cambio', 'cambios')} sin guardar en el tablero.{' '}
        {n === 1 ? 'No se incluye en la publicación hasta que lo guardes.' : 'No se incluyen en la publicación hasta que los guardes.'}
      </p>
      <BotonSistema asChild variante="outline" tamaño="sm">
        <Link href={hrefTemporada(temporada.id)}>{n === 1 ? 'Volver al tablero para guardarlo' : 'Volver al tablero para guardarlos'}</Link>
      </BotonSistema>
    </AvisoFormulario>
  )
}

export function PublicarTemporada({ temporada, usuarioId, estado, bloqueos, segmentos, avisos, totalAvisos }: PublicarTemporadaProps): ReactElement {
  const idMotivo = useId()
  const [confirmando, setConfirmando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [publicada, setPublicada] = useState<TemporadaPublicada | null>(null)
  const nombre = estado.temporada.nombre
  const motivo = motivoNoPublicar(estado)
  const estadoActual = estadoTemporada(temporada)

  const publicar = async () => {
    setConfirmando(false)
    setPublicando(true)
    setError(null)
    try {
      const r = await publicarTemporadaAction({ temporadaId: temporada.id })
      if (r.ok) setPublicada(r.datos)
      else setError(r.mensaje)
    } catch {
      setError(ERROR_RED)
    }
    setPublicando(false)
  }

  return (
    <MarcoPlanner
      migas={<MigasPlanner actual="Revisar y publicar" temporada={{ nombre: temporada.nombre, href: hrefTemporada(temporada.id) }} />}
      encabezado={
        <>
          <h1 className={CLASE_TITULO_PAGINA}>Revisar y publicar {nombre}</h1>
          <p className={CLASE_RESUMEN_PAGINA}>
            <PuntoEstado tono={publicada ? 'success' : estadoActual.tono} etiqueta={publicada ? 'Activa' : estadoActual.etiqueta} className="align-middle text-[15px]" />
            {' · '}Publicar es para toda la temporada: solo lo hace el director general. Los directores de etapa dejan su trabajo guardado.
          </p>
        </>
      }
    >

      {publicada ? (
        <Publicada publicada={publicada} temporada={temporada} />
      ) : (
        <>
          <AvisoBorrador usuarioId={usuarioId} temporada={temporada} />

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Seccion numero={1} titulo="Lo que bloquea la publicación" nota="Deben quedar en 0 para publicar.">
              <Bloqueos bloqueos={bloqueos} temporada={temporada} />
            </Seccion>
            <Seccion numero={2} titulo="Avisos">
              <p className="text-[13px] text-foreground">
                <span className="font-mono font-semibold tabular-nums">{totalAvisos}</span> {totalAvisos === 1 ? 'aviso' : 'avisos'} · puedes publicar con ellos
              </p>
              {avisos.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {avisos.map((a) => (
                    <li key={a.id} className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
                      <PuntoEstado tono="warning" />
                      <span className="break-words">{a.titulo}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>
            <Seccion
              numero={3}
              titulo="Segmentos y directores de etapa"
              nota="Cada director de etapa marca «Terminé mi segmento» cuando sus grupos ya no tienen bloqueos. Si después alguien cambia un grupo del segmento, vuelve a «Sin terminar»."
            >
              {estado.segmentos.length === 0 ? <p className="text-[13px] text-muted-foreground">Esta temporada todavía no tiene segmentos con grupos.</p> : <Segmentos estado={estado} segmentos={segmentos} />}
            </Seccion>
            <Seccion numero={4} titulo="Qué pasa al publicar">
              <ul className="space-y-3">
                {efectosPublicar(estado).map((e) => (
                  <li key={e.titulo} className="text-[13px]">
                    <p className="font-medium text-foreground">{e.titulo}</p>
                    {e.detalle && <p className="text-muted-foreground">{e.detalle}</p>}
                  </li>
                ))}
              </ul>
            </Seccion>
          </div>

          {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
            <p id={idMotivo} className={motivo ? 'text-sm font-medium text-danger-text' : 'text-sm text-muted-foreground'}>
              {motivo ?? textoListo(totalAvisos)}
            </p>
            <BotonSistema
              type="button"
              variante="primario"
              tamaño="sm"
              disabled={motivo !== null}
              cargando={publicando}
              aria-describedby={idMotivo}
              onClick={() => setConfirmando(true)}
            >
              Publicar y activar {nombre}
            </BotonSistema>
          </div>

          <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
            <AlertDialogContent className={CLASE_DIALOGO}>
              <AlertDialogHeader>
                <AlertDialogTitle className={CLASE_TITULO_DIALOGO}>¿Publicar y activar {nombre}?</AlertDialogTitle>
                <AlertDialogDescription>{textoConfirmar(estado)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setConfirmando(false)}>
                  Cancelar
                </BotonSistema>
                <BotonSistema type="button" variante="primario" tamaño="sm" onClick={() => void publicar()}>
                  Publicar y activar
                </BotonSistema>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </MarcoPlanner>
  )
}
