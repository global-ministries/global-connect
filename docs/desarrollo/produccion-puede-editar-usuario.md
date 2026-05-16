# Despliegue seguro: `puede_editar_usuario`

Este documento define cómo aplicar el ajuste de permisos de edición de usuarios sin usar Supabase Branches. La regla principal es simple: **nada se ejecuta contra producción sin backup de la función actual, revisión SQL y verificación posterior**.

## Decisión

- La migración `supabase/migrations/20260327_001_puede_editar_usuario.sql` **no borra datos**.
- Solo reemplaza/crea una función y ajusta permisos de ejecución.
- Producción debe tratarse como entorno sensible: aplicar manualmente, en horario tranquilo y con rollback listo.

## Prohibido en producción

- [ ] NO correr `supabase db reset --linked`.
- [ ] NO correr `supabase db reset --db-url`.
- [ ] NO ejecutar scripts con `DELETE`, `TRUNCATE`, `DROP`, `UPDATE` o `INSERT` salvo revisión explícita.
- [ ] NO usar datos reales para “probar” permisos modificando membresías, roles o grupos.

## Antes de aplicar

1. Abrir `supabase/safety/20260327_puede_editar_usuario_preflight.sql`.
2. Ejecutar solo las secciones **Preflight** y **Backup de función actual** en Supabase SQL Editor.
3. Guardar la salida completa de `pg_get_functiondef(...)` en un lugar seguro.
4. Confirmar que existen estas funciones dependientes:
   - `public.puede_editar_usuario(uuid, uuid)` o, si no existe, documentar que se creará por primera vez.
   - `public.es_director_general_de_grupo(uuid, uuid)`.
5. Revisar la migración y confirmar que contiene solamente:
   - `CREATE OR REPLACE FUNCTION`
   - `REVOKE ALL ON FUNCTION`
   - `GRANT EXECUTE ON FUNCTION`

## Aplicación manual

1. En Supabase SQL Editor, pegar el contenido de:
   - `supabase/migrations/20260327_001_puede_editar_usuario.sql`
2. Ejecutar una sola vez.
3. No ejecutar ninguna otra migración en la misma ventana.

## Verificación posterior

Usar la sección **Smoke tests manuales** de `supabase/safety/20260327_puede_editar_usuario_preflight.sql` con UUIDs reales conocidos y de bajo riesgo.

Casos mínimos:

- [ ] Admin o pastor puede editar usuario objetivo.
- [ ] Usuario puede editarse a sí mismo.
- [ ] Líder puede editar miembro activo de grupo activo que lidera.
- [ ] Líder NO puede editar miembro fuera de su grupo.
- [ ] Director de etapa puede editar miembro activo de grupo asignado.
- [ ] Director general solo puede editar dentro de su alcance DG.
- [ ] Un usuario sin alcance recibe `false`.

## Rollback

Si algo falla:

1. Ejecutar la definición anterior guardada desde `pg_get_functiondef(...)`.
2. Restaurar los grants anteriores si eran distintos.
3. Re-ejecutar smoke tests mínimos.

Si no se guardó la definición anterior, **no improvisar rollback**. Frenar y revisar antes de tocar producción.

## Señal de éxito

La aplicación se considera segura cuando:

- [ ] La migración ejecutó sin error.
- [ ] Los smoke tests devuelven los `true/false` esperados.
- [ ] El formulario de edición aparece solo para usuarios autorizados.
- [ ] Las acciones de edición siguen bloqueando usuarios no autorizados.
