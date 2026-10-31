'use client'

/**
 * Usuarios — client island for /users on design system v2 (S13 of
 * odd/tasks/sistema-diseno-v2.md; prototype docs/design-system/prototipos/
 * usuarios/01-lista-escritorio.html and 02-lista-celular.html).
 *
 * Top to bottom: header (crumb "Usuarios" + "Agregar persona"), hero (the
 * real totals of the scope), toolbar (search confirmed with Enter, Filtros,
 * Seleccionar), Vínculos pendientes, the attention metrics that are filters,
 * and the list (chips, rows, pagination). A row opens the person panel; in
 * "Seleccionar" mode (admin) it marks the person for the bulk role change.
 *
 * On phones the shell header holds the h1 and the bell (as in Servidores):
 * the summary and the Filtros icon open the content, "Seleccionar personas"
 * lives in the sheet and "Agregar persona" is the FAB.
 *
 * Every rule is in lib/platform/usuarios/lista-vista.ts. The filters start
 * from the URL the server page parsed and every change goes back with
 * `router.replace(..., { scroll: false })`; the page size stays local. A
 * switch of the header campus goes back to page 1 and empties the selection;
 * a page past the end (a hand-written ?pagina=99) goes to the last page.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SquareCheckBig, UserPlus, Users } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { DetalleResponsivo, useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { HojaFiltrosUsuarios } from '@/components/ui/filtros-usuarios'
import UserCreateForm from '@/components/forms/UserCreateForm'
import { VinculosPendientesCard } from '@/components/users/vinculos-pendientes-card'
import { useCampus } from '@/hooks/useCampus'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { cambiarRolUsuarios } from '@/lib/platform/usuarios/cambiar-rol'
import {
  LIMPIAR_TODO,
  ambitoUsuarios,
  chipsActivos,
  contarFiltrosActivos,
  escribirFiltrosEnUrl,
  filasDeVista,
  metricasAtencion,
  parcheMetrica,
  parcheOrden,
  parcheQuitarChip,
  permisosLista,
  resumenTotales,
  totalPaginas,
  type FiltrosUsuarios,
  type MetricaUsuariosId,
} from '@/lib/platform/usuarios/lista-vista'

import { DetalleUsuario } from './detalle-usuario'
import { ListaUsuarios } from './lista-usuarios'
import { PaginacionUsuarios } from './paginacion-usuarios'
import { SeleccionUsuarios } from './seleccion-usuarios'
import { useListaUsuarios } from './use-lista-usuarios'

const TITULO_SECCION = 'text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground'

export function UsuariosClient({ filtrosIniciales }: { readonly filtrosIniciales: FiltrosUsuarios }): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? '/users'
  const { roles, usuario } = useCurrentUser()
  const { campusId, campusActivo, loading: cargandoCampus } = useCampus()
  const escritorio = useEsEscritorio()

  const [filtros, setFiltros] = useState(filtrosIniciales)
  const [limite, setLimite] = useState(20)
  const [borrador, setBorrador] = useState(filtrosIniciales.q)
  const [qAplicada, setQAplicada] = useState(filtrosIniciales.q)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [agregarAbierto, setAgregarAbierto] = useState(false)
  // The person stays after the panel closes, so the invitation panel it opened stays mounted.
  const [panel, setPanel] = useState(filtrosIniciales.persona ? { id: filtrosIniciales.persona, abierto: true } : null)
  const [seleccion, setSeleccion] = useState<ReadonlySet<string> | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // undefined while the campus context restores the saved campus: that first value is not a switch.
  const campusActual = cargandoCampus ? undefined : (campusId ?? null)
  const [campusVisto, setCampusVisto] = useState(campusActual)
  const consultaEscrita = useRef(escribirFiltrosEnUrl(filtrosIniciales))

  // The draft follows the applied search when it changes from outside (Limpiar todo, a chip).
  if (qAplicada !== filtros.q) {
    setQAplicada(filtros.q)
    setBorrador(filtros.q)
  }

  // Another header campus is another list: page 1 and nobody marked (as before the redesign).
  if (campusActual !== undefined && campusActual !== campusVisto) {
    setCampusVisto(campusActual)
    if (campusVisto !== undefined) {
      setSeleccion((actual) => (actual ? new Set() : actual))
      setAviso(null)
      if (filtros.pagina !== 1) setFiltros({ ...filtros, pagina: 1 })
    }
  }

  const lista = useListaUsuarios({ filtros, campusId: campusId ?? null, limite })
  const visor = useMemo(() => ({ roles, usuarioId: usuario?.id ?? null }), [roles, usuario?.id])
  const filas = useMemo(() => filasDeVista(lista.personas, visor), [lista.personas, visor])
  const permisos = permisosLista(roles)
  const ambito = ambitoUsuarios(roles, campusActivo?.nombre ?? null)
  const stats = lista.estadisticas
  const resumen = stats ? resumenTotales(stats, ambito) : null
  const chips = chipsActivos(filtros)
  const paginas = totalPaginas(lista.total, limite)

  // A page past the end (people left the scope, or ?pagina=99 by hand) shows the last one.
  if (!lista.cargando && !lista.error && lista.total > 0 && lista.personas.length === 0 && filtros.pagina > paginas) {
    setFiltros({ ...filtros, pagina: paginas })
  }

  function escribirUrl(siguiente: FiltrosUsuarios): void {
    const consulta = escribirFiltrosEnUrl(siguiente)
    consultaEscrita.current = consulta
    router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false })
  }

  // The corrections made while rendering (campus switch, page past the end) reach the URL here.
  useEffect(() => {
    if (escribirFiltrosEnUrl(filtros) !== consultaEscrita.current) escribirUrl(filtros)
  })

  function cambiar(parche: Partial<FiltrosUsuarios>): void {
    const siguiente = { ...filtros, ...parche }
    setFiltros(siguiente)
    escribirUrl(siguiente)
  }

  function buscar(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    const q = borrador.trim()
    setBorrador(q)
    if (q !== filtros.q) cambiar({ q, pagina: 1 })
  }

  function limpiarTodo(): void {
    setBorrador('')
    cambiar(LIMPIAR_TODO)
  }

  function abrirPersona(id: string): void {
    setPanel({ id, abierto: true })
    cambiar({ persona: id })
  }

  function cerrarPersona(abierto: boolean): void {
    setPanel((actual) => (actual ? { ...actual, abierto } : null))
    if (!abierto) cambiar({ persona: null })
  }

  function alternarSeleccion(): void {
    setHojaAbierta(false)
    setAviso(null)
    setSeleccion((actual) => (actual ? null : new Set()))
  }

  function marcar(id: string): void {
    setSeleccion((actual) => {
      if (!actual) return actual
      const siguiente = new Set(actual)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  const paginaCompleta = seleccion !== null && filas.length > 0 && filas.every((fila) => seleccion.has(fila.id))

  async function cambiarRol(rol: string): Promise<void> {
    if (!seleccion) return
    await cambiarRolUsuarios([...seleccion], rol)
    const n = seleccion.size
    setSeleccion(null)
    setAviso(`Rol actualizado para ${n.toLocaleString('es-VE')} ${n === 1 ? 'persona' : 'personas'}`)
    lista.recargar()
  }

  // A scope with nobody in it says so and hides the search and the metrics (prototype "Campus vacío").
  const sinNadie = stats?.total === 0
  const textoVacio = ambito === 'tus grupos' ? 'Todavía no hay personas en tus grupos' : 'Todavía no hay personas en este campus'
  const textoResumen = sinNadie ? (
    textoVacio
  ) : (
    resumen && (
      <>
        <strong className="font-mono font-semibold tabular-nums">{resumen.total}</strong> {resumen.resto}
      </>
    )
  )
  const pista = seleccion ? 'Marca a las personas para cambiar su rol' : (aviso ?? 'Toca una persona para ver su resumen')

  const vacio = lista.error ? (
    <EstadoVacioSistema
      icono={Users}
      titulo="No se pudo cargar la lista"
      subtitulo={lista.error}
      accion={<BotonSistema type="button" variante="outline" tamaño="sm" onClick={lista.recargar}>Reintentar</BotonSistema>}
    />
  ) : sinNadie ? (
    <EstadoVacioSistema
      icono={Users}
      titulo={textoVacio}
      subtitulo={permisos.agregar ? 'Usa «Agregar persona» para registrar a la primera.' : 'Cuando alguien se registre aquí, lo verás en esta lista.'}
    />
  ) : (
    <EstadoVacioSistema
      icono={Users}
      titulo="Nadie coincide con la búsqueda o los filtros"
      subtitulo="Quita alguno o usa «Limpiar todo»."
      accion={<BotonSistema type="button" variante="outline" tamaño="sm" onClick={limpiarTodo}>Limpiar todo</BotonSistema>}
    />
  )

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={
        <nav aria-label="Ubicación">
          <ol className="flex text-sm">
            <li>
              <span aria-current="page" className="px-2 py-1.5 font-semibold text-foreground">Usuarios</span>
            </li>
          </ol>
        </nav>
      }
      acciones={
        permisos.agregar ? (
          // Small header action (36px, 44px on touch); the ::after widens the hit area to 48px (decisions 2026-10-28, 4).
          <BotonSistema
            type="button"
            tamaño="sm"
            icono={UserPlus}
            onClick={() => setAgregarAbierto(true)}
            className="relative after:absolute after:-inset-x-0.5 after:-inset-y-1.5 after:content-['']"
          >
            Agregar persona
          </BotonSistema>
        ) : null
      }
      className={seleccion ? 'pb-48 md:pb-24' : 'pb-28 md:pb-0'}
    >
      <div className="-mr-2 flex items-start justify-between gap-2 md:hidden">
        <TituloGrande resumen={textoResumen} className="min-w-0 flex-1" />
        <BotonFiltrosMovil filtrosActivos={contarFiltrosActivos(filtros)} onClick={() => setHojaAbierta(true)} />
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">Usuarios</h1>
        {textoResumen && <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:text-foreground">{textoResumen}</p>}
      </div>

      <form role="search" onSubmit={buscar} hidden={sinNadie} className="space-y-1.5">
        <BarraHerramientas
          busqueda={{
            valor: borrador,
            onCambio: setBorrador,
            placeholder: escritorio === false ? 'Nombre, teléfono, email o cédula' : 'Buscar por nombre, teléfono, email o cédula',
            etiqueta: 'Buscar personas',
          }}
          filtrosActivos={contarFiltrosActivos(filtros)}
          onAbrirFiltros={() => setHojaAbierta(true)}
          vista={
            permisos.cambiarRol ? (
              <BotonSistema type="button" variante="outline" icono={SquareCheckBig} aria-pressed={seleccion !== null} onClick={alternarSeleccion}>
                Seleccionar
              </BotonSistema>
            ) : undefined
          }
        />
        {borrador.trim() !== filtros.q && <p className="px-1 text-xs text-muted-foreground">Enter para buscar</p>}
      </form>

      <VinculosPendientesCard />

      {stats && stats.total > 0 && (
        <MetricasAtencion
          etiqueta="Requiere atención"
          metricas={metricasAtencion(stats, filtros)}
          onAlternar={(id) => cambiar(parcheMetrica(filtros, id as MetricaUsuariosId))}
        />
      )}

      <section aria-labelledby="usuarios-personas" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
          <h2 id="usuarios-personas" className={TITULO_SECCION}>Personas</h2>
          <span aria-live="polite" className={`text-xs text-muted-foreground ${seleccion || aviso ? '' : 'hidden md:inline'}`}>
            {pista}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChipsFiltrosActivos chips={chips} onQuitar={(id) => cambiar(parcheQuitarChip(filtros, id))} onLimpiarTodo={limpiarTodo} className="min-w-0 flex-1" />
          {/* The shared chips offer "Limpiar todo" from two chips up; one chip plus a search also gets it (prototype). */}
          {chips.length === 1 && filtros.q !== '' && (
            <BotonSistema type="button" variante="ghost" tamaño="sm" onClick={limpiarTodo}>Limpiar todo</BotonSistema>
          )}
        </div>
        <ListaUsuarios
          filas={filas}
          orden={filtros.orden}
          onOrdenar={(columna) => cambiar(parcheOrden(filtros, columna))}
          onAbrir={(fila) => abrirPersona(fila.id)}
          verCampus={campusId == null && permisos.agregar}
          seleccion={seleccion}
          onMarcar={marcar}
          cargando={lista.cargando}
          vacio={vacio}
        />
        {!lista.cargando && filas.length > 0 && (
          <PaginacionUsuarios
            pagina={filtros.pagina}
            paginas={paginas}
            limite={limite}
            enPagina={filas.length}
            total={lista.total}
            onPagina={(pagina) => cambiar({ pagina })}
            onLimite={(nuevo) => {
              setLimite(nuevo)
              cambiar({ pagina: 1 })
            }}
          />
        )}
      </section>

      {permisos.agregar && !seleccion && <BotonFlotante icono={UserPlus} label="Agregar persona" onClick={() => setAgregarAbierto(true)} />}

      {seleccion && (
        <SeleccionUsuarios
          cantidad={seleccion.size}
          paginaCompleta={paginaCompleta}
          onAlternarPagina={() => setSeleccion(paginaCompleta ? new Set() : new Set(filas.map((fila) => fila.id)))}
          onCancelar={alternarSeleccion}
          onCambiarRol={cambiarRol}
        />
      )}

      <HojaFiltrosUsuarios
        filtros={filtros}
        abierta={hojaAbierta}
        onCambioAbierta={setHojaAbierta}
        resultados={lista.total}
        nuevos={stats?.nuevos7d ?? 0}
        onCambio={cambiar}
        seleccion={permisos.cambiarRol ? { activa: seleccion !== null, onAlternar: alternarSeleccion } : undefined}
      />

      <DetalleUsuario
        fila={panel ? (filas.find((fila) => fila.id === panel.id) ?? null) : null}
        abierto={panel?.abierto ?? false}
        onCambioAbierto={cerrarPersona}
        puedeInvitar={permisos.agregar}
        onInvitada={lista.recargar}
      />

      {permisos.agregar && (
        <DetalleResponsivo abierto={agregarAbierto} onCambioAbierto={setAgregarAbierto} titulo="Agregar persona" ancho="lg">
          <UserCreateForm />
        </DetalleResponsivo>
      )}
    </PaginaSistema>
  )
}
