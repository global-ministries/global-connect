"use client";
import { useState } from "react";
import { Edit, Users, MapPin, Trash2, Camera, History, UserPlus, Navigation } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import GroupAuditPreview from "@/components/grupos/GroupAuditPreview.client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { crearSolicitudGrupo } from "@/lib/actions/solicitudes-grupo.actions";
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
const GroupPDFExportButton = dynamic(() => import("@/components/grupos/GroupPDFExportButton"), {
  ssr: false,
  loading: () => <div className="w-full h-10 bg-muted animate-pulse rounded-lg"></div>
});

import { ReactNode } from "react";

function GlassCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`backdrop-blur-2xl bg-card/30 border border-border rounded-3xl p-6 lg:p-8 shadow-2xl ${className}`}>
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
  casa_anfitriona_info?: {
    nombre_lugar?: string;
    anfitrion_nombre?: string;
    co_anfitrion_nombre?: string;
    calle?: string;
    barrio?: string;
    latitud?: number;
    longitud?: number;
  } | null;
  // Permisos de eliminación de miembros
  rol_minimo_eliminar_miembro?: string;
  roles_sistema_usuario?: string[];
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
  const [confirmRequestOpen, setConfirmRequestOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | number | null>(null);
  const [pendingRequestName, setPendingRequestName] = useState('');
  const [requestingId, setRequestingId] = useState<string | number | null>(null);
  const router = useRouter();
  const toast = useNotificaciones();

  // Jerarquía de roles del sistema (mayor índice = más privilegios)
  const JERARQUIA_ROLES: Record<string, number> = {
    'miembro': 0, 'lider': 1, 'director-etapa': 2,
    'director-general': 3, 'pastor': 4, 'admin': 5,
  };
  const rolMinimoConfig = grupo.rol_minimo_eliminar_miembro ?? 'director-etapa';
  const nivelMinimo = JERARQUIA_ROLES[rolMinimoConfig] ?? 2;
  const nivelUsuario = Math.max(
    ...(grupo.roles_sistema_usuario ?? []).map(r => JERARQUIA_ROLES[r] ?? 0), 0
  );
  /** true si el usuario puede eliminar directamente (sin solicitud) */
  const puedeEliminarDirecto = nivelUsuario >= nivelMinimo;
  /** true si puede al menos enviar solicitud (es director pero no alcanza el nivel) */
  const puedeEnviarSolicitud = !puedeEliminarDirecto && nivelUsuario >= JERARQUIA_ROLES['director-etapa'];
  const obtenerColorRol = (rol: string | undefined) => {
    switch (rol?.toLowerCase()) {
      case 'líder':
        return 'bg-orange-100 text-orange-700';
      case 'colíder':
        return 'bg-blue-100 text-blue-700';
      case 'miembro':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error' }));
        throw new Error(data.error || 'No se pudo actualizar el rol');
      }
      const data = await res.json();
      if (data.modo === 'solicitud') {
        toast.success('Solicitud de cambio de rol creada — pendiente de aprobación');
      } else {
        toast.success('Rol actualizado');
      }
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el rol');
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Error' }));
        throw new Error(data.error || 'No se pudo eliminar el miembro');
      }
      const data = await res.json();
      if (data.modo === 'solicitud') {
        toast.success('Solicitud de egreso creada — pendiente de aprobación');
      } else {
        toast.success('Miembro eliminado');
      }
      setConfirmOpen(false);
      setPendingRemovalId(null);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el miembro');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <ContenedorDashboard
      titulo={grupo.nombre}
      subtitulo={`${grupo.segmento_nombre || ''} ${grupo.temporada_nombre ? `• ${grupo.temporada_nombre}` : ''}`}
      botonRegreso={{ href: '/grupos-vida', texto: 'Volver' }}
    >

      {/* Tarjeta Principal — Header del Grupo */}
      <TarjetaSistema className="p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {/* Foto del grupo / Upload zone */}
          <div className="relative w-full sm:w-72 md:w-80 lg:w-96 h-44 sm:h-auto sm:min-h-[200px] flex-shrink-0 bg-gradient-to-br from-orange-400 to-orange-500 group cursor-pointer">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80 group-hover:text-white transition-colors">
              <Camera className="w-8 h-8" />
              <span className="text-xs font-medium">Subir foto del grupo</span>
            </div>
          </div>

          {/* Información + Acciones */}
          <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between gap-4">
            {/* Info superior */}
            <div className="space-y-3">
              {/* Badges de info */}
              <div className="flex flex-wrap items-center gap-2">
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
                <button
                  onClick={() => setIsMapOpen(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-left">
                    {grupo.direccion.calle && grupo.direccion.barrio
                      ? `${grupo.direccion.calle}, ${grupo.direccion.barrio}`
                      : grupo.direccion.calle || grupo.direccion.barrio}
                  </span>
                </button>
              )}

              {/* Casa anfitriona */}
              {grupo.casa_anfitriona_info?.nombre_lugar && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Casa: {grupo.casa_anfitriona_info.nombre_lugar}</span>
                  {grupo.casa_anfitriona_info.anfitrion_nombre && (
                    <span className="text-muted-foreground/60">— {grupo.casa_anfitriona_info.anfitrion_nombre}</span>
                  )}
                </div>
              )}
            </div>

            {/* Acciones — fila compacta */}
            <div className="flex items-center gap-2 flex-wrap">
              {grupo.puede_editar_ui && (
                <Link href={`/grupos-vida/${id}/asistencia`}>
                  <BotonSistema variante="primario" tamaño="sm" icono={Users}>
                    Asistencia
                  </BotonSistema>
                </Link>
              )}

              {grupo.puede_editar_ui && (grupo.rol_en_grupo?.toLowerCase() !== 'miembro') && (
                <Link href={`/grupos-vida/${id}/edit`}>
                  <BotonSistema variante="outline" tamaño="sm" icono={Edit}>
                    <span className="hidden sm:inline">Editar</span>
                  </BotonSistema>
                </Link>
              )}

              {grupo.puede_editar_ui && (
                <Link href={`/grupos-vida/${id}/asistencia/historial`}>
                  <BotonSistema variante="outline" tamaño="sm" icono={History}>
                    <span className="hidden sm:inline">Historial</span>
                  </BotonSistema>
                </Link>
              )}

              <BotonSistema
                variante="outline"
                tamaño="sm"
                icono={MapPin}
                onClick={() => setIsMapOpen(true)}
              >
                <span className="hidden sm:inline">Mapa</span>
              </BotonSistema>

              {grupo.puede_editar_ui && (
                <GroupPDFExportButton grupo={grupo} compact />
              )}

              {grupo.puede_gestionar_miembros && nivelUsuario >= JERARQUIA_ROLES['director-etapa'] && (
                <BotonSistema
                  variante="outline"
                  tamaño="sm"
                  icono={UserPlus}
                  onClick={() => setIsAddModalOpen(true)}
                >
                  <span className="hidden sm:inline">Añadir</span>
                </BotonSistema>
              )}
            </div>
          </div>
        </div>
      </TarjetaSistema>


      {/* Líderes y Miembros */}
      <TarjetaSistema>
        <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-orange-500" />
          Líderes y Miembros
        </h3>

        {grupo.miembros && grupo.miembros.length > 0 ? (() => {
          // Permisos por nivel
          const ROLES_DIRECTORES = ['admin', 'pastor', 'director-general', 'director-etapa'];
          const rolesUsuario = grupo.roles_sistema_usuario ?? [];
          // Director: tiene al menos un rol de sistema de nivel director
          const esDirector = rolesUsuario.some(r => ROLES_DIRECTORES.includes(r));
          // Líder simple: es líder del grupo pero NO tiene roles de director
          const esLider = grupo.rol_en_grupo === 'Líder' && !esDirector;

          return (
            <div className="divide-y divide-border">
              {grupo.miembros.map((miembro) => {
                // Para el líder: solo puede cambiar rol a Colíder para miembros (no para otros líderes)
                const puedeAsignarColider = esLider && miembro.rol !== 'Líder';

                // Render de controles según rol
                const renderControles = () => {
                  // DIRECTOR: selector completo + eliminar
                  if (esDirector) {
                    return (
                      <>
                        <Select
                          defaultValue={(miembro.rol as string) || 'Miembro'}
                          onValueChange={(v) => onChangeRole(miembro.id, v as "Líder" | "Colíder" | "Miembro")}
                          disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                        >
                          <SelectTrigger className="w-[100px] sm:w-[120px] h-8 text-xs sm:text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Líder">Líder</SelectItem>
                            <SelectItem value="Colíder">Aprendiz</SelectItem>
                            <SelectItem value="Miembro">Miembro</SelectItem>
                          </SelectContent>
                        </Select>
                        {puedeEliminarDirecto ? (
                          <button
                            type="button"
                            aria-label="Quitar miembro del grupo"
                            title="Eliminar del grupo"
                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                            onClick={() => onRemoveMember(miembro.id)}
                            disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                          >
                            <Trash2 className={`w-4 h-4 ${removingId === miembro.id ? 'animate-pulse' : ''}`} />
                          </button>
                        ) : puedeEnviarSolicitud ? (
                          <button
                            type="button"
                            aria-label="Solicitar eliminación del miembro"
                            title="Solicitar eliminación"
                            className="p-1.5 rounded-lg hover:bg-orange-500/10 text-orange-500 transition-colors"
                            onClick={() => {
                              setPendingRequestId(miembro.id);
                              setPendingRequestName(`${miembro.nombre} ${miembro.apellido}`);
                              setConfirmRequestOpen(true);
                            }}
                            disabled={roleUpdatingId === miembro.id || removingId === miembro.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </>
                    );
                  }

                  // LÍDER: puede asignar Colíder a miembros
                  if (puedeAsignarColider) {
                    return (
                      <Select
                        defaultValue={(miembro.rol as string) || 'Miembro'}
                        onValueChange={(v) => onChangeRole(miembro.id, v as "Líder" | "Colíder" | "Miembro")}
                        disabled={roleUpdatingId === miembro.id}
                      >
                        <SelectTrigger className="w-[100px] sm:w-[120px] h-8 text-xs sm:text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Colíder">Aprendiz</SelectItem>
                          <SelectItem value="Miembro">Miembro</SelectItem>
                        </SelectContent>
                      </Select>
                    );
                  }

                  // MIEMBRO o LÍDER viendo otro Líder: solo badge
                  return (
                    <BadgeSistema
                      variante={miembro.rol === 'Líder' ? 'warning' : miembro.rol === 'Colíder' ? 'info' : 'default'}
                      tamaño="sm"
                    >
                      {miembro.rol === 'Colíder' ? 'Aprendiz' : miembro.rol}
                    </BadgeSistema>
                  );
                };

                return (
                  <div key={miembro.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        photoUrl={miembro.foto_perfil_url}
                        nombre={miembro.nombre}
                        apellido={miembro.apellido}
                        size="md"
                        className="flex-shrink-0"
                      />

                      {/* Nombre + datos */}
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/users/${miembro.id}`}
                          className="font-semibold text-foreground text-sm sm:text-base hover:text-orange-600 transition-colors sm:line-clamp-1"
                        >
                          {miembro.nombre} {miembro.apellido}
                        </Link>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:truncate">
                          {miembro.telefono || miembro.email || "Sin contacto"}
                          <span className="hidden sm:inline">
                            {miembro.telefono && miembro.email ? ` · ${miembro.email}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Desktop: controles inline */}
                      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                        {renderControles()}
                      </div>

                      {/* Móvil: badge si no tiene selector */}
                      {!esDirector && !puedeAsignarColider && (
                        <div className="sm:hidden flex-shrink-0">
                          {renderControles()}
                        </div>
                      )}
                    </div>

                    {/* Móvil: controles en segunda fila si tiene selector */}
                    {(esDirector || puedeAsignarColider) && (
                      <div className="sm:hidden flex items-center gap-2 mt-2 pl-11">
                        {renderControles()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div className="py-8 text-center">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No hay miembros en este grupo</p>
          </div>
        )}
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
        lat={grupo.direccion?.lat || grupo.casa_anfitriona_info?.latitud || 0}
        lng={grupo.direccion?.lng || grupo.casa_anfitriona_info?.longitud || 0}
        calle={grupo.direccion?.calle || grupo.casa_anfitriona_info?.calle}
        barrio={grupo.direccion?.barrio || grupo.casa_anfitriona_info?.barrio}
        casaAnfitriona={grupo.casa_anfitriona_info}
      />

      {/* Confirmación de borrado */}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmRemove}
        title="Quitar miembro del grupo de vida"
        message="Esta acción removerá a la persona del grupo de vida. ¿Deseas continuar?"
        isLoading={removingId != null}
      />

      {/* Confirmación de solicitud de eliminación */}
      <ConfirmationModal
        isOpen={confirmRequestOpen}
        onClose={() => { setConfirmRequestOpen(false); setPendingRequestId(null); setPendingRequestName(''); }}
        onConfirm={async () => {
          if (!pendingRequestId) return;
          setRequestingId(pendingRequestId);
          try {
            const result = await crearSolicitudGrupo({
              tipo: 'egreso',
              usuario_id: String(pendingRequestId),
              grupo_id: String(id),
              motivo: 'Solicitud de eliminación de miembro del grupo de vida',
            });
            if (result.success) {
              toast.success('Solicitud de eliminación enviada correctamente');
            } else {
              toast.error(result.error ?? 'Error al enviar la solicitud');
            }
          } catch {
            toast.error('Error inesperado al enviar la solicitud');
          } finally {
            setRequestingId(null);
            setConfirmRequestOpen(false);
            setPendingRequestId(null);
            setPendingRequestName('');
          }
        }}
        title="Solicitar eliminación de miembro"
        message={`Se enviará una solicitud para eliminar a ${pendingRequestName} del grupo de vida. Un superior revisará y aprobará la solicitud. ¿Deseas continuar?`}
        isLoading={requestingId != null}
      />
    </ContenedorDashboard>
  );
}
