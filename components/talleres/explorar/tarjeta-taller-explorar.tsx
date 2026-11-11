/**
 * R3a (odd/tasks/talleres-rediseno.md, S1 S2 S6; design/talleres-interior/20
 * and 21) — one taller of Explorar: who it is for, name, description and one
 * block per open edición with «Empieza el», hora, lugar, the cupo bar and
 * the viewer's state: «Inscribirme» / «Ya inscrito|Ya inscrita» / «Pendiente»
 * / «Lleno». A state is never color alone: the dot is decorative and the
 * words carry it. Server-safe (the button handler comes from the client).
 */

import Link from 'next/link'
import { Heart } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'

import { edicionEstadoLabel } from '@/components/talleres/labels'
import { FONDO_TONO, PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { etiquetaInscrito, type GeneroFicha } from '@/lib/platform/talleres/explorar'
import { cn } from '@/lib/utils'

import {
  diaYHora,
  estadoEdicion,
  fechaLarga,
  fechaTarjeta,
  primeraClaseVisible,
  textoClases,
  unidadCupo,
  type TallerAgrupado,
  type TallerExplorarFila,
} from './modelo'

const RUTA_MIS_TALLERES = '/talleres/mi-recorrido'

const CAJA_ESTADO: Record<'success' | 'warning' | 'muted', string> = {
  success: 'border-success/30 bg-success/10',
  warning: 'border-warning/30 bg-warning/10',
  muted: 'border-border bg-muted/60',
}

const TEXTO_ESTADO: Record<'success' | 'warning' | 'muted', string> = {
  success: 'text-success-text',
  warning: 'text-warning-text',
  muted: 'text-foreground',
}

function CajaEstado({
  tono,
  titulo,
  detalle,
  verMisTalleres,
}: {
  tono: 'success' | 'warning' | 'muted'
  titulo: string
  detalle: string
  verMisTalleres?: boolean
}): ReactElement {
  return (
    <div className={cn('mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5', CAJA_ESTADO[tono])}>
      <PuntoEstado tono={tono} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', TEXTO_ESTADO[tono])}>{titulo}</span>
        <span className="block text-[13px] text-muted-foreground">{detalle}</span>
      </span>
      {verMisTalleres && (
        <Link
          href={RUTA_MIS_TALLERES}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-2 text-sm font-medium text-brand-text focus-ring"
        >
          Ver
        </Link>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor, detalle, ancho }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; ancho?: boolean }) {
  return (
    <div className={cn('min-w-0 rounded-xl border border-border/70 px-2.5 py-2', ancho && 'col-span-2')}>
      <span className="block text-xs text-muted-foreground">{etiqueta}</span>
      <span className="block truncate text-[15px] font-semibold text-foreground md:text-sm">{valor}</span>
      {detalle && <span className="block truncate text-[13px] text-muted-foreground md:text-xs">{detalle}</span>}
    </div>
  )
}

function Cupo({ fila }: { fila: TallerExplorarFila }): ReactElement | null {
  const cupo = fila.cupo
  if (!cupo) return null
  const unidad = unidadCupo(cupo)
  const lleno = fila.cupo_completo || cupo.disponibles <= 0
  const ocupado = Math.min(1, Math.max(0, cupo.ocupados / cupo.total))
  const tono: TonoEstado = lleno ? 'muted' : 'success'
  return (
    <div className="mt-2.5 text-[13px] text-muted-foreground">
      {lleno ? (
        <>
          <strong className="font-mono font-semibold tabular-nums text-foreground">{cupo.total}</strong> de{' '}
          <span className="font-mono tabular-nums">{cupo.total}</span> {unidad} ocupados
        </>
      ) : (
        <>
          {cupo.disponibles === 1 ? 'Queda ' : 'Quedan '}
          <strong className="font-mono font-semibold tabular-nums text-foreground">{cupo.disponibles}</strong> {unidad} de{' '}
          <span className="font-mono tabular-nums">{cupo.total}</span>
        </>
      )}
      <span aria-hidden="true" className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
        <span className={cn('block h-full rounded-full', FONDO_TONO[tono])} style={{ width: `${Math.round(ocupado * 100)}%` }} />
      </span>
    </div>
  )
}

interface EdicionProps {
  readonly fila: TallerExplorarFila
  readonly genero: GeneroFicha | null
  readonly onInscribirme: (fila: TallerExplorarFila) => void
}

function EdicionExplorar({ fila, genero, onInscribirme }: EdicionProps): ReactElement {
  const estado = estadoEdicion(fila)
  const primera = primeraClaseVisible(fila)
  const { dia, hora } = diaYHora(fila)
  const clases = textoClases(fila.clases)
  const cierre = fechaLarga(fila.cierre_inscripcion)

  return (
    <section aria-label={`${fila.nombre} · ${fila.edicion}`} className="mt-4 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">{fila.edicion}</span>
        <PuntoEstado
          tono={fila.estado === 'en_curso' ? 'info' : 'success'}
          etiqueta={edicionEstadoLabel(fila.estado)}
        />
      </div>

      {(primera || hora || fila.lugar) && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {primera && <Dato etiqueta="Empieza el" valor={fechaTarjeta(primera)} detalle={clases} />}
          {hora && <Dato etiqueta="Hora" valor={dia ?? hora} detalle={dia ? <span className="font-mono tabular-nums">{hora}</span> : undefined} />}
          {fila.lugar && <Dato etiqueta="Lugar" valor={fila.lugar} ancho />}
        </div>
      )}

      {cierre && <p className="mt-2 text-[13px] text-muted-foreground">Inscripción hasta el {cierre}</p>}

      <Cupo fila={fila} />

      {estado === 'inscribible' && (
        <BotonSistema
          type="button"
          tamaño="lg"
          className="mt-3 w-full"
          icono={fila.tipo === 'pareja' ? Heart : undefined}
          aria-haspopup="dialog"
          aria-label={`${fila.tipo === 'pareja' ? 'Inscribirnos' : 'Inscribirme'} en ${fila.nombre} · ${fila.edicion}`}
          onClick={() => onInscribirme(fila)}
        >
          {fila.tipo === 'pareja' ? 'Inscribirnos' : 'Inscribirme'}
        </BotonSistema>
      )}
      {estado === 'pendiente' && (
        <CajaEstado tono="warning" titulo="Pendiente" detalle="La coordinación la confirmará. Está en Mis talleres." verMisTalleres />
      )}
      {estado === 'inscrito' && (
        <CajaEstado tono="success" titulo={etiquetaInscrito(genero)} detalle="Tienes tu lugar. Está en Mis talleres." verMisTalleres />
      )}
      {estado === 'lleno' && <CajaEstado tono="muted" titulo="Lleno" detalle="No quedan lugares en esta edición." />}
    </section>
  )
}

interface TarjetaProps {
  readonly taller: TallerAgrupado
  readonly genero: GeneroFicha | null
  /** The edición whose confirmation is open: its card gets the brand outline (desktop). */
  readonly abierta: string | null
  readonly onInscribirme: (fila: TallerExplorarFila) => void
}

export function TarjetaTallerExplorar({ taller, genero, abierta, onInscribirme }: TarjetaProps): ReactElement {
  const idTitulo = `taller-${taller.clave}`
  const actual = abierta !== null && taller.ediciones.some((e) => e.id === abierta)
  return (
    <article
      aria-labelledby={idTitulo}
      aria-current={actual ? 'true' : undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 md:p-5',
        actual && 'border-brand ring-1 ring-inset ring-brand',
      )}
    >
      {taller.audiencia && <p className="text-[13px] font-medium text-brand-text">{taller.audiencia}</p>}
      <h2 id={idTitulo} className="mt-1 text-[19px] font-semibold leading-tight tracking-tight text-foreground md:text-xl">
        {taller.nombre}
      </h2>
      {taller.descripcion && <p className="mt-1 text-sm text-muted-foreground">{taller.descripcion}</p>}
      {taller.ediciones.map((fila) => (
        <EdicionExplorar key={fila.id} fila={fila} genero={genero} onInscribirme={onInscribirme} />
      ))}
    </article>
  )
}
