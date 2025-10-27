"use client"

import { useMemo, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import { Calendar, Edit } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { TarjetaSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno"
import { useToast } from "@/hooks/use-toast"

type Temporada = {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activa: boolean
}

export default function TemporadasListClient({
  temporadas,
  userRoles = [],
}: {
  temporadas: Temporada[]
  userRoles?: string[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([])
  const [isUpdating, setIsUpdating] = useState(false)

  const puedeGestionarEnLote = useMemo(() => 
    (userRoles || []).some(role =>
      ['admin', 'pastor', 'director-general'].includes(role)
    ), [userRoles]);

  const handleUpdateStatus = async (status: boolean) => {
    if (selectedSeasons.length === 0 || isUpdating) return;

    setIsUpdating(true);
    try {
      const res = await fetch('/api/temporadas/bulk-update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonIds: selectedSeasons, status }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar las temporadas.');
      }

      toast({ title: 'Éxito', description: `${data.count} temporadas han sido actualizadas.` });
      
      // Forzar la recarga de datos desde el servidor para reflejar los cambios
      router.refresh();
      setSelectedSeasons([]);

    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {puedeGestionarEnLote && selectedSeasons.length > 0 && (
        <TarjetaSistema className="p-4 bg-orange-50 border-orange-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{selectedSeasons.length} seleccionados</span>
            <div className="flex items-center gap-2 flex-wrap">
              <BotonSistema onClick={() => handleUpdateStatus(true)} tamaño="sm" disabled={isUpdating}>
                {isUpdating ? 'Activando...' : 'Activar'}
              </BotonSistema>
              <BotonSistema onClick={() => handleUpdateStatus(false)} tamaño="sm" variante="secundario" disabled={isUpdating}>
                {isUpdating ? 'Desactivando...' : 'Desactivar'}
              </BotonSistema>
              <BotonSistema onClick={() => setSelectedSeasons([])} tamaño="sm" variante="ghost" disabled={isUpdating}>
                Cancelar
              </BotonSistema>
            </div>
          </div>
        </TarjetaSistema>
      )}

      {/* Lista de Temporadas - Vista Desktop */}
      <div className="hidden md:block">
        <TarjetaSistema>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  {puedeGestionarEnLote && (
                    <th className="px-4 py-3">
                      <Checkbox
                        checked={temporadas.length > 0 && selectedSeasons.length === temporadas.length}
                        onCheckedChange={(checked) => {
                          setSelectedSeasons(checked ? temporadas.map(t => t.id) : [])
                        }}
                        aria-label="Seleccionar todas las temporadas"
                      />
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Inicio</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha de Fin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {temporadas && temporadas.length > 0 ? (
                  temporadas.map(temporada => (
                    <tr key={temporada.id} className={cn("hover:bg-gray-50/50 transition-colors", selectedSeasons.includes(temporada.id) && 'bg-orange-50')}>
                      {puedeGestionarEnLote && (
                        <td className="px-4 py-4">
                          <Checkbox
                            checked={selectedSeasons.includes(temporada.id)}
                            onCheckedChange={(checked) => {
                              setSelectedSeasons(prev => 
                                checked 
                                  ? [...prev, temporada.id] 
                                  : prev.filter(id => id !== temporada.id)
                              )
                            }}
                            aria-label={`Seleccionar temporada ${temporada.nombre}`}
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{temporada.nombre}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(temporada.fecha_inicio).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(temporada.fecha_fin).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BadgeSistema 
                          variante={temporada.activa ? "success" : "default"}
                          tamaño="sm"
                        >
                          {temporada.activa ? "Activa" : "Inactiva"}
                        </BadgeSistema>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/dashboard/temporadas/${temporada.id}/edit`}>
                          <BotonSistema variante="ghost" tamaño="sm">
                            <Edit className="w-4 h-4" />
                          </BotonSistema>
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={puedeGestionarEnLote ? 6 : 5} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Calendar className="w-12 h-12 text-gray-300" />
                        <div>
                          <p className="text-gray-500 font-medium">No hay temporadas registradas</p>
                          <p className="text-gray-400 text-sm">Crea tu primera temporada para comenzar</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TarjetaSistema>
      </div>

      {/* Lista de Temporadas - Vista Mobile */}
      <div className="md:hidden space-y-4">
        {temporadas && temporadas.length > 0 ? (
          temporadas.map(temporada => (
            <TarjetaSistema key={temporada.id} className={cn("p-4 relative", puedeGestionarEnLote && "pr-12", selectedSeasons.includes(temporada.id) && 'bg-orange-50 border-orange-200')}>
              {puedeGestionarEnLote && (
                <div className="absolute top-3 right-3">
                  <Checkbox
                    checked={selectedSeasons.includes(temporada.id)}
                    onCheckedChange={(checked) => {
                      setSelectedSeasons(prev => 
                        checked 
                          ? [...prev, temporada.id] 
                          : prev.filter(id => id !== temporada.id)
                      )
                    }}
                    aria-label={`Seleccionar temporada ${temporada.nombre}`}
                  />
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-900 truncate">{temporada.nombre}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <BadgeSistema 
                          variante={temporada.activa ? "success" : "default"}
                          tamaño="sm"
                        >
                          {temporada.activa ? "Activa" : "Inactiva"}
                        </BadgeSistema>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Inicio:</span>
                      <span>{new Date(temporada.fecha_inicio).toLocaleDateString('es-ES')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Fin:</span>
                      <span>{new Date(temporada.fecha_fin).toLocaleDateString('es-ES')}</span>
                    </div>
                  </div>
                </div>
                
                <div className="ml-3">
                  <Link href={`/dashboard/temporadas/${temporada.id}/edit`}>
                    <BotonSistema variante="ghost" tamaño="sm">
                      <Edit className="w-4 h-4" />
                    </BotonSistema>
                  </Link>
                </div>
              </div>
            </TarjetaSistema>
          ))
        ) : (
          <TarjetaSistema className="p-8">
            <div className="text-center">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay temporadas registradas</h3>
              <p className="text-gray-500 mb-6">Crea tu primera temporada para comenzar a organizar los períodos de tu organización</p>
            </div>
          </TarjetaSistema>
        )}
      </div>
    </div>
  )
}
