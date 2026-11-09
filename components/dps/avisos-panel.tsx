'use client'

/**
 * DPS — «Enviar avisos», the review panel of the pending notices (T15b of
 * odd/tasks/dps-asistencia-pco.md; S13.1, S13.3, S13.4; artboard
 * design/dps-avisos/02-enviar-avisos-escritorio.html) on PanelLateralSistema
 * (480px). Opening it reads what the send would deliver for the plans it
 * gets (cargarAvisosPendientesDps; past plans are ignored by the database):
 * a note «Les llegará a su panel en Global Connect.», then «Nuevas
 * invitaciones», «Cambios para quien ya sabía» (before → after of the
 * puesto, the date or the horario), «Ya no estás programado» and «No reciben
 * aviso» (who already said «No puedo», the written names «Sin cuenta» and
 * how many have nothing new). «Enviar N avisos» sends everything at once
 * (enviarAvisosDps, all or nothing: no person is left out and there is no
 * message); when the only change closes a «No puede» taken out (counted in
 * total, no notice: S13.4) the button is «Guardar cambios»; a failure keeps the panel open and says why. The caller mounts
 * it while open (each opening reads again), closes it, announces the counts
 * and reads the states again.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Bell, Check, ChevronRight, Send, UserX, X } from 'lucide-react'

import { BotonSistema } from '@/components/ui/sistema-diseno'
import { PanelLateralSistema } from '@/components/ui/panel-lateral-sistema'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { EtiquetaPlanner } from '@/components/grupos-vida/planner/etiqueta'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { cargarAvisosPendientesDps, enviarAvisosDps } from '@/lib/actions/dps-avisos.actions'
import type { CambioAviso, EnvioAvisos, PendientesAvisos, RolAviso } from '@/lib/platform/dps/avisos'
import { horariosTexto } from '@/lib/platform/dps/planilla'
import { partesFecha } from '@/lib/platform/dps/programacion'

export interface PanelAvisosProps {
  readonly abierto: boolean
  readonly onCerrar: () => void
  /** The plans whose notices go out (the plan, or the visible future rows of the sheet). */
  readonly planIds: readonly string[]
  /** «Domingo 15 nov 2026 · Tu casa tiene influencers». */
  readonly descripcion: string
  readonly onEnviado: (envio: EnvioAvisos) => void
}

const COLUMNA_TEXTO: Readonly<Record<string, string>> = { productor: 'Productor', host: 'Host', comunicador: 'Comunicador', cantantes: 'Cantantes' }

/** «Streaming · Audio», several joined by commas. */
export const textoRoles = (roles: readonly RolAviso[]): string => roles.map((r) => [r.nombre, r.equipo].filter(Boolean).join(' · ')).join(', ')

const fechaFila = (fecha: string): string => {
  const { dia, numero, mes } = partesFecha(fecha)
  return `${dia} ${numero} ${mes}`
}
const horaCorta = (hora: string): string => hora.replace(/^0(\d)/, '$1')

/**
 * «Enviamos 3 avisos: 1 invitación, 1 cambio y 1 «Ya no estás programado». Ya están en su panel.»;
 * with only closures, «Listo: 1 persona que dijo «No puedo» salió del plan, sin otro aviso.»
 */
export function textoEnvio(envio: EnvioAvisos): string {
  if (envio.enviados === 0 && envio.cerrados > 0) {
    return envio.cerrados === 1
      ? 'Listo: 1 persona que dijo «No puedo» salió del plan, sin otro aviso.'
      : `Listo: ${envio.cerrados} personas que dijeron «No puedo» salieron del plan, sin otro aviso.`
  }
  if (envio.enviados === 0) return 'No había avisos por enviar.'
  const partes = [
    envio.nuevas > 0 ? `${envio.nuevas} ${envio.nuevas === 1 ? 'invitación' : 'invitaciones'}` : null,
    envio.cambios > 0 ? `${envio.cambios} ${envio.cambios === 1 ? 'cambio' : 'cambios'}` : null,
    envio.quitados > 0 ? `${envio.quitados} «Ya no estás programado»` : null,
  ].filter((p): p is string => p !== null)
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] ?? '')
  return `Enviamos ${envio.enviados} ${envio.enviados === 1 ? 'aviso' : 'avisos'}: ${lista}. Ya están en su panel.`
}

