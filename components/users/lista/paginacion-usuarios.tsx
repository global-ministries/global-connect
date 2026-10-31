'use client'

/**
 * Usuarios — the list footer (prototype `.pager`): the range shown, the page
 * size (20 / 50 / 100, as before T8-2) and Anterior / Siguiente. The pages are
 * the server's (listar_usuarios_con_permisos_v2 `p_limite` / `p_offset`).
 */
import type { ReactElement } from 'react'

import { BotonSistema, SelectSistema } from '@/components/ui/sistema-diseno'

export const TAMANOS_PAGINA = [20, 50, 100] as const

const OPCIONES = TAMANOS_PAGINA.map((n) => ({ valor: String(n), etiqueta: String(n) }))

export interface PaginacionUsuariosProps {
  readonly pagina: number
  readonly paginas: number
  readonly limite: number
  /** People on this page. */
  readonly enPagina: number
  readonly total: number
  readonly onPagina: (pagina: number) => void
  readonly onLimite: (limite: number) => void
}

export function PaginacionUsuarios({ pagina, paginas, limite, enPagina, total, onPagina, onLimite }: PaginacionUsuariosProps): ReactElement {
  const desde = (pagina - 1) * limite + 1
  return (
    <div className="flex flex-col items-center gap-3 px-1 text-[13px] text-muted-foreground md:flex-row md:flex-wrap md:justify-between">
      <p role="status">
        <span className="font-mono tabular-nums">{`${desde}–${desde + enPagina - 1}`}</span> de{' '}
        <span className="font-mono tabular-nums">{total.toLocaleString('es-VE')}</span>
      </p>
      <div className="flex items-center gap-2">
        <label htmlFor="usuarios-por-pagina">Mostrar</label>
        <SelectSistema id="usuarios-por-pagina" opciones={OPCIONES} value={String(limite)} onValueChange={(valor) => onLimite(Number(valor))} className="w-24" />
      </div>
      <div className="flex items-center gap-2">
        <BotonSistema type="button" variante="outline" tamaño="sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
          Anterior
        </BotonSistema>
        <span aria-live="polite" className="min-w-24 text-center font-mono tabular-nums">{`Página ${pagina} de ${paginas}`}</span>
        <BotonSistema type="button" variante="outline" tamaño="sm" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
          Siguiente
        </BotonSistema>
      </div>
    </div>
  )
}
