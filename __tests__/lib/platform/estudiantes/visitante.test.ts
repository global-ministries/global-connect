/**
 * "Agregar visitante" (artboard 02 of design/estudiantes-asistencia; Q6, S7):
 * the form prefilled from the search, its validation, the p_datos sent to
 * estudiantes_visitante_crear and what a search result allows. Every person
 * is fictitious.
 */
import {
  argumentosCoincidencias,
  datosVisitante,
  formularioInicial,
  opcionEncontrada,
  validarVisitante,
  type FormularioVisitante,
} from '@/lib/platform/estudiantes/visitante'

const HOY = '2026-10-25'

function completo(extra: Partial<FormularioVisitante> = {}): FormularioVisitante {
  return {
    ...formularioInicial({ consulta: '', experiencia: 'estudiantes', subarea: 'Grupos de Chicas', anio: 2 }),
    nombre: ' Luciana ',
    apellido: 'Ferrer',
    telefono: '0414 555 0174',
    ...extra,
  }
}

describe('formularioInicial', () => {
  it('takes the name typed in the search, the group’s año and the sub-área’s sexo', () => {
    const f = formularioInicial({ consulta: 'luciana ferrer díaz', experiencia: 'estudiantes', subarea: 'Grupos de Chicas', anio: 2 })
    expect(f).toMatchObject({ nombre: 'Luciana', apellido: 'Ferrer Díaz', cedula: '', telefono: '', genero: 'Femenino', anio: '2' })
    expect(f.representante).toEqual({ nombre: '', apellido: '', telefono: '', cedula: '', genero: '', tipo: 'padre' })
  })

  it('a number becomes the cédula, a phone the teléfono', () => {
    expect(formularioInicial({ consulta: 'V-31.455.102', experiencia: 'estudiantes', subarea: 'Grupos de Chicos', anio: 3 })).toMatchObject({
      nombre: '',
      cedula: 'V-31.455.102',
      telefono: '',
      genero: 'Masculino',
    })
    expect(formularioInicial({ consulta: '0412 555 0187', experiencia: 'the_living_room', subarea: 'Grupos de Chicos', anio: null })).toMatchObject({
      cedula: '',
      telefono: '0412 555 0187',
      anio: '',
    })
  })
})

describe('validarVisitante', () => {
  it('a complete Transit visitor without representante is valid', () => {
    expect(validarVisitante(completo(), 'estudiantes', HOY)).toEqual({})
  })

  it('asks for nombre, apellido, sexo and teléfono', () => {
    const vacio = { ...completo(), nombre: ' ', apellido: '', telefono: '', genero: '' as const }
    expect(validarVisitante(vacio, 'estudiantes', HOY)).toEqual({
      nombre: 'Escribe el nombre.',
      apellido: 'Escribe el apellido.',
      genero: 'Elige el sexo.',
      telefono: 'Escribe el teléfono.',
    })
  })

  it('a representante started halfway needs nombre, teléfono and sexo', () => {
    const f = completo({ representante: { nombre: 'Patricia', apellido: 'Ferrer', telefono: '', cedula: '', genero: '', tipo: 'padre' } })
    expect(validarVisitante(f, 'estudiantes', HOY)).toEqual({
      repTelefono: 'Escribe el teléfono del representante.',
      repGenero: 'Elige el sexo del representante.',
    })
    const sinNombre = completo({ representante: { nombre: '', apellido: '', telefono: '0414 555 0161', cedula: '', genero: 'Femenino', tipo: 'padre' } })
    expect(validarVisitante(sinNombre, 'estudiantes', HOY)).toEqual({ repNombre: 'Escribe el nombre del representante.' })
  })

  it('The Living Room ignores the representante and rejects a future birth date', () => {
    const f = completo({ fechaNacimiento: '2026-12-01', representante: { nombre: 'X', apellido: '', telefono: '', cedula: '', genero: '', tipo: 'padre' } })
    expect(validarVisitante(f, 'the_living_room', HOY)).toEqual({ fechaNacimiento: 'La fecha de nacimiento no puede ser futura.' })
  })
})

describe('datosVisitante', () => {
  it('Transit sends the trimmed data, the año as a number and no empty keys', () => {
    expect(datosVisitante(completo(), 'estudiantes', false)).toEqual({
      nombre: 'Luciana',
      apellido: 'Ferrer',
      genero: 'Femenino',
      telefono: '0414 555 0174',
      anio: 2,
    })
  })

  it('adds the representante when it has data and the duplicate override when asked', () => {
    const f = completo({
      cedula: 'V-31455102',
      representante: { nombre: ' Patricia ', apellido: 'Ferrer', telefono: '0414 555 0161', cedula: '', genero: 'Femenino', tipo: 'tutor' },
    })
    expect(datosVisitante(f, 'estudiantes', true)).toEqual({
      nombre: 'Luciana',
      apellido: 'Ferrer',
      genero: 'Femenino',
      telefono: '0414 555 0174',
      cedula: 'V-31455102',
      anio: 2,
      ignorar_coincidencias: true,
      representante: { nombre: 'Patricia', apellido: 'Ferrer', telefono: '0414 555 0161', genero: 'Femenino', tipo: 'tutor' },
    })
  })

  it('The Living Room sends no año and no representante, and the birth date when given', () => {
    const f = completo({
      genero: 'Masculino',
      fechaNacimiento: '2005-04-09',
      representante: { nombre: 'X', apellido: '', telefono: '1', cedula: '', genero: 'Femenino', tipo: 'padre' },
    })
    expect(datosVisitante(f, 'the_living_room', false)).toEqual({
      nombre: 'Luciana',
      apellido: 'Ferrer',
      genero: 'Masculino',
      telefono: '0414 555 0174',
      fecha_nacimiento: '2005-04-09',
    })
  })
})

describe('duplicates', () => {
  it('searches the possible duplicates by full name and teléfono', () => {
    expect(argumentosCoincidencias(completo())).toEqual({ p_nombre: 'Luciana', p_apellido: 'Ferrer', p_telefono: '0414 555 0174' })
    expect(argumentosCoincidencias(completo({ telefono: ' ' }))).toEqual({ p_nombre: 'Luciana', p_apellido: 'Ferrer' })
  })

  it('a result in this group or in another one of the ámbito cannot be added', () => {
    expect(opcionEncontrada({ grupoId: 'g2', grupo: '2do año · Chicas', enEsteGrupo: true })).toEqual({ tipo: 'en_lista', etiqueta: 'Ya está en tu lista' })
    expect(opcionEncontrada({ grupoId: 'g3', grupo: '3er año · Chicas', enEsteGrupo: false })).toEqual({ tipo: 'otro_grupo', etiqueta: 'En 3er año · Chicas' })
    expect(opcionEncontrada({ grupoId: null, grupo: null, enEsteGrupo: false })).toEqual({ tipo: 'agregable', etiqueta: 'Agregar' })
  })
})
