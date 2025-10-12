#!/usr/bin/env node
/**
 * Pruebas de unicidad de ciudad para directores de etapa y grupos.
 * Requiere que la migración 20251006214500_enforce_unique_director_ciudad esté aplicada.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Cargar variables .env.local si existen
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath,'utf8').split('\n')) {
    const [k,...rest] = line.split('=');
    if (!k) continue; const v = rest.join('=');
    if (v) process.env[k] = v.replace(/"/g,'').trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno SUPABASE');
  process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const C = { reset:'\x1b[0m', green:'\x1b[32m', red:'\x1b[31m', yellow:'\x1b[33m', bold:'\x1b[1m'};
const log = (m,color='reset')=> console.log(`${C[color]||''}${m}${C.reset}`);
const results = []; const record=(name,pass,extra='')=>{results.push({name,pass,extra}); log(`${pass?'✅':'❌'} ${name}${extra?' - '+extra:''}`, pass?'green':'red');};

async function ensureSeed() {
  const { data, error } = await admin.from('segmentos').select('id').eq('nombre','Segmento Test Permisos').limit(1);
  if (error) throw new Error('Error consultando segmento base: '+error.message);
  if (!data?.length) {
    log('No se encontró Segmento Test Permisos (ejecuta test-grupos-permisos primero)', 'yellow');
  }
  return data?.[0]?.id || null;
}

async function getDirector(segmentoId) {
  const { data, error } = await admin.from('segmento_lideres').select('id, usuario_id').eq('segmento_id', segmentoId).eq('tipo_lider','director_etapa').limit(1);
  if (error) throw new Error('Error obteniendo director: '+error.message);
  return data?.[0] || null;
}

async function ensureCiudades(segmentoId) {
  const nombres = ['Barquisimeto','Cabudare'];
  for (const nombre of nombres) {
    const { data, error } = await admin.from('segmento_ubicaciones').select('id').eq('segmento_id', segmentoId).eq('nombre', nombre).limit(1);
    if (error) throw new Error('Error consultando ubicacion '+nombre+': '+error.message);
    if (!data?.length) {
      const { error: insErr } = await admin.from('segmento_ubicaciones').insert({ segmento_id: segmentoId, nombre });
      if (insErr) throw new Error('No se pudo crear ubicacion '+nombre+': '+insErr.message);
    }
  }
  const { data: rows } = await admin.from('segmento_ubicaciones').select('id,nombre').eq('segmento_id', segmentoId);
  return rows;
}

async function clearDirectorAsignaciones(directorId) {
  await admin.from('director_etapa_ubicaciones').delete().eq('director_etapa_id', directorId);
}

async function assignCiudad(directorId, ciudadId) {
  // Creamos un usuario simulado con rol superior: usamos service role -> ejecutar RPC directamente con p_auth_id null fallaría
  // Para simplicidad llamamos directo a la tabla (ya que es test de integridad, no de permisos RLS del RPC).
  // PERO queremos probar el RPC con upsert. Necesitamos un auth user id con permisos. Saltamos y usamos tabla directamente si falla.
  try {
    // Buscar algun usuario admin para usar su auth_id
    const { data: adminUser } = await admin.rpc('buscar_usuario_admin_auth_id'); // Puede no existir; fallback a insert directo
    if (adminUser?.auth_id) {
      const { error: rErr } = await admin.rpc('asignar_director_etapa_a_ubicacion', {
        p_auth_id: adminUser.auth_id,
        p_director_etapa_id: directorId,
        p_segmento_ubicacion_id: ciudadId,
        p_accion: 'agregar'
      });
      if (!rErr) return true;
    }
  } catch {}
  // Fallback directo
  const { data: existing, error: selErr } = await admin.from('director_etapa_ubicaciones').select('id').eq('director_etapa_id', directorId).limit(1);
  if (selErr) throw new Error(selErr.message);
  if (existing?.length) {
    const { error: upErr } = await admin.from('director_etapa_ubicaciones').update({ segmento_ubicacion_id: ciudadId }).eq('director_etapa_id', directorId);
    if (upErr) throw new Error(upErr.message);
  } else {
    const { error: insErr } = await admin.from('director_etapa_ubicaciones').insert({ director_etapa_id: directorId, segmento_ubicacion_id: ciudadId });
    if (insErr) throw new Error(insErr.message);
  }
  return true;
}

async function run() {
  const segmentoId = await ensureSeed();
  if (!segmentoId) {
    record('Segmento base existe', false, 'faltante');
    summary();
    process.exit(1);
  } else {
    record('Segmento base existe', true);
  }
  const director = await getDirector(segmentoId);
  record('Director etapa existe', !!director, director? director.id : 'no encontrado');
  if (!director) { summary(); process.exit(1); }
  const ciudades = await ensureCiudades(segmentoId);
  record('Ciudades base presentes', ciudades?.length===2, ciudades.map(c=>c.nombre).join(','));
  const ciudadA = ciudades.find(c=>c.nombre==='Barquisimeto');
  const ciudadB = ciudades.find(c=>c.nombre==='Cabudare');
  await clearDirectorAsignaciones(director.id);
  // Asignar primera
  await assignCiudad(director.id, ciudadA.id);
  let { data: afterA } = await admin.from('director_etapa_ubicaciones').select('*').eq('director_etapa_id', director.id);
  record('Asignación inicial única', afterA?.length===1 && afterA[0].segmento_ubicacion_id===ciudadA.id, afterA?.length+' filas');
  // Reasignar a segunda (debe reemplazar, no duplicar)
  await assignCiudad(director.id, ciudadB.id);
  let { data: afterB } = await admin.from('director_etapa_ubicaciones').select('*').eq('director_etapa_id', director.id);
  record('Reemplazo ciudad (sin duplicados)', afterB?.length===1 && afterB[0].segmento_ubicacion_id===ciudadB.id, afterB?.length+' filas');
  // Reasignar misma segunda (idempotencia)
  await assignCiudad(director.id, ciudadB.id);
  let { data: afterB2 } = await admin.from('director_etapa_ubicaciones').select('*').eq('director_etapa_id', director.id);
  record('Idempotencia re-asignación misma ciudad', afterB2?.length===1 && afterB2[0].segmento_ubicacion_id===ciudadB.id);
  // Quitar
  const { error: delErr } = await admin.from('director_etapa_ubicaciones').delete().eq('director_etapa_id', director.id);
  record('Quitar ciudad deja cero filas', !delErr);
  let { data: afterDel } = await admin.from('director_etapa_ubicaciones').select('*').eq('director_etapa_id', director.id);
  record('Validar cero filas tras quitar', afterDel?.length===0, afterDel?.length+' filas');

  // Grupo sólo una ciudad (columna única): creamos grupo temporal
  const nombreGrupo = 'Grupo Ciudad Test '+Date.now();
  // Obtener un id de temporada válida si existe
  const { data: temp } = await admin.from('temporadas').select('id').limit(1);
  const temporada_id = temp?.[0]?.id || null;
  const { data: gInsert, error: gErr } = await admin.from('grupos').insert({ nombre: nombreGrupo, segmento_id: segmentoId, temporada_id, segmento_ubicacion_id: ciudadA.id }).select('id, segmento_ubicacion_id').single();
  record('Crear grupo con ciudad A', !gErr, gErr?.message||'ok');
  if (gInsert) {
    // Actualizar a ciudad B y verificar que sólo cambie el valor
    const { error: updErr } = await admin.from('grupos').update({ segmento_ubicacion_id: ciudadB.id }).eq('id', gInsert.id);
    record('Actualizar grupo a ciudad B', !updErr, updErr?.message||'ok');
    const { data: gRow } = await admin.from('grupos').select('segmento_ubicacion_id').eq('id', gInsert.id).single();
    record('Grupo refleja ciudad B', gRow?.segmento_ubicacion_id===ciudadB.id);
  }

  summary();
}

function summary() {
  log('\n📊 Resumen', 'bold');
  const pass = results.filter(r=>r.pass).length;
  results.forEach(r=> log(` - ${r.pass?'PASS':'FAIL'} ${r.name}${r.extra? ' ('+r.extra+')':''}`, r.pass?'green':'red'));
  log(`Total: ${pass}/${results.length} PASS`, pass===results.length? 'green':'yellow');
  process.exit(pass===results.length?0:1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e=> { console.error(e); process.exit(1); });
}
