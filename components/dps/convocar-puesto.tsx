'use client'

/**
 * DPS › Plan — the body of the assign popover (`.pop` of
 * prototipos/planificacion-dps/01; planned `PopoverAsignar` of
 * docs/design-system/components.md#planning-style-components, on
 * `ui/popover`, local here until it moves to components/ui): "Convocar para
 * <puesto>", the team and the horarios, a 34px search and the candidates of
 * dps_candidatos_puesto — people with an active servicio in the puesto's
 * team subtree, those not convocado in the plan first — each with one
 * context line: "Ya está en este puesto" (not selectable), "Ya sirve ese
 * día en <puesto>" in `warning-text`, or their team and role. Picking one
 * convoca at once (the parent saves and closes). The matrix
 * (matriz-domingos.tsx) titles the popover itself (`encabezado={false}`),
 * keeps it open after a pick and bumps `recarga` once the change is saved,
 * so the list is read again.
 *
 * With the service notices (T15b; S13.6; design/dps-avisos/01) the plan
 * hands who blocked the date (`bloqueados`): they are listed apart under
 * «Bloquearon esta fecha», on the `warning` tint with a warning icon and
 * their nota, and stay selectable; the rest go under «Disponibles».
 * «Buscar reemplazo» titles it «Reemplazo para <puesto>» (`reemplazaA`), and
 * `nota` closes it with «Quien elijas queda «Sin avisar» …».
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search, TriangleAlert } from 'lucide-react'

import { InputSistema } from '@/components/ui/sistema-diseno'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { CLASE_CONTROL_COMPACTO } from '@/components/grupos-vida/planner/estilo-planner'
import { buscarCandidatosDps } from '@/lib/actions/dps-plan.actions'
import { avisoCandidato, type CandidatoPuesto } from '@/lib/platform/dps/plan'
import { nombreCompleto } from '@/lib/platform/dps/planilla'
import { cn } from '@/lib/utils'

/** Typing waits this long before asking again. */
const ESPERA_BUSQUEDA_MS = 250

const CLASE_GRUPO = 'px-1.5 pt-1 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase'

