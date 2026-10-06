'use client'

/**
 * Dream Team — "Registrar persona nueva", inside the assign dialog (T7/T9).
 *
 * For a person the search did not find. POSTs /api/dream-team/usuarios with
 * the dialog's equipo and rol: the database creates the person and their
 * servicio in one transaction, or answers with the person who already holds
 * the cedula ('existente') or the namesakes born the same day
 * ('coincidencias'); then the coordinator picks one of them instead and the
 * dialog assigns them as usual. Children may have no cedula: then the birth
 * date is required. The optional representative (padre/madre/tutor) is found
 * by cedula and only linked; their cedula is never stored on the child.
 */
import { useState, type ReactElement } from 'react'

import { BotonSistema, InputSistema, SelectSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import {
  ESTADOS_CIVILES,
  GENEROS,
  type AltaPersonaResultado,
  type PersonaCandidata,
  type TipoRepresentante,
} from '@/lib/platform/dream-team/alta-persona'

export interface PersonaElegida {
  readonly id: string
  readonly nombre: string | null
  readonly apellido: string | null
  readonly email: string | null
}

interface Representante {
  readonly id: string
  readonly nombre: string
  readonly apellido: string
}

export interface RegistrarPersonaFormProps {
  readonly equipoId: string
  readonly rolId: string
  /** The person registered and assigned. */
  readonly onCreada: () => void
  /** The coordinator picked an existing person instead (cedula taken or a namesake). */
  readonly onElegir: (persona: PersonaElegida) => void
  readonly onCancelar: () => void
  readonly toast: ReturnType<typeof useNotificaciones>
}

const opciones = (valores: readonly string[]) => valores.map((v) => ({ valor: v, etiqueta: v }))

export function RegistrarPersonaForm({
  equipoId,
  rolId,
  onCreada,
  onElegir,
  onCancelar,
  toast,
}: RegistrarPersonaFormProps): ReactElement {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [cedula, setCedula] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [genero, setGenero] = useState('')
  const [estadoCivil, setEstadoCivil] = useState('Soltero')
  const [telefono, setTelefono] = useState('')
  const [bautizado, setBautizado] = useState('')
  const [fechaBautizo, setFechaBautizo] = useState('')
  const [tallaFranela, setTallaFranela] = useState('')
  const [redesSociales, setRedesSociales] = useState('')

  const [cedulaRep, setCedulaRep] = useState('')
  const [representante, setRepresentante] = useState<Representante | null>(null)
  const [tipoRep, setTipoRep] = useState<TipoRepresentante>('padre')
  const [buscandoRep, setBuscandoRep] = useState(false)
  const [repNoEncontrado, setRepNoEncontrado] = useState(false)

  const [enviando, setEnviando] = useState(false)
  const [existente, setExistente] = useState<{ id: string; nombre: string } | null>(null)
  const [candidatos, setCandidatos] = useState<readonly PersonaCandidata[]>([])

  const sinCedula = cedula.trim() === ''
  const completo =
    nombre.trim() !== '' && apellido.trim() !== '' && genero !== '' && estadoCivil !== '' &&
    (!sinCedula || fechaNacimiento !== '')
  const puedeEnviar = completo && equipoId !== '' && rolId !== '' && !enviando

  async function buscarRepresentante(): Promise<void> {
    if (cedulaRep.trim() === '' || buscandoRep) return
    setBuscandoRep(true)
    setRepNoEncontrado(false)
    try {
      const res = await fetch(`/api/dream-team/usuarios/cedula?cedula=${encodeURIComponent(cedulaRep.trim())}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('lookup failed')
      const { persona } = (await res.json()) as { persona: Representante | null }
      setRepresentante(persona)
      setRepNoEncontrado(persona === null)
    } catch {
      toast.error('No se pudo buscar al representante.')
    } finally {
      setBuscandoRep(false)
    }
  }

  async function registrar(): Promise<void> {
    if (!puedeEnviar) return
    setEnviando(true)
    setExistente(null)
    setCandidatos([])
    try {
      const res = await fetch('/api/dream-team/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipoId,
          rolId,
          nombre,
          apellido,
          cedula,
          fechaNacimiento,
          genero,
          estadoCivil,
          telefono,
          bautizado: bautizado === '' ? null : bautizado === 'si',
          fechaBautizo: bautizado === 'si' ? fechaBautizo : '',
          tallaFranela,
          redesSociales,
          representanteId: representante?.id ?? null,
          representanteTipo: representante ? tipoRep : null,
        }),
      })
      const body = (await res.json().catch(() => null)) as (AltaPersonaResultado & { error?: string }) | null
      if (!res.ok || !body) {
        toast.error((body && typeof body.error === 'string' && body.error) || 'No se pudo registrar a la persona.')
        return
      }
      if (body.resultado === 'creada') {
        toast.success(`${body.nombre} registrada y asignada.`)
        onCreada()
      } else if (body.resultado === 'existente') {
        setExistente({ id: body.personaId, nombre: body.nombre })
      } else {
        setCandidatos(body.candidatos)
      }
    } catch {
      toast.error('No se pudo registrar a la persona.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid gap-3 rounded border border-border p-3">
      <TextoSistema className="font-medium">Registrar persona nueva</TextoSistema>

      <div className="grid gap-3 sm:grid-cols-2">
        <InputSistema label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <InputSistema label="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
        <InputSistema label="Cédula (opcional)" value={cedula} onChange={(e) => setCedula(e.target.value)} />
        <InputSistema
          label={sinCedula ? 'Fecha de nacimiento' : 'Fecha de nacimiento (opcional)'}
          type="date"
          value={fechaNacimiento}
          onChange={(e) => setFechaNacimiento(e.target.value)}
        />
        <SelectSistema label="Género" opciones={opciones(GENEROS)} placeholder="Elige el género" value={genero} onValueChange={setGenero} />
        <SelectSistema label="Estado civil" opciones={opciones(ESTADOS_CIVILES)} value={estadoCivil} onValueChange={setEstadoCivil} />
        <InputSistema label="Teléfono (opcional)" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        <SelectSistema
          label="Bautizado (opcional)"
          opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
          placeholder="Sin dato"
          value={bautizado}
          onValueChange={setBautizado}
        />
        {bautizado === 'si' && (
          <InputSistema label="Fecha de bautizo (opcional)" type="date" value={fechaBautizo} onChange={(e) => setFechaBautizo(e.target.value)} />
        )}
        <InputSistema label="Talla de franela (opcional)" value={tallaFranela} onChange={(e) => setTallaFranela(e.target.value)} />
        <InputSistema label="Redes sociales (opcional)" value={redesSociales} onChange={(e) => setRedesSociales(e.target.value)} />
      </div>
      {sinCedula && (
        <TextoSistema variante="sutil" tamaño="sm">
          Sin cédula, la fecha de nacimiento es requerida para no duplicar personas.
        </TextoSistema>
      )}

      <div className="grid gap-2">
        <TextoSistema tamaño="sm" className="font-medium">Representante (padre/madre/tutor, opcional)</TextoSistema>
        {representante ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2">
            <TextoSistema className="min-w-0 truncate">{`${representante.nombre} ${representante.apellido}`}</TextoSistema>
            <div className="flex items-center gap-2">
              <SelectSistema
                aria-label="Tipo de representante"
                opciones={[{ valor: 'padre', etiqueta: 'Padre/Madre' }, { valor: 'tutor', etiqueta: 'Tutor' }]}
                value={tipoRep}
                onValueChange={(v) => setTipoRep(v as TipoRepresentante)}
              />
              <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setRepresentante(null)}>
                Quitar
              </BotonSistema>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <InputSistema
                aria-label="Cédula del representante"
                placeholder="Cédula del representante"
                value={cedulaRep}
                onChange={(e) => {
                  setCedulaRep(e.target.value)
                  setRepNoEncontrado(false)
                }}
              />
            </div>
            <BotonSistema type="button" variante="outline" tamaño="sm" disabled={cedulaRep.trim() === '' || buscandoRep} onClick={() => void buscarRepresentante()}>
              {buscandoRep ? 'Buscando…' : 'Buscar'}
            </BotonSistema>
          </div>
        )}
        {repNoEncontrado && (
          <TextoSistema variante="sutil" tamaño="sm">No hay nadie registrado con esa cédula.</TextoSistema>
        )}
      </div>

      {existente && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2">
          <TextoSistema tamaño="sm">{`Ya existe: ${existente.nombre}`}</TextoSistema>
          <BotonSistema
            type="button"
            tamaño="sm"
            onClick={() => onElegir({ id: existente.id, nombre: existente.nombre, apellido: null, email: null })}
          >
            Usar esta persona
          </BotonSistema>
        </div>
      )}
      {candidatos.length > 0 && (
        <div className="grid gap-2">
          <TextoSistema tamaño="sm">Ya hay personas con el mismo nombre y fecha de nacimiento:</TextoSistema>
          <ul className="rounded border border-border">
            {candidatos.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm">{`${c.nombre} ${c.apellido}`}</span>
                <BotonSistema
                  type="button"
                  variante="outline"
                  tamaño="sm"
                  onClick={() => onElegir({ id: c.id, nombre: c.nombre, apellido: c.apellido, email: null })}
                >
                  Usar
                </BotonSistema>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(equipoId === '' || rolId === '') && (
        <TextoSistema variante="sutil" tamaño="sm">Elige el equipo y el rol para registrar y asignar.</TextoSistema>
      )}
      <div className="flex justify-end gap-2">
        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={onCancelar}>
          Volver a buscar
        </BotonSistema>
        <BotonSistema type="button" tamaño="sm" disabled={!puedeEnviar} onClick={() => void registrar()}>
          {enviando ? 'Registrando…' : 'Registrar y asignar'}
        </BotonSistema>
      </div>
    </div>
  )
}
