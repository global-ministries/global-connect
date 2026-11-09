'use client'

/**
 * Estudiantes — client island of the leader list
 * (/estudiantes/grupos/[grupoId], C3b of odd/tasks/estudiantes-fase-b.md) in
 * the planning style (E4a of odd/tasks/estudiantes-estilo-dps.md, S5 and S6;
 * artboards 02 / 03 of design/estudiantes-dps, B6–B19).
 *
 * Top to bottom: the header band (crumbs "Estudiantes › <ámbito> › <grupo>"
 * in the desktop header; phone "‹ origin" from `?desde=` and the eyebrow;
 * the date pill stepping between the meetings that exist, The Living Room's
 * "Otra fecha" and inline "Lugar"; the meta "9:00 · líder …"; "N de M
 * marcados · …" with its bar; the entrenador's group selector and "Agregar
 * visitante" from md), the toolbar (Todos / Sin marcar / Presentes / Ausentes
 * with counts, the search, the autosave status), the entrenador notice (S4)
 * and the "¿La sumas al grupo?" suggestions (A2), then one data region with
 * the sections Integrantes («Marcar todos») and Visitantes («Agregar
 * visitante» as its last row). Each row: avatar and name (opens the detail),
 * Estado, Año / Edad and Historial from md, and the marks: «Ausente» written
 * next to the big «Presente» circle (B13), or "Nueva hoy" (Q4).
 *
 * Every tap saves at once and shows the change before the server answers;
 * the status says "Guardando… / Guardado" and a live region names the mark.
 * A failure rolls it back with the error toast (lib/platform/estudiantes/
 * marcas.ts). «Marcar todos» marks Presente only the members still unmarked
 * (never an «Ausente») through the same action, one person each. The meeting
 * lives in the URL (`?fecha=&turno=`), so another meeting is a navigation.
 */
import { useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, CalendarX2, Clock, MapPin, Search, Star, UserPlus, UsersRound } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { EstadoGuardado } from '@/components/dps/estado-guardado'
import { AvatarIniciales } from '@/components/grupos-vida/planner/avatar-iniciales'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { confirmarMiembroLista, guardarLugar, marcarAsistencia } from '@/lib/actions/estudiantes-lista.actions'
import { edadEn } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoLista, ListaGrupo, Marca } from '@/lib/platform/estudiantes/lista-datos'
import type { DatosListaLider } from '@/lib/platform/estudiantes/lista-servidor'
import {
  FILTROS_LISTA,
  contarLista,
  destinoAtras,
  estadoFila,
  fechaCorta,
  fechaLarga,
  filtrarLista,
  horaCorta,
  mensajeMarca,
  pasosReunion,
  pastillasReunion,
  pendientesMarcarTodos,
  pistaDia,
  progresoLista,
  puntosHistorial,
  type FilaVista,
  type FiltroLista,
  type PasoReunion,
} from '@/lib/platform/estudiantes/lista-vista'
import { MARCAS_VACIAS, confirmarMarca, marcaVisible, revertirMarca, tocarMarca, type EstadoMarcas, type PeticionMarca } from '@/lib/platform/estudiantes/marcas'
import { cn } from '@/lib/utils'

import { FiltroSegmentado } from '../planificacion/filtro-segmentado'
import {
  BarraHerramientasPlanificacion,
  BarraProgreso,
  EncabezadoPlanificacion,
  LineaFecha,
  MarcoPlanificacion,
  MetaFecha,
  ResumenPlanificacion,
} from '../planificacion/marco-planificacion'
import { MarcasFila } from '../planificacion/marcas'
import { MigasEstudiantes } from '../planificacion/migas-estudiantes'
import { PastillaFecha } from '../planificacion/pastilla-fecha'
import {
  BandaSeccion,
  CLASE_ACCION_TEXTO,
  CLASE_AVATAR_FILA,
  CLASE_FILA,
  CLASE_LINEA,
  CabeceraColumnas,
  PieRegion,
  RegionDatos,
  TablaPlanificacion,
  VacioSeccion,
} from '../planificacion/region-datos'
import { useEstadoGuardado } from '../planificacion/use-estado-guardado'
import { AgregarVisitante } from '../visitante/agregar-visitante'
import { DetallePersona } from './detalle-persona'
import { PuntosAsistencia, TONO_ESTADO } from './estado-fila'

