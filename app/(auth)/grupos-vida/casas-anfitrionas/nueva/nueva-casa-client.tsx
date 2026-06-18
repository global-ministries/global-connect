"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormCasaAnfitriona } from "@/components/grupos-vida/form-casa-anfitriona";
import { crearCasaAnfitriona } from "@/lib/actions/casas-anfitrionas.actions";
import { useNotificaciones } from "@/hooks/use-notificaciones";

/** Opción para selects de ubicación */
interface UbicacionOption {
    value: string;
    label: string;
    parentId?: string;
}

/** Opción de usuario */
interface UsuarioOption {
    value: string;
    label: string;
    email?: string | null;
    cedula?: string | null;
    fotoPerfilUrl?: string | null;
    yaTieneCasa?: boolean;
    puedeSeleccionar?: boolean;
    razonNoSeleccionable?: string;
}

/** Props del componente cliente para crear casa anfitriona */
interface NuevaCasaClientProps {
    estados: UbicacionOption[];
    municipios: UbicacionOption[];
    parroquias: UbicacionOption[];
    usuarios?: UsuarioOption[];
    mostrarSelectorUsuario?: boolean;
}

/**
 * Wrapper client que conecta FormCasaAnfitriona con la server action crearCasaAnfitriona.
 *
 * Maneja el estado de carga, toast de éxito/error, y navegación post-creación.
 * Pasa los catálogos de ubicación y la lista de usuarios al formulario.
 */
export function NuevaCasaClient({
    estados,
    municipios,
    parroquias,
    usuarios = [],
    mostrarSelectorUsuario = false,
}: NuevaCasaClientProps) {
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
            estados={estados}
            municipios={municipios}
            parroquias={parroquias}
            usuarios={usuarios}
            mostrarSelectorUsuario={mostrarSelectorUsuario}
            cargando={cargando}
            onSubmit={handleSubmit}
            onCancelar={() => router.push("/grupos-vida/casas-anfitrionas")}
        />
    );
}
