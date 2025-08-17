"use client"

import { useState } from "react"
import { X, Filter as FilterIcon, ChevronDown } from "lucide-react"
import { Button } from "./button"
import { Badge } from "./badge"

export interface FiltrosUsuarios {
  roles: string[]
  conEmail: boolean | null
  conTelefono: boolean | null
  estado: string[]
}

interface FiltrosUsuariosProps {
  filtros: FiltrosUsuarios
  onFiltrosChange: (filtros: FiltrosUsuarios) => void
  rolesDisponibles: { nombre_interno: string; nombre_visible: string }[]
  onLimpiarFiltros: () => void
}

export function FiltrosUsuarios({
  filtros,
  onFiltrosChange,
  rolesDisponibles,
  onLimpiarFiltros,
}: FiltrosUsuariosProps) {
  const [isOpen, setIsOpen] = useState(false)

  const toggleRol = (rolInterno: string) => {
    const nuevosRoles = filtros.roles.includes(rolInterno)
      ? filtros.roles.filter(r => r !== rolInterno)
      : [...filtros.roles, rolInterno]
    
    onFiltrosChange({ ...filtros, roles: nuevosRoles })
  }

  const toggleConEmail = () => {
    let nuevoValor: boolean | null
    if (filtros.conEmail === null) nuevoValor = true
    else if (filtros.conEmail === true) nuevoValor = false
    else nuevoValor = null
    
    onFiltrosChange({ ...filtros, conEmail: nuevoValor })
  }

  const toggleConTelefono = () => {
    let nuevoValor: boolean | null
    if (filtros.conTelefono === null) nuevoValor = true
    else if (filtros.conTelefono === true) nuevoValor = false
    else nuevoValor = null
    
    onFiltrosChange({ ...filtros, conTelefono: nuevoValor })
  }

  const toggleEstado = (estado: string) => {
    const nuevosEstados = filtros.estado.includes(estado)
      ? filtros.estado.filter(e => e !== estado)
      : [...filtros.estado, estado]
    
    onFiltrosChange({ ...filtros, estado: nuevosEstados })
  }

  const tieneFiltrosActivos = () => {
    return filtros.roles.length > 0 || 
           filtros.conEmail !== null || 
           filtros.conTelefono !== null || 
           filtros.estado.length > 0
  }

  const obtenerTextoFiltroEmail = () => {
    if (filtros.conEmail === true) return "Con email"
    if (filtros.conEmail === false) return "Sin email"
    return "Email"
  }

  const obtenerTextoFiltroTelefono = () => {
    if (filtros.conTelefono === true) return "Con teléfono"
    if (filtros.conTelefono === false) return "Sin teléfono"
    return "Teléfono"
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
      >
        <FilterIcon className="w-4 h-4" />
        Filtros
        {tieneFiltrosActivos() && (
          <Badge variant="secondary" className="ml-1">
            {filtros.roles.length + 
             (filtros.conEmail !== null ? 1 : 0) + 
             (filtros.conTelefono !== null ? 1 : 0) + 
             filtros.estado.length}
          </Badge>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 backdrop-blur-2xl">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">Filtros</h3>
              {tieneFiltrosActivos() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLimpiarFiltros}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Limpiar
                </Button>
              )}
            </div>

            {/* Filtro por Roles */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Roles</h4>
              <div className="flex flex-wrap gap-2">
                {rolesDisponibles.map((rol) => (
                  <Button
                    key={rol.nombre_interno}
                    variant={filtros.roles.includes(rol.nombre_interno) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleRol(rol.nombre_interno)}
                    className="text-xs"
                  >
                    {rol.nombre_visible}
                  </Button>
                ))}
              </div>
            </div>

            {/* Filtro por Email */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Estado del Email</h4>
              <div className="flex gap-2">
                <Button
                  variant={filtros.conEmail === true ? "default" : "outline"}
                  size="sm"
                  onClick={toggleConEmail}
                  className="text-xs"
                >
                  Con email
                </Button>
                <Button
                  variant={filtros.conEmail === false ? "default" : "outline"}
                  size="sm"
                  onClick={toggleConEmail}
                  className="text-xs"
                >
                  Sin email
                </Button>
              </div>
            </div>

            {/* Filtro por Teléfono */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Estado del Teléfono</h4>
              <div className="flex gap-2">
                <Button
                  variant={filtros.conTelefono === true ? "default" : "outline"}
                  size="sm"
                  onClick={toggleConTelefono}
                  className="text-xs"
                >
                  Con teléfono
                </Button>
                <Button
                  variant={filtros.conTelefono === false ? "default" : "outline"}
                  size="sm"
                  onClick={toggleConTelefono}
                  className="text-xs"
                >
                  Sin teléfono
                </Button>
              </div>
            </div>

            {/* Filtro por Estado */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Estado del Usuario</h4>
              <div className="flex gap-2">
                <Button
                  variant={filtros.estado.includes('activo') ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEstado('activo')}
                  className="text-xs"
                >
                  Activo
                </Button>
                <Button
                  variant={filtros.estado.includes('inactivo') ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleEstado('inactivo')}
                  className="text-xs"
                >
                  Inactivo
                </Button>
              </div>
            </div>

            {/* Filtros Activos */}
            {tieneFiltrosActivos() && (
              <div className="pt-3 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Filtros Activos</h4>
                <div className="flex flex-wrap gap-2">
                  {filtros.roles.map((rol) => {
                    const rolInfo = rolesDisponibles.find(r => r.nombre_interno === rol)
                    return (
                      <Badge
                        key={rol}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {rolInfo?.nombre_visible || rol}
                        <button
                          onClick={() => toggleRol(rol)}
                          className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    )
                  })}
                  
                  {filtros.conEmail !== null && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {obtenerTextoFiltroEmail()}
                      <button
                        onClick={toggleConEmail}
                        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  
                  {filtros.conTelefono !== null && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {obtenerTextoFiltroTelefono()}
                      <button
                        onClick={toggleConTelefono}
                        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  )}
                  
                  {filtros.estado.map((estado) => (
                    <Badge
                      key={estado}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {estado === 'activo' ? 'Activo' : 'Inactivo'}
                      <button
                        onClick={() => toggleEstado(estado)}
                        className="ml-1 hover:bg-gray-300 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