function Candidato({
  candidato: c,
  puestoId,
  onElegir,
  bloqueo,
}: {
  readonly candidato: CandidatoPuesto
  readonly puestoId: string
  readonly onElegir: (candidato: CandidatoPuesto) => void
  /** undefined: not blocked; null: blocked without a nota. */
  readonly bloqueo?: string | null
}): ReactElement {
  const nombre = nombreCompleto(c)
  const aviso = avisoCandidato(c, puestoId)
  const bloqueado = bloqueo !== undefined
  return (
    <li>
      <button
        type="button"
        disabled={c.enEstePuesto}
        onClick={() => onElegir(c)}
        className={cn(
          'focus-ring flex min-h-10 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent pointer-coarse:min-h-11',
          bloqueado && 'border border-warning/45 bg-warning/10 hover:bg-warning/20',
        )}
      >
        <AvatarIniciales nombres={[nombre]} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{nombre}</span>
          {bloqueado ? (
            <span className="flex items-start gap-1 text-xs font-medium text-warning-text">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0">
                <span className="sr-only">Fecha bloqueada. </span>
                {bloqueo ? `Bloqueó esta fecha: «${bloqueo}»` : 'Bloqueó esta fecha'}
              </span>
            </span>
          ) : (
            <span className={cn('block truncate text-xs text-muted-foreground', aviso && !c.enEstePuesto && 'text-warning-text')}>
              {aviso ?? [c.equipo, c.rol].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

export interface ConvocarPuestoProps {
  readonly planId: string
  readonly puestoId: string
  readonly puesto: string
  readonly equipo: string
  /** "9:15 y 11:15". */
  readonly horarios: string
  readonly idTitulo: string
  readonly onElegir: (candidato: CandidatoPuesto) => void
  /** Without it, the caller titles the popover (the matrix). */
  readonly encabezado?: boolean
  /** A change reads the candidates again (after a saved change). */
  readonly recarga?: number
  /** The search's id, so the caller can focus it. */
  readonly idBusqueda?: string
  /** Who blocked the plan's date, with their nota (S13.6): apart, with a warning, still selectable. */
  readonly bloqueados?: ReadonlyMap<string, string | null>
  /** «Buscar reemplazo»: who said «No puede». */
  readonly reemplazaA?: string | null
  /** A closing line under the list. */
  readonly nota?: string
}

export function ConvocarPuesto({
  planId,
  puestoId,
  puesto,
  equipo,
  horarios,
  idTitulo,
  onElegir,
  encabezado = true,
  recarga = 0,
  idBusqueda,
  bloqueados,
  reemplazaA = null,
  nota,
}: ConvocarPuestoProps): ReactElement {
  const [busqueda, setBusqueda] = useState('')
  const [candidatos, setCandidatos] = useState<readonly CandidatoPuesto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pedidoRef = useRef(0)

  useEffect(() => {
    const pedido = ++pedidoRef.current
    const buscar = async () => {
      const r = await buscarCandidatosDps({ planId, puestoId, busqueda })
      if (pedido !== pedidoRef.current) return
      if (r.ok) {
        setCandidatos(r.data)
        setError(null)
      } else {
        setError(r.message)
      }
    }
    if (busqueda === '') {
      void buscar()
      return
    }
    const espera = setTimeout(() => void buscar(), ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [planId, puestoId, busqueda, recarga])

  const conBloqueo = (candidatos ?? []).filter((c) => bloqueados?.has(c.personaId))
  const libres = (candidatos ?? []).filter((c) => !bloqueados?.has(c.personaId))
  const conGrupos = conBloqueo.length > 0

  return (
    <div className="space-y-2">
      {encabezado && (
        <div>
          <h3 id={idTitulo} className="text-[13px] font-[650]">
            {reemplazaA ? 'Reemplazo para' : 'Convocar para'} {puesto}
          </h3>
          <p className="text-xs text-muted-foreground">
            {equipo}
            {horarios && <> · {horarios}</>}
            {reemplazaA && <> · {reemplazaA} no puede</>}
          </p>
        </div>
      )}
      <InputSistema
        id={idBusqueda}
        type="search"
        aria-label="Buscar en el equipo"
        placeholder="Buscar en el equipo"
        autoComplete="off"
        icono={Search}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className={CLASE_CONTROL_COMPACTO}
      />
      {error ? (
        <p role="alert" className="px-1 py-2 text-[13px] text-danger-text">
          {error}
        </p>
      ) : candidatos === null ? (
        <p className="px-1 py-2 text-[13px] text-muted-foreground">Buscando…</p>
      ) : candidatos.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-muted-foreground">
          {busqueda.trim() ? 'Nadie con ese nombre en el equipo.' : 'Nadie sirve en este equipo todavía.'}
        </p>
      ) : (
        <>
          {libres.length > 0 && (
            <>
              {conGrupos && (
                <p id={`${idTitulo}-libres`} className={CLASE_GRUPO}>
                  Disponibles
                </p>
              )}
              <ul
                aria-label={conGrupos ? undefined : `Personas para ${puesto}`}
                aria-labelledby={conGrupos ? `${idTitulo}-libres` : undefined}
                className="max-h-[220px] overflow-y-auto"
              >
                {libres.map((c) => (
                  <Candidato key={c.servicioId} candidato={c} puestoId={puestoId} onElegir={onElegir} />
                ))}
              </ul>
            </>
          )}
          {conGrupos && (
            <>
              <p id={`${idTitulo}-bloqueados`} className={CLASE_GRUPO}>
                Bloquearon esta fecha
              </p>
              <ul aria-labelledby={`${idTitulo}-bloqueados`} className="max-h-[160px] space-y-1 overflow-y-auto">
                {conBloqueo.map((c) => (
                  <Candidato key={c.servicioId} candidato={c} puestoId={puestoId} onElegir={onElegir} bloqueo={bloqueados?.get(c.personaId) ?? null} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {nota && <p className="border-t border-border pt-2 text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}
