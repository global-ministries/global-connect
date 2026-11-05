/**
 * Planner of GDV seasons — pure rules over the planner RPC outputs (T4 of
 * odd/tasks/planner-gdv.md): readers, warnings, suggestions, the spouse rule
 * and the publish state. No Supabase, no React.
 */
export * from './tipos'
export * from './avisos'
export * from './sugerencias'
export * from './conyuge'
export * from './publicacion'
export { esMatrimonios, personasDelGrupo } from './grupo'
export { nombrePareja, nombrePersona } from './textos'
