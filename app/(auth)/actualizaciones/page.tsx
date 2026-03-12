'use client'

import { TarjetaSistema, TituloSistema, TextoSistema, BadgeSistema, ContenedorDashboard } from '@/components/ui/sistema-diseno'
import { Calendar, Sparkles, Wrench, Shield, Package } from 'lucide-react'

/* ── Data ── */

export interface Actualizacion {
    version: string
    fecha: string
    titulo: string
    descripcion: string
    tipo: 'feature' | 'mejora' | 'correccion' | 'seguridad'
    modulo: string
    detalles: string[]
    impactoRoles?: string[]
}

const actualizaciones: Actualizacion[] = [
    {
        version: '1.7.0',
        fecha: '2026-03-11',
        titulo: 'Experiencia Visual Premium',
        descripcion: 'El sistema ahora se siente como una app nativa con dark mode completo, mejores formularios y navegación inteligente.',
        tipo: 'mejora',
        modulo: 'sistema',
        detalles: [
            'Dark mode funciona correctamente en todas las pantallas',
            'Los gráficos se ven bien en modo oscuro',
            'El header móvil muestra el nombre de la página en la que estás',
            'Botón de regreso disponible en todas las páginas internas',
            'Las tablas se adaptan mejor a pantallas pequeñas',
            'Nuevos campos de formulario más accesibles y modernos',
        ],
        impactoRoles: ['admin', 'pastor', 'director-general', 'director-etapa', 'líder', 'miembro'],
    },
    {
        version: '1.6.0',
        fecha: '2026-03-10',
        titulo: 'Mejoras en Grupos y Seguridad',
        descripcion: 'Grupos ahora se conectan con el sistema multi-campus y la seguridad se fortaleció en auditorías.',
        tipo: 'feature',
        modulo: 'grupos',
        detalles: [
            'Al crear un grupo puedes asignarle un campus',
            'La auditoría de grupos es más segura — solo ves los de tu campus',
            'Se corrigieron duplicados en la base de datos',
        ],
        impactoRoles: ['admin', 'pastor', 'director-general'],
    },
    {
        version: '1.5.0',
        fecha: '2026-03-10',
        titulo: 'Multi-Campus',
        descripcion: 'Ahora puedes gestionar múltiples campus desde un solo dashboard.',
        tipo: 'feature',
        modulo: 'dashboard',
        detalles: [
            'Selector de campus en el sidebar y header móvil',
            'El dashboard se actualiza automáticamente al cambiar de campus',
            'Los KPIs, grupos y usuarios se filtran por campus seleccionado',
            '171 grupos y 1020 usuarios asignados al campus Barquisimeto',
        ],
        impactoRoles: ['admin', 'pastor', 'director-general'],
    },
    {
        version: '1.4.0',
        fecha: '2026-03-10',
        titulo: 'Permisos Mejorados',
        descripcion: 'Ahora los permisos se verifican en el servidor para mayor seguridad.',
        tipo: 'seguridad',
        modulo: 'usuarios',
        detalles: [
            'Solo usuarios con permiso pueden editar perfiles de otros',
            'Solo usuarios con permiso pueden crear nuevos miembros',
            'Los botones se ocultan automáticamente si no tienes acceso',
        ],
        impactoRoles: ['admin', 'pastor', 'director-general', 'director-etapa', 'líder'],
    },
    {
        version: '1.2.0',
        fecha: '2026-03-09',
        titulo: 'Emails Transaccionales',
        descripcion: 'El sistema ahora puede enviar emails de bienvenida, verificación e invitación a grupos.',
        tipo: 'feature',
        modulo: 'sistema',
        detalles: [
            'Email de bienvenida al registrarse',
            'Email de verificación de cuenta',
            'Email de restablecimiento de contraseña',
            'Email de invitación a un grupo',
        ],
        impactoRoles: ['admin', 'pastor'],
    },
]

/* ── Helpers ── */

const iconoTipo = {
    feature: Sparkles,
    mejora: Package,
    correccion: Wrench,
    seguridad: Shield,
} as const

const colorTipo = {
    feature: 'success' as const,
    mejora: 'info' as const,
    correccion: 'warning' as const,
    seguridad: 'error' as const,
}

const labelTipo = {
    feature: 'Nueva función',
    mejora: 'Mejora',
    correccion: 'Corrección',
    seguridad: 'Seguridad',
}

/* ── Page ── */

export default function ActualizacionesPage() {
    return (
        <ContenedorDashboard titulo="Actualizaciones" descripcion="Historial de cambios y mejoras del sistema">
            <div className="space-y-6">
                {actualizaciones.map((act) => {
                    const Icono = iconoTipo[act.tipo]
                    return (
                        <TarjetaSistema key={act.version} className="p-6">
                            <div className="flex items-start gap-4">
                                {/* Icono */}
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                    <Icono className="w-5 h-5 text-orange-600" />
                                </div>

                                {/* Contenido */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <TituloSistema nivel={3}>{act.titulo}</TituloSistema>
                                        <BadgeSistema variante={colorTipo[act.tipo]} tamaño="sm">
                                            {labelTipo[act.tipo]}
                                        </BadgeSistema>
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                        <TextoSistema variante="muted" tamaño="sm">
                                            v{act.version}
                                        </TextoSistema>
                                        <span className="text-muted-foreground/40">•</span>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <TextoSistema variante="muted" tamaño="sm">
                                                {new Date(act.fecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </TextoSistema>
                                        </div>
                                    </div>

                                    <TextoSistema className="mb-3">{act.descripcion}</TextoSistema>

                                    <ul className="space-y-1.5">
                                        {act.detalles.map((d, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                                                <TextoSistema tamaño="sm">{d}</TextoSistema>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </TarjetaSistema>
                    )
                })}
            </div>
        </ContenedorDashboard>
    )
}
