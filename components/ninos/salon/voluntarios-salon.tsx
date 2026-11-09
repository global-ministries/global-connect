/**
 * Niños › Salón, voluntarios de hoy (odd/tasks/ninos-checkin-pco.md, T2c, S7,
 * S5; artboard design/ninos-checkin-pco/06-salon-celular.html, the header
 * and «Voluntarios de hoy»). Read-only: attendance and each volunteer's
 * salón are set only in the volunteers sheet (/ninos/voluntarios, L27).
 */
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import {
  resumenVoluntarios,
  textoEstadoVoluntario,
  textoFaltan,
  textoRegla,
  type SalonVoluntarios,
  type VoluntarioSalon,
} from '@/lib/platform/ninos/salon-voluntarios'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

function tonoVoluntario(v: VoluntarioSalon): TonoEstado {
  if (v.estado === 'presente') return 'success'
  if (v.estado === 'ausente') return 'danger'
  if (v.estado === 'justificado') return 'info'
  return 'warning'
}

type Props = {
  datos: SalonVoluntarios
  /** Children inside the salón now (the live list). */
  ninos: number
}

export function VoluntariosSalon({ datos, ninos }: Props) {
  const r = resumenVoluntarios(datos, ninos)
  const regla = textoRegla(datos)
  const conAsignados = datos.asignados > 0
  const capacidad = datos.capacidad === null ? '' : `/${datos.capacidad}`

  return (
    <section aria-labelledby="salon-voluntarios-titulo" className="min-w-0">
      <TarjetaSistema className="space-y-3 p-4">
        <div className="space-y-1">
          <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {`${ninos}${capacidad} niños · ${plural(r.llegaron, 'voluntario', 'voluntarios')}`}
          </p>
          {conAsignados && r.suficientes !== null && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <PuntoEstado
                tono={r.suficientes ? 'success' : 'warning'}
                etiqueta={r.suficientes ? 'Hay voluntarios suficientes' : `Faltan voluntarios · ${textoFaltan(r.faltan)}`}
                className={r.suficientes ? 'font-semibold text-success-text' : 'font-semibold text-warning-text'}
              />
              {regla && <span className="text-[13px] text-muted-foreground">{regla}</span>}
            </div>
          )}
        </div>

        <h2 id="salon-voluntarios-titulo" className="text-xs font-semibold uppercase tracking-[.08em] text-muted-foreground">
          Voluntarios de hoy
        </h2>
        {!conAsignados && (
          <p className="text-sm text-muted-foreground">
            Todavía no hay voluntarios asignados a este salón. Se asignan en la planilla de Voluntarios.
          </p>
        )}
        {conAsignados && datos.voluntarios.length === 0 && (
          <p className="text-sm text-muted-foreground">A ninguno de sus voluntarios le toca este horario.</p>
        )}
        {datos.voluntarios.length > 0 && (
          <ul className="divide-y divide-border/60">
            {datos.voluntarios.map((v) => (
              <li key={v.servicioId} className="flex min-h-11 items-center gap-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-foreground">
                    {v.nombre} {v.apellido}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.esperado ? (v.rol ?? 'Voluntario') : 'Vino sin estar convocado'}
                  </p>
                </div>
                <PuntoEstado tono={tonoVoluntario(v)} etiqueta={textoEstadoVoluntario(v)} className="shrink-0 font-medium tabular-nums" />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">La asistencia se marca en la planilla de Voluntarios.</p>
      </TarjetaSistema>
    </section>
  )
}
