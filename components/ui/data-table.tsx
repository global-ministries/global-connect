import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'

export interface DataTableColumn<Row> {
  key: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableSelectColumn<Row> {
  header: ReactNode
  cell: (row: Row) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
  selectColumn?: DataTableSelectColumn<Row>
  caption?: ReactNode
  emptyState?: ReactNode
  getRowHref?: (row: Row) => string
  getRowLabel?: (row: Row) => string
  className?: string
  tableClassName?: string
  rowClassName?: string | ((row: Row) => string | undefined)
  bodyClassName?: string
  linkClassName?: string
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  selectColumn,
  caption,
  emptyState,
  getRowHref,
  getRowLabel,
  className,
  tableClassName,
  rowClassName,
  bodyClassName,
  linkClassName,
}: DataTableProps<Row>) {
  const columnCount = columns.length + (selectColumn ? 1 : 0)

  return (
    <TarjetaSistema className={cn('overflow-hidden p-0', className)}>
      <div className="overflow-x-auto">
        <table className={cn('min-w-full divide-y divide-border', tableClassName)}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectColumn && (
                <th className={cn('px-4 py-3 text-left', selectColumn.headerClassName)}>
                  {selectColumn.header}
                </th>
              )}
              {columns.map((column) => (
                <th key={column.key} className={cn('px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground', column.headerClassName)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={cn('divide-y divide-border', bodyClassName)}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-6 py-12 text-center text-muted-foreground">
                  {emptyState}
                </td>
              </tr>
            ) : rows.map((row) => {
              const href = getRowHref?.(row)
              const resolvedRowClassName = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName

              return (
                <tr key={getRowKey(row)} className={cn('transition-colors hover:bg-accent/50', href && 'group', resolvedRowClassName)}>
                  {selectColumn && (
                    <td className={cn('px-4 py-4', selectColumn.className)}>
                      {selectColumn.cell(row)}
                    </td>
                  )}
                  {columns.map((column, columnIndex) => {
                    const content = column.cell(row)

                    return (
                      <td key={column.key} className={cn('px-6 py-4', column.className)}>
                        {href && columnIndex === 0 ? (
                          <Link href={href} aria-label={getRowLabel?.(row)} className={cn('focus-ring block rounded-md font-medium text-foreground transition-colors hover:text-orange-600 group-hover:text-orange-600', linkClassName)}>
                            {content}
                          </Link>
                        ) : content}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </TarjetaSistema>
  )
}
