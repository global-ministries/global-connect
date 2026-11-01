'use client'

/**
 * State of the "Agregar familiar" sheet (S15 decisions 2–4, 7 and 11): the
 * relation, the hijo age question, the chosen path, the debounced masked
 * search, the homonym datum and the form of a relative without an account.
 * The server decides everything; this only keeps the steps and the answers.
 */
import { useEffect, useRef, useState } from 'react'

import { buscarFamiliar, solicitarFamiliar, solicitarFamiliarSinCuenta, verificarFamiliar } from '@/lib/actions/familia.actions'
import { hoyEnCaracas } from '@/lib/platform/ninos/fecha'
import {
  FORM_SIN_CUENTA_VACIO,
  MIN_LETRAS_BUSQUEDA,
  letrasDe,
  mensajeFamilia,
  nombreCandidato,
  pasoHoja,
  prellenarSinCuenta,
  validarSinCuenta,
  validarVerificacion,
  type CaminoHoja,
  type CandidatoFamilia,
  type FormSinCuenta,
  type FormVerificacion,
  type TipoFamilia,
} from '@/lib/platform/usuarios/familia-vista'

export interface AvisoEnviado {
  readonly titulo: string
  readonly texto: string
}

const VERIF_VACIA: FormVerificacion = { modo: 'fecha', dia: '', mes: '', ultimos4: '' }
const ESPERA_BUSQUEDA_MS = 400

export function useHojaFamiliar(onEnviada: (aviso: AvisoEnviado) => void) {
  const [relacion, setRelacion] = useState<TipoFamilia | null>(null)
  const [hijoMayor, setHijoMayor] = useState(false)
  const [camino, setCamino] = useState<CaminoHoja | null>(null)
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<CandidatoFamilia[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [elegido, setElegido] = useState<CandidatoFamilia | null>(null)
  const [verificados, setVerificados] = useState<readonly string[]>([])
  const [verif, setVerif] = useState<FormVerificacion>(VERIF_VACIA)
  const [errorVerif, setErrorVerif] = useState<string | null>(null)
  const [noCoincide, setNoCoincide] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [form, setForm] = useState<FormSinCuenta>(FORM_SIN_CUENTA_VACIO)
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const busqueda = useRef(0)

  const paso = pasoHoja({ relacion, hijoMayor, camino })
  const hoy = hoyEnCaracas()
  const validacion = relacion ? validarSinCuenta(form, relacion, hoy) : { errores: {}, menor: false }
  const necesitaVerificar = Boolean(elegido?.homonimo && !verificados.includes(elegido.token))
  const puedeEnviar = !enviando && (paso === 'buscar' ? Boolean(elegido) && !necesitaVerificar : paso === 'sincuenta')

  const conBusqueda = camino === 'buscar' && letrasDe(q) >= MIN_LETRAS_BUSQUEDA

  // The masked search runs once the typing pauses and the text has 3 letters;
  // an older answer is dropped when the text changed meanwhile.
  useEffect(() => {
    const id = ++busqueda.current
    if (!conBusqueda) return
    const t = setTimeout(async () => {
      const r = await buscarFamiliar(q.trim())
      if (id !== busqueda.current) return
      setBuscando(false)
      setResultados(r.ok ? r.data : [])
      setError(r.ok ? null : r.mensaje)
    }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(t)
  }, [conBusqueda, q])

  const limpiarVerificacion = () => {
    setVerif(VERIF_VACIA)
    setErrorVerif(null)
    setNoCoincide(false)
  }

  function reiniciar() {
    setRelacion(null)
    setHijoMayor(false)
    setCamino(null)
    setQ('')
    setElegido(null)
    setVerificados([])
    limpiarVerificacion()
    setForm(FORM_SIN_CUENTA_VACIO)
    setIntentado(false)
    setError(null)
  }

  function elegirRelacion(t: TipoFamilia) {
    setRelacion(t)
    setHijoMayor(false)
    setError(null)
  }

  function cambiarRelacion() {
    setCamino(null)
    setElegido(null)
    limpiarVerificacion()
    setError(null)
  }

  function elegirCamino(c: CaminoHoja, prellenar?: { nombre: string; apellido: string }) {
    setCamino(c)
    setError(null)
    if (prellenar) setForm((f) => ({ ...f, ...prellenar }))
  }

  function cambiarQ(valor: string) {
    setQ(valor)
    setResultados(null)
    setBuscando(letrasDe(valor) >= MIN_LETRAS_BUSQUEDA)
    setElegido(null)
    limpiarVerificacion()
  }

  function elegir(c: CandidatoFamilia) {
    setElegido(c)
    limpiarVerificacion()
    setError(null)
  }

  async function verificar() {
    if (!elegido) return
    const v = validarVerificacion(verif)
    if (!v.ok) return setErrorVerif(v.error)
    setVerificando(true)
    setErrorVerif(null)
    const r = await verificarFamiliar(elegido.token, v.datos)
    setVerificando(false)
    if (!r.ok) {
      setErrorVerif(r.mensaje)
      if (r.codigo === 'LIMITE_INTENTOS') setNoCoincide(true)
      return
    }
    if (r.data) setVerificados((ts) => [...ts, elegido.token])
    setNoCoincide(!r.data)
  }

  async function enviar(): Promise<boolean> {
    if (!relacion || enviando) return false
    setError(null)
    if (paso === 'sincuenta') {
      setIntentado(true)
      if (Object.keys(validacion.errores).length > 0) return false
    } else if (paso !== 'buscar' || !elegido || necesitaVerificar) {
      if (necesitaVerificar) setError(mensajeFamilia('VERIFICACION_REQUERIDA'))
      return false
    }
    setEnviando(true)
    const r = paso === 'buscar' && elegido ? await solicitarFamiliar(elegido.token, relacion) : await solicitarFamiliarSinCuenta(form, relacion)
    setEnviando(false)
    if (!r.ok) {
      setError(r.mensaje)
      return false
    }
    onEnviada(
      paso === 'buscar' && elegido
        ? { titulo: `Solicitud enviada a ${nombreCandidato(elegido)}`, texto: 'Aparecerá en tu familia cuando confirme.' }
        : { titulo: `${form.nombre.trim()} ${form.apellido.trim()} quedó en revisión`, texto: 'Tu campus revisa los datos y lo confirma.' },
    )
    return true
  }

  return {
    paso, relacion, hijoMayor, camino, q, resultados: conBusqueda ? resultados : null, buscando: conBusqueda && buscando, elegido, necesitaVerificar, verif, errorVerif, noCoincide,
    verificando, form, errores: intentado ? validacion.errores : {}, menor: validacion.menor, error, enviando, puedeEnviar,
    reiniciar, elegirRelacion, cambiarRelacion, elegirCamino, cambiarQ, elegir, verificar, enviar,
    confirmarHijoMayor: () => setHijoMayor(true),
    cambiarVerif: (p: Partial<FormVerificacion>) => setVerif((v) => ({ ...v, ...p })),
    cambiarForm: (p: Partial<FormSinCuenta>) => setForm((f) => ({ ...f, ...p })),
    sinCuentaDesdeBusqueda: () => elegirCamino('sincuenta', prellenarSinCuenta(q)),
    sinCuentaDesdeCandidato: () => elegido && elegirCamino('sincuenta', { nombre: elegido.nombres, apellido: elegido.primerApellido }),
  }
}

export type HojaFamiliar = ReturnType<typeof useHojaFamiliar>
