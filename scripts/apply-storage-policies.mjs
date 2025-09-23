#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Cargar variables de entorno
config({ path: join(__dirname, '../.env.local') })

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyStoragePolicies() {
  try {
    console.log('🔄 Aplicando políticas de Storage para fotos de perfil...')
    
    // Leer el archivo SQL
    const sqlPath = join(__dirname, '../database/storage/update_profile_photos_policies.sql')
    const sqlContent = readFileSync(sqlPath, 'utf8')
    
    // Dividir el SQL en comandos individuales y ejecutarlos
    const commands = sqlContent
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0 && !cmd.startsWith('--'))
    
    console.log(`📝 Ejecutando ${commands.length} comandos SQL...`)
    
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]
      if (command.trim()) {
        console.log(`   ${i + 1}/${commands.length}: Ejecutando comando...`)
        const { error } = await supabase.rpc('exec', { sql: command })
        
        if (error) {
          console.error(`❌ Error en comando ${i + 1}:`, error)
          console.error(`   SQL: ${command.substring(0, 100)}...`)
          process.exit(1)
        }
      }
    }
    
    console.log('✅ Políticas de Storage aplicadas exitosamente')
    console.log('📋 Cambios realizados:')
    console.log('   - Función es_lider_usuario() creada')
    console.log('   - Políticas de Storage actualizadas para permitir gestión por líderes')
    console.log('   - Líderes pueden ahora gestionar fotos de sus miembros')
    
  } catch (error) {
    console.error('❌ Error inesperado:', error)
    process.exit(1)
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  applyStoragePolicies()
}
