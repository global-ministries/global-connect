## Guía de Contribución

Esta guía establece criterios claros de calidad, mantenimiento, seguridad, despliegue y colaboración para asegurar que la evolución del proyecto sea predecible y sostenible.

---
### 1. Principios de Calidad
- **Formato y Estilo:** Usa Prettier y ESLint. No commitees código sin formatear. Sigue las reglas definidas en la configuración del repositorio.
- **Simplicidad:** Evita complejidad innecesaria. Código legible > micro?optimizaciones tempranas.
- **DRY:** Reutiliza hooks, componentes y utilidades existentes antes de crear nuevos.
- **Separación de Lógica:** Los componentes deben centrarse en la presentación. La lógica de negocio y acceso a datos vive en hooks (`/hooks`) o utilidades (`/lib`).
- **Nomenclatura Consistente:** Nombres claros, descriptivos y en español. Preferir verbos en infinitivo para funciones (e.g. `obtenerUsuario`).

### 2. Arquitectura de Frontend
- **Server Components por Defecto:** Usa Client Components únicamente cuando sea imprescindible (estado local, efectos, eventos, APIs del navegador).
- **Formularios:** `react-hook-form` + `zod` para validación y tipado consistente.
- **Componentes UI Reutilizables:** Residen en `/components/ui` y no contienen lógica de negocio.
- **Estados Asíncronos:** Siempre manejar loading / error / empty / success.
- **Evitar Renderizados Innecesarios:** Memorizar cuando corresponda (`useMemo`, `React.memo`) y dividir componentes grandes.

### 3. Seguridad y Datos
- **Credenciales:** Nunca exponer secretos en el código. Usar variables de entorno y `.env.local` no versionado.
- **Supabase:** Uso exclusivo del cliente oficial. Cualquier tabla nueva debe tener Row Level Security y políticas definidas antes de exponerse.
- **Validación:** Toda entrada del usuario validada con `zod` antes de persistencia o llamadas a RPC.
- **Cookies y Tokens:** Limpiar tokens expirados. No registrar valores sensibles en logs.
- **Prevención:** Revisar posibles vectores CSRF / XSS (sanitizar input y validar origen en middleware).

### 4. Base de Datos y RPCs
- **Migraciones Versionadas:** Cada cambio estructural -> archivo numerado en `supabase/migrations` siguiendo `AAAAMMDDHHMM__descripcion.sql`.
- **Funciones RPC:** Documentar propósito y parámetros en comentarios SQL. Evitar sobrecargas ambiguas.
- **Índices:** Justificar con queries reales. Evitar duplicados.
- **Refactors de Firma:** Crear nueva función y deprecar la anterior tras actualizar el cliente.

### 5. Estilo Visual y UX
- **Patrón Visual:** Glassmorphism (blur, transparencias suaves, bordes grandes, gradientes ligeros).
- **Accesibilidad:** Asegurar labels, roles semánticos, alt en imágenes y foco visible.
- **Consistencia:** Tipografía, espaciado y colores deben provenir del design system.

### 6. Flujo de Git
- **Ramas:** `feature/`, `fix/`, `docs/`, `chore/`, `perf/`.
- **Origen:** Siempre crear ramas desde `main` actualizado.
- **Commits Atómicos:** Un único propósito por commit.
- **Rebase Limpio:** Antes de PR: `git fetch --all && git rebase origin/main`.
- **Evitar Merge Commits Locales:** Preferir rebase para mantener historial lineal.

### 7. Convención de Commits
Formato recomendado (inspirado en Conventional Commits):
```
tipo(scope): mensaje en infinitivo
```
Tipos: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`.
Ejemplos:
```
feat(usuarios): agregar filtro por grupo
fix(auth): limpiar cookies expiradas en middleware
docs(contributing): documentar flujo de migraciones
```

### 8. Pull Requests
Checklist previo al PR:
- [ ] Descripción clara (qué + por qué)
- [ ] Screenshots/GIF si hay cambios visuales
- [ ] Migraciones aplicadas y orden documentado
- [ ] Sin warnings de TypeScript / ESLint
- [ ] Sin `console.log` residuales
- [ ] Sin secretos expuestos
- [ ] Coverage manual básico validado
- [ ] Historial de commits limpio

### 9. Manejo de Errores
- **Feedback al Usuario:** Nunca dejar pantallas en blanco; mostrar mensajes claros.
- **Logs con Contexto:** Incluir identificadores relevantes; nunca datos sensibles.
- **Retentativas:** Para operaciones críticas idempotentes.

### 10. Performance
- **Búsquedas:** Usar debounce.
- **Memoización:** Solo si existe costo evidente.
- **Carga Diferida:** Cargar componentes pesados bajo demanda cuando aplicable.

### 11. Compatibilidad de Despliegue
- **Portabilidad:** El código debe funcionar en Vercel (principal), Easypanel u otros proveedores sin cambios específicos.
- **Evitar Vendor?Lock:** No usar APIs propietarias salvo que haya fallback (ejemplo: edge runtime opcional).
- **Variables de Entorno:** Definir en documentación las requeridas y valores ejemplo seguros.
- **Build Determinista:** No introducir pasos manuales no reproducibles.
- **Assets Remotos:** URLs configurables vía env (`NEXT_PUBLIC_...`) para flexibilidad entre entornos.

### 12. Documentación
- **Actualización Continua:** Al introducir nuevas rutas, hooks o RPCs, documentarlos en la carpeta `docs/`.
- **Ejemplos de Uso:** Incluir snippets para hooks complejos.

### 13. Idioma
- Todo el código, comentarios y textos de UI deben estar en español salvo especificación contraria.

### 14. Checklist Rápida antes de Commit
```
pnpm lint
pnpm typecheck (si existe)
Buscar TODO/FIXME
Revisar diff final
```

---
Si algo no está cubierto aquí, propone un PR de documentación antes de introducir cambios estructurales mayores.