"use client"

import React, { useState } from "react"
import {
    TarjetaSistema,
    TituloSistema,
    TextoSistema,
    InputSistema,
    BotonSistema,
    SeparadorSistema,
    BadgeSistema,
} from "@/components/ui/sistema-diseno"
import {
    Building2,
    Palette,
    Bell,
    Mail,
    ToggleLeft,
    ToggleRight,
    Save,
    Globe,
    Phone,
    MapPin,
    CheckCircle2,
    Users,
    ChevronDown,
    ChevronRight,
} from "lucide-react"
import { useNotificaciones } from "@/hooks/use-notificaciones"

interface DatosOrganizacion {
    nombre: string
    direccion: string
    telefono: string
    email: string
}

interface ConfiguracionGlobalClientProps {
    datosOrganizacion?: DatosOrganizacion
}

interface SeccionConfig {
    id: string
    titulo: string
    descripcion: string
    icono: React.ComponentType<{ className?: string }>
    badge?: string
}

const secciones: SeccionConfig[] = [
    {
        id: "organizacion",
        titulo: "Datos de la Organización",
        descripcion: "Nombre, dirección, teléfono y datos de contacto",
        icono: Building2,
    },
    {
        id: "branding",
        titulo: "Logo y Branding",
        descripcion: "Personaliza la apariencia de la plataforma",
        icono: Palette,
        badge: "Próximamente",
    },
    {
        id: "modulos",
        titulo: "Módulos del Sistema",
        descripcion: "Activa o desactiva funcionalidades",
        icono: ToggleLeft,
    },
    {
        id: "notificaciones",
        titulo: "Notificaciones",
        descripcion: "Configura las alertas y notificaciones del sistema",
        icono: Bell,
        badge: "Próximamente",
    },
    {
        id: "email",
        titulo: "Configuración de Email",
        descripcion: "Remitente, plantillas y configuración SMTP",
        icono: Mail,
        badge: "Próximamente",
    },
]

interface ModuloSistema {
    id: string
    nombre: string
    descripcion: string
    activo: boolean
    icono: React.ComponentType<{ className?: string }>
}

const modulosIniciales: ModuloSistema[] = [
    {
        id: "grupos-vida",
        nombre: "Grupos de Vida",
        descripcion: "Gestión de grupos, líderes, miembros y asistencias",
        activo: true,
        icono: Users,
    },
    {
        id: "reportes",
        nombre: "Reportes y Estadísticas",
        descripcion: "Dashboards, KPIs y reportes de rendimiento",
        activo: true,
        icono: CheckCircle2,
    },
    {
        id: "notificaciones-email",
        nombre: "Notificaciones por Email",
        descripcion: "Envío automático de emails transaccionales",
        activo: false,
        icono: Mail,
    },
    {
        id: "mapa",
        nombre: "Mapa de Grupos",
        descripcion: "Visualización geográfica de grupos en el mapa",
        activo: true,
        icono: Globe,
    },
]

