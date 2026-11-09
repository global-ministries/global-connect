'use client'

/**
 * Niños › Custodia — the «Custodia» section of a child's ficha
 * (odd/tasks/ninos-checkin-pco.md, T2e, S9.2 "Solo coordinación/dirección de
 * Niños"): who must not pick up the child, the backing and the protocol.
 * Coordination adds, edits, deactivates and reactivates them; the page shows
 * the section only to who may (and the RPCs check it again). The desk, the
 * salón and the pickup show the active ones as an alert; never the label nor
 * the parent.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Ban, Pencil, Plus } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, SkeletonSistema, TextareaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { guardarCustodia, listarCustodia } from '@/lib/actions/ninos-custodia.actions'
import {
  MAX_NOTAS,
  MAX_PERSONA,
  MAX_RELACION,
  MAX_RESPALDO,
  textoNoEntregar,
  validarRestriccion,
  type DatosRestriccion,
  type RestriccionFicha,
} from '@/lib/platform/ninos/custodia'

type Props = {
  readonly ninoId: string
  /** «Sofía»: for the sentences. */
  readonly nombre: string
}

type Editando = { readonly id: string | null; readonly datos: DatosRestriccion }

const NUEVA: DatosRestriccion = { persona: '', relacion: '', respaldo: '', notas: '' }

function Editor({
  inicial,
  guardando,
  error,
  onGuardar,
  onCancelar,
}: {
  readonly inicial: Editando
  readonly guardando: boolean
  readonly error: string | null
  readonly onGuardar: (datos: DatosRestriccion) => void
  readonly onCancelar: () => void
}) {
  const [datos, setDatos] = useState<DatosRestriccion>(inicial.datos)
  const campo = (k: keyof DatosRestriccion) => (e: { target: { value: string } }) => setDatos((d) => ({ ...d, [k]: e.target.value }))
  const prefijo = `custodia-${inicial.id ?? 'nueva'}`
  return (
    <form
      aria-label={inicial.id ? 'Editar restricción' : 'Nueva restricción'}
      className="grid gap-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onGuardar(datos)
      }}
      noValidate
    >
      <InputSistema id={`${prefijo}-persona`} label="Persona que no puede retirar" autoComplete="off" maxLength={MAX_PERSONA} value={datos.persona} onChange={campo('persona')} />
      <InputSistema id={`${prefijo}-relacion`} label="Relación (opcional)" placeholder="Ej.: papá" autoComplete="off" maxLength={MAX_RELACION} value={datos.relacion} onChange={campo('relacion')} />
      <InputSistema
        id={`${prefijo}-respaldo`}
        label="Respaldo"
        placeholder="Ej.: orden judicial del 3/5/2026"
        autoComplete="off"
        maxLength={MAX_RESPALDO}
        value={datos.respaldo}
        onChange={campo('respaldo')}
      />
      <TextareaSistema
        id={`${prefijo}-notas`}
        label="Qué hacer en la puerta (opcional)"
        placeholder="Ej.: mantener al niño en el salón y avisar a coordinación"
        maxLength={MAX_NOTAS}
        value={datos.notas}
        onChange={campo('notas')}
      />
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <BotonSistema type="button" variante="outline" disabled={guardando} onClick={onCancelar}>
          Cancelar
        </BotonSistema>
        <BotonSistema type="submit" cargando={guardando} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar restricción'}
        </BotonSistema>
      </div>
    </form>
  )
}

