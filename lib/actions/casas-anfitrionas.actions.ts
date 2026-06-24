"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { extraerRelacion } from "@/lib/supabase/helpers";
import { REVIEW_DECISION_NOTES_MAX_LENGTH } from "@/lib/casas-anfitrionas/review-constants";

// ─── Schemas ─────────────────────────────────────────────────────────

const crearCasaSchema = z.object({
  nombre_lugar: z.string().min(2, "Nombre del lugar es requerido"),
  descripcion: z.string().optional(),
  capacidad_maxima: z.number().min(1).max(200).optional(),
  calle: z.string().min(2, "La calle es requerida"),
  barrio: z.string().optional(),
  codigo_postal: z.string().optional(),
  referencia: z.string().optional(),
  parroquia_id: z.string().uuid().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notas_publicas: z.string().optional(),
  disponibilidad: z.array(z.string()).optional(),
  usuario_id: z.string().uuid().optional(),
  co_anfitrion_id: z.string().uuid().optional(),
});

const actualizarCasaSchema = crearCasaSchema.partial();

const scopeSchema = z.enum(["active", "planned"], {
  errorMap: () => ({ message: "Scope inválido" }),
});

const scopeInputSchema = z.object({ scope: scopeSchema.default("active") }).default({ scope: "active" });
const missingHostHomeInputSchema = z.object({
  scope: scopeSchema.default("active"),
  includeLeaders: z.boolean().default(false),
}).default({ scope: "active", includeLeaders: false });

const assignmentInputSchema = z.object({
  groupId: z.string().uuid("Grupo inválido"),
  casaId: z.string().uuid("Casa inválida"),
});

const reviewDecisionInputSchema = z.object({
  reviewId: z.string().uuid("Revisión inválida"),
  accion: z.enum(["aprobar", "rechazar"], { errorMap: () => ({ message: "Acción inválida" }) }),
  notas: z.string().max(REVIEW_DECISION_NOTES_MAX_LENGTH, "Notas demasiado largas").nullable().optional(),
});

const countSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const count = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(count) || count < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Conteo inválido" });
    return z.NEVER;
  }
  return count;
});

const hostHomeMapRowSchema = z.object({
  grupo_id: z.string().uuid(),
  grupo_nombre: z.string(),
  dia_reunion: z.string().nullable(),
  hora_reunion: z.string().nullable(),
  capacidad_maxima: z.number().nullable(),
  estado_ciclo: z.string().nullable(),
  segmento: z.string().nullable(),
  temporada: z.string().nullable(),
  casa_id: z.string().uuid(),
  casa_nombre: z.string(),
  latitud: z.number(),
  longitud: z.number(),
  barrio: z.string().nullable(),
  notas_publicas: z.string().nullable(),
  total_miembros: countSchema,
});

const missingHostHomeRowSchema = z.object({
  grupo_id: z.string().uuid(),
  grupo_nombre: z.string(),
  estado_ciclo: z.string().nullable(),
  segmento: z.string().nullable(),
  temporada: z.string().nullable(),
  lideres: z.array(z.string()).optional(),
});

const pendingReviewRowSchema = z.object({
  review_id: z.string().uuid(),
  casa_id: z.string().uuid(),
  casa_nombre: z.string(),
  review_type: z.enum(["create", "location_change"]),
  created_at: z.string(),
  requested_by: z.string().nullable(),
});

const memberMapRowSchema = z.object({
  usuario_id: z.string().uuid(),
  nombre: z.string(),
  grupo_id: z.string().uuid(),
  grupo_nombre: z.string(),
  latitud: z.number(),
  longitud: z.number(),
});

const assignmentResultSchema = z.object({
  ok: z.literal(true),
  grupo_id: z.string().uuid(),
  casa_id: z.string().uuid(),
});

const reviewDecisionResultSchema = z.object({
  ok: z.literal(true),
  accion: z.enum(["aprobar", "rechazar"]),
  review_id: z.string().uuid(),
});

// ─── Types ───────────────────────────────────────────────────────────

interface ResultadoAccion<T = void> {
  success: boolean;
  error?: string;
  data?: T;
}

type RpcClient = Awaited<ReturnType<typeof createSupabaseServerClient>> | ReturnType<typeof createSupabaseAdminClient>;
type ServerRpcClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcError = { message: string; code?: string; details?: string; hint?: string };
type RpcResponse = { data: unknown; error: RpcError | null };
type ScopeValue = z.infer<typeof scopeSchema>;
type CasasMapRpcArgsByName = {
  obtener_mapa_grupos_vida_host_homes: { p_auth_id: string; p_scope: ScopeValue };
  obtener_grupos_sin_casa_anfitriona: { p_auth_id: string; p_scope: ScopeValue };
  obtener_casas_revision_pendiente: { p_auth_id: string };
  obtener_mapa_miembros: { p_auth_id: string; p_scope: ScopeValue };
  asignar_casa_anfitriona_a_grupo: { p_auth_id: string; p_grupo_id: string; p_casa_id: string };
  procesar_revision_ubicacion_casa: {
    p_auth_id: string;
    p_review_id: string;
    p_accion: "aprobar" | "rechazar";
    p_notas: string | null;
  };
};
type CasasMapRpcName = keyof CasasMapRpcArgsByName;
type ScopedRowsRpcName =
  | "obtener_mapa_grupos_vida_host_homes"
  | "obtener_grupos_sin_casa_anfitriona"
  | "obtener_mapa_miembros";
type ReadOnlyCasasMapRpcName = ScopedRowsRpcName | "obtener_casas_revision_pendiente";
type RpcLogPhase = "admin_client_setup" | "parse_response" | "rpc_error" | "rpc_exception";
type DatosMapaGrupoHostHomeItem = z.infer<typeof hostHomeMapRowSchema>;
type GrupoSinCasaAnfitrionaItem = z.infer<typeof missingHostHomeRowSchema>;
type CasaRevisionPendienteItem = z.infer<typeof pendingReviewRowSchema>;
type MapaMiembroItem = z.infer<typeof memberMapRowSchema>;
type AsignacionCasaGrupoResultado = z.infer<typeof assignmentResultSchema>;
type RevisionUbicacionResultado = z.infer<typeof reviewDecisionResultSchema>;
type GroupLeaderMembershipRow = {
  grupo_id: string;
  rol: string;
  usuarios: unknown;
};
type SortableGroupLeaderRow = {
  grupoId: string;
  leaderName: string;
  role: string;
};

