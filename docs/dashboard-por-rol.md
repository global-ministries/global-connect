# Dashboard por rol en GlobalConnect

Este documento describe la arquitectura, responsabilidades y guía de implementación del nuevo Dashboard con vistas personalizadas por rol. También documenta el diseño de las tarjetas KPI, alineado al estilo de las tarjetas de Reportes.

## Objetivos
- **Vistas fijas por rol**: Admin/Pastor/Director General, Director de Etapa, Líder, Miembro.
- **Data unificada**: Una RPC entrega el JSON necesario según el rol del usuario.
- **UI consistente**: Reutilizar el sistema de diseño y replicar el estilo de las tarjetas usadas en Reportes.

## Estructura
- `app/dashboard/page.tsx`
  - Server Component. Llama a `obtenerDatosDashboard()` y selecciona el layout por rol.
- `lib/dashboard/obtenerDatosDashboard.ts`
  - Server function. Resuelve el rol principal (admin, pastor, director-general, director-etapa, lider, miembro).
  - Intenta llamar la RPC `obtener_datos_dashboard(p_auth_id)` y hace fallback a `obtenerBaselineStats()` para roles superiores.
- `components/dashboard/roles/`
  - `DashboardAdmin.tsx`
  - `DashboardDirector.tsx`
  - `DashboardLider.tsx`
  - `DashboardMiembro.tsx`
  - Todos son Client Components ("use client"). Reciben datos vía props y renderizan su grid y widgets.
- `components/dashboard/widgets/`
  - Widgets reutilizables y “tontos”: `MetricWidget`, `DonutWidget`, `ActivityWidget`, `StatsWidget`, `QuickActionsWidget`, `KpisGruposPanel`.
  - Todos son Client Components.

## Flujo de datos
1. `page.tsx` (Server) → `obtenerDatosDashboard()` (Server) → RPC (si existe) o fallback.
2. Según `data.rol`, renderiza el layout: Admin/Director/Líder/Miembro.
3. Los layouts por rol pasan datos a widgets puramente de presentación.

## RPC unificada sugerida
- Nombre: `obtener_datos_dashboard(p_auth_id uuid)`
- Retorno JSON estructurado por rol. Ejemplo:
```json
{
  "rol": "admin",
  "widgets": {
    "kpis_globales": { /* ... */ },
    "proximos_cumpleanos": [ /* ... */ ],
    "grupos_en_riesgo": [ /* ... */ ]
  }
}
```
- Nota: La implementación actual hace fallback a `obtenerBaselineStats()` para Admin/Pastor/Director General mientras se crea la RPC.

## Diseño: tarjetas KPI del Dashboard (igual a Reportes)
Las tarjetas KPI del dashboard replican el patrón visual de las tarjetas de Reportes.
- Componente: `components/dashboard/widgets/MetricWidget.tsx`
- Base visual: `TarjetaSistema` (glassmorphism), padding `p-6`.
- Contenido:
  - Ícono con fondo en gradiente (naranja por defecto) en un contenedor `p-3 rounded-xl`.
  - Label en `TextoSistema variante="sutil" tamaño="sm"`.
  - Valor principal en `TituloSistema nivel={2}` con `text-3xl font-bold`.
- Ejemplo de tarjeta en Reportes: ver `components/reportes/ReporteSemanal.client.tsx` (sección KPIs globales) y `TarjetaSistema`.

Patrón usado en `MetricWidget`:
```tsx
<TarjetaSistema className="p-6">
  <div className="flex items-center gap-4">
    <div className="p-3 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex-shrink-0">
      <Icono className="w-6 h-6 text-white" />
    </div>
    <div className="flex-1">
      <TextoSistema variante="sutil" tamaño="sm">{title}</TextoSistema>
      <TituloSistema nivel={2} className="text-3xl font-bold text-gray-900">{value}</TituloSistema>
    </div>
  </div>
</TarjetaSistema>
```

## Decisiones y buenas prácticas
- **Client Components por rol**: Evita errores de serialización de funciones (p. ej. íconos de `lucide-react`) desde Server → Client.
- **Separación de responsabilidades**: `page.tsx` resuelve datos/rol; los layouts por rol se enfocan en UI.
- **Simplicidad y consistencia**: Uso de `TarjetaSistema`, `TituloSistema`, `TextoSistema` para una UI coherente.

## Cómo extender/iterar
- **Nuevos widgets**: Crear en `components/dashboard/widgets/` con “use client” y props tipadas. Mantener estilo con `TarjetaSistema`.
- **Datos por rol**: Ampliar `obtener_datos_dashboard` en Supabase y parsear en `obtenerDatosDashboard()`.
- **Colores por KPI**: Permitir prop opcional para gradiente; por ahora, naranja por defecto.

## Pendientes recomendados
- Implementar la RPC `obtener_datos_dashboard` con agregaciones reales por rol.
- Conectar widgets de Director/Líder/Miembro a datos reales.
- Testear rendimiento y caché en la carga del dashboard.

## Convenciones de commits
- `refactor(dashboard): ...` para cambios de estructura.
- `feat(dashboard): ...` para nuevas vistas o widgets.
- `feat(db): ...` para migraciones/RPC.

