"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormCasaAnfitriona } from "@/components/grupos-vida/form-casa-anfitriona";
import { actualizarCasaAnfitriona } from "@/lib/actions/casas-anfitrionas.actions";
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

/** Datos iniciales de la casa para pre-llenar el formulario */
interface DatosIniciales {
    nombre_lugar: string;
    descripcion?: string;
    capacidad_maxima?: number;
    calle: string;
    barrio?: string;
    codigo_postal?: string;
    referencia?: string;
    estado_id?: string;
    municipio_id?: string;
    parroquia_id?: string;
    lat?: number;
    lng?: number;
    notas_publicas?: string;
    usuario_id?: string;
    disponibilidad_lunes?: boolean;
    disponibilidad_martes?: boolean;
    disponibilidad_miercoles?: boolean;
    disponibilidad_jueves?: boolean;
    disponibilidad_viernes?: boolean;
    disponibilidad_sabado?: boolean;
    disponibilidad_domingo?: boolean;
}

/** Props del componente cliente para editar casa anfitriona */
interface EditarCasaClientProps {
    casaId: string;
    datosIniciales: DatosIniciales;
    estados: UbicacionOption[];
    municipios: UbicacionOption[];
    parroquias: UbicacionOption[];
    usuarios?: UsuarioOption[];
    mostrarSelectorUsuario?: boolean;
}

/**
 * Wrapper client que conecta FormCasaAnfitriona con la server action actualizarCasaAnfitriona.
 *
 * Pre-carga los datos existentes de la casa y maneja el estado de carga,
 * toast de éxito/error, y navegación post-actualización.
 */
export function EditarCasaClient({
    casaId,
    datosIniciales,
    estados,
    municipios,
    parroquias,
    usuarios = [],
    mostrarSelectorUsuario = false,
}: EditarCasaClientProps) {
    const [cargando, setCargando] = useState(false);
    const router = useRouter();
    const toast = useNotificaciones();

    /** Envía los datos actualizados a la server action */
    async function handleSubmit(datos: Parameters<typeof actualizarCasaAnfitriona>[1]) {
        setCargando(true);
        try {
            const resultado = await actualizarCasaAnfitriona(casaId, datos);
            if (resultado.success) {
                toast.success("Casa anfitriona actualizada correctamente");
                router.push(`/grupos-vida/casas-anfitrionas/${casaId}`);
                router.refresh();
            } else {
                toast.error(resultado.error ?? "Error al actualizar la casa");
            }
        } catch {
            toast.error("Error inesperado al actualizar la casa");
        } finally {
            setCargando(false);
        }
    }

    return (
        <FormCasaAnfitriona
            datosIniciales={datosIniciales}
            casaId={casaId}
            estados={estados}
            municipios={municipios}
            parroquias={parroquias}
            usuarios={usuarios}
            mostrarSelectorUsuario={mostrarSelectorUsuario}
            cargando={cargando}
            onSubmit={handleSubmit}
            onCancelar={() => router.push(`/grupos-vida/casas-anfitrionas/${casaId}`)}
        />
    );
}
