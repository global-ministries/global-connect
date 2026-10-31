'use client'

/**
 * Estudiantes — client island of the leader list
 * (/estudiantes/grupos/[grupoId], C3b of odd/tasks/estudiantes-fase-b.md;
 * artboards 01 Transit / Inside Out, 02 visitor and 05 The Living Room of
 * design/estudiantes-asistencia).
 *
 * Top to bottom: header (breadcrumbs "Estudiantes / <ámbito> / <grupo>" +
 * "Agregar visitante"; phone "‹ origin" from `?desde=`), the title with the
 * date line and the counts (aria-live), the entrenador's group selector and
 * notice (S4), The Living Room's meeting pills, other date and "Lugar"
 * (Q7), the search, the Todos / Sin marcar / Presentes / Ausentes /
 * Visitantes pills, the "¿La sumas al grupo?" suggestions (A2), and the two
 * sections Integrantes / Visitantes as `ListaResponsiva` with the ✓ / ✕ pair
 * (G1) on each row. A row opens the person's detail; "Agregar visitante"
 * (FAB on phones) opens the visitor sheet.
 *
 * Every tap saves at once (A4) and shows the change before the server
 * answers; a failure rolls it back with the error toast
 * (lib/platform/estudiantes/marcas.ts). The meeting lives in the URL
 * (`?fecha=&turno=`), so another meeting is a navigation.
 */
import { useMemo, useRef, useState, useTransition, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarX2, Search, Star, UserPlus, UsersRound } from 'lucide-react'

import { BadgeSistema, BotonSistema, InputSistema, PaginaSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { ListaResponsiva, type ColumnaLista } from '@/components/ui/lista-responsiva'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { PuntoEstado } from '@/components/ui/punto-estado'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { confirmarMiembroLista, guardarLugar, marcarAsistencia } from '@/lib/actions/estudiantes-lista.actions'
import { edadEn } from '@/lib/platform/estudiantes/gestion-grupo'
import type { GrupoLista, ListaGrupo, Marca } from '@/lib/platform/estudiantes/lista-datos'
import type { DatosListaLider } from '@/lib/platform/estudiantes/lista-servidor'
import {
  FILTROS_LISTA,
  alternarFiltro,
  contarLista,
  destinoAtras,
  estadoFila,
  fechaCorta,
  fechaLarga,
  filtrarLista,
  horaCorta,
  lineaReunion,
  mensajeMarca,
  pastillasReunion,
  pistaDia,
  puntosHistorial,
  subtituloFila,
  type CuentasLista,
  type FilaVista,
  type FiltroLista,
} from '@/lib/platform/estudiantes/lista-vista'
import { MARCAS_VACIAS, confirmarMarca, marcaVisible, revertirMarca, tocarMarca, type EstadoMarcas } from '@/lib/platform/estudiantes/marcas'

import { AgregarVisitante } from '../visitante/agregar-visitante'
import { DetallePersona } from './detalle-persona'
import { PuntosAsistencia, TONO_ESTADO } from './estado-fila'
import { MarcaAsistencia } from './marca-asistencia'

const SIN_CONEXION = 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.'

const plural = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

export interface ListaLiderClientProps {
  readonly datos: DatosListaLider
  /** `?desde=` (grupos | vivo): where the back control goes. */
  readonly desde?: string
}

function Resumen({ cuentas }: { readonly cuentas: CuentasLista }): ReactElement {
  return (
    <>
      <strong className="font-mono tabular-nums">{cuentas.presentes}</strong> {plural(cuentas.presentes, 'presente', 'presentes')} ·{' '}
      <strong className="font-mono tabular-nums">{cuentas.ausentes}</strong> {plural(cuentas.ausentes, 'ausente', 'ausentes')} ·{' '}
      <strong className="font-mono tabular-nums">{cuentas.sin}</strong> sin marcar ·{' '}
      <strong className="font-mono tabular-nums">{cuentas.nuevas}</strong> {plural(cuentas.nuevas, 'visitante nuevo', 'visitantes nuevos')}
    </>
  )
}

function Migas({ ambito, ambitoHref, grupo }: { readonly ambito: string; readonly ambitoHref: string | null; readonly grupo: string }): ReactElement {
  const clase = 'truncate px-2 py-1.5'
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        <li className={`${clase} text-muted-foreground`}>Estudiantes</li>
        <li aria-hidden="true" className="px-0.5 text-muted-foreground">
          /
        </li>
        <li className="min-w-0">
          {ambitoHref ? (
            <Link
              href={ambitoHref}
              className={`focus-ring block rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11 ${clase}`}
            >
              {ambito}
            </Link>
          ) : (
            <span className={`block text-muted-foreground ${clase}`}>{ambito}</span>
          )}
        </li>
        <li aria-hidden="true" className="px-0.5 text-muted-foreground">
          /
        </li>
        <li className="min-w-0">
          <span aria-current="page" className={`block font-semibold text-foreground ${clase}`}>
            {grupo}
          </span>
        </li>
      </ol>
    </nav>
  )
}

