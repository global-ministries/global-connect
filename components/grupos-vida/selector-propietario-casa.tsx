"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Home, Loader2, Search, User, X, type LucideIcon } from "lucide-react";
import { BadgeSistema, BotonSistema, InputSistema } from "@/components/ui/sistema-diseno";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/UserAvatar";

export interface UsuarioCasaOption {
    value: string;
    label: string;
    email?: string | null;
    cedula?: string | null;
    fotoPerfilUrl?: string | null;
    yaTieneCasa?: boolean;
    puedeSeleccionar?: boolean;
    razonNoSeleccionable?: string;
}

interface SelectorPropietarioCasaProps {
    value?: string;
    usuariosIniciales?: UsuarioCasaOption[];
    casaId?: string;
    disabled?: boolean;
    onChange: (usuarioId: string) => void;
}

function getNombrePartes(usuario: UsuarioCasaOption) {
    const [nombre = usuario.label, ...resto] = usuario.label.split(" ");
    return { nombre, apellido: resto.join(" ") };
}

export function SelectorPropietarioCasa({
    value,
    usuariosIniciales = [],
    casaId,
    disabled = false,
    onChange,
}: SelectorPropietarioCasaProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultados, setResultados] = useState<UsuarioCasaOption[]>([]);
    const [selectedRemoteUser, setSelectedRemoteUser] = useState<UsuarioCasaOption | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const requestSeqRef = useRef(0);

    const selectedUser = useMemo(
        () =>
            [...usuariosIniciales, ...resultados].find((usuario) => usuario.value === value)
            ?? (selectedRemoteUser?.value === value ? selectedRemoteUser : null),
        [resultados, selectedRemoteUser, usuariosIniciales, value]
    );

    const resultadosOrdenados = useMemo(
        () => resultados
            .map((usuario, index) => ({ usuario, index }))
            .sort((a, b) => {
                const aDisabled = a.usuario.puedeSeleccionar === false;
                const bDisabled = b.usuario.puedeSeleccionar === false;
                if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
                return a.index - b.index;
            })
            .map(({ usuario }) => usuario),
        [resultados]
    );

    useEffect(() => {
        if (!open) return;

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            requestSeqRef.current += 1;
            abortRef.current?.abort();
            setResultados([]);
            setError(null);
            setLoading(false);
            return;
        }

        timeoutRef.current = setTimeout(async () => {
            abortRef.current?.abort();
            const controller = new AbortController();
            const requestSeq = requestSeqRef.current + 1;
            requestSeqRef.current = requestSeq;
            abortRef.current = controller;
            setLoading(true);
            setError(null);

            const isCurrentRequest = () =>
                requestSeqRef.current === requestSeq &&
                abortRef.current === controller &&
                !controller.signal.aborted;

            try {
                const params = new URLSearchParams({ q: trimmedQuery, limit: "30" });
                if (casaId) params.set("casaId", casaId);

                const response = await fetch(`/api/casas-anfitrionas/propietarios/buscar?${params.toString()}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    throw new Error(payload?.error ?? "No se pudo buscar propietarios");
                }

                const payload = await response.json();
                if (!isCurrentRequest()) return;
                setResultados(Array.isArray(payload.usuarios) ? payload.usuarios : []);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") return;
                if (!isCurrentRequest()) return;
                setResultados([]);
                setError(err instanceof Error ? err.message : "Error al buscar propietarios");
            } finally {
                if (isCurrentRequest()) setLoading(false);
            }
        }, 300);

        return () => {
            requestSeqRef.current += 1;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            abortRef.current?.abort();
        };
    }, [casaId, open, query]);

    const handleSelect = (usuario: UsuarioCasaOption) => {
        if (usuario.puedeSeleccionar === false) return;
        setSelectedRemoteUser(usuario);
        onChange(usuario.value);
        setOpen(false);
        setQuery("");
        setResultados([]);
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">¿A quién pertenece esta casa?</label>
            <div className="rounded-2xl border border-border bg-card/50 p-4">
                {selectedUser ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                            <AvatarUsuario usuario={selectedUser} />
                            <div className="min-w-0">
                                <p className="font-medium text-foreground truncate">{selectedUser.label}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                    {selectedUser.email || "Sin correo"} · C.I. {selectedUser.cedula || "sin cédula"}
                                </p>
                            </div>
                        </div>
                        <BotonSistema type="button" variante="outline" onClick={() => setOpen(true)} disabled={disabled}>
                            Cambiar propietario
                        </BotonSistema>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                                <Home className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">Sin propietario seleccionado</p>
                                <p className="text-xs">Busca por nombre, apellido, cédula o correo.</p>
                            </div>
                        </div>
                        <BotonSistema type="button" variante="primario" onClick={() => setOpen(true)} disabled={disabled}>
                            Buscar propietario
                        </BotonSistema>
                    </div>
                )}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden p-0 sm:max-w-2xl">
                    <DialogHeader className="shrink-0 px-4 pb-0 pt-4 sm:px-6 sm:pt-6">
                        <DialogTitle>Seleccionar propietario</DialogTitle>
                        <DialogDescription>
                            Solo aparecen personas activas en un grupo de vida y dentro de tu alcance de permisos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 sm:px-6 sm:pb-6">
                        <div className="shrink-0">
                            <InputSistema
                                autoFocus
                                icono={Search}
                                label="Buscar persona"
                                placeholder="Nombre, apellido, cédula o correo..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/50">
                            <div className="max-h-[min(52dvh,24rem)] overflow-y-auto overscroll-contain">
                                {query.trim().length < 2 && (
                                    <EstadoVacio icono={Search} texto="Escribe al menos 2 caracteres para buscar." />
                                )}

                                {query.trim().length >= 2 && loading && (
                                    <EstadoVacio icono={Loader2} texto="Buscando personas..." animado />
                                )}

                                {query.trim().length >= 2 && !loading && error && (
                                    <EstadoVacio icono={X} texto={error} variante="error" />
                                )}

                                {query.trim().length >= 2 && !loading && !error && resultados.length === 0 && (
                                    <EstadoVacio icono={User} texto="No se encontraron personas disponibles con ese criterio." />
                                )}

                                {resultadosOrdenados.map((usuario) => (
                                    <button
                                        key={usuario.value}
                                        type="button"
                                        disabled={usuario.puedeSeleccionar === false}
                                        onClick={() => handleSelect(usuario)}
                                        className={`w-full border-b border-border p-3 text-left transition-colors last:border-b-0 ${
                                            usuario.puedeSeleccionar === false
                                                ? "cursor-not-allowed bg-muted/40 opacity-60"
                                                : value === usuario.value
                                                    ? "bg-accent ring-1 ring-inset ring-[var(--brand-primary)]"
                                                    : "bg-background/80 hover:bg-accent/50"
                                        }`}
                                    >
                                        <div className="flex min-w-0 items-start gap-3">
                                            <AvatarUsuario usuario={usuario} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                                                    <span className="min-w-0 truncate font-medium text-foreground" title={usuario.label}>{usuario.label}</span>
                                                    {usuario.yaTieneCasa ? (
                                                        <BadgeSistema variante="warning" tamaño="sm">Ya tiene casa</BadgeSistema>
                                                    ) : (
                                                        <BadgeSistema variante="success" tamaño="sm">Disponible</BadgeSistema>
                                                    )}
                                                </div>
                                                <p
                                                    className="max-w-full truncate text-sm text-muted-foreground"
                                                    title={`${usuario.email || "Sin correo"} · C.I. ${usuario.cedula || "sin cédula"}`}
                                                >
                                                    {usuario.email || "Sin correo"} · C.I. {usuario.cedula || "sin cédula"}
                                                </p>
                                                {usuario.razonNoSeleccionable && (
                                                    <p className="mt-1 truncate text-xs text-amber-700 dark:text-amber-400" title={usuario.razonNoSeleccionable}>
                                                        {usuario.razonNoSeleccionable}
                                                    </p>
                                                )}
                                            </div>
                                            {value === usuario.value && (
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex shrink-0 justify-end">
                            <BotonSistema type="button" variante="outline" onClick={() => setOpen(false)}>
                                Cancelar
                            </BotonSistema>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function AvatarUsuario({ usuario }: { usuario: UsuarioCasaOption }) {
    const { nombre, apellido } = getNombrePartes(usuario);

    return (
        <UserAvatar
            photoUrl={usuario.fotoPerfilUrl ?? null}
            nombre={nombre}
            apellido={apellido}
            size="md"
        />
    );
}

function EstadoVacio({
    icono: Icono,
    texto,
    animado = false,
    variante = "default",
}: {
    icono: LucideIcon;
    texto: string;
    animado?: boolean;
    variante?: "default" | "error";
}) {
    return (
        <div className={`flex items-center gap-2 p-4 text-sm ${variante === "error" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            <Icono className={`h-4 w-4 ${animado ? "animate-spin" : ""}`} />
            {texto}
        </div>
    );
}
