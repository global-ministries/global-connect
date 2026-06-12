import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export interface DataTableColumn<Row> {
  key: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  className?: string
  headerClassName?: string
}

interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  getRowKey: (row: Row) => string
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
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-border bg-card shadow-sm [&_[data-slot=table-container]]:overflow-visible', className)}>
      <Table className={cn('min-w-[720px]', tableClassName)}>
        {caption && <TableCaption>{caption}</TableCaption>}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn('px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground', column.headerClassName)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className={bodyClassName}>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="px-6 py-12 text-center text-muted-foreground">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : rows.map((row) => {
            const href = getRowHref?.(row)
            const resolvedRowClassName = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName

            return (
              <TableRow key={getRowKey(row)} className={cn('hover:bg-accent/50', href && 'group', resolvedRowClassName)}>
                {columns.map((column, columnIndex) => {
                  const content = column.cell(row)

                  return (
                    <TableCell key={column.key} className={cn('px-6 py-4', column.className)}>
                      {href && columnIndex === 0 ? (
                        <Link href={href} aria-label={getRowLabel?.(row)} className={cn('focus-ring block rounded-md font-medium text-foreground transition-colors group-hover:text-orange-600', linkClassName)}>
                          {content}
                        </Link>
                      ) : content}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