/** Resultado de la RPC de aprobación de casa anfitriona */
interface AprobacionCasaResultado {
  ok: boolean;
  estado?: string;
}

/** Item de la lista de casas anfitrionas */
interface CasaAnfitrionaListItem {
  id: string;
  nombre_lugar: string;
  descripcion: string | null;
  capacidad_maxima: number | null;
  activa: boolean;
  aprobada: boolean;
  fotos_urls: string[] | null;
  notas_publicas: string | null;
  creado_en: string;
  usuarios: {
    id: string;
    nombre: string;
    apellido: string;
    foto_perfil_url: string | null;
  } | null;
  direcciones: {
    calle: string;
    barrio: string | null;
    latitud: number | null;
    longitud: number | null;
  } | null;
}

/** Datos para el mapa de grupos de vida (columnas de v_mapa_grupos_vida) */
interface DatosMapaGrupoItem {
  id: string;
  nombre: string;
  dia_reunion: string | null;
  hora_reunion: string | null;
  capacidad_maxima: number | null;
  estado_ciclo: string | null;
  segmento: string | null;
  temporada: string | null;
  lugar_reunion: string | null;
  latitud: number | null;
  longitud: number | null;
  direccion: string | null;
  total_miembros: number | null;
  lideres: Array<{ nombre: string; foto: string | null }> | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function validarAuthBasica(): Promise<{
  supabase: ServerRpcClient;
  authId: string;
  error?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      authId: "",
      error: "Usuario no autenticado",
    };
  }

  return { supabase, authId: user.id };
}

async function obtenerUsuarioInternoId(supabase: ServerRpcClient, authId: string): Promise<string | null> {
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("id")
    .eq("auth_id", authId)
    .single();

  return usuario?.id ?? null;
}

async function validarAuthYPermisos(requiereGestion = false): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  authId: string;
  error?: string;
}> {
  const auth = await validarAuthBasica();
  if (auth.error) {
    return {
      supabase: auth.supabase,
      userId: "",
      authId: "",
      error: auth.error,
    };
  }

  const { supabase, authId } = auth;

  // Obtener usuario interno
  const userId = await obtenerUsuarioInternoId(supabase, authId);

  if (!userId) {
    return {
      supabase,
      userId: "",
      authId,
      error: "Usuario no encontrado",
    };
  }

  if (requiereGestion) {
    const { data: puede } = await supabase.rpc("puede_gestionar_casas", {
      p_auth_id: authId,
    });
    if (!puede) {
      return {
        supabase,
        userId,
        authId,
        error: "No tienes permisos para gestionar casas anfitrionas",
      };
    }
  }

  return { supabase, userId, authId };
}

async function verificarPermisoCasa(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rpcName:
    | "puede_aprobar_casa_anfitriona"
    | "puede_cambiar_estado_casa_anfitriona"
    | "puede_editar_casa_anfitriona"
    | "puede_ver_casa_anfitriona",
  authId: string,
  casaId: string,
  error: string
): Promise<string | null> {
  const { data: puede, error: rpcError } = await supabase.rpc(rpcName, {
    p_auth_id: authId,
    p_casa_id: casaId,
  });

  if (rpcError) return rpcError.message;
  return puede ? null : error;
}

async function verificarUsuarioEnScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  authId: string,
  usuarioId: string,
  error: string
): Promise<string | null> {
  const { data: puede, error: rpcError } = await supabase.rpc(
    "puede_crear_casa_anfitriona_para",
    {
      p_auth_id: authId,
      p_usuario_id: usuarioId,
    }
  );

  if (rpcError) return rpcError.message;
  return puede ? null : error;
}

async function verificarUsuarioEnGrupoActivo(
  adminDb: ReturnType<typeof createSupabaseAdminClient>,
  usuarioId: string,
  error: string
): Promise<string | null> {
  const { data, error: queryError } = await adminDb
    .from("grupo_miembros")
    .select("id, grupos!inner(id)")
    .eq("usuario_id", usuarioId)
    .is("fecha_salida", null)
    .eq("grupos.activo", true)
    .eq("grupos.eliminado", false)
    .limit(1);

  if (queryError) return queryError.message;
  return data && data.length > 0 ? null : error;
}

async function verificarUsuarioSinCasaAsignada(
  adminDb: ReturnType<typeof createSupabaseAdminClient>,
  usuarioId: string,
  currentCasaId: string | undefined,
  error: string
): Promise<string | null> {
  let query = adminDb
    .from("casas_anfitrionas")
    .select("id")
    .or(`usuario_id.eq.${usuarioId},co_anfitrion_id.eq.${usuarioId}`);

  if (currentCasaId) {
    query = query.neq("id", currentCasaId);
  }

  const { data, error: queryError } = await query.limit(1);
  if (queryError) return queryError.message;
  return data && data.length > 0 ? error : null;
}

async function validarUsuarioAsignableACasa({
  adminDb,
  usuarioId,
  currentCasaId,
  etiqueta,
}: {
  adminDb: ReturnType<typeof createSupabaseAdminClient>;
  usuarioId: string;
  currentCasaId?: string;
  etiqueta: "propietario" | "co-anfitrión";
}): Promise<string | null> {
  const groupError = await verificarUsuarioEnGrupoActivo(
    adminDb,
    usuarioId,
    `El ${etiqueta} debe pertenecer actualmente a un grupo de vida`
  );
  if (groupError) return groupError;

  return verificarUsuarioSinCasaAsignada(
    adminDb,
    usuarioId,
    currentCasaId,
    etiqueta === "propietario"
      ? "Este usuario ya tiene una casa anfitriona asignada"
      : "Este co-anfitrión ya tiene una casa anfitriona asignada"
  );
}

