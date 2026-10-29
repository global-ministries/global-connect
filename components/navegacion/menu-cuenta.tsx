"use client"

import { useId, useRef, useState, type RefObject } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, User } from 'lucide-react'

import { cn } from '@/lib/utils'
import { logout } from '@/lib/actions/auth.actions'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useCredencialesNavegacion } from '@/components/navegacion/use-entradas-navegacion'
import { claseEntradaSidebar } from '@/components/navegacion/estilos-navegacion'
import { PanelFlotante } from '@/components/navegacion/panel-flotante-riel'
import { entradasDeSecciones, filtrarVisibles } from '@/lib/navegacion/registro'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import { SelectorTema } from '@/components/ui/theme-toggle'
import { UserAvatar } from '@/components/ui/UserAvatar'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * The account menu of the app shell (odd/tasks/sistema-diseno-v2.md, S9.4;
 * prototype design/app-shell, `#cuenta`): the only place for the theme, the
 * profile link and signing out on desktop and tablet. The phone "Más" sheet
 * reuses `SelectorTema` and `DialogoCerrarSesion`.
 */

const NOMBRES_ROL: Record<string, string> = {
  admin: 'Administrador',
  pastor: 'Pastor',
  'director-general': 'Director general',
  'director-etapa': 'Director de etapa',
  lider: 'Líder',
  coordinador: 'Coordinador',
  voluntario: 'Voluntario',
  miembro: 'Miembro',
}

/** The first role as a readable name ("Administrador"); "Usuario" without roles. */
export function formatearRol(roles: readonly string[]): string {
  const rol = roles[0]
  if (!rol) return 'Usuario'
  return NOMBRES_ROL[rol] ?? rol.charAt(0).toUpperCase() + rol.slice(1)
}

export interface DialogoCerrarSesionProps {
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  /** Where focus goes when the dialog closes without signing out (the button that led here). */
  readonly enfocarAlCerrar?: RefObject<HTMLElement | null>
}

/** "¿Cerrar sesión?": signing out always asks first. */
export function DialogoCerrarSesion({ abierto, onAbiertoChange, enfocarAlCerrar }: DialogoCerrarSesionProps) {
  const router = useRouter()
  const [saliendo, setSaliendo] = useState(false)

  const cerrarSesion = async () => {
    setSaliendo(true)
    try {
      await logout()
    } catch (error) {
      console.error('Error durante logout:', error)
      router.push('/')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="rounded-2xl sm:max-w-[400px]"
        onCloseAutoFocus={(evento) => {
          if (!enfocarAlCerrar?.current) return
          evento.preventDefault()
          enfocarAlCerrar.current.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>¿Cerrar sesión?</DialogTitle>
          <DialogDescription>Vas a salir de Global Connect en este dispositivo.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <BotonSistema variante="outline" disabled={saliendo}>
              Cancelar
            </BotonSistema>
          </DialogClose>
          <BotonSistema variante="peligro" cargando={saliendo} disabled={saliendo} onClick={cerrarSesion}>
            Cerrar sesión
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The avatar button and its menu: identity, Tema, Mi perfil and Cerrar sesión. */
export function MenuCuenta({ className }: { readonly className?: string }) {
  const { usuario, roles, loading } = useCurrentUser()
  const credenciales = useCredencialesNavegacion()
  const [abierto, setAbierto] = useState(false)
  const [confirmarSalida, setConfirmarSalida] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)
  const idPanel = useId()
  const idNombre = useId()

  const nombre = usuario ? `${usuario.nombre ?? ''} ${usuario.apellido ?? ''}`.trim() : ''
  // The account links come from the registry ('cuenta'), like every other entry.
  const enlaces = filtrarVisibles(entradasDeSecciones('cuenta'), credenciales)

  return (
    <div className={cn('relative', className)}>
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-label={nombre ? `Tu cuenta: ${nombre}` : 'Tu cuenta'}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={idPanel}
        className="focus-ring group inline-flex size-11 shrink-0 items-center justify-center rounded-full touch-manipulation"
      >
        {loading ? (
          <span className="size-8 animate-pulse rounded-full bg-muted" />
        ) : usuario ? (
          <span
            className={cn(
              'rounded-full ring-1 ring-brand/40 transition-shadow group-hover:ring-brand',
              abierto && 'ring-2 ring-brand',
            )}
          >
            <UserAvatar photoUrl={usuario.foto_perfil_url} nombre={usuario.nombre} apellido={usuario.apellido} size="sm" />
          </span>
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-muted">
            <User aria-hidden="true" className="size-4 text-muted-foreground" />
          </span>
        )}
      </button>

      <PanelFlotante
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        ancla={botonRef}
        id={idPanel}
        etiquetadoPor={idNombre}
        className="w-[300px] p-0"
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          {usuario && (
            <UserAvatar photoUrl={usuario.foto_perfil_url} nombre={usuario.nombre} apellido={usuario.apellido} size="md" />
          )}
          <div className="min-w-0">
            <p id={idNombre} className="truncate text-[15px] font-semibold">
              {nombre || 'Tu cuenta'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{formatearRol(roles)}</p>
            {usuario?.email && <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>}
          </div>
        </div>

        <div className="grid gap-2 border-b border-border p-4">
          <span aria-hidden="true" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Tema
          </span>
          <SelectorTema etiqueta="Tema" />
        </div>

        <ul className="grid gap-0.5 p-1.5">
          {enlaces.map((enlace) => {
            const Icono = enlace.icon
            return (
              <li key={enlace.id}>
                <Link
                  href={enlace.href}
                  prefetch={false}
                  onClick={() => setAbierto(false)}
                  className={claseEntradaSidebar(false, true)}
                >
                  <Icono aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
                  {enlace.label}
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                setAbierto(false)
                setConfirmarSalida(true)
              }}
              className={cn(claseEntradaSidebar(false), 'text-danger-text hover:bg-danger/10 hover:text-danger-text')}
            >
              <LogOut aria-hidden="true" className="size-[18px] shrink-0" />
              Cerrar sesión
            </button>
          </li>
        </ul>
      </PanelFlotante>

      <DialogoCerrarSesion abierto={confirmarSalida} onAbiertoChange={setConfirmarSalida} enfocarAlCerrar={botonRef} />
    </div>
  )
}
