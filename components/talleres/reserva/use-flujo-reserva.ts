'use client'

/**
 * State of the public reservation flow (design/talleres-reserva/03–06, T5b of
 * odd/tasks/talleres-reserva-publica.md): horario → cédula → code (S3) |
 * new person (S4) | por verificar → for Parejas the partner (S12) →
 * confirmation, or the full / closed / already enrolled states (S13).
 *
 * The browser only holds what the person typed, the masked email and, after a
 * correct code, the raw reservation token (its hash is in the database and
 * talleres_reserva_crear needs it). The token is bound to the edición, so
 * changing the horario after a code asks for the cédula again.
 */
import { useCallback, useState } from 'react'

import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import {
  CAMPO_TRAMPA,
  MENSAJES,
  fichaParaEnviar,
  fichaVacia,
  nombrePareja,
  normalizarCedula,
  validarFicha,
  type CampoFicha,
  type FichaNueva,
  type ParejaCrear,
  type PrincipalCrear,
  type TallerPublico,
  type Vinculo,
} from '@/lib/platform/talleres/reserva-publica'

import { numero, postReserva, texto, type RespuestaReserva } from './api'

export type Vista =
  | 'horario'
  | 'cedula'
  | 'codigo'
  | 'confirmado'
  | 'por_verificar'
  | 'nuevo'
  | 'pareja'
  | 'listo'
  | 'lleno'
  | 'cerrada'
  | 'ya_inscrito'
  | 'genero_no_aplica'

export interface CodigoEnviado {
  readonly id: string
  readonly emailMascara: string | null
  /** Epoch ms from which a resend is allowed (60 s after each send). */
  readonly reenviarDesde: number
}

/** How the principal proved who they are. */
export type Identidad =
  | { readonly tipo: 'token'; readonly token: string; readonly nombre: string }
  | { readonly tipo: 'por_verificar'; readonly motivo: 'sin_correo' | 'sin_acceso' }
  | { readonly tipo: 'nueva' }

export type ModoPareja = 'buscar' | 'codigo' | 'confirmada' | 'nueva' | 'pendiente'

export interface EstadoPareja {
  readonly cedula: string
  readonly modo: ModoPareja
  readonly codigo: CodigoEnviado | null
  readonly token: string | null
  readonly nombre: string
  /** Why the partner is pending: no email on file, or cannot confirm now. */
  readonly motivoPendiente: 'sin_correo' | 'no_puede' | null
  readonly ficha: FichaNueva
  readonly errores: Partial<Record<CampoFicha, string>>
  readonly error: string | null
}

export interface Resultado {
  readonly porVerificar: boolean
  readonly cuentaNueva: boolean
}

const ESPERA_REENVIO_MS = 60_000

const parejaInicial = (): EstadoPareja => ({
  cedula: '',
  modo: 'buscar',
  codigo: null,
  token: null,
  nombre: '',
  motivoPendiente: null,
  ficha: fichaVacia(),
  errores: {},
  error: null,
})

const codigoDe = (r: RespuestaReserva): CodigoEnviado => ({
  id: texto(r.codigoId),
  emailMascara: texto(r.emailMascara) || null,
  reenviarDesde: Date.now() + ESPERA_REENVIO_MS,
})

/** The field of a "pareja.x" refusal, or null. */
const campoPareja = (campo: string) => (campo.startsWith('pareja.') ? (campo.slice(7) as CampoFicha) : null)

