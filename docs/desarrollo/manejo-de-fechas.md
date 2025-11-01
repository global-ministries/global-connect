# Manejo de Fechas en Global Connect

## Principio General

Todas las fechas que representan **eventos agnósticos a la hora** (como `fecha_nacimiento`, fechas de cumpleaños, o fechas de eventos sin hora específica) deben ser tratadas como **independientes de la zona horaria** para evitar desfases de días.

## Problema Común

Cuando una fecha se almacena en PostgreSQL como `DATE` (ejemplo: `1979-11-01`) y se serializa a JSON, se convierte en el string `"1979-11-01"`. Si JavaScript parsea este string con `new Date("1979-11-01")`, lo interpreta como **medianoche UTC** y lo ajusta a la zona horaria local del cliente, lo que puede causar que la fecha se muestre con un día de diferencia.

### Ejemplo del problema

```javascript
// Base de datos: fecha_nacimiento = 1979-11-01
const fecha = new Date("1979-11-01")
console.log(fecha.toLocaleDateString('es-VE'))
// En Venezuela (UTC-4): muestra "31 de octubre de 1979" ❌
```

---

## Solución Implementada

### 1. Backend (RPCs de PostgreSQL)

**Todas las fechas que no dependen de la hora deben ser retornadas como TEXT en formato `YYYY-MM-DD`.**

#### ✅ Correcto

```sql
SELECT jsonb_build_object(
  'fecha_nacimiento', TO_CHAR(u.fecha_nacimiento, 'YYYY-MM-DD'),
  'proximo', TO_CHAR(proximo_cumpleanos, 'YYYY-MM-DD')
)
FROM usuarios u;
```

#### ❌ Incorrecto

```sql
SELECT jsonb_build_object(
  'fecha_nacimiento', u.fecha_nacimiento,  -- Se serializa como DATE y causa desfase
  'proximo', proximo_cumpleanos
)
FROM usuarios u;
```

### 2. Frontend (JavaScript/TypeScript)

**Evitar la conversión implícita a zona horaria local. Parsear manualmente o usar métodos UTC.**

#### ✅ Correcto: Parseo manual

```typescript
function formatearFecha(fechaISO: string): string {
  // Parsear manualmente componentes de la fecha
  const [year, month, day] = fechaISO.split('-').map(Number)
  
  // Crear fecha en UTC para evitar conversión de zona horaria
  const fecha = new Date(Date.UTC(year, month - 1, day))
  
  // Formatear especificando timeZone: 'UTC'
  return fecha.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'  // Forzar UTC
  })
}

formatearFecha("1979-11-01")  // "1 de noviembre" ✅
```

#### ❌ Incorrecto: Conversión automática

```typescript
function formatearFecha(fechaISO: string): string {
  const fecha = new Date(fechaISO)  // Conversión automática a zona horaria local
  return fecha.toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long'
  })
}

formatearFecha("1979-11-01")  // "31 de octubre" en UTC-4 ❌
```

---

## Casos de Uso

### Fechas de cumpleaños

- **Backend**: Retornar `fecha_nacimiento` y `proximo_cumpleaños` como TEXT
- **Frontend**: Parsear manualmente con `Date.UTC()` y formatear con `timeZone: 'UTC'`

### Fechas de eventos sin hora

- **Backend**: Usar `TO_CHAR(fecha_evento, 'YYYY-MM-DD')`
- **Frontend**: Parsear manualmente o usar bibliotecas como `date-fns` con `parseISO` sin zona horaria

### Timestamps con hora específica

- **Backend**: Retornar como `TIMESTAMPTZ` (incluye zona horaria)
- **Frontend**: Usar `new Date()` directamente, ya que la zona horaria es relevante

---

## Archivos Afectados

### Backend
- `supabase/migrations/20251031220000_fix_birthday_dates_timezone.sql`
  - `obtener_datos_dashboard()`
  - `obtener_datos_dashboard_director()`
  - `obtener_datos_dashboard_lider()` (pendiente)

### Frontend
- `components/dashboard/widgets/BirthdayWidget.tsx`
- Cualquier componente que muestre fechas de cumpleaños o eventos sin hora

---

## Checklist para Nuevas Features

Cuando trabajes con fechas en el proyecto, pregúntate:

- [ ] ¿Esta fecha representa un evento agnóstico a la hora (como cumpleaños o fecha de nacimiento)?
  - ✅ Sí → Usar TEXT en formato `YYYY-MM-DD` desde el backend
  - ❌ No → Puedes usar TIMESTAMPTZ si la hora es relevante

- [ ] ¿Estoy parseando una fecha en JavaScript?
  - ✅ Fecha agnóstica → Parsear manualmente con `Date.UTC()`
  - ✅ Timestamp con hora → Usar `new Date()` directamente

- [ ] ¿Estoy formateando una fecha para mostrarla al usuario?
  - ✅ Fecha agnóstica → Especificar `timeZone: 'UTC'` en `toLocaleDateString()`
  - ✅ Timestamp con hora → Formatear en zona horaria local del usuario

---

## Referencias

- [MDN: Date.UTC()](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Date/UTC)
- [MDN: toLocaleDateString()](https://developer.mozilla.org/es/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleDateString)
- [PostgreSQL: TO_CHAR](https://www.postgresql.org/docs/current/functions-formatting.html)
- [PostgreSQL: Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)

---

**Última actualización**: 31 de octubre de 2025  
**Autor**: Equipo de Desarrollo Global Connect
