'use client'

/**
 * DPS › Plan — the team columns (`.cols`, `.col`, `.ch`, `.pt`, `.pr`,
 * `.fl`, `.ad` of prototipos/planificacion-dps/01; planned `ColumnasEquipo`
 * of docs/design-system/components.md#planning-style-components, local here
 * until it moves to components/ui). From md, a horizontal scroll region
 * (`role="region"`, `tabindex="0"`) of 196px columns that takes the height
 * its parent gives it (plan-client.tsx bounds it to the viewport): a long
 * column scrolls inside itself under its fixed head, so the region's thin
 * horizontal scrollbar stays at the bottom of the view. On a phone the
 * columns stack full width with the page's own scroll (no nested scroll,
 * no sideways scroll). Column head: the team,
 * "N convocados · N falta". Per puesto: the muted header row with "n/m",
 * 32px person rows (44px on touch) with "Quitar a …" on hover or focus, one
 * "Falta N" row in the danger tone while places are missing and the
 * "+ Convocar" row (on hover or focus with a mouse, always on touch); both
 * open the assign popover (convocar-puesto.tsx) anchored to the puesto. A
 * deactivated puesto shows only while it still has convocados, without
 * "Falta" nor "Convocar". The director a dirección gets on its own (S8)
 * shows a small «Automático» tag and no "Quitar"; "+ Convocar" stays for
 * anyone else. Read-only: the same rows without any control.
 *
 * Service notices (T15b; S13.2, S13.6; design/dps-avisos/01), for whoever
 * edits once the states are read (`acciones.avisos`): the columns widen to
 * 288px and each person shows a state chip (icon + text: Sin avisar,
 * Pendiente, Confirmó, No puede). «No puede» tints the row, shows the motivo
 * and when they answered, and «Buscar reemplazo» opens the puesto's picker
 * titled «Reemplazo para …» (never for an automatic director, who cannot be
 * taken out here). Someone who changed puesto after the notice
 * reads «Cambió de …». Whoever was taken out after the notice stays in the
 * puestos they were told, struck through with «Quitado» until the notices
 * are sent; they do not count in "n/m". The picker lists who blocked the
 * date apart (S13.6).
 */
import { useId, useRef, type ReactElement } from 'react'
import { Plus, Repeat2, X } from 'lucide-react'

import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import { CLASE_ACCION_FILA, CLASE_CABEZA_ROL, CLASE_CUENTA_ROL } from '@/components/grupos-vida/planner/estilo-planner'
import { claveDePuesto, type PersonaEstadoAviso } from '@/lib/platform/dps/avisos'
import {
  contarEquipoPlan,
  faltaPuesto,
  lineaEquipo,
  type CandidatoPuesto,
  type ConvocadoPlan,
  type EquipoPlan,
  type PuestoPlan,
} from '@/lib/platform/dps/plan'
import { cn } from '@/lib/utils'

import { ChipEstadoAviso, fechaRespuesta } from './avisos-estado'
import { ConvocarPuesto } from './convocar-puesto'

/** Thin token-colored scrollbars of the board (no global scrollbar style in the system yet). */
const CLASE_SCROLL_FINO = '[scrollbar-color:color-mix(in_oklab,var(--muted-foreground)_40%,transparent)_transparent] [scrollbar-width:thin]'

/** The red count of «Falta N» (`.bdg`), shared with the matrix cells (matriz-domingos.tsx). */
export const CLASE_INSIGNIA_FALTA =
  'inline-grid h-5 min-w-5 place-items-center rounded-full border border-danger/45 bg-danger/15 px-1 font-mono text-[11px] font-bold tabular-nums'

/** The states of the notices of the plan (only for whoever edits, once read). */
export interface AvisosColumnas {
  /** Each person's state, by personaId. */
  readonly personas: ReadonlyMap<string, PersonaEstadoAviso>
  /** Who blocked the plan's date, with their nota (S13.6). */
  readonly bloqueados: ReadonlyMap<string, string | null>
  /** The puesto whose picker looks for a replacement, and who said «No puede». */
  readonly reemplazo: { readonly puestoId: string; readonly nombre: string } | null
  readonly onReemplazo: (puesto: PuestoPlan, convocado: ConvocadoPlan) => void
}

