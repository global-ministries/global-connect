'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Search, 
  Users, 
  Mail, 
  Phone, 
  Calendar,
  Filter,
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { useUsuariosConPermisos } from '@/hooks/use-usuarios-con-permisos'

const ROLES_DISPONIBLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'pastor', label: 'Pastor' },
  { value: 'director-general', label: 'Director General' },
  { value: 'director-etapa', label: 'Director de Etapa' },
  { value: 'lider', label: 'Líder' },
  { value: 'miembro', label: 'Miembro' }
]

function AlertaPermisos({ rolUsuario }: { rolUsuario?: string }) {
  const getPermisoInfo = (rol?: string) => {
    switch (rol) {
      case 'admin':
      case 'pastor':
      case 'director-general':
        return {
          tipo: 'info',
          titulo: 'Acceso Completo',
          descripcion: 'Puedes ver todos los usuarios del sistema.'
        }
      case 'director-etapa':
        return {
          tipo: 'warning',
          titulo: 'Acceso por Etapa',
          descripcion: 'Solo puedes ver usuarios de los grupos en tus etapas asignadas.'
        }
      case 'lider':
        return {
          tipo: 'warning',
          titulo: 'Acceso por Grupo',
          descripcion: 'Solo puedes ver usuarios de los grupos donde eres líder.'
        }
      case 'miembro':
        return {
          tipo: 'info',
          titulo: 'Acceso Familiar',
          descripcion: 'Solo puedes ver usuarios de tu familia y relaciones familiares.'
        }
      default:
        return {
          tipo: 'error',
          titulo: 'Sin Permisos',
          descripcion: 'No tienes permisos para ver usuarios.'
        }
    }
  }

  const info = getPermisoInfo(rolUsuario)

  return (
    <Alert className="mb-6">
      <Info className="h-4 w-4" />
      <AlertDescription>
        <strong>{info.titulo}:</strong> {info.descripcion}
      </AlertDescription>
    </Alert>
  )
}

function EstadisticasCard({ estadisticas, cargando }: { 
  estadisticas: any, 
  cargando: boolean 
}) {
  if (cargando) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!estadisticas) return null

  const stats = [
    {
      titulo: 'Total Usuarios',
      valor: estadisticas.total_usuarios,
      icono: Users,
      descripcion: 'Usuarios visibles'
    },
    {
      titulo: 'Con Email',
      valor: estadisticas.con_email,
      icono: Mail,
      descripcion: 'Tienen email registrado'
    },
    {
      titulo: 'Con Teléfono',
      valor: estadisticas.con_telefono,
      icono: Phone,
      descripcion: 'Tienen teléfono registrado'
    },
    {
      titulo: 'Registrados Hoy',
      valor: estadisticas.registrados_hoy,
      icono: Calendar,
      descripcion: 'Nuevos registros hoy'
    }
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
      {stats.map((stat, index) => {
        const Icono = stat.icono
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.titulo}
              </CardTitle>
              <Icono className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.valor}</div>
              <p className="text-xs text-muted-foreground">
                {stat.descripcion}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function FiltrosUsuarios({ 
  filtros, 
  actualizarFiltros, 
  limpiarFiltros 
}: {
  filtros: any
  actualizarFiltros: (filtros: any) => void
  limpiarFiltros: () => void
}) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5" />
          Filtros
        </CardTitle>
        <CardDescription>
          Filtra usuarios según tus permisos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Buscar por nombre, apellido, email o cédula..."
              value={filtros.busqueda}
              onChange={(e) => actualizarFiltros({ busqueda: e.target.value })}
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={filtros.con_email === null ? 'todos' : filtros.con_email ? 'con_email' : 'sin_email'}
              onValueChange={(value) => {
                const con_email = value === 'todos' ? null : value === 'con_email'
                actualizarFiltros({ con_email })
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="con_email">Con Email</SelectItem>
                <SelectItem value="sin_email">Sin Email</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filtros.con_telefono === null ? 'todos' : filtros.con_telefono ? 'con_telefono' : 'sin_telefono'}
              onValueChange={(value) => {
                const con_telefono = value === 'todos' ? null : value === 'con_telefono'
                actualizarFiltros({ con_telefono })
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="con_telefono">Con Teléfono</SelectItem>
                <SelectItem value="sin_telefono">Sin Teléfono</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              onClick={limpiarFiltros}
              className="whitespace-nowrap"
            >
              Limpiar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ROLES_DISPONIBLES.map((rol) => (
            <Badge
              key={rol.value}
              variant={filtros.roles.includes(rol.value) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => {
                const nuevosRoles = filtros.roles.includes(rol.value)
                  ? filtros.roles.filter((r: string) => r !== rol.value)
                  : [...filtros.roles, rol.value]
                actualizarFiltros({ roles: nuevosRoles })
              }}
            >
              {rol.label}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function TablaUsuarios({ 
  usuarios, 
  cargando 
}: { 
  usuarios: any[], 
  cargando: boolean 
}) {
  if (cargando) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (usuarios.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No se encontraron usuarios</h3>
          <p className="text-muted-foreground">
            Intenta ajustar los filtros o verifica tus permisos.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((usuario) => (
              <TableRow key={usuario.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">
                      {usuario.nombre} {usuario.apellido}
                    </div>
                    {usuario.cedula && (
                      <div className="text-sm text-muted-foreground">
                        C.I: {usuario.cedula}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {usuario.email && (
                      <div className="flex items-center gap-1 text-sm">
                        <Mail className="h-3 w-3" />
                        {usuario.email}
                      </div>
                    )}
                    {usuario.telefono && (
                      <div className="flex items-center gap-1 text-sm">
                        <Phone className="h-3 w-3" />
                        {usuario.telefono}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {usuario.rol_nombre_visible}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {new Date(usuario.fecha_registro).toLocaleDateString('es-ES')}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Paginacion({ 
  paginaActual, 
  totalPaginas, 
  cambiarPagina 
}: {
  paginaActual: number
  totalPaginas: number
  cambiarPagina: (pagina: number) => void
}) {
  if (totalPaginas <= 1) return null

  return (
    <div className="flex items-center justify-between mt-6">
      <div className="text-sm text-muted-foreground">
        Página {paginaActual} de {totalPaginas}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => cambiarPagina(paginaActual - 1)}
          disabled={paginaActual <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => cambiarPagina(paginaActual + 1)}
          disabled={paginaActual >= totalPaginas}
        >
          Siguiente
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function UsuariosConPermisosPage() {
  const {
    usuarios,
    estadisticas,
    cargando,
    cargandoEstadisticas,
    error,
    filtros,
    paginaActual,
    totalPaginas,
    totalUsuarios,
    actualizarFiltros,
    cambiarPagina,
    recargarDatos,
    limpiarFiltros
  } = useUsuariosConPermisos()

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">
            Sistema de usuarios con permisos por rol
          </p>
        </div>
        <Button 
          onClick={recargarDatos}
          disabled={cargando}
          variant="outline"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${cargando ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <AlertaPermisos />

      <EstadisticasCard 
        estadisticas={estadisticas} 
        cargando={cargandoEstadisticas} 
      />

      <FiltrosUsuarios
        filtros={filtros}
        actualizarFiltros={actualizarFiltros}
        limpiarFiltros={limpiarFiltros}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <TablaUsuarios 
        usuarios={usuarios} 
        cargando={cargando} 
      />

      <Paginacion
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        cambiarPagina={cambiarPagina}
      />
    </div>
  )
}