async function validarUsuarioConsultable(usuarioId: string): Promise<string | null> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return error;

  return verificarUsuarioEnScope(
    supabase,
    authId,
    usuarioId,
    "No tienes permisos para consultar este usuario"
  );
}

function tieneEdicionSensible(datos: z.infer<typeof actualizarCasaSchema>): boolean {
  return [
    "capacidad_maxima",
    "calle",
    "barrio",
    "codigo_postal",
    "co_anfitrion_id",
    "disponibilidad",
    "lat",
    "lng",
    "parroquia_id",
    "referencia",
    "usuario_id",
  ].some((campo) => campo in datos);
}

function revalidarCasa(casaId: string): void {
  revalidatePath("/grupos-vida/casas-anfitrionas");
  revalidatePath(`/grupos-vida/casas-anfitrionas/${casaId}`);
}

function formatZodError(error: z.ZodError): string {
  return error.errors.map((issue) => issue.message).join(" | ");
}

const genericMutationError = "No pudimos completar la solicitud. Intenta nuevamente.";
const staleAssignmentQueueError = "El grupo ya no está en la cola de asignación. Actualiza la página e inténtalo nuevamente.";
const groupLeaderRoles = ["Líder", "Colíder"] as const;
const groupLeaderRolePriority = new Map<string, number>(groupLeaderRoles.map((role, index) => [role, index]));

const safeRpcErrorMessages = {
  accion_invalida: "La acción solicitada no es válida",
  casa_en_uso: "La casa anfitriona ya está en uso",
  estado_invalido: "El estado solicitado no es válido",
  invalid_state: "El estado solicitado no es válido",
  revision_invalida: "La revisión solicitada no es válida",
  sin_permisos: "No tienes permisos para realizar esta acción",
} satisfies Record<string, string>;

function isSafeRpcErrorKey(key: string): key is keyof typeof safeRpcErrorMessages {
  return Object.prototype.hasOwnProperty.call(safeRpcErrorMessages, key);
}

function clientSafeRpcError(error: RpcError): string {
  const key = error.message.trim().toLowerCase();
  if (isSafeRpcErrorKey(key)) return safeRpcErrorMessages[key];
  return genericMutationError;
}

function getErrorLogMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: "Server action failure details redacted" };
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
    const message = typeof candidate.message === "string" ? candidate.message.trim().toLowerCase() : undefined;
    return {
      code: typeof candidate.code === "string" ? candidate.code : message && isSafeRpcErrorKey(message) ? message : undefined,
      name: typeof candidate.name === "string" ? candidate.name : undefined,
      message: "RPC failure details redacted",
    };
  }

  return { message: "Unknown server action failure details redacted" };
}

function logCasasMapServerIssue(
  rpcName: CasasMapRpcName,
  phase: RpcLogPhase,
  error: unknown
): void {
  console.error("[casas-anfitrionas.actions]", {
    rpcName,
    phase,
    error: getErrorLogMetadata(error),
  });
}

function createCasasMapAdminClient(
  rpcName: CasasMapRpcName
): ResultadoAccion<ReturnType<typeof createSupabaseAdminClient>> {
  try {
    return { success: true, data: createSupabaseAdminClient() };
  } catch (error) {
    logCasasMapServerIssue(rpcName, "admin_client_setup", error);
    return { success: false, error: genericMutationError };
  }
}

async function callCasasMapRpc<Name extends CasasMapRpcName>(
  client: RpcClient,
  rpcName: Name,
  args: CasasMapRpcArgsByName[Name]
): Promise<RpcResponse> {
  const rpcClient = client as unknown as {
    rpc(name: Name, rpcArgs: CasasMapRpcArgsByName[Name]): Promise<RpcResponse>;
  };
  return rpcClient.rpc(rpcName, args);
}

async function executeCasasMapRpc<Name extends CasasMapRpcName>(
  client: RpcClient,
  rpcName: Name,
  args: CasasMapRpcArgsByName[Name]
): Promise<ResultadoAccion<unknown>> {
  try {
    const { data, error } = await callCasasMapRpc(client, rpcName, args);
    if (error) {
      logCasasMapServerIssue(rpcName, "rpc_error", error);
      return { success: false, error: clientSafeRpcError(error) };
    }
    return { success: true, data };
  } catch (error) {
    logCasasMapServerIssue(rpcName, "rpc_exception", error);
    return { success: false, error: genericMutationError };
  }
}

async function executeCasasMapReadRpc<Name extends ReadOnlyCasasMapRpcName>(
  rpcName: Name,
  args: CasasMapRpcArgsByName[Name],
  fallbackClient?: ServerRpcClient
): Promise<ResultadoAccion<unknown>> {
  const adminResult = createCasasMapAdminClient(rpcName);
  if (!adminResult.success || !adminResult.data) {
    if (fallbackClient) return executeCasasMapRpc(fallbackClient, rpcName, args);
    return { success: false, error: adminResult.error ?? genericMutationError };
  }

  const adminResponse = await executeCasasMapRpc(adminResult.data, rpcName, args);
  if (!adminResponse.success && fallbackClient) return executeCasasMapRpc(fallbackClient, rpcName, args);

  return adminResponse;
}

function parseRpcArray<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown,
  rpcName: CasasMapRpcName
): ResultadoAccion<T[]> {
  const parsed = z.array(schema).safeParse(data);
  if (!parsed.success) {
    logCasasMapServerIssue(rpcName, "parse_response", new Error("Unexpected RPC array payload"));
    return { success: false, error: "Respuesta inesperada del servidor" };
  }
  return { success: true, data: parsed.data };
}

function parseRpcObject<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  data: unknown,
  rpcName: CasasMapRpcName
): ResultadoAccion<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logCasasMapServerIssue(rpcName, "parse_response", new Error("Unexpected RPC object payload"));
    return { success: false, error: "Respuesta inesperada del servidor" };
  }
  return { success: true, data: parsed.data };
}

const maxRoleNormalizationDepth = 4;

function getRoleName(role: unknown): string | null {
  if (typeof role === "string") return role;
  if (typeof role === "object" && role !== null && "nombre_interno" in role && typeof role.nombre_interno === "string") {
    return role.nombre_interno;
  }
  return null;
}

