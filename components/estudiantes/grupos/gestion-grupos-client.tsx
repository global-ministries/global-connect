'use client'

/**
 * Estudiantes › Grupos — client island of /estudiantes/grupos (C2 of
 * odd/tasks/estudiantes-fase-b.md; artboards 06 desktop, 07 phone, 08 form of
 * design/estudiantes-asistencia; list anatomy of
 * docs/design-system/patterns.md#list-screen-anatomy).
 *
 * Top to bottom: header (breadcrumbs "Estudiantes / <ámbito> / <sub-área>" +
 * "Crear grupo"), hero (title and the key numbers), toolbar (search over
 * groups, leaders and students; Filtros), the attention metrics that act as
 * filters (Por confirmar, Grupos sin líder, Desactivados), the scope cards of
 * the next level (ámbitos or sub-áreas; hidden at the leaf), and the list.
 * A row opens the group drawer (detalle-grupo.tsx), which holds every action;
 * "Crear grupo" (FAB on phones) opens the form (formulario-grupo.tsx).
 *
 * On phones the app shell's header holds the page h1 and has no back slot, so
 * a content row carries "‹ parent" and Filtros, and the large title is an h2
 * (as in Servidores). Every rule lives in the pure view model
 * (lib/platform/estudiantes/grupos-vista.ts); the filters stay in local state
 * and are mirrored into the URL with `router.replace` (search debounced).
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, UsersRound } from 'lucide-react'

import { BotonSistema, PaginaSistema } from '@/components/ui/sistema-diseno'
import { BotonFlotante } from '@/components/ui/BotonFlotante'
import { BarraHerramientas, BotonFiltrosMovil, ChipsFiltrosActivos } from '@/components/ui/barra-herramientas'
import { BotonAtrasMovil, TituloGrande } from '@/components/ui/barra-navegacion-movil'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { MetricasAtencion } from '@/components/ui/metricas-atencion'
import { TarjetasFiltro, type InsigniaTarjeta, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { useCampus } from '@/hooks/useCampus'
import type { GradoEscala, GrupoGestion, SubareaGestionable } from '@/lib/platform/estudiantes/grupos-datos'
import {
  FILTROS_INICIALES,
  calcularVistaGrupos,
  escribirFiltrosEnUrl,
  parcheMetrica,
  parcheTarjeta,
  type FiltrosGrupos,
  type MetricaGrupos,
  type Miga,
  type TarjetaAlcance,
  type VistaGrupos,
} from '@/lib/platform/estudiantes/grupos-vista'

import { DetalleGrupo } from './detalle-grupo'
import { HojaFiltrosGrupos } from './filtros-grupos'
import { FormularioGrupo, type ModoFormulario } from './formulario-grupo'
import { ListaGrupos } from './lista-grupos'

const RETRASO_BUSQUEDA_MS = 300

export interface GestionGruposClientProps {
  readonly grupos: readonly GrupoGestion[]
  readonly subareas: readonly SubareaGestionable[]
  readonly escalas: Readonly<Record<string, readonly GradoEscala[]>>
  readonly filtrosIniciales: FiltrosGrupos
  /** `?grupo=`: the group whose drawer opens on load (back from its leader list). */
  readonly grupoInicial?: string | null
}