export function ConfiguracionGlobalClient({ datosOrganizacion }: ConfiguracionGlobalClientProps) {
    const toast = useNotificaciones()
    const [seccionAbierta, setSeccionAbierta] = useState<string>("organizacion")
    const [guardando, setGuardando] = useState(false)

    // Estado de datos organización
    const [orgNombre, setOrgNombre] = useState(datosOrganizacion?.nombre ?? "")
    const [orgDireccion, setOrgDireccion] = useState(datosOrganizacion?.direccion ?? "")
    const [orgTelefono, setOrgTelefono] = useState(datosOrganizacion?.telefono ?? "")
    const [orgEmail, setOrgEmail] = useState(datosOrganizacion?.email ?? "")

    // Estado de módulos
    const [modulos, setModulos] = useState<ModuloSistema[]>(modulosIniciales)

    const toggleSeccion = (id: string) => {
        setSeccionAbierta(prev => prev === id ? "" : id)
    }

    const toggleModulo = (moduloId: string) => {
        setModulos(prev =>
            prev.map(m =>
                m.id === moduloId ? { ...m, activo: !m.activo } : m
            )
        )
    }

    const guardarOrganizacion = async () => {
        setGuardando(true)
        try {
            // TODO: Implementar server action para guardar datos
            await new Promise(resolve => setTimeout(resolve, 800))
            toast.success("Datos de la organización actualizados")
        } catch {
            toast.error("Error al guardar los datos")
        } finally {
            setGuardando(false)
        }
    }

    const guardarModulos = async () => {
        setGuardando(true)
        try {
            // TODO: Implementar server action para guardar módulos
            await new Promise(resolve => setTimeout(resolve, 800))
            toast.success("Configuración de módulos actualizada")
        } catch {
            toast.error("Error al guardar la configuración")
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="space-y-4 max-w-4xl">
            {secciones.map((seccion) => {
                const Icono = seccion.icono
                const abierta = seccionAbierta === seccion.id
                const esBloqueada = !!seccion.badge

                return (
                    <TarjetaSistema key={seccion.id} variante="default" className="overflow-hidden p-0">
                        {/* Header de la sección */}
                        <button
                            onClick={() => !esBloqueada && toggleSeccion(seccion.id)}
                            disabled={esBloqueada}
                            className={`w-full flex items-center gap-4 p-5 text-left transition-colors duration-200 ${esBloqueada
                                    ? "opacity-60 cursor-not-allowed"
                                    : "hover:bg-muted/30 cursor-pointer"
                                }`}
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Icono className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <TituloSistema nivel={3} className="truncate">
                                        {seccion.titulo}
                                    </TituloSistema>
                                    {seccion.badge && (
                                        <BadgeSistema variante="info" tamaño="sm">
                                            {seccion.badge}
                                        </BadgeSistema>
                                    )}
                                </div>
                                <TextoSistema variante="muted" tamaño="sm">
                                    {seccion.descripcion}
                                </TextoSistema>
                            </div>
                            {!esBloqueada && (
                                <div className="flex-shrink-0">
                                    {abierta ? (
                                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                    )}
                                </div>
                            )}
                        </button>

                        {/* Contenido expandido */}
                        {abierta && !esBloqueada && (
                            <div className="px-5 pb-5">
                                <SeparadorSistema className="mb-5" />

                                {/* Sección: Datos de la Organización */}
                                {seccion.id === "organizacion" && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <InputSistema
                                                label="Nombre de la organización"
                                                icono={Building2}
                                                value={orgNombre}
                                                onChange={e => setOrgNombre(e.target.value)}
                                                placeholder="Ej: Iglesia Global"
                                            />
                                            <InputSistema
                                                label="Email de contacto"
                                                icono={Mail}
                                                type="email"
                                                value={orgEmail}
                                                onChange={e => setOrgEmail(e.target.value)}
                                                placeholder="contacto@ejemplo.com"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <InputSistema
                                                label="Dirección"
                                                icono={MapPin}
                                                value={orgDireccion}
                                                onChange={e => setOrgDireccion(e.target.value)}
                                                placeholder="Calle, Ciudad"
                                            />
                                            <InputSistema
                                                label="Teléfono"
                                                icono={Phone}
                                                value={orgTelefono}
                                                onChange={e => setOrgTelefono(e.target.value)}
                                                placeholder="+1 234 567 8900"
                                            />
                                        </div>
                                        <div className="flex justify-end pt-2">
                                            <BotonSistema
                                                variante="primario"
                                                tamaño="sm"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarOrganizacion}
                                            >
                                                Guardar cambios
                                            </BotonSistema>
                                        </div>
                                    </div>
                                )}

                                {/* Sección: Módulos */}
                                {seccion.id === "modulos" && (
                                    <div className="space-y-3">
                                        {modulos.map(modulo => {
                                            const ModuloIcono = modulo.icono
                                            return (
                                                <div
                                                    key={modulo.id}
                                                    className="flex items-center justify-between p-4 rounded-xl bg-muted/20 border border-border/50"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <ModuloIcono className="h-5 w-5 text-muted-foreground" />
                                                        <div>
                                                            <TextoSistema className="font-medium">
                                                                {modulo.nombre}
                                                            </TextoSistema>
                                                            <TextoSistema variante="muted" tamaño="sm">
                                                                {modulo.descripcion}
                                                            </TextoSistema>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => toggleModulo(modulo.id)}
                                                        className="flex-shrink-0 transition-colors duration-200"
                                                        title={modulo.activo ? "Desactivar" : "Activar"}
                                                    >
                                                        {modulo.activo ? (
                                                            <ToggleRight className="h-8 w-8 text-green-500" />
                                                        ) : (
                                                            <ToggleLeft className="h-8 w-8 text-muted-foreground" />
                                                        )}
                                                    </button>
                                                </div>
                                            )
                                        })}
                                        <div className="flex justify-end pt-2">
                                            <BotonSistema
                                                variante="primario"
                                                tamaño="sm"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarModulos}
                                            >
                                                Guardar configuración
                                            </BotonSistema>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </TarjetaSistema>
                )
            })}
        </div>
    )
}
