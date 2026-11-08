'use client'

/**
 * Niños › Eventos — the open event (artboard `#det`): its name and state with
 * Editar / Archivar (or Restaurar) and the autosave status; then Horarios and
 * Sesiones recientes, and on the right Configuración, Opciones (switches that
 * save at once) and the Anuncio para la mesa (saves on leaving the field).
 * A reader who cannot write (ninos_puede_configurar_campus false) sees the
 * same cards with values instead of controls (patterns.md, "Permission-gated
 * actions").
 */
import { useState, type ReactElement, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Bell, Megaphone, Pencil, Smartphone, UserRound, UsersRound } from 'lucide-react'

import { Interruptor } from '@/components/ui/interruptor'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import {
  MAX_ANUNCIO,
  NOMBRE_TIPO,
  estadoEvento,
  fechaCorta,
  textoFrecuencia,
  type EventoAdmin,
  type HorarioEvento,
  type OpcionEvento,
} from '@/lib/platform/ninos/eventos'

import { EstadoGuardadoVista, Num, TarjetaDatos } from './partes'
import { TablaHorarios } from './tabla-horarios'
import type { Guardado } from './use-guardado'

export const OPCIONES: readonly { clave: OpcionEvento; titulo: string; descripcion: string; icono: typeof Bell }[] = [
  {
    clave: 'precheckApp',
    titulo: 'Pre-check desde la app',
    descripcion: 'El representante marca a sus hijos desde el teléfono antes de llegar; en la mesa solo confirman.',
    icono: Smartphone,
  },
  {
    clave: 'avisosPush',
    titulo: 'Avisos a los padres',
    descripcion: 'Si el salón necesita al representante, le llega un aviso al teléfono.',
    icono: Bell,
  },
  {
    clave: 'visitanteUnaVez',
    titulo: 'Visitante de una sola vez',
    descripcion: 'Permite registrar a un niño de paso sin crear su familia.',
    icono: UserRound,
  },
  {
    clave: 'integracionDreamTeam',
    titulo: 'Voluntarios de Dream Team',
    descripcion: 'Los voluntarios de Niños convocados en Dream Team aparecen en la planilla de Voluntarios de su salón; ahí se marca su asistencia, no en la mesa.',
    icono: UsersRound,
  },
]