function MigasGrupos({ migas, onIr }: { readonly migas: readonly Miga[]; readonly onIr: (miga: Miga) => void }): ReactElement {
  return (
    <nav aria-label="Ubicación">
      <ol className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
        {migas.map((miga, i) => {
          const actual = i === migas.length - 1
          return (
            <li key={miga.id} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && (
                <span aria-hidden="true" className="px-0.5 text-muted-foreground">
                  /
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

function aTarjeta(tarjeta: TarjetaAlcance): TarjetaFiltro {
  const insignias: InsigniaTarjeta[] = []
  if (tarjeta.sinLider > 0) insignias.push({ texto: `${tarjeta.sinLider} ${palabra(tarjeta.sinLider, 'grupo sin líder', 'grupos sin líder')}`, tono: 'warning' })
  if (tarjeta.porConfirmar > 0) insignias.push({ texto: `${tarjeta.porConfirmar} por confirmar`, tono: 'info' })
  const grupos = `${tarjeta.grupos} ${palabra(tarjeta.grupos, 'grupo', 'grupos')}`
  return {
    id: tarjeta.id,
    label: tarjeta.label,
    subtitulo: tarjeta.responsable ? `${grupos} · Dirige ${tarjeta.responsable}` : grupos,
    total: tarjeta.integrantes,
    badge: null,
    insignias,
  }
}

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

type Detalle = { readonly grupoId: string; readonly abierto: boolean }

export function GestionGruposClient({ grupos, subareas, escalas, filtrosIniciales, grupoInicial = null }: GestionGruposClientProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const { campusId } = useCampus()

  const [filtros, setFiltros] = useState<FiltrosGrupos>(filtrosIniciales)
  const [hojaAbierta, setHojaAbierta] = useState(false)
  // The group stays selected after the drawer closes, so it can animate out.
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

  const { atras, tarjetas } = vista
  const grupoDetalle = detalle ? (grupos.find((g) => g.id === detalle.grupoId) ?? null) : null
  const hayFiltros = vista.filtros.metrica !== null || vista.filtros.anio !== null || vista.filtros.q.trim() !== ''
  const vacio = hayFiltros ? (
    <EstadoVacioSistema
      icono={UsersRound}
      titulo="Ningún grupo coincide"
      subtitulo="Quita algún filtro o toca de nuevo la métrica."
      accion={
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => cambiar({ ...FILTROS_INICIALES, ambito: vista.filtros.ambito, area: vista.filtros.area })}>
          Limpiar todo
        </BotonSistema>
      }
    />
  ) : (
    <EstadoVacioSistema icono={UsersRound} titulo="Todavía no hay grupos aquí" subtitulo="Crea el primero con «Crear grupo»." />
  )

  return (
    // No `titulo`: the h1 is the hero on desktop and the shell header on phones (one h1 per width).
    <PaginaSistema
      breadcrumbs={<MigasGrupos migas={vista.migas} onIr={(miga) => miga.parche && cambiar(miga.parche)} />}
      acciones={
        // Small header action (36px, 44px on touch); the ::after widens the hit area to 48px (decisions 2026-10-28, 4).
        <BotonSistema
          type="button"
          variante="primario"
          tamaño="sm"
          icono={Plus}
          onClick={abrirCrear}
          className="relative after:absolute after:-inset-x-0.5 after:-inset-y-1.5 after:content-['']"
        >
          Crear grupo
        </BotonSistema>
      }
      className="pb-28 md:pb-0"
    >
      <div data-slot="cabecera-movil" className="md:hidden">
        <div className={`flex items-center justify-between gap-2 ${atras ? '-mx-2 -mt-2 mb-1' : '-mr-2'}`}>
          {atras ? (
            <BotonAtrasMovil atras={{ etiqueta: atras.etiqueta, onClick: () => cambiar(atras.parche) }} className="max-w-[75%]" />
          ) : (
            <TituloGrande titulo={vista.titulo} nivel={2} className="min-w-0 flex-1" />
          )}
          <BotonFiltrosMovil filtrosActivos={vista.filtrosEnHoja} onClick={() => setHojaAbierta(true)} />
        </div>
        <TituloGrande titulo={atras ? vista.titulo : undefined} nivel={2} resumen={<Resumen vista={vista} />} />
      </div>
      <div className="hidden md:block">
        <h1 className="text-2xl font-[650] leading-[1.15] tracking-[-0.02em] text-foreground">{vista.titulo}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
          <Resumen vista={vista} />
        </p>
      </div>

      <BarraHerramientas
        busqueda={{
          valor: vista.filtros.q,
          onCambio: (q) => cambiar({ q }),
          placeholder: 'Buscar grupo, líder o estudiante',
          etiqueta: 'Buscar grupos',
        }}
        filtrosActivos={vista.filtrosEnHoja}
        onAbrirFiltros={() => setHojaAbierta(true)}
      />

      <MetricasAtencion
        etiqueta="Necesitan atención"
        metricas={vista.metricas}
        onAlternar={(id) => cambiar(parcheMetrica(vista.filtros, id as MetricaGrupos))}
      />

      {tarjetas.nivel && tarjetas.items.length > 0 && (
        <section aria-labelledby="grupos-alcance" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 px-1 md:px-0">
            <h2 id="grupos-alcance" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {tarjetas.nivel === 'ambitos' ? 'Ámbitos' : 'Áreas'}
            </h2>
            <span className="hidden text-xs text-muted-foreground md:inline">Toca para entrar</span>
          </div>
          <TarjetasFiltro
            items={tarjetas.items.map(aTarjeta)}
            modoCompacto={false}
            seleccionadoId=""
            onSeleccionar={(id) => tarjetas.nivel && cambiar(parcheTarjeta(tarjetas.nivel, id))}
            unidad={{ singular: 'integrante', plural: 'integrantes' }}
            etiqueta={tarjetas.nivel === 'ambitos' ? 'Ámbitos' : 'Áreas'}
            buscarEtiqueta="Buscar área"
            presentacion="alcance"
          />
        </section>
      )}

      <section aria-labelledby="grupos-lista" className="space-y-3">
        <h2 id="grupos-lista" className="px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground md:px-0">
          {vista.filtros.metrica === 'desactivados' ? 'Grupos desactivados' : 'Grupos'}
        </h2>
        <ChipsFiltrosActivos
          chips={vista.chips.map((c) => ({ id: c.id, etiqueta: c.etiqueta }))}
          onQuitar={(id) => {
            const chip = vista.chips.find((c) => c.id === id)
            if (chip) cambiar(chip.parche)
          }}
          onLimpiarTodo={() => cambiar({ metrica: null, anio: null })}
        />
        <ListaGrupos
          vista={vista}
          onOrdenar={(orden) => cambiar({ orden })}
          onAbrir={(grupoId) => setDetalle({ grupoId, abierto: true })}
          vacio={vacio}
        />
        {vista.visibles.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{vista.pie.resumen}</span>
            <span>{vista.pie.orden}</span>
          </div>
        )}
      </section>

      <BotonFlotante icono={Plus} label="Crear grupo" onClick={abrirCrear} />

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
    </PaginaSistema>
  )
}
