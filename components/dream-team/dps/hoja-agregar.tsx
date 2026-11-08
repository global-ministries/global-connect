'use client'

/**
 * DPS — "Agregar a alguien que vino sin estar convocado" (the `dialog#sh` of
 * prototipos/planificacion-dps/05-asistencia-celular.html): a bottom sheet on
 * phones (side panel from md, `DetalleResponsivo`) with a filled search over
 * the `otros` of each team of the sheet — people with an active servicio
 * there, neither convocados nor marked. Picking one marks them "Llegó" in that
 * team; someone in two teams shows once per team, so the coordinator picks
 * where they served.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { InputSistema } from '@/components/ui/sistema-diseno'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { nombreCompleto, type EquipoPlanilla, type OtroPlanilla } from '@/lib/platform/dream-team/dps/planilla'

export interface HojaAgregarProps {
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  readonly equipos: readonly EquipoPlanilla[]
  readonly onElegir: (equipo: EquipoPlanilla, otro: OtroPlanilla) => void
}

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function HojaAgregar({ abierta, onCambioAbierta, equipos, onElegir }: HojaAgregarProps): ReactElement {
  const [busqueda, setBusqueda] = useState('')
  const total = equipos.reduce((n, e) => n + e.otros.length, 0)
  const candidatos = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return equipos.flatMap((e) => e.otros.filter((o) => !q || normalizar(nombreCompleto(o)).includes(q)).map((o) => ({ equipo: e, otro: o })))
  }, [equipos, busqueda])

  function cambiar(abiertaAhora: boolean): void {
    if (!abiertaAhora) setBusqueda('')
    onCambioAbierta(abiertaAhora)
  }

  return (
    <DetalleResponsivo
      abierto={abierta}
      onCambioAbierto={cambiar}
      titulo="Vino sin estar convocado"
      descripcion="Búscalo en tus equipos. Queda como «Llegó» en el equipo donde sirvió hoy."
    >
      {total === 0 ? (
        <p className="py-3 text-[13px] text-muted-foreground">Todos los de tus equipos ya están en la lista.</p>
      ) : (
        <div className="space-y-3">
          <InputSistema
            type="search"
            aria-label="Buscar persona"
            placeholder="Buscar por nombre"
            icono={Search}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {candidatos.length === 0 ? (
            <p className="py-3 text-[13px] text-muted-foreground">Nadie con ese nombre en tus equipos.</p>
          ) : (
            <ul aria-label="Personas de tus equipos">
              {candidatos.map(({ equipo, otro }) => (
                <li key={`${equipo.equipoId}:${otro.personaId}`}>
                  <button
                    type="button"
                    onClick={() => onElegir(equipo, otro)}
                    className="focus-ring flex min-h-14 w-full touch-manipulation items-center gap-3 border-b border-border/60 text-left transition-colors hover:bg-accent"
                  >
                    <AvatarIniciales nombres={[nombreCompleto(otro)]} className="size-8 text-xs" />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold">{nombreCompleto(otro)}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{equipo.equipo}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </DetalleResponsivo>
  )
}
