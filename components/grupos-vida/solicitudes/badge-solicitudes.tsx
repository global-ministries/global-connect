"use client";

import { BadgeSistema } from "@/components/ui/sistema-diseno";

interface BadgeSolicitudesProps {
    /** Cantidad de solicitudes pendientes */
    cantidad: number;
    className?: string;
}

/**
 * Badge que muestra el conteo de solicitudes pendientes.
 * Diseñado para usarse en el sidebar como indicador visual.
 * No renderiza nada si el conteo es 0.
 */
export function BadgeSolicitudes({ cantidad, className }: BadgeSolicitudesProps) {
    if (cantidad <= 0) return null;

    return (
        <BadgeSistema
            variante="warning"
            tamaño="sm"
            className={className}
        >
            {cantidad > 99 ? "99+" : cantidad}
        </BadgeSistema>
    );
}
