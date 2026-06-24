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

export interface MiembroMapa {
    id: string;
    nombre: string;
    grupo_id: string;
    grupo_nombre: string;
    latitud: number;
    longitud: number;
}

type MemberMapObservableReason = "timeout" | "failure" | "invalid-coordinates";

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

export function describeMemberLocation(miembro: Pick<MiembroMapa, "nombre" | "grupo_nombre">) {
    return {
        locationTypeLabel: "Miembro",
        memberName: miembro.nombre,
        groupLabel: miembro.grupo_nombre,
        privacyMessage: "Ubicación exacta privada; uso restringido a coordinación pastoral y operativa autorizada.",
    };
}

export function hasValidMapCoordinates(point: Pick<GrupoMapa | MiembroMapa, "latitud" | "longitud">): boolean {
    return Number.isFinite(point.latitud)
        && Number.isFinite(point.longitud)
        && point.latitud >= -90
        && point.latitud <= 90
        && point.longitud >= -180
        && point.longitud <= 180;
}

export function splitValidMemberLocations<T extends Pick<MiembroMapa, "latitud" | "longitud">>(miembros: T[]) {
    const valid: T[] = [];
    let skippedCount = 0;

    for (const miembro of miembros) {
        if (hasValidMapCoordinates(miembro)) {
            valid.push(miembro);
        } else {
            skippedCount += 1;
        }
    }

    return { valid, skippedCount };
}

export function emitMemberMapObservableEvent(reason: MemberMapObservableReason, count: number): void {
    console.warn("member-map-observability", {
        phase: "member-layer",
        reason,
        count,
    });
}