function normalizeRoleNames(value: unknown, depth = 0): string[] {
  const roleName = getRoleName(value);
  if (roleName !== null) return [roleName];

  if (!Array.isArray(value) || depth >= maxRoleNormalizationDepth) return [];
  return value.flatMap((entry) => normalizeRoleNames(entry, depth + 1));
}

async function obtenerRolesDashboardCasas(supabase: ServerRpcClient, authId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("obtener_roles_usuario", { p_auth_id: authId });
  if (error || !Array.isArray(data)) return new Set();

  return new Set(normalizeRoleNames(data));
}

function puedeVerTodasLasColasCasas(roles: Set<string>): boolean {
  return roles.has("admin") || roles.has("pastor");
}

function puedeSolicitarColaGruposSinCasa(roles: Set<string>): boolean {
  return puedeVerTodasLasColasCasas(roles)
    || roles.has("director-general")
    || roles.has("director-etapa")
    || roles.has("lider");
}

function puedeSolicitarColaRevisionCasas(roles: Set<string>): boolean {
  return puedeVerTodasLasColasCasas(roles) || roles.has("director-general");
}

function puedeSolicitarMapaMiembros(roles: Set<string>): boolean {
  return roles.has("admin")
    || roles.has("director-general")
    || roles.has("director-etapa");
}

async function obtenerGruposLideradosDashboard(supabase: ServerRpcClient, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("grupo_miembros")
    .select("grupo_id")
    .eq("usuario_id", userId)
    .is("fecha_salida", null)
    .in("rol", ["Líder", "Colíder"]);

  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row) => row.grupo_id).filter((id): id is string => typeof id === "string"));
}

async function obtenerGruposDirectorEtapaDashboard(supabase: ServerRpcClient, userId: string): Promise<Set<string>> {
  const { data: directorEtapas, error: directorError } = await supabase
    .from("segmento_lideres")
    .select("id")
    .eq("usuario_id", userId)
    .eq("tipo_lider", "director_etapa");

  if (directorError || !Array.isArray(directorEtapas)) return new Set();

  const directorEtapaIds = directorEtapas
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
  if (directorEtapaIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("director_etapa_grupos")
    .select("grupo_id")
    .in("director_etapa_id", directorEtapaIds);

  if (error || !Array.isArray(data)) return new Set();
  return new Set(data.map((row) => row.grupo_id).filter((id): id is string => typeof id === "string"));
}

async function filtrarGruposSinCasaParaDashboard(
  supabase: ServerRpcClient,
  userId: string,
  roles: Set<string>,
  rows: GrupoSinCasaAnfitrionaItem[]
): Promise<GrupoSinCasaAnfitrionaItem[]> {
  if (puedeVerTodasLasColasCasas(roles) || roles.has("director-general")) return rows;

  if (roles.has("director-etapa")) {
    const groupIds = await obtenerGruposDirectorEtapaDashboard(supabase, userId);
    return rows.filter((row) => groupIds.has(row.grupo_id));
  }

  if (roles.has("lider")) {
    const groupIds = await obtenerGruposLideradosDashboard(supabase, userId);
    return rows.filter((row) => groupIds.has(row.grupo_id));
  }

  return [];
}

function isGroupLeaderMembershipRow(row: unknown): row is GroupLeaderMembershipRow {
  return typeof row === "object"
    && row !== null
    && "grupo_id" in row
    && typeof row.grupo_id === "string"
    && "rol" in row
    && typeof row.rol === "string";
}

function formatLeaderName(user: { nombre: string | null; apellido: string | null } | null): string | null {
  if (!user) return null;

  const fullName = [user.nombre, user.apellido]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
}

function compareGroupLeaderRows(a: SortableGroupLeaderRow, b: SortableGroupLeaderRow): number {
  const roleComparison = (groupLeaderRolePriority.get(a.role) ?? groupLeaderRoles.length)
    - (groupLeaderRolePriority.get(b.role) ?? groupLeaderRoles.length);
  if (roleComparison !== 0) return roleComparison;

  const normalizedNameComparison = a.leaderName.localeCompare(b.leaderName, "es", { sensitivity: "base" });
  if (normalizedNameComparison !== 0) return normalizedNameComparison;

  const displayNameComparison = a.leaderName.localeCompare(b.leaderName, "es", { sensitivity: "variant" });
  if (displayNameComparison !== 0) return displayNameComparison;

  return a.grupoId.localeCompare(b.grupoId);
}

async function obtenerLideresPorGrupoVisible(
  supabase: ServerRpcClient,
  rows: GrupoSinCasaAnfitrionaItem[]
): Promise<Map<string, string[]>> {
  const groupIds = rows.map((row) => row.grupo_id);
  if (groupIds.length === 0) return new Map();

  const visibleGroupIds = new Set(groupIds);
  const { data, error } = await supabase
    .from("grupo_miembros")
    .select("grupo_id, rol, usuarios!grupo_miembros_usuario_id_fkey(nombre, apellido)")
    .in("grupo_id", groupIds)
    .is("fecha_salida", null)
    .in("rol", [...groupLeaderRoles]);

  if (error || !Array.isArray(data)) return new Map();

  const sortedLeaderRows = data
    .flatMap((row): SortableGroupLeaderRow[] => {
      if (!isGroupLeaderMembershipRow(row) || !visibleGroupIds.has(row.grupo_id)) return [];

      const user = extraerRelacion<{ nombre: string | null; apellido: string | null }>(row.usuarios);
      const leaderName = formatLeaderName(user);
      if (!leaderName) return [];

      return [{ grupoId: row.grupo_id, leaderName, role: row.rol }];
    })
    .sort(compareGroupLeaderRows);

  const leadersByGroupId = new Map<string, string[]>();
  for (const row of sortedLeaderRows) {
    const groupLeaders = leadersByGroupId.get(row.grupoId) ?? [];
    if (!groupLeaders.includes(row.leaderName)) groupLeaders.push(row.leaderName);
    leadersByGroupId.set(row.grupoId, groupLeaders);
  }

  return leadersByGroupId;
}

async function enriquecerGruposSinCasaConLideres(
  supabase: ServerRpcClient,
  rows: GrupoSinCasaAnfitrionaItem[]
): Promise<GrupoSinCasaAnfitrionaItem[]> {
  const leadersByGroupId = await obtenerLideresPorGrupoVisible(supabase, rows);
  if (leadersByGroupId.size === 0) return rows;

  return rows.map((row) => {
    const leaders = leadersByGroupId.get(row.grupo_id);
    return leaders && leaders.length > 0 ? { ...row, lideres: leaders } : row;
  });
}

async function validarGrupoEnColaAsignacion(
  supabase: ServerRpcClient,
  authId: string,
  userId: string,
  groupId: string
): Promise<string | null> {
  const roles = await obtenerRolesDashboardCasas(supabase, authId);
  if (!puedeSolicitarColaGruposSinCasa(roles)) return "No tienes permisos para realizar esta acción";

  const response = await executeCasasMapRpc(supabase, "obtener_grupos_sin_casa_anfitriona", {
    p_auth_id: authId,
    p_scope: "active",
  });

  if (!response.success) return response.error ?? genericMutationError;

  const parsed = parseRpcArray(missingHostHomeRowSchema, response.data, "obtener_grupos_sin_casa_anfitriona");
  if (!parsed.success) return parsed.error ?? genericMutationError;
  const parsedRows = parsed.data ?? [];

  const visibleQueueRows = await filtrarGruposSinCasaParaDashboard(supabase, userId, roles, parsedRows);
  return visibleQueueRows.some((row) => row.grupo_id === groupId) ? null : staleAssignmentQueueError;
}

async function obtenerRpcRows<T>(
  input: unknown,
  rpcName: ScopedRowsRpcName,
  rowSchema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<ResultadoAccion<T[]>> {
  const scope = scopeInputSchema.safeParse(input ?? {});
  if (!scope.success) return { success: false, error: formatZodError(scope.error) };

  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const response = await executeCasasMapReadRpc(rpcName, {
    p_auth_id: authId,
    p_scope: scope.data.scope,
  }, supabase);

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };
  return parseRpcArray(rowSchema, response.data, rpcName);
}

// ─── Actions ─────────────────────────────────────────────────────────

/** Familiar del usuario con su relación */
interface FamiliarRelacion {
    id: string;
    nombre: string;
    apellido: string;
    foto_perfil_url: string | null;
    tipo_relacion: string;
}

/**
 * Obtiene las relaciones familiares de un usuario.
 * Consulta la tabla relaciones_usuarios y retorna nombre, foto y tipo de relación.
 * Se usa para ofrecer co-anfitriones al crear una casa anfitriona.
 */
export async function obtenerRelacionesFamiliares(
    usuarioId: string
): Promise<ResultadoAccion<FamiliarRelacion[]>> {
    try {
        const scopeError = await validarUsuarioConsultable(usuarioId);
        if (scopeError) return { success: false, error: scopeError };

        const adminDb = createSupabaseAdminClient();

        const { data, error } = await adminDb
            .from("relaciones_usuarios")
            .select(`
                tipo_relacion,
                usuario1_id,
                usuario2_id
            `)
            .or(`usuario1_id.eq.${usuarioId},usuario2_id.eq.${usuarioId}`);

        if (error) return { success: false, error: error.message };
        if (!data || data.length === 0) return { success: true, data: [] };

        // Extraer IDs de los familiares (el otro usuario en cada relación)
        const familiarIds = data.map((r) =>
            r.usuario1_id === usuarioId ? r.usuario2_id : r.usuario1_id
        );

        // Obtener datos de los familiares
        const { data: familiares, error: fetchError } = await adminDb
            .from("usuarios")
            .select("id, nombre, apellido, foto_perfil_url")
            .in("id", familiarIds);

        if (fetchError) return { success: false, error: fetchError.message };

        // Mapear con tipo de relación
        const resultado: FamiliarRelacion[] = (familiares ?? []).map((f) => {
            const relacion = data.find(
                (r) => r.usuario1_id === f.id || r.usuario2_id === f.id
            );
            return {
                id: f.id,
                nombre: f.nombre,
                apellido: f.apellido,
                foto_perfil_url: f.foto_perfil_url,
                tipo_relacion: relacion?.tipo_relacion ?? "familiar",
            };
        });

        return { success: true, data: resultado };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Error desconocido",
        };
    }
}

