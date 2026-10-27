'use client'

/**
 * GaleriaSistema — every design system v2 piece on one screen, with
 * Servidores-like sample data, so a change to a canonical component can be
 * reviewed at every width before a screen adopts it
 * (docs/design-system/README.md#gallery). Rendered by
 * app/(auth)/design-system/page.tsx, which only exists outside production.
 *
 * Sample data only: nothing here reads or writes the database.
 */
import * as React from 'react'
import { Inbox, MessageCircle, Pencil, Phone, Plus, SearchX, Trash2, UserPlus } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  BadgeSistema,
  BotonSistema,
  SelectSistema,
  TarjetaSistema,
} from '@/components/ui/sistema-diseno'
import { PuntoEstado, type TonoEstado } from '@/components/ui/punto-estado'
import { MetricasAtencion, type MetricaAtencion } from '@/components/ui/metricas-atencion'
import { PastillaFiltro, GrupoPastillas } from '@/components/ui/PastillasFiltro'
import { TarjetasFiltro, type TarjetaFiltro } from '@/components/ui/TarjetasFiltro'
import { ControlSegmentado } from '@/components/ui/control-segmentado'
import {
  BarraHerramientas,
  BotonFiltrosMovil,
  ChipsFiltrosActivos,
  type ChipFiltro,
} from '@/components/ui/barra-herramientas'
import { GrupoFiltro, HojaFiltros, SelectsFiltro } from '@/components/ui/hoja-filtros'
import { ListaResponsiva, type ColumnaLista, type OrdenLista } from '@/components/ui/lista-responsiva'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { EstadoVacioSistema, SkeletonLista } from '@/components/ui/estado-vacio-sistema'
import {
  BarraNavegacionMovil,
  NavegacionMovilProvider,
  TituloGrande,
} from '@/components/ui/barra-navegacion-movil'
import { HojaInferior } from '@/components/ui/hoja-inferior'

// ─── Sample data ───

type Etapa = 'Activo' | 'Por activar' | 'En pausa' | 'Inactivo'

interface Servidor {
  readonly id: string
  readonly nombre: string
  readonly telefono: string
  readonly equipo: string
  readonly rol: string
  readonly turno: string
  readonly etapa: Etapa
  readonly inicio: string
}

const TONO_ETAPA: Record<Etapa, TonoEstado> = {
  Activo: 'success',
  'Por activar': 'info',
  'En pausa': 'warning',
  Inactivo: 'muted',
}

export const SERVIDORES: readonly Servidor[] = [
  { id: 's1', nombre: 'Ana Pérez', telefono: '+52 81 1234 5678', equipo: 'Waumba Land', rol: 'Líder', turno: 'Domingo 9:00', etapa: 'Activo', inicio: '2023-02-12' },
  { id: 's2', nombre: 'Carlos Méndez', telefono: '+52 81 2345 6789', equipo: 'UpStreet', rol: 'Servidor', turno: 'Domingo 11:00', etapa: 'Por activar', inicio: '2026-09-28' },
  { id: 's3', nombre: 'Lucía Hernández', telefono: '+52 81 3456 7890', equipo: 'Coro', rol: 'Coordinadora', turno: 'Sábado 18:00', etapa: 'Activo', inicio: '2021-06-04' },
  { id: 's4', nombre: 'Jorge Ramírez', telefono: '+52 81 4567 8901', equipo: 'Anfitriones', rol: 'Servidor', turno: 'Sin turno', etapa: 'En pausa', inicio: '2024-11-17' },
  { id: 's5', nombre: 'María José Treviño Garza', telefono: '+52 81 5678 9012', equipo: 'Punto de Partida', rol: 'Servidora', turno: 'Domingo 13:00', etapa: 'Inactivo', inicio: '2022-03-20' },
]

const COLUMNAS: readonly ColumnaLista[] = [
  { id: 'persona', titulo: 'Persona', ordenable: true, ancho: 'minmax(220px,1.4fr)' },
  { id: 'equipo', titulo: 'Equipo', ordenable: true },
  { id: 'rol', titulo: 'Rol', ordenable: true, ancho: '130px' },
  { id: 'turno', titulo: 'Turno', ancho: '140px', ocultarEnTablet: true },
  { id: 'etapa', titulo: 'Etapa', ordenable: true, ancho: '130px' },
]