const SIN_CONEXION = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

// Nombre · Estado · Año · Historial (from lg) · Marcar.
const COLUMNAS = 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_88px_156px] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_96px_150px_156px]'

export interface ListaLiderClientProps {
  readonly datos: DatosListaLider
  /** `?desde=` (grupos | vivo): where the back control goes. */
  readonly desde?: string
}

/** "2do año" in Transit / Inside Out, "21 años" in The Living Room. */
function detallePersona(grupo: GrupoLista, fila: FilaVista, hoy: Date): string {
  if (grupo.experiencia === 'the_living_room') {
    const edad = edadEn(fila.persona.fechaNacimiento, hoy)
    return edad === null ? '—' : `${edad} años`
  }
  return fila.persona.anioEtiqueta ?? '—'
}

/** "líder Andrea Molina", "líderes Rafael Mendoza, Iván Rosales"; `null` without leaders. */
function textoLideres(lideres: readonly string[]): string | null {
  if (lideres.length === 0) return null
  return `${plural(lideres.length, 'líder', 'líderes')} ${lideres.join(', ')}`
}

const minuscula = (texto: string): string => texto.charAt(0).toLocaleLowerCase('es') + texto.slice(1)

interface Respuesta {
  readonly visitas: number
  readonly sugerirConfirmar: boolean
}