export interface AccionesColumnas {
  readonly planId: string
  /** "9:15 y 11:15", for the popover's context line. */
  readonly horarios: string
  readonly editable: boolean
  /** The puesto whose popover is open. */
  readonly abierto: string | null
  readonly onAbrir: (puestoId: string | null) => void
  readonly onElegir: (equipo: EquipoPlan, puesto: PuestoPlan, candidato: CandidatoPuesto) => void
  readonly onQuitar: (equipo: EquipoPlan, puesto: PuestoPlan, convocado: ConvocadoPlan) => void
  readonly avisos?: AvisosColumnas | null
}

const CLASE_SUB = 'pr-2.5 pb-2 pl-[42px] text-xs leading-[1.45] text-muted-foreground'

function FilaConvocado({
  convocado,
  puesto,
  editable,
  aviso,
  onQuitar,
  onReemplazo,
}: {
  convocado: ConvocadoPlan
  puesto: PuestoPlan
  editable: boolean
  aviso: PersonaEstadoAviso | null
  onQuitar: () => void
  onReemplazo: () => void
}) {
  const noPuede = aviso?.estado === 'no_puede'
  const cambio = aviso?.estado === 'sin_avisar' && aviso.porEnviar === 'cambio' && aviso.rolesAntes && aviso.rolesAntes.length > 0 ? aviso.rolesAntes : null
  const respondio = aviso?.respondidoAt ? fechaRespuesta(aviso.respondidoAt) : ''
  return (
    <li className={cn('group/fila [&+&]:border-t [&+&]:border-border/60', noPuede && 'bg-danger/5')}>
      <div className="flex min-h-8 items-center gap-2 pr-0.5 pl-2.5 text-[13px] pointer-coarse:min-h-11">
        <AvatarIniciales nombres={[convocado.nombre]} />
        <span className="min-w-0 flex-1 truncate font-medium">{convocado.nombre}</span>
        {/* The director of the dirección follows Dream Team: tagged, never removed here. */}
        {convocado.automatico && (
          <span className="shrink-0 pr-2">
            <EtiquetaPlanner tono="neutro">Automático</EtiquetaPlanner>
          </span>
        )}
        {aviso && <ChipEstadoAviso estado={aviso.estado} />}
        {editable && !convocado.automatico && (
          <button type="button" onClick={onQuitar} aria-label={`Quitar a ${convocado.nombre} de ${puesto.nombre}`} className={CLASE_ACCION_FILA}>
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
      {noPuede && (
        <div className={CLASE_SUB}>
          {aviso.motivo && <q className="text-foreground italic before:content-['«'] after:content-['»']">{aviso.motivo}</q>}
          {respondio && (
            <>
              {aviso.motivo ? ' · respondió' : 'Respondió'} el {respondio}
            </>
          )}
          {/* An automatic director cannot be taken out here, so there is no replacement. */}
          {editable && puesto.activo && !convocado.automatico && (
            <button
              type="button"
              onClick={onReemplazo}
              aria-haspopup="dialog"
              className="focus-ring mt-0.5 flex items-center gap-1 rounded-md py-0.5 text-xs font-medium text-brand-text hover:underline pointer-coarse:min-h-11"
            >
              <Repeat2 aria-hidden="true" className="size-3" />
              Buscar reemplazo<span className="sr-only"> para {puesto.nombre}</span>
            </button>
          )}
        </div>
      )}
      {cambio && <p className={CLASE_SUB}>Cambió de {cambio.map((r) => r.nombre).join(', ')} · ya sabía de esta fecha</p>}
    </li>
  )
}

/** Taken out after the notice: struck through until the notices are sent. */
function FilaQuitado({ aviso }: { aviso: PersonaEstadoAviso }): ReactElement {
  return (
    <li className="[&+&]:border-t [&+&]:border-border/60">
      <div className="flex min-h-8 items-center gap-2 pr-2.5 pl-2.5 text-[13px] pointer-coarse:min-h-11">
        <AvatarIniciales nombres={[aviso.nombre]} className="opacity-50" />
        <s className="min-w-0 flex-1 truncate font-medium text-muted-foreground">{aviso.nombre}</s>
        <ChipEstadoAviso estado="quitado" />
      </div>
      <p className={CLASE_SUB}>Ya tenía el aviso. Al enviar recibe «Ya no estás programado».</p>
    </li>
  )
}

function BloquePuesto({ equipo, puesto, acciones }: { equipo: EquipoPlan; puesto: PuestoPlan; acciones: AccionesColumnas }): ReactElement {
  const idTitulo = useId()
  const convocarRef = useRef<HTMLButtonElement>(null)
  const falta = faltaPuesto(puesto)
  const puedeConvocar = acciones.editable && puesto.activo
  const abierto = acciones.abierto === puesto.puestoId
  const avisos = acciones.avisos ?? null
  const clave = claveDePuesto(puesto.puestoId)
  const quitados = avisos
    ? [...avisos.personas.values()].filter((a) => a.estado === 'quitado' && a.claves.includes(clave) && !puesto.convocados.some((c) => c.personaId === a.personaId))
    : []
  const reemplazaA = avisos?.reemplazo?.puestoId === puesto.puestoId ? avisos.reemplazo.nombre : null

  return (
    <Popover open={abierto} onOpenChange={(o) => acciones.onAbrir(o ? puesto.puestoId : null)}>
      <PopoverAnchor asChild>
        <div className="group/puesto [&+&]:border-t [&+&]:border-border">
          <h3 className={cn(CLASE_CABEZA_ROL, 'border-t-0')}>
            <span className="min-w-0 truncate">
              {puesto.nombre}
              {!puesto.activo && <span className="font-normal text-muted-foreground"> · desactivado</span>}
            </span>
            <span className={CLASE_CUENTA_ROL}>
              {puesto.convocados.length}/{puesto.cantidad}
            </span>
          </h3>
          <ul>
            {puesto.convocados.map((c) => (
              <FilaConvocado
                key={c.personaId}
                convocado={c}
                puesto={puesto}
                editable={acciones.editable}
                aviso={avisos?.personas.get(c.personaId) ?? null}
                onQuitar={() => acciones.onQuitar(equipo, puesto, c)}
                onReemplazo={() => avisos?.onReemplazo(puesto, c)}
              />
            ))}
            {quitados.map((a) => (
              <FilaQuitado key={`quitado-${a.personaId}`} aviso={a} />
            ))}
            {falta > 0 && (
              <li className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/60">
                {puedeConvocar ? (
                  <button
                    type="button"
                    onClick={() => acciones.onAbrir(puesto.puestoId)}
                    aria-label={`Falta ${falta} en ${puesto.nombre}, ${equipo.equipo}. Convocar`}
                    className="focus-ring flex min-h-8 w-full items-center gap-2 px-2.5 text-left text-[13px] font-medium text-danger-text transition-colors hover:bg-danger/10 pointer-coarse:min-h-11"
                  >
                    <span aria-hidden="true" className={CLASE_INSIGNIA_FALTA}>
                      {falta}
                    </span>
                    <span aria-hidden="true">Falta</span>
                  </button>
                ) : (
                  <p className="flex min-h-8 items-center gap-2 px-2.5 text-[13px] font-medium text-danger-text">
                    <span className={CLASE_INSIGNIA_FALTA}>{falta}</span>
                    Falta
                  </p>
                )}
              </li>
            )}
          </ul>
          {puedeConvocar && (
            <button
              ref={convocarRef}
              type="button"
              onClick={() => acciones.onAbrir(puesto.puestoId)}
              className="focus-ring flex min-h-[26px] w-full items-center gap-1.5 border-t border-dashed border-border/80 px-2.5 text-left text-xs font-medium text-brand-text opacity-0 transition-[opacity,background-color] hover:bg-brand-tint group-hover/puesto:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:min-h-11 pointer-coarse:opacity-100"
              aria-expanded={abierto}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Convocar
              <span className="sr-only">
                {' '}
                para {puesto.nombre}, {equipo.equipo}
              </span>
            </button>
          )}
        </div>
      </PopoverAnchor>
      {abierto && (
        <PopoverContent
          align="start"
          aria-labelledby={idTitulo}
          className="w-[280px] max-w-[calc(100vw-2rem)] rounded-md border-border bg-card p-2.5 shadow-sheet"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            convocarRef.current?.focus()
          }}
        >
          <ConvocarPuesto
            planId={acciones.planId}
            puestoId={puesto.puestoId}
            puesto={puesto.nombre}
            equipo={equipo.equipo}
            horarios={acciones.horarios}
            idTitulo={idTitulo}
            onElegir={(c) => acciones.onElegir(equipo, puesto, c)}
            bloqueados={avisos?.bloqueados}
            reemplazaA={reemplazaA}
            nota={avisos ? 'Quien elijas queda «Sin avisar» hasta que envíes los avisos.' : undefined}
          />
        </PopoverContent>
      )}
    </Popover>
  )
}

