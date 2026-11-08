'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'

import { BotonSistema, InputSistema } from '@/components/ui/sistema-diseno'
import type { Servicio } from '@/lib/platform/ninos/checkin'
import {
  agruparRetiro,
  cargarOpcionesRetiro,
  cargarRetirosRecientes,
  marcadosIniciales,
  mensajeDeErrorRetiro,
  ninoIdsParaRetiro,
  resumenRetiro,
  textoBotonRetiro,
  textoQuedan,
  validarCodigo,
  validarMarcados,
  validarRetiro,
  type FilaCodigo,
  type FilaRetirada,
  type OpcionRetiro,
  type Retiro,
  type RetirosRecientes,
} from '@/lib/platform/ninos/retiro'
import { createClient } from '@/lib/supabase/client'

import { registrarRetiroApi } from './api-visita'
import { NinosDelCodigo } from './retiro/ninos-del-codigo'
import { OTRA, QuienRetira } from './retiro/quien-retira'
import { RetiroHecho } from './retiro/retiro-hecho'
import { UltimosRetiros } from './retiro/ultimos-retiros'

type Props = {
  servicio: Servicio
  /** Called after a confirmed check-out (e.g. to refresh a room list). */
  onRetirado?: () => void
}

type Hecho = { titulo: string; detalle: string }

/**
 * Check-out by code, per child (odd/tasks/ninos-checkin-pco.md T2a, artboard
 * 07-retiro-celular): the code searches at its 4th digit, the anfitrión marks
 * which children leave and who picks up from their list (or another person
 * with a reason); the success says who is still inside with the same code.
 * While no code is open it shows the service's last pickups.
 */
