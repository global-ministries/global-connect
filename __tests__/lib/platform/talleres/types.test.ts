/**
 * PR1 — DT-002 — Talleres types tests.
 */

import type { TallerTipo, TallerLinkType, TallerModalidadInscripcion, TallerEstado, TallerGrupoEstado, TallerSesionEstado, TallerAsistenciaEstado, TallerInscripcionEstado, TallerUnidadEstado, TallerReporteEstado, TallerGrupoAsignacionRol, TallerSolicitudRetiroTipo, TallerSolicitudRetiroEstado } from '@/lib/platform/talleres/types'

describe('Talleres types', () => {
  describe('TallerTipo', () => {
    it('accepts individual and pareja', () => {
      const accept = (t: TallerTipo) => t
      accept('individual')
      accept('pareja')
    })
  })

  describe('TallerLinkType', () => {
    it('accepts matrimonio and novios', () => {
      const accept = (t: TallerLinkType) => t
      accept('matrimonio')
      accept('novios')
    })
  })

  describe('TallerModalidadInscripcion', () => {
    it('accepts periodo_general and permanente_custom', () => {
      const accept = (t: TallerModalidadInscripcion) => t
      accept('periodo_general')
      accept('permanente_custom')
    })
  })

  describe('TallerEstado', () => {
    it('accepts all workshop states', () => {
      const accept = (t: TallerEstado) => t
      accept('borrador')
      accept('abierto')
      accept('en_curso')
      accept('cerrado')
      accept('cancelado')
    })
  })

  describe('TallerGrupoEstado', () => {
    it('accepts activo, completado, and cancelado', () => {
      const accept = (t: TallerGrupoEstado) => t
      accept('activo')
      accept('completado')
      accept('cancelado')
    })
  })

  describe('TallerSesionEstado', () => {
    it('accepts all session states', () => {
      const accept = (t: TallerSesionEstado) => t
      accept('programada')
      accept('en_curso')
      accept('cerrada')
      accept('cancelada')
    })
  })

  describe('TallerAsistenciaEstado', () => {
    it('accepts presente, ausente, and no_aplica', () => {
      const accept = (t: TallerAsistenciaEstado) => t
      accept('presente')
      accept('ausente')
      accept('no_aplica')
    })
  })

  describe('TallerInscripcionEstado', () => {
    it('accepts pendiente, aprobado, and no_aprobado', () => {
      const accept = (t: TallerInscripcionEstado) => t
      accept('pendiente')
      accept('aprobado')
      accept('no_aprobado')
    })
  })

  describe('TallerUnidadEstado', () => {
    it('accepts completado, no_completado, and abandono', () => {
      const accept = (t: TallerUnidadEstado) => t
      accept('completado')
      accept('no_completado')
      accept('abandono')
    })
  })

  describe('TallerReporteEstado', () => {
    it('accepts borrador, enviado, reabierto, and cerrado', () => {
      const accept = (t: TallerReporteEstado) => t
      accept('borrador')
      accept('enviado')
      accept('reabierto')
      accept('cerrado')
    })
  })

  describe('TallerGrupoAsignacionRol', () => {
    it('accepts lider and voluntario', () => {
      const accept = (t: TallerGrupoAsignacionRol) => t
      accept('lider')
      accept('voluntario')
    })
  })

  describe('TallerSolicitudRetiroTipo', () => {
    it('accepts participante_retiro and equipo_retiro_definitivo', () => {
      const accept = (t: TallerSolicitudRetiroTipo) => t
      accept('participante_retiro')
      accept('equipo_retiro_definitivo')
    })
  })

  describe('TallerSolicitudRetiroEstado', () => {
    it('accepts pendiente, aprobada, and rechazada', () => {
      const accept = (t: TallerSolicitudRetiroEstado) => t
      accept('pendiente')
      accept('aprobada')
      accept('rechazada')
    })
  })
})
