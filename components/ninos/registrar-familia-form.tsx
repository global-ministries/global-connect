'use client'

/**
 * The desk registration is now the one-screen form of
 * components/ninos/registro-rapido (odd/tasks/ninos-v2.md N4b). This name
 * stays as a thin re-export for the pre-registration review
 * (preregistros-pendientes.tsx), which keeps working unchanged.
 */
export { RegistroMesa as RegistrarFamiliaForm, type RegistroMesaProps as RegistrarFamiliaFormProps } from './registro-rapido/registro-mesa'
