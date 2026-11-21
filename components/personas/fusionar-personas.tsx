'use client'

/**
 * Personas — «Fusionar personas» (/admin/personas/fusionar; T5, S6c of
 * odd/tasks/dream-team-estructura-correcciones.md).
 *
 * 1. Pick the two fichas (search by name in any order, cédula or teléfono).
 * 2. Compare them side by side (cuenta, cédula, teléfono, email, fechas,
 *    campus, grupos, servicios, asistencias) and choose the one that stays:
 *    by default the one with the account; the other cannot stay; two
 *    accounts are refused. Without accounts the older ficha is preselected.
 * 3. «Ver qué se mueve»: the dry run (personas_fusionar with p_simular) with
 *    the counts per table and the fields that will be filled. Append-only
 *    history (never rewritten) is listed apart: it stays with the old id and
 *    personas_fusiones maps it to the survivor.
 * 4. Type the survivor's name and «Fusionar». Irreversible: the other ficha
 *    is deleted and its whole history moves to the survivor.
 * Changing a ficha or the survivor discards the dry run. The database checks
 * everything again (admin/pastor only).
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import {
  BotonSistema,
  InputSistema,
  SeccionesSistema,
  TarjetaSistema,
  TextoSistema,
  TituloSistema,
} from '@/components/ui/sistema-diseno'
import {
  buscarPersonasParaFusion,
  fusionarPersonas,
  resumenFusion,
} from '@/lib/actions/personas-fusionar.actions'
import {
  confirmacionValida,
  etiquetaCampo,
  nombreCompleto,
  puedeQuedar,
  supervivientePorDefecto,
  type PersonaFusionBuscada,
  type ResultadoFusion,
  type ResumenPersonaFusion,
} from '@/lib/platform/personas/fusion'

const MIN_QUERY = 2
const DEBOUNCE_MS = 300

const TITULO_CONSERVADOS = 'Se conservan con la ficha anterior (historial que no se modifica)'

const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function fecha(valor: string | null): string {
  if (!valor) return '—'
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00Z` : valor)
  return Number.isNaN(t) ? '—' : fechaCorta.format(new Date(t))
}

// ─── Picking one ficha ───────────────────────────────────────────────

interface SelectorFichaProps {
  readonly etiqueta: string
  readonly elegida: PersonaFusionBuscada | null
  readonly onElegir: (persona: PersonaFusionBuscada | null) => void
  readonly excluirId: string | null
}

function SelectorFicha({ etiqueta, elegida, onElegir, excluirId }: SelectorFichaProps): ReactElement {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<readonly PersonaFusionBuscada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const q = query.trim()
  const consultaValida = !elegida && q.length >= MIN_QUERY

  useEffect(() => {
    const actual = ++seq.current
    if (!consultaValida) return
    const timer = setTimeout(() => {
      setBuscando(true)
      void buscarPersonasParaFusion(q).then((r) => {
        if (actual !== seq.current) return
        setBuscando(false)
        if (r.ok) {
          setResultados(r.data)
          setError(null)
        } else {
          setResultados([])
          setError(r.error)
        }
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, consultaValida])

  if (elegida) {
    return (
      <div className="grid gap-2">
        <span className="text-sm font-medium">{etiqueta}</span>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
          <div className="grid min-w-0">
            <span className="truncate font-medium">{nombreCompleto(elegida)}</span>
            <span className="text-xs text-muted-foreground">{elegida.tieneCuenta ? 'Con cuenta' : 'Sin cuenta'}</span>
          </div>
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            aria-label={`Cambiar ${etiqueta.toLowerCase()}`}
            onClick={() => {
              setQuery('')
              onElegir(null)
            }}
          >
            Cambiar
          </BotonSistema>
        </div>
      </div>
    )
  }

  const visibles = consultaValida ? resultados.filter((p) => p.id !== excluirId) : []
  return (
    <div className="grid gap-1">
      <InputSistema
        icono={Search}
        label={etiqueta}
        placeholder="Nombre, cédula o teléfono…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div aria-live="polite">
        {consultaValida && buscando && (
          <TextoSistema variante="sutil" tamaño="sm">
            Buscando…
          </TextoSistema>
        )}
        {consultaValida && !buscando && error && (
          <TextoSistema tamaño="sm" className="text-danger-text">
            {error}
          </TextoSistema>
        )}
        {consultaValida && !buscando && !error && visibles.length === 0 && (
          <TextoSistema variante="sutil" tamaño="sm">
            Sin resultados.
          </TextoSistema>
        )}
      </div>
      {visibles.length > 0 && (
        <ul className="max-h-[40vh] overflow-auto rounded-xl border border-border">
          {visibles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onElegir(p)}
                className="flex min-h-11 w-full flex-col items-start justify-center border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="text-sm font-medium">{nombreCompleto(p)}</span>
                <span className="text-xs text-muted-foreground">
                  {[p.email, p.tieneCuenta ? 'Con cuenta' : 'Sin cuenta'].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── One ficha, side by side ─────────────────────────────────────────

interface FichaResumenProps {
  readonly persona: ResumenPersonaFusion
  readonly queda: boolean
  readonly puede: boolean
  readonly onQuedar: () => void
}

function FichaResumen({ persona, queda, puede, onQuedar }: FichaResumenProps): ReactElement {
  const tituloId = useId()
  const filas: ReadonlyArray<readonly [string, string, boolean]> = [
    ['Cuenta', persona.tieneCuenta ? 'Con cuenta' : 'Sin cuenta', false],
    ['Cédula', persona.cedula ?? '—', false],
    ['Teléfono', persona.telefono ?? '—', false],
    ['Email', persona.email ?? '—', false],
    ['Registro', fecha(persona.fechaRegistro), false],
    ['Nacimiento', fecha(persona.fechaNacimiento), false],
    ['Campus', persona.campus ?? '—', false],
    ['Grupos activos', String(persona.grupos), true],
    ['Servicios vigentes', String(persona.servicios), true],
    ['Asistencias a grupos', String(persona.asistencias), true],
    ['Asistencias DPS', String(persona.asistenciasDps), true],
  ]
  return (
    <TarjetaSistema>
      <section aria-labelledby={tituloId} className="grid gap-4">
        <TituloSistema nivel={3} id={tituloId} className="min-w-0 break-words">
          {nombreCompleto(persona)}
        </TituloSistema>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          {filas.map(([etiqueta, valor, esNumero]) => (
            <div key={etiqueta} className="contents">
              <dt className="text-muted-foreground">{etiqueta}</dt>
              <dd className={esNumero ? 'font-mono tabular-nums' : 'min-w-0 break-words'}>{valor}</dd>
            </div>
          ))}
        </dl>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input
            type="radio"
            name="ficha-que-queda"
            className="h-5 w-5 accent-[var(--brand-primary)]"
            checked={queda}
            disabled={!puede}
            onChange={onQuedar}
          />
          Queda esta ficha
        </label>
        {!puede && (
          <TextoSistema variante="sutil" tamaño="sm">
            La ficha con cuenta es la que queda.
          </TextoSistema>
        )}
      </section>
    </TarjetaSistema>
  )
}

// ─── The flow ────────────────────────────────────────────────────────

export function FusionarPersonas(): ReactElement {
  const [primera, setPrimera] = useState<PersonaFusionBuscada | null>(null)
  const [segunda, setSegunda] = useState<PersonaFusionBuscada | null>(null)
  const [resumen, setResumen] = useState<readonly [ResumenPersonaFusion, ResumenPersonaFusion] | null>(null)
  const [quedaId, setQuedaId] = useState<string | null>(null)
  const [bloqueo, setBloqueo] = useState<string | null>(null)
  const [simulacion, setSimulacion] = useState<ResultadoFusion | null>(null)
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [hecho, setHecho] = useState<{ readonly queda: string; readonly seVa: string } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const confirmarId = useId()

  const primeraId = primera?.id ?? null
  const segundaId = segunda?.id ?? null

  /** A different pair: everything after step 1 starts over. */
  function cambiarFicha(cual: 'primera' | 'segunda', persona: PersonaFusionBuscada | null): void {
    if (cual === 'primera') setPrimera(persona)
    else setSegunda(persona)
    setResumen(null)
    setQuedaId(null)
    setBloqueo(null)
    setSimulacion(null)
    setConfirmacion('')
    setError(null)
  }

  useEffect(() => {
    if (!primeraId || !segundaId || primeraId === segundaId) return
    let vigente = true
    void resumenFusion([primeraId, segundaId]).then((r) => {
      if (!vigente) return
      if (!r.ok) {
        setError(r.error)
        return
      }
      const a = r.data.find((p) => p.id === primeraId)
      const b = r.data.find((p) => p.id === segundaId)
      if (!a || !b) {
        setError('Una de las fichas ya no existe. Vuelve a buscarlas.')
        return
      }
      const porDefecto = supervivientePorDefecto(a, b)
      setResumen([a, b])
      setQuedaId(porDefecto.quedaId)
      setBloqueo(porDefecto.bloqueo)
    })
    return () => {
      vigente = false
    }
  }, [primeraId, segundaId])

  const queda = resumen?.find((p) => p.id === quedaId) ?? null
  const seVa = resumen?.find((p) => p.id !== quedaId) ?? null

  function elegirQueda(id: string): void {
    if (id === quedaId) return
    setQuedaId(id)
    setSimulacion(null)
    setConfirmacion('')
    setError(null)
  }

  async function simular(): Promise<void> {
    if (!queda || !seVa || trabajando) return
    setTrabajando(true)
    setError(null)
    const r = await fusionarPersonas({ quedaId: queda.id, seVaId: seVa.id, simular: true })
    setTrabajando(false)
    if (r.ok) setSimulacion(r.data)
    else setError(r.error)
  }

  async function fusionar(): Promise<void> {
    if (!queda || !seVa || !simulacion || trabajando || !confirmacionValida(confirmacion, queda)) return
    setTrabajando(true)
    setError(null)
    const r = await fusionarPersonas({ quedaId: queda.id, seVaId: seVa.id, simular: false })
    setTrabajando(false)
    if (r.ok) setHecho({ queda: nombreCompleto(queda), seVa: nombreCompleto(seVa) })
    else setError(r.error)
  }

  function reiniciar(): void {
    cambiarFicha('primera', null)
    cambiarFicha('segunda', null)
    setHecho(null)
    setVuelta((v) => v + 1)
  }

  if (hecho) {
    return (
      <TarjetaSistema className="grid gap-4">
        <TextoSistema role="status">{`Listo. ${hecho.queda} quedó con todo el historial de ${hecho.seVa}.`}</TextoSistema>
        <BotonSistema type="button" variante="outline" className="justify-self-start" onClick={reiniciar}>
          Fusionar otras fichas
        </BotonSistema>
      </TarjetaSistema>
    )
  }

  const nombreQueda = queda ? nombreCompleto(queda) : ''
  const seMueven = simulacion?.conteos.filter((c) => c.movidos + c.descartados + c.retirados > 0) ?? []
  const seConservan = simulacion?.conteos.filter((c) => c.conservados > 0) ?? []
  return (
    <div className="grid gap-6">
      <section aria-labelledby="fusion-paso-1" className="grid gap-3">
        <TituloSistema nivel={2} id="fusion-paso-1">
          1. Elige las dos fichas
        </TituloSistema>
        <SeccionesSistema key={vuelta}>
          <SelectorFicha etiqueta="Primera ficha" elegida={primera} onElegir={(p) => cambiarFicha('primera', p)} excluirId={segundaId} />
          <SelectorFicha etiqueta="Segunda ficha" elegida={segunda} onElegir={(p) => cambiarFicha('segunda', p)} excluirId={primeraId} />
        </SeccionesSistema>
      </section>

      {resumen && (
        <section aria-labelledby="fusion-paso-2" className="grid gap-3">
          <TituloSistema nivel={2} id="fusion-paso-2">
            2. Compara y elige la que queda
          </TituloSistema>
          <SeccionesSistema>
            {resumen.map((p) => {
              const otra = resumen.find((o) => o.id !== p.id) as ResumenPersonaFusion
              return (
                <FichaResumen
                  key={p.id}
                  persona={p}
                  queda={p.id === quedaId}
                  puede={bloqueo === null && puedeQuedar(p, otra)}
                  onQuedar={() => elegirQueda(p.id)}
                />
              )
            })}
          </SeccionesSistema>
          {bloqueo && (
            <p role="alert" className="text-sm text-danger-text">
              {bloqueo}
            </p>
          )}
        </section>
      )}

      {queda && seVa && !bloqueo && (
        <section aria-labelledby="fusion-paso-3" className="grid gap-3">
          <TituloSistema nivel={2} id="fusion-paso-3">
            3. Revisa qué se mueve
          </TituloSistema>
          {!simulacion ? (
            <BotonSistema type="button" variante="outline" className="justify-self-start" cargando={trabajando} onClick={() => void simular()}>
              Ver qué se mueve
            </BotonSistema>
          ) : (
            <TarjetaSistema className="grid gap-3">
              <TextoSistema>
                {`Se moverán ${simulacion.totalMovidos} registros a ${nombreQueda} y se descartarán ${simulacion.totalDescartados} repetidos.`}
              </TextoSistema>
              <ul aria-label="Qué se mueve" className="grid gap-1 text-sm">
                {seMueven.map((c) => (
                  <li key={c.clave} className="flex flex-wrap justify-between gap-x-4 border-b border-border py-1 last:border-b-0">
                    <span className="min-w-0 break-words">{c.etiqueta}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {[
                        `${c.movidos} movidos`,
                        c.descartados > 0 ? `${c.descartados} descartados` : null,
                        c.retirados > 0 ? `${c.retirados} cerrados como retirados` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              {seConservan.length > 0 && (
                <div className="grid gap-1">
                  <TextoSistema tamaño="sm">{`${TITULO_CONSERVADOS}: ${simulacion.totalConservados} registros.`}</TextoSistema>
                  <ul aria-label={TITULO_CONSERVADOS} className="grid gap-1 text-sm">
                    {seConservan.map((c) => (
                      <li key={c.clave} className="flex flex-wrap justify-between gap-x-4 border-b border-border py-1 last:border-b-0">
                        <span className="min-w-0 break-words">{c.etiqueta}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">{`${c.conservados} conservados`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {simulacion.camposCompletados.length > 0 && (
                <TextoSistema tamaño="sm">
                  {`Se completan en ${nombreQueda}: ${simulacion.camposCompletados.map(etiquetaCampo).join(', ')}`}
                </TextoSistema>
              )}
              <TextoSistema tamaño="sm" className="text-warning-text">
                {`No se puede deshacer. La ficha de ${nombreCompleto(seVa)} se borra y todo su historial pasa a ${nombreQueda}.`}
              </TextoSistema>
            </TarjetaSistema>
          )}
        </section>
      )}

      {queda && seVa && simulacion && !bloqueo && (
        <section aria-labelledby="fusion-paso-4" className="grid gap-3">
          <TituloSistema nivel={2} id="fusion-paso-4">
            4. Confirma
          </TituloSistema>
          <div className="grid gap-3 sm:max-w-md">
            <InputSistema
              id={confirmarId}
              label={`Escribe «${nombreQueda}» para confirmar`}
              value={confirmacion}
              autoComplete="off"
              onChange={(e) => setConfirmacion(e.target.value)}
            />
            <BotonSistema
              type="button"
              variante="peligro"
              className="justify-self-start"
              disabled={!confirmacionValida(confirmacion, queda)}
              cargando={trabajando}
              onClick={() => void fusionar()}
            >
              Fusionar
            </BotonSistema>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}
