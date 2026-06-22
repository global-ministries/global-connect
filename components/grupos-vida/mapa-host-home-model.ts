export interface GrupoMapa {
    id: string;
    nombre: string;
    latitud: number;
    longitud: number;
    dia_reunion: string | null;
    hora_reunion: string | null;
    estado_ciclo: string;
    segmento: string;
    temporada: string;
    total_miembros: number;
    capacidad_maxima: number | null;
    casa_id: string;
    barrio: string | null;
    notas_publicas: string | null;
}

export function describeHostHomeLocation(grupo: Pick<GrupoMapa, "barrio" | "notas_publicas">) {
    const barrio = grupo.barrio?.trim();
    const publicNotes = grupo.notas_publicas?.trim() || null;

    return {
        locationTypeLabel: "Casa Anfitriona",
        publicLocationLabel: barrio ? `Barrio ${barrio}` : "Ubicación aprobada; dirección exacta reservada",
        publicNotes,
        privacyMessage: "La dirección exacta se comparte únicamente por canales autorizados del grupo.",
    };
}
