// Smoke test para el endpoint de búsqueda de usuarios para relaciones familiares.
// Requiere la app corriendo y (opcionalmente) sesión autenticada en el navegador si se usan cookies.
// Uso:
//   BASE_URL=http://localhost:3000 Q=juan node scripts/smoke-relaciones-buscar.mjs
// Variables:
//   BASE_URL   -> URL base (default http://localhost:3000)
//   Q          -> Query de búsqueda (default vacía)
//   EXPECT_200 -> Si se define (cualquier valor), marcará fallo si status != 200
// Salida: imprime status y muestra un fragmento del JSON si 200.

const base = process.env.BASE_URL || 'http://localhost:3000';
const q = process.env.Q || '';

async function main() {
  const url = `${base}/api/usuarios/buscar-para-relacion?q=${encodeURIComponent(q)}`;
  console.log('GET', url);
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Total recibidos:', Array.isArray(data?.usuarios) ? data.usuarios.length : 'N/A');
      if (Array.isArray(data?.usuarios)) {
        console.log('Primeros usuarios:', data.usuarios.slice(0, 3).map(u => ({ id: u.id, nombre: u.nombre, yaFamiliar: u.yaFamiliar })).slice(0, 3));
      } else if (Array.isArray(data)) {
        // fallback si simplemente devolvemos array
        console.log('Primeros usuarios:', data.slice(0,3));
      }
      if (process.env.EXPECT_200 && res.status !== 200) {
        console.error('ERROR: se esperaba 200');
        process.exit(1);
      }
    } else {
      if (process.env.EXPECT_200) {
        console.error('ERROR: status != 200');
        process.exit(1);
      }
    }
  } catch (e) {
    console.error('Error fetch:', e.message);
    process.exit(1);
  }
  process.exit(0);
}

main();
