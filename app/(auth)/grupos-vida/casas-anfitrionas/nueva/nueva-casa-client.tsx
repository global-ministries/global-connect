"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormCasaAnfitriona } from "@/components/grupos-vida/form-casa-anfitriona";
import { crearCasaAnfitriona } from "@/lib/actions/casas-anfitrionas.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";

/** Parroquia con valores para el select */
interface ParroquiaOption {
    value: string;
    label: string;
}

/** Props del componente cliente para crear casa anfitriona */
interface NuevaCasaClientProps {
    parroquias: ParroquiaOption[];
}

/**
 * Wrapper client que conecta FormCasaAnfitriona con la server action crearCasaAnfitriona.
 * Maneja el state de carga, toast de éxito/error, y navegación post-creación.
 */
export function NuevaCasaClient({ parroquias }: NuevaCasaClientProps) {
    const [cargando, setCargando] = useState(false);
    const router = useRouter();
    const toast = useNotificaciones();

    /** Envía los datos del formulario a la server action */
    async function handleSubmit(datos: Parameters<typeof crearCasaAnfitriona>[0]) {
        setCargando(true);
        try {
            const resultado = await crearCasaAnfitriona(datos);
            if (resultado.success) {
                toast.success("Casa anfitriona registrada correctamente");
                router.push("/grupos-vida/casas-anfitrionas");
                router.refresh();
            } else {
                toast.error(resultado.error ?? "Error al registrar la casa");
            }
        } catch {
            toast.error("Error inesperado al registrar la casa");
        } finally {
            setCargando(false);
        }
    }

    return (
        <FormCasaAnfitriona
            parroquias={parroquias}
            cargando={cargando}
            onSubmit={handleSubmit}
            onCancelar={() => router.push("/grupos-vida/casas-anfitrionas")}
        />
    );
}
