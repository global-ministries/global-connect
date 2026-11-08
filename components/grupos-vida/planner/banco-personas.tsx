'use client'

/**
 * Planner — the people bank (S11, S17; artboard 01 "People bank"; gap G3).
 * Everyone of the church for every role, never limited by segment. Header
 * "61 sin ubicar · 24 de 2025 - II y 37 nuevos" and the church total; search
 * by name, city or group; quick filters "Sin ubicar" (default), "Matrimonios"
 * and "Sin segmento"; Edad and Ciudad selects. Couples are one row with both
 * names and ages; rows are grouped under "De <origen>, sin ubicar" and
 * "Nuevos, sin segmento" (then the rest with "Sin ubicar" off). The list
 * shows 100 rows at a time ("Ver 100 más") so 1.4k people stay fast.
 *
 * With the board's steps (T5b, pasos-planner.tsx): "Ubicar" opens the
 * group and role dialog and a row can be dragged onto a card; the bank
 * itself takes members dragged out of a group; "Ver grupo" opens the group
 * panel of a person's current group (T6) when it is on the board. A person
 * the session draft moved shows "Sin guardar" (S24). Alone it is read-only.
 *
 * On a phone (T8c) the bank is a bottom sheet (`enHoja`: no card frame, the
 * sheet's title names it) and rows are not dragged: "Ubicar" places them.
 *
 * Planning style (S25, the context sidebar of prototipos/planificacion-dps/01):
 * no frame of its own (the board makes it a full-height sidebar with a left
 * border, or a bordered box above Lado a lado); the head over a border, the
 * sections with a sticky 12px uppercase heading, and person rows with the
 * initials avatar, name 13px / 500 and 12px secondary lines split by light
 * dividers. Next to the board the search and the Edad / Ciudad selects take
 * the toolbar's 36px (44px on touch, and in the phone sheet); the quick
 * filter pills keep PastillaFiltro's 44px, which has no compact size yet.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { nombrePersona, type PersonaBanco, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { AvatarIniciales } from './avatar-iniciales'
import { CLASE_CONTROL_COMPACTO } from './estilo-planner'
import { EtiquetaPlanner, MarcaSinGuardar } from './etiqueta'
import {
  FILTROS_BANCO_INICIALES,
  cortarSecciones,
  detalleFila,
  formatearCantidad,
  marcasFila,
  modeloBanco,
  nombreFila,
  type FilaBanco,
  type FiltroEdad,
  type FiltrosBanco,
} from './modelo'
import { usePasos, useZonaSoltar } from './contexto-pasos'

export const TAMANO_PAGINA_BANCO = 100

const EDADES: readonly { valor: FiltroEdad; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Edad: todas' },
  { valor: '18-35', etiqueta: '18 a 35' },
  { valor: '36-50', etiqueta: '36 a 50' },
  { valor: '51+', etiqueta: '51 o más' },
]

const fechaCorta = (fecha: string | null): string | null => {
  if (!fecha) return null
  const d = new Date(fecha)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'America/Caracas' })
}

function NombreConEdad({ persona }: { readonly persona: PersonaBanco }): ReactElement {
  return (
    <>
      {nombrePersona(persona)}
      {persona.edad !== null && <span className="ml-1 font-mono text-xs font-normal tabular-nums text-muted-foreground">{persona.edad}</span>}
    </>
  )
}

function FilaPersona({ fila, temporada, enHoja }: { readonly fila: FilaBanco; readonly temporada: TemporadaPlanner; readonly enHoja: boolean }): ReactElement {
  const [una, otra] = fila.personas
  const { segmento, donde } = detalleFila(fila, temporada)
  const registro = fechaCorta(una.fecha_registro)
  const nuevo = !segmento && !una.grupo_actual_id && !una.origen_grupo_id
  const linea = [segmento, nuevo && registro ? `${otra ? 'Se registraron' : 'Se registró'} el ${registro}` : null, donde].filter(Boolean).join(' · ')
  const marcas = marcasFila(fila)
  const pasos = usePasos()
  const nombre = nombreFila(fila)
  const carga = { ids: fila.personas.map((p) => p.usuario_id), nombre, desdeGrupo: false }
  const grupoActual = una.grupo_actual_id && pasos?.grupoVisible(una.grupo_actual_id) ? una.grupo_actual_id : null
  const sinGuardar = pasos !== null && fila.personas.some((p) => pasos.pendiente.persona(p.usuario_id))
  const arrastre = pasos !== null && pasos.arrastre !== false
  return (
    <li
      draggable={arrastre}
      onDragStart={arrastre ? (e) => pasos.arrastrar(carga, e) : undefined}
      onDragEnd={arrastre ? () => pasos.terminarArrastre() : undefined}
      className={cn(
        'flex min-w-0 items-start gap-2.5 border-b border-border/60 py-2 last:border-b-0',
        enHoja ? 'px-1' : 'pr-2 pl-4',
        arrastre && 'cursor-grab',
      )}
    >
      <AvatarIniciales nombres={fila.personas.map(nombrePersona)} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p data-nombres className="break-words text-[13px] font-medium leading-[18px] text-foreground">
          <NombreConEdad persona={una} />
          {otra && (
            <>
              {' y '}
              <NombreConEdad persona={otra} />
            </>
          )}
        </p>
        {linea && (
          <p title={linea} className="truncate text-xs text-muted-foreground">
            {linea}
          </p>
        )}
        {sinGuardar && <MarcaSinGuardar />}
        <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
          {nuevo && <EtiquetaPlanner tono="info">Nuevo · sin segmento</EtiquetaPlanner>}
          {marcas.map((m) => (
            <EtiquetaPlanner key={m.etiqueta} tono={m.tono}>
              {m.etiqueta}
            </EtiquetaPlanner>
          ))}
        </div>
      </div>
      <div className="-my-0.5 flex shrink-0 flex-col items-end">
        <BotonSistema
          type="button"
          variante="ghost"
          tamaño="sm"
          disabled={!pasos}
          aria-label={`Ubicar a ${nombre}`}
          onClick={() => pasos?.pedirUbicar(carga)}
        >
          Ubicar
        </BotonSistema>
        {grupoActual && (
          <BotonSistema
            type="button"
            variante="ghost"
            tamaño="sm"
            aria-label={`Abrir el grupo de ${nombrePersona(una)}`}
            onClick={() => pasos?.abrirGrupo(grupoActual)}
          >
            Ver grupo
          </BotonSistema>
        )}
      </div>
    </li>
  )
}

export interface BancoPersonasProps {
  readonly id: string
  readonly banco: readonly PersonaBanco[]
  readonly temporada: TemporadaPlanner
  readonly className?: string
  /** Inside the phone sheet: no card frame and the heading only for screen readers. */
  readonly enHoja?: boolean
}