/** Datos de dirección de un usuario para auto-rellenar formularios */
export interface DireccionUsuario {
  calle: string;
  barrio: string | null;
  codigo_postal: string | null;
  referencia: string | null;
  lat: number | null;
  lng: number | null;
  parroquia_id: string | null;
  municipio_id: string | null;
  estado_id: string | null;
}

/**
 * Obtiene la dirección completa de un usuario.
 * Se usa para auto-rellenar el formulario de casa anfitriona
 * al seleccionar un miembro.
 */
export async function obtenerDireccionUsuario(
  usuarioId: string
): Promise<ResultadoAccion<DireccionUsuario>> {
  try {
    const scopeError = await validarUsuarioConsultable(usuarioId);
    if (scopeError) return { success: false, error: scopeError };

    // Usar admin después de validar scope con RPC para obtener joins enriquecidos.
    const admin = createSupabaseAdminClient();
    const { data: usuario } = await admin
      .from("usuarios")
      .select(`
        direccion_id,
        direcciones!usuarios_direccion_id_fkey (
          calle, barrio, codigo_postal, referencia, latitud, longitud,
          parroquia_id,
          parroquias!direcciones_parroquia_id_fkey (
            id, municipio_id,
            municipios!parroquias_municipio_id_fkey (
              id, estado_id
            )
          )
        )
      `)
      .eq("id", usuarioId)
      .single();

    if (!usuario) return { success: false, error: "Usuario no encontrado" };

    const dir = extraerRelacion<{
      calle: string; barrio: string | null; codigo_postal: string | null;
      referencia: string | null; latitud: number | null; longitud: number | null;
      parroquia_id: string | null;
      parroquias: {
        id: string; municipio_id: string;
        municipios: { id: string; estado_id: string };
      } | null;
    }>(usuario.direcciones);

    if (!dir) return { success: false, error: "El usuario no tiene dirección registrada" };

    return {
      success: true,
      data: {
        calle: dir.calle,
        barrio: dir.barrio,
        codigo_postal: dir.codigo_postal,
        referencia: dir.referencia,
        lat: dir.latitud,
        lng: dir.longitud,
        parroquia_id: dir.parroquia_id,
        municipio_id: dir.parroquias?.municipio_id ?? null,
        estado_id: dir.parroquias?.municipios?.estado_id ?? null,
      },
    };
  } catch {
    return { success: false, error: "Error al obtener la dirección del usuario" };
  }
}

