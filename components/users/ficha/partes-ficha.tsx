/**
 * Small pieces shared by the ficha tabs (prototype
 * docs/design-system/prototipos/usuarios/03-ficha-escritorio.html: `.tarjeta`,
 * `.t-h`, `.kv`, `.secciones`).
 */
import Image from 'next/image'
import { useId, type ReactElement, type ReactNode } from 'react'

import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { cn } from '@/lib/utils'
import { fechaCorta } from '@/lib/platform/usuarios/fechas'

/** A section card with its h2 and an optional action on the right. */
export function TarjetaFicha({
  titulo,
  accion,
  ancha = false,
  className,
  children,
}: {
  readonly titulo: string
  readonly accion?: ReactNode
  /** Takes the whole row of `SeccionesFicha`. */
  readonly ancha?: boolean
  readonly className?: string
  readonly children: ReactNode
}): ReactElement {
  const id = useId()
  return (
    <TarjetaSistema
      role="region"
      aria-labelledby={id}
      className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3.5 p-4 md:px-6 md:py-5', ancha && 'col-span-full', className)}
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em] text-foreground">
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
    </TarjetaSistema>
  )
}

/** Cards side by side, each at least 26rem (prototype `.secciones`). */
export function SeccionesFicha({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-3 md:gap-4">{children}</div>
  )
}

export function NoEspecificado(): ReactElement {
  return <span className="font-normal text-muted-foreground">No especificado</span>
}

export interface Dato {
  readonly etiqueta: string
  readonly valor: ReactNode
  /** Numbers and codes: Geist Mono. */
  readonly mono?: boolean
}

/** Key/value grid (`.kv`): 2 columns, 3 from md unless `dos`. */
export function ListaDatos({ datos, dos = false }: { readonly datos: readonly Dato[]; readonly dos?: boolean }): ReactElement {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-3 gap-y-3.5', !dos && 'md:grid-cols-3')}>
      {datos.map((d) => (
        <div key={d.etiqueta} className="grid min-w-0 content-start gap-1">
          <dt className="text-[13px] text-muted-foreground">{d.etiqueta}</dt>
          <dd className={cn('text-[15px] font-medium text-foreground [overflow-wrap:anywhere]', d.mono && 'font-mono tabular-nums tracking-[-0.02em]')}>
            {d.valor === null || d.valor === undefined || d.valor === '' ? <NoEspecificado /> : d.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function iniciales(nombre: string, apellido: string): string {
  return `${nombre.trim().charAt(0)}${apellido.trim().charAt(0)}`.toUpperCase() || '?'
}

const TAMANO_AVATAR = {
  xl: { clase: 'size-16 rounded-2xl text-xl md:size-[72px] md:text-2xl', px: 72 },
  md: { clase: 'size-10 rounded-full text-sm', px: 40 },
} as const

/** Photo or initials on the brand tint (prototype `.avatar`); decorative, the name is next to it. */
export function AvatarFicha({
  nombre,
  apellido,
  fotoUrl,
  tamano = 'md',
}: {
  readonly nombre: string
  readonly apellido: string
  readonly fotoUrl: string | null
  readonly tamano?: keyof typeof TAMANO_AVATAR
}): ReactElement {
  const { clase, px } = TAMANO_AVATAR[tamano]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden border border-brand/40 bg-brand-tint font-semibold text-brand-text',
        clase,
      )}
    >
      {fotoUrl ? <Image src={fotoUrl} alt="" width={px} height={px} className="size-full object-cover" /> : iniciales(nombre, apellido)}
    </span>
  )
}

/** A neutral tag (the role, "Miembro"): never a status color (S13). */
export function EtiquetaNeutra({ children, className }: { readonly children: ReactNode; readonly className?: string }): ReactElement {
  return (
    <span className={cn('inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground', className)}>
      {children}
    </span>
  )
}

/** "17 abr 1988"; null for no date. */
export function fechaFicha(iso: string | null | undefined): string | null {
  return iso ? fechaCorta(iso.slice(0, 10)) || null : null
}

/** Whole years from an ISO birth date to today. */
export function edadDesde(iso: string | null, hoy: Date = new Date()): number | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  if (!m) return null
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  let edad = hoy.getFullYear() - anio
  if (hoy.getMonth() + 1 < mes || (hoy.getMonth() + 1 === mes && hoy.getDate() < dia)) edad -= 1
  return edad >= 0 ? edad : null
}