const METRICAS_BASE = [
  { id: 'por-activar', etiqueta: 'Por activar', valor: 6, total: 48, pista: '13% del equipo', tono: 'info' },
  { id: 'sin-turno', etiqueta: 'Sin turno', valor: 9, total: 48, pista: 'Asígnales un servicio', tono: 'warning' },
  { id: 'sin-cuenta', etiqueta: 'Sin cuenta', valor: 4, total: 48, pista: 'Invítalos a la app', tono: 'danger' },
  { id: 'activos', etiqueta: 'Activos', valor: 36, total: 48, pista: '75% del equipo', tono: 'success' },
] as const

const DIRECCIONES_TODAS: TarjetaFiltro = { id: 'todas', label: 'Todas las direcciones', subtitulo: null, total: 48, badge: null }
const DIRECCIONES: readonly TarjetaFiltro[] = [
  { id: 'ninos', label: 'Dirección de Niños', subtitulo: 'Coordina Edith Pérez', total: 21, badge: '2 por activar' },
  { id: 'alabanza', label: 'Dirección de Alabanza', subtitulo: 'Coordina Daniel Soto', total: 12, badge: null },
  { id: 'conexion', label: 'Dirección de Conexión', subtitulo: 'Coordina Paola Ruiz', total: 15, badge: '4 sin cuenta' },
]

const ETAPAS: readonly { etiqueta: Etapa; cantidad: number }[] = [
  { etiqueta: 'Activo', cantidad: 36 },
  { etiqueta: 'Por activar', cantidad: 6 },
  { etiqueta: 'En pausa', cantidad: 4 },
  { etiqueta: 'Inactivo', cantidad: 2 },
]

const TONOS: readonly { tono: TonoEstado; etiqueta: string }[] = [
  { tono: 'success', etiqueta: 'Activo' },
  { tono: 'warning', etiqueta: 'En pausa' },
  { tono: 'info', etiqueta: 'Por activar' },
  { tono: 'danger', etiqueta: 'Revisar teléfono' },
  { tono: 'muted', etiqueta: 'Inactivo' },
]

type Vista = 'persona' | 'servicio'
const VISTAS = [
  { valor: 'persona', etiqueta: 'Por persona' },
  { valor: 'servicio', etiqueta: 'Por servicio' },
] as const

function iniciales(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
}

function Avatar({ nombre }: { readonly nombre: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-10 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
    >
      {iniciales(nombre)}
    </span>
  )
}

function compararServidores(orden: OrdenLista) {
  const campo: Record<string, (s: Servidor) => string> = {
    persona: (s) => s.nombre,
    equipo: (s) => s.equipo,
    rol: (s) => s.rol,
    etapa: (s) => s.etapa,
  }
  const leer = campo[orden.columna] ?? campo.persona
  return (a: Servidor, b: Servidor) => {
    const resultado = leer(a).localeCompare(leer(b), 'es')
    return orden.sentido === 'asc' ? resultado : -resultado
  }
}

// ─── Layout of the gallery ───

