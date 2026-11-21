/**
 * "Agregar visitante" (artboard 02 of design/estudiantes-asistencia; Q6, S7):
 * the form prefilled from the search, its validation, the p_datos sent to
 * estudiantes_visitante_crear and what a search result allows. Every person
 * is fictitious.
 */
import {
  argumentosCoincidencias,
  buscarRepresentante,
  datosVisitante,
  elegirRepresentante,
  formularioInicial,
  modoRepresentante,
  opcionEncontrada,
  registrarRepresentante,
  textoCoincidencia,
  validarVisitante,
  type FormularioVisitante,
  type RepresentanteFormulario,
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

describe('the representante picked from the search (S1)', () => {
  const vacio = formularioInicial({ consulta: '', experiencia: 'estudiantes', subarea: 'Grupos de Chicas', anio: 2 }).representante
  const elegido: RepresentanteFormulario = elegirRepresentante({ ...vacio, tipo: 'tutor' }, { personaId: 'r-7', nombre: 'Patricia Ferrer' })

  it('picking keeps the parentesco and links the person; «Cambiar» and «No está, registrarlo» clear the pick', () => {
    expect(modoRepresentante(vacio)).toBe('buscar')
    expect(elegido).toMatchObject({ personaId: 'r-7', personaNombre: 'Patricia Ferrer', tipo: 'tutor', nombre: '', telefono: '', genero: '' })
    expect(modoRepresentante(elegido)).toBe('elegido')
    const otra = buscarRepresentante(elegido)
    expect(modoRepresentante(otra)).toBe('buscar')
    expect(otra).toEqual({ ...vacio, tipo: 'tutor' })
    const nuevo = registrarRepresentante(elegido)
    expect(modoRepresentante(nuevo)).toBe('nuevo')
    expect(nuevo.personaId).toBeUndefined()
    expect(nuevo.tipo).toBe('tutor')
  })

  it('going back to the search drops what was typed', () => {
    const escrito = { ...registrarRepresentante(vacio), nombre: 'José', telefono: '0412 555 0118', genero: 'Masculino' as const }
    expect(buscarRepresentante(escrito)).toEqual(vacio)
  })

  it('sends exactly { persona_id, tipo } for a picked person', () => {
    expect(datosVisitante(completo({ representante: elegido }), 'estudiantes', false)).toEqual({
      nombre: 'Luciana',
      apellido: 'Ferrer',
      genero: 'Femenino',
      telefono: '0414 555 0174',
      anio: 2,
      representante: { persona_id: 'r-7', tipo: 'tutor' },
    })
  })

  it('does not ask for nombre, teléfono or sexo of a picked person', () => {
    expect(validarVisitante(completo({ representante: elegido }), 'estudiantes', HOY)).toEqual({})
  })

  it('the typed path («No está, registrarlo») keeps today’s errors and payload', () => {
    const nuevo = registrarRepresentante(vacio)
    expect(validarVisitante(completo({ representante: { ...nuevo, nombre: 'Patricia' } }), 'estudiantes', HOY)).toEqual({
      repTelefono: 'Escribe el teléfono del representante.',
      repGenero: 'Elige el sexo del representante.',
    })
    const lleno = { ...nuevo, nombre: ' Patricia ', apellido: 'Ferrer', telefono: '0414 555 0161', cedula: 'V-12345678', genero: 'Femenino' as const, tipo: 'tutor' as const }
    expect(datosVisitante(completo({ representante: lleno }), 'estudiantes', false).representante).toEqual({
      nombre: 'Patricia',
      apellido: 'Ferrer',
      telefono: '0414 555 0161',
      cedula: 'V-12345678',
      genero: 'Femenino',
      tipo: 'tutor',
    })
    // «No está, registrarlo» with nothing typed sends no representante.
    expect(datosVisitante(completo({ representante: nuevo }), 'estudiantes', false)).not.toHaveProperty('representante')
    expect(validarVisitante(completo({ representante: nuevo }), 'estudiantes', HOY)).toEqual({})
  })

  it('The Living Room never sends a picked representante', () => {
    expect(datosVisitante(completo({ representante: elegido }), 'the_living_room', false)).not.toHaveProperty('representante')
  })

  it('says what matched: the database’s list when given, else what the search compared', () => {
    expect(textoCoincidencia('12345678', ['cedula'])).toBe('Coincide por cédula')
    expect(textoCoincidencia('04145550161', ['cedula', 'telefono'])).toBe('Coincide por cédula y teléfono')
    expect(textoCoincidencia('patricia ferrer')).toBe('Coincide por nombre')
    expect(textoCoincidencia('0414 555 0161')).toBe('Coincide por cédula o teléfono')
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