function Grupo({ id, titulo, cantidad, ayuda, children }: { id: string; titulo: string; cantidad: number; ayuda: string; children: ReactNode }): ReactElement {
  return (
    <section aria-labelledby={id} className="mt-5">
      <h3 id={id} className="mb-1.5 flex items-center gap-2 text-xs font-semibold tracking-[.08em] text-muted-foreground uppercase">
        {titulo} <span className="font-mono text-foreground tabular-nums">({cantidad})</span>
      </h3>
      <p className="mb-2 text-[13px] text-muted-foreground">{ayuda}</p>
      <ul className="overflow-hidden rounded-2xl border border-border">{children}</ul>
    </section>
  )
}

function Fila({ nombre, etiqueta, fecha, children }: { nombre: string; etiqueta?: string; fecha: string; children: ReactNode }): ReactElement {
  const { dia, numero, mes } = partesFecha(fecha)
  return (
    <li className="grid min-h-16 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 [&+&]:border-t [&+&]:border-border/60">
      <AvatarIniciales nombres={[nombre]} className="row-span-2 size-8 text-xs" />
      <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">
        <span className="truncate">{nombre}</span>
        {etiqueta && <EtiquetaPlanner tono="neutro">{etiqueta}</EtiquetaPlanner>}
      </p>
      <p className="col-start-3 row-span-2 row-start-1 text-right text-[13px] text-muted-foreground">
        {dia} <span className="font-mono tabular-nums">{numero}</span> {mes}
      </p>
      <div className="col-start-2 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">{children}</div>
    </li>
  )
}

/** Before → after of what changed (puesto, date, horario or llegada). */
function Cambio({ antes, despues }: { antes: string; despues: string }): ReactElement {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-foreground">
      <span className="sr-only">Antes: </span>
      <s className="text-muted-foreground">{antes}</s>
      <ChevronRight aria-hidden="true" className="size-3.5" />
      <span className="sr-only"> ahora: </span>
      {despues}
    </span>
  )
}

function cambiosDe(c: CambioAviso): ReactElement[] {
  const partes: ReactElement[] = []
  if (c.rolesAntes) partes.push(<Cambio key="roles" antes={textoRoles(c.rolesAntes)} despues={textoRoles(c.roles)} />)
  if (c.fechaAntes) partes.push(<Cambio key="fecha" antes={fechaFila(c.fechaAntes)} despues={fechaFila(c.fecha)} />)
  if (c.horariosAntes) partes.push(<Cambio key="horarios" antes={horariosTexto(c.horariosAntes)} despues={horariosTexto(c.horarios)} />)
  if (c.llegadaAntes) partes.push(<Cambio key="llegada" antes={`llegada ${horaCorta(c.llegadaAntes)}`} despues={`llegada ${horaCorta(c.llegada)}`} />)
  if (partes.length === 0) partes.push(<span key="roles">{textoRoles(c.roles)}</span>)
  return partes
}

