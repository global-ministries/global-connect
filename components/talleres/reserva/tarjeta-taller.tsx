/**
 * One taller of the public catalog (design/talleres-reserva/01): a big
 * tappable card that chooses WHERE: audience, name, the next horario and the
 * status of its places (dot + words, never color alone). Server-safe.
 */
import Link from 'next/link'
import { ChevronRight, Heart, Sprout, User, UserRound } from 'lucide-react'

import { FONDO_TONO, PuntoEstado } from '@/components/ui/punto-estado'
import {
  audiencia,
  edicionesConLugar,
  estadoCupo,
  fechaCorta,
  tituloEdicion,
  type TallerPublico,
} from '@/lib/platform/talleres/reserva-publica'

/** The taller's icon (couple, women, men, or a sprout). Decorative. */
export function IconoTaller({ taller, className }: { taller: TallerPublico; className?: string }) {
  if (taller.pareja) return <Heart aria-hidden="true" className={className} />
  if (taller.generoRequerido === 'Femenino') return <UserRound aria-hidden="true" className={className} />
  if (taller.generoRequerido === 'Masculino') return <User aria-hidden="true" className={className} />
  return <Sprout aria-hidden="true" className={className} />
}

export function TarjetaTaller({ taller }: { taller: TallerPublico }) {
  const conLugar = edicionesConLugar(taller)
  const proxima = conLugar[0] ?? taller.ediciones[0] ?? null
  const cupo = proxima ? estadoCupo(proxima) : null
  const para = audiencia(taller)
  const idEstado = `taller-${taller.slug}-estado`
  const etiqueta = !proxima
    ? 'Próximamente · sin horarios abiertos'
    : conLugar.length === 0
      ? 'Lleno · te avisamos si se abre un lugar'
      : (cupo?.etiqueta ?? '')

  return (
    <Link
      href={`/talleres/reservar/${taller.slug}`}
      aria-describedby={idEstado}
      className="group focus-ring press-scale grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-brand-tint text-brand-text">
        <IconoTaller taller={taller} className="size-6" />
      </span>
      <span className="min-w-0">
        {para && <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{para}</span>}
        <span className="mt-0.5 block text-lg font-semibold leading-tight tracking-tight text-foreground">{taller.nombre}</span>
        {proxima && (
          <span className="mt-1 block text-[13px] text-muted-foreground">
            {tituloEdicion(proxima)} · inicia {fechaCorta(proxima.fechaInicio)}
            {taller.pareja ? ' · se inscriben los dos' : proxima.clases ? ` · ${proxima.clases} clases` : ''}
            {taller.ediciones.length > 1 ? ` · ${taller.ediciones.length} horarios` : ''}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 self-center text-muted-foreground" />
      <span className="col-span-2 col-start-2 mt-2 flex items-center gap-3 border-t border-border/60 pt-2.5">
        <span id={idEstado} className="min-w-0 flex-1">
          <PuntoEstado tono={!proxima ? 'muted' : conLugar.length === 0 ? 'danger' : (cupo?.tono ?? 'success')} etiqueta={etiqueta} />
        </span>
        {cupo?.ocupado !== null && cupo?.ocupado !== undefined && conLugar.length > 0 && (
          <span aria-hidden="true" className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <span className={`block h-full rounded-full ${FONDO_TONO[cupo.tono]}`} style={{ width: `${Math.round(cupo.ocupado * 100)}%` }} />
          </span>
        )}
      </span>
    </Link>
  )
}
