'use client'

/**
 * DPS › Configuración › Recordatorio por correo (T16c of
 * odd/tasks/dps-asistencia-pco.md; S14.3; artboard
 * design/dps-avisos-correo 07). One setting really changes — how many days
 * before (1–7) — plus the switch; the hour (10:00, Caracas) and who receives
 * it are fixed rules shown as text. The aside says exactly what will happen:
 * «El próximo sale el … a las 10:00 para el …: N personas», computed by the
 * database and read again after every save (a send day already past rolls to
 * the next plan). Only configurators edit (puede_editar, plus the screen's
 * read-only turn after a 'sin_autoridad'); everyone else reads. Each change
 * is saved at once and rolled back on failure; the parent shows the autosave
 * status.
 */
import { useState, type ReactElement } from 'react'
import { Check, Lock, Mail } from 'lucide-react'

import { SelectSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { guardarRecordatorioDps } from '@/lib/actions/dps-configuracion.actions'
import type { CodigoErrorDps } from '@/lib/platform/dps/errores'
import {
  DIAS_RECORDATORIO_MAX,
  DIAS_RECORDATORIO_MIN,
  DIAS_RECORDATORIO_POR_DEFECTO,
  fraseProximo,
  textoDias,
  textoUltimo,
  type ConfigRecordatorio,
} from '@/lib/platform/dps/recordatorio'

type ResultadoGuardar = { readonly ok: true } | { readonly ok: false; readonly message: string; readonly codigo: CodigoErrorDps | null }

export interface RecordatorioConfiguracionProps {
  readonly recordatorio: ConfigRecordatorio
  /** The screen turned read-only (a 'sin_autoridad' elsewhere). */
  readonly soloLectura: boolean
  /** A save starts. */
  readonly onEmpezar: () => void
  /** A save ended; true when it saved (the parent turns read-only on 'sin_autoridad' and explains other failures). */
  readonly onTerminar: (r: ResultadoGuardar) => boolean
}

const OPCIONES_ACTIVO = [
  { valor: 'si', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
] as const
const OPCIONES_DIAS = Array.from({ length: DIAS_RECORDATORIO_MAX - DIAS_RECORDATORIO_MIN + 1 }, (_, i) => {
  const n = DIAS_RECORDATORIO_MIN + i
  return { valor: String(n), etiqueta: textoDias(n) }
})

const CLASE_FILA = 'flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 py-3 last:border-b-0'

function Fila({ titulo, ayuda, children }: { readonly titulo: string; readonly ayuda: string; readonly children: ReactElement }): ReactElement {
  return (
    <li className={CLASE_FILA}>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-[13px] text-muted-foreground">{ayuda}</span>
      </span>
      {children}
    </li>
  )
}

function Proximo({ r }: { readonly r: ConfigRecordatorio }): ReactElement {
  const p = r.proximo
  return (
    <aside aria-label="Próximo recordatorio" aria-live="polite" className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/40 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">Próximo recordatorio</h3>
      {!r.activo ? (
        <p className="text-sm text-muted-foreground">Apagado. No sale ningún recordatorio; los avisos siguen llegando cuando los envías.</p>
      ) : !p ? (
        <p className="text-sm text-muted-foreground">No hay planes próximos para recordar.</p>
      ) : (
        <>
          <p className="text-[15px] font-medium">{fraseProximo(p)}</p>
          <ul aria-label="Quiénes lo reciben" className="space-y-1.5 text-[13px]">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
              <span className="min-w-0 flex-1">Confirmaron</span>
              <span className="font-mono tabular-nums">{p.personas - p.conBotones}</span>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning" />
              <span className="min-w-0 flex-1">No han respondido · con botones</span>
              <span className="font-mono tabular-nums">{p.conBotones}</span>
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
              <span className="min-w-0 flex-1">Dijeron que no pueden · no lo reciben</span>
              <span className="font-mono tabular-nums">{p.noPueden}</span>
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground" />
              <span className="min-w-0 flex-1">Sin correo en su ficha · no lo reciben</span>
              <span className="font-mono tabular-nums">{p.sinCorreo}</span>
            </li>
          </ul>
        </>
      )}
      {r.ultimo && <p className="text-[13px] text-muted-foreground">{textoUltimo(r.ultimo)}</p>}
    </aside>
  )
}

export function RecordatorioConfiguracion({ recordatorio: inicial, soloLectura, onEmpezar, onTerminar }: RecordatorioConfiguracionProps): ReactElement {
  const [r, setR] = useState<ConfigRecordatorio>(inicial)
  const editable = r.puedeEditar && !soloLectura

  async function guardar(activo: boolean, dias: number): Promise<void> {
    const antes = r
    setR((x) => ({ ...x, activo, dias }))
    onEmpezar()
    const resultado = await guardarRecordatorioDps({ activo, dias })
    if (onTerminar(resultado) && resultado.ok) setR(resultado.data)
    else setR(antes)
  }

  return (
    <TarjetaSistema>
      <section aria-labelledby="dps-config-recordatorio" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 space-y-1">
            <h2 id="dps-config-recordatorio" className="text-base font-[650] text-foreground">
              Recordatorio por correo
            </h2>
            <p className="text-[13px] text-muted-foreground">Un correo antes de cada servicio para quien ya recibió el aviso. Sale solo.</p>
          </div>
          {!editable && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
              <Lock aria-hidden="true" className="size-3.5" />
              Solo lo cambia la dirección de DPS, un pastor o un administrador.
            </span>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-4">
            <ul>
              <Fila titulo="Enviar recordatorio" ayuda="Si lo apagas, los avisos siguen llegando cuando los envías.">
                {editable ? (
                  <ControlSegmentado
                    etiqueta="Enviar recordatorio"
                    opciones={OPCIONES_ACTIVO}
                    valor={r.activo ? 'si' : 'no'}
                    onCambio={(v) => void guardar(v === 'si', r.dias)}
                  />
                ) : (
                  <span data-testid="recordatorio-activo" className="text-sm font-medium">
                    {r.activo ? 'Sí' : 'No'}
                  </span>
                )}
              </Fila>
              <Fila titulo="Cuántos días antes" ayuda={`Entre ${DIAS_RECORDATORIO_MIN} y ${DIAS_RECORDATORIO_MAX}. Por defecto, ${DIAS_RECORDATORIO_POR_DEFECTO}.`}>
                {editable ? (
                  <div className="w-44">
                    <SelectSistema
                      aria-label="Cuántos días antes"
                      opciones={OPCIONES_DIAS}
                      value={String(r.dias)}
                      disabled={!r.activo}
                      onValueChange={(v) => void guardar(r.activo, Number(v))}
                      className="font-mono tabular-nums"
                    />
                  </div>
                ) : (
                  <span data-testid="recordatorio-dias" className="text-sm font-medium">
                    {textoDias(r.dias)}
                  </span>
                )}
              </Fila>
              <Fila titulo="Hora" ayuda="Igual para todos los servicios.">
                <span data-testid="recordatorio-hora" className="text-sm">
                  <span className="font-mono tabular-nums">{r.hora}</span> de la mañana, hora de Caracas
                </span>
              </Fila>
            </ul>

            <div className="space-y-2 rounded-xl border border-border p-4">
              <p className="text-sm font-medium">Quién lo recibe</p>
              <p className="text-[13px] text-muted-foreground">Quienes confirmaron o no han respondido; nunca quien dijo que no puede.</p>
              <ul className="space-y-1.5 text-[13px]">
                <li className="flex gap-2">
                  <Mail aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>Si no ha respondido, el correo trae «Confirmar» y «No puedo».</span>
                </li>
                <li className="flex gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>Un solo correo por persona y día, aunque sirva en dos equipos.</span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span>Solo a quien ya recibió el aviso de ese día y tiene correo en su ficha.</span>
                </li>
              </ul>
            </div>
          </div>

          <Proximo r={r} />
        </div>
      </section>
    </TarjetaSistema>
  )
}