function Seccion({
  id,
  titulo,
  descripcion,
  children,
}: {
  readonly id: string
  readonly titulo: string
  readonly descripcion?: string
  readonly children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-4">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-foreground">
          {titulo}
        </h2>
        {descripcion && <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

function Fila({ children, className }: { readonly children: React.ReactNode; readonly className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
}

// ─── Gallery ───

export function GaleriaSistema() {
  const [metricasActivas, setMetricasActivas] = React.useState<ReadonlySet<string>>(() => new Set(['sin-turno']))
  const [direccion, setDireccion] = React.useState('todas')
  const [etapas, setEtapas] = React.useState<ReadonlySet<Etapa>>(() => new Set<Etapa>(['Activo', 'Por activar']))
  const [vista, setVista] = React.useState<Vista>('persona')
  const [busqueda, setBusqueda] = React.useState('')
  const [filtrosAbiertos, setFiltrosAbiertos] = React.useState(false)
  const [rol, setRol] = React.useState('')
  const [orden, setOrden] = React.useState<OrdenLista>({ columna: 'persona', sentido: 'asc' })
  const [seleccionado, setSeleccionado] = React.useState<Servidor | null>(null)
  const [hojaAbierta, setHojaAbierta] = React.useState(false)

  const metricas: MetricaAtencion[] = METRICAS_BASE.map((m) => ({ ...m, activa: metricasActivas.has(m.id) }))

  function alternarMetrica(id: string) {
    setMetricasActivas((previas) => {
      const siguientes = new Set(previas)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }

  function alternarEtapa(etapa: Etapa) {
    setEtapas((previas) => {
      const siguientes = new Set(previas)
      if (siguientes.has(etapa)) siguientes.delete(etapa)
      else siguientes.add(etapa)
      return siguientes
    })
  }

  function limpiarFiltros() {
    setEtapas(new Set())
    setRol('')
  }

  function ordenar(columna: string) {
    setOrden((previo) =>
      previo.columna === columna
        ? { columna, sentido: previo.sentido === 'asc' ? 'desc' : 'asc' }
        : { columna, sentido: 'asc' },
    )
  }

  const chips: ChipFiltro[] = [
    ...[...etapas].map((etapa) => ({ id: `etapa:${etapa}`, etiqueta: etapa })),
    ...(rol ? [{ id: 'rol', etiqueta: `Rol: ${rol}` }] : []),
  ]

  function quitarChip(id: string) {
    if (id === 'rol') setRol('')
    else {
      const etapa = id.replace('etapa:', '') as Etapa
      setEtapas((previas) => {
        const siguientes = new Set(previas)
        siguientes.delete(etapa)
        return siguientes
      })
    }
  }

  const consulta = busqueda.trim().toLowerCase()
  const visibles = SERVIDORES.filter(
    (s) =>
      (etapas.size === 0 || etapas.has(s.etapa)) &&
      (rol === '' || s.rol === rol) &&
      (consulta === '' || s.nombre.toLowerCase().includes(consulta) || s.telefono.includes(consulta)),
  )
  const ordenados = [...visibles].sort(compararServidores(orden))

  return (
    <div className="space-y-12">
      <Seccion id="galeria-botones" titulo="Botones" descripcion="BotonSistema: variantes, tamaños, icono, cargando y solo icono.">
        <Fila>
          <BotonSistema icono={Plus}>Asignar servicio</BotonSistema>
          <BotonSistema variante="secundario">Ver su equipo</BotonSistema>
          <BotonSistema variante="outline" icono={Pencil}>
            Editar ficha
          </BotonSistema>
          <BotonSistema variante="ghost">Cancelar</BotonSistema>
          <BotonSistema variante="peligro" icono={Trash2}>
            Quitar del equipo
          </BotonSistema>
        </Fila>
        <Fila>
          <BotonSistema tamaño="sm">Pequeño</BotonSistema>
          <BotonSistema tamaño="md">Mediano</BotonSistema>
          <BotonSistema tamaño="lg">Grande</BotonSistema>
          <BotonSistema cargando>Guardando</BotonSistema>
          <BotonSistema disabled variante="outline">
            Inactivo
          </BotonSistema>
          <BotonSistema soloIcono icono={UserPlus} aria-label="Invitar" variante="outline" />
        </Fila>
      </Seccion>

      <Seccion id="galeria-tarjetas" titulo="Tarjetas" descripcion="TarjetaSistema: superficie de tarjeta plana; outlined conserva la sombra.">
        <div className="grid gap-4 md:grid-cols-3">
          {(['default', 'elevated', 'outlined'] as const).map((variante) => (
            <TarjetaSistema key={variante} variante={variante}>
              <p className="text-sm font-semibold text-foreground">variante=&quot;{variante}&quot;</p>
              <p className="mt-1 text-sm text-muted-foreground">Waumba Land · 21 servidores</p>
            </TarjetaSistema>
          ))}
        </div>
      </Seccion>

      <Seccion id="galeria-estados" titulo="Insignias y estados" descripcion="BadgeSistema y PuntoEstado en todos sus tonos.">
        <Fila>
          {(['default', 'success', 'warning', 'error', 'info'] as const).map((variante) => (
            <BadgeSistema key={variante} variante={variante}>
              {variante}
            </BadgeSistema>
          ))}
        </Fila>
        <Fila className="gap-5">
          {TONOS.map(({ tono, etiqueta }) => (
            <PuntoEstado key={tono} tono={tono} etiqueta={etiqueta} />
          ))}
        </Fila>
      </Seccion>

      <Seccion id="galeria-metricas" titulo="Métricas de atención" descripcion="MetricasAtencion: cada tarjeta es un filtro (aria-pressed).">
        <MetricasAtencion etiqueta="Necesitan atención" metricas={metricas} onAlternar={alternarMetrica} />
      </Seccion>

      <Seccion id="galeria-filtros" titulo="Tarjetas y pastillas de filtro" descripcion="TarjetasFiltro eligen DÓNDE mirar; PastillasFiltro refinan QUÉ se ve.">
        <TarjetasFiltro
          todas={DIRECCIONES_TODAS}
          items={DIRECCIONES}
          modoCompacto={false}
          seleccionadoId={direccion}
          onSeleccionar={setDireccion}
          unidad={{ singular: 'servidor', plural: 'servidores' }}
          etiqueta="Direcciones"
          buscarEtiqueta="Buscar dirección"
        />
        <GrupoPastillas etiqueta="Filtrar por etapa">
          {ETAPAS.map(({ etiqueta, cantidad }) => (
            <PastillaFiltro
              key={etiqueta}
              etiqueta={etiqueta}
              cantidad={cantidad}
              activa={etapas.has(etiqueta)}
              onClick={() => alternarEtapa(etiqueta)}
            />
          ))}
        </GrupoPastillas>
      </Seccion>

      <Seccion
        id="galeria-herramientas"
        titulo="Barra de herramientas"
        descripcion="BarraHerramientas, ControlSegmentado, ChipsFiltrosActivos y HojaFiltros (Filtros la abre)."
      >
        <BarraHerramientas
          busqueda={{
            valor: busqueda,
            onCambio: setBusqueda,
            placeholder: 'Buscar por nombre o teléfono',
            etiqueta: 'Buscar servidores',
          }}
          filtrosActivos={chips.length}
          onAbrirFiltros={() => setFiltrosAbiertos(true)}
          vista={<ControlSegmentado etiqueta="Vista" opciones={VISTAS} valor={vista} onCambio={setVista} />}
        />
        <div className="flex items-center gap-3 md:hidden">
          <ControlSegmentado etiqueta="Vista en celular" opciones={VISTAS} valor={vista} onCambio={setVista} />
          <BotonFiltrosMovil filtrosActivos={chips.length} onClick={() => setFiltrosAbiertos(true)} />
        </div>
        <ChipsFiltrosActivos chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} />
        <p className="text-sm text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{visibles.length}</span> de {SERVIDORES.length} servidores
          coinciden.
        </p>
        <HojaFiltros
          abierta={filtrosAbiertos}
          onCambioAbierta={setFiltrosAbiertos}
          resultados={visibles.length}
          unidad={{ singular: 'persona', plural: 'personas' }}
          onLimpiar={limpiarFiltros}
        >
          <GrupoFiltro titulo="Etapa">
            <GrupoPastillas etiqueta="Etapa" className="mx-0 px-0 sm:mx-0 sm:px-0">
              {ETAPAS.map(({ etiqueta, cantidad }) => (
                <PastillaFiltro
                  key={etiqueta}
                  etiqueta={etiqueta}
                  cantidad={cantidad}
                  activa={etapas.has(etiqueta)}
                  onClick={() => alternarEtapa(etiqueta)}
                />
              ))}
            </GrupoPastillas>
          </GrupoFiltro>
          <GrupoFiltro titulo="Más filtros">
            <SelectsFiltro>
              <SelectSistema
                label="Rol"
                placeholder="Todos"
                value={rol}
                onValueChange={setRol}
                opciones={[
                  { valor: 'Líder', etiqueta: 'Líder' },
                  { valor: 'Coordinadora', etiqueta: 'Coordinadora' },
                  { valor: 'Servidor', etiqueta: 'Servidor' },
                  { valor: 'Servidora', etiqueta: 'Servidora' },
                ]}
              />
            </SelectsFiltro>
          </GrupoFiltro>
          <GrupoFiltro titulo="Vista">
            <ControlSegmentado etiqueta="Vista de la lista" opciones={VISTAS} valor={vista} onCambio={setVista} />
          </GrupoFiltro>
        </HojaFiltros>
      </Seccion>

      <Seccion
        id="galeria-lista"
        titulo="Lista responsiva"
        descripcion="ListaResponsiva: encabezados ordenables desde md, Turno desde lg, filas agrupadas en celular. Cada fila abre DetalleResponsivo."
      >
        <ListaResponsiva
          etiqueta="Servidores"
          columnas={COLUMNAS}
          filas={ordenados}
          claveFila={(s) => s.id}
          orden={orden}
          onOrdenar={ordenar}
          onAbrirFila={setSeleccionado}
          etiquetaFila={(s) => `Abrir ${s.nombre}`}
          renderCelda={(s, columna) => {
            switch (columna) {
              case 'persona':
                return (
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar nombre={s.nombre} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{s.nombre}</p>
                      <p className="truncate font-mono text-xs tabular-nums text-muted-foreground">{s.telefono}</p>
                    </div>
                  </div>
                )
              case 'equipo':
                return <span className="truncate text-sm text-foreground">{s.equipo}</span>
              case 'rol':
                return <span className="truncate text-sm text-muted-foreground">{s.rol}</span>
              case 'turno':
                return <span className="truncate text-sm text-muted-foreground">{s.turno}</span>
              case 'etapa':
                return <PuntoEstado tono={TONO_ETAPA[s.etapa]} etiqueta={s.etapa} />
              default:
                return null
            }
          }}
          renderFilaMovil={(s) => ({
            avatar: <Avatar nombre={s.nombre} />,
            titulo: s.nombre,
            subtitulo: `${s.equipo} · ${s.rol}`,
            meta: <PuntoEstado tono={TONO_ETAPA[s.etapa]} etiqueta={s.etapa} ocultarEtiquetaEnMovil />,
          })}
        />
        <DetalleResponsivo
          abierto={seleccionado !== null}
          onCambioAbierto={(abierto) => {
            if (!abierto) setSeleccionado(null)
          }}
          titulo={seleccionado?.nombre ?? 'Servidor'}
          descripcion={seleccionado ? `${seleccionado.equipo} · ${seleccionado.rol}` : undefined}
          pie={
            <>
              <BotonSistema variante="outline" onClick={() => setSeleccionado(null)}>
                Cerrar
              </BotonSistema>
              <BotonSistema icono={Pencil}>Editar ficha</BotonSistema>
            </>
          }
        >
          {seleccionado && (
            <div className="space-y-4">
              <Fila>
                <BotonSistema variante="outline" icono={MessageCircle}>
                  WhatsApp
                </BotonSistema>
                <BotonSistema variante="outline" icono={Phone}>
                  Llamar
                </BotonSistema>
              </Fila>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd className="font-mono tabular-nums text-foreground">{seleccionado.telefono}</dd>
                <dt className="text-muted-foreground">Turno</dt>
                <dd className="text-foreground">{seleccionado.turno}</dd>
                <dt className="text-muted-foreground">Etapa</dt>
                <dd>
                  <PuntoEstado tono={TONO_ETAPA[seleccionado.etapa]} etiqueta={seleccionado.etapa} />
                </dd>
                <dt className="text-muted-foreground">Inicio</dt>
                <dd className="font-mono tabular-nums text-foreground">{seleccionado.inicio}</dd>
              </dl>
            </div>
          )}
        </DetalleResponsivo>
      </Seccion>

      <Seccion id="galeria-vacio" titulo="Vacío y carga" descripcion="EstadoVacioSistema (sin datos y sin coincidencias) y SkeletonLista.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card">
            <EstadoVacioSistema
              icono={Inbox}
              titulo="Aún no hay servidores"
              subtitulo="Asigna el primer servicio para empezar."
              accion={<BotonSistema icono={Plus}>Asignar servicio</BotonSistema>}
            />
          </div>
          <ListaResponsiva
            etiqueta="Servidores filtrados"
            columnas={COLUMNAS}
            filas={[]}
            claveFila={(s: Servidor) => s.id}
            renderCelda={() => null}
            renderFilaMovil={(s) => ({ titulo: s.nombre })}
            onAbrirFila={() => {}}
            etiquetaFila={(s) => `Abrir ${s.nombre}`}
            vacio={
              <EstadoVacioSistema
                icono={SearchX}
                titulo="Nadie coincide con los filtros"
                subtitulo="Prueba con otra búsqueda o limpia los filtros."
                accion={
                  <BotonSistema variante="outline" onClick={limpiarFiltros}>
                    Limpiar todo
                  </BotonSistema>
                }
              />
            }
          />
          <ListaResponsiva
            etiqueta="Servidores cargando"
            columnas={COLUMNAS}
            filas={[]}
            cargando
            claveFila={(s: Servidor) => s.id}
            renderCelda={() => null}
            renderFilaMovil={(s) => ({ titulo: s.nombre })}
            onAbrirFila={() => {}}
            etiquetaFila={(s) => `Abrir ${s.nombre}`}
          />
        </div>
        <SkeletonLista filas={2} className="rounded-2xl border border-border/60 bg-card" />
      </Seccion>

      <Seccion
        id="galeria-navegacion"
        titulo="Navegación móvil"
        descripcion="BarraNavegacionMovil y TituloGrande dentro de NavegacionMovilProvider. Solo se ven en celular (debajo de md)."
      >
        <p className="hidden rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground md:block">
          Reduce la ventana a menos de 768px para ver la barra de navegación y el título grande.
        </p>
        <div className="overflow-hidden rounded-2xl border border-border md:hidden">
          <NavegacionMovilProvider>
            <BarraNavegacionMovil
              titulo="Servidores"
              atras={{ etiqueta: 'Dirección de Niños', onClick: () => {} }}
              acciones={<BotonFiltrosMovil filtrosActivos={chips.length} onClick={() => setFiltrosAbiertos(true)} />}
            />
            <div className="space-y-3 px-3 pb-4">
              <TituloGrande
                titulo="Servidores"
                resumen={
                  <>
                    <strong>48</strong> personas · <strong>6</strong> por activar
                  </>
                }
              />
            </div>
          </NavegacionMovilProvider>
        </div>
      </Seccion>

      <Seccion id="galeria-hoja" titulo="Hoja inferior" descripcion="HojaInferior: la hoja de celular (en cualquier ancho, para revisarla).">
        <Fila>
          <BotonSistema variante="outline" onClick={() => setHojaAbierta(true)}>
            Abrir hoja inferior
          </BotonSistema>
        </Fila>
        <HojaInferior
          abierta={hojaAbierta}
          onCambioAbierta={setHojaAbierta}
          titulo="Cambiar etapa"
          descripcion="Ana Pérez · Waumba Land"
          pie={
            <>
              <BotonSistema variante="outline" onClick={() => setHojaAbierta(false)}>
                Cancelar
              </BotonSistema>
              <BotonSistema onClick={() => setHojaAbierta(false)}>Guardar</BotonSistema>
            </>
          }
        >
          <div className="grid gap-2">
            {ETAPAS.map(({ etiqueta }) => (
              <PuntoEstado key={etiqueta} tono={TONO_ETAPA[etiqueta]} etiqueta={etiqueta} />
            ))}
          </div>
        </HojaInferior>
      </Seccion>
    </div>
  )
}
