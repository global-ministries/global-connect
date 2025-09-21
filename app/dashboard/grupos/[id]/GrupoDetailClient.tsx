"use client";
import { useState } from "react";
import { ArrowLeft, Edit, Users, MapPin, Clock, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import GroupAuditPreview from "@/components/grupos/GroupAuditPreview.client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";
import { ContenedorDashboard, TarjetaSistema, BotonSistema, BadgeSistema } from "@/components/ui/sistema-diseno";
import { UserAvatar } from "@/components/ui/UserAvatar";

const MapModal = dynamic(() => import("@/components/modals/MapModal"), { 
  ssr: false,
  loading: () => <div>Cargando mapa...</div>
});
const AddMemberModal = dynamic(() => import("@/components/modals/AddMemberModal"), { 
  ssr: false,
  loading: () => <div>Cargando...</div>
});

import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-white/30 border border-white/50 rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
      {children}
    </div>
  );
}

interface Direccion {
  calle?: string;
  barrio?: string;
  lat?: number;
  lng?: number;
}

interface Miembro {
  id: string | number;
  nombre: string;
  apellido: string;
  email?: string;
  telefono?: string;
  rol?: string;
  foto_perfil_url?: string | null;
}

interface Grupo {
  nombre: string;
  segmento_nombre?: string;
  temporada_nombre?: string;
  dia_reunion?: string;
  hora_reunion?: string;
  direccion?: Direccion;
  miembros?: Miembro[];
  puede_gestionar_miembros?: boolean;
  rol_en_grupo?: string | null;
}

interface GrupoDetailClientProps {
  grupo: Grupo & { puede_editar_ui?: boolean };
  id: string | number;
}

