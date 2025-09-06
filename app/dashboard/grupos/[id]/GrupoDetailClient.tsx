"use client";
import { useState } from "react";
import { ArrowLeft, Edit, Users, MapPin, Clock, Calendar, Trash2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import GroupAuditPreview from "@/components/grupos/GroupAuditPreview.client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";

const MapModal = dynamic(() => import("@/components/modals/MapModal"), { ssr: false });
const AddMemberModal = dynamic(() => import("@/components/modals/AddMemberModal"), { ssr: false });

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
  grupo: Grupo;
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

  const obtenerIniciales = (nombre: string, apellido: string) => {
    return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  };

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
    <div className="space-y-6">
      {/* Botón de regreso */}
      <div>
        <Link
          href="/dashboard/grupos"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/50 hover:bg-orange-50/50 rounded-xl transition-all duration-200 text-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Grupos
        </Link>
      </div>

      {/* Header con información del grupo */}
      <GlassCard>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 lg:w-16 lg:h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 lg:w-8 lg:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold text-gray-800">{grupo.nombre}</h1>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline">{grupo.segmento_nombre || "Sin segmento"}</Badge>
                  <Badge variant="outline">{grupo.temporada_nombre || "Sin temporada"}</Badge>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/dashboard/grupos/${id}/edit`}>
              <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-xl transition-all duration-200 text-white shadow-lg">
                <Edit className="w-4 h-4" />
                Editar Grupo
              </button>
            </Link>
            {grupo.puede_gestionar_miembros && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 rounded-xl transition-all duration-200 text-white shadow-lg"
              >
                <Users className="w-4 h-4" />
                Añadir miembro
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Información de la Reunión */}
      <GlassCard>
        <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-4">Información de la Reunión</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Día</p>
              <p className="font-medium text-gray-800">{grupo.dia_reunion || "No especificado"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Hora</p>
              <p className="font-medium text-gray-800">{formatHora12(grupo.hora_reunion) || "No especificada"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Dirección</p>
              <button
                type="button"
                className="font-medium text-gray-800 underline hover:text-orange-600 transition-colors text-left"
                onClick={() => {
                  console.log('Abrir modal dirección', grupo.direccion);
                  setIsMapOpen(true);
                }}
                // disabled={!grupo.direccion?.lat || !grupo.direccion?.lng}
              >
                {grupo.direccion?.calle && grupo.direccion?.barrio
                  ? `${grupo.direccion.calle}, ${grupo.direccion.barrio}`
                  : grupo.direccion?.calle || grupo.direccion?.barrio || "No especificada"}
              </button>
            </div>
          </div>
        </div>
        {/* Modal del mapa */}
        <MapModal
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          lat={grupo.direccion?.lat || 0}
          lng={grupo.direccion?.lng || 0}
          calle={grupo.direccion?.calle}
          barrio={grupo.direccion?.barrio}
        />
      </GlassCard>

  {/* Líderes y Miembros */}
      <GlassCard>
        <h3 className="text-lg lg:text-xl font-bold text-gray-800 mb-6">Líderes y Miembros</h3>
        <div className="space-y-4">
          {grupo.miembros && grupo.miembros.length > 0 ? (
            grupo.miembros.map((miembro) => (
              <div key={miembro.id} className="flex items-center gap-4 p-4 bg-white/40 rounded-xl">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {obtenerIniciales(miembro.nombre, miembro.apellido)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-800 truncate">
                    {miembro.nombre} {miembro.apellido}
                  </h4>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-gray-500">
                    <span className="truncate">{miembro.email || "Sin email"}</span>
                    <span className="truncate">{miembro.telefono || "Sin teléfono"}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
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
                        className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                        onClick={() => onRemoveMember(miembro.id)}
                        disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                        title="Quitar del grupo"
                      >
                        <Trash2 className={`w-4 h-4 ${removingId === miembro.id ? 'animate-pulse' : ''}`} />
                      </button>
                    </>
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(miembro.rol)}`}>
                      {miembro.rol}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No hay miembros en este grupo</p>
            </div>
          )}
        </div>
      </GlassCard>

  {/* Auditoría: preview de últimos cambios (oculta a miembros) */}
  {grupo.puede_gestionar_miembros && grupo.rol_en_grupo?.toLowerCase() !== 'miembro' && (
        <GlassCard>
          <GroupAuditPreview grupoId={String(id)} />
        </GlassCard>
      )}

      {/* Modal para añadir miembro */}
      {grupo.puede_gestionar_miembros && (
        <AddMemberModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          grupoId={String(id)}
        />
      )}

      {/* Confirmación de borrado */}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
        title="Quitar miembro"
        message="Esta acción removerá a la persona del grupo. ¿Deseas continuar?"
        isLoading={removingId != null}
      />
    </div>
  );
}
