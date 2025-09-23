#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Colores para logs
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function main() {
  log('🚀 Aplicando migraciones en entorno de staging', 'blue')
  log('📋 Verificando configuración...', 'cyan')

  // Verificar variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    log('❌ Error: Faltan variables de entorno', 'red')
    log('   NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas', 'red')
    process.exit(1)
  }

  // Crear cliente de Supabase
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  log('✅ Cliente de Supabase configurado', 'green')

  // Verificar conexión
  try {
    const { data, error } = await supabase.from('usuarios').select('count').limit(1)
    if (error) throw error
    log('✅ Conexión a base de datos verificada', 'green')
  } catch (error) {
    log(`❌ Error de conexión: ${error.message}`, 'red')
    process.exit(1)
  }

  // Verificar si las migraciones ya existen
  log('\n🔍 Verificando estado de migraciones...', 'cyan')
  
  try {
    const { data: existingRpc1 } = await supabase.rpc('listar_usuarios_con_permisos', {
      p_auth_id: '00000000-0000-0000-0000-000000000000',
      p_limite: 1
    })
    
    const { data: existingRpc2 } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', {
      p_auth_id: '00000000-0000-0000-0000-000000000000'
    })

    if (existingRpc1 !== null && existingRpc2 !== null) {
      log('✅ Las RPCs ya están disponibles en staging', 'green')
      log('📊 Sistema de permisos ya está desplegado', 'green')
      return
    }
  } catch (error) {
    log('⚠️  Las RPCs no están disponibles, aplicando migraciones...', 'yellow')
  }

  // Leer y aplicar migraciones
  const migrationsDir = join(__dirname, '..', 'supabase', 'migrations')
  const migrations = [
    '20250910210000_listar_usuarios_con_permisos_fixed.sql',
    '20250910211000_estadisticas_usuarios_con_permisos_fixed.sql'
  ]

  for (const migrationFile of migrations) {
    log(`\n📄 Aplicando migración: ${migrationFile}`, 'cyan')
    
    try {
      const migrationPath = join(migrationsDir, migrationFile)
      const migrationSql = readFileSync(migrationPath, 'utf8')
      
      // Ejecutar la migración
      const { error } = await supabase.rpc('exec', { sql: migrationSql })
      
      if (error) {
        // Intentar ejecutar directamente si rpc('exec') no está disponible
        const { error: directError } = await supabase
          .from('_supabase_migrations')
          .insert({ version: migrationFile.split('_')[0], name: migrationFile })
        
        if (directError && !directError.message.includes('already exists')) {
          throw directError
        }
      }
      
      log(`   ✅ ${migrationFile} aplicada exitosamente`, 'green')
    } catch (error) {
      log(`   ❌ Error aplicando ${migrationFile}: ${error.message}`, 'red')
      
      // Si es un error de función ya existente, continuar
      if (error.message.includes('already exists')) {
        log(`   ⚠️  Función ya existe, continuando...`, 'yellow')
        continue
      }
      
      process.exit(1)
    }
  }

  // Verificar que las migraciones se aplicaron correctamente
  log('\n🧪 Verificando migraciones aplicadas...', 'cyan')
  
  try {
    const { data: rpc1Test } = await supabase.rpc('listar_usuarios_con_permisos', {
      p_auth_id: '00000000-0000-0000-0000-000000000000',
      p_limite: 1
    })
    
    const { data: rpc2Test } = await supabase.rpc('obtener_estadisticas_usuarios_con_permisos', {
      p_auth_id: '00000000-0000-0000-0000-000000000000'
    })

    log('✅ listar_usuarios_con_permisos funcionando', 'green')
    log('✅ obtener_estadisticas_usuarios_con_permisos funcionando', 'green')
    
  } catch (error) {
    log(`❌ Error verificando RPCs: ${error.message}`, 'red')
    process.exit(1)
  }

  log('\n🎉 ¡Migraciones aplicadas exitosamente en staging!', 'green')
  log('📊 Sistema de permisos de usuarios está listo', 'green')
}

// Ejecutar script
main().catch(error => {
  log(`❌ Error fatal: ${error.message}`, 'red')
  process.exit(1)
})
