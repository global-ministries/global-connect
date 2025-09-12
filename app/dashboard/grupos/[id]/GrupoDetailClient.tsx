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
      {/* Botón de regreso - Posición fija en móvil */}
      <div className="fixed top-4 right-4 z-50 md:relative md:top-auto md:right-auto md:z-auto md:flex md:items-center md:justify-start md:mb-6">
        <Link
          href="/dashboard/grupos"
          className="inline-flex items-center gap-2 px-3 py-2 bg-white/80 hover:bg-orange-50/80 backdrop-blur-xl rounded-xl transition-all duration-200 text-gray-700 text-sm shadow-lg border border-white/30"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Volver a Grupos</span>
          <span className="sm:hidden">Volver</span>
        </Link>
      </div>

      {/* Tarjeta Principal del Grupo - Estilo Glassmorphism Mejorado */}
      <div className="backdrop-blur-2xl bg-white/30 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <div className="flex flex-col lg:flex-row items-center gap-8">
            {/* Avatar con efecto glassmorphism */}
            <div className="relative flex-shrink-0">
              <div className="w-32 h-32 backdrop-blur-xl bg-gradient-to-br from-blue-400/30 to-cyan-600/30 border border-white/30 rounded-full flex items-center justify-center text-blue-600 text-3xl font-bold shadow-2xl">
                <Users className="w-12 h-12" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-400 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                <div className="w-3 h-3 bg-white rounded-full"></div>
              </div>
            </div>

            {/* Información principal */}
            <div className="flex-1 text-center lg:text-left">
              <h1 className="text-4xl font-bold text-gray-800 mb-3">{grupo.nombre}</h1>
              <p className="text-gray-600 text-lg mb-4">
                {grupo.segmento_nombre || "Sin segmento"} • {grupo.temporada_nombre || "Sin temporada"}
              </p>
              
              {/* Badges con glassmorphism */}
              <div className="flex flex-wrap justify-center lg:justify-start items-center gap-3 mb-6">
                <span className="px-4 py-2 backdrop-blur-xl bg-white/40 border border-white/30 rounded-full text-sm font-medium text-blue-700 shadow-lg">
                  {grupo.dia_reunion || "Sin día"}
                </span>
                <span className="px-4 py-2 backdrop-blur-xl bg-white/40 border border-white/30 rounded-full text-sm font-medium text-purple-700 shadow-lg">
                  {formatHora12(grupo.hora_reunion) || "Sin hora"}
                </span>
                <span className="px-4 py-2 backdrop-blur-xl bg-white/40 border border-white/30 rounded-full text-sm font-medium text-green-700 shadow-lg">
                  {grupo.miembros?.length || 0} miembros
                </span>
              </div>
            </div>

            {/* Botón de acción principal (solo Desktop) */}
            <div className="flex-shrink-0 hidden lg:block">
              {grupo.puede_editar_ui && (
                <Link href={`/dashboard/grupos/${id}/asistencia`}>
                  <button className="group flex items-center gap-3 px-6 py-3 backdrop-blur-xl bg-gradient-to-r from-blue-500/80 to-cyan-600/80 hover:from-blue-500 hover:to-cyan-600 border border-white/30 rounded-2xl transition-all duration-300 text-white shadow-2xl hover:scale-105 hover:shadow-blue-500/25">
                    <Users className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                    <span className="font-medium">Tomar Asistencia</span>
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* Botones de acción secundarios - Móvil grid adaptativo (tamaños uniformes) */}
          <div className="lg:hidden mt-8 pt-6 border-t border-white/20">
            <div className="grid grid-cols-2 gap-4">
              {/* Siempre mostrar Tomar Asistencia en móvil */}
              {grupo.puede_editar_ui && (
                <Link href={`/dashboard/grupos/${id}/asistencia`}>
                  <button className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full backdrop-blur-xl bg-gradient-to-r from-blue-500/90 to-cyan-600/90 hover:from-blue-500 hover:to-cyan-600 border border-white/30 rounded-2xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                    <Users className="w-7 h-7" />
                    <span className="text-sm font-medium">Asistencia</span>
                  </button>
                </Link>
              )}
              
              {/* Editar - solo si puede editar y no es miembro */}
              {grupo.puede_editar_ui && (grupo.rol_en_grupo?.toLowerCase() !== 'miembro') && (
                <Link href={`/dashboard/grupos/${id}/edit`}>
                  <button className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full backdrop-blur-xl bg-gradient-to-r from-orange-500/90 to-orange-600/90 hover:from-orange-500 hover:to-orange-600 border border-white/30 rounded-2xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                    <Edit className="w-7 h-7" />
                    <span className="text-sm font-medium">Editar</span>
                  </button>
                </Link>
              )}
              
              {/* Historial */}
              {grupo.puede_editar_ui && (
                <Link href={`/dashboard/grupos/${id}/asistencia/historial`}>
                  <button className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full backdrop-blur-xl bg-gradient-to-r from-slate-500/90 to-slate-600/90 hover:from-slate-500 hover:to-slate-600 border border-white/30 rounded-2xl transition-all duration-200 text-white shadow-lg hover:scale-105">
                    <Calendar className="w-7 h-7" />
                    <span className="text-sm font-medium">Historial</span>
                  </button>
                </Link>
              )}
              
              {/* Añadir Miembro */}
              {grupo.puede_gestionar_miembros && (
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex flex-col items-center justify-center gap-2 p-4 h-24 w-full backdrop-blur-xl bg-gradient-to-r from-green-500/90 to-green-600/90 hover:from-green-500 hover:to-green-600 border border-white/30 rounded-2xl transition-all duration-200 text-white shadow-lg hover:scale-105"
                >
                  <Users className="w-7 h-7" />
                  <span className="text-sm font-medium">Añadir</span>
                </button>
              )}
            </div>
          </div>

          {/* Botones de acción secundarios - Desktop en línea (tamaños uniformes, alineados a la izquierda) */}
          <div className="hidden lg:flex gap-4 justify-start mt-6 pt-6 border-t border-white/20 flex-wrap">
            {grupo.puede_editar_ui && (grupo.rol_en_grupo?.toLowerCase() !== 'miembro') && (
              <Link href={`/dashboard/grupos/${id}/edit`}>
                <button className="group flex items-center justify-center gap-3 min-w-[220px] h-12 px-6 py-3 backdrop-blur-xl bg-gradient-to-r from-orange-500/80 to-orange-600/80 hover:from-orange-500 hover:to-orange-600 border border-white/30 rounded-2xl transition-all duration-300 text-white shadow-2xl hover:scale-105 hover:shadow-orange-500/25">
                  <Edit className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
                  <span className="font-medium">Editar Grupo</span>
                </button>
              </Link>
            )}
            {grupo.puede_editar_ui && (
              <Link href={`/dashboard/grupos/${id}/asistencia/historial`}>
                <button className="group flex items-center justify-center gap-3 min-w-[220px] h-12 px-6 py-3 backdrop-blur-xl bg-gradient-to-r from-slate-500/80 to-slate-600/80 hover:from-slate-500 hover:to-slate-600 border border-white/30 rounded-2xl transition-all duration-300 text-white shadow-2xl hover:scale-105 hover:shadow-slate-500/25">
                  <Calendar className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                  <span className="font-medium">Historial</span>
                </button>
              </Link>
            )}
            {/* Dirección - abre modal del mapa */}
            <button
              type="button"
              onClick={() => setIsMapOpen(true)}
              className="group flex items-center justify-center gap-3 min-w-[220px] h-12 px-6 py-3 backdrop-blur-xl bg-gradient-to-r from-emerald-500/80 to-teal-600/80 hover:from-emerald-500 hover:to-teal-600 border border-white/30 rounded-2xl transition-all duration-300 text-white shadow-2xl hover:scale-105 hover:shadow-emerald-500/25"
            >
              <MapPin className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
              <span className="font-medium">Dirección</span>
            </button>
            {grupo.puede_gestionar_miembros && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="group flex items-center justify-center gap-3 min-w-[220px] h-12 px-6 py-3 backdrop-blur-xl bg-gradient-to-r from-green-500/80 to-green-600/80 hover:from-green-500 hover:to-green-600 border border-white/30 rounded-2xl transition-all duration-300 text-white shadow-2xl hover:scale-105 hover:shadow-green-500/25"
              >
                <Users className="w-5 h-5 group-hover:scale-110 transition-transform duration-300" />
                <span className="font-medium">Añadir Miembro</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dirección - Móvil: solo dirección */}
      <div className="backdrop-blur-2xl bg-white/30 border border-white/20 rounded-3xl p-6 shadow-2xl lg:hidden">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-green-600" />
          Dirección
        </h3>
        <div className="backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl p-4 text-center">
          <MapPin className="w-8 h-8 text-green-600 mx-auto mb-3" />
          <p className="text-xs text-gray-500 mb-1">Dirección</p>
          <button
            type="button"
            className="font-semibold text-gray-800 hover:text-orange-600 transition-colors text-center underline text-sm leading-tight"
            onClick={() => {
              console.log('Abrir modal dirección', grupo.direccion);
              setIsMapOpen(true);
            }}
          >
            {grupo.direccion?.calle && grupo.direccion?.barrio
              ? `${grupo.direccion.calle}, ${grupo.direccion.barrio}`
              : grupo.direccion?.calle || grupo.direccion?.barrio || "No especificada"}
          </button>
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
      </div>

      {/* Líderes y Miembros - Estilo mejorado */}
      <div className="backdrop-blur-2xl bg-white/30 border border-white/20 rounded-3xl p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-orange-500" />
          Líderes y Miembros
        </h3>
        <div className="space-y-4">
          {grupo.miembros && grupo.miembros.length > 0 ? (
            grupo.miembros.map((miembro) => (
              <div key={miembro.id} className="backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl p-4 shadow-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 shadow-lg">
                    {obtenerIniciales(miembro.nombre, miembro.apellido)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-800 text-lg mb-1">
                      {miembro.nombre} {miembro.apellido}
                    </h4>
                    <div className="flex flex-col gap-1 text-sm text-gray-500">
                      <span className="truncate">{miembro.email || "Sin email"}</span>
                      <span className="truncate">{miembro.telefono || "Sin teléfono"}</span>
                    </div>
                  </div>
                  
                  {/* Desktop: controles en línea */}
                  <div className="hidden lg:flex flex-shrink-0 items-center gap-2">
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
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(miembro.rol)} shadow-sm`}>
                        {miembro.rol}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Móvil: controles debajo */}
                <div className="lg:hidden mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
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
                      <button
                        type="button"
                        aria-label="Quitar miembro"
                        className="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-lg transition-colors text-sm"
                        onClick={() => onRemoveMember(miembro.id)}
                        disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                        title="Quitar del grupo"
                      >
                        <Trash2 className={`w-4 h-4 ${removingId === miembro.id ? 'animate-pulse' : ''}`} />
                        Quitar
                      </button>
                    </>
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${obtenerColorRol(miembro.rol)} shadow-sm`}>
                      {miembro.rol}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="backdrop-blur-xl bg-white/30 border border-white/20 rounded-2xl p-8 text-center shadow-lg">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium mb-2">No hay miembros en este grupo</p>
              <p className="text-gray-400 text-sm">Los miembros aparecerán aquí una vez que sean agregados al grupo.</p>
            </div>
          )}
        </div>
      </div>

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
