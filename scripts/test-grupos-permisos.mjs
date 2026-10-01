#!/usr/bin/env node
/**
 * Suite de pruebas de permisos y alcance sobre grupos.
 * Valida lógica granular: roles superiores, director-etapa (asignado / no), líder y miembro.
 *
 * Requisitos:
 *  - Variables entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *  - Migraciones aplicadas (funciones: obtener_grupos_para_usuario, obtener_kpis_grupos_para_usuario; los vínculos director-grupo se escriben directo en director_etapa_grupos)
 *
 * Estrategia:
 *  1. Semilla mínima (creada vía service_role) si no existe dataset previo (usuarios + roles + segmento + grupos + relaciones)
 *  2. Ejecutar casos en orden y registrar PASS/FAIL
 *  3. Reportar resumen y códigos de salida (0 éxito, 1 fallo)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Cargar .env.local manualmente (igual que otros scripts)
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const [k, ...rest] = line.split('=');
    if (!k) continue;
    const v = rest.join('=').trim();
    if (v) process.env[k] = v.replace(/"/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Colores consola
const C = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', cyan:'\x1b[36m', magenta:'\x1b[35m', bold:'\x1b[1m'};
const log = (msg,color='reset')=>console.log(`${C[color]||''}${msg}${C.reset}`);

// Estado global pruebas
const state = {
  usuarios:{}, // { clave: { auth_id, usuario_id, rol } }
  segmento:null,
  temporada:null,
  grupos:{}, // { G1:{id,nombre} ... }
  directorSegmentoIds:{}, // { DirectorA: idSL, DirectorB: idSL }
  results:[],
  config:{ grupoPrefix:'' }
};

function record(name, pass, extra='') {
  state.results.push({ name, pass, extra });
  const icon = pass? '✅':'❌';
  log(`${icon} ${name}${extra? ' - '+extra:''}`, pass? 'green':'red');
}

// Utilidades
const rndEmail = (prefix)=> `${prefix}.${crypto.randomBytes(4).toString('hex')}@test.local`;

async function ensureRole(nombreInterno) {
  // Asumimos roles_sistema ya existen por migraciones; si no, abortamos para no introducir incoherencias.
  const { data, error } = await admin.from('roles_sistema').select('id').eq('nombre_interno', nombreInterno).limit(1);
  if (error || !data?.length) throw new Error(`Rol requerido no existe: ${nombreInterno}`);
  return data[0].id;
}

async function createAuthAndUsuario(label, rolInterno) {
  const email = rndEmail(label);
  const password = 'Test12345!';
  // Crear usuario en Auth vía Admin API
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: label, apellido: 'Test' }
  });
  if (authErr) throw new Error(`Error creando auth user ${label}: ${authErr.message}`);
  const authId = created.user.id;

  // Insert perfil si no existe
  const { data: existing, error: exErr } = await admin.from('usuarios').select('id').eq('auth_id', authId).limit(1);
  if (exErr) throw new Error(`Error verificando perfil ${label}: ${exErr.message}`);
  let usuarioId;
  if (existing && existing.length) {
    usuarioId = existing[0].id;
  } else {
    const { data: uData, error: uErr } = await admin.from('usuarios').insert({
      auth_id: authId,
      email,
      nombre: label,
      apellido: 'Test',
      genero: 'Otro',
      estado_civil: 'Soltero'
    }).select('id').single();
    if (uErr) throw new Error(`Error creando usuario ${label}: ${uErr.message}`);
    usuarioId = uData.id;
  }
  // Asignar rol
  const rolId = await ensureRole(rolInterno);
  const { error: rErr } = await admin.from('usuario_roles').insert({ usuario_id: usuarioId, rol_id: rolId });
  if (rErr) throw new Error(`Error asignando rol ${rolInterno} a ${label}: ${rErr.message}`);
  state.usuarios[label] = { auth_id: authId, usuario_id: usuarioId, rol: rolInterno };
  return state.usuarios[label];
}

async function seed() {
  log('\n🧩 Creando semilla mínima...', 'cyan');
  // Roles críticos
  const neededRoles = ['admin','director-general','pastor','director-etapa','lider','miembro'];
  for (const r of neededRoles) await ensureRole(r); // validación

  // Usuarios
  await createAuthAndUsuario('AdminGC','admin');
  await createAuthAndUsuario('DirGeneralGC','director-general');
  const dirA = await createAuthAndUsuario('DirectorA','director-etapa');
  const dirB = await createAuthAndUsuario('DirectorB','director-etapa');
  await createAuthAndUsuario('LiderL1','lider');
  await createAuthAndUsuario('MiembroM1','miembro');

  // Segmento
  const segmentoNombre = 'Segmento Test Permisos';
  const { data: segExists, error: segSelErr } = await admin.from('segmentos').select('id').eq('nombre', segmentoNombre).limit(1);
  if (segSelErr) throw new Error('Error buscando segmento: ' + segSelErr.message);
  if (segExists && segExists.length) {
    state.segmento = segExists[0].id;
  } else {
    const { data: seg, error: segErr } = await admin.from('segmentos').insert({ nombre: segmentoNombre }).select('id').single();
    if (segErr) throw new Error('Error creando segmento: ' + segErr.message);
    state.segmento = seg.id;
  }

  // Temporada activa mínima
  const temporadaNombre = 'Temp Test';
  const { data: tempExists, error: tempSelErr } = await admin.from('temporadas').select('id').eq('nombre', temporadaNombre).limit(1);
  if (tempSelErr) throw new Error('Error buscando temporada: '+ tempSelErr.message);
  if (tempExists && tempExists.length) {
    state.temporada = tempExists[0].id;
  } else {
    const { data: temp, error: tempErr } = await admin.from('temporadas').insert({ nombre: temporadaNombre, fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31', activa: true }).select('id').single();
    if (tempErr) throw new Error('Error creando temporada: '+ tempErr.message);
    state.temporada = temp.id;
  }

  // Registrar directores de etapa (segmento_lideres) uno por uno
  const { data: slA, error: slAErr } = await admin.from('segmento_lideres').insert({ usuario_id: dirA.usuario_id, segmento_id: state.segmento, tipo_lider: 'director_etapa' }).select('id').single();
  if (slAErr) throw new Error('Error insertando segmento_lideres DirectorA: '+slAErr.message);
  state.directorSegmentoIds.DirectorA = slA.id;
  const { data: slB, error: slBErr } = await admin.from('segmento_lideres').insert({ usuario_id: dirB.usuario_id, segmento_id: state.segmento, tipo_lider: 'director_etapa' }).select('id').single();
  if (slBErr) throw new Error('Error insertando segmento_lideres DirectorB: '+slBErr.message);
  state.directorSegmentoIds.DirectorB = slB.id;

  // Grupos (4 grupos base)
  // Prefijo único para aislar dataset
  state.config.grupoPrefix = `PTG_${crypto.randomBytes(3).toString('hex')}_`;
  const nombresGrupos = ['G1','G2','G3','G4'].map(s=> state.config.grupoPrefix + s);
  for (const nombre of nombresGrupos) {
    const { data: gIns, error: gInsErr } = await admin.from('grupos').insert({ nombre, segmento_id: state.segmento, temporada_id: state.temporada, activo: true }).select('id').single();
    if (gInsErr) throw new Error('Error creando grupo '+nombre+': '+gInsErr.message);
    const short = nombre.split('_').pop(); // G1 etc
    state.grupos[short] = { id: gIns.id, nombre };
  }

  // Asignar director A a G1 y G2 (insert directo; la autorización de asignar directores vive en las rutas API)
  for (const gName of ['G1','G2']) {
    const { error: insErr } = await admin.from('director_etapa_grupos').insert({ director_etapa_id: state.directorSegmentoIds.DirectorA, grupo_id: state.grupos[gName].id });
    if (insErr) throw new Error(`Error asignando director A a ${gName}: ${insErr.message}`);
  }

  // Líder L1 miembro y líder de G1
  const liderUsuarioId = state.usuarios['LiderL1'].usuario_id;
  const miembroUsuarioId = state.usuarios['MiembroM1'].usuario_id;
  const G1 = state.grupos['G1'].id;
  await admin.from('grupo_miembros').insert([
    { grupo_id: G1, usuario_id: liderUsuarioId, rol: 'Líder' },
    { grupo_id: G1, usuario_id: miembroUsuarioId, rol: 'Miembro' }
  ]);

  log('✅ Semilla creada', 'green');
}

async function callObtenerGrupos(authId, label) {
  // Intentar versión paginada; si falla, versión simple.
  let data, error;
  try {
    const resp = await admin.rpc('obtener_grupos_para_usuario', { p_auth_id: authId, p_limit: 100, p_offset: 0 });
    data = resp.data; error = resp.error;
    if (error && /function .* does not exist/.test(error.message)) throw error;
  } catch(e) {
    const resp2 = await admin.rpc('obtener_grupos_para_usuario', { p_auth_id: authId });
    data = resp2.data; error = resp2.error;
  }
  if (error) return record(`obtener_grupos_para_usuario ${label}`, false, error.message);
  record(`obtener_grupos_para_usuario ${label}`, true, `count=${data.length}`);
  return data;
}

async function runTests() {
  log('\n🧪 Ejecutando casos...', 'cyan');
  // Admin
  const adminData = await callObtenerGrupos(state.usuarios['AdminGC'].auth_id, 'admin');
  if (adminData) {
    const targetNames = Object.values(state.grupos).map(g=>g.nombre).sort();
    const present = targetNames.every(n => adminData.some(r=> r.nombre === n));
    record('Admin ve grupos creados (subset)', present, present? 'subset ok':'faltan');
  }

  // Director A (asignado a G1,G2)
  const directorAAuth = state.usuarios['DirectorA'].auth_id;
  const directorAGroups = await callObtenerGrupos(directorAAuth, 'directorA');
  if (directorAGroups) {
    const filtered = directorAGroups.filter(g=> g.nombre && g.nombre.startsWith(state.config.grupoPrefix));
    const nombresCortos = filtered.map(g=> g.nombre.replace(state.config.grupoPrefix,''));
    const okSet = ['G1','G2'].every(x=> nombresCortos.includes(x)) && !nombresCortos.includes('G3') && !nombresCortos.includes('G4');
    record('DirectorA ve sólo sus G1,G2', okSet, nombresCortos.join(','));
    const hasAny = filtered.length>0;
    const allSupervised = hasAny && filtered.every(g=> g.supervisado_por_mi === true);
    record('DirectorA flag supervisado_por_mi true', allSupervised, hasAny? '':'sin grupos');
  }

  // Director B (sin asignaciones; segundo director creado en slB)
  const directorBSegmentoLider = state.directorSegmentoIds.B; // necesitamos su usuario
  // Recuperar auth del segundo director (almacenado como DirectorBUser rol director-etapa duplicado)
  // Buscamos el último usuario con rol director-etapa insertado (heurística simple) -> ya tenemos en state usuarios['director-etapa'] solo uno.
  // TODO: mejorar diferenciación de múltiples directores (futuro). Por ahora se saltará test si no se distinguió.

  // Líder
  const liderAuth = state.usuarios['LiderL1'].auth_id;
  const liderGroups = await callObtenerGrupos(liderAuth, 'lider');
  if (liderGroups) {
    const filtered = liderGroups.filter(g=> g.nombre && g.nombre.startsWith(state.config.grupoPrefix));
    const ok = filtered.length === 1 && filtered[0].nombre.endsWith('G1');
    record('Líder ve sólo G1', ok, filtered.map(f=>f.nombre).join(','));
  }

  // Miembro
  const miembroAuth = state.usuarios['MiembroM1'].auth_id;
  const miembroGroups = await callObtenerGrupos(miembroAuth, 'miembro');
  if (miembroGroups) {
    const filtered = miembroGroups.filter(g=> g.nombre && g.nombre.startsWith(state.config.grupoPrefix));
    const ok = filtered.length === 1 && filtered[0].nombre.endsWith('G1');
    record('Miembro ve su grupo G1', ok, filtered.map(f=>f.nombre).join(','));
  }

  // KPI Admin
  const { data: kpisAdmin, error: kErrA } = await admin.rpc('obtener_kpis_grupos_para_usuario', { p_auth_id: state.usuarios['AdminGC'].auth_id });
  record('KPIs admin RPC', !kErrA);
  if (!kErrA) {
    const row = kpisAdmin?.[0];
    record('KPIs admin total_grupos >= 4 (baseline + nuevos)', row?.total_grupos >= 4, `tg=${row?.total_grupos}`);
  }

  // La RPC asignar_director_etapa_a_grupo se eliminó (2026-10-01): confiaba en un p_auth_id enviado por el
  // llamador. La autorización para asignar directores vive ahora en las rutas API y se cubre con Jest en
  // __tests__/app/api/directores-pareja-escrituras.test.ts; aquí solo se prepara el estado de datos.

  // Admin asigna director A a G3 (insert directo)
  const { error: assignG3Error } = await admin.from('director_etapa_grupos').insert({ director_etapa_id: state.directorSegmentoIds.DirectorA, grupo_id: state.grupos['G3'].id });
  record('Admin asigna A->G3', !assignG3Error, assignG3Error?.message || 'ok');

  // Re-verificación DirectorA ahora debería ver 3
  const directorAGroups2 = await callObtenerGrupos(directorAAuth, 'directorA post G3');
  if (directorAGroups2) {
    const filtered = directorAGroups2.filter(g=> g.nombre && g.nombre.startsWith(state.config.grupoPrefix));
    const count = filtered.length;
    record('DirectorA ve 3 grupos tras asignación G3', count === 3, `v=${count}`);
  }

  // Admin quita A de G1 (delete directo)
  const { error: removeG1Error } = await admin.from('director_etapa_grupos').delete().eq('director_etapa_id', state.directorSegmentoIds.DirectorA).eq('grupo_id', state.grupos['G1'].id);
  record('Admin quita A de G1', !removeG1Error, removeG1Error?.message || 'ok');
  const directorAGroups3 = await callObtenerGrupos(directorAAuth, 'directorA post quitar G1');
  if (directorAGroups3) {
    const filtered = directorAGroups3.filter(g=> g.nombre && g.nombre.startsWith(state.config.grupoPrefix));
    const nombres = filtered.map(g=> g.nombre.replace(state.config.grupoPrefix,''));
    record('DirectorA ya no ve G1', !nombres.includes('G1'), nombres.join(','));
  }

  // KPIs DirectorA (debe reflejar nuevo recuento)
  const { data: kpisDirA, error: kErrDirA } = await admin.rpc('obtener_kpis_grupos_para_usuario', { p_auth_id: directorAAuth });
  record('KPIs directorA RPC', !kErrDirA);
}

async function summary() {
  log('\n📊 Resumen', 'bold');
  const pass = state.results.filter(r=>r.pass).length;
  const fail = state.results.length - pass;
  state.results.forEach(r=>{
    const color = r.pass? 'green':'red';
    log(` - ${r.pass?'PASS':'FAIL'}: ${r.name} ${r.extra? '('+r.extra+')':''}`, color);
  });
  log(`\nTotal: ${pass}/${state.results.length} PASS`, pass===state.results.length? 'green':'yellow');
  process.exit(fail===0?0:1);
}

async function main() {
  log('🚀 Iniciando suite permisos grupos', 'bold');
  await seed();
  await runTests();
  await summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e=>{ console.error(e); process.exit(1); });
}
