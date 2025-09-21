#!/usr/bin/env node
/**
 * Smoke test de creación de cuenta:
 * - Crea un usuario en Supabase Auth con email aleatorio
 * - Verifica/crea el perfil en public.usuarios con el cliente admin (como lo hace el flujo real)
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !anon || !service) {
  console.error('Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const pub = createClient(url, anon)
const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } })

const now = Date.now()
const email = `qa+signup-${now}@example.com`
const password = 'Test12345!'
const nombre = 'QA'
const apellido = 'Signup'
const cedula = `V${Math.floor(1e7 + Math.random()*9e7)}`

async function main(){
  console.log('Signup:', email)
  let user = null
  const { data: s, error: e1 } = await pub.auth.signUp({ email, password, options: { data: { nombre, apellido }}})
  if (e1) {
    console.warn('auth.signUp error, intentando via Admin API:', e1?.code || e1?.message)
    // Fallback: crear usuario por Admin API sin enviar email (evita rate limit)
    const { data: created, error: eAdmin } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido }
    })
    if (eAdmin) {
      console.error('admin.createUser error:', eAdmin)
      process.exit(1)
    }
    user = created.user
  } else {
    user = s?.user
  }
  if (!user) {
    console.error('No user returned from signUp')
    process.exit(1)
  }
  console.log('Auth user id:', user.id)

  // Buscar perfil existente por email o cedula
  const orFilters = [`email.eq.${email}`, `cedula.eq.${cedula}`]
  const { data: usuarios, error: e2 } = await admin.from('usuarios').select('id, auth_id, email, cedula').or(orFilters.join(',')).limit(1)
  if (e2) {
    console.error('Busqueda usuarios error:', e2)
    process.exit(1)
  }

  if (usuarios && usuarios.length > 0) {
    const u = usuarios[0]
    console.log('Perfil existente encontrado:', u.id, 'auth_id:', u.auth_id)
    if (!u.auth_id) {
      const { error: eUpd } = await admin.from('usuarios').update({ auth_id: user.id }).eq('id', u.id)
      if (eUpd) {
        console.error('Error actualizando perfil:', eUpd)
        process.exit(1)
      }
      console.log('Perfil actualizado con auth_id.')
    }
  } else {
    const { error: eIns } = await admin.from('usuarios').insert([{
      auth_id: user.id,
      nombre,
      apellido,
      email,
      cedula,
      fecha_nacimiento: '1900-01-01',
      genero: 'Otro',
      estado_civil: 'Soltero',
    }])
    if (eIns) {
      console.error('Error insertando perfil:', eIns)
      process.exit(1)
    }
    console.log('Perfil creado en public.usuarios')
  }

  // Confirmar presencia final
  const { data: check, error: e3 } = await admin.from('usuarios').select('id, auth_id').eq('auth_id', user.id).limit(1)
  if (e3 || !check || check.length === 0) {
    console.error('Verificación final falló:', e3 || 'sin registro')
    process.exit(1)
  }
  console.log('Smoke signup OK -> auth_id vinculado a usuarios.id', check[0].id)
}

main().catch((e)=>{ console.error(e); process.exit(1) })
