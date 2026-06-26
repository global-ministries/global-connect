export type PlatformPersonaSignalName = 'email' | 'telefono' | 'cedula' | 'nombre' | 'apellido' | 'fechaNacimiento'
export type PlatformPersonaSearchSignals = Partial<Record<PlatformPersonaSignalName, string | null>>
export type PlatformPersonaNormalizedSignals = Partial<Record<PlatformPersonaSignalName, string>>
export type PlatformPersonaUsuario = {
  id: string
  auth_id: string | null
  nombre: string | null
  apellido: string | null
  email: string | null
  telefono: string | null
  cedula: string | null
  fecha_nacimiento: string | null
}
export type PlatformPersonaLookupActor = { personaId: string; allowedFlows: string[]; allowedScopes: string[] }
export type PlatformPersonaLookup = { findCandidatesBySignals(signals: PlatformPersonaNormalizedSignals): Promise<PlatformPersonaUsuario[]> }
export type PlatformPersonaLookupInput = {
  actor: PlatformPersonaLookupActor | null | undefined
  flow: string
  requiredScope: string
  query: PlatformPersonaSearchSignals
  personaLookup: PlatformPersonaLookup
}
export type PlatformPersonaDeniedReason = 'actor_required' | 'flow_not_allowed' | 'missing_required_scope' | 'invalid_query' | 'lookup_failed'
export type PlatformPersonaLookupAudit = {
  actorPersonaId?: string
  decision: 'lookup_allowed' | 'lookup_denied' | 'lookup_failed'
  reason?: PlatformPersonaDeniedReason
  flow: string
  requiredScope: string
  signalNames: PlatformPersonaSignalName[]
  resultCount: number
  reviewRequired: boolean
}
export type PlatformPersonaCandidate = {
  personaId: string
  displayName: string
  hasAuthAccount: boolean
  matchedSignals: PlatformPersonaSignalName[]
  maskedSignals: Partial<Record<PlatformPersonaSignalName, string>>
}
export type PlatformPersonaLookupResult =
  | { ok: true; decision: 'no_match' | 'single_candidate' | 'ambiguous_candidates'; autoMerge: false; reviewRequired: boolean; candidates: PlatformPersonaCandidate[]; audit: PlatformPersonaLookupAudit }
  | { ok: false; reason: PlatformPersonaDeniedReason; candidates: []; audit: PlatformPersonaLookupAudit }

const SIGNAL_ORDER: PlatformPersonaSignalName[] = ['email', 'telefono', 'cedula', 'nombre', 'apellido', 'fechaNacimiento']
const SIGNAL_WEIGHTS = { email: 4, telefono: 3, cedula: 4, nombre: 1, apellido: 1, fechaNacimiento: 2 } satisfies Record<PlatformPersonaSignalName, number>
type ScoredCandidate = { usuario: PlatformPersonaUsuario; matchedSignals: PlatformPersonaSignalName[]; score: number }

export async function findPlatformPersonaCandidates(input: PlatformPersonaLookupInput): Promise<PlatformPersonaLookupResult> {
  const signalNames = collectInputSignalNames(input.query)
  const boundaryFailure = resolveBoundaryFailure(input.actor, input.flow, input.requiredScope)
  if (boundaryFailure) return deniedResult(input, boundaryFailure, signalNames)

  const normalizedSignals = normalizeSignals(input.query)
  if (!hasLookupStrength(normalizedSignals)) return deniedResult(input, 'invalid_query', signalNames)

  let usuarios: PlatformPersonaUsuario[]
  try {
    usuarios = await input.personaLookup.findCandidatesBySignals(normalizedSignals)
  } catch {
    return { ok: false, reason: 'lookup_failed', candidates: [], audit: toAudit(input, 'lookup_failed', signalNames, 0, false, 'lookup_failed') }
  }

  const matches = usuarios
    .map((usuario) => scoreCandidate(usuario, normalizedSignals))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.usuario.id.localeCompare(right.usuario.id))

  if (matches.length === 0) {
    return { ok: true, decision: 'no_match', autoMerge: false, reviewRequired: false, candidates: [], audit: toAudit(input, 'lookup_allowed', signalNames, 0, false) }
  }

  const topScore = matches[0].score
  const ambiguous = matches.length > 1 && matches[1].score === topScore
  const selected = ambiguous ? matches.filter((match) => match.score === topScore) : [matches[0]]
  return {
    ok: true,
    decision: ambiguous ? 'ambiguous_candidates' : 'single_candidate',
    autoMerge: false,
    reviewRequired: ambiguous,
    candidates: selected.map(toCandidate),
    audit: toAudit(input, 'lookup_allowed', signalNames, selected.length, ambiguous),
  }
}

function deniedResult(input: PlatformPersonaLookupInput, reason: PlatformPersonaDeniedReason, signalNames: PlatformPersonaSignalName[]): PlatformPersonaLookupResult {
  return { ok: false, reason, candidates: [], audit: toAudit(input, 'lookup_denied', signalNames, 0, false, reason) }
}

function resolveBoundaryFailure(actor: PlatformPersonaLookupActor | null | undefined, flow: string, requiredScope: string): PlatformPersonaDeniedReason | null {
  if (!actor?.personaId.trim()) return 'actor_required'
  if (!flow.trim() || !actor.allowedFlows.includes(flow)) return 'flow_not_allowed'
  if (!requiredScope.trim() || !actor.allowedScopes.includes(requiredScope)) return 'missing_required_scope'
  return null
}

