'use client'

/**
 * Estudiantes — the state of "Agregar visitante" (artboard 02 of
 * design/estudiantes-asistencia; Q4, Q6, S7), shared by the leader list
 * (its own sheet) and the group drawer of /estudiantes/grupos ("Registrar
 * nuevo", a view of that drawer). The host renders `ContenidoVisitante` in
 * the body and `PieVisitante` in the footer with this state.
 *
 * Step "buscar": the church-wide search (cédula, teléfono or full name);
 * a result in this group or in another group of the ámbito cannot be added,
 * any other is added as visitante and marked presente. Step "crear": the
 * short form; "Registrar visitante" creates the person. When the database
 * answers `posibles_duplicados`, the flow goes back to "buscar" with the
 * people that match and offers "Es otra persona" (ignorar_coincidencias);
 * `cedula_existente` points to the search by that cédula.
 */
import { useEffect, useState } from 'react'

import { useNotificaciones } from '@/hooks/use-notificaciones'
import { buscarPersonas, type PersonaEncontrada } from '@/lib/actions/estudiantes-grupos.actions'
import { agregarVisitante, buscarCoincidencias, crearVisitante } from '@/lib/actions/estudiantes-lista.actions'
import { argumentosBusqueda } from '@/lib/platform/estudiantes/gestion-grupo'
import type { Experiencia, GradoEscala } from '@/lib/platform/estudiantes/grupos-datos'
import {
  datosVisitante,
  formularioInicial,
  validarVisitante,
  type ErroresVisitante,
  type FormularioVisitante,
} from '@/lib/platform/estudiantes/visitante'

const RETRASO_BUSQUEDA_MS = 300
const SIN_CONEXION = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

export interface GrupoVisitante {
  readonly id: string
  readonly nombre: string
  readonly experiencia: Experiencia
  readonly ambitoId: string
  readonly subarea: string
  /** The group's año escolar (default of the form). */
  readonly anio: number | null
}

export interface SesionVisitante {
  readonly fecha: string
  readonly turnoId: string | null
}

export type Busqueda =
  | { readonly tipo: 'cargando'; readonly consulta: string }
  | { readonly tipo: 'listo'; readonly consulta: string; readonly filas: readonly PersonaEncontrada[] }
  | { readonly tipo: 'error'; readonly consulta: string; readonly mensaje: string }

export interface FlujoVisitante {
  readonly grupo: GrupoVisitante
  readonly escala: readonly GradoEscala[]
  readonly hoy: string
  readonly paso: 'buscar' | 'crear'
  readonly consulta: string
  readonly busqueda: Busqueda | null
  /** People that match the new visitor (after `posibles_duplicados`). */
  readonly duplicados: readonly PersonaEncontrada[] | null
  readonly form: FormularioVisitante
  readonly errores: ErroresVisitante
  readonly errorCedula: string | null
  readonly errorGeneral: string | null
  /** The running action ("agregar:<id>", "crear"); `null` when idle. */
  readonly pendiente: string | null
  readonly setConsulta: (consulta: string) => void
  readonly cambiar: (parche: Partial<FormularioVisitante>) => void
  readonly agregar: (persona: PersonaEncontrada) => Promise<void>
  readonly irACrear: () => void
  readonly volverABuscar: (consulta?: string) => void
  readonly enviar: (ignorarCoincidencias?: boolean) => Promise<void>
  readonly cancelar: () => void
  /** Starts over at the form (the group drawer's "Registrar nuevo"). */
  readonly empezarEnFormulario: () => void
}

export interface OpcionesFlujoVisitante {
  readonly grupo: GrupoVisitante
  readonly sesion: SesionVisitante | null
  readonly escala: readonly GradoEscala[]
  readonly hoy: string
  /** After a person was added or created. */
  readonly onListo: () => void
  /** "Cancelar" of the first step. */
  readonly onCancelar: () => void
  /** "Atrás" of the form; by default it goes back to the search. */
  readonly onAtras?: () => void
}

