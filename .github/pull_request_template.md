<!-- Template de Pull Request -->

# Título del PR
> Usa formato tipo(scope): resumen en infinitivo (si aplica)

## Resumen
Describe brevemente el problema y la solución. Incluye contexto o links a issues.

## Qué Incluye
- Lista de cambios funcionales
- Componentes / módulos afectados
- Refactors relevantes

## Motivación / Por Qué
¿Qué problema resuelve? ¿Qué mejora introduce? ¿Qué riesgo elimina?

## Evidencia Visual (si aplica)
| Antes | Después |
|-------|---------|
| (captura) | (captura) |

## Migraciones / Base de Datos
- [ ] No aplica
- [ ] Sí (orden exacto):
```
AAAAMMDDHHMM__descripcion.sql
```
Notas:

## Impacto y Riesgos
- ¿Rompe compatibilidad?
- ¿Requiere coordinación de despliegue?
- ¿Afecta performance o seguridad?

## Checklist Autor
- [ ] Código formateado (Prettier/ESLint)
- [ ] Sin `console.log` / debugger
- [ ] Validaciones con zod para entradas nuevas
- [ ] Estados loading/error/empty cubiertos
- [ ] Tipos TypeScript correctos
- [ ] Migraciones probadas local
- [ ] Documentación actualizada (`docs/` o README)
- [ ] Variables de entorno documentadas
- [ ] Rebase con `main` limpio

## Checklist Revisor
- [ ] Propósito claro
- [ ] Nombres descriptivos
- [ ] Sin lógica duplicada evidente
- [ ] Manejo adecuado de errores
- [ ] Cambios acotados al alcance
- [ ] Sin secretos / datos sensibles

## Pruebas Manuales Realizadas
Lista breve de pasos verificados.

## Pendientes / Follow-up (opcional)
Items que no se incluyen en este PR y podrían abordarse después.

## Notas Adicionales
Comentarios técnicos, decisiones o limitaciones temporales.

---
> Gracias por contribuir. Mantengamos el estándar alto. 💪