export function BancoPersonas({ id, banco, temporada, className, enHoja = false }: BancoPersonasProps): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosBanco>(FILTROS_BANCO_INICIALES)
  const [limite, setLimite] = useState(TAMANO_PAGINA_BANCO)
  const modelo = useMemo(() => modeloBanco(banco, filtros, temporada), [banco, filtros, temporada])
  const cambiar = (parche: Partial<FiltrosBanco>) => {
    setFiltros((f) => ({ ...f, ...parche }))
    setLimite(TAMANO_PAGINA_BANCO)
  }

  const zona = useZonaSoltar(null, 'miembro')
  const visibles = cortarSecciones(modelo.secciones, limite)
  const faltan = modelo.filas - Math.min(limite, modelo.filas)

  return (
    <aside
      id={id}
      aria-labelledby={`${id}-titulo`}
      {...zona.props}
      className={cn('flex min-w-0 flex-col', enHoja ? 'gap-3' : 'bg-card', zona.sobre && 'ring-2 ring-inset ring-brand', className)}
    >
      <div className={cn('flex flex-col gap-3', !enHoja && 'border-b border-border px-4 pt-3.5 pb-4')}>
        <div className="space-y-0.5">
          <h2 id={`${id}-titulo`} className={enHoja ? 'sr-only' : 'text-sm font-[650] text-foreground'}>
            Banco de personas
          </h2>
          <p className="text-[13px] text-muted-foreground">
            <strong className="font-semibold text-foreground">{modelo.sinUbicar}</strong> · {modelo.desglose}
          </p>
          <p className="text-xs text-muted-foreground">
            Toda la iglesia, de cualquier segmento · <span className="font-mono tabular-nums">{formatearCantidad(modelo.total)}</span>
          </p>
        </div>
        <InputSistema
          type="search"
          icono={Search}
          value={filtros.busqueda}
          onChange={(e) => cambiar({ busqueda: e.target.value })}
          placeholder="Nombre, ciudad o grupo"
          aria-label="Buscar en el banco por nombre, ciudad o grupo"
          autoComplete="off"
          className={enHoja ? undefined : CLASE_CONTROL_COMPACTO}
        />
        <div role="group" aria-label="Filtros rápidos del banco" className="flex flex-wrap gap-2">
          <PastillaFiltro etiqueta="Sin ubicar" cantidad={modelo.conteos.sinUbicar} activa={filtros.sinUbicar} onClick={() => cambiar({ sinUbicar: !filtros.sinUbicar })} />
          <PastillaFiltro etiqueta="Matrimonios" cantidad={modelo.conteos.matrimonios} activa={filtros.matrimonios} onClick={() => cambiar({ matrimonios: !filtros.matrimonios })} />
          <PastillaFiltro etiqueta="Sin segmento" cantidad={modelo.conteos.sinSegmento} activa={filtros.sinSegmento} onClick={() => cambiar({ sinSegmento: !filtros.sinSegmento })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectSistema
            className={enHoja ? undefined : CLASE_CONTROL_COMPACTO}
            aria-label="Edad"
            opciones={EDADES.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))}
            value={filtros.edad}
            onValueChange={(valor) => cambiar({ edad: valor as FiltroEdad })}
          />
          <SelectSistema
            className={enHoja ? undefined : CLASE_CONTROL_COMPACTO}
            aria-label="Ciudad donde vive"
            opciones={[{ valor: '', etiqueta: 'Ciudad: todas' }, ...modelo.ciudades]}
            value={filtros.ciudad}
            onValueChange={(valor) => cambiar({ ciudad: valor })}
          />
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nadie coincide con estos filtros. Quita alguno.</p>
      ) : (
        <div className={enHoja ? 'space-y-3' : undefined}>
          {visibles.map((seccion) => (
            <section key={seccion.id} aria-label={seccion.titulo}>
              <h3
                className={cn(
                  'flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground',
                  enHoja ? 'px-1' : 'sticky top-0 z-[1] border-b border-border/60 bg-card px-4 pt-3 pb-2',
                )}
              >
                <span className="truncate">{seccion.titulo}</span>
                <span className="font-mono tabular-nums">{formatearCantidad(seccion.cantidad)}</span>
              </h3>
              <ul>
                {seccion.filas.map((fila) => (
                  <FilaPersona key={fila.clave} fila={fila} temporada={temporada} enHoja={enHoja} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {faltan > 0 && (
        <div className={cn(!enHoja && 'border-t border-border/60 p-3')}>
          <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setLimite((l) => l + TAMANO_PAGINA_BANCO)} className="w-full">
            Ver {Math.min(faltan, TAMANO_PAGINA_BANCO)} más · quedan {formatearCantidad(faltan)}
          </BotonSistema>
        </div>
      )}
    </aside>
  )
}