/**
 * Crea una nueva casa anfitriona y su dirección asociada.
 */
export async function crearCasaAnfitriona(
  datos: z.infer<typeof crearCasaSchema>
): Promise<ResultadoAccion<{ id: string }>> {
  try {
    const parsed = crearCasaSchema.parse(datos);
    const { supabase, userId, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const propietarioId = parsed.usuario_id ?? userId;
    const ownerScopeError = await verificarUsuarioEnScope(
      supabase,
      authId,
      propietarioId,
      "No tienes permisos para crear una casa para este usuario"
    );
    if (ownerScopeError) return { success: false, error: ownerScopeError };

    if (parsed.co_anfitrion_id) {
      const coHostScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.co_anfitrion_id,
        "No tienes permisos para asignar este co-anfitrión"
      );
      if (coHostScopeError) return { success: false, error: coHostScopeError };
    }

    const adminDb = createSupabaseAdminClient();

    const ownerAssignmentError = await validarUsuarioAsignableACasa({
      adminDb,
      usuarioId: propietarioId,
      etiqueta: "propietario",
    });
    if (ownerAssignmentError) return { success: false, error: ownerAssignmentError };

    if (parsed.co_anfitrion_id) {
      const coHostAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.co_anfitrion_id,
        etiqueta: "co-anfitrión",
      });
      if (coHostAssignmentError) return { success: false, error: coHostAssignmentError };
    }

    // 1. Crear dirección con lat/lng
    const { data: direccion, error: dirError } = await adminDb
      .from("direcciones")
      .insert({
        calle: parsed.calle,
        barrio: parsed.barrio || null,
        codigo_postal: parsed.codigo_postal || null,
        referencia: parsed.referencia || null,
        parroquia_id: parsed.parroquia_id || null,
        latitud: parsed.lat || null,
        longitud: parsed.lng || null,
      })
      .select("id")
      .single();

    if (dirError) return { success: false, error: `Error al crear dirección: ${dirError.message}` };

    // 2. Crear casa anfitriona
    const disponibilidadJson = (parsed.disponibilidad ?? []).map((dia) => ({
      dia,
      disponible: true,
    }));

    const { data: casa, error: casaError } = await adminDb
      .from("casas_anfitrionas")
      .insert({
        usuario_id: propietarioId,
        co_anfitrion_id: parsed.co_anfitrion_id || null,
        nombre_lugar: parsed.nombre_lugar,
        descripcion: parsed.descripcion || null,
        capacidad_maxima: parsed.capacidad_maxima || null,
        direccion_id: direccion.id,
        disponibilidad: disponibilidadJson,
        notas_publicas: parsed.notas_publicas || null,
      })
      .select("id")
      .single();

    if (casaError) return { success: false, error: `Error al crear casa: ${casaError.message}` };

    revalidatePath("/grupos-vida/casas-anfitrionas");
    return { success: true, data: { id: casa.id } };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors.map((e) => e.message).join(" | ") };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Actualiza una casa anfitriona existente.
 * El dueño puede editar la suya; admins pueden editar cualquiera.
 */