export function RetiroPanel({ servicio, onRetirado }: Props) {
  const [texto, setTexto] = useState('')
  const [codigo, setCodigo] = useState<string | null>(null)
  const [retiro, setRetiro] = useState<Retiro | null>(null)
  const [marcados, setMarcados] = useState<string[]>([])
  const [opciones, setOpciones] = useState<OpcionRetiro[]>([])
  /** The chosen option's name, OTRA, or null. */
  const [eleccion, setEleccion] = useState<string | null>(null)
  const [otraNombre, setOtraNombre] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [hecho, setHecho] = useState<Hecho | null>(null)
  const [recientes, setRecientes] = useState<RetirosRecientes | null>(null)
  /** Only the answer to the last options request counts. */
  const pedidoOpciones = useRef(0)

  const cargarRecientes = useCallback(async () => {
    if (!servicio.turnoId) return
    setRecientes(await cargarRetirosRecientes(createClient(), servicio.turnoId, servicio.fecha))
  }, [servicio.turnoId, servicio.fecha])

  useEffect(() => {
    // Fetch on mount and on service change; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarRecientes()
  }, [cargarRecientes])

  /** Who may pick up the marked children (none marked or all of them = the whole code, as before). */
  async function cargarOpciones(c: string, adentro: readonly FilaCodigo[], elegidos: readonly string[]) {
    if (!servicio.turnoId || adentro.length === 0) return
    const pedido = ++pedidoOpciones.current
    const lista = await cargarOpcionesRetiro(createClient(), {
      codigo: c,
      turnoId: servicio.turnoId,
      fecha: servicio.fecha,
      ninoIds: ninoIdsParaRetiro(elegidos, adentro),
    })
    if (pedido !== pedidoOpciones.current) return
    // Without the list, "Otra persona" with a reason still works.
    setOpciones(lista)
    setEleccion((e) => (e === OTRA || lista.some((o) => o.nombre === e) ? e : null))
  }

  /** Looks the code up; `elegidos` are marked when still inside (else the only child inside). */
  async function buscar(c: string, elegidos?: readonly string[]) {
    if (!servicio.turnoId) return
    setCargando(true)
    const { data, error: err } = await createClient().rpc('ninos_buscar_codigo', {
      p_codigo: c,
      p_turno_id: servicio.turnoId,
      p_fecha: servicio.fecha,
    })
    setCargando(false)
    if (err) {
      setError(mensajeDeErrorRetiro(err))
      return
    }
    const filas = (data ?? []) as unknown as FilaCodigo[]
    if (filas.length === 0) {
      setRetiro(null)
      setError(`No hay niños con el código ${c} en este servicio. Revisa el número y el servicio elegido.`)
      return
    }
    const agrupado = agruparRetiro(filas)
    const adentroIds = agrupado.adentro.map((f) => f.nino_id)
    const iniciales = elegidos ? elegidos.filter((id) => adentroIds.includes(id)) : marcadosIniciales(agrupado.adentro)
    setCodigo(c)
    setRetiro(agrupado)
    setMarcados(iniciales)
    setOpciones([])
    setEleccion(null)
    setOtraNombre('')
    setMotivo('')
    await cargarOpciones(c, agrupado.adentro, iniciales)
  }

  function onCodigo(valor: string) {
    const digitos = valor.replace(/\D/g, '').slice(0, 4)
    setTexto(digitos)
    setHecho(null)
    setError(null)
    if (digitos.length < 4) {
      setCodigo(null)
      setRetiro(null)
      return
    }
    const v = validarCodigo(digitos)
    if (v.ok) void buscar(v.codigo)
  }

  function onEnviarCodigo(e: React.FormEvent) {
    e.preventDefault()
    const v = validarCodigo(texto)
    if (!v.ok) {
      setError(v.error)
      return
    }
    setError(null)
    void buscar(v.codigo)
  }

  function marcar(ninoId: string) {
    if (!retiro || !codigo) return
    const siguientes = marcados.includes(ninoId) ? marcados.filter((id) => id !== ninoId) : [...marcados, ninoId]
    setMarcados(siguientes)
    setError(null)
    void cargarOpciones(codigo, retiro.adentro, siguientes)
  }

  const quien = eleccion === OTRA ? otraNombre : eleccion
  const filasMarcadas = retiro ? retiro.adentro.filter((f) => marcados.includes(f.nino_id)) : []

  async function confirmar() {
    if (!codigo || !retiro || !servicio.turnoId) return
    const m = validarMarcados(filasMarcadas.map((f) => f.nino_id))
    if (!m.ok) {
      setError(m.error)
      return
    }
    const v = validarRetiro(
      eleccion === OTRA ? { tipo: 'otra', nombre: otraNombre, motivo } : eleccion ? { tipo: 'lista', nombre: eleccion } : null,
    )
    if (!v.ok) {
      setError(v.error)
      return
    }
    setError(null)
    setCargando(true)
    const ninoIds = ninoIdsParaRetiro(marcados, retiro.adentro)
    const { data, error: err } = await registrarRetiroApi({
      codigo,
      turnoId: servicio.turnoId,
      fecha: servicio.fecha,
      retiradoPor: v.retiradoPor,
      motivoOtra: v.motivoOtra,
      ...(ninoIds ? { ninoIds } : {}),
    })
    setCargando(false)
    if (err) {
      setError(mensajeDeErrorRetiro(err))
      return
    }
    setHecho(resumenRetiro((data ?? []) as FilaRetirada[], retiro.adentro, v.retiradoPor))
    onRetirado?.()
    void cargarRecientes()
    await buscar(codigo, [])
  }

  function siguienteCodigo() {
    setTexto('')
    setCodigo(null)
    setRetiro(null)
    setMarcados([])
    setHecho(null)
    setError(null)
  }

  function retirarQuedan() {
    if (!retiro || !codigo) return
    const todos = retiro.adentro.map((f) => f.nino_id)
    setHecho(null)
    setMarcados(todos)
    setEleccion(null)
    void cargarOpciones(codigo, retiro.adentro, todos)
  }

  if (hecho && codigo) {
    return (
      <section className="space-y-4" aria-label="Retiro">
        <RetiroHecho
          titulo={hecho.titulo}
          detalle={hecho.detalle}
          codigo={codigo}
          quedan={retiro?.adentro ?? []}
          onRetirarQuedan={retirarQuedan}
          onSiguiente={siguienteCodigo}
        />
      </section>
    )
  }

  const listo = filasMarcadas.length > 0 && Boolean(quien?.trim())

  return (
    <section className="space-y-4" aria-label="Retiro">
      <form className="space-y-1.5" onSubmit={onEnviarCodigo}>
        <InputSistema
          id="retiro-codigo"
          label="Código de seguridad"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="1234"
          className="font-mono text-2xl tracking-widest tabular-nums"
          value={texto}
          disabled={!servicio.turnoId}
          onChange={(e) => onCodigo(e.target.value)}
        />
        {texto.length < 4 && (
          <p className="text-xs text-muted-foreground">Escribe el código de la etiqueta del adulto. Busca solo al 4.º dígito.</p>
        )}
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </p>
      )}

      {!retiro && recientes && <UltimosRetiros recientes={recientes} />}

      {retiro && codigo && (
        <div className="space-y-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              Código <b className="font-mono tabular-nums text-foreground">{codigo}</b> ·{' '}
              <span className="font-mono tabular-nums">{retiro.adentro.length}</span> adentro
            </p>
            <BotonSistema type="button" variante="ghost" tamaño="sm" icono={RotateCcw} onClick={siguienteCodigo}>
              Otro código
            </BotonSistema>
          </div>

          <NinosDelCodigo retiro={retiro} marcados={marcados} onMarcar={marcar} />

          {retiro.adentro.length > 0 && (
            <>
              <QuienRetira
                opciones={opciones}
                eleccion={eleccion}
                onElegir={setEleccion}
                otraNombre={otraNombre}
                onOtraNombre={setOtraNombre}
                motivo={motivo}
                onMotivo={setMotivo}
              />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {listo
                    ? textoQuedan(retiro.adentro, marcados)
                    : filasMarcadas.length === 0
                      ? 'Marca al menos un niño.'
                      : 'Elige quién retira.'}
                </p>
                <BotonSistema type="button" tamaño="lg" className="w-full" disabled={cargando} onClick={() => void confirmar()}>
                  {cargando ? 'Registrando…' : textoBotonRetiro(filasMarcadas, quien)}
                </BotonSistema>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