export function useFlujoReserva({ taller, edicionInicial, vistaInicial }: { taller: TallerPublico; edicionInicial: string; vistaInicial: Vista }) {
  const [vista, setVista] = useState<Vista>(vistaInicial)
  const [edicionId, setEdicionId] = useState(edicionInicial)
  const [tipoCedula, setTipoCedula] = useState<'V' | 'E'>('V')
  const [cedula, setCedula] = useState('')
  const [errorCedula, setErrorCedula] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<CodigoEnviado | null>(null)
  const [identidad, setIdentidad] = useState<Identidad | null>(null)
  const [ficha, setFichaEstado] = useState<FichaNueva>(() => ({ ...fichaVacia(), genero: taller.generoRequerido ?? '' }))
  const [errores, setErrores] = useState<Partial<Record<CampoFicha, string>>>({})
  const [aceptado, setAceptado] = useState(false)
  const [errorAceptado, setErrorAceptado] = useState<string | null>(null)
  const [pareja, setPareja] = useState<EstadoPareja>(parejaInicial)
  const [vinculo, setVinculo] = useState<Vinculo | null>(taller.vinculo)
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null)
  const [sitioWeb, setSitioWeb] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const cedulaNormalizada = normalizarCedula(`${tipoCedula}${cedula}`)
  const quien = nombrePareja(taller.pareja ? vinculo : null)

  const ir = useCallback((v: Vista) => {
    setError(null)
    setVista(v)
  }, [])

  /** One request at a time; the answer is handled only if it arrives. */
  async function pedir(ruta: Parameters<typeof postReserva>[0], cuerpo: Record<string, unknown>) {
    setCargando(true)
    setError(null)
    try {
      return await postReserva(ruta, cuerpo)
    } finally {
      setCargando(false)
    }
  }

  function elegirEdicion(id: string) {
    setEdicionId(id)
    // A code and its token belong to one edición.
    if (identidad?.tipo === 'token') setIdentidad(null)
    setCodigo(null)
    setPareja((p) => (p.modo === 'confirmada' || p.modo === 'codigo' ? { ...p, modo: 'buscar', token: null, codigo: null } : p))
    ir(identidad?.tipo === 'nueva' ? 'nuevo' : 'cedula')
  }

  // ─── Cédula and code (S3) ───

  async function identificar() {
    if (!cedulaNormalizada) {
      setErrorCedula(MENSAJES.cedula)
      return
    }
    setErrorCedula(null)
    const r = await pedir('identificar', { edicionId, slug: taller.slug, cedula: cedulaNormalizada, [CAMPO_TRAMPA]: sitioWeb })
    switch (r.estado) {
      case 'codigo':
        setCodigo(codigoDe(r))
        ir('codigo')
        return
      case 'nuevo':
        setIdentidad({ tipo: 'nueva' })
        setFichaEstado((f) => ({ ...f, cedula: cedulaNormalizada }))
        ir('nuevo')
        return
      case 'sin_correo':
        setIdentidad({ tipo: 'por_verificar', motivo: 'sin_correo' })
        ir('por_verificar')
        return
      case 'cerrada':
        ir('cerrada')
        return
      case 'invalido':
        setErrorCedula(r.mensaje ?? MENSAJES.cedula)
        return
      default:
        setError(r.mensaje ?? MENSAJES.error)
    }
  }

  async function verificar(valor: string): Promise<boolean> {
    if (!codigo) return false
    if (!/^\d{6}$/.test(valor)) {
      setError('Escribe los 6 dígitos del código.')
      return false
    }
    const r = await pedir('codigo/verificar', { codigoId: codigo.id, codigo: valor })
    if (r.estado === 'ok') {
      setIdentidad({ tipo: 'token', token: texto(r.token), nombre: texto(r.nombre) })
      ir('confirmado')
      return true
    }
    if (r.estado === 'bloqueado') {
      setCodigo(null)
      setVista('cedula')
    }
    setError(r.mensaje ?? MENSAJES.error)
    return false
  }

  async function reenviar() {
    if (!codigo) return
    const r = await pedir('codigo/reenviar', { codigoId: codigo.id, slug: taller.slug })
    if (r.estado === 'codigo') {
      setCodigo(codigoDe(r))
      return
    }
    if (r.estado === 'espera') {
      const segundos = numero(r.segundos) ?? 60
      setCodigo({ ...codigo, reenviarDesde: Date.now() + segundos * 1000 })
    }
    setError(r.mensaje ?? MENSAJES.error)
  }

  /** "No tengo acceso a ese correo": the request goes "por verificar" (design 03, 2a′). */
  function seguirSinCodigo() {
    setIdentidad({ tipo: 'por_verificar', motivo: 'sin_acceso' })
    ir('por_verificar')
  }

  // ─── New person (S4) ───

  function setFicha(campo: CampoFicha, valor: string) {
    setFichaEstado((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e))
  }

  // ─── Partner (S12) ───

  function setParejaCampo(cambios: Partial<EstadoPareja>) {
    setPareja((p) => ({ ...p, ...cambios }))
  }

  function setParejaFicha(campo: CampoFicha, valor: string) {
    setPareja((p) => ({ ...p, ficha: { ...p.ficha, [campo]: valor }, errores: { ...p.errores, [campo]: undefined } }))
  }

  async function buscarPareja() {
    const c = normalizarCedula(pareja.cedula)
    if (!c) {
      setParejaCampo({ error: MENSAJES.cedula })
      return
    }
    const propia = identidad?.tipo === 'nueva' ? normalizarCedula(ficha.cedula) : cedulaNormalizada
    if (c === propia) {
      setParejaCampo({ error: `Escribe la cédula de ${quien}, no la tuya.` })
      return
    }
    setParejaCampo({ error: null })
    const r = await pedir('identificar', { edicionId, slug: taller.slug, cedula: c, [CAMPO_TRAMPA]: sitioWeb })
    switch (r.estado) {
      case 'codigo':
        setParejaCampo({ cedula: c, modo: 'codigo', codigo: codigoDe(r) })
        return
      case 'nuevo':
        setParejaCampo({ cedula: c, modo: 'nueva', ficha: { ...pareja.ficha, cedula: c } })
        return
      case 'sin_correo':
        setParejaCampo({ cedula: c, modo: 'pendiente', motivoPendiente: 'sin_correo' })
        return
      case 'cerrada':
        ir('cerrada')
        return
      default:
        setParejaCampo({ error: r.mensaje ?? MENSAJES.error })
    }
  }

  async function verificarPareja(valor: string) {
    if (!pareja.codigo) return
    if (!/^\d{6}$/.test(valor)) {
      setParejaCampo({ error: 'Escribe los 6 dígitos del código.' })
      return
    }
    const r = await pedir('codigo/verificar', { codigoId: pareja.codigo.id, codigo: valor })
    if (r.estado === 'ok') {
      setParejaCampo({ modo: 'confirmada', token: texto(r.token), nombre: texto(r.nombre), error: null })
      return
    }
    if (r.estado === 'bloqueado') setParejaCampo({ modo: 'buscar', codigo: null })
    setParejaCampo({ error: r.mensaje ?? MENSAJES.error })
  }

  async function reenviarPareja() {
    if (!pareja.codigo) return
    const r = await pedir('codigo/reenviar', { codigoId: pareja.codigo.id, slug: taller.slug })
    if (r.estado === 'codigo') {
      setParejaCampo({ codigo: codigoDe(r), error: null })
      return
    }
    setParejaCampo({ error: r.mensaje ?? MENSAJES.error })
  }

  function parejaNoPuede() {
    setParejaCampo({ modo: 'pendiente', motivoPendiente: 'no_puede', codigo: null, error: null })
  }

  function cambiarCedulaPareja() {
    setPareja((p) => ({ ...parejaInicial(), cedula: p.cedula }))
  }

  // ─── Send ───

  function principalParaEnviar(): PrincipalCrear | null {
    if (identidad?.tipo === 'token') return { token: identidad.token }
    if (identidad?.tipo === 'por_verificar' && cedulaNormalizada) return { por_verificar: { cedula: cedulaNormalizada } }
    if (identidad?.tipo === 'nueva') {
      const e = validarFicha(ficha, { hoy: hoyEnCaracas(), contactoRequerido: true, generoRequerido: taller.generoRequerido })
      setErrores(e)
      return Object.keys(e).length === 0 ? { ficha_nueva: fichaParaEnviar(ficha) } : null
    }
    return null
  }

  function parejaParaEnviar(): ParejaCrear | null {
    if (pareja.modo === 'confirmada' && pareja.token) return { token: pareja.token }
    if (pareja.modo === 'pendiente') return { pendiente_cedula: pareja.cedula }
    if (pareja.modo === 'nueva') {
      const e = validarFicha(pareja.ficha, { hoy: hoyEnCaracas(), contactoRequerido: false })
      setParejaCampo({ errores: e })
      return Object.keys(e).length === 0 ? { ficha_nueva: fichaParaEnviar(pareja.ficha) } : null
    }
    setParejaCampo({
      error:
        pareja.modo === 'codigo'
          ? `Escribe el código que le llegó a ${quien}, o elige que confirme después.`
          : `Escribe la cédula de ${quien} y toca «Buscar».`,
    })
    return null
  }

  /** Whether the consent box must be checked: someone typed a new ficha. */
  const pideConsentimiento = identidad?.tipo === 'nueva' || (taller.pareja && pareja.modo === 'nueva')

  async function enviar() {
    const principal = principalParaEnviar()
    const parejaDatos = taller.pareja ? parejaParaEnviar() : null
    const faltaVinculo = taller.pareja && !taller.vinculo && !vinculo
    setErrorVinculo(faltaVinculo ? 'Elige si son matrimonio o novios.' : null)
    const faltaConsentimiento = pideConsentimiento && !aceptado
    setErrorAceptado(faltaConsentimiento ? 'Marca la casilla para enviar la solicitud.' : null)
    if (!principal || (taller.pareja && !parejaDatos) || faltaVinculo || faltaConsentimiento) {
      setError('Revisa los datos marcados.')
      return
    }

    const cuerpo: Record<string, unknown> = { edicionId, principal, [CAMPO_TRAMPA]: sitioWeb }
    if (parejaDatos) cuerpo.pareja = parejaDatos
    if (taller.pareja && !taller.vinculo && vinculo) cuerpo.vinculo = vinculo

    const r = await pedir('crear', cuerpo)
    switch (r.estado) {
      case 'ok':
        setResultado({ porVerificar: r.porVerificar === true, cuentaNueva: r.cuentaNueva === true })
        ir('listo')
        return
      case 'cupo_lleno':
        ir('lleno')
        return
      case 'cerrada':
        ir('cerrada')
        return
      case 'ya_inscrito':
        ir('ya_inscrito')
        return
      case 'genero_no_aplica':
        ir('genero_no_aplica')
        return
      case 'pareja_no_disponible':
        setParejaCampo({ error: r.mensaje ?? MENSAJES.parejaNoDisponible })
        setError(r.mensaje ?? MENSAJES.parejaNoDisponible)
        return
      case 'invalido': {
        const campo = texto(r.campo)
        const dePareja = campoPareja(campo)
        if (dePareja) setParejaCampo({ errores: { ...pareja.errores, [dePareja]: r.mensaje } })
        else if (campo && identidad?.tipo === 'nueva') setErrores((e) => ({ ...e, [campo]: r.mensaje }))
        setError(r.mensaje ?? MENSAJES.datosRechazados)
        return
      }
      default:
        setError(r.mensaje ?? MENSAJES.error)
    }
  }

  // ─── Avísame (S13) ───

  async function avisame(nombre: string, email: string): Promise<RespuestaReserva> {
    return pedir('avisame', { edicionId, nombre, email, [CAMPO_TRAMPA]: sitioWeb })
  }

  // ─── Back ───

  /** The view "‹ back" returns to, or null at the start and at the end. */
  function vistaAnterior(): Vista | null {
    switch (vista) {
      case 'cedula':
        return 'horario'
      case 'codigo':
      case 'confirmado':
      case 'nuevo':
        return 'cedula'
      case 'por_verificar':
        return identidad?.tipo === 'por_verificar' && identidad.motivo === 'sin_acceso' && codigo ? 'codigo' : 'cedula'
      case 'pareja':
        return identidad?.tipo === 'token' ? 'confirmado' : 'por_verificar'
      default:
        return null
    }
  }

  return {
    taller,
    vista,
    edicionId,
    tipoCedula,
    cedula,
    cedulaNormalizada,
    errorCedula,
    codigo,
    identidad,
    ficha,
    errores,
    aceptado,
    errorAceptado,
    pideConsentimiento,
    pareja,
    vinculo,
    errorVinculo,
    sitioWeb,
    resultado,
    error,
    cargando,
    quien,
    ir,
    elegirEdicion,
    setTipoCedula,
    setCedula: (v: string) => {
      setCedula(v)
      setErrorCedula(null)
    },
    identificar,
    verificar,
    reenviar,
    seguirSinCodigo,
    setFicha,
    setAceptado: (v: boolean) => {
      setAceptado(v)
      if (v) setErrorAceptado(null)
    },
    setParejaCampo,
    setParejaFicha,
    buscarPareja,
    verificarPareja,
    reenviarPareja,
    parejaNoPuede,
    cambiarCedulaPareja,
    setVinculo: (v: Vinculo) => {
      setVinculo(v)
      setErrorVinculo(null)
    },
    setSitioWeb,
    enviar,
    avisame,
    vistaAnterior,
  }
}

export type FlujoReserva = ReturnType<typeof useFlujoReserva>
