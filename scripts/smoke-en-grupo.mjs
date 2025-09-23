#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Cargar .env.local si existe
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    if (!line || line.trim().startsWith('#')) return
    const idx = line.indexOf('=')
    if (idx === -1) return
    const key = line.slice(0, idx)
    const value = line.slice(idx + 1).replace(/^"|"$/g, '')
    process.env[key] = value
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function log(label, value) {
  console.log(label, value)
}

;(async () => {
  try {
    const { data: u, error: e1 } = await supabase.from('usuarios').select('auth_id').not('auth_id', 'is', null).limit(1)
    if (e1 || !u || !u[0]) {
      console.error('❌ No pude obtener un auth_id válido', e1?.message)
      process.exit(1)
    }
    const authId = u[0].auth_id

    async function probar(val) {
      try {
        const params = { p_auth_id: authId, p_limite: 2, p_offset: 0 }
        if (val !== null) params.p_en_grupo = val
        const { data, error } = await supabase.rpc('listar_usuarios_con_permisos', params)
        if (error) {
          log(`p_en_grupo=${val}`, `❌ ${error.message}`)
        } else {
          log(`p_en_grupo=${val}`, `✅ ${data?.length || 0} filas`)
        }
      } catch (err) {
        log(`p_en_grupo=${val}`, `💥 ${err.message}`)
      }
    }

    await probar(true)
    await probar(false)
    await probar(null)

    process.exit(0)
  } catch (err) {
    console.error('💥 Error inesperado', err.message)
    process.exit(1)
  }
})()