export async function actualizarCasaAnfitriona(
  casaId: string,
  datos: z.infer<typeof actualizarCasaSchema>
): Promise<ResultadoAccion<void>> {
  try {
    const parsed = actualizarCasaSchema.parse(datos);
    const { supabase, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const permissionError = await verificarPermisoCasa(
      supabase,
      "puede_editar_casa_anfitriona",
      authId,
      casaId,
      "No tienes permisos para editar esta casa"
    );
    if (permissionError) return { success: false, error: permissionError };

    if (parsed.usuario_id) {
      const ownerScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.usuario_id,
        "No tienes permisos para asignar este propietario"
      );
      if (ownerScopeError) return { success: false, error: ownerScopeError };
    }

    if (parsed.co_anfitrion_id) {
      const coHostScopeError = await verificarUsuarioEnScope(
        supabase,
        authId,
        parsed.co_anfitrion_id,
        "No tienes permisos para asignar este co-anfitrión"
      );
      if (coHostScopeError) return { success: false, error: coHostScopeError };
    }

    const adminDb = createSupabaseAdminClient();

    const { data: casa } = await adminDb
      .from("casas_anfitrionas")
      .select("usuario_id, direccion_id, aprobada")
      .eq("id", casaId)
      .single();

    if (!casa) return { success: false, error: "Casa no encontrada" };

    if (parsed.usuario_id) {
      const ownerAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.usuario_id,
        currentCasaId: casaId,
        etiqueta: "propietario",
      });
      if (ownerAssignmentError) return { success: false, error: ownerAssignmentError };
    }

    if (parsed.co_anfitrion_id) {
      const coHostAssignmentError = await validarUsuarioAsignableACasa({
        adminDb,
        usuarioId: parsed.co_anfitrion_id,
        currentCasaId: casaId,
        etiqueta: "co-anfitrión",
      });
      if (coHostAssignmentError) return { success: false, error: coHostAssignmentError };
    }

    const dirUpdate: Record<string, unknown> = {};
    if (casa.direccion_id) {
      if (parsed.calle !== undefined) dirUpdate.calle = parsed.calle;
      if (parsed.barrio !== undefined) dirUpdate.barrio = parsed.barrio || null;
      if (parsed.codigo_postal !== undefined) dirUpdate.codigo_postal = parsed.codigo_postal || null;
      if (parsed.referencia !== undefined) dirUpdate.referencia = parsed.referencia || null;
      if (parsed.parroquia_id !== undefined) dirUpdate.parroquia_id = parsed.parroquia_id || null;
      if (parsed.lat !== undefined) dirUpdate.latitud = parsed.lat;
      if (parsed.lng !== undefined) dirUpdate.longitud = parsed.lng;
    }

    const hasDireccionUpdate = Object.keys(dirUpdate).length > 0;

    if (casa.aprobada && tieneEdicionSensible(parsed) && hasDireccionUpdate) {
      const { error: approvalResetError } = await adminDb
        .from("casas_anfitrionas")
        .update({
          aprobada: false,
          aprobada_en: null,
          aprobada_por: null,
          actualizado_en: new Date().toISOString(),
        })
        .eq("id", casaId);

      if (approvalResetError) return { success: false, error: `Error al actualizar: ${approvalResetError.message}` };
    }

    // Actualizar dirección si hay cambios
    if (casa.direccion_id && hasDireccionUpdate) {
      const { error: dirError } = await adminDb
        .from("direcciones")
        .update(dirUpdate)
        .eq("id", casa.direccion_id);

      if (dirError) return { success: false, error: `Error al actualizar dirección: ${dirError.message}` };
    }

    // Actualizar casa
    const casaUpdate: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
    if (parsed.nombre_lugar !== undefined) casaUpdate.nombre_lugar = parsed.nombre_lugar;
    if (parsed.descripcion !== undefined) casaUpdate.descripcion = parsed.descripcion || null;
    if (parsed.capacidad_maxima !== undefined) casaUpdate.capacidad_maxima = parsed.capacidad_maxima || null;
    if (parsed.notas_publicas !== undefined) casaUpdate.notas_publicas = parsed.notas_publicas || null;
    if (parsed.co_anfitrion_id !== undefined) casaUpdate.co_anfitrion_id = parsed.co_anfitrion_id || null;
    if (parsed.usuario_id !== undefined) casaUpdate.usuario_id = parsed.usuario_id;
    if (parsed.disponibilidad !== undefined) {
      casaUpdate.disponibilidad = parsed.disponibilidad.map((dia) => ({
        dia,
        disponible: true,
      }));
    }

    if (casa.aprobada && tieneEdicionSensible(parsed)) {
      casaUpdate.aprobada = false;
      casaUpdate.aprobada_en = null;
      casaUpdate.aprobada_por = null;
    }

    const { error: updateError } = await adminDb
      .from("casas_anfitrionas")
      .update(casaUpdate)
      .eq("id", casaId);

    if (updateError) return { success: false, error: `Error al actualizar: ${updateError.message}` };

    revalidarCasa(casaId);
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { success: false, error: err.errors.map((e) => e.message).join(" | ") };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

/**
 * Aprueba o rechaza una casa anfitriona.
 * Solo admins/pastores/directores.
 */
export async function procesarAprobacionCasa(
  casaId: string,
  accion: "aprobar" | "rechazar",
  notas?: string | null
): Promise<ResultadoAccion<AprobacionCasaResultado>> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const permissionError = await verificarPermisoCasa(
    supabase,
    "puede_aprobar_casa_anfitriona",
    authId,
    casaId,
    "No tienes permisos para aprobar o rechazar esta casa"
  );
  if (permissionError) return { success: false, error: permissionError };

  const { data, error: rpcError } = await supabase.rpc(
    "procesar_aprobacion_casa_anfitriona",
    {
      p_auth_id: authId,
      p_casa_id: casaId,
      p_accion: accion,
      p_notas: notas ?? undefined,
    }
  );

  if (rpcError) return { success: false, error: rpcError.message };

  revalidarCasa(casaId);

  // Validar estructura del resultado JSON de la RPC con Zod
  const aprobacionSchema = z.object({
    ok: z.boolean(),
    estado: z.string().optional(),
  });
  const parsed = aprobacionSchema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: "Respuesta inesperada del servidor" };
  }
  return { success: true, data: parsed.data };
}

/**
 * Lista casas anfitrionas con filtros opcionales.
 */
export async function listarCasasAnfitrionas(filtros?: {
  soloAprobadas?: boolean;
  soloActivas?: boolean;
  limite?: number;
  offset?: number;
}): Promise<ResultadoAccion<CasaAnfitrionaListItem[]>> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const { data: visibleIds, error: visibleError } = await supabase.rpc(
    "obtener_casas_visibles_ids",
    { p_auth_id: authId }
  );

  if (visibleError) return { success: false, error: visibleError.message };
  if (!visibleIds || visibleIds.length === 0) return { success: true, data: [] };

  let query = supabase
    .from("casas_anfitrionas")
    .select(
      `
      id, nombre_lugar, descripcion, capacidad_maxima, activa, aprobada,
      fotos_urls, notas_publicas, creado_en,
      usuarios!casas_anfitrionas_usuario_id_fkey ( id, nombre, apellido, foto_perfil_url ),
      direcciones!casas_anfitrionas_direccion_id_fkey ( calle, barrio, latitud, longitud )
    `
    )
    .order("creado_en", { ascending: false });

  query = query.in("id", visibleIds);
  if (filtros?.soloAprobadas) query = query.eq("aprobada", true);
  if (filtros?.soloActivas) query = query.eq("activa", true);
  if (filtros?.limite) query = query.limit(filtros.limite);
  if (filtros?.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limite ?? 20) - 1);

  const { data, error: queryError } = await query;

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data };
}

export async function cambiarEstadoCasaAnfitriona(
  casaId: string,
  activa: boolean
): Promise<ResultadoAccion<void>> {
  try {
    const { supabase, authId, error } = await validarAuthYPermisos();
    if (error) return { success: false, error };

    const permissionError = await verificarPermisoCasa(
      supabase,
      "puede_cambiar_estado_casa_anfitriona",
      authId,
      casaId,
      "No tienes permisos para cambiar el estado de esta casa"
    );
    if (permissionError) return { success: false, error: permissionError };

    const adminDb = createSupabaseAdminClient();
    const { error: updateError } = await adminDb
      .from("casas_anfitrionas")
      .update({ activa, actualizado_en: new Date().toISOString() })
      .eq("id", casaId);

    if (updateError) return { success: false, error: `Error al cambiar estado: ${updateError.message}` };

    revalidarCasa(casaId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido",
    };
  }
}

