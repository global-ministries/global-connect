"use client"

import React, { useState, useRef } from "react"
import Image from "next/image"
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
    Upload,
    Sun,
    Moon,
    Droplet,
    Eye,
    ImageIcon,
    Trash2,
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

    // Estado de branding
    const [logoLightPreview, setLogoLightPreview] = useState<string | null>(null)
    const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(null)
    const [faviconPreview, setFaviconPreview] = useState<string | null>(null)
    const [brandColor, setBrandColor] = useState("#E96C20")
    const [brandColorLight, setBrandColorLight] = useState("#F59E0B")
    const fileInputLightRef = useRef<HTMLInputElement>(null)
    const fileInputDarkRef = useRef<HTMLInputElement>(null)
    const fileInputFaviconRef = useRef<HTMLInputElement>(null)

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

    const handleFileSelect = (type: 'light' | 'dark' | 'favicon') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const url = URL.createObjectURL(file)
        if (type === 'light') setLogoLightPreview(url)
        else if (type === 'dark') setLogoDarkPreview(url)
        else setFaviconPreview(url)
    }

    const guardarBranding = async () => {
        setGuardando(true)
        try {
            // TODO: Subir logos a Supabase Storage y guardar colores en DB
            await new Promise(resolve => setTimeout(resolve, 800))
            toast.success("Configuración de branding actualizada")
        } catch {
            toast.error("Error al guardar el branding")
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

                                {/* Sección: Branding */}
                                {seccion.id === "branding" && (
                                    <div className="space-y-6">
                                        {/* Logos */}
                                        <div>
                                            <TituloSistema nivel={4} className="mb-3 flex items-center gap-2">
                                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                                Logos
                                            </TituloSistema>
                                            <TextoSistema variante="muted" tamaño="sm" className="mb-4">
                                                Sube el logo de tu organización para modo claro y oscuro. Recomendado: PNG transparente, mínimo 200×200px.
                                            </TextoSistema>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {/* Logo modo claro */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                        <Sun className="h-4 w-4 text-amber-500" />
                                                        Logo modo claro
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputLightRef.current?.click()}
                                                        className="w-full h-36 rounded-xl border-2 border-dashed border-border hover:border-[var(--brand-primary)]/50 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center gap-2 transition-colors duration-200 cursor-pointer group"
                                                    >
                                                        {logoLightPreview ? (
                                                            <div className="relative w-full h-full p-4">
                                                                <Image src={logoLightPreview} alt="Logo claro" fill className="object-contain p-3" />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setLogoLightPreview(null) }}
                                                                    className="absolute top-2 right-2 p-1 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <Upload className="h-6 w-6 text-muted-foreground group-hover:text-[var(--brand-primary)] transition-colors" />
                                                                <TextoSistema variante="muted" tamaño="sm">Arrastra o haz clic</TextoSistema>
                                                            </>
                                                        )}
                                                    </button>
                                                    <input ref={fileInputLightRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect('light')} />
                                                </div>

                                                {/* Logo modo oscuro */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                        <Moon className="h-4 w-4 text-blue-400" />
                                                        Logo modo oscuro
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputDarkRef.current?.click()}
                                                        className="w-full h-36 rounded-xl border-2 border-dashed border-border hover:border-[var(--brand-primary)]/50 bg-zinc-900 dark:bg-zinc-950 flex flex-col items-center justify-center gap-2 transition-colors duration-200 cursor-pointer group"
                                                    >
                                                        {logoDarkPreview ? (
                                                            <div className="relative w-full h-full p-4">
                                                                <Image src={logoDarkPreview} alt="Logo oscuro" fill className="object-contain p-3" />
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setLogoDarkPreview(null) }}
                                                                    className="absolute top-2 right-2 p-1 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <Upload className="h-6 w-6 text-muted-foreground group-hover:text-[var(--brand-primary)] transition-colors" />
                                                                <TextoSistema variante="muted" tamaño="sm">Arrastra o haz clic</TextoSistema>
                                                            </>
                                                        )}
                                                    </button>
                                                    <input ref={fileInputDarkRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect('dark')} />
                                                </div>
                                            </div>

                                            {/* Favicon */}
                                            <div className="mt-4 space-y-2">
                                                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                                    Favicon
                                                    <TextoSistema variante="muted" tamaño="sm">— Ícono de la pestaña del navegador (32×32px recomendado)</TextoSistema>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputFaviconRef.current?.click()}
                                                        className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-[var(--brand-primary)]/50 bg-muted/20 flex items-center justify-center transition-colors duration-200 cursor-pointer group flex-shrink-0"
                                                    >
                                                        {faviconPreview ? (
                                                            <Image src={faviconPreview} alt="Favicon" width={32} height={32} className="object-contain" />
                                                        ) : (
                                                            <Upload className="h-5 w-5 text-muted-foreground group-hover:text-[var(--brand-primary)] transition-colors" />
                                                        )}
                                                    </button>
                                                    <TextoSistema variante="muted" tamaño="sm">
                                                        PNG o ICO, fondo transparente
                                                    </TextoSistema>
                                                </div>
                                                <input ref={fileInputFaviconRef} type="file" accept="image/png,image/x-icon,image/svg+xml" className="hidden" onChange={handleFileSelect('favicon')} />
                                            </div>
                                        </div>

                                        <SeparadorSistema />

                                        {/* Colores de marca */}
                                        <div>
                                            <TituloSistema nivel={4} className="mb-3 flex items-center gap-2">
                                                <Droplet className="h-4 w-4 text-muted-foreground" />
                                                Colores de marca
                                            </TituloSistema>
                                            <TextoSistema variante="muted" tamaño="sm" className="mb-4">
                                                Define los colores principales de tu organización. Se usan en botones, enlaces y elementos de acento.
                                            </TextoSistema>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {/* Color primario */}
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-foreground">Color primario</label>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input
                                                                type="color"
                                                                value={brandColor}
                                                                onChange={e => setBrandColor(e.target.value)}
                                                                className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <InputSistema
                                                                value={brandColor}
                                                                onChange={e => setBrandColor(e.target.value)}
                                                                placeholder="#E96C20"
                                                                className="font-mono uppercase"
                                                            />
                                                        </div>
                                                    </div>
                                                    <TextoSistema variante="muted" tamaño="sm">Botones, enlaces activos, acentos</TextoSistema>
                                                </div>

                                                {/* Color secundario */}
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-foreground">Color secundario</label>
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input
                                                                type="color"
                                                                value={brandColorLight}
                                                                onChange={e => setBrandColorLight(e.target.value)}
                                                                className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <InputSistema
                                                                value={brandColorLight}
                                                                onChange={e => setBrandColorLight(e.target.value)}
                                                                placeholder="#F59E0B"
                                                                className="font-mono uppercase"
                                                            />
                                                        </div>
                                                    </div>
                                                    <TextoSistema variante="muted" tamaño="sm">Gradientes, hover, elementos complementarios</TextoSistema>
                                                </div>
                                            </div>
                                        </div>

                                        <SeparadorSistema />

                                        {/* Vista previa */}
                                        <div>
                                            <TituloSistema nivel={4} className="mb-3 flex items-center gap-2">
                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                Vista previa
                                            </TituloSistema>

                                            <div className="rounded-xl border border-border overflow-hidden">
                                                {/* Barra de navegación simulada */}
                                                <div className="px-4 py-3 flex items-center gap-3 border-b border-border" style={{ backgroundColor: `${brandColor}10` }}>
                                                    <div
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                                        style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColorLight})` }}
                                                    >
                                                        G
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-foreground">Mi Organización</div>
                                                        <div className="text-xs text-muted-foreground">globalconnect.app</div>
                                                    </div>
                                                </div>

                                                {/* Contenido simulado */}
                                                <div className="p-4 space-y-3 bg-card">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brandColor }} />
                                                        <div className="text-sm font-medium text-foreground">Elemento activo</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="px-3 py-1.5 rounded-lg text-white text-xs font-medium transition-opacity hover:opacity-90"
                                                            style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColorLight})` }}
                                                        >
                                                            Botón primario
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-opacity hover:opacity-90"
                                                            style={{ borderColor: brandColor, color: brandColor }}
                                                        >
                                                            Botón outline
                                                        </button>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full transition-all duration-500"
                                                            style={{ width: '65%', background: `linear-gradient(90deg, ${brandColor}, ${brandColorLight})` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-end pt-2">
                                            <BotonSistema
                                                variante="primario"
                                                tamaño="sm"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarBranding}
                                            >
                                                Guardar branding
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
