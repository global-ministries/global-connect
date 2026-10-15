"use client"

/**
 * W17 — DT-005 — Client component for usuarios admin page.
 *
 * Shows a table of usuarios with their pastoral capabilities.
 * Only visible to users with pastoral.admin.manage capability.
 */
import React from 'react'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { BadgeSistema, BotonSistema, PaginaSistema, TarjetaSistema } from '@/components/ui/sistema-diseno'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CLASE_ENLACE_BOTON, CLASE_ITEM_LISTA } from '@/components/pastoral/estilos'
import { cn } from '@/lib/utils'

type CapabilityEntry = {
  readonly capability_key: string
  readonly granted_at: string | null
  readonly revoked_at: string | null
}

type UsuarioResponse = {
  readonly id: string
  readonly email: string | null
  readonly nombre: string
  readonly apellido: string
  readonly auth_id: string | null
  readonly capabilities: CapabilityEntry[]
}

interface UsuariosClientProps {
  readonly usuarios: UsuarioResponse[]
  readonly error: string | null
}

function CapabilityBadge({ capabilityKey }: { capabilityKey: string }) {
  // Parse capability key for display
  const parts = capabilityKey.split('.')
  const action = parts[parts.length - 1]?.replace(/_/g, ' ') ?? capabilityKey

  return (
    <BadgeSistema tamaño="sm">
      {action}
    </BadgeSistema>
  )
}

function getActiveCapabilities(capabilities: CapabilityEntry[]): CapabilityEntry[] {
  return capabilities.filter((c) => !c.revoked_at)
}

function Capabilities({ capabilities }: { capabilities: CapabilityEntry[] }) {
  const activeCaps = getActiveCapabilities(capabilities)
  return (
    <div className="flex flex-wrap gap-1">
      {activeCaps.length === 0 ? (
        <span className="text-xs text-muted-foreground">Sin capabilities</span>
      ) : (
        activeCaps.map((cap) => (
          <CapabilityBadge key={cap.capability_key} capabilityKey={cap.capability_key} />
        ))
      )}
    </div>
  )
}

function EnlaceGestionar({ usuarioId, className }: { usuarioId: string; className?: string }) {
  return (
    <Link href={`/pastor/grants/${usuarioId}`} className={cn(CLASE_ENLACE_BOTON, className)}>
      <BotonSistema tabIndex={-1} variante="outline" tamaño="sm" icono={Settings} className="w-full">
        Gestionar
      </BotonSistema>
    </Link>
  )
}

export default function UsuariosClient({ usuarios, error }: UsuariosClientProps) {
  if (error) {
    return (
      <PaginaSistema titulo="Gestión de Usuarios" descripcion="Administrar capabilities pastoral">
        <TarjetaSistema>
          <p className="text-danger" role="alert">{error}</p>
        </TarjetaSistema>
      </PaginaSistema>
    )
  }

  return (
    <PaginaSistema titulo="Gestión de Usuarios" descripcion="Administrar capabilities pastoral">
      {usuarios.length === 0 ? (
        <TarjetaSistema>
          <p className="text-muted-foreground">No hay usuarios registrados.</p>
        </TarjetaSistema>
      ) : (
        <>
          {/* Mobile: one card per usuario, no horizontal scroll at 360px. */}
          <ul className="space-y-3 md:hidden">
            {usuarios.map((usuario) => (
              <li key={usuario.id} className={cn(CLASE_ITEM_LISTA, 'space-y-3')}>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {usuario.nombre} {usuario.apellido}
                  </p>
                  <p className="break-all text-sm text-muted-foreground">{usuario.email}</p>
                </div>
                <Capabilities capabilities={usuario.capabilities} />
                <EnlaceGestionar usuarioId={usuario.id} className="w-full" />
              </li>
            ))}
          </ul>

          {/* Desktop: table. */}
          <TarjetaSistema className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell className="whitespace-normal break-all font-medium">{usuario.email}</TableCell>
                    <TableCell>
                      {usuario.nombre} {usuario.apellido}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Capabilities capabilities={usuario.capabilities} />
                    </TableCell>
                    <TableCell className="text-right">
                      <EnlaceGestionar usuarioId={usuario.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TarjetaSistema>
        </>
      )}
    </PaginaSistema>
  )
}
