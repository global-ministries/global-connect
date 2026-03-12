"use client";

import { BadgeSistema } from "@/components/ui/sistema-diseno";

type EstadoCiclo = "proximo" | "activo" | "archivado" | "cancelado";

const CONFIG_ESTADO: Record<
    EstadoCiclo,
    { variante: "info" | "success" | "warning" | "error"; etiqueta: string }
> = {
    proximo: { variante: "info", etiqueta: "Próximo" },
    activo: { variante: "success", etiqueta: "Activo" },
    archivado: { variante: "warning", etiqueta: "Archivado" },
    cancelado: { variante: "error", etiqueta: "Cancelado" },
};

interface BadgeEstadoCicloProps {
    estado: string;
    tamaño?: "sm" | "md" | "lg";
    className?: string;
}

/**
 * Muestra un badge con el estado del ciclo de vida de un grupo.
 * Mapea los estados (próximo, activo, archivado, cancelado) a colores semánticos.
 */
export function BadgeEstadoCiclo({
    estado,
    tamaño = "sm",
    className,
}: BadgeEstadoCicloProps) {
    const config = CONFIG_ESTADO[estado as EstadoCiclo] ?? {
        variante: "default" as const,
        etiqueta: estado,
    };

    return (
        <BadgeSistema
            variante={config.variante}
            tamaño={tamaño}
            className={className}
        >
            {config.etiqueta}
        </BadgeSistema>
    );
}
