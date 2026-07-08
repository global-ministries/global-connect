-- ════════════════════════════════════════════════════════════════════
-- Dream Team Global Base — Fase 2
-- Migración ADITIVA. NO modifica tablas existentes.
-- ════════════════════════════════════════════════════════════════════

-- ── Enums ──────────────────────────────────────────────────────────
CREATE TYPE dream_team_estado AS ENUM (
  'postulado', 'en_orientacion', 'activo', 'en_pausa', 'inactivo', 'retirado'
);

CREATE TYPE dream_team_requisito_tipo AS ENUM (
  'documento', 'capacitacion', 'entrevista', 'firma', 'otro'
);

CREATE TYPE dream_team_obligatoriedad AS ENUM (
  'requerido', 'opcional', 'no_aplica'
);

CREATE TYPE dream_team_requisito_estado AS ENUM (
  'pendiente', 'completado', 'vencido', 'no_aplica'
);

CREATE TYPE dream_team_transicion_motivo AS ENUM (
  'admin_asignacion', 'admin_promocion', 'admin_pausa', 'admin_reactivacion',
  'admin_retiro', 'reasignacion', 'requisito_vencido', 'gdv_liderazgo_removed',
  'auto_pausa', 'otro'
);

-- ── Tablas ─────────────────────────────────────────────────────────

CREATE TABLE dream_team_equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiencia text NOT NULL,
  parent_equipo_id uuid REFERENCES dream_team_equipos(id) ON DELETE SET NULL,
  label text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dream_team_equipos_experiencia ON dream_team_equipos(experiencia);
CREATE INDEX idx_dream_team_equipos_parent ON dream_team_equipos(parent_equipo_id);

CREATE TABLE dream_team_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL REFERENCES dream_team_equipos(id) ON DELETE CASCADE,
  label text NOT NULL,
  parent_rol_id uuid REFERENCES dream_team_roles(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dream_team_roles_equipo ON dream_team_roles(equipo_id);

CREATE TABLE dream_team_servicios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  equipo_id uuid NOT NULL REFERENCES dream_team_equipos(id) ON DELETE RESTRICT,
  rol_id uuid NOT NULL REFERENCES dream_team_roles(id) ON DELETE RESTRICT,
  estado dream_team_estado NOT NULL DEFAULT 'postulado',
  fecha_inicio timestamptz NOT NULL DEFAULT now(),
  fecha_fin timestamptz,
  motivo_actual dream_team_transicion_motivo NOT NULL DEFAULT 'admin_asignacion',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_dream_team_servicio_retirado_fecha_fin
    CHECK ((estado = 'retirado' AND fecha_fin IS NOT NULL) OR (estado <> 'retirado'))
);
CREATE INDEX idx_dream_team_servicios_persona ON dream_team_servicios(persona_id);
CREATE INDEX idx_dream_team_servicios_equipo ON dream_team_servicios(equipo_id);
CREATE INDEX idx_dream_team_servicios_estado ON dream_team_servicios(estado);
CREATE INDEX idx_dream_team_servicios_equipo_rol ON dream_team_servicios(equipo_id, rol_id);
CREATE INDEX idx_dream_team_servicios_persona_estado ON dream_team_servicios(persona_id, estado);

CREATE TABLE dream_team_requisitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id uuid NOT NULL REFERENCES dream_team_equipos(id) ON DELETE CASCADE,
  rol_id uuid NOT NULL REFERENCES dream_team_roles(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  label text NOT NULL,
  tipo dream_team_requisito_tipo NOT NULL,
  obligatoriedad dream_team_obligatoriedad NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(equipo_id, rol_id, codigo)
);
CREATE INDEX idx_dream_team_requisitos_rol ON dream_team_requisitos(rol_id);

CREATE TABLE dream_team_requisitos_verificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES dream_team_servicios(id) ON DELETE CASCADE,
  requisito_id uuid NOT NULL REFERENCES dream_team_requisitos(id) ON DELETE CASCADE,
  estado dream_team_requisito_estado NOT NULL DEFAULT 'pendiente',
  fecha_verificacion timestamptz,
  verificado_por uuid,
  fecha_vencimiento timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(servicio_id, requisito_id)
);
CREATE INDEX idx_dream_team_req_verif_servicio ON dream_team_requisitos_verificacion(servicio_id);
CREATE INDEX idx_dream_team_req_verif_requisito_estado_vencimiento
  ON dream_team_requisitos_verificacion(requisito_id, estado, fecha_vencimiento);

