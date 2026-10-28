"use client"

import { useId, useState, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, LogOut, User } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useCampus } from '@/hooks/useCampus'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useEntradasNavegacion, type EntradaMenu } from '@/components/navegacion/use-entradas-navegacion'
import { DialogoCerrarSesion, formatearRol } from '@/components/navegacion/menu-cuenta'
import { esRutaActiva } from '@/lib/navegacion/registro'
import { filasDeMas, type SeccionNavegacion } from '@/lib/navegacion/secciones'
import type { IconoNavegacion } from '@/lib/navegacion/registro'
import { HojaInferior } from '@/components/ui/hoja-inferior'
import { SelectorCampus } from '@/components/ui/selector-campus'
import { SelectorTema } from '@/components/ui/theme-toggle'
import { UserAvatar } from '@/components/ui/UserAvatar'

/**
 * The phone "Más" sheet (odd/tasks/sistema-diseno-v2.md, S9.6 and S9.8;
 * prototype design/app-shell/04-celular-mas.html): the account, the campus
 * selector, every visible entry the tabs do not open — by section, without
 * submenus — a block per group with its sub-pages (S10: Grupos de Vida,
 * Configuración, and Niños or Talleres when they are not tabs), the footer
 * links, the theme and "Cerrar sesión" (which asks first). The rows come from
 * `mas` (lib/navegacion/secciones.ts), so it lists nothing the sidebar hides.
 */

const TITULOS_SECCION: Record<SeccionNavegacion, string> = {
  general: 'General',
  ministerios: 'Ministerios',
  'dream-team': 'Dream Team',
  administracion: 'Administración',
  pie: 'Ayuda',
  cuenta: 'Cuenta',
}

// Inset grouped list (docs/design-system/mobile.md#inset-grouped-lists): 16px radius,
// hairlines inset past the 36px tile.
const CLASE_LISTA =
  'overflow-hidden rounded-2xl border border-border/60 bg-background [&>li+li]:relative [&>li+li]:before:absolute [&>li+li]:before:inset-x-0 [&>li+li]:before:left-14 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border/60'

const CLASE_FILA =
  'group flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2 text-left text-base text-foreground transition-colors duration-150 active:bg-accent focus-ring touch-manipulation aria-[current=page]:font-semibold'

// The current page's tile takes the brand tint (prototype `.m-row[aria-current] .tile`).
const CLASE_TILE =
  'grid size-[30px] shrink-0 place-items-center rounded-sm bg-muted text-foreground group-aria-[current=page]:bg-brand-tint group-aria-[current=page]:text-brand-text'

const CLASE_TITULO_GRUPO = 'px-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground'

function Chevron() {
  return <ChevronRight data-slot="chevron" aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}

/** The row for the current page: the longest href the route is on or below (/configuracion/soporte over /configuracion). */
function hrefActual(pathname: string | null, hrefs: readonly string[]): string | undefined {
  return hrefs
    .filter((href) => esRutaActiva(pathname, href))
    .sort((a, b) => b.length - a.length)[0]
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className={CLASE_TITULO_GRUPO}>{titulo}</h3>
      {children}
    </section>
  )
}

export interface HojaMasProps {
  abierta: boolean
  onCambioAbierta: (abierta: boolean) => void
  /** Where focus returns when "Cerrar sesión" is cancelled (the "Más" button). */
  enfocarAlCerrar?: RefObject<HTMLElement | null>
}

