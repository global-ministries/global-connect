#!/usr/bin/env node

/**
 * Script para probar el sistema de permisos de usuarios por rol
 * Valida que cada rol vea solo los usuarios que debe ver según los requisitos
 * ACTUALIZADO para usar la estructura real de la base de datos
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Cargar variables de entorno
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value) {
      process.env[key] = value.replace(/"/g, '')
    }
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function probarRPC(authId, usuario, descripcion) {
  log(`\n🧪 Probando ${usuario.rol}: ${descripcion}`, 'cyan')
  log(`   Usuario: ${usuario.nombre} ${usuario.apellido}`, 'blue')
  
  try {
    // Probar listar usuarios
    const { data: usuarios, error: errorUsuarios } = await supabase
      .rpc('listar_usuarios_con_permisos', {
        p_auth_id: authId,
        p_busqueda: '',
        p_roles_filtro: null,
        p_con_email: null,
        p_con_telefono: null,
        p_limite: 10,
        p_offset: 0
      })

    if (errorUsuarios) {
      log(`   ❌ Error al listar usuarios: ${errorUsuarios.message}`, 'red')
      return false
    }

    // Probar estadísticas
    const { data: estadisticas, error: errorStats } = await supabase
      .rpc('obtener_estadisticas_usuarios_con_permisos', {
        p_auth_id: authId
      })

    if (errorStats) {
      log(`   ❌ Error al obtener estadísticas: ${errorStats.message}`, 'red')
      return false
    }

    const stats = estadisticas?.[0] || {}
    const totalUsuarios = Number(stats.total_usuarios || 0)
    const usuariosEncontrados = usuarios?.length || 0

    log(`   ✅ Usuarios visibles: ${usuariosEncontrados}`, 'green')
    log(`   ✅ Total en estadísticas: ${totalUsuarios}`, 'green')
    log(`   ✅ Con email: ${stats.con_email || 0}`, 'green')
    log(`   ✅ Con teléfono: ${stats.con_telefono || 0}`, 'green')
    log(`   ✅ Registrados hoy: ${stats.registrados_hoy || 0}`, 'green')

    // Validar consistencia
    if (usuariosEncontrados > 0 && totalUsuarios !== usuariosEncontrados) {
      log(`   ⚠️  Inconsistencia: ${usuariosEncontrados} usuarios vs ${totalUsuarios} en estadísticas`, 'yellow')
    }

    // Mostrar algunos usuarios de ejemplo
    if (usuarios && usuarios.length > 0) {
      log(`   📋 Primeros usuarios visibles:`, 'blue')
      usuarios.slice(0, 3).forEach(u => {
        log(`      - ${u.nombre} ${u.apellido} (${u.rol_nombre_visible})`, 'cyan')
      })
    }

    return true

  } catch (error) {
    log(`   ❌ Error inesperado: ${error.message}`, 'red')
    return false
  }
}

async function obtenerUsuariosReales() {
  log('\n🔍 Obteniendo usuarios reales del sistema...', 'blue')
  
  // Obtener usuarios con sus roles
  const { data: usuarios, error } = await supabase
    .from('usuarios')
    .select(`
      id,
      auth_id,
      nombre,
      apellido,
      usuario_roles!fk_usuario_roles_usuario_id (
        roles_sistema!fk_usuario_roles_rol_id (
          nombre_interno,
          nombre_visible
        )
      )
    `)
    .not('auth_id', 'is', null)
    .limit(20)

  if (error) {
    log(`   ❌ Error al obtener usuarios: ${error.message}`, 'red')
    return []
  }

  if (!usuarios || usuarios.length === 0) {
    log('   ⚠️  No hay usuarios con auth_id en el sistema', 'yellow')
    return []
  }

  // Agrupar por rol
  const usuariosPorRol = {}
  usuarios.forEach(usuario => {
    const rol = usuario.usuario_roles[0]?.roles_sistema?.nombre_interno
    if (rol) {
      if (!usuariosPorRol[rol]) usuariosPorRol[rol] = []
      usuariosPorRol[rol].push({
        ...usuario,
        rol,
        rol_visible: usuario.usuario_roles[0]?.roles_sistema?.nombre_visible
      })
    }
  })

  log(`   ✅ Encontrados ${usuarios.length} usuarios con auth_id`, 'green')
  Object.entries(usuariosPorRol).forEach(([rol, users]) => {
    log(`      - ${rol}: ${users.length} usuario(s)`, 'cyan')
  })

  return usuariosPorRol
}

async function validarEsquemaBaseDatos() {
  log('\n🔍 Validando esquema de base de datos...', 'blue')
  
  try {
    // Verificar que existen las funciones RPC
    const { data, error } = await supabase
      .rpc('listar_usuarios_con_permisos', { 
        p_auth_id: '00000000-0000-0000-0000-000000000000',
        p_limite: 1,
        p_offset: 0
      })

    // Si no hay error de función no existe, entonces la función está disponible
    log('   ✅ Función listar_usuarios_con_permisos disponible', 'green')

  } catch (err) {
    if (err.message.includes('function') && err.message.includes('does not exist')) {
      log('   ❌ La función listar_usuarios_con_permisos no existe', 'red')
      log('   💡 Ejecuta las migraciones primero: supabase db push', 'yellow')
      return false
    }
  }

  try {
    // Verificar función de estadísticas
    const { data, error } = await supabase
      .rpc('obtener_estadisticas_usuarios_con_permisos', {
        p_auth_id: '00000000-0000-0000-0000-000000000000'
      })

    log('   ✅ Función obtener_estadisticas_usuarios_con_permisos disponible', 'green')

  } catch (err) {
    if (err.message.includes('function') && err.message.includes('does not exist')) {
      log('   ❌ La función obtener_estadisticas_usuarios_con_permisos no existe', 'red')
      return false
    }
  }

  // Verificar tablas clave
  const tablasVerificar = ['segmento_lideres', 'grupo_miembros', 'relaciones_usuarios']
  
  for (const tabla of tablasVerificar) {
    try {
      const { data, error } = await supabase
        .from(tabla)
        .select('id')
        .limit(1)

      if (error && error.message.includes('does not exist')) {
        log(`   ❌ La tabla ${tabla} no existe`, 'red')
        return false
      }
      
      log(`   ✅ Tabla ${tabla} disponible`, 'green')
    } catch (err) {
      log(`   ❌ Error verificando tabla ${tabla}: ${err.message}`, 'red')
      return false
    }
  }

  log('   ✅ Esquema de base de datos válido', 'green')
  return true
}

async function main() {
  log('🚀 Iniciando pruebas del sistema de permisos de usuarios', 'bright')
  log('📋 Usando estructura real de base de datos', 'blue')
  
  // Validar esquema
  const esquemaValido = await validarEsquemaBaseDatos()
  if (!esquemaValido) {
    process.exit(1)
  }

  // Obtener usuarios reales
  const usuariosPorRol = await obtenerUsuariosReales()
  
  if (Object.keys(usuariosPorRol).length === 0) {
    log('\n❌ No hay usuarios disponibles para probar', 'red')
    log('💡 Crea algunos usuarios con roles asignados primero', 'yellow')
    process.exit(1)
  }

  // Probar cada rol disponible
  const resultados = []

  for (const [rol, usuarios] of Object.entries(usuariosPorRol)) {
    // Tomar el primer usuario de cada rol
    const usuario = usuarios[0]
    
    let descripcion = ''
    switch (rol) {
      case 'admin':
        descripcion = 'Debe ver TODOS los usuarios'
        break
      case 'pastor':
        descripcion = 'Debe ver TODOS los usuarios'
        break
      case 'director-general':
        descripcion = 'Debe ver TODOS los usuarios'
        break
      case 'director-etapa':
        descripcion = 'Debe ver usuarios de SUS etapas asignadas'
        break
      case 'lider':
        descripcion = 'Debe ver usuarios de grupos donde es LÍDER'
        break
      case 'miembro':
        descripcion = 'Debe ver solo usuarios de SU familia'
        break
      default:
        descripcion = `Probando rol: ${rol}`
    }

    const exito = await probarRPC(usuario.auth_id, usuario, descripcion)
    resultados.push({ rol, usuario: usuario.nombre, exito })
  }

  // Resumen final
  log('\n📊 Resumen de pruebas:', 'bright')
  const exitosos = resultados.filter(r => r.exito).length
  const total = resultados.length

  resultados.forEach(({ rol, usuario, exito }) => {
    const icono = exito ? '✅' : '❌'
    const color = exito ? 'green' : 'red'
    log(`   ${icono} ${rol} (${usuario})`, color)
  })

  log(`\n🎯 Resultado: ${exitosos}/${total} pruebas exitosas`, exitosos === total ? 'green' : 'red')

  if (exitosos === total) {
    log('🎉 ¡Todas las pruebas pasaron! El sistema de permisos funciona correctamente.', 'green')
    process.exit(0)
  } else {
    log('⚠️  Algunas pruebas fallaron. Revisa la implementación.', 'yellow')
    process.exit(1)
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log(`💥 Error fatal: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  })
}