export function useFlujoVisitante({ grupo, sesion, escala, hoy, onListo, onCancelar, onAtras }: OpcionesFlujoVisitante): FlujoVisitante {
  const toast = useNotificaciones()
  const inicial = (consulta: string): FormularioVisitante =>
    formularioInicial({ consulta, experiencia: grupo.experiencia, subarea: grupo.subarea, anio: grupo.anio })

  const [paso, setPaso] = useState<'buscar' | 'crear'>('buscar')
  const [consulta, setConsulta] = useState('')
  const [busqueda, setBusqueda] = useState<Busqueda | null>(null)
  const [duplicados, setDuplicados] = useState<readonly PersonaEncontrada[] | null>(null)
  const [form, setForm] = useState<FormularioVisitante>(() => inicial(''))
  const [tocado, setTocado] = useState(false)
  const [errores, setErrores] = useState<ErroresVisitante>({})
  const [errorCedula, setErrorCedula] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<string | null>(null)

  useEffect(() => {
    const texto = consulta.trim()
    if (argumentosBusqueda(texto) === null) return
    let vigente = true
    const temporizador = setTimeout(() => {
      setBusqueda({ tipo: 'cargando', consulta: texto })
      buscarPersonas({ grupoId: grupo.id, consulta: texto }).then(
        (r) => {
          if (!vigente) return
          setBusqueda(r.ok ? { tipo: 'listo', consulta: texto, filas: r.data } : { tipo: 'error', consulta: texto, mensaje: r.message })
        },
        () => vigente && setBusqueda({ tipo: 'error', consulta: texto, mensaje: SIN_CONEXION }),
      )
    }, RETRASO_BUSQUEDA_MS)
    return () => {
      vigente = false
      clearTimeout(temporizador)
    }
  }, [consulta, grupo.id])

  async function agregar(persona: PersonaEncontrada): Promise<void> {
    if (!sesion) return
    setPendiente(`agregar:${persona.personaId}`)
    try {
      const r = await agregarVisitante({ grupoId: grupo.id, fecha: sesion.fecha, turnoId: sesion.turnoId, personaId: persona.personaId })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast.success(`Agregaste a ${persona.nombre} como visitante`)
      onListo()
    } catch {
      toast.error(SIN_CONEXION)
    } finally {
      setPendiente(null)
    }
  }

  function irACrear(): void {
    if (!tocado) setForm(inicial(consulta))
    setTocado(true)
    setDuplicados(null)
    setErrores({})
    setErrorGeneral(null)
    setPaso('crear')
  }

  function volverABuscar(nueva?: string): void {
    if (nueva === undefined && onAtras) return onAtras()
    if (nueva !== undefined) setConsulta(nueva)
    setDuplicados(null)
    setPaso('buscar')
  }

  async function enviar(ignorarCoincidencias = false): Promise<void> {
    if (!sesion) return
    const encontrados = validarVisitante(form, grupo.experiencia, hoy)
    setErrores(encontrados)
    setErrorCedula(null)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0) {
      setPaso('crear')
      return
    }
    setPendiente('crear')
    try {
      const r = await crearVisitante({
        grupoId: grupo.id,
        fecha: sesion.fecha,
        turnoId: sesion.turnoId,
        datos: datosVisitante(form, grupo.experiencia, ignorarCoincidencias),
      })
      if (r.ok) {
        toast.success(`Registraste a ${`${form.nombre.trim()} ${form.apellido.trim()}`.trim()} como visitante`)
        onListo()
        return
      }
      if (r.codigo === 'posibles_duplicados') {
        const parecidos = await buscarCoincidencias({ grupoId: grupo.id, nombre: form.nombre, apellido: form.apellido, telefono: form.telefono })
        if (parecidos.ok && parecidos.data.length > 0) {
          setDuplicados(parecidos.data)
          setPaso('buscar')
          return
        }
        // Nobody to show (they may be outside what the caller sees): register anyway.
        if (parecidos.ok) return await enviar(true)
        setErrorGeneral(parecidos.message)
        return
      }
      if (r.codigo === 'cedula_existente') {
        setErrorCedula(r.message)
        return
      }
      setErrorGeneral(r.message)
    } catch {
      setErrorGeneral(SIN_CONEXION)
    } finally {
      setPendiente(null)
    }
  }

  return {
    grupo,
    escala,
    hoy,
    paso,
    consulta,
    busqueda,
    duplicados,
    form,
    errores,
    errorCedula,
    errorGeneral,
    pendiente,
    setConsulta,
    cambiar: (parche) => {
      setTocado(true)
      setForm((actual) => ({ ...actual, ...parche }))
    },
    agregar,
    irACrear,
    volverABuscar,
    enviar,
    cancelar: onCancelar,
    empezarEnFormulario: () => {
      setForm(inicial(''))
      setTocado(true)
      setDuplicados(null)
      setErrores({})
      setErrorCedula(null)
      setErrorGeneral(null)
      setPaso('crear')
    },
  }
}
