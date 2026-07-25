"use client"

/**
 * W17 — DT-005 — Client component for usuarios admin page.
 *
 * Shows a table of usuarios with their pastoral capabilities.
 * Only visible to users with pastoral.admin.manage capability.
 */
import React from 'react'
import Link from 'next/link'
import { Users, Settings } from 'lucide-react'
import { ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { TituloSistema } from '@/components/ui/sistema-diseno'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'

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
    <Badge variant="secondary" className="text-xs">
      {action}
    </Badge>
  )
}

function getActiveCapabilities(capabilities: CapabilityEntry[]): CapabilityEntry[] {
  return capabilities.filter((c) => !c.revoked_at)
}

export default function UsuariosClient({ usuarios, error }: UsuariosClientProps) {
  if (error) {
    return (
      <ContenedorDashboard titulo="Gestión de Usuarios" descripcion="Administrar capabilities pastoral">
        <TarjetaSistema>
          <p className="text-red-500">{error}</p>
        </TarjetaSistema>
      </ContenedorDashboard>
    )
  }

  return (
    <ContenedorDashboard titulo="Gestión de Usuarios" descripcion="Administrar capabilities pastoral">
      {usuarios.length === 0 ? (
        <TarjetaSistema>
          <p className="text-muted-foreground">No hay usuarios registrados.</p>
        </TarjetaSistema>
      ) : (
        <TarjetaSistema>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="min-w-[600px] sm:min-w-0">
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
                  {usuarios.map((usuario) => {
                    const activeCaps = getActiveCapabilities(usuario.capabilities)
                    return (
                      <TableRow key={usuario.id}>
                        <TableCell className="font-medium">{usuario.email}</TableCell>
                        <TableCell>
                          {usuario.nombre} {usuario.apellido}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {activeCaps.length === 0 ? (
                              <span className="text-xs text-muted-foreground">Sin capabilities</span>
                            ) : (
                              activeCaps.map((cap) => (
                                <CapabilityBadge key={cap.capability_key} capabilityKey={cap.capability_key} />
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/pastor/grants/${usuario.id}`}>
                            <Button variant="outline" size="sm">
                              <Settings className="h-4 w-4 mr-1" />
                              Gestionar
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TarjetaSistema>
      )}
    </ContenedorDashboard>
  )
}