export function SeccionCustodia({ ninoId, nombre }: Props): ReactElement {
  const [lista, setLista] = useState<RestriccionFicha[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [editando, setEditando] = useState<Editando | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const cargar = useCallback(async () => {
    const r = await listarCustodia(ninoId)
    if (r.ok) {
      setLista(r.data)
      setErrorLista(null)
    } else {
      setErrorLista(r.message)
    }
  }, [ninoId])

  useEffect(() => {
    // Fetch on mount; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [cargar])

  async function guardar(id: string | null, datos: DatosRestriccion, activa: boolean, mensaje: string) {
    const invalido = validarRestriccion(datos)
    if (invalido) {
      setError(invalido)
      return false
    }
    setGuardando(true)
    setError(null)
    const r = await guardarCustodia({ id, ninoId, ...datos, activa })
    setGuardando(false)
    if (!r.ok) {
      setError(r.message)
      return false
    }
    setAviso(mensaje)
    await cargar()
    return true
  }

  async function guardarEditor(datos: DatosRestriccion) {
    if (!editando) return
    const persona = datos.persona.trim()
    if (await guardar(editando.id, datos, true, `Restricción guardada: no entregar a ${persona}.`)) setEditando(null)
  }

  async function cambiarActiva(r: RestriccionFicha, activa: boolean) {
    setEditando(null)
    const datos = { persona: r.persona, relacion: r.relacion ?? '', respaldo: r.respaldo, notas: r.notas ?? '' }
    await guardar(r.id, datos, activa, activa ? `Restricción activa de nuevo: ${r.persona}.` : `Restricción desactivada: ${r.persona} ya no se bloquea.`)
  }

  const abrir = (e: Editando) => {
    setError(null)
    setAviso('')
    setEditando(e)
  }

  return (
    <section aria-labelledby={`custodia-${ninoId}`} className="grid gap-3">
      <div className="grid gap-1">
        <TituloSistema nivel={3} id={`custodia-${ninoId}`}>
          Custodia
        </TituloSistema>
        <TextoSistema variante="sutil" tamaño="sm">
          Personas que no pueden retirar a {nombre}. Solo coordinación lo ve y lo edita; sale como alerta en la mesa, el salón y el retiro, y el
          retiro se lo impide. No sale en la etiqueta ni lo ve el representante.
        </TextoSistema>
      </div>

      {errorLista && (
        <p role="alert" className="text-sm text-danger-text">
          {errorLista}
        </p>
      )}
      {!lista && !errorLista && <SkeletonSistema alto="56px" />}

      {lista && lista.length > 0 && (
        <ul aria-label="Restricciones de custodia" className="divide-y divide-border/60 rounded-md border border-border">
          {lista.map((r) =>
            editando?.id === r.id ? (
              <li key={r.id} className="p-2">
                <Editor inicial={editando} guardando={guardando} error={error} onGuardar={(d) => void guardarEditor(d)} onCancelar={() => setEditando(null)} />
              </li>
            ) : (
              <li key={r.id} className="grid min-w-0 gap-1.5 p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Ban className={r.activa ? 'size-4 shrink-0 text-danger-text' : 'size-4 shrink-0 text-muted-foreground'} aria-hidden />
                  <span className={r.activa ? 'min-w-0 break-words text-sm font-semibold text-foreground' : 'min-w-0 break-words text-sm font-medium text-muted-foreground'}>
                    {textoNoEntregar(r)}
                  </span>
                  <BadgeSistema variante={r.activa ? 'error' : 'default'} tamaño="sm">
                    {r.activa ? 'Activa' : 'Inactiva'}
                  </BadgeSistema>
                </div>
                {(r.relacion || r.notas) && (
                  <p className="break-words pl-6 text-[13px] text-muted-foreground">
                    {[r.relacion && `Relación: ${r.relacion}`, r.notas && `En la puerta: ${r.notas}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pl-4">
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    icono={Pencil}
                    disabled={guardando}
                    aria-label={`Editar la restricción de ${r.persona}`}
                    onClick={() => abrir({ id: r.id, datos: { persona: r.persona, relacion: r.relacion ?? '', respaldo: r.respaldo, notas: r.notas ?? '' } })}
                  >
                    Editar
                  </BotonSistema>
                  <BotonSistema
                    type="button"
                    variante="ghost"
                    tamaño="sm"
                    disabled={guardando}
                    aria-label={r.activa ? `Desactivar la restricción de ${r.persona}` : `Activar de nuevo la restricción de ${r.persona}`}
                    onClick={() => void cambiarActiva(r, !r.activa)}
                  >
                    {r.activa ? 'Desactivar' : 'Activar de nuevo'}
                  </BotonSistema>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {lista && lista.length === 0 && !editando && (
        <TextoSistema variante="sutil" tamaño="sm">
          Sin restricciones de custodia.
        </TextoSistema>
      )}

      {editando?.id === null ? (
        <Editor inicial={editando} guardando={guardando} error={error} onGuardar={(d) => void guardarEditor(d)} onCancelar={() => setEditando(null)} />
      ) : (
        lista && (
          <BotonSistema type="button" variante="outline" tamaño="sm" icono={Plus} className="justify-self-start" onClick={() => abrir({ id: null, datos: NUEVA })}>
            Agregar restricción
          </BotonSistema>
        )
      )}
      {error && !editando && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm text-success-text empty:hidden">
        {aviso}
      </p>
    </section>
  )
}
