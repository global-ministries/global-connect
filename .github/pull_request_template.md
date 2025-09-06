## Qué incluye

- Gestión de miembros de grupo con permisos en BD
- Detalle de grupo: botón “Añadir miembro”, cambiar rol y quitar miembro
- Endpoints API para buscar/agregar/actualizar/eliminar miembros
- Migraciones SQL para RPCs seguras y fix de permisos en detalle

## Migraciones a aplicar

- 20250906110000_permisos_gestion_miembros.sql
- 20250906111510_grupo_detalle_y_miembros.sql
- 20250906113000_miembros_update_delete.sql
- 20250906114500_fix_obtener_detalle_grupo_auth.sql

Aplicar con:

```
supabase db push
```

## Checklist de verificación

- [ ] Como admin, puedo ver el detalle del grupo
- [ ] Puedo buscar personas y agregarlas como miembros
- [ ] Puedo cambiar el rol del miembro (Líder/Colíder/Miembro)
- [ ] Puedo quitar a un miembro, con confirmación
- [ ] El botón “Añadir miembro” solo aparece si tengo permisos

## Pruebas rápidas (opcional)

Con la app corriendo y un GROUP_ID válido:

```
BASE_URL=http://localhost:3000 GROUP_ID=<uuid> node scripts/smoke-members-api.mjs
```
