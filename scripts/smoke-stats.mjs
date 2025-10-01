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

;(async () => {
  try {
    const { data: u, error: e1 } = await supabase.from('usuarios').select('auth_id').not('auth_id', 'is', null).limit(1)
    if (e1 || !u || !u[0]) {
      console.error('❌ No pude obtener un auth_id válido', e1?.message)
      process.exit(1)
    }
    const authId = u[0].auth_id

    async function probar(enGrupo) {
      const params = {
        p_auth_id: authId,
        p_busqueda: '',
        p_roles_filtro: [],
        p_con_email: null,
        p_con_telefono: null,
      }
      if (enGrupo !== undefined) params.p_en_grupo = enGrupo

      const { data, error } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', params)
      if (error) {
        console.log(`p_en_grupo=${String(enGrupo)} ❌`, error.message)
      } else {
        console.log(`p_en_grupo=${String(enGrupo)} ✅`, data)
      }
    }

    await probar(true)
    await probar(false)
    await probar(undefined)

    process.exit(0)
  } catch (err) {
    console.error('💥 Error inesperado', err.message)
    process.exit(1)
  }
})()
