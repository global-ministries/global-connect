import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readSupportTicketMigration(): string {
  return readMigrationBySuffix('_support_ticket_system.sql')
}

function readSupportTicketSql(): string {
  return [
    readSupportTicketMigration(),
    readMigrationBySuffix('_add_support_staff_action_rpcs.sql'),
    readSupportStaffDirectMutationMigration(),
    readMigrationBySuffix('_harden_staff_reply_rpc_body.sql'),
    readMigrationBySuffix('_add_support_capability_admin_rpcs.sql'),
    readMigrationBySuffix('_add_support_external_inbound_rpc.sql'),
    readMigrationBySuffix('_align_support_capability_hierarchy.sql'),
    readMigrationBySuffix('_add_safe_support_ticket_auto_assignment_rpc.sql'),
  ].join('\n')
}

function readDatabaseTypes(): string {
  return readFileSync(join(process.cwd(), 'lib', 'supabase', 'database.types.ts'), 'utf8')
}

function readSupportStaffDirectMutationMigration(): string {
  return readMigrationBySuffix('_restrict_support_staff_direct_mutations.sql')
}

function readMigrationBySuffix(suffix: string): string {
  const migration = readdirSync(migrationsDir).find((file) => file.endsWith(suffix))

  if (!migration) {
    throw new Error(`Missing migration ${suffix}`)
  }

  return readFileSync(join(migrationsDir, migration), 'utf8')
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ')
}

function policySql(sql: string, policyName: string): string {
  const match = sql.match(new RegExp(`CREATE POLICY ${policyName} ON[\\s\\S]*?;`, 'i'))

  if (!match) {
    throw new Error(`Missing policy ${policyName}`)
  }

  return compactSql(match[0])
}

function latestPolicySqlByName(sql: string, policyName: string): string {
  const start = sql.lastIndexOf(`CREATE POLICY ${policyName} ON`)

  if (start === -1) {
    throw new Error(`Missing policy ${policyName}`)
  }

  const end = sql.indexOf(';', start)
  return compactSql(sql.slice(start, end + 1))
}

function functionSql(sql: string, functionName: string): string {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION ${functionName}[\\s\\S]*?\\$\\$;`, 'i'))

  if (!match) {
    throw new Error(`Missing function ${functionName}`)
  }

  return compactSql(match[0])
}

function latestFunctionSqlByPrefix(sql: string, functionPrefix: string): string {
  const start = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION ${functionPrefix}`)

  if (start === -1) {
    throw new Error(`Missing function ${functionPrefix}`)
  }

  const end = sql.indexOf('\n$$;', start)
  return compactSql(sql.slice(start, end + '\n$$;'.length))
}

