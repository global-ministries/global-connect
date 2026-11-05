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
 * "Ubicar" (and dragging) places people from T5b.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'

import { BotonSistema, InputSistema, SelectSistema } from '@/components/ui/sistema-diseno'
import { PastillaFiltro } from '@/components/ui/PastillasFiltro'
import { nombrePersona, type PersonaBanco, type TemporadaPlanner } from '@/lib/platform/grupos-vida/planner'
import { cn } from '@/lib/utils'

import { EtiquetaPlanner } from './etiqueta'
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

function FilaPersona({ fila, temporada }: { readonly fila: FilaBanco; readonly temporada: TemporadaPlanner }): ReactElement {
  const [una, otra] = fila.personas
  const { segmento, donde } = detalleFila(fila, temporada)
  const registro = fechaCorta(una.fecha_registro)
  const nuevo = !segmento && !una.grupo_actual_id && !una.origen_grupo_id
  const linea = [segmento, nuevo && registro ? `${otra ? 'Se registraron' : 'Se registró'} el ${registro}` : null, donde].filter(Boolean).join(' · ')
  const marcas = marcasFila(fila)
  return (
    <li className="flex min-w-0 items-start gap-2 border-b border-border px-1 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">
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
        <div className="mt-1 flex flex-wrap gap-1">
          {nuevo && <EtiquetaPlanner tono="info">Nuevo · sin segmento</EtiquetaPlanner>}
          {marcas.map((m) => (
            <EtiquetaPlanner key={m.etiqueta} tono={m.tono}>
              {m.etiqueta}
            </EtiquetaPlanner>
          ))}
        </div>
      </div>
      {/* Placing people is a saved step (T5b). */}
      <BotonSistema type="button" variante="ghost" tamaño="sm" disabled title="Disponible pronto" aria-label={`Ubicar a ${nombreFila(fila)}`}>
        Ubicar
      </BotonSistema>
    </li>
  )
}

export interface BancoPersonasProps {
  readonly id: string
  readonly banco: readonly PersonaBanco[]
  readonly temporada: TemporadaPlanner
  readonly className?: string
}

export function BancoPersonas({ id, banco, temporada, className }: BancoPersonasProps): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosBanco>(FILTROS_BANCO_INICIALES)
  const [limite, setLimite] = useState(TAMANO_PAGINA_BANCO)
  const modelo = useMemo(() => modeloBanco(banco, filtros, temporada), [banco, filtros, temporada])
  const cambiar = (parche: Partial<FiltrosBanco>) => {
    setFiltros((f) => ({ ...f, ...parche }))
    setLimite(TAMANO_PAGINA_BANCO)
  }

  const visibles = cortarSecciones(modelo.secciones, limite)
  const faltan = modelo.filas - Math.min(limite, modelo.filas)

  return (
    <aside id={id} aria-labelledby={`${id}-titulo`} className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4', className)}>
      <div className="space-y-0.5">
        <h2 id={`${id}-titulo`} className="text-base font-semibold text-foreground">
          Banco de personas
        </h2>
        <p className="text-sm text-muted-foreground">
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
      />
      <div role="group" aria-label="Filtros rápidos del banco" className="flex flex-wrap gap-2">
        <PastillaFiltro etiqueta="Sin ubicar" cantidad={modelo.conteos.sinUbicar} activa={filtros.sinUbicar} onClick={() => cambiar({ sinUbicar: !filtros.sinUbicar })} />
        <PastillaFiltro etiqueta="Matrimonios" cantidad={modelo.conteos.matrimonios} activa={filtros.matrimonios} onClick={() => cambiar({ matrimonios: !filtros.matrimonios })} />
        <PastillaFiltro etiqueta="Sin segmento" cantidad={modelo.conteos.sinSegmento} activa={filtros.sinSegmento} onClick={() => cambiar({ sinSegmento: !filtros.sinSegmento })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectSistema
          aria-label="Edad"
          opciones={EDADES.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta }))}
          value={filtros.edad}
          onValueChange={(valor) => cambiar({ edad: valor as FiltroEdad })}
        />
        <SelectSistema
          aria-label="Ciudad donde vive"
          opciones={[{ valor: '', etiqueta: 'Ciudad: todas' }, ...modelo.ciudades]}
          value={filtros.ciudad}
          onValueChange={(valor) => cambiar({ ciudad: valor })}
        />
      </div>
      {visibles.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nadie coincide con estos filtros. Quita alguno.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((seccion) => (
            <section key={seccion.id} aria-label={seccion.titulo}>
              <h3 className="flex items-baseline justify-between gap-2 px-1 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                <span className="truncate">{seccion.titulo}</span>
                <span className="font-mono tabular-nums">{formatearCantidad(seccion.cantidad)}</span>
              </h3>
              <ul>
                {seccion.filas.map((fila) => (
                  <FilaPersona key={fila.clave} fila={fila} temporada={temporada} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {faltan > 0 && (
        <BotonSistema type="button" variante="outline" tamaño="sm" onClick={() => setLimite((l) => l + TAMANO_PAGINA_BANCO)}>
          Ver {Math.min(faltan, TAMANO_PAGINA_BANCO)} más · quedan {formatearCantidad(faltan)}
        </BotonSistema>
      )}
    </aside>
  )
}