export function PanelAvisos({ abierto, onCerrar, planIds, descripcion, onEnviado }: PanelAvisosProps): ReactElement {
  const toast = useNotificaciones()
  const [pendientes, setPendientes] = useState<PendientesAvisos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const pedidoRef = useRef(0)
  const clave = planIds.join(',')

  useEffect(() => {
    if (!abierto) return
    const pedido = ++pedidoRef.current
    void cargarAvisosPendientesDps({ planIds: clave ? clave.split(',') : [] }).then((r) => {
      if (pedido !== pedidoRef.current) return
      if (r.ok) setPendientes(r.data)
      else setError(r.message)
    })
  }, [abierto, clave])

  async function enviar(): Promise<void> {
    setEnviando(true)
    const r = await enviarAvisosDps({ planIds })
    setEnviando(false)
    if (!r.ok) {
      toast.error(r.message)
      return
    }
    onEnviado(r.data)
  }

  const total = pendientes?.total ?? 0
  // total also counts the «No puede» taken out, which close without a notice.
  const avisos = pendientes ? pendientes.nuevas.length + pendientes.cambios.length + pendientes.quitados.length : 0
  const no = pendientes?.noReciben
  const hayNoReciben = no ? no.yaRespondieron.length + no.sinCuenta.length + no.sinCambios > 0 : false

  return (
    <PanelLateralSistema
      abierto={abierto}
      onAbiertoChange={(a) => {
        if (!a && !enviando) onCerrar()
      }}
      titulo="Enviar avisos"
      descripcion={descripcion}
      pie={
        <>
          <BotonSistema variante="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </BotonSistema>
          <BotonSistema icono={avisos === 0 && total > 0 ? Check : Send} onClick={() => void enviar()} cargando={enviando} disabled={!pendientes || total === 0}>
            {avisos === 0 && total > 0 ? (
              'Guardar cambios'
            ) : (
              <>
                Enviar <span className="font-mono tabular-nums">{avisos}</span> {avisos === 1 ? 'aviso' : 'avisos'}
              </>
            )}
          </BotonSistema>
        </>
      }
    >
      <p className="flex gap-2.5 rounded-xl border border-info/30 bg-info/5 px-3.5 py-3 text-[13px]">
        <Bell aria-hidden="true" className="mt-px size-3.5 shrink-0 text-info-text" />
        <span>
          <b className="font-semibold">Les llegará a su panel en Global Connect.</b> Ahí pueden confirmar o decir que no pueden. Por correo, más adelante.
        </span>
      </p>

      {error ? (
        <p role="alert" className="mt-5 text-[13px] text-danger-text">
          {error}
        </p>
      ) : !pendientes ? (
        <p className="mt-5 text-[13px] text-muted-foreground">Revisando los avisos…</p>
      ) : (
        <>
          {total === 0 && <p className="mt-5 text-[13px] text-muted-foreground">No hay avisos por enviar: todos tienen su último cambio.</p>}

          {pendientes.nuevas.length > 0 && (
            <Grupo id="avisos-nuevas" titulo="Nuevas invitaciones" cantidad={pendientes.nuevas.length} ayuda="Les pedimos confirmar.">
              {pendientes.nuevas.map((n) => (
                <Fila key={`${n.planId}-${n.personaId}`} nombre={n.nombre} etiqueta={n.automatico ? 'Automático' : undefined} fecha={n.fecha}>
                  {textoRoles(n.roles)}
                  {n.reemplaza.length > 0 && <> · reemplaza a {n.reemplaza.join(' y ')}</>}
                </Fila>
              ))}
            </Grupo>
          )}

          {pendientes.cambios.length > 0 && (
            <Grupo
              id="avisos-cambios"
              titulo="Cambios para quien ya sabía"
              cantidad={pendientes.cambios.length}
              ayuda="Ya tenía el aviso; le contamos qué cambió. Si cambia el puesto o la fecha, vuelve a confirmar; si solo cambia la hora, sigue confirmado."
            >
              {pendientes.cambios.map((c) => (
                <Fila key={`${c.planId}-${c.personaId}`} nombre={c.nombre} fecha={c.fecha}>
                  {cambiosDe(c)}
                </Fila>
              ))}
            </Grupo>
          )}

          {pendientes.quitados.length > 0 && (
            <Grupo
              id="avisos-quitados"
              titulo="Ya no estás programado"
              cantidad={pendientes.quitados.length}
              ayuda="Ya tenía el aviso y salió del plan. Le decimos que esa fecha queda libre."
            >
              {pendientes.quitados.map((q) => (
                <Fila key={`${q.planId}-${q.personaId}`} nombre={q.nombre} fecha={q.fecha}>
                  Tenía {textoRoles(q.roles)}
                </Fila>
              ))}
            </Grupo>
          )}

          {no && hayNoReciben && (
            <section aria-labelledby="avisos-no-reciben" className="mt-5 rounded-xl bg-muted px-3.5 py-3 text-[13px] text-muted-foreground">
              <h3 id="avisos-no-reciben" className="mb-1.5 text-xs font-semibold tracking-[.08em] uppercase">
                No reciben aviso
              </h3>
              <ul>
                {no.yaRespondieron.map((p) => (
                  <li key={`${p.planId}-${p.personaId}`} className="flex gap-2 py-0.5">
                    <X aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <strong className="font-semibold text-foreground">{p.nombre}</strong> ya respondió que no puede; sale del plan sin otro aviso.
                    </span>
                  </li>
                ))}
                {no.sinCuenta.map((p, i) => (
                  <li key={`${p.planId}-${p.columna}-${i}`} className="flex gap-2 py-0.5">
                    <UserX aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <strong className="font-semibold text-foreground">{p.nombre}</strong> no tiene cuenta. Avísale tú por otro medio.
                      <span className="sr-only">
                        {' '}
                        ({COLUMNA_TEXTO[p.columna]}, {fechaFila(p.fecha)})
                      </span>
                    </span>
                  </li>
                ))}
                {no.sinCambios > 0 && (
                  <li className="flex gap-2 py-0.5">
                    <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <strong className="font-mono font-semibold text-foreground tabular-nums">{no.sinCambios}</strong>{' '}
                      {no.sinCambios === 1 ? 'persona ya tiene su aviso y nada le cambió.' : 'personas ya tienen su aviso y nada les cambió.'}
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}
        </>
      )}
    </PanelLateralSistema>
  )
}