function ColumnaEquipo({ equipo, acciones }: { equipo: EquipoPlan; acciones: AccionesColumnas }): ReactElement {
  // The state chips need room: 288px as `.col` of design/dps-avisos/01.
  const ancho = acciones.avisos ? 'md:w-[288px]' : 'md:w-[196px]'
  const id = useId()
  return (
    // `relative`: the sr-only text of its rows stays clipped by the column instead of widening the page.
    <section
      aria-labelledby={id}
      className={cn('relative flex w-full min-w-0 flex-none flex-col overflow-hidden rounded-md border border-border bg-card md:max-h-full', ancho)}
    >
      <div className="shrink-0 border-b border-border py-2 pr-2 pl-3">
        <h2 id={id} className="truncate text-sm font-[650]">
          {equipo.equipo}
        </h2>
        <p className="text-xs text-muted-foreground">{lineaEquipo(contarEquipoPlan(equipo))}</p>
      </div>
      {/* Read-only columns have no controls to reach their rows: the body takes focus to scroll with the keyboard. */}
      <div
        data-testid="cuerpo-columna"
        role={acciones.editable ? undefined : 'group'}
        aria-labelledby={acciones.editable ? undefined : id}
        tabIndex={acciones.editable ? undefined : 0}
        className={cn('focus-ring min-h-0 focus-visible:-outline-offset-2! md:overflow-y-auto', CLASE_SCROLL_FINO)}
      >
        {equipo.puestos.map((p) => (
          <BloquePuesto key={p.puestoId} equipo={equipo} puesto={p} acciones={acciones} />
        ))}
      </div>
    </section>
  )
}

export function ColumnasEquipos({ equipos, acciones, className }: { equipos: readonly EquipoPlan[]; acciones: AccionesColumnas; className?: string }): ReactElement {
  return (
    <div
      role="region"
      aria-label="Equipos del plan"
      tabIndex={0}
      className={cn(
        // From md it runs to the edges of the view (past the 24px gutters, kept as padding), as `.cols` in the artboard.
        'focus-ring flex flex-col gap-2.5 rounded-md md:-mx-6 md:flex-row md:items-start md:overflow-x-auto md:overflow-y-hidden md:px-6 md:pt-1 md:pb-2 md:focus-visible:-outline-offset-2!',
        CLASE_SCROLL_FINO,
        className,
      )}
    >
      {equipos.map((e) => (
        <ColumnaEquipo key={e.equipoId} equipo={e} acciones={acciones} />
      ))}
    </div>
  )
}
