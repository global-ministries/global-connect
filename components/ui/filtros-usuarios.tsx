'use client'

/**
 * Usuarios — the filters sheet (docs/design-system/patterns.md#toolbar-and-filters-sheet;
 * prototype docs/design-system/prototipos/usuarios/01-lista-escritorio.html,
 * `openFilters`): the canonical `HojaFiltros` (side panel from md, bottom
 * sheet below) with Rol (several at once), Teléfono, Email, Grupo de Vida and
 * Cuenta (yes/no pairs, a second tap removes the filter), Registro ("Nuevos ·
 * 7 días" with its count), Ordenar por (Nombre, Fecha de registro ↑/↓) and,
 * for the admin on phones, "Seleccionar personas" (the desktop toolbar has
 * the "Seleccionar" button).
 *
 * Filters apply live and go back to page 1; "Limpiar" empties exactly these
 * filters and "Ver N personas" only closes. The rules live in
 * lib/platform/usuarios/lista-vista.ts; the sheet only reports patches.
 */
import type { ReactElement } from 'react'

import { GrupoFiltro, HojaFiltros } from '@/components/ui/hoja-filtros'
import { GrupoPastillas, PastillaFiltro } from '@/components/ui/PastillasFiltro'
import {
  ETIQUETA_ROL,
  LIMPIAR_FILTROS,
  NUEVOS_DIAS,
  ROLES_SISTEMA,
  ordenDeLista,
  parcheOrden,
  type ColumnaOrdenUsuarios,
  type FiltrosUsuarios,
} from '@/lib/platform/usuarios/lista-vista'

type ClaveSiNo = 'conTelefono' | 'conEmail' | 'enGrupo' | 'conCuenta'

const PARES: ReadonlyArray<{ readonly clave: ClaveSiNo; readonly titulo: string; readonly si: string; readonly no: string }> = [
  { clave: 'conTelefono', titulo: 'Teléfono', si: 'Con teléfono', no: 'Sin teléfono' },
  { clave: 'conEmail', titulo: 'Email', si: 'Con email', no: 'Sin email' },
  { clave: 'enGrupo', titulo: 'Grupo de Vida', si: 'En grupo', no: 'Sin grupo' },
  { clave: 'conCuenta', titulo: 'Cuenta en la plataforma', si: 'Con cuenta', no: 'Sin cuenta' },
]

const ORDENES: ReadonlyArray<{ readonly columna: ColumnaOrdenUsuarios; readonly etiqueta: string }> = [
  { columna: 'persona', etiqueta: 'Nombre' },
  { columna: 'registro', etiqueta: 'Fecha de registro' },
]

export interface HojaFiltrosUsuariosProps {
  readonly filtros: FiltrosUsuarios
  readonly abierta: boolean
  readonly onCambioAbierta: (abierta: boolean) => void
  /** People that match now (the "Ver N personas" footer). */
  readonly resultados: number
  /** People registered in the last NUEVOS_DIAS days (the scope, as the metric). */
  readonly nuevos: number
  readonly onCambio: (parche: Partial<FiltrosUsuarios>) => void
  /** The admin's selection mode (phone entry point); absent hides the group. */
  readonly seleccion?: { readonly activa: boolean; readonly onAlternar: () => void }
}

export function HojaFiltrosUsuarios({
  filtros,
  abierta,
  onCambioAbierta,
  resultados,
  nuevos,
  onCambio,
  seleccion,
}: HojaFiltrosUsuariosProps): ReactElement {
  const orden = ordenDeLista(filtros.orden)

  function alternarRol(rol: string): void {
    const roles = filtros.roles.includes(rol) ? filtros.roles.filter((r) => r !== rol) : [...filtros.roles, rol]
    onCambio({ roles, pagina: 1 })
  }

  return (
    <HojaFiltros
      abierta={abierta}
      onCambioAbierta={onCambioAbierta}
      resultados={resultados}
      unidad={{ singular: 'persona', plural: 'personas' }}
      onLimpiar={() => onCambio(LIMPIAR_FILTROS)}
    >
      <GrupoFiltro titulo="Rol">
        <GrupoPastillas etiqueta="Filtrar por rol">
          {ROLES_SISTEMA.map((rol) => (
            <PastillaFiltro key={rol} etiqueta={ETIQUETA_ROL[rol]} activa={filtros.roles.includes(rol)} onClick={() => alternarRol(rol)} />
          ))}
        </GrupoPastillas>
      </GrupoFiltro>

      {PARES.map(({ clave, titulo, si, no }) => (
        <GrupoFiltro key={clave} titulo={titulo}>
          <GrupoPastillas etiqueta={`Filtrar por ${titulo.toLocaleLowerCase('es')}`}>
            {([true, false] as const).map((valor) => (
              <PastillaFiltro
                key={String(valor)}
                etiqueta={valor ? si : no}
                activa={filtros[clave] === valor}
                // A second tap on the active option removes the filter.
                onClick={() => onCambio({ [clave]: filtros[clave] === valor ? null : valor, pagina: 1 })}
              />
            ))}
          </GrupoPastillas>
        </GrupoFiltro>
      ))}

      <GrupoFiltro titulo="Registro">
        <GrupoPastillas etiqueta="Filtrar por registro">
          <PastillaFiltro
            etiqueta={`Nuevos · ${NUEVOS_DIAS} días`}
            cantidad={nuevos}
            activa={filtros.nuevos}
            onClick={() => onCambio({ nuevos: !filtros.nuevos, pagina: 1 })}
          />
        </GrupoPastillas>
      </GrupoFiltro>

      <GrupoFiltro titulo="Ordenar por">
        <GrupoPastillas etiqueta="Ordenar la lista">
          {ORDENES.map(({ columna, etiqueta }) => {
            const activa = orden.columna === columna
            // Name sorts A–Z only, so only the date shows its direction.
            const flecha = activa && columna === 'registro' ? (orden.sentido === 'asc' ? ' ↑' : ' ↓') : ''
            return <PastillaFiltro key={columna} etiqueta={`${etiqueta}${flecha}`} activa={activa} onClick={() => onCambio(parcheOrden(filtros, columna))} />
          })}
        </GrupoPastillas>
      </GrupoFiltro>

      {seleccion && (
        <GrupoFiltro titulo="Cambiar rol" className="md:hidden">
          <GrupoPastillas etiqueta="Cambiar el rol de varias personas">
            <PastillaFiltro etiqueta="Seleccionar personas" activa={seleccion.activa} onClick={seleccion.onAlternar} />
          </GrupoPastillas>
        </GrupoFiltro>
      )}
    </HojaFiltros>
  )
}
