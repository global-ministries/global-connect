"use client";

import { useState, useEffect, useCallback } from "react";
import { TarjetaSistema, TextoSistema, BotonSistema, InputSistema } from "@/components/ui/sistema-diseno";
import { createClient } from "@/lib/supabase/client";
import { Search, UserPlus, Users, Heart } from "lucide-react";
import Image from "next/image";

interface Usuario {
    id: string;
    nombre: string;
    apellido: string;
    foto_perfil_url: string | null;
}

interface LiderParejaSelectorProps {
    grupoId: string;
    onSeleccionar: (liderId: string, incluirConyugue: boolean) => void;
    cargando?: boolean;
}

/**
 * Selector de líder con detección automática de cónyuge.
 * Busca usuarios por nombre, detecta si tienen pareja registrada,
 * y permite incluir al cónyuge como co-líder.
 */
export function LiderParejaSelector({
    grupoId,
    onSeleccionar,
    cargando = false,
}: LiderParejaSelectorProps) {
    const [busqueda, setBusqueda] = useState("");
    const [resultados, setResultados] = useState<
        (Usuario & { ya_es_miembro: boolean; email: string; telefono: string })[]
    >([]);
    const [conyugue, setConyugue] = useState<Usuario | null>(null);
    const [seleccionado, setSeleccionado] = useState<string | null>(null);
    const [incluirConyugue, setIncluirConyugue] = useState(true);
    const [buscando, setBuscando] = useState(false);

    const buscar = useCallback(async () => {
        if (busqueda.trim().length < 2) {
            setResultados([]);
            return;
        }

        setBuscando(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase.rpc("buscar_usuarios_para_grupo", {
                p_auth_id: user.id,
                p_grupo_id: grupoId,
                p_query: busqueda.trim(),
                p_limit: 10,
            });

            if (data) {
                setResultados(
                    data.map((u: { id: string; nombre: string; apellido: string; ya_es_miembro: boolean; email: string; telefono: string }) => ({
                        id: u.id,
                        nombre: u.nombre,
                        apellido: u.apellido,
                        foto_perfil_url: null,
                        ya_es_miembro: u.ya_es_miembro,
                        email: u.email,
                        telefono: u.telefono,
                    }))
                );
            }
        } finally {
            setBuscando(false);
        }
    }, [busqueda, grupoId]);

    // Debounce búsqueda
    useEffect(() => {
        const timer = setTimeout(buscar, 400);
        return () => clearTimeout(timer);
    }, [buscar]);

    // Buscar cónyuge cuando seleccionamos un líder
    useEffect(() => {
        if (!seleccionado) {
            setConyugue(null);
            return;
        }

        const buscarConyugue = async () => {
            const supabase = createClient();
            const { data } = await supabase.rpc("obtener_conyugue", {
                p_usuario_id: seleccionado,
            });
            if (data && data.length > 0) {
                setConyugue(data[0]);
            } else {
                setConyugue(null);
            }
        };

        buscarConyugue();
    }, [seleccionado]);

    const handleSeleccionarLider = (usuarioId: string) => {
        setSeleccionado(usuarioId);
        setIncluirConyugue(true);
    };

    const handleConfirmar = () => {
        if (!seleccionado) return;
        onSeleccionar(seleccionado, incluirConyugue && conyugue !== null);
    };

    const liderInfo = seleccionado
        ? resultados.find((r) => r.id === seleccionado)
        : null;

    return (
        <div className="space-y-4">
            {/* Barra de búsqueda */}
            <InputSistema
                label="Buscar líder"
                icono={Search}
                placeholder="Nombre, apellido o email..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
            />

            {/* Resultados de búsqueda */}
            {resultados.length > 0 && !seleccionado && (
                <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {resultados.map((usuario) => (
                        <button
                            key={usuario.id}
                            type="button"
                            disabled={usuario.ya_es_miembro}
                            onClick={() => handleSeleccionarLider(usuario.id)}
                            className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors duration-200 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                                {usuario.foto_perfil_url ? (
                                    <Image
                                        src={usuario.foto_perfil_url}
                                        alt={`${usuario.nombre} ${usuario.apellido}`}
                                        fill
                                        className="object-cover"
                                        sizes="32px"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
                                        {usuario.nombre[0]}
                                        {usuario.apellido[0]}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 overflow-hidden">
                                <TextoSistema tamaño="sm" className="truncate font-medium">
                                    {usuario.nombre} {usuario.apellido}
                                </TextoSistema>
                                {usuario.ya_es_miembro && (
                                    <TextoSistema variante="muted" tamaño="sm">
                                        Ya es miembro del grupo
                                    </TextoSistema>
                                )}
                            </div>
                            {!usuario.ya_es_miembro && (
                                <UserPlus className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            )}
                        </button>
                    ))}
                </div>
            )}

            {buscando && (
                <TextoSistema variante="muted" tamaño="sm">
                    Buscando...
                </TextoSistema>
            )}

            {/* Líder seleccionado + cónyuge */}
            {seleccionado && liderInfo && (
                <TarjetaSistema variante="elevated" className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <TextoSistema className="font-medium">
                                {liderInfo.nombre} {liderInfo.apellido}
                            </TextoSistema>
                            <TextoSistema variante="muted" tamaño="sm">
                                Seleccionado como líder
                            </TextoSistema>
                        </div>
                    </div>

                    {conyugue ? (
                        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                            <Heart className="h-4 w-4 text-pink-500" />
                            <div className="flex-1">
                                <TextoSistema tamaño="sm" className="font-medium">
                                    {conyugue.nombre} {conyugue.apellido}
                                </TextoSistema>
                                <TextoSistema variante="muted" tamaño="sm">
                                    Cónyuge
                                </TextoSistema>
                            </div>
                            <label className="flex cursor-pointer items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={incluirConyugue}
                                    onChange={(e) => setIncluirConyugue(e.target.checked)}
                                    className="h-4 w-4 rounded border-border"
                                />
                                <TextoSistema tamaño="sm">Incluir</TextoSistema>
                            </label>
                        </div>
                    ) : (
                        <TextoSistema variante="muted" tamaño="sm">
                            No tiene cónyuge registrado en el sistema
                        </TextoSistema>
                    )}

                    <div className="flex gap-2">
                        <BotonSistema
                            variante="outline"
                            tamaño="sm"
                            onClick={() => {
                                setSeleccionado(null);
                                setConyugue(null);
                            }}
                        >
                            Cambiar
                        </BotonSistema>
                        <BotonSistema
                            variante="primario"
                            tamaño="sm"
                            cargando={cargando}
                            onClick={handleConfirmar}
                        >
                            Asignar como líder{incluirConyugue && conyugue ? " (con cónyuge)" : ""}
                        </BotonSistema>
                    </div>
                </TarjetaSistema>
            )}
        </div>
    );
}
