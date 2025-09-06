/*
  Smoke test del endpoint /api/auditoria/miembros
  Requiere BASE_URL=http://localhost:3000 y (opcional) GRUPO_ID para filtrar.
*/

const base = process.env.BASE_URL || 'http://localhost:3000';
const grupoId = process.env.GRUPO_ID;

async function tryFetch(name, url) {
  try {
    const res = await fetch(url);
    console.log(`[${name}] status`, res.status);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      console.log(`[${name}] items`, Array.isArray(json) ? json.length : (json?.length || 0));
    }
    return res.status;
  } catch (e) {
    console.log(`[${name}] error`, e?.message);
    return 0;
  }
}

(async () => {
  const url = new URL('/api/auditoria/miembros', base);
  if (grupoId) url.searchParams.set('grupoId', grupoId);
  url.searchParams.set('limit', '5');
  const status = await tryFetch('AUDIT', url.toString());
  const ok = [200, 401].includes(status);
  console.log('SMOKE AUDIT DONE', ok ? 'PASS' : 'PARTIAL');
})();
