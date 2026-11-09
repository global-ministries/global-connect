'use client'

/**
 * Estudiantes › Grupos — client island of /estudiantes/grupos (C2 of
 * odd/tasks/estudiantes-fase-b.md), in the planning style of
 * odd/tasks/estudiantes-estilo-dps.md (S7; artboards 11 desktop and 12 phone
 * of design/estudiantes-dps, C1–C14).
 *
 * Desktop (`MarcoAlcance`): breadcrumbs "Estudiantes › <ámbito> ›
 * <sub-área>"; the header band with the title, the summary, «Acciones ▾»
 * («Promover temporada», once a year, D5) and «Crear grupo»; the «barra de
 * alcance» (Ámbitos with their sub-áreas and numbers, Necesitan atención as
 * toggles; a directora de grupo sees her sub-área as text); the toolbar
 * (search, Año escolar, «Columnas», Condensado | Normal, "N de M"); the
 * active chips; the dense table banded by sub-área; the footer line. A row
 * opens the group panel (detalle-grupo.tsx), docked from 1280px (D3).
 *
 * Phone: "‹ Estudiantes" + Filtros, the large title and summary, the search,
 * the ámbitos as pills, the three metrics in one row, the list by sub-área,
 * "Promover temporada" at the end (not in The Living Room) and the «Crear
 * grupo» FAB; the panel and the form are bottom sheets.
 *
 * Every rule lives in the pure view model
 * (lib/platform/estudiantes/grupos-vista.ts); the filters stay in local state
 * and are mirrored into the URL with `router.replace` (search debounced).
 * The columns and the density are a local preference, not in the URL.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowUpCircle, ChevronDown, Plus, UsersRound } from 'lucide-react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import { useEsEscritorio } from '@/components/ui/detalle-responsivo'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { useCampus } from '@/hooks/useCampus'
import type { GradoEscala, GrupoGestion, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'
import {
  FILTROS_INICIALES,
  calcularVistaGrupos,
  escribirFiltrosEnUrl,
  parcheMetrica,
  type FiltrosGrupos,
  type MetricaGrupos,
  type Miga,
  type VistaGrupos,
} from '@/lib/platform/estudiantes/grupos-vista'
import { ordenarPorAmbito } from '@/lib/platform/estudiantes/orden-ambitos'

import { BarraAlcance, FilaAlcance, SeccionAlcance } from '../alcance/barra-alcance'
import { BuscadorBarra, DENSIDADES, MenuColumnas } from '../alcance/herramientas-tabla'
import { MarcoAlcance } from '../alcance/marco-alcance'
import { MetricasCompactas } from '../alcance/movil-alcance'
import { useAcoplado } from '../alcance/panel-acoplado'
import { RegionTabla, type Densidad } from '../alcance/tabla-densa'
import { DetalleGrupo } from './detalle-grupo'
import { HojaFiltrosGrupos } from './filtros-grupos'
import { FormularioGrupo, type ModoFormulario } from './formulario-grupo'
import { COLUMNAS_GRUPOS, ListaGruposMovil, TablaGrupos } from './lista-grupos'

const RETRASO_BUSQUEDA_MS = 300
const CLASE_ITEM = 'min-h-12 items-start gap-2.5 py-1.5 text-sm pointer-coarse:min-h-11'

export interface GestionGruposClientProps {
  readonly grupos: readonly GrupoGestion[]
  readonly subareas: readonly SubareaGestionable[]
  readonly escalas: Readonly<Record<string, readonly GradoEscala[]>>
  readonly filtrosIniciales: FiltrosGrupos
  /** `?grupo=`: the group whose panel opens on load (back from its leader list). */
  readonly grupoInicial?: string | null
}