function Sesiones({ evento }: { readonly evento: EventoAdmin }): ReactElement {
  if (evento.sesiones.length === 0) {
    return (
      <div className="px-3 py-5 text-center">
        <p className="text-sm font-semibold text-foreground">Todavía no hay sesiones</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Aparecen aquí cuando los niños hagan check-in en este evento.</p>
      </div>
    )
  }
  const max = Math.max(...evento.sesiones.map((s) => s.ninos), 1)
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr>
          <th scope="col" className="h-8 border-b border-border bg-muted px-3 text-left text-xs font-medium text-muted-foreground">
            Fecha
          </th>
          <th scope="col" className="h-8 border-b border-border bg-muted px-3 text-right text-xs font-medium text-muted-foreground">
            Niños
          </th>
        </tr>
      </thead>
      <tbody>
        {evento.sesiones.map((s) => (
          <tr key={s.fecha} className="border-b border-border/60 last:border-b-0">
            <td className="h-9 px-3">{fechaCorta(s.fecha, true)}</td>
            <td className="h-9 px-3 text-right">
              <span className="font-mono font-semibold tabular-nums">{s.ninos}</span>
              <span aria-hidden="true" className="ml-2 inline-block h-1 w-[72px] overflow-hidden rounded-full bg-muted align-middle">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((s.ninos / max) * 100)}%` }} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Dato({ etiqueta, children }: { readonly etiqueta: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2 border-b border-border/60 px-3 py-2 text-[13px] last:border-b-0">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

function Anuncio({
  evento,
  editable,
  onGuardar,
}: {
  readonly evento: EventoAdmin
  readonly editable: boolean
  readonly onGuardar: (texto: string) => Promise<boolean>
}): ReactElement {
  const guardado = evento.anuncioMesa ?? ''
  const [texto, setTexto] = useState(guardado)

  const vista = (editable ? texto : guardado).trim()
  return (
    <TarjetaDatos
      id="evento-anuncio"
      titulo={
        <>
          <Megaphone aria-hidden="true" className="size-3.5" /> Anuncio para la mesa
        </>
      }
    >
      {editable && (
        <div className="px-3 pt-2.5">
          <label htmlFor="evento-anuncio-texto" className="sr-only">
            Texto del anuncio
          </label>
          <textarea
            id="evento-anuncio-texto"
            rows={3}
            maxLength={MAX_ANUNCIO}
            value={texto}
            placeholder="Ejemplo: hoy el salón de Preadolescentes está cerrado."
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              if (texto.trim() !== guardado.trim()) void onGuardar(texto)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setTexto(guardado)
            }}
            className="w-full resize-y rounded-md border border-border bg-transparent px-2 py-1.5 text-[13px] leading-[1.45] text-foreground transition-colors focus:border-brand focus:bg-background focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{texto.length}</span>/<span className="font-mono tabular-nums">{MAX_ANUNCIO}</span> · se guarda al salir del campo
          </p>
        </div>
      )}
      <p
        aria-label="Vista previa en la mesa"
        className="m-3 flex gap-2 rounded-md border border-dashed border-border bg-muted px-3 py-2.5 text-[13px]"
      >
        <Megaphone aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        {vista ? <span className="min-w-0 break-words">{vista}</span> : <span className="text-muted-foreground">Sin anuncio: la mesa no muestra nada.</span>}
      </p>
    </TarjetaDatos>
  )
}

export interface DetalleEventoProps {
  readonly evento: EventoAdmin
  readonly campus: string
  readonly hoy: string
  readonly editable: boolean
  readonly guardado: Guardado
  readonly onEditar: () => void
  readonly onArchivar: () => void
  readonly onRestaurar: () => void
  readonly onAgregarHorario: () => void
  readonly onQuitarHorario: (horario: HorarioEvento) => void
  readonly onVentana: (horario: HorarioEvento, abre: number, cierra: number) => Promise<boolean>
  readonly onOpcion: (clave: OpcionEvento, valor: boolean) => Promise<boolean>
  readonly onAnuncio: (texto: string) => Promise<boolean>
}

export function DetalleEvento({
  evento,
  campus,
  hoy,
  editable,
  guardado,
  onEditar,
  onArchivar,
  onRestaurar,
  onAgregarHorario,
  onQuitarHorario,
  onVentana,
  onOpcion,
  onAnuncio,
}: DetalleEventoProps): ReactElement {
  const estado = estadoEvento(evento, hoy)
  return (
    <section id="detalle-evento" aria-labelledby="evento-titulo" className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="evento-titulo" tabIndex={-1} className="min-w-0 truncate text-xl font-[650] tracking-[-0.02em] text-foreground focus:outline-none">
          {evento.nombre}
        </h2>
        <PuntoEstado tono={estado.tono} etiqueta={estado.etiqueta} className="text-[13px]" />
        <span className="flex-1" />
        <EstadoGuardadoVista estado={guardado.estado} error={guardado.error} />
        {editable && (
          <span className="flex flex-wrap gap-2">
            <BotonSistema type="button" variante="outline" tamaño="sm" icono={Pencil} aria-haspopup="dialog" onClick={onEditar}>
              Editar
            </BotonSistema>
            {evento.activo ? (
              <BotonSistema type="button" variante="ghost" tamaño="sm" icono={Archive} aria-haspopup="dialog" onClick={onArchivar}>
                Archivar
              </BotonSistema>
            ) : (
              <BotonSistema type="button" variante="outline" tamaño="sm" icono={ArchiveRestore} onClick={onRestaurar}>
                Restaurar
              </BotonSistema>
            )}
          </span>
        )}
      </div>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4">
          <TarjetaDatos
            id="evento-horarios"
            titulo="Horarios"
            accion={<span className="text-xs text-muted-foreground">La hora se cambia en el turno de Dream Team</span>}
          >
            <TablaHorarios
              horarios={evento.horarios}
              editable={editable}
              puedeAgregar={editable && evento.activo}
              onVentana={onVentana}
              onInvalido={guardado.anunciar}
              onQuitar={onQuitarHorario}
              onAgregar={onAgregarHorario}
            />
          </TarjetaDatos>
          <TarjetaDatos id="evento-sesiones" titulo="Sesiones recientes">
            <Sesiones evento={evento} />
          </TarjetaDatos>
        </div>

        <div className="grid min-w-0 gap-4">
          <TarjetaDatos id="evento-configuracion" titulo="Configuración">
            <dl>
              <Dato etiqueta="Frecuencia">{NOMBRE_TIPO[evento.tipo]}</Dato>
              <Dato etiqueta="Cuándo">{textoFrecuencia(evento)}</Dato>
              <Dato etiqueta="Campus">{campus}</Dato>
              <Dato etiqueta="Horarios">
                <Num>{evento.horarios.length}</Num>
              </Dato>
            </dl>
          </TarjetaDatos>

          <TarjetaDatos id="evento-opciones" titulo="Opciones">
            <ul>
              {OPCIONES.map(({ clave, titulo, descripcion, icono: Icono }) => (
                <li key={clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-border/60 px-3 py-2.5 last:border-b-0">
                  <span id={`opcion-${clave}`} className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <Icono aria-hidden="true" className="size-3.5 shrink-0" />
                    {titulo}
                  </span>
                  <span className="row-span-2 self-center">
                    {editable ? (
                      <Interruptor
                        activo={evento[clave]}
                        onCambio={(valor) => void onOpcion(clave, valor)}
                        aria-label={titulo}
                        aria-describedby={`opcion-${clave}-texto`}
                        disabled={guardado.estado === 'guardando'}
                      />
                    ) : (
                      <PuntoEstado tono={evento[clave] ? 'success' : 'muted'} etiqueta={evento[clave] ? 'Activado' : 'Desactivado'} className="text-xs" />
                    )}
                  </span>
                  <p id={`opcion-${clave}-texto`} className="text-xs leading-snug text-muted-foreground">
                    {descripcion}
                  </p>
                </li>
              ))}
            </ul>
          </TarjetaDatos>

          {/* Keyed by the saved notice: a new value from the server resets the field. */}
          <Anuncio key={`${evento.id}-${evento.anuncioMesa ?? ''}`} evento={evento} editable={editable} onGuardar={onAnuncio} />
        </div>
      </div>
    </section>
  )
}
