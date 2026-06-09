import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readSupportTicketMigration(): string {
  const migration = readdirSync(migrationsDir).find((file) =>
    file.endsWith('_support_ticket_system.sql')
  )

  if (!migration) {
    throw new Error('Missing support_ticket_system migration')
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

function functionSql(sql: string, functionName: string): string {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION ${functionName}[\\s\\S]*?\\$\\$;`, 'i'))

  if (!match) {
    throw new Error(`Missing function ${functionName}`)
  }

  return compactSql(match[0])
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

  it('requires global admin role plus explicit support capability', () => {
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
})
