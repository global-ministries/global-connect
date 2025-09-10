#!/usr/bin/env node
/**
 * Pruebas de contrato para RPCs de asistencia.
 * Requisitos:
 *  - Variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (service role para garantizar permisos en pruebas controladas)
 *  - Se asume que existe al menos un grupo donde el usuario/miembro se pueda usar para registrar asistencia.
 */
// Ejecutar con: pnpm run test:rpc:asistencia
// Usamos CommonJS para evitar problemas de ESM al invocar ts-node.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createClient } = require('@supabase/supabase-js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { z } = require('zod')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs')
const path = require('path')

// Cargar .env.local manualmente si variables clave no existen
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const envPath = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
  content.split(/\r?\n/).forEach((line: string) => {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) {
        const key = m[1].trim()
        let val = m[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        if (!process.env[key]) process.env[key] = val
      }
    })
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const { SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Esquemas
const eventoSchema = z.object({
  id: z.string().uuid(),
  grupo_id: z.string().uuid(),
  fecha: z.string(),
  hora: z.string().nullable().optional(),
  tema: z.string().nullable(),
  notas: z.string().nullable()
})

const asistenciaRowSchema = z.object({
  usuario_id: z.string().uuid(),
  presente: z.boolean(),
  motivo_inasistencia: z.string().nullable(),
  registrado_por_usuario_id: z.string().uuid().nullable(),
  fecha_registro: z.string(),
  nombre: z.string().nullable().optional(),
  apellido: z.string().nullable().optional(),
  rol: z.string().nullable().optional()
})

const listaEventoSchema = z.object({
  id: z.string().uuid(),
  fecha: z.string(),
  hora: z.string().nullable().optional(),
  tema: z.string().nullable(),
  notas: z.string().nullable(),
  total: z.number(),
  presentes: z.number(),
  porcentaje: z.number()
})

async function main() {
  // Detectar un grupo y un miembro existente
  let miembroRes = await supabase.from('grupo_miembros').select('usuario_id, grupo_id, usuarios:usuario_id(auth_id)').limit(1)
  let usuarioId: string
  let grupoId: string
  let authId: string
  if (!miembroRes.error && miembroRes.data && miembroRes.data.length > 0) {
    const { usuario_id, grupo_id, usuarios } = miembroRes.data[0] as any
    usuarioId = usuario_id
    grupoId = grupo_id
    authId = usuarios?.auth_id
  } else {
    // Crear grupo + miembro usando usuario existente con auth_id válido
    console.log('No hay miembros existentes: creando grupo y miembro con un usuario existente con auth_id...')
    const usuarioExist = await supabase.from('usuarios').select('id, auth_id').not('auth_id','is', null).limit(1).single()
    if (usuarioExist.error || !usuarioExist.data || !usuarioExist.data.auth_id) {
      throw new Error('No se encontró un usuario con auth_id (ejecuta un signup primero).')
    }
    usuarioId = usuarioExist.data.id
    authId = usuarioExist.data.auth_id
    // Necesitamos una temporada y un segmento existentes
    const segmento = await supabase.from('segmentos').select('id').limit(1).single()
    const temporada = await supabase.from('temporadas').select('id').limit(1).single()
    if (segmento.error || temporada.error) throw new Error('Faltan segmento o temporada para crear grupo')
    const grupoInsert = await supabase.from('grupos').insert({ nombre: 'Grupo QA ' + Date.now(), segmento_id: segmento.data.id, temporada_id: temporada.data.id }).select('id').single()
    if (grupoInsert.error) throw new Error('Error creando grupo prueba: ' + grupoInsert.error.message)
    grupoId = grupoInsert.data.id
    const miembroInsert = await supabase.from('grupo_miembros').insert({ grupo_id: grupoId, usuario_id: usuarioId, rol: 'Miembro' }).select('usuario_id').single()
    if (miembroInsert.error) throw new Error('Error creando miembro prueba: ' + miembroInsert.error.message)
  }
  if (!authId) throw new Error('No se pudo determinar auth_id')

  const fechaHoy = new Date().toISOString().slice(0,10) as string

  // 1. registrar_asistencia (idempotencia por fecha)
  const registrarPayload = {
    p_auth_id: authId,
    p_grupo_id: grupoId,
    p_fecha: fechaHoy,
    p_hora: '18:30',
    p_tema: 'Contrato QA',
    p_notas: 'Prueba automática',
    p_asistencias: [
      { usuario_id: usuarioId, presente: true, motivo_inasistencia: null }
    ]
  }
  const reg = await supabase.rpc('registrar_asistencia', registrarPayload as any)
  if (reg.error || !reg.data) {
    throw new Error('registrar_asistencia fallo: ' + reg.error?.message)
  }
  const eventoId = reg.data as string
  console.log('registrar_asistencia OK -> eventoId', eventoId)

  // 2. obtener_evento_grupo
  const evRes = await supabase.rpc('obtener_evento_grupo', { p_auth_id: authId, p_evento_id: eventoId })
  if (evRes.error) throw new Error('obtener_evento_grupo error: ' + evRes.error.message)
  if (!Array.isArray(evRes.data) || evRes.data.length === 0) throw new Error('obtener_evento_grupo sin datos')
  eventoSchema.parse(evRes.data[0])
  console.log('obtener_evento_grupo OK')

  // 3. obtener_asistencia_evento
  const asRes = await supabase.rpc('obtener_asistencia_evento', { p_auth_id: authId, p_evento_id: eventoId })
  if (asRes.error) throw new Error('obtener_asistencia_evento error: ' + asRes.error.message)
  if (!Array.isArray(asRes.data) || asRes.data.length === 0) throw new Error('obtener_asistencia_evento sin filas')
  asistenciaRowSchema.parse(asRes.data[0])
  console.log('obtener_asistencia_evento OK')

  // 4. listar_eventos_grupo
  const listRes = await supabase.rpc('listar_eventos_grupo', { p_auth_id: authId, p_grupo_id: grupoId, p_limit: 5, p_offset: 0 })
  if (listRes.error) throw new Error('listar_eventos_grupo error: ' + listRes.error.message)
  if (!Array.isArray(listRes.data) || listRes.data.length === 0) throw new Error('listar_eventos_grupo sin filas')
  listaEventoSchema.parse(listRes.data[0])
  console.log('listar_eventos_grupo OK')

  // Validación KPI
  const first = listRes.data.find((x: any) => x.id === eventoId)
  if (!first) throw new Error('Evento recién creado no aparece en listar_eventos_grupo')
  if (first.total < 1 || first.presentes < 1) throw new Error('KPI inconsistente en evento creado')

  console.log('\nTODAS LAS PRUEBAS RPC ASISTENCIA PASARON ✅')
}

main().catch(e => {
  console.error('FALLO RPC:', e)
  process.exit(1)
})