export default function GrupoDetailClient({ grupo, id }: GrupoDetailClientProps) {
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | number | null>(null);
  const [removingId, setRemovingId] = useState<string | number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | number | null>(null);
  const router = useRouter();


  const obtenerColorRol = (rol: string | undefined) => {
    switch (rol?.toLowerCase()) {
      case 'líder':
        return 'bg-orange-100 text-orange-700';
      case 'colíder':
        return 'bg-blue-100 text-blue-700';
      case 'miembro':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  function formatHora12(h?: string) {
    if (!h) return "";
    const trimmed = h.trim();
    // HH:MM or HH:MM:SS with optional AM/PM
    const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i);
    if (m) {
      // ya podría venir en 12h, normaliza
      const hh = parseInt(m[1], 10);
      const mm = m[2];
      const ap = m[4];
      if (ap) return `${hh.toString().padStart(2, '0')}:${mm} ${ap.toUpperCase()}`;
      // asumir 24h -> convertir
      let hour = hh;
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      if (hour === 0) hour = 12;
      return `${hour.toString().padStart(2, '0')}:${mm} ${ampm}`;
    }
    // si viniera como "7 PM" intenta rescatar
    const m2 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (m2) {
      const hh = parseInt(m2[1], 10);
      const mm = m2[2] || '00';
      const ap = m2[3].toUpperCase();
      return `${hh.toString().padStart(2, '0')}:${mm} ${ap}`;
    }
    return trimmed;
  }

  const onChangeRole = async (miembroId: string | number, newRole: "Líder" | "Colíder" | "Miembro") => {
    try {
      setRoleUpdatingId(miembroId);
      const res = await fetch(`/api/grupos/${encodeURIComponent(String(id))}/miembros/${encodeURIComponent(String(miembroId))}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol: newRole })
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Rol actualizado');
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo actualizar el rol');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const onRemoveMember = async (miembroId: string | number) => {
    setPendingRemovalId(miembroId);
    setConfirmOpen(true);
  };

  const confirmRemove = async () => {
    if (pendingRemovalId == null) return;
    try {
      setRemovingId(pendingRemovalId);
      const res = await fetch(`/api/grupos/${encodeURIComponent(String(id))}/miembros/${encodeURIComponent(String(pendingRemovalId))}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Miembro eliminado');
      setConfirmOpen(false);
      setPendingRemovalId(null);
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar el miembro');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ContenedorDashboard
      titulo={grupo.nombre}
      subtitulo={`${grupo.segmento_nombre} • ${grupo.temporada_nombre}`}
      accionPrincipal={
        <Link href="/dashboard/grupos">
          <BotonSistema 
            variante="ghost" 
            tamaño="sm"
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </BotonSistema>
        </Link>
      }
    >

      {/* Tarjeta Principal del Grupo */}
      <TarjetaSistema className="p-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Imagen horizontal placeholder */}
          <div className="w-full md:w-48 h-32 bg-gradient-to-r from-orange-400 to-orange-500 rounded-xl flex-shrink-0 flex items-center justify-center">
            <Users className="w-12 h-12 text-white" />
          </div>

          {/* Información principal */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <BadgeSistema variante="default" tamaño="sm">
                {grupo.dia_reunion || "Sin día"}
              </BadgeSistema>
              <BadgeSistema variante="default" tamaño="sm">
                {formatHora12(grupo.hora_reunion) || "Sin hora"}
              </BadgeSistema>
              <BadgeSistema variante="success" tamaño="sm">
                {grupo.miembros?.length || 0} miembros
              </BadgeSistema>
            </div>
            
            {/* Dirección */}
            {grupo.direccion && (grupo.direccion.calle || grupo.direccion.barrio) && (
              <div className="flex items-center gap-2 text-gray-600 mb-4">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <button
                  onClick={() => setIsMapOpen(true)}
                  className="text-sm hover:text-orange-600 transition-colors underline"
                >
                  {grupo.direccion.calle && grupo.direccion.barrio
                    ? `${grupo.direccion.calle}, ${grupo.direccion.barrio}`
                    : grupo.direccion.calle || grupo.direccion.barrio}
                </button>
              </div>
            )}

            {/* Botones de acción - Grid responsive para alineación perfecta */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full">
              {grupo.puede_editar_ui && (
                <Link href={`/dashboard/grupos/${id}/asistencia`} className="col-span-2 sm:col-span-1">
                  <BotonSistema variante="primario" className="w-full h-10 text-sm">
                    <Users className="w-4 h-4" />
                    <span className="ml-2">Asistencia</span>
                  </BotonSistema>
                </Link>
              )}
              
              {grupo.puede_editar_ui && (grupo.rol_en_grupo?.toLowerCase() !== 'miembro') && (
                <Link href={`/dashboard/grupos/${id}/edit`}>
                  <BotonSistema variante="outline" className="w-full h-10 text-sm">
                    <Edit className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Editar</span>
                    <span className="ml-2 sm:hidden">Editar</span>
                  </BotonSistema>
                </Link>
              )}
              
              {grupo.puede_editar_ui && (
                <Link href={`/dashboard/grupos/${id}/auditoria`}>
                  <BotonSistema variante="outline" className="w-full h-10 text-sm">
                    <Calendar className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Auditoría</span>
                    <span className="ml-2 sm:hidden">Auditoría</span>
                  </BotonSistema>
                </Link>
              )}
              
              <BotonSistema 
                variante="outline" 
                onClick={() => setIsMapOpen(true)}
                className="w-full h-10 text-sm"
              >
                <MapPin className="w-4 h-4" />
                <span className="ml-2 hidden sm:inline">Dirección</span>
                <span className="ml-2 sm:hidden">Mapa</span>
              </BotonSistema>
              
              {grupo.puede_gestionar_miembros && (
                <BotonSistema 
                  variante="outline" 
                  onClick={() => setIsAddModalOpen(true)}
                  className="w-full h-10 text-sm"
                >
                  <Users className="w-4 h-4" />
                  <span className="ml-2 hidden sm:inline">Añadir</span>
                  <span className="ml-2 sm:hidden">Añadir</span>
                </BotonSistema>
              )}
            </div>
          </div>
        </div>
      </TarjetaSistema>


      {/* Líderes y Miembros */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-orange-500" />
          Líderes y Miembros
        </h3>
        <div className="space-y-4">
          {grupo.miembros && grupo.miembros.length > 0 ? (
            grupo.miembros.map((miembro) => (
              <div key={miembro.id} className="bg-white/50 border border-gray-200 rounded-xl p-4">
                {/* Desktop: layout horizontal alineado */}
                <div className="hidden lg:flex items-center gap-4">
                  <UserAvatar
                    photoUrl={miembro.foto_perfil_url}
                    nombre={miembro.nombre}
                    apellido={miembro.apellido}
                    size="lg"
                    className="flex-shrink-0"
                  />
                  
                  {/* Información en columnas alineadas */}
                  <div className="flex-1 grid grid-cols-3 gap-4 items-center">
                    <div>
                      <Link 
                        href={`/dashboard/users/${miembro.id}`}
                        className="font-semibold text-gray-800 text-lg hover:text-orange-600 transition-colors cursor-pointer"
                      >
                        {miembro.nombre} {miembro.apellido}
                      </Link>
                    </div>
                    <div className="text-sm text-gray-500 truncate">
                      {miembro.email || "Sin email"}
                    </div>
                    <div className="text-sm text-gray-500 truncate">
                      {miembro.telefono || "Sin teléfono"}
                    </div>
                  </div>
                  
                  {/* Controles */}
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {grupo.puede_gestionar_miembros ? (
                      <>
                        <Select
                          defaultValue={(miembro.rol as any) || 'Miembro'}
                          onValueChange={(v) => onChangeRole(miembro.id, v as any)}
                          disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                        >
                          <SelectTrigger className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Líder">Líder</SelectItem>
                            <SelectItem value="Colíder">Colíder</SelectItem>
                            <SelectItem value="Miembro">Miembro</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          aria-label="Quitar miembro"
                          className="p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                          onClick={() => onRemoveMember(miembro.id)}
                          disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                          title="Quitar del grupo"
                        >
                          <Trash2 className={`w-4 h-4 ${removingId === miembro.id ? 'animate-pulse' : ''}`} />
                        </button>
                      </>
                    ) : (
                      <BadgeSistema variante="default" tamaño="sm">
                        {miembro.rol}
                      </BadgeSistema>
                    )}
                  </div>
                </div>

                {/* Móvil: layout vertical como estaba */}
                <div className="lg:hidden flex items-center gap-4">
                  <UserAvatar
                    photoUrl={miembro.foto_perfil_url}
                    nombre={miembro.nombre}
                    apellido={miembro.apellido}
                    size="lg"
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <Link 
                      href={`/dashboard/users/${miembro.id}`}
                      className="font-semibold text-gray-800 text-lg hover:text-orange-600 transition-colors cursor-pointer block mb-1"
                    >
                      {miembro.nombre} {miembro.apellido}
                    </Link>
                    <div className="flex flex-col gap-1 text-sm text-gray-500">
                      <span className="truncate">{miembro.email || "Sin email"}</span>
                      <span className="truncate">{miembro.telefono || "Sin teléfono"}</span>
                    </div>
                  </div>
                </div>
                
                {/* Móvil: controles debajo */}
                <div className="lg:hidden mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                  {grupo.puede_gestionar_miembros ? (
                    <>
                      <Select
                        defaultValue={(miembro.rol as any) || 'Miembro'}
                        onValueChange={(v) => onChangeRole(miembro.id, v as any)}
                        disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Líder">Líder</SelectItem>
                          <SelectItem value="Colíder">Colíder</SelectItem>
                          <SelectItem value="Miembro">Miembro</SelectItem>
                        </SelectContent>
                      </Select>
                      <BotonSistema
                        variante="outline"
                        tamaño="sm"
                        onClick={() => onRemoveMember(miembro.id)}
                        disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className={`w-4 h-4 ${removingId === miembro.id ? 'animate-pulse' : ''}`} />
                        <span className="ml-1">Quitar</span>
                      </BotonSistema>
                    </>
                  ) : (
                    <BadgeSistema variante="default" tamaño="sm">
                      {miembro.rol}
                    </BadgeSistema>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-8 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium mb-2">No hay miembros en este grupo</p>
              <p className="text-gray-400 text-sm">Los miembros aparecerán aquí una vez que sean agregados al grupo.</p>
            </div>
          )}
        </div>
      </TarjetaSistema>

  {/* Auditoría: preview de últimos cambios (visible si no es rol "miembro") */}
  {(grupo.rol_en_grupo == null || grupo.rol_en_grupo?.toLowerCase() !== 'miembro') && (
        <TarjetaSistema>
          <GroupAuditPreview grupoId={String(id)} />
        </TarjetaSistema>
      )}

      {/* Modal para añadir miembro */}
      {grupo.puede_gestionar_miembros && (
        <AddMemberModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          grupoId={String(id)}
          segmentoNombre={grupo.segmento_nombre}
        />
      )}

      {/* Modal del mapa */}
      <MapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        lat={grupo.direccion?.lat || 0}
        lng={grupo.direccion?.lng || 0}
        calle={grupo.direccion?.calle}
        barrio={grupo.direccion?.barrio}
      />

      {/* Confirmación de borrado */}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
        title="Quitar miembro"
        message="Esta acción removerá a la persona del grupo. ¿Deseas continuar?"
        isLoading={removingId != null}
      />
    </ContenedorDashboard>
  );
}