function TituloSeccionLista({ id, texto, cantidad, pista }: { readonly id: string; readonly texto: string; readonly cantidad?: number; readonly pista?: string }): ReactElement {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 px-1 md:px-0">
      <h2 id={id} className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {texto}
        {cantidad !== undefined && (
          <>
            {' · '}
            <span className="font-mono tabular-nums">{cantidad}</span>
          </>
        )}
      </h2>
      {pista && <span className="shrink-0 text-xs text-muted-foreground">{pista}</span>}
    </div>
  )
}

/** "2do año" in Transit / Inside Out, "21 años" in The Living Room. */
function detallePersona(grupo: GrupoLista, fila: FilaVista, hoy: Date): string {
  if (grupo.experiencia === 'the_living_room') {
    const edad = edadEn(fila.persona.fechaNacimiento, hoy)
    return edad === null ? '—' : `${edad} años`
  }
  return fila.persona.anioEtiqueta ?? '—'
}

interface Respuesta {
  readonly visitas: number
  readonly sugerirConfirmar: boolean
}

export function ListaLiderClient({ datos, desde }: ListaLiderClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const toast = useNotificaciones()
  const [navegando, iniciarNavegacion] = useTransition()

  const { grupo: mio, lista, sesiones, sesion, historial, hoy } = datos
  const atras = destinoAtras({ desde, grupoId: mio.grupoId, esRaiz: datos.esRaiz })
  const entrenador = mio.puedeVerVivo && !mio.soyLider
  const tlr = mio.experiencia === 'the_living_room'
  const ahora = useMemo(() => new Date(), [])

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
  const lugarGuardado = useRef(lista?.lugar ?? '')

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
  const { integrantes, visitantes } = filtrarLista(filas, filtro, q)
  const sugeridas = filas.filter((f) => f.persona.estado === 'visitante' && f.persona.sugerirConfirmar && !descartadas.has(f.persona.personaId))
  const filaDetalle = detalle ? (filas.find((f) => f.persona.personaId === detalle.personaId) ?? null) : null

  function navegar(parametros: Record<string, string | null>): void {
    const consulta = new URLSearchParams()
    for (const [clave, valor] of Object.entries({ ...parametros, desde: desde ?? null })) if (valor) consulta.set(clave, valor)
    const texto = consulta.toString()
    iniciarNavegacion(() => router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false }))
  }

  async function marcar(lista: ListaGrupo, fila: FilaVista, toque: Marca): Promise<void> {
    const base = { estado: fila.persona.marca, marcadoAt: fila.persona.marcadoAt }
    const { marcas: siguiente, peticion } = tocarMarca(marcasRef.current, fila.persona.personaId, base, toque, new Date().toISOString())
    marcasRef.current = siguiente
    setMarcas(siguiente)
    const revertir = (mensaje: string): void => {
      marcasRef.current = revertirMarca(marcasRef.current, peticion)
      setMarcas(marcasRef.current)
      toast.error(mensaje)
    }
    try {
      const r = await marcarAsistencia({ grupoId: lista.grupo.id, fecha: lista.fecha, turnoId: lista.turnoId, personaId: fila.persona.personaId, estado: peticion.estado })
      if (!r.ok) return revertir(r.message)
      marcasRef.current = confirmarMarca(marcasRef.current, peticion)
      setMarcas(marcasRef.current)
      if (fila.persona.estado === 'visitante') setRespuestas((actual) => ({ ...actual, [fila.persona.personaId]: r.data }))
      toast.success(mensajeMarca(fila.persona.nombre, peticion.estado))
    } catch {
      revertir(SIN_CONEXION)
    }
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
  const ambitoHref = desde === 'grupos' || desde === 'vivo' ? atras?.href ?? null : null
  const horaSesion = lista ? (sesiones.find((s) => s.fecha === lista.fecha && s.turnoId === lista.turnoId)?.hora ?? lista.grupo.hora) : null
  const linea = lista ? lineaReunion({ fecha: lista.fecha, hora: horaSesion, ambito: mio.ambito }) : null
  // The detail's "Hoy" / "Reunión" card: "Domingo 25 oct · 9:00", "Jueves 29 oct · Casa de Adrián".
  const reunionDetalle = lista ? [fechaLarga(lista.fecha), tlr ? lugar.trim() || null : horaCorta(horaSesion)].filter(Boolean).join(' · ') : ''
  const pastillas = lista && tlr ? pastillasReunion(sesiones, hoy) : []

  const columnas: readonly ColumnaLista[] = [
    { id: 'nombre', titulo: 'Nombre', ancho: 'minmax(0,1.6fr)' },
    { id: 'estado', titulo: 'Estado', ancho: 'minmax(0,0.8fr)' },
    { id: 'detalle', titulo: tlr ? 'Edad' : 'Año', ancho: 'minmax(0,0.6fr)' },
    { id: 'historial', titulo: 'Historial', ocultarEnTablet: true, ancho: 'minmax(0,0.8fr)' },
    { id: 'marcar', titulo: 'Marcar', ancho: '104px' },
  ]

  const control = (lista: ListaGrupo, fila: FilaVista): ReactElement =>
    fila.estado === 'nueva' ? (
      <span className="relative z-10">
        <BadgeSistema variante="info" tamaño="sm">
          Nueva hoy
        </BadgeSistema>
      </span>
    ) : (
      <MarcaAsistencia nombre={fila.persona.nombre} valor={fila.marca} onMarcar={(toque) => void marcar(lista, fila, toque)} />
    )

  function seccion(lista: ListaGrupo, id: string, titulo: string, filasSeccion: readonly FilaVista[], pista?: string): ReactElement | null {
    if (filasSeccion.length === 0) return null
    return (
      <section aria-labelledby={id} className="space-y-3">
        <TituloSeccionLista id={id} texto={titulo} cantidad={filasSeccion.length} pista={pista} />
        <ListaResponsiva
          etiqueta={titulo}
          columnas={columnas}
          filas={filasSeccion}
          claveFila={(f) => f.persona.personaId}
          etiquetaFila={(f) => `Abrir ${f.persona.nombre}`}
          onAbrirFila={(f) => setDetalle({ personaId: f.persona.personaId, abierto: true })}
          renderCelda={(f, columna) => {
            const tono = TONO_ESTADO[f.estado]
            switch (columna) {
              case 'nombre':
                return (
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-foreground">{f.persona.nombre}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{subtituloFila(f)}</p>
                  </div>
                )
              case 'estado':
                return <PuntoEstado tono={tono.tono} etiqueta={tono.etiqueta} />
              case 'detalle':
                return <span className="text-sm text-foreground">{detallePersona(lista.grupo, f, ahora)}</span>
              case 'historial':
                return <PuntosAsistencia historial={puntosHistorial(historial, f.persona.personaId)} />
              case 'marcar':
                return control(lista, f)
              default:
                return null
            }
          }}
          renderFilaMovil={(f) => {
            const tono = TONO_ESTADO[f.estado]
            const segunda = f.persona.estado === 'visitante' && f.estado !== 'nueva' && f.persona.visitas > 0 ? `${f.persona.visitas}.ª visita` : detallePersona(lista.grupo, f, ahora)
            return {
              titulo: f.persona.nombre,
              subtitulo: (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <PuntoEstado tono={tono.tono} etiqueta={tono.etiqueta} />
                  <span className="truncate">{` · ${segunda}`}</span>
                </span>
              ),
              meta: control(lista, f),
            }
          }}
        />
      </section>
    )
  }

  const descripcionAlta = lista ? `${lista.grupo.nombre} · ${fechaCorta(lista.fecha)}` : ''
  const hayFiltro = filtro !== 'todos' || q.trim() !== ''
  const titulo = mio.nombre

  return (
    // No `titulo`: the h1 is the hero on desktop; on phones the shell header holds the page h1.
    <PaginaSistema
      breadcrumbs={<Migas ambito={mio.ambito} ambitoHref={ambitoHref} grupo={titulo} />}
      acciones={
        lista && (
          <BotonSistema
            type="button"
            variante="primario"
            tamaño="sm"
            icono={UserPlus}
            onClick={abrirAlta}
            className="relative after:absolute after:-inset-x-0.5 after:-inset-y-1.5 after:content-['']"
          >
            Agregar visitante
          </BotonSistema>
        )
      }
      className="pb-28 md:pb-0"
    >
      <div data-slot="cabecera-movil" className="md:hidden">
        {atras && <BotonAtrasMovil atras={{ etiqueta: atras.etiqueta, href: atras.href }} className="-mx-2 -mt-2 mb-1 max-w-[75%]" />}
        <TituloGrande titulo={titulo} nivel={2} />
        {linea && <p className="mt-1 px-1 text-[15px] text-muted-foreground">{linea}</p>}
        {lista && (
          <p aria-live="polite" className="mt-0.5 px-1 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            <Resumen cuentas={cuentas} />
          </p>
        )}
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{titulo}</h1>
        {linea && <p className="mt-1.5 text-[15px] text-muted-foreground">{linea}</p>}
        {lista && (
          <p aria-live="polite" className="mt-0.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
            <Resumen cuentas={cuentas} />
          </p>
        )}
      </div>

      {entrenador && (
        <div className="space-y-3">
          {datos.gruposSubarea.length > 1 && (
            <SelectSistema
              label="Grupo que estás marcando"
              opciones={datos.gruposSubarea.map((g) => ({ valor: g.grupoId, etiqueta: g.nombre }))}
              value={mio.grupoId}
              onValueChange={(id) => {
                if (id === mio.grupoId) return
                iniciarNavegacion(() => router.push(`/estudiantes/grupos/${encodeURIComponent(id)}${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`))
              }}
            />
          )}
          <AvisoFormulario tono="marca">{avisoEntrenador(datos)}</AvisoFormulario>
        </div>
      )}

      {tlr && lista && (
        <div className="space-y-3">
          <TituloSeccionLista id="lista-reunion" texto="Reunión del grupo" pista={pistaDia(lista.grupo.diaSemana) ?? undefined} />
          <GrupoPastillas etiqueta="Reunión del grupo">
            {pastillas.map((p) => (
              <PastillaFiltro key={p.fecha} etiqueta={p.etiqueta} activa={p.fecha === lista.fecha} onClick={() => p.fecha !== lista.fecha && navegar({ fecha: p.fecha })} />
            ))}
          </GrupoPastillas>
          <div className="grid gap-3 md:grid-cols-2">
            <InputSistema
              label="Otra fecha"
              type="date"
              max={hoy}
              value={pastillas.some((p) => p.fecha === lista.fecha) ? '' : lista.fecha}
              onChange={(e) => e.target.value && e.target.value <= hoy && navegar({ fecha: e.target.value })}
            />
            <div className="space-y-1.5">
              <InputSistema
                label="Lugar (opcional)"
                autoComplete="off"
                maxLength={200}
                placeholder="Ej.: casa de un integrante, urbanización"
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                onBlur={() => void guardarElLugar(lista)}
              />
              <p className="text-[13px] text-muted-foreground">{`Se guarda con la reunión del ${fechaCorta(lista.fecha)}. El servicio en la iglesia no se marca aquí.`}</p>
            </div>
          </div>
        </div>
      )}

      {!lista ? (
        <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
          <EstadoVacioSistema
            icono={CalendarX2}
            titulo="No hay reuniones para marcar"
            subtitulo={`En las últimas 8 semanas ningún turno del Dream Team sirvió a ${mio.ambito}. Pide a la dirección que revise los turnos del campus.`}
          />
        </div>
      ) : (
        <>
          <div aria-busy={navegando || undefined} className="space-y-3">
            <InputSistema
              type="search"
              autoComplete="off"
              icono={Search}
              aria-label="Buscar en el grupo"
              placeholder="Buscar en el grupo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <GrupoPastillas etiqueta="Mostrar">
              {FILTROS_LISTA.map((f) => (
                <PastillaFiltro key={f.id} etiqueta={f.etiqueta} cantidad={cuentas[f.id]} activa={filtro === f.id} onClick={() => setFiltro((actual) => alternarFiltro(actual, f.id))} />
              ))}
            </GrupoPastillas>
          </div>

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

          {filas.length === 0 ? (
            <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
              <EstadoVacioSistema icono={UsersRound} titulo="Este grupo todavía no tiene integrantes" subtitulo="Agrega al primero con «Agregar visitante»." />
            </div>
          ) : integrantes.length + visitantes.length === 0 ? (
            <div className="min-w-0 overflow-hidden rounded-2xl bg-card md:border md:border-border/60">
              <EstadoVacioSistema
                icono={Search}
                titulo="Nadie coincide"
                subtitulo="Prueba otro nombre o toca «Todos»."
                accion={
                  hayFiltro ? (
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
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              {seccion(lista, 'lista-integrantes', 'Integrantes', integrantes, '✓ Presente · ✕ Ausente')}
              {seccion(lista, 'lista-visitantes', 'Visitantes', visitantes)}
            </>
          )}

          {filas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
              <span>
                <span className="font-mono tabular-nums">{cuentas.todos}</span> en la lista · se guarda al marcar
              </span>
              <span>Orden: nombre A–Z</span>
            </div>
          )}

          <BotonFlotante icono={UserPlus} label="Agregar visitante" onClick={abrirAlta} />

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
    </PaginaSistema>
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