function toAudit(
  input: PlatformPersonaLookupInput,
  decision: PlatformPersonaLookupAudit['decision'],
  signalNames: PlatformPersonaSignalName[],
  resultCount: number,
  reviewRequired: boolean,
  reason?: PlatformPersonaDeniedReason
): PlatformPersonaLookupAudit {
  return {
    actorPersonaId: input.actor?.personaId.trim() || undefined,
    decision,
    reason,
    flow: input.flow,
    requiredScope: input.requiredScope,
    signalNames,
    resultCount,
    reviewRequired,
  }
}

function collectInputSignalNames(query: PlatformPersonaSearchSignals): PlatformPersonaSignalName[] {
  return SIGNAL_ORDER.filter((signal) => Boolean(query[signal]?.trim()))
}

function normalizeSignals(query: PlatformPersonaSearchSignals): PlatformPersonaNormalizedSignals {
  const signals: PlatformPersonaNormalizedSignals = {}
  const values = {
    email: normalizeEmail(query.email),
    telefono: normalizeDigits(query.telefono, 7),
    cedula: normalizeAlphanumeric(query.cedula, 4),
    nombre: normalizeName(query.nombre),
    apellido: normalizeName(query.apellido),
    fechaNacimiento: normalizeDate(query.fechaNacimiento),
  } satisfies Record<PlatformPersonaSignalName, string | null>

  for (const signal of SIGNAL_ORDER) {
    const value = values[signal]
    if (value) signals[signal] = value
  }
  return signals
}

function hasLookupStrength(signals: PlatformPersonaNormalizedSignals): boolean {
  return Boolean(signals.email || signals.telefono || signals.cedula || (signals.nombre && signals.apellido && signals.fechaNacimiento))
}

function scoreCandidate(usuario: PlatformPersonaUsuario, signals: PlatformPersonaNormalizedSignals): ScoredCandidate {
  const matchedSignals = SIGNAL_ORDER.filter((signal) => {
    const expected = signals[signal]
    return Boolean(expected && normalizeUsuarioSignal(usuario, signal) === expected)
  })
  return { usuario, matchedSignals, score: matchedSignals.reduce((total, signal) => total + SIGNAL_WEIGHTS[signal], 0) }
}

function toCandidate(match: ScoredCandidate): PlatformPersonaCandidate {
  return {
    personaId: match.usuario.id,
    displayName: maskDisplayName(match.usuario),
    hasAuthAccount: Boolean(match.usuario.auth_id?.trim()),
    matchedSignals: match.matchedSignals,
    maskedSignals: maskMatchedSignals(match.usuario, match.matchedSignals),
  }
}

function maskMatchedSignals(usuario: PlatformPersonaUsuario, matchedSignals: PlatformPersonaSignalName[]): Partial<Record<PlatformPersonaSignalName, string>> {
  const maskedSignals: Partial<Record<PlatformPersonaSignalName, string>> = {}
  const email = maskEmail(usuario.email)
  const telefono = maskLastFour(usuario.telefono)
  const cedula = maskLastFour(usuario.cedula)
  if (matchedSignals.includes('email') && email) maskedSignals.email = email
  if (matchedSignals.includes('telefono') && telefono) maskedSignals.telefono = telefono
  if (matchedSignals.includes('cedula') && cedula) maskedSignals.cedula = cedula
  return maskedSignals
}

function maskDisplayName(usuario: PlatformPersonaUsuario): string {
  const initials = [normalizeInitial(usuario.nombre), normalizeInitial(usuario.apellido)].filter(Boolean).join(' ')
  return initials || `Persona ${maskLastFour(usuario.id)}`
}

function normalizeUsuarioSignal(usuario: PlatformPersonaUsuario, signal: PlatformPersonaSignalName): string | null {
  if (signal === 'email') return normalizeEmail(usuario.email)
  if (signal === 'telefono') return normalizeDigits(usuario.telefono, 7)
  if (signal === 'cedula') return normalizeAlphanumeric(usuario.cedula, 4)
  if (signal === 'nombre') return normalizeName(usuario.nombre)
  if (signal === 'apellido') return normalizeName(usuario.apellido)
  return normalizeDate(usuario.fecha_nacimiento)
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase()
  return normalized && normalized.includes('@') ? normalized : null
}

function normalizeDigits(value: string | null | undefined, minLength: number): string | null {
  const digits = value?.replace(/\D/g, '')
  return digits && digits.length >= minLength ? digits : null
}

function normalizeAlphanumeric(value: string | null | undefined, minLength: number): string | null {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return normalized && normalized.length >= minLength ? normalized : null
}

function normalizeName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized && normalized.length >= 2 ? normalized : null
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function maskEmail(value: string | null | undefined): string | undefined {
  const normalized = normalizeEmail(value)
  if (!normalized) return undefined
  const [local, domain] = normalized.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}

function maskLastFour(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, '')
  return normalized ? `••••${normalized.slice(-4)}` : undefined
}

function normalizeInitial(value: string | null | undefined): string | null {
  const normalized = normalizeName(value)
  return normalized ? `${normalized.slice(0, 1).toUpperCase()}.` : null
}