function MigasGrupos({ migas, onIr }: { readonly migas: readonly Miga[]; readonly onIr: (miga: Miga) => void }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-[13px]">
        {migas.map((miga, i) => {
          const actual = i === migas.length - 1
          return (
            <li key={miga.id} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && (
                <span aria-hidden="true" className="px-0.5 text-muted-foreground">
                  ›
                </span>
              )}
              {actual ? (
                <span aria-current="page" className="truncate px-2 py-1.5 font-semibold text-foreground">
                  {miga.etiqueta}
                </span>
              ) : miga.parche ? (
                <button
                  type="button"
                  onClick={() => onIr(miga)}
                  className="focus-ring truncate rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground pointer-coarse:min-h-11"
                >
                  {miga.etiqueta}
                </button>
              ) : (
                <span className="truncate px-2 py-1.5 text-muted-foreground">{miga.etiqueta}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

const palabra = (n: number, uno: string, varios: string): string => (n === 1 ? uno : varios)

function Resumen({ vista }: { readonly vista: VistaGrupos }): ReactElement {
  const { totales, resumenPrefijo } = vista
  return (
    <>
      {resumenPrefijo && `${resumenPrefijo} · `}
      <strong className="font-mono tabular-nums">{totales.grupos}</strong> {palabra(totales.grupos, 'grupo activo', 'grupos activos')} ·{' '}
      <strong className="font-mono tabular-nums">{totales.integrantes}</strong> {palabra(totales.integrantes, 'integrante', 'integrantes')} ·{' '}
      <strong className="font-mono tabular-nums">{totales.porConfirmar}</strong>{' '}
      {palabra(totales.porConfirmar, 'visitante por confirmar', 'visitantes por confirmar')}
    </>
  )
}

/** "3 sin líder · 2 por confirmar" under a level of the bar. */
function marcas(sinLider: number, porConfirmar: number): ReactElement | null {
  if (!sinLider && !porConfirmar) return null
  return (
    <>
      {sinLider > 0 && <span className="font-semibold text-warning-text">{sinLider} sin líder</span>}
      {sinLider > 0 && porConfirmar > 0 && ' · '}
      {porConfirmar > 0 && `${porConfirmar} por confirmar`}
    </>
  )
}

function BarraGrupos({ vista, onCambio }: { readonly vista: VistaGrupos; readonly onCambio: (parche: Partial<FiltrosGrupos>) => void }): ReactElement {
  const { alcance } = vista
  return (
    <BarraAlcance etiqueta="Ámbitos y atención">
      <SeccionAlcance id="grupos-barra-ambitos" titulo="Ámbitos">
        {alcance.fijo ? (
          <FilaAlcance etiqueta={alcance.fijo.etiqueta} valor={alcance.fijo.grupos} detalle={alcance.fijo.detalle} />
        ) : (
          <>
            {alcance.todos && (
              <FilaAlcance
                etiqueta="Todos"
                valor={alcance.todos.grupos}
                detalle={`${alcance.todos.integrantes} integrantes`}
                actual={alcance.todos.actual}
                onClick={() => onCambio(alcance.todos!.parche)}
              />
            )}
            {alcance.ambitos.map((a) => (
              <div key={a.id}>
                <FilaAlcance
                  etiqueta={a.label}
                  valor={a.grupos}
                  detalle={
                    <>
                      {a.integrantes} integrantes
                      {a.sinLider > 0 && (
                        <>
                          {' · '}
                          <span className="font-semibold text-warning-text">{a.sinLider} sin líder</span>
                        </>
                      )}
                    </>
                  }
                  actual={a.actual}
                  onClick={() => onCambio(a.parche)}
                />
                {a.areas.length > 1 &&
                  a.areas.map((s) => (
                    <FilaAlcance key={s.id} sub etiqueta={s.label} valor={s.grupos} detalle={marcas(s.sinLider, s.porConfirmar)} actual={s.actual} onClick={() => onCambio(s.parche)} />
                  ))}
              </div>
            ))}
          </>
        )}
      </SeccionAlcance>
      <SeccionAlcance id="grupos-barra-atencion" titulo="Necesitan atención">
        {vista.metricas.map((m) => (
          <FilaAlcance
            key={m.id}
            etiqueta={m.etiqueta}
            valor={m.valor}
            valorAviso={m.id === 'sinLider' && m.valor > 0}
            detalle={m.pista}
            pulsado={m.activa}
            onClick={() => onCambio(parcheMetrica(vista.filtros, m.id))}
          />
        ))}
      </SeccionAlcance>
    </BarraAlcance>
  )
}

type Detalle = { readonly grupoId: string; readonly abierto: boolean }

export function GestionGruposClient({ grupos, subareas, escalas, filtrosIniciales, grupoInicial = null }: GestionGruposClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { campusId } = useCampus()
  const escritorio = useEsEscritorio()
  const acoplado = useAcoplado()

  const [filtros, setFiltros] = useState<FiltrosGrupos>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set())
  const [densidad, setDensidad] = useState<Densidad>('normal')
  // The group stays selected after the panel closes, so it can animate out.
  const [detalle, setDetalle] = useState<Detalle | null>(() =>
    grupoInicial && grupos.some((g) => g.id === grupoInicial) ? { grupoId: grupoInicial, abierto: true } : null,
  )
  const [formulario, setFormulario] = useState<{ readonly modo: ModoFormulario; readonly abierto: boolean; readonly clave: number } | null>(null)
  const temporizadorUrl = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    },
    [],
  )

  const vista = useMemo(() => calcularVistaGrupos({ grupos, subareas, filtros, campusId }), [grupos, subareas, filtros, campusId])

  function cambiar(parche: Partial<FiltrosGrupos>): void {
    const siguiente = { ...vista.filtros, ...parche }
    setFiltros(siguiente)
    if (temporizadorUrl.current) clearTimeout(temporizadorUrl.current)
    const aplicar = (): void => {
      temporizadorUrl.current = null
      const consulta = escribirFiltrosEnUrl(siguiente)
      router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false })
    }
    const soloBusqueda = Object.keys(parche).length === 1 && 'q' in parche
    if (soloBusqueda) temporizadorUrl.current = setTimeout(aplicar, RETRASO_BUSQUEDA_MS)
    else aplicar()
  }

  function abrirCrear(): void {
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    setFormulario((actual) => ({
      modo: { modo: 'crear', ambitoId: vista.filtros.ambito, subareaId: vista.filtros.area },
      abierto: true,
      clave: (actual?.clave ?? 0) + 1,
    }))
  }

  function abrirEditar(grupoId: string): void {
    const grupo = grupos.find((g) => g.id === grupoId)
    if (!grupo) return
    setDetalle((actual) => (actual ? { ...actual, abierto: false } : null))
    setFormulario((actual) => ({ modo: { modo: 'editar', grupo }, abierto: true, clave: (actual?.clave ?? 0) + 1 }))
  }

  function abrirGrupo(grupoId: string): void {
    setFormulario((actual) => (actual ? { ...actual, abierto: false } : null))
    setDetalle({ grupoId, abierto: true })
  }

  // Promotion is per campus and only for Transit / Inside Out (The Living Room has no year, S11).
  const estudiantes = subareas.filter((s) => s.experiencia === 'estudiantes')
  const promueve = estudiantes.length > 0
  const delCampus = campusId ? estudiantes.filter((s) => s.campusId === campusId) : []
  const enlacePromocion = delCampus.length > 0 ? `/estudiantes/promocion?campus=${encodeURIComponent(campusId!)}` : '/estudiantes/promocion'
  const paraPromover = delCampus.length > 0 ? delCampus : estudiantes
  const nombresPromocion = [...new Set(ordenarPorAmbito(paraPromover, (s) => ({ ambito: s.ambito, experiencia: s.experiencia })).map((s) => s.ambito))]
  const campusPromocion = [...new Set(paraPromover.map((s) => s.campus))]
  const pistaPromocion = `${nombresPromocion.join(' e ')}${campusPromocion.length === 1 ? ` de ${campusPromocion[0]}` : ''} ${nombresPromocion.length === 1 ? 'sube' : 'suben'} un año`
  const ambitoActual = subareas.find((s) => s.ambitoId === vista.filtros.ambito)
  const promoverMovil = promueve && ambitoActual?.experiencia !== 'the_living_room'

  const grupoDetalle = detalle ? (grupos.find((g) => g.id === detalle.grupoId) ?? null) : null
  const panelAbierto = (detalle?.abierto && grupoDetalle !== null) || formulario?.abierto === true
  const hayFiltros = vista.filtros.metrica !== null || vista.filtros.anio !== null || vista.filtros.q.trim() !== ''
  const limpiar = (): void => cambiar({ ...FILTROS_INICIALES, ambito: vista.filtros.ambito, area: vista.filtros.area })
  const vacio = hayFiltros ? (
    <EstadoVacioSistema
      icono={UsersRound}
      titulo="Ningún grupo coincide"
      subtitulo="Quita algún filtro o toca de nuevo la métrica."
      accion={
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={limpiar}>
          Limpiar todo
        </BotonSistema>
      }
    />
  ) : (
    <EstadoVacioSistema icono={UsersRound} titulo="Todavía no hay grupos aquí" subtitulo="Crea el primero con «Crear grupo»." />
  )
  const chips = (
    <ChipsFiltrosActivos
      chips={vista.chips.map((c) => ({ id: c.id, etiqueta: c.etiqueta }))}
      onQuitar={(id) => {
        const chip = vista.chips.find((c) => c.id === id)
        if (chip) cambiar(chip.parche)
      }}
      onLimpiarTodo={() => cambiar({ metrica: null, anio: null })}
    />
  )
  const columnaAnio = vista.columnaAnio

  const acciones = (
    <>
      {promueve && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BotonSistema type="button" variante="outline" tamaño="sm">
              Acciones
              <ChevronDown aria-hidden="true" className="size-3.5" />
            </BotonSistema>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" aria-label="Acciones de Grupos" className="min-w-64 bg-card shadow-sheet">
            <DropdownMenuItem asChild className={CLASE_ITEM}>
              <Link href={enlacePromocion}>
                <ArrowUpCircle aria-hidden="true" className="mt-0.5" />
                <span className="min-w-0">
                  Promover temporada
                  <small className="block text-xs text-muted-foreground">{pistaPromocion}</small>
                </span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <BotonSistema type="button" variante="primario" tamaño="sm" icono={Plus} onClick={abrirCrear}>
        Crear grupo
      </BotonSistema>
    </>
  )

  const movil = (
    <>
      <div className="-mx-2 -mt-2 flex items-center justify-between gap-2">
        <BotonAtrasMovil atras={{ etiqueta: 'Estudiantes', href: '/estudiantes' }} className="max-w-[75%]" />
        <BotonFiltrosMovil filtrosActivos={vista.filtrosEnHoja} onClick={() => setHojaAbierta(true)} />
      </div>
      <TituloGrande titulo={vista.titulo} nivel={2} resumen={<Resumen vista={vista} />} />
    </>
  )

  return (
    // No `titulo`: the h1 is the header band on desktop and the shell header on phones (one h1 per width).
    <MarcoAlcance
      migas={<MigasGrupos migas={vista.migas} onIr={(miga) => miga.parche && cambiar(miga.parche)} />}
      titulo={vista.titulo}
      resumen={<Resumen vista={vista} />}
      acciones={acciones}
      barra={escritorio !== false && <BarraGrupos vista={vista} onCambio={cambiar} />}
      panel={acoplado && panelAbierto ? 'md' : null}
      movil={movil}
    >
      {escritorio !== false && (
        <div className="hidden min-h-0 flex-1 flex-col md:flex">
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-6 pt-3 pb-2.5">
            <BuscadorBarra valor={vista.filtros.q} onCambio={(q) => cambiar({ q })} placeholder="Buscar grupo, líder o estudiante" etiqueta="Buscar grupos" />
            {vista.anios.length > 0 && (
              <SelectSistema
                aria-label="Año escolar"
                opciones={[
                  { valor: '', etiqueta: 'Todos los años' },
                  ...vista.anios.map((a) => ({ valor: String(a.numero), etiqueta: `${a.etiqueta} · ${a.cantidad}` })),
                ]}
                value={vista.filtros.anio === null ? '' : String(vista.filtros.anio)}
                onValueChange={(v) => cambiar({ anio: v === '' ? null : Number(v) })}
              />
            )}
            <MenuColumnas
              fija="Grupo"
              columnas={COLUMNAS_GRUPOS.map((c) => ({ id: c.id, etiqueta: c.id === 'anio' ? columnaAnio : c.etiqueta }))}
              ocultas={ocultas}
              onCambio={setOcultas}
            />
            <ControlSegmentado etiqueta="Densidad" opciones={DENSIDADES} valor={densidad} onCambio={setDensidad} />
            <p className="ml-auto text-[13px] text-muted-foreground">
              <strong className="font-mono font-semibold tabular-nums text-foreground">{vista.visibles.length}</strong> de{' '}
              <span className="font-mono tabular-nums">{vista.filtros.metrica === 'desactivados' ? vista.totales.desactivados : vista.totales.grupos}</span>
            </p>
          </div>
          {vista.chips.length > 0 && <div className="shrink-0 px-6 pb-2.5">{chips}</div>}
          <RegionTabla etiqueta={vista.filtros.metrica === 'desactivados' ? 'Grupos desactivados' : 'Grupos'} className="min-h-0 flex-1">
            {vista.visibles.length > 0 ? (
              <TablaGrupos
                vista={vista}
                ocultas={ocultas}
                densidad={densidad}
                seleccionado={detalle?.abierto ? detalle.grupoId : null}
                onOrdenar={(orden) => cambiar({ orden })}
                onAbrir={abrirGrupo}
              />
            ) : (
              vacio
            )}
          </RegionTabla>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 pt-2 pb-3 text-xs text-muted-foreground">
            <span id="grupos-pie" className="font-mono tabular-nums">
              {vista.pie.resumen}
            </span>
            <span>{vista.pie.orden}</span>
          </div>
        </div>
      )}

      {escritorio !== true && (
        <div className="space-y-4 md:hidden">
          <BarraHerramientas
            busqueda={{ valor: vista.filtros.q, onCambio: (q) => cambiar({ q }), placeholder: 'Buscar grupo, líder o estudiante', etiqueta: 'Buscar grupos' }}
            filtrosActivos={vista.filtrosEnHoja}
            onAbrirFiltros={() => setHojaAbierta(true)}
          />
          {vista.alcance.todos && (
            <GrupoPastillas etiqueta="Ámbito">
              <PastillaFiltro etiqueta="Todos" cantidad={vista.alcance.todos.grupos} activa={vista.alcance.todos.actual} onClick={() => cambiar(vista.alcance.todos!.parche)} />
              {vista.alcance.ambitos.map((a) => (
                <PastillaFiltro key={a.id} etiqueta={a.label} cantidad={a.grupos} activa={vista.filtros.ambito === a.id} onClick={() => cambiar(a.parche)} />
              ))}
            </GrupoPastillas>
          )}
          <MetricasCompactas
            etiqueta="Necesitan atención"
            metricas={vista.metricas.map((m) => ({ id: m.id, etiqueta: m.id === 'sinLider' ? 'Sin líder' : m.etiqueta, valor: m.valor, aviso: m.id === 'sinLider', activa: m.activa }))}
            onAlternar={(id) => cambiar(parcheMetrica(vista.filtros, id as MetricaGrupos))}
          />
          {chips}
          {vista.visibles.length > 0 ? (
            <ListaGruposMovil vista={vista} onAbrir={abrirGrupo} />
          ) : (
            <div className="min-w-0 overflow-hidden rounded-2xl bg-card">{vacio}</div>
          )}
          {vista.visibles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-muted-foreground">
              <span className="font-mono tabular-nums">{vista.pie.resumen}</span>
              <span>{vista.pie.orden}</span>
            </div>
          )}
          {promoverMovil && (
            <BotonSistema asChild variante="outline" icono={ArrowUpCircle} className="w-full">
              <Link href={enlacePromocion}>Promover temporada</Link>
            </BotonSistema>
          )}
          <BotonFlotante icono={Plus} label="Crear grupo" onClick={abrirCrear} />
        </div>
      )}

      <HojaFiltrosGrupos vista={vista} abierta={hojaAbierta} onCambioAbierta={setHojaAbierta} onCambio={cambiar} />

      <DetalleGrupo
        key={detalle?.grupoId ?? 'ninguno'}
        grupo={grupoDetalle}
        grupos={grupos}
        subareas={subareas}
        escalas={escalas}
        abierto={detalle?.abierto ?? false}
        onCambioAbierto={(abierto) => setDetalle((actual) => (actual ? { ...actual, abierto } : null))}
        onEditar={abrirEditar}
      />

      {formulario && (
        <FormularioGrupo
          key={formulario.clave}
          modo={formulario.modo}
          abierto={formulario.abierto}
          onCambioAbierto={(abierto) => setFormulario((actual) => (actual ? { ...actual, abierto } : null))}
          subareas={subareas}
          grupos={grupos}
          escalas={escalas}
          campusPreferido={campusId}
          onCreado={(grupoId) => setDetalle({ grupoId, abierto: true })}
        />
      )}
    </MarcoAlcance>
  )
}