export function HojaMas({ abierta, onCambioAbierta, enfocarAlCerrar }: HojaMasProps) {
  const pathname = usePathname()
  const { usuario, roles } = useCurrentUser()
  const { mas } = useEntradasNavegacion()
  // SelectorCampus renders nothing with a single campus (and no superadmin); the header follows it.
  const { campusDisponibles, esSuperadmin, loading: cargandoCampus } = useCampus()
  const mostrarCampus = !cargandoCampus && (campusDisponibles.length > 1 || esSuperadmin)
  const [confirmarSalida, setConfirmarSalida] = useState(false)

  const cerrar = () => onCambioAbierta(false)
  const nombre = usuario ? `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() : ''
  const perfil = mas.cuenta[0]
  const actual = hrefActual(pathname, filasDeMas(mas).map((fila) => fila.href))

  const fila = (entrada: Pick<EntradaMenu, 'id' | 'label' | 'href'> & { icon?: IconoNavegacion }, iconoGrupo?: IconoNavegacion) => {
    const Icono = entrada.icon ?? iconoGrupo
    return (
      <li key={entrada.id}>
        <Link
          href={entrada.href}
          prefetch={false}
          onClick={cerrar}
          aria-current={entrada.href === actual ? 'page' : undefined}
          className={CLASE_FILA}
        >
          <span aria-hidden="true" className={CLASE_TILE}>
            {Icono && <Icono className="size-[17px]" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{entrada.label}</span>
          <Chevron />
        </Link>
      </li>
    )
  }

  return (
    <>
      <HojaInferior abierta={abierta} onCambioAbierta={onCambioAbierta} titulo="Más">
        <div className="grid gap-[22px]">
          {perfil && (
            <ul className={CLASE_LISTA}>
              <li>
                <Link
                  href={perfil.href}
                  prefetch={false}
                  onClick={cerrar}
                  aria-current={perfil.href === actual ? 'page' : undefined}
                  className={cn(CLASE_FILA, 'min-h-[68px]')}
                >
                  {usuario ? (
                    <UserAvatar photoUrl={usuario.foto_perfil_url} nombre={usuario.nombre} apellido={usuario.apellido} size="md" />
                  ) : (
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
                      <User className="size-5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{nombre || 'Tu cuenta'}</span>
                    <span className="block truncate text-[13px] font-normal text-muted-foreground">
                      {formatearRol(roles)} · Mi perfil
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            </ul>
          )}

          {mostrarCampus && (
            <Grupo titulo="Campus">
              <SelectorCampus />
            </Grupo>
          )}

          {mas.secciones.map((grupo) => (
            <Grupo key={grupo.seccion} titulo={TITULOS_SECCION[grupo.seccion]}>
              <ul className={CLASE_LISTA}>{grupo.entradas.map((entrada) => fila(entrada))}</ul>
            </Grupo>
          ))}

          {mas.subpaginas.map((bloque) => (
            <Grupo key={bloque.grupo.id} titulo={bloque.grupo.label}>
              <ul className={CLASE_LISTA}>{bloque.paginas.map((pagina) => fila(pagina, bloque.grupo.icon))}</ul>
            </Grupo>
          ))}

          {mas.pie.length > 0 && (
            <Grupo titulo={TITULOS_SECCION.pie}>
              <ul className={CLASE_LISTA}>{mas.pie.map((entrada) => fila(entrada))}</ul>
            </Grupo>
          )}

          <div className="grid gap-2">
            <span aria-hidden="true" className={CLASE_TITULO_GRUPO}>Apariencia</span>
            <SelectorTema etiqueta="Apariencia" />
          </div>

          <ul className={CLASE_LISTA}>
            <li>
              <button
                type="button"
                onClick={() => {
                  cerrar()
                  setConfirmarSalida(true)
                }}
                className={cn(CLASE_FILA, 'text-danger-text')}
              >
                <span aria-hidden="true" className="grid size-[30px] shrink-0 place-items-center rounded-sm bg-danger/10">
                  <LogOut className="size-[17px]" />
                </span>
                <span className="min-w-0 flex-1 truncate">Cerrar sesión</span>
              </button>
            </li>
          </ul>
        </div>
      </HojaInferior>

      <DialogoCerrarSesion abierto={confirmarSalida} onAbiertoChange={setConfirmarSalida} enfocarAlCerrar={enfocarAlCerrar} />
    </>
  )
}
