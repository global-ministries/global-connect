/**
 * Full page reload behind a function, so components can offer "Recargar
 * página" and tests can mock it (jsdom's window.location is not configurable).
 */
export function recargarPagina(): void {
  window.location.reload()
}