export async function obtenerDatosMapaGruposHostHomes(
  input?: unknown
): Promise<ResultadoAccion<DatosMapaGrupoHostHomeItem[]>> {
  return obtenerRpcRows(input, "obtener_mapa_grupos_vida_host_homes", hostHomeMapRowSchema);
}

export async function obtenerGruposSinCasaAnfitriona(
  input?: unknown
): Promise<ResultadoAccion<GrupoSinCasaAnfitrionaItem[]>> {
  const scope = missingHostHomeInputSchema.safeParse(input ?? {});
  if (!scope.success) return { success: false, error: formatZodError(scope.error) };

  const { supabase, userId, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const roles = await obtenerRolesDashboardCasas(supabase, authId);
  if (!puedeSolicitarColaGruposSinCasa(roles)) return { success: true, data: [] };

  const response = await executeCasasMapRpc(supabase, "obtener_grupos_sin_casa_anfitriona", {
    p_auth_id: authId,
    p_scope: scope.data.scope,
  });

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };

  const parsed = parseRpcArray(missingHostHomeRowSchema, response.data, "obtener_grupos_sin_casa_anfitriona");
  if (!parsed.success) return parsed;
  const parsedRows = parsed.data ?? [];
  const visibleQueueRows = await filtrarGruposSinCasaParaDashboard(supabase, userId, roles, parsedRows);

  return {
    success: true,
    data: scope.data.includeLeaders
      ? await enriquecerGruposSinCasaConLideres(supabase, visibleQueueRows)
      : visibleQueueRows,
  };
}

export async function obtenerCasasRevisionPendiente(): Promise<ResultadoAccion<CasaRevisionPendienteItem[]>> {
  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const roles = await obtenerRolesDashboardCasas(supabase, authId);
  if (!puedeSolicitarColaRevisionCasas(roles)) return { success: true, data: [] };

  const response = await executeCasasMapReadRpc(
    "obtener_casas_revision_pendiente",
    { p_auth_id: authId },
    supabase
  );

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };
  return parseRpcArray(pendingReviewRowSchema, response.data, "obtener_casas_revision_pendiente");
}

export async function obtenerMapaMiembros(
  input?: unknown
): Promise<ResultadoAccion<MapaMiembroItem[]>> {
  const scope = scopeInputSchema.safeParse(input ?? {});
  if (!scope.success) return { success: false, error: formatZodError(scope.error) };

  const { supabase, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const roles = await obtenerRolesDashboardCasas(supabase, authId);
  if (!puedeSolicitarMapaMiembros(roles)) return { success: true, data: [] };

  const response = await executeCasasMapReadRpc("obtener_mapa_miembros", {
    p_auth_id: authId,
    p_scope: scope.data.scope,
  }, supabase);

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };
  return parseRpcArray(memberMapRowSchema, response.data, "obtener_mapa_miembros");
}

export async function asignarCasaAnfitrionaAGrupo(
  input: unknown
): Promise<ResultadoAccion<AsignacionCasaGrupoResultado>> {
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: formatZodError(parsed.error) };

  const { supabase, userId, authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const queueError = await validarGrupoEnColaAsignacion(supabase, authId, userId, parsed.data.groupId);
  if (queueError) return { success: false, error: queueError };

  const adminResult = createCasasMapAdminClient("asignar_casa_anfitriona_a_grupo");
  if (!adminResult.success || !adminResult.data) return { success: false, error: adminResult.error ?? genericMutationError };

  const response = await executeCasasMapRpc(
    adminResult.data,
    "asignar_casa_anfitriona_a_grupo",
    {
      p_auth_id: authId,
      p_grupo_id: parsed.data.groupId,
      p_casa_id: parsed.data.casaId,
    }
  );

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };

  const result = parseRpcObject(assignmentResultSchema, response.data, "asignar_casa_anfitriona_a_grupo");
  if (!result.success) return { success: false, error: result.error ?? "Respuesta inesperada del servidor" };

  revalidatePath("/dashboard");
  revalidatePath("/grupos-vida/mapa");
  revalidatePath("/grupos-vida/casas-anfitrionas/asignar");

  return { success: true, data: result.data };
}

export async function procesarRevisionUbicacionCasa(
  input: unknown
): Promise<ResultadoAccion<RevisionUbicacionResultado>> {
  const parsed = reviewDecisionInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: formatZodError(parsed.error) };

  const { authId, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const adminResult = createCasasMapAdminClient("procesar_revision_ubicacion_casa");
  if (!adminResult.success || !adminResult.data) return { success: false, error: adminResult.error ?? genericMutationError };

  const response = await executeCasasMapRpc(
    adminResult.data,
    "procesar_revision_ubicacion_casa",
    {
      p_auth_id: authId,
      p_review_id: parsed.data.reviewId,
      p_accion: parsed.data.accion,
      p_notas: parsed.data.notas ?? null,
    }
  );

  if (!response.success) return { success: false, error: response.error ?? genericMutationError };

  const result = parseRpcObject(reviewDecisionResultSchema, response.data, "procesar_revision_ubicacion_casa");
  if (!result.success) return { success: false, error: result.error ?? "Respuesta inesperada del servidor" };

  revalidatePath("/dashboard");
  revalidatePath("/grupos-vida/mapa");
  revalidatePath("/grupos-vida/casas-anfitrionas/revision");

  return { success: true, data: result.data };
}

/**
 * Obtiene datos del mapa de grupos usando la vista v_mapa_grupos_vida.
 */
export async function obtenerDatosMapaGrupos(): Promise<ResultadoAccion<DatosMapaGrupoItem[]>> {
  const { supabase, error } = await validarAuthYPermisos();
  if (error) return { success: false, error };

  const { data, error: queryError } = await supabase
    .from("v_mapa_grupos_vida")
    .select("*")
    .not("latitud", "is", null)
    .not("longitud", "is", null);

  if (queryError) return { success: false, error: queryError.message };
  return { success: true, data: data as DatosMapaGrupoItem[] };
}
