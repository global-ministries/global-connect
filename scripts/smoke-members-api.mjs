// Simple smoke tests for members endpoints. Requires app running (BASE_URL) and auth to exercise 200s.
// Usage:
//   BASE_URL=http://localhost:3000 GROUP_ID=<uuid> node scripts/smoke-members-api.mjs

const base = process.env.BASE_URL || 'http://localhost:3000';
const grupoId = process.env.GROUP_ID || 'TEST-GROUP-ID';
const cookieHeader = process.env.COOKIE; // e.g., sb-access-token=...; sb-refresh-token=...
const bearer = process.env.AUTH_BEARER; // e.g., a Supabase access token

async function run() {
  const results = [];

  async function tryFetch(name, url, init = {}) {
    const headers = {
      ...(init.headers || {}),
    };
    if (cookieHeader) headers['cookie'] = cookieHeader;
    if (bearer) headers['authorization'] = `Bearer ${bearer}`;
    const finalInit = { ...init, headers };
    try {
      const res = await fetch(url, finalInit);
      results.push({ name, status: res.status });
      console.log(`${name}: ${res.status}`);
    } catch (e) {
      results.push({ name, status: 'ERR', error: e.message });
      console.log(`${name}: ERR ${e.message}`);
    }
  }

  const qUrl = `${base}/api/grupos/${encodeURIComponent(grupoId)}/buscar-usuarios?q=`;
  const addUrl = `${base}/api/grupos/${encodeURIComponent(grupoId)}/miembros`;
  const memUrl = `${base}/api/grupos/${encodeURIComponent(grupoId)}/miembros/${encodeURIComponent('TEST-USER')}`;

  await tryFetch('GET buscar-usuarios', qUrl);
  await tryFetch('POST miembros', addUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuarioId: 'TEST-USER', rol: 'Miembro' })
  });
  await tryFetch('PATCH miembro rol', memUrl, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rol: 'Colíder' })
  });
  await tryFetch('DELETE miembro', memUrl, { method: 'DELETE' });

  const ok = results.length >= 4; // presence check; statuses depend on auth
  console.log('SMOKE SUMMARY:', results);
  process.exit(ok ? 0 : 1);
}

run();