export function ListaLiderClient({ datos, desde }: ListaLiderClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const toast = useNotificaciones()
  const [navegando, iniciarNavegacion] = useTransition()
  const guardado = useEstadoGuardado()

  const { grupo: mio, lista, sesiones, sesion, historial, hoy } = datos
  const atras = destinoAtras({ desde, grupoId: mio.grupoId, esRaiz: datos.esRaiz, sesion: datos.sesion })
  const entrenador = mio.puedeVerVivo && !mio.soyLider
  const tlr = mio.experiencia === 'the_living_room'
  const ahora = useMemo(() => new Date(), [])

  // Opens in «Todos» (S6): the leader marks the whole group at once.
  const [filtro, setFiltro] = useState<FiltroLista>('todos')
  const [q, setQ] = useState('')
  const [marcas, setMarcas] = useState<EstadoMarcas>(MARCAS_VACIAS)
  const marcasRef = useRef<EstadoMarcas>(MARCAS_VACIAS)
  const [respuestas, setRespuestas] = useState<Readonly<Record<string, Respuesta>>>({})
  const [descartadas, setDescartadas] = useState<ReadonlySet<string>>(new Set())
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<{ readonly personaId: string; readonly abierto: boolean } | null>(null)
  const [alta, setAlta] = useState<{ readonly abierto: boolean; readonly clave: number } | null>(null)
  const [lugar, setLugar] = useState(lista?.lugar ?? '')
  const [aviso, setAviso] = useState('')
  const lugarGuardado = useRef(lista?.lugar ?? '')
  // «Marcar todos» disables itself: the focus moves to the first circle of Integrantes.
  const integrantesRef = useRef<HTMLUListElement>(null)
  const enfocarIntegrantes = useRef(false)

  useLayoutEffect(() => {
    if (!enfocarIntegrantes.current) return
    enfocarIntegrantes.current = false
    integrantesRef.current?.querySelector<HTMLButtonElement>('[data-marca]')?.focus()
  })

  const filas: FilaVista[] = useMemo(() => {
    if (!lista) return []
    return lista.personas.map((persona) => {
      const visible = marcaVisible(marcas, persona.personaId, { estado: persona.marca, marcadoAt: persona.marcadoAt })
      const r = respuestas[persona.personaId]
      const conRespuesta = r ? { ...persona, visitas: r.visitas, sugerirConfirmar: r.sugerirConfirmar } : persona
      return { persona: conRespuesta, marca: visible.estado, marcadoAt: visible.marcadoAt, estado: estadoFila(persona, visible.estado, lista.fecha) }
    })
  }, [lista, marcas, respuestas])

  const cuentas = contarLista(filas)
  const progreso = progresoLista(cuentas)
  const pendientes = pendientesMarcarTodos(filas)
  const { integrantes, visitantes } = filtrarLista(filas, filtro, q)
  const sugeridas = filas.filter((f) => f.persona.estado === 'visitante' && f.persona.sugerirConfirmar && !descartadas.has(f.persona.personaId))
  const filaDetalle = detalle ? (filas.find((f) => f.persona.personaId === detalle.personaId) ?? null) : null

  function navegar(parametros: Record<string, string | null>): void {
    const consulta = new URLSearchParams()
    for (const [clave, valor] of Object.entries({ ...parametros, desde: desde ?? null })) if (valor) consulta.set(clave, valor)
    const texto = consulta.toString()
    iniciarNavegacion(() => router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false }))
  }

  function aplicarMarcas(siguiente: EstadoMarcas): void {
    marcasRef.current = siguiente
    setMarcas(siguiente)
  }

  /** Saves one optimistic mark; `null` when it was saved, else why not (the mark is rolled back). */
  async function enviar(lista: ListaGrupo, fila: FilaVista, peticion: PeticionMarca): Promise<string | null> {
    guardado.empezar()
    const revertir = (mensaje: string): string => {
      aplicarMarcas(revertirMarca(marcasRef.current, peticion))
      guardado.terminar(false)
      return mensaje
    }
    try {
      const r = await marcarAsistencia({ grupoId: lista.grupo.id, fecha: lista.fecha, turnoId: lista.turnoId, personaId: fila.persona.personaId, estado: peticion.estado })
      if (!r.ok) return revertir(r.message)
      aplicarMarcas(confirmarMarca(marcasRef.current, peticion))
      if (fila.persona.estado === 'visitante') setRespuestas((actual) => ({ ...actual, [fila.persona.personaId]: r.data }))
      guardado.terminar(true)
      return null
    } catch {
      return revertir(SIN_CONEXION)
    }
  }

  async function marcar(lista: ListaGrupo, fila: FilaVista, toque: Marca): Promise<void> {
    const base = { estado: fila.persona.marca, marcadoAt: fila.persona.marcadoAt }
    const { marcas: siguiente, peticion } = tocarMarca(marcasRef.current, fila.persona.personaId, base, toque, new Date().toISOString())
    aplicarMarcas(siguiente)
    setAviso('')
    const error = await enviar(lista, fila, peticion)
    if (error) {
      toast.error(error)
      setAviso(`No se pudo guardar la marca de ${fila.persona.nombre}.`)
      return
    }
    setAviso(mensajeMarca(fila.persona.nombre, peticion.estado))
  }

  async function marcarTodos(lista: ListaGrupo): Promise<void> {
    if (pendientes.length === 0) return
    const momento = new Date().toISOString()
    let siguiente = marcasRef.current
    const envios = pendientes.map((fila) => {
      const r = tocarMarca(siguiente, fila.persona.personaId, { estado: fila.persona.marca, marcadoAt: fila.persona.marcadoAt }, 'presente', momento)
      siguiente = r.marcas
      return { fila, peticion: r.peticion }
    })
    aplicarMarcas(siguiente)
    enfocarIntegrantes.current = true
    setAviso(`Marcaste ${envios.length} ${plural(envios.length, 'integrante', 'integrantes')} como ${plural(envios.length, 'presente', 'presentes')}. Los ausentes no cambian.`)

    // The first mark may open the meeting: it goes alone, the rest together.
    const [primero, ...resto] = envios
    const errorPrimero = await enviar(lista, primero.fila, primero.peticion)
    if (errorPrimero) {
      aplicarMarcas(resto.reduce((m, e) => revertirMarca(m, e.peticion), marcasRef.current))
      toast.error(errorPrimero)
      setAviso('No se pudo marcar a todos.')
      return
    }
    const errores = (await Promise.all(resto.map((e) => enviar(lista, e.fila, e.peticion)))).filter((e): e is string => e !== null)
    if (errores.length > 0) toast.error(errores[0])
  }

  async function confirmar(lista: ListaGrupo, fila: FilaVista): Promise<void> {
    setConfirmando(fila.persona.personaId)
    try {
      const r = await confirmarMiembroLista({ grupoId: lista.grupo.id, personaId: fila.persona.personaId })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      toast.success(`${fila.persona.nombre} ya es integrante del grupo`)
      router.refresh()
    } catch {
      toast.error(SIN_CONEXION)
    } finally {
      setConfirmando(null)
    }
  }

  async function guardarElLugar(lista: ListaGrupo): Promise<void> {
    const texto = lugar.trim()
    if (texto === lugarGuardado.current.trim()) return
    try {
      const r = await guardarLugar({ grupoId: lista.grupo.id, fecha: lista.fecha, turnoId: lista.turnoId, lugar: texto })
      if (!r.ok) {
        toast.error(r.message)
        return
      }
      lugarGuardado.current = texto
      toast.success(texto ? 'Lugar guardado' : 'Lugar borrado')
    } catch {
      toast.error(SIN_CONEXION)
    }
  }

  const abrirAlta = (): void => setAlta((actual) => ({ abierto: true, clave: (actual?.clave ?? 0) + 1 }))
  const ambitoHref = desde === 'grupos' || desde === 'vivo' ? (atras?.href ?? null) : null
  const horaSesion = lista ? (sesiones.find((s) => s.fecha === lista.fecha && s.turnoId === lista.turnoId)?.hora ?? lista.grupo.hora) : null
  // The detail's "Hoy" / "Reunión" card: "Domingo 25 oct · 9:00", "Jueves 29 oct · Casa de Adrián".
  const reunionDetalle = lista ? [fechaLarga(lista.fecha), tlr ? lugar.trim() || null : horaCorta(horaSesion)].filter(Boolean).join(' · ') : ''
  const pastillas = lista && tlr ? pastillasReunion(sesiones, hoy) : []
  const pasos = lista ? pasosReunion({ sesiones, actual: { fecha: lista.fecha, turnoId: lista.turnoId }, experiencia: mio.experiencia, hoy }) : null
  const meta = lista
    ? [tlr ? pistaDia(lista.grupo.diaSemana) : null, horaCorta(tlr ? lista.grupo.hora : horaSesion), textoLideres(mio.lideres)].filter(Boolean).join(' · ')
    : ''

  const irA = (paso: PasoReunion): void => navegar(tlr ? { fecha: paso.fecha } : { fecha: paso.fecha, turno: paso.turnoId })
  const paso = (p: PasoReunion | null | undefined, cual: 'anterior' | 'siguiente') =>
    p ? { etiqueta: `Reunión ${cual}, ${minuscula(p.etiqueta)}`, onIr: () => irA(p) } : null

  function control(lista: ListaGrupo, fila: FilaVista): ReactElement {
    if (fila.estado === 'nueva') {
      return (
        <span className="flex shrink-0 justify-end pr-1.5">
          <BadgeSistema variante="info" tamaño="sm">
            Nueva hoy
          </BadgeSistema>
        </span>
      )
    }
    return (
      <MarcasFila
        nombre={fila.persona.nombre}
        clave={fila.persona.personaId}
        presente={fila.marca === 'presente'}
        onPresente={() => void marcar(lista, fila, 'presente')}
        secundarias={[{ texto: 'Ausente', tono: 'danger', activa: fila.marca === 'ausente', onClick: () => void marcar(lista, fila, 'ausente') }]}
      />
    )
  }

  function fila(lista: ListaGrupo, f: FilaVista): ReactElement {
    const tono = TONO_ESTADO[f.estado]
    const puntos = puntosHistorial(historial, f.persona.personaId)
    const visita = f.estado === 'nueva' ? 'Primera vez hoy' : f.persona.estado === 'visitante' && f.persona.visitas > 0 ? `${f.persona.visitas}.ª visita` : null
    const movil = visita ?? [detallePersona(lista.grupo, f, ahora), puntos.total > 0 ? `Vino ${puntos.presentes} de ${puntos.total}` : null].filter(Boolean).join(' · ')
    return (
      <li key={f.persona.personaId} className={cn(CLASE_LINEA, CLASE_FILA, COLUMNAS)}>
        <button
          type="button"
          aria-label={`Abrir ${f.persona.nombre}`}
          onClick={() => setDetalle({ personaId: f.persona.personaId, abierto: true })}
          className="focus-ring flex min-w-0 flex-1 touch-manipulation items-center gap-3 self-stretch rounded-md text-left md:gap-2.5"
        >
          <AvatarIniciales nombres={[f.persona.nombre]} className={CLASE_AVATAR_FILA} />
          <span className="min-w-0">
            <span className={cn('block truncate text-[15px] font-semibold text-foreground md:text-sm', f.marca === 'presente' && 'font-medium text-muted-foreground')}>
              {f.persona.nombre}
            </span>
            <span className="block truncate text-[13px] text-muted-foreground md:hidden">{movil}</span>
            {visita && <span className="hidden truncate text-xs text-muted-foreground md:block">{visita}</span>}
          </span>
        </button>
        <span className="hidden min-w-0 md:block">
          <PuntoEstado tono={tono.tono} etiqueta={tono.etiqueta} />
        </span>
        <span className="hidden truncate text-sm text-foreground md:block">{detallePersona(lista.grupo, f, ahora)}</span>
        <span className="hidden lg:block">
          <PuntosAsistencia historial={puntos} />
        </span>
        {control(lista, f)}
      </li>
    )
  }

  const vacioSeccion = (texto: string): ReactElement => <VacioSeccion>{q.trim() ? 'Nadie coincide.' : texto}</VacioSeccion>
  const presentesDe = (lista: readonly FilaVista[]): number => lista.filter((f) => f.marca === 'presente').length
  const todosIntegrantes = filas.filter((f) => f.persona.estado === 'miembro')
  const todosVisitantes = filas.filter((f) => f.persona.estado === 'visitante')

  const descripcionAlta = lista ? `${lista.grupo.nombre} · ${fechaCorta(lista.fecha)}` : ''
  const hayFiltro = filtro !== 'todos' || q.trim() !== ''
  const titulo = mio.nombre

  const migas = (
    <MigasEstudiantes
      migas={[{ texto: 'Estudiantes', href: datos.esRaiz ? undefined : '/estudiantes' }, { texto: mio.ambito, href: ambitoHref ?? undefined }, { texto: titulo }]}
    />
  )

  const acciones =
    (entrenador && datos.gruposSubarea.length > 1) || lista ? (
      <>
        {entrenador && datos.gruposSubarea.length > 1 && (
          <div className="w-full md:w-64">
            <SelectSistema
              label="Grupo que estás marcando"
              opciones={datos.gruposSubarea.map((g) => ({ valor: g.grupoId, etiqueta: g.nombre }))}
              value={mio.grupoId}
              onValueChange={(id) => {
                if (id === mio.grupoId) return
                iniciarNavegacion(() => router.push(`/estudiantes/grupos/${encodeURIComponent(id)}${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`))
              }}
            />
          </div>
        )}
        {lista && (
          <BotonSistema type="button" variante="primario" tamaño="sm" icono={UserPlus} onClick={abrirAlta} className="max-md:hidden">
            Agregar visitante
          </BotonSistema>
        )}
      </>
    ) : undefined

  return (
    <MarcoPlanificacion migas={migas}>
      <EncabezadoPlanificacion titulo={titulo} antetitulo={`${mio.ambito} · ${mio.subarea}`} atras={atras} acciones={acciones}>
        {lista && pasos && (
          <>
            <LineaFecha>
              <PastillaFecha
                etiqueta="Reunión"
                anterior={paso(pasos.anterior, 'anterior')}
                siguiente={paso(pasos.siguiente, 'siguiente')}
                sinAnterior="No hay reuniones anteriores"
                sinSiguiente="Es la reunión más reciente"
              >
                {fechaLarga(lista.fecha)}
              </PastillaFecha>
              {tlr && (
                <label className={cn(CLASE_ACCION_TEXTO, 'relative cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand')}>
                  <CalendarDays aria-hidden="true" className="size-3.5" />
                  Otra fecha
                  <input
                    type="date"
                    aria-label="Otra fecha"
                    max={hoy}
                    value={pastillas.some((p) => p.fecha === lista.fecha) ? '' : lista.fecha}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.()
                      } catch {
                        // Without showPicker the field opens its own picker.
                      }
                    }}
                    onChange={(e) => e.target.value && e.target.value <= hoy && navegar({ fecha: e.target.value })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
              )}
              {meta && <MetaFecha icono={Clock}>{meta}</MetaFecha>}
            </LineaFecha>
            {tlr && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <label htmlFor="lista-lugar">Lugar (opcional)</label>
                <input
                  id="lista-lugar"
                  autoComplete="off"
                  maxLength={200}
                  placeholder="Ej.: casa de un integrante, urbanización"
                  value={lugar}
                  onChange={(e) => setLugar(e.target.value)}
                  onBlur={() => void guardarElLugar(lista)}
                  className="min-h-11 w-full min-w-0 rounded-md border border-border bg-card px-2.5 text-base text-foreground transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-brand focus:bg-background focus:outline-none focus:ring-2 focus:ring-brand/20 md:min-h-[34px] md:w-[300px] md:border-transparent md:bg-transparent md:text-sm md:hover:border-border"
                />
                <span>{`Se guarda con la reunión del ${fechaCorta(lista.fecha)}. El servicio en la iglesia no se marca aquí.`}</span>
              </div>
            )}
            <ResumenPlanificacion vivo>
              <strong>
                <span className="font-mono tabular-nums">{progreso.marcados}</span> de <span className="font-mono tabular-nums">{progreso.total}</span>
              </strong>{' '}
              marcados · <strong className="font-mono tabular-nums">{cuentas.presentes}</strong> {plural(cuentas.presentes, 'presente', 'presentes')} ·{' '}
              <strong className="font-mono tabular-nums">{cuentas.ausentes}</strong> {plural(cuentas.ausentes, 'ausente', 'ausentes')} ·{' '}
              <strong className="font-mono tabular-nums">{cuentas.sin}</strong> sin marcar · <strong className="font-mono tabular-nums">{cuentas.nuevas}</strong>{' '}
              {plural(cuentas.nuevas, 'visitante nuevo', 'visitantes nuevos')}
            </ResumenPlanificacion>
            <BarraProgreso valor={progreso.marcados} total={progreso.total} />
          </>
        )}
      </EncabezadoPlanificacion>

      {!lista ? (
        <RegionDatos>
          {entrenador && <AvisoFormulario tono="marca" className="mx-4 md:mx-0">{avisoEntrenador(datos)}</AvisoFormulario>}
          <TablaPlanificacion>
            <EstadoVacioSistema
              icono={CalendarX2}
              titulo="No hay reuniones para marcar"
              subtitulo={`En las últimas 8 semanas ningún turno del Dream Team sirvió a ${mio.ambito}. Pide a la dirección que revise los turnos del campus.`}
            />
          </TablaPlanificacion>
        </RegionDatos>
      ) : (
        <>
          <BarraHerramientasPlanificacion>
            <FiltroSegmentado
              etiqueta="Mostrar"
              opciones={FILTROS_LISTA.map((f) => ({ valor: f.id, etiqueta: f.etiqueta, cuenta: cuentas[f.id] }))}
              valor={filtro}
              onCambio={setFiltro}
            />
            <div className="w-full md:w-64">
              <InputSistema
                type="search"
                autoComplete="off"
                icono={Search}
                aria-label="Buscar en el grupo"
                placeholder="Buscar en el grupo"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <EstadoGuardado estado={guardado.estado} className="md:ml-auto" />
          </BarraHerramientasPlanificacion>

          <RegionDatos>
            {(entrenador || sugeridas.length > 0) && (
              <div className="space-y-3 px-4 md:px-0">
                {entrenador && <AvisoFormulario tono="marca">{avisoEntrenador(datos)}</AvisoFormulario>}
                {sugeridas.map((f) => (
                  <AvisoFormulario key={f.persona.personaId} tono="info" className="flex gap-3">
                    <Star aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-text" />
                    <div className="min-w-0 space-y-2">
                      <p>
                        <b className="font-semibold">{f.persona.nombre}</b>
                        {` vino ${tlr ? 'a ' : ''}${f.persona.visitas} ${tlr ? 'reuniones' : 'domingos'} como visitante. ¿${f.persona.genero === 'Femenino' ? 'La' : 'Lo'} sumas al grupo?`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <BotonSistema
                          type="button"
                          tamaño="sm"
                          cargando={confirmando === f.persona.personaId}
                          disabled={confirmando !== null}
                          onClick={() => void confirmar(lista, f)}
                        >
                          Confirmar como miembro
                        </BotonSistema>
                        <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={() => setDescartadas((actual) => new Set(actual).add(f.persona.personaId))}>
                          Ahora no
                        </BotonSistema>
                      </div>
                    </div>
                  </AvisoFormulario>
                ))}
              </div>
            )}

            <TablaPlanificacion>
              {filas.length === 0 ? (
                <EstadoVacioSistema
                  icono={UsersRound}
                  titulo="Este grupo todavía no tiene integrantes"
                  subtitulo="Agrega al primero con «Agregar visitante»."
                  accion={
                    <BotonSistema type="button" variante="outline" tamaño="sm" icono={UserPlus} onClick={abrirAlta}>
                      Agregar visitante
                    </BotonSistema>
                  }
                />
              ) : integrantes.length + visitantes.length === 0 && hayFiltro ? (
                <EstadoVacioSistema
                  icono={Search}
                  titulo="Nadie coincide"
                  subtitulo="Prueba otro nombre o toca «Todos»."
                  accion={
                    <BotonSistema
                      type="button"
                      variante="outline"
                      tamaño="sm"
                      onClick={() => {
                        setFiltro('todos')
                        setQ('')
                      }}
                    >
                      Limpiar todo
                    </BotonSistema>
                  }
                />
              ) : (
                <div aria-busy={navegando || undefined}>
                  <CabeceraColumnas className={COLUMNAS}>
                    <span>Nombre</span>
                    <span>Estado</span>
                    <span>{tlr ? 'Edad' : 'Año'}</span>
                    <span className="hidden lg:block">Historial</span>
                    <span className="pr-2 text-right">Marcar</span>
                  </CabeceraColumnas>
                  <section aria-labelledby="lista-integrantes">
                    <BandaSeccion
                      id="lista-integrantes"
                      titulo="Integrantes"
                      cuenta={
                        <>
                          {presentesDe(todosIntegrantes)}/{todosIntegrantes.length}
                          <span className="sr-only"> presentes</span>
                        </>
                      }
                      pista={<span className="hidden md:inline">Círculo: Presente · «Ausente» si no vino</span>}
                      accion={
                        <button type="button" disabled={pendientes.length === 0} onClick={() => void marcarTodos(lista)} className={CLASE_ACCION_TEXTO}>
                          Marcar todos<span className="sr-only"> los integrantes sin marcar como presentes</span>
                        </button>
                      }
                    />
                    {integrantes.length > 0 ? (
                      <ul ref={integrantesRef} aria-label="Integrantes">
                        {integrantes.map((f) => fila(lista, f))}
                      </ul>
                    ) : (
                      vacioSeccion(filtro === 'sin' ? 'Ya marcaste a todos.' : 'Nadie con este filtro.')
                    )}
                  </section>
                  <section aria-labelledby="lista-visitantes" className="border-t border-border">
                    <BandaSeccion
                      id="lista-visitantes"
                      titulo="Visitantes"
                      cuenta={
                        <>
                          {presentesDe(todosVisitantes)}/{todosVisitantes.length}
                          <span className="sr-only"> presentes</span>
                        </>
                      }
                    />
                    {visitantes.length > 0 ? (
                      <ul aria-label="Visitantes">{visitantes.map((f) => fila(lista, f))}</ul>
                    ) : (
                      vacioSeccion(todosVisitantes.length === 0 ? 'Todavía no hay visitantes.' : filtro === 'sin' ? 'Ya marcaste a todos.' : 'Nadie con este filtro.')
                    )}
                    <button
                      type="button"
                      onClick={abrirAlta}
                      className="focus-ring flex min-h-14 w-full touch-manipulation items-center gap-3 border-t border-border px-4 text-left text-[15px] font-medium text-brand-text transition-colors hover:bg-accent md:min-h-11 md:gap-2.5 md:px-3 md:text-sm"
                    >
                      <UserPlus aria-hidden="true" className="size-4 shrink-0" />
                      Agregar visitante
                    </button>
                  </section>
                </div>
              )}
            </TablaPlanificacion>

            {filas.length > 0 && (
              <PieRegion>
                <span>
                  <span className="font-mono tabular-nums">{cuentas.todos}</span> en la lista · se guarda al tocar; toca otra vez para deshacer
                </span>
                <span>Orden: nombre A–Z</span>
              </PieRegion>
            )}
          </RegionDatos>

          <p className="sr-only" role="status" aria-live="polite" data-testid="aviso-cambio">
            {aviso}
          </p>

          <DetallePersona
            key={detalle?.personaId ?? 'ninguna'}
            fila={filaDetalle}
            grupo={lista.grupo}
            reunion={reunionDetalle}
            historial={filaDetalle ? puntosHistorial(historial, filaDetalle.persona.personaId) : null}
            hoy={ahora}
            abierto={detalle?.abierto ?? false}
            onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
            onMarcar={(toque) => filaDetalle && void marcar(lista, filaDetalle, toque)}
            onConfirmar={() => filaDetalle && void confirmar(lista, filaDetalle)}
            confirmando={filaDetalle !== null && confirmando === filaDetalle.persona.personaId}
          />

          {alta && sesion && (
            <AgregarVisitante
              key={alta.clave}
              abierto={alta.abierto}
              onCambioAbierto={(abierto) => setAlta((actual) => (actual ? { ...actual, abierto } : null))}
              grupo={{
                id: lista.grupo.id,
                nombre: lista.grupo.nombre,
                experiencia: lista.grupo.experiencia,
                ambitoId: lista.grupo.ambitoId,
                subarea: lista.grupo.subarea,
                anio: lista.grupo.anio,
              }}
              sesion={{ fecha: lista.fecha, turnoId: lista.turnoId }}
              escala={datos.escala}
              hoy={hoy}
              descripcion={descripcionAlta}
              onListo={() => router.refresh()}
            />
          )}
        </>
      )}
    </MarcoPlanificacion>
  )
}

/** "Marcas como entrenadora del grupo. Andrea Molina (líder) ve tus marcas y puede corregirlas." */
function avisoEntrenador(datos: DatosListaLider): string {
  const rol = datos.generoVisor === 'Femenino' ? 'entrenadora' : datos.generoVisor === 'Masculino' ? 'entrenador' : 'entrenador o entrenadora'
  const lideres = datos.grupo.lideres
  if (lideres.length === 0) return `Marcas como ${rol}, el adulto que ayuda al grupo. Este grupo todavía no tiene líder.`
  const nombres = lideres.length === 1 ? lideres[0] : `${lideres.slice(0, -1).join(', ')} y ${lideres[lideres.length - 1]}`
  return lideres.length === 1
    ? `Marcas como ${rol}, el adulto que ayuda al grupo. ${nombres} (líder) ve tus marcas y puede corregirlas.`
    : `Marcas como ${rol}, el adulto que ayuda al grupo. ${nombres} (líderes) ven tus marcas y pueden corregirlas.`
}