describe('support ticket system migration', () => {
  it('creates the support ticket domain tables with RLS enabled', () => {
    const sql = readSupportTicketMigration()

    for (const table of [
      'support_tickets',
      'support_ticket_messages',
      'support_ticket_attachments',
      'support_ticket_events',
      'support_user_capabilities',
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
  })

  it('defines private capability helpers and avoids anon grants', () => {
    const sql = readSupportTicketMigration()

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS support_private')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION support_private.current_usuario_id()')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION support_private.has_capability(required_capability text)')
    expect(sql).toContain('REVOKE ALL ON SCHEMA support_private FROM PUBLIC')
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bTO\s+anon\b/i)
  })

  it('adds FTS and append-only event protections', () => {
    const sql = readSupportTicketMigration()

    expect(sql).toContain('search_vector tsvector GENERATED ALWAYS AS')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS support_tickets_search_idx')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION support_private.prevent_event_mutation()')
    expect(sql).toContain('CREATE TRIGGER prevent_support_ticket_event_mutation')
  })

  it('avoids destructive SQL in the additive production migration', () => {
    const sql = readSupportTicketMigration()

    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i)
  })

  it('does not allow authenticated clients to author audit events directly', () => {
    const sql = readSupportTicketMigration()

    expect(sql).toContain('GRANT SELECT ON public.support_ticket_events TO authenticated')
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bINSERT\b[^;]*ON\s+public\.support_ticket_events\s+TO\s+authenticated/i)
    expect(sql).not.toMatch(/CREATE POLICY\s+support_events_insert\s+ON\s+public\.support_ticket_events/i)
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bUPDATE\b[^;]*ON\s+public\.support_ticket_events\s+TO\s+authenticated/i)
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bDELETE\b[^;]*ON\s+public\.support_ticket_events\s+TO\s+authenticated/i)
  })

  it('keeps post-staging staff RPCs out of the already-applied base migration', () => {
    const sql = readSupportTicketMigration()

    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_staff_support_ticket_reply')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.assign_support_ticket')
    expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.update_support_ticket_status')
  })

  it('filters internal messages away from ticket reporters', () => {
    const sql = readSupportTicketMigration()
    const selectPolicy = policySql(sql, 'support_messages_select')

    expect(selectPolicy).toContain("support_private.has_capability('support.view')")
    expect(selectPolicy).toContain('is_internal = false')
    expect(selectPolicy).toContain('st.reporter_usuario_id = support_private.current_usuario_id()')
  })

  it('constrains direct reporter ticket creation to safe initial lifecycle values', () => {
    const sql = readSupportTicketMigration()
    const insertPolicy = policySql(sql, 'support_tickets_insert')

    expect(insertPolicy).toContain('reporter_usuario_id = support_private.current_usuario_id()')
    expect(insertPolicy).toContain('assignee_usuario_id IS NULL')
    expect(insertPolicy).toContain("status = 'received'")
    expect(insertPolicy).toContain('closed_at IS NULL')
  })

  it('keeps attachment finalization metadata out of direct client updates', () => {
    const sql = readSupportTicketMigration()
    const insertPolicy = policySql(sql, 'support_attachments_insert')

    expect(sql).toContain('GRANT SELECT, INSERT ON public.support_ticket_attachments TO authenticated')
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bUPDATE\b[^;]*ON\s+public\.support_ticket_attachments\s+TO\s+authenticated/i)
    expect(sql).not.toMatch(/CREATE POLICY\s+support_attachments_update\s+ON\s+public\.support_ticket_attachments/i)
    expect(insertPolicy).toContain("status = 'pending_upload'")
    expect(insertPolicy).toContain("bucket = 'global-connect-support'")
    expect(insertPolicy).toContain('checksum_sha256 IS NULL')
    expect(insertPolicy).toContain('rejection_reason IS NULL')
    expect(insertPolicy).toContain('retention_expires_at IS NULL')
  })

  it('keeps the applied base helper unchanged before additive authorization fixes', () => {
    const sql = readSupportTicketMigration()
    const capabilityHelper = functionSql(sql, 'support_private.has_capability\\(required_capability text\\)')

    expect(capabilityHelper).toContain('JOIN public.usuario_roles ur ON ur.usuario_id = u.id')
    expect(capabilityHelper).toContain('JOIN public.roles_sistema rs ON rs.id = ur.rol_id')
    expect(capabilityHelper).toContain('JOIN public.support_user_capabilities suc ON suc.usuario_id = u.id')
    expect(capabilityHelper).toContain("rs.nombre_interno = 'admin'")
    expect(capabilityHelper).toContain('suc.capability = required_capability')
    expect(capabilityHelper).toContain('suc.revoked_at IS NULL')
    expect(capabilityHelper).not.toMatch(/\)\s+OR\s+EXISTS/i)
  })

  it('aligns the latest support capability helper with reply and manage hierarchy', () => {
    const sql = readSupportTicketSql()
    const capabilityHelper = latestFunctionSqlByPrefix(sql, 'support_private.has_capability(required_capability text)')

    expect(capabilityHelper).toContain("suc.capability = 'support.manage'")
    expect(capabilityHelper).toContain("required_capability IN ('support.view', 'support.reply', 'support.manage')")
    expect(capabilityHelper).toContain("suc.capability = 'support.reply'")
    expect(capabilityHelper).toContain("required_capability IN ('support.view', 'support.reply')")
    expect(capabilityHelper).toContain('suc.capability = required_capability')
    expect(capabilityHelper).not.toContain("rs.nombre_interno = 'admin'")
    expect(capabilityHelper).not.toContain('JOIN public.roles_sistema')
  })

  it('keeps support capability configuration data gated by higher role plus support.manage', () => {
    const sql = readSupportTicketSql()
    const configHelper = latestFunctionSqlByPrefix(sql, 'support_private.has_support_configuration_access()')
    const capabilityPolicy = latestPolicySqlByName(sql, 'support_capabilities_select')

    expect(configHelper).toContain("support_private.has_capability('support.manage')")
    expect(configHelper).toContain("rs.nombre_interno IN ('admin', 'pastor', 'director-general')")
    expect(capabilityPolicy).toContain('usuario_id = support_private.current_usuario_id()')
    expect(capabilityPolicy).toContain('support_private.has_support_configuration_access()')
    expect(capabilityPolicy).not.toContain("support_private.has_capability('support.manage')")
  })

  it('adds atomic staff mutation RPCs with explicit capability gates and audit writes', () => {
    const sql = readSupportTicketSql()
    const staffReplyRpc = latestFunctionSqlByPrefix(sql, 'public.create_staff_support_ticket_reply(p_ticket_id uuid, p_body text)')
    const assignmentRpc = latestFunctionSqlByPrefix(sql, 'public.assign_support_ticket(p_ticket_id uuid, p_assignee_usuario_id uuid)')
    const autoAssignmentRpc = latestFunctionSqlByPrefix(sql, 'public.auto_assign_support_ticket_if_unassigned(p_ticket_id uuid)')
    const statusRpc = latestFunctionSqlByPrefix(sql, 'public.update_support_ticket_status(p_ticket_id uuid, p_status text)')

    expect(staffReplyRpc).toContain('SECURITY DEFINER')
    expect(staffReplyRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(staffReplyRpc).toContain("support_private.has_capability('support.reply')")
    expect(staffReplyRpc).toContain('INSERT INTO public.support_ticket_messages')
    expect(staffReplyRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(staffReplyRpc).not.toMatch(/\bEXECUTE\b/i)

    expect(assignmentRpc).toContain("support_private.has_capability('support.manage')")
    expect(assignmentRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(assignmentRpc).toContain('UPDATE public.support_tickets')
    expect(assignmentRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(assignmentRpc).not.toMatch(/\bEXECUTE\b/i)

    expect(autoAssignmentRpc).toContain('SECURITY DEFINER')
    expect(autoAssignmentRpc).toContain("support_private.has_capability('support.manage')")
    expect(autoAssignmentRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(autoAssignmentRpc).toContain('WHERE id = p_ticket_id AND assignee_usuario_id IS NULL')
    expect(autoAssignmentRpc).not.toMatch(/SET\s+assignee_usuario_id\s*=\s*v_actor_usuario_id[\s\S]*WHERE\s+id\s*=\s*p_ticket_id\s*;/i)
    expect(autoAssignmentRpc).toContain('GET DIAGNOSTICS v_updated_count = ROW_COUNT')
    expect(autoAssignmentRpc).toContain('IF v_updated_count > 0 THEN INSERT INTO public.support_ticket_events')
    expect(autoAssignmentRpc).not.toMatch(/\bEXECUTE\b/i)

    expect(statusRpc).toContain("support_private.has_capability('support.manage')")
    expect(statusRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(statusRpc).toContain("p_status NOT IN ('received', 'in_review', 'in_progress', 'resolved', 'closed')")
    expect(statusRpc).toContain('UPDATE public.support_tickets')
    expect(statusRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(statusRpc).not.toMatch(/\bEXECUTE\b/i)
  })

  it('rejects blank staff RPC replies before message and audit insertion', () => {
    const sql = readSupportTicketSql()
    const staffReplyRpc = latestFunctionSqlByPrefix(sql, 'public.create_staff_support_ticket_reply(p_ticket_id uuid, p_body text)')

    expect(staffReplyRpc).toContain("nullif(btrim(p_body), '') IS NULL")
    expect(staffReplyRpc.indexOf("RAISE EXCEPTION 'invalid support ticket reply'")).toBeGreaterThan(staffReplyRpc.indexOf("nullif(btrim(p_body), '') IS NULL"))
    expect(staffReplyRpc.indexOf('INSERT INTO public.support_ticket_messages')).toBeGreaterThan(staffReplyRpc.indexOf("RAISE EXCEPTION 'invalid support ticket reply'"))
    expect(staffReplyRpc.indexOf('INSERT INTO public.support_ticket_events')).toBeGreaterThan(staffReplyRpc.indexOf('INSERT INTO public.support_ticket_messages'))
  })

  it('keeps staff mutation RPC execution limited to authenticated callers', () => {
    const sql = readSupportTicketSql()

    for (const signature of [
      'public.create_staff_support_ticket_reply(uuid, text)',
      'public.assign_support_ticket(uuid, uuid)',
      'public.auto_assign_support_ticket_if_unassigned(uuid)',
      'public.update_support_ticket_status(uuid, text)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`)
    }
  })

  it('adds audited support capability admin RPCs with allowlist, higher-role, and support.manage gates', () => {
    const sql = readSupportTicketSql()
    const grantRpc = latestFunctionSqlByPrefix(sql, 'public.grant_support_capability(p_target_usuario_id uuid, p_capability text)')
    const revokeRpc = latestFunctionSqlByPrefix(sql, 'public.revoke_support_capability(p_target_usuario_id uuid, p_capability text)')

    expect(grantRpc).toContain('SECURITY DEFINER')
    expect(grantRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(grantRpc).toContain("support_private.has_capability('support.manage')")
    expect(grantRpc).toContain("rs.nombre_interno IN ('admin', 'pastor', 'director-general')")
    expect(grantRpc).toContain("p_capability NOT IN ('support.view', 'support.reply', 'support.manage')")
    expect(grantRpc).toContain('INSERT INTO public.support_user_capabilities')
    expect(grantRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(grantRpc).not.toMatch(/\bEXECUTE\b/i)

    expect(revokeRpc).toContain("support_private.has_capability('support.manage')")
    expect(revokeRpc).toContain("rs.nombre_interno IN ('admin', 'pastor', 'director-general')")
    expect(revokeRpc).toContain("p_capability NOT IN ('support.view', 'support.reply', 'support.manage')")
    expect(revokeRpc).toContain('UPDATE public.support_user_capabilities')
    expect(revokeRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(revokeRpc).not.toMatch(/\bEXECUTE\b/i)
  })

  it('keeps nullable support capability audit events readable only to higher-role support managers', () => {
    const sql = readSupportTicketSql()
    const selectPolicy = latestPolicySqlByName(sql, 'support_events_select')

    expect(sql).toContain('ALTER COLUMN ticket_id DROP NOT NULL')
    expect(selectPolicy).toContain('ticket_id IS NULL')
    expect(selectPolicy).toContain("target_type = 'support_user_capability'")
    expect(selectPolicy).toContain('support_private.has_support_configuration_access()')
    expect(selectPolicy).toContain('st.id = ticket_id')
    expect(selectPolicy).toContain("support_private.has_capability('support.view')")
  })

  it('keeps support capability admin RPC execution limited to authenticated callers', () => {
    const sql = readSupportTicketSql()

    for (const signature of [
      'public.grant_support_capability(uuid, text)',
      'public.revoke_support_capability(uuid, text)',
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`)
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`)
    }
  })

  it('adds an atomic service-role RPC for external inbound audit and message persistence', () => {
    const sql = readSupportTicketSql()
    const inboundRpc = latestFunctionSqlByPrefix(sql, 'public.record_support_external_inbound_update(')

    expect(inboundRpc).toContain('SECURITY DEFINER')
    expect(inboundRpc).toContain("SET search_path TO 'public', 'support_private'")
    expect(inboundRpc).toContain('INSERT INTO public.support_ticket_events')
    expect(inboundRpc).toContain('ON CONFLICT (idempotency_key) DO NOTHING')
    expect(inboundRpc).toContain('ste.ticket_id = p_ticket_id')
    expect(inboundRpc).toContain("ste.action = 'external.update.received'")
    expect(inboundRpc).toContain("ste.target_type = 'support_external_update'")
    expect(inboundRpc).toContain('INSERT INTO public.support_ticket_messages')
    expect(inboundRpc.indexOf('INSERT INTO public.support_ticket_events')).toBeLessThan(inboundRpc.indexOf('INSERT INTO public.support_ticket_messages'))
    expect(inboundRpc).not.toMatch(/\bEXECUTE\b/i)
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text) FROM PUBLIC')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.record_support_external_inbound_update(uuid, uuid, text, text) TO service_role')
  })

  it('keeps generated support ticket event types consistent with nullable ticket_id', () => {
    const types = readDatabaseTypes()
    const supportEventsStart = types.indexOf('support_ticket_events: {')
    const supportMessagesStart = types.indexOf('support_ticket_messages: {')
    const supportEventsTypes = types.slice(supportEventsStart, supportMessagesStart)

    expect(supportEventsTypes).toContain('ticket_id: string | null')
    expect(supportEventsTypes).toContain('ticket_id?: string | null')
  })

  it('closes direct staff ticket updates so audited fields require RPCs', () => {
    const sql = readSupportStaffDirectMutationMigration()

    expect(sql).toContain('REVOKE UPDATE ON public.support_tickets FROM authenticated')
    expect(sql).toContain('DROP POLICY IF EXISTS support_tickets_update ON public.support_tickets')
    expect(sql).not.toMatch(/CREATE POLICY\s+support_tickets_update\s+ON\s+public\.support_tickets[\s\S]*support_private\.has_capability\('support\.manage'\)/i)
    expect(sql).not.toMatch(/GRANT\s+[^;]*\bUPDATE\b[^;]*ON\s+public\.support_tickets\s+TO\s+authenticated/i)
  })

  it('keeps direct message inserts reporter-only so staff replies require the audited RPC', () => {
    const sql = readSupportStaffDirectMutationMigration()
    const insertPolicy = policySql(sql, 'support_messages_insert')

    expect(sql).toContain('DROP POLICY IF EXISTS support_messages_insert ON public.support_ticket_messages')
    expect(insertPolicy).toContain('author_usuario_id = support_private.current_usuario_id()')
    expect(insertPolicy).toContain('is_internal = false')
    expect(insertPolicy).toContain('st.reporter_usuario_id = support_private.current_usuario_id()')
    expect(insertPolicy).not.toContain("support_private.has_capability('support.reply')")
  })
})
