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
}: DataTableProps<Row>) {
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-border bg-card shadow-sm [&_[data-slot=table-container]]:overflow-visible', className)}>
      <Table className="min-w-[720px]">
        {caption && <TableCaption>{caption}</TableCaption>}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead key={column.key} className={cn('px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground', column.headerClassName)}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : rows.map((row) => {
            const href = getRowHref?.(row)

            return (
              <TableRow key={getRowKey(row)} className={href ? 'group' : undefined}>
                {columns.map((column, columnIndex) => {
                  const content = column.cell(row)

                  return (
                    <TableCell key={column.key} className={cn('px-4 py-3', column.className)}>
                      {href && columnIndex === 0 ? (
                        <Link href={href} aria-label={getRowLabel?.(row)} className="focus-ring rounded-md font-medium text-foreground group-hover:text-[var(--brand-primary)]">
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
