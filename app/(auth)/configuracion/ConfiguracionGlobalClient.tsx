"use client"

import React, { useState, useRef, useCallback } from "react"
import Image from "next/image"
import { guardarConfiguracionBranding, guardarDatosOrganizacion } from "@/lib/actions/branding.actions"
import {
    TarjetaSistema,
    TituloSistema,
    TextoSistema,
    InputSistema,
    BotonSistema,
    SeparadorSistema,
    BadgeSistema,
    PieAccionesSistema,
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

interface DatosBranding {
    logoLightUrl: string | null
    logoDarkUrl: string | null
    faviconUrl: string | null
    colorPrimario: string
    colorSecundario: string
}

interface ConfiguracionGlobalClientProps {
    datosOrganizacion?: DatosOrganizacion
    datosBranding?: DatosBranding
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

export function ConfiguracionGlobalClient({ datosOrganizacion, datosBranding }: ConfiguracionGlobalClientProps) {
    const toast = useNotificaciones()
    const [seccionAbierta, setSeccionAbierta] = useState<string>("organizacion")
    const [guardando, setGuardando] = useState(false)

    // Estado de datos organización
    const [orgNombre, setOrgNombre] = useState(datosOrganizacion?.nombre ?? "")
    const [orgDireccion, setOrgDireccion] = useState(datosOrganizacion?.direccion ?? "")
    const [orgTelefono, setOrgTelefono] = useState(datosOrganizacion?.telefono ?? "")
    const [orgEmail, setOrgEmail] = useState(datosOrganizacion?.email ?? "")

    // Estado de branding — inicializar desde datos del servidor
    const [logoLightPreview, setLogoLightPreview] = useState<string | null>(datosBranding?.logoLightUrl ?? null)
    const [logoDarkPreview, setLogoDarkPreview] = useState<string | null>(datosBranding?.logoDarkUrl ?? null)
    const [faviconPreview, setFaviconPreview] = useState<string | null>(datosBranding?.faviconUrl ?? null)
    const [brandColor, setBrandColor] = useState(datosBranding?.colorPrimario ?? "#E96C20")
    const [brandColorLight, setBrandColorLight] = useState(datosBranding?.colorSecundario ?? "#F59E0B")
    const fileInputLightRef = useRef<HTMLInputElement>(null)
    const fileInputDarkRef = useRef<HTMLInputElement>(null)
    const fileInputFaviconRef = useRef<HTMLInputElement>(null)

    // Archivos seleccionados para subir
    const [logoLightFile, setLogoLightFile] = useState<File | null>(null)
    const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null)
    const [faviconFile, setFaviconFile] = useState<File | null>(null)

    // Flags para marcar logos eliminados
    const [eliminarLogoLight, setEliminarLogoLight] = useState(false)
    const [eliminarLogoDark, setEliminarLogoDark] = useState(false)
    const [eliminarFavicon, setEliminarFavicon] = useState(false)

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
            const resultado = await guardarDatosOrganizacion({
                nombre: orgNombre,
                email: orgEmail,
                direccion: orgDireccion,
                telefono: orgTelefono,
            })

            if (resultado.success) {
                toast.success(resultado.message || "Datos de la organización actualizados")
            } else {
                toast.error(resultado.error || "Error al guardar los datos")
            }
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

    const handleFileSelect = useCallback((type: 'light' | 'dark' | 'favicon') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validar tamaño (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error("El archivo es demasiado grande (máximo 2MB)")
            return
        }

        // Validar tipo
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
        if (type === 'favicon') allowed.push('image/x-icon', 'image/vnd.microsoft.icon')
        if (!allowed.includes(file.type)) {
            toast.error("Tipo de archivo no permitido. Usa PNG, JPG, WebP o SVG.")
            return
        }

        const url = URL.createObjectURL(file)
        if (type === 'light') {
            setLogoLightPreview(url)
            setLogoLightFile(file)
            setEliminarLogoLight(false)
        } else if (type === 'dark') {
            setLogoDarkPreview(url)
            setLogoDarkFile(file)
            setEliminarLogoDark(false)
        } else {
            setFaviconPreview(url)
            setFaviconFile(file)
            setEliminarFavicon(false)
        }
    }, [toast])

    const handleRemoveLogo = useCallback((type: 'light' | 'dark' | 'favicon') => {
        if (type === 'light') {
            setLogoLightPreview(null)
            setLogoLightFile(null)
            setEliminarLogoLight(true)
            if (fileInputLightRef.current) fileInputLightRef.current.value = ''
        } else if (type === 'dark') {
            setLogoDarkPreview(null)
            setLogoDarkFile(null)
            setEliminarLogoDark(true)
            if (fileInputDarkRef.current) fileInputDarkRef.current.value = ''
        } else {
            setFaviconPreview(null)
            setFaviconFile(null)
            setEliminarFavicon(true)
            if (fileInputFaviconRef.current) fileInputFaviconRef.current.value = ''
        }
    }, [])

    const guardarBranding = async () => {
        setGuardando(true)
        try {
            const formData = new FormData()

            // Adjuntar archivos si fueron seleccionados
            if (logoLightFile) formData.append('logo_light', logoLightFile)
            if (logoDarkFile) formData.append('logo_dark', logoDarkFile)
            if (faviconFile) formData.append('favicon', faviconFile)

            // Colores
            formData.append('color_primario', brandColor)
            formData.append('color_secundario', brandColorLight)

            // Flags de eliminación
            if (eliminarLogoLight) formData.append('eliminar_logo_light', 'true')
            if (eliminarLogoDark) formData.append('eliminar_logo_dark', 'true')
            if (eliminarFavicon) formData.append('eliminar_favicon', 'true')

            const resultado = await guardarConfiguracionBranding(formData)

            if (resultado.success) {
                toast.success(resultado.message || "Branding actualizado")
                // Limpiar files después de guardar exitoso
                setLogoLightFile(null)
                setLogoDarkFile(null)
                setFaviconFile(null)
                setEliminarLogoLight(false)
                setEliminarLogoDark(false)
                setEliminarFavicon(false)

                // Actualizar previews con las URLs reales del servidor
                if (resultado.data) {
                    setLogoLightPreview(resultado.data.logo_light_url)
                    setLogoDarkPreview(resultado.data.logo_dark_url)
                    setFaviconPreview(resultado.data.favicon_url)
                }
            } else {
                toast.error(resultado.error || "Error al guardar el branding")
            }
        } catch {
            toast.error("Error al guardar el branding")
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="space-y-4">
            {secciones.map((seccion) => {
                const Icono = seccion.icono
                const abierta = seccionAbierta === seccion.id
                const esBloqueada = !!seccion.badge

                return (
                    <TarjetaSistema key={seccion.id} variante="default" className="overflow-hidden p-0">
                        {/* Header de la sección */}
                        <button
                            type="button"
                            onClick={() => !esBloqueada && toggleSeccion(seccion.id)}
                            disabled={esBloqueada}
                            aria-expanded={esBloqueada ? undefined : abierta}
                            className={`w-full flex items-center gap-3 p-4 sm:gap-4 sm:p-5 text-left transition-colors duration-200 ${esBloqueada
                                ? "opacity-60 cursor-not-allowed"
                                : "hover:bg-muted/30 cursor-pointer"
                                }`}
                        >
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                <Icono className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
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
                                        <ChevronDown className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                    ) : (
                                        <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                    )}
                                </div>
                            )}
                        </button>

                        {/* Contenido expandido */}
                        {abierta && !esBloqueada && (
                            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
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
                                        <PieAccionesSistema fijo={false} className="bg-transparent">
                                            <BotonSistema
                                                variante="primario"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarOrganizacion}
                                            >
                                                Guardar cambios
                                            </BotonSistema>
                                        </PieAccionesSistema>
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
                                                <ZonaLogo
                                                    titulo="Logo modo claro"
                                                    icono={<Sun className="h-4 w-4 text-warning" aria-hidden="true" />}
                                                    preview={logoLightPreview}
                                                    alt="Logo claro"
                                                    fondoClassName="bg-white text-zinc-600"
                                                    onElegir={() => fileInputLightRef.current?.click()}
                                                    onQuitar={() => handleRemoveLogo('light')}
                                                />
                                                <input ref={fileInputLightRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect('light')} />

                                                <ZonaLogo
                                                    titulo="Logo modo oscuro"
                                                    icono={<Moon className="h-4 w-4 text-info" aria-hidden="true" />}
                                                    preview={logoDarkPreview}
                                                    alt="Logo oscuro"
                                                    fondoClassName="bg-zinc-900 text-zinc-300"
                                                    onElegir={() => fileInputDarkRef.current?.click()}
                                                    onQuitar={() => handleRemoveLogo('dark')}
                                                />
                                                <input ref={fileInputDarkRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect('dark')} />
                                            </div>

                                            {/* Favicon */}
                                            <div className="mt-4 space-y-2">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                                                    <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                    Favicon
                                                    <TextoSistema variante="muted" tamaño="sm">— Ícono de la pestaña del navegador (32×32px recomendado)</TextoSistema>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => fileInputFaviconRef.current?.click()}
                                                        aria-label={faviconPreview ? "Cambiar favicon" : "Subir favicon"}
                                                        className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-[var(--brand-primary)]/50 bg-muted/20 flex items-center justify-center transition-colors duration-200 cursor-pointer group flex-shrink-0"
                                                    >
                                                        {faviconPreview ? (
                                                            <Image src={faviconPreview} alt="Favicon" width={32} height={32} className="object-contain" />
                                                        ) : (
                                                            <Upload className="h-5 w-5 text-muted-foreground group-hover:text-[var(--brand-primary)] transition-colors" aria-hidden="true" />
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
                                                                aria-label="Elegir color primario"
                                                                value={brandColor}
                                                                onChange={e => setBrandColor(e.target.value)}
                                                                className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-[10px] [&::-webkit-color-swatch]:border-0"
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <InputSistema
                                                                aria-label="Código del color primario"
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
                                                                aria-label="Elegir color secundario"
                                                                value={brandColorLight}
                                                                onChange={e => setBrandColorLight(e.target.value)}
                                                                className="w-12 h-12 rounded-xl border-2 border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-[10px] [&::-webkit-color-swatch]:border-0"
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <InputSistema
                                                                aria-label="Código del color secundario"
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

                                            <div className="rounded-2xl border border-border overflow-hidden" aria-hidden="true">
                                                {/* Barra de navegación simulada */}
                                                <div className="px-4 py-3 flex items-center gap-3 border-b border-border" style={{ backgroundColor: `${brandColor}10` }}>
                                                    <div
                                                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold"
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
                                                        <span
                                                            className="px-3 py-1.5 rounded-xl text-white text-xs font-medium"
                                                            style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColorLight})` }}
                                                        >
                                                            Botón primario
                                                        </span>
                                                        <span
                                                            className="px-3 py-1.5 rounded-xl text-xs font-medium border"
                                                            style={{ borderColor: brandColor, color: brandColor }}
                                                        >
                                                            Botón outline
                                                        </span>
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

                                        <PieAccionesSistema fijo={false} className="bg-transparent">
                                            <BotonSistema
                                                variante="primario"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarBranding}
                                            >
                                                Guardar branding
                                            </BotonSistema>
                                        </PieAccionesSistema>
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
                                                    className="flex items-center justify-between gap-3 p-3 sm:p-4 rounded-xl bg-muted/20 border border-border/50"
                                                >
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <ModuloIcono className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                        <div className="min-w-0">
                                                            <TextoSistema className="font-medium">
                                                                {modulo.nombre}
                                                            </TextoSistema>
                                                            <TextoSistema variante="muted" tamaño="sm">
                                                                {modulo.descripcion}
                                                            </TextoSistema>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        role="switch"
                                                        aria-checked={modulo.activo}
                                                        aria-label={modulo.nombre}
                                                        onClick={() => toggleModulo(modulo.id)}
                                                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-200 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        title={modulo.activo ? "Desactivar" : "Activar"}
                                                    >
                                                        {modulo.activo ? (
                                                            <ToggleRight className="h-8 w-8 text-success" aria-hidden="true" />
                                                        ) : (
                                                            <ToggleLeft className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                                                        )}
                                                    </button>
                                                </div>
                                            )
                                        })}
                                        <PieAccionesSistema fijo={false} className="bg-transparent">
                                            <BotonSistema
                                                variante="primario"
                                                icono={Save}
                                                cargando={guardando}
                                                onClick={guardarModulos}
                                            >
                                                Guardar configuración
                                            </BotonSistema>
                                        </PieAccionesSistema>
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

interface ZonaLogoProps {
    titulo: string
    icono: React.ReactNode
    preview: string | null
    alt: string
    /** Fixed surface and text color: each logo is previewed on the background it is meant for, whatever the app theme. */
    fondoClassName: string
    onElegir: () => void
    onQuitar: () => void
}

/**
 * Upload area for one logo. The remove action is a sibling of the upload
 * button (a button cannot contain another one), pinned to its corner.
 */
function ZonaLogo({ titulo, icono, preview, alt, fondoClassName, onElegir, onQuitar }: ZonaLogoProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {icono}
                {titulo}
            </div>
            <div className="relative">
                <button
                    type="button"
                    onClick={onElegir}
                    aria-label={preview ? `Cambiar ${titulo.toLowerCase()}` : `Subir ${titulo.toLowerCase()}`}
                    className={`group flex h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border transition-colors duration-200 hover:border-[var(--brand-primary)]/50 ${fondoClassName}`}
                >
                    {preview ? (
                        <div className="relative h-full w-full">
                            <Image src={preview} alt={alt} fill className="object-contain p-4" />
                        </div>
                    ) : (
                        <>
                            <Upload className="h-6 w-6 opacity-70 transition-colors group-hover:text-[var(--brand-primary)] group-hover:opacity-100" aria-hidden="true" />
                            <span className="text-sm">Arrastra o haz clic</span>
                        </>
                    )}
                </button>
                {preview && (
                    <BotonSistema
                        type="button"
                        variante="outline"
                        tamaño="sm"
                        soloIcono
                        icono={Trash2}
                        aria-label={`Quitar ${titulo.toLowerCase()}`}
                        onClick={onQuitar}
                        className="absolute right-2 top-2 border border-danger/40 bg-background/90 text-danger hover:bg-danger/10"
                    />
                )}
            </div>
        </div>
    )
}
