/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://iglesia.example/grupos"}
 */
/**
 * public/embed.js (T6 of odd/tasks/talleres-reserva-publica.md, S2 S18): the
 * script a church site pastes to open the reservation in a modal over the
 * site, or to show it as an inline card or catalog. It runs on a foreign
 * page, so only messages from its own origin (the script's src) count.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FUENTE = readFileSync(join(process.cwd(), 'public/embed.js'), 'utf8')
const ORIGEN = 'https://app.example'
const EDICION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function cargar(html: string) {
  document.body.innerHTML = `${html}<script src="${ORIGEN}/embed.js" async></script>`
  // jsdom does not run <script> tags here: evaluate the file as the browser would.
  ;(0, eval)(FUENTE)
}

const overlay = () => document.querySelector<HTMLElement>('[data-global-taller-modal]')
const iframeModal = () => overlay()?.querySelector('iframe') ?? null

function mensaje(data: unknown, origin: string, source: Window | null) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
}

type ConGlobalTaller = Window & { GlobalTaller?: { cerrar: () => void } }

beforeEach(() => {
  // Each test loads a fresh copy of the script.
  ;(window as ConGlobalTaller).GlobalTaller?.cerrar()
  delete (window as ConGlobalTaller).GlobalTaller
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
})

describe('embed.js modal', () => {
  const ENLACE = `<a id="boton" data-global-taller="mujer-de-hoy" data-modo="modal" href="${ORIGEN}/talleres/reservar/mujer-de-hoy">Reservar mi lugar</a>`

  it('opens the reservation over the site in an iframe with embed=1', () => {
    cargar(ENLACE)
    const boton = document.getElementById('boton') as HTMLAnchorElement
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true })
    boton.dispatchEvent(clic)

    expect(clic.defaultPrevented).toBe(true)
    expect(overlay()?.getAttribute('role')).toBe('dialog')
    expect(overlay()?.getAttribute('aria-modal')).toBe('true')
    expect(iframeModal()?.getAttribute('src')).toBe(`${ORIGEN}/talleres/reservar/mujer-de-hoy?embed=1&modal=1`)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('pins the edición of data-edicion', () => {
    cargar(ENLACE.replace('data-modo', `data-edicion="${EDICION}" data-modo`))
    ;(document.getElementById('boton') as HTMLAnchorElement).click()

    expect(iframeModal()?.getAttribute('src')).toBe(`${ORIGEN}/talleres/reservar/mujer-de-hoy?embed=1&modal=1&edicion=${EDICION}`)
  })

  it('closes with Esc, unlocks the scroll and gives the focus back to the button', () => {
    cargar(ENLACE)
    const boton = document.getElementById('boton') as HTMLAnchorElement
    boton.focus()
    boton.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(overlay()).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(boton)
  })

  it('closes on the close message of its own iframe and ignores the same message from another origin', () => {
    cargar(ENLACE)
    ;(document.getElementById('boton') as HTMLAnchorElement).click()
    const fuente = iframeModal()?.contentWindow ?? null

    mensaje({ type: 'global-taller:close' }, 'https://otro.example', fuente)
    expect(overlay()).not.toBeNull()

    mensaje({ type: 'global-taller:close' }, ORIGEN, fuente)
    expect(overlay()).toBeNull()
  })

  it('on a phone just opens the link in a new tab', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const abrir = jest.spyOn(window, 'open').mockImplementation(() => null)
    cargar(ENLACE)
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true })
    ;(document.getElementById('boton') as HTMLAnchorElement).dispatchEvent(clic)

    expect(overlay()).toBeNull()
    expect(clic.defaultPrevented).toBe(true)
    expect(abrir).toHaveBeenCalledWith(`${ORIGEN}/talleres/reservar/mujer-de-hoy`, '_blank', 'noopener')
    abrir.mockRestore()
  })

  it('leaves a link with a slug it does not accept alone', () => {
    cargar(`<a id="boton" data-global-taller="../admin" data-modo="modal" href="${ORIGEN}/x">Reservar</a>`)
    const clic = new MouseEvent('click', { bubbles: true, cancelable: true })
    ;(document.getElementById('boton') as HTMLAnchorElement).dispatchEvent(clic)

    expect(overlay()).toBeNull()
    expect(clic.defaultPrevented).toBe(false)
  })
})

describe('embed.js tarjeta and catálogo', () => {
  it('replaces the link with an inline card that grows with the resize messages of its origin only', () => {
    cargar(`<a data-global-taller="mujer-de-hoy" data-modo="tarjeta" href="${ORIGEN}/talleres/reservar/mujer-de-hoy">Mujer de Hoy</a>`)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement

    expect(document.querySelector('a')).toBeNull()
    expect(iframe.getAttribute('src')).toBe(`${ORIGEN}/talleres/reservar/mujer-de-hoy?embed=1`)

    mensaje({ type: 'global-taller:resize', height: 912 }, 'https://otro.example', iframe.contentWindow)
    expect(iframe.style.height).not.toBe('912px')

    mensaje({ type: 'global-taller:resize', height: 912 }, ORIGEN, iframe.contentWindow)
    expect(iframe.style.height).toBe('912px')
  })

  it('shows the catalog of /talleres/reservar for data-modo="catalogo"', () => {
    cargar(`<a data-global-taller="" data-modo="catalogo" href="${ORIGEN}/talleres/reservar">Grupos de Corto Plazo</a>`)

    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(`${ORIGEN}/talleres/reservar?embed=1`)
  })
})