CREATE TABLE dream_team_estados_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES dream_team_servicios(id) ON DELETE CASCADE,
  estado_anterior dream_team_estado NOT NULL,
  estado_nuevo dream_team_estado NOT NULL,
  motivo dream_team_transicion_motivo NOT NULL,
  detalle_motivo text,
  actor_persona_id uuid NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  paused_grants_snapshot jsonb
);
CREATE INDEX idx_dream_team_historial_servicio ON dream_team_estados_historial(servicio_id, fecha);

CREATE TABLE dream_team_participation_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  servicio_id uuid NOT NULL REFERENCES dream_team_servicios(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fecha timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dream_team_part_eventos_servicio ON dream_team_participation_eventos(servicio_id);
CREATE INDEX idx_dream_team_part_eventos_persona ON dream_team_participation_eventos(persona_id);
CREATE INDEX idx_dream_team_part_eventos_persona_fecha
  ON dream_team_participation_eventos(persona_id, fecha DESC);

-- ── Tabla de grants para RLS ──────────────────────────────────────

CREATE TABLE dream_team_capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id uuid NOT NULL,
  capability_key text NOT NULL,
  experience text NOT NULL,
  scope_type text NOT NULL,
  scope_id text,
  source text NOT NULL DEFAULT 'dream_team_servicio',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE(persona_id, capability_key, experience, scope_type, scope_id, source)
);
CREATE INDEX idx_dream_team_grants_persona ON dream_team_capability_grants(persona_id);
CREATE INDEX idx_dream_team_grants_active ON dream_team_capability_grants(persona_id) WHERE revoked_at IS NULL;

-- ── Helper Postgres para RLS ──────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_has_dream_team_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM dream_team_capability_grants
    WHERE persona_id = auth.uid()
      AND capability_key = p_capability_key
      AND revoked_at IS NULL
  )
$$;

-- ── RLS Policies ──────────────────────────────────────────────────

ALTER TABLE dream_team_equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_requisitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_requisitos_verificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_estados_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_participation_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dream_team_capability_grants ENABLE ROW LEVEL SECURITY;

-- Revoke direct mutations from anonymous/authenticated users.
-- All writes go through privileged server-side code (service_role / RPC).
REVOKE ALL ON TABLE dream_team_equipos FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_roles FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_servicios FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_requisitos FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_requisitos_verificacion FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_estados_historial FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_participation_eventos FROM anon, authenticated;
REVOKE ALL ON TABLE dream_team_capability_grants FROM anon, authenticated;

-- Read policies: users with any Dream Team management capability.
CREATE POLICY "dream_team_equipos_read" ON dream_team_equipos
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_roles_read" ON dream_team_roles
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_servicios_read" ON dream_team_servicios
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_requisitos_read" ON dream_team_requisitos
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_requisitos_verificacion_read" ON dream_team_requisitos_verificacion
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_estados_historial_read" ON dream_team_estados_historial
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

CREATE POLICY "dream_team_participation_eventos_read" ON dream_team_participation_eventos
  FOR SELECT USING (
    auth_has_dream_team_capability('dream_team.serve')
    OR auth_has_dream_team_capability('dream_team.lead')
    OR auth_has_dream_team_capability('dream_team.coordinate')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
    OR auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.metrics.read')
  );

-- Write policies: restricted to director-level coordination.
-- In production these rows are mutated by service_role server code or privileged RPCs.
CREATE POLICY "dream_team_equipos_write" ON dream_team_equipos
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_equipos_update" ON dream_team_equipos
  FOR UPDATE USING (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  ) WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_roles_write" ON dream_team_roles
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_roles_update" ON dream_team_roles
  FOR UPDATE USING (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  ) WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_servicios_write" ON dream_team_servicios
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_servicios_update" ON dream_team_servicios
  FOR UPDATE USING (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  ) WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_requisitos_write" ON dream_team_requisitos
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_requisitos_update" ON dream_team_requisitos
  FOR UPDATE USING (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  ) WITH CHECK (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_requisitos_verificacion_write" ON dream_team_requisitos_verificacion
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_requisitos_verificacion_update" ON dream_team_requisitos_verificacion
  FOR UPDATE USING (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  ) WITH CHECK (
    auth_has_dream_team_capability('dream_team.requirements.manage')
    OR auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_estados_historial_write" ON dream_team_estados_historial
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

CREATE POLICY "dream_team_participation_eventos_write" ON dream_team_participation_eventos
  FOR INSERT WITH CHECK (
    auth_has_dream_team_capability('dream_team.director.coordinate')
  );

-- capability_grants is managed exclusively by the grants orchestrator / service_role.
-- Authenticated users can only read their own active grants.
CREATE POLICY "dream_team_capability_grants_read_own" ON dream_team_capability_grants
  FOR SELECT USING (
    persona_id = auth.uid()
  );
