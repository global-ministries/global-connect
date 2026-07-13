# Delta — Dream Team GDV Adapter

## Purpose

Define the read-only adapter that maps GDV group leaders to Dream Team capabilities without modifying existing GDV adapter, RPCs, or RLS.

## Requirements

### Requirement: Separate adapter reads grupo_miembros for leaders

The system SHALL implement `lib/platform/adapters/dream-team-gdv.ts` as a read-only adapter. It SHALL read `grupo_miembros` filtering by liderazgo roles (`tipo_lider` values per existing GDV taxonomy). For each active leader membership, it SHALL produce a `PlatformSessionCapability` with key `dream_team.gdv.lead` and scope `{ experience: 'grupos_vida', scopeType: 'grupo', scopeId: grupoId }`. The adapter SHALL NOT modify `lib/platform/adapters/grupos-vida.ts` nor any GDV RPCs or RLS policies.

#### Scenario: GDV group leader recognized as Dream Team
- GIVEN persona with active `grupo_miembros` row where `tipo_lider` indicates leadership
- WHEN adapter `dream-team-gdv.ts` resolves
- THEN capability `dream_team.gdv.lead` is produced with scope grupo
- AND the existing GDV adapter continues to produce `grupos_vida.stage.read` for directores de etapa independently.

### Requirement: Leadership loss detected as pausa event

The adapter SHALL compare current leadership memberships against previous state (via reader interface). When a leadership membership is removed (no longer present in `grupo_miembros`), the adapter SHALL emit a `gdv_liderazgo_removed` event. The Dream Team domain layer SHALL consume this event and transition the corresponding service to `en_pausa` with motivo `gdv_liderazgo_removed`. Group membership itself SHALL NOT be affected.

#### Scenario: Leader removed from grupo_miembros
- GIVEN persona was líder of grupo X, producing `dream_team.gdv.lead`
- WHEN their leadership row is removed from `grupo_miembros`
- THEN adapter emits `gdv_liderazgo_removed` event
- AND their Dream Team service transitions to `en_pausa`
- AND their regular group membership (if still present) is unaffected.

### Requirement: GDV membership and Dream Team leadership are independent

A persona SHALL be able to be a regular member of a GDV group (in `grupo_miembros` without leadership role) WITHOUT receiving `dream_team.gdv.lead`. The adapter SHALL only map rows where the membership role indicates leadership. A director de etapa who is also a leader SHALL receive BOTH `grupos_vida.stage.read` (from existing adapter) AND `dream_team.gdv.lead` (from this adapter) — different sources, different scopes.

#### Scenario: Regular member not treated as Dream Team
- GIVEN persona is a regular member of a GDV group (no liderazgo role)
- WHEN adapter resolves
- THEN `dream_team.gdv.lead` is NOT produced
- AND only the existing GDV membership context applies.
