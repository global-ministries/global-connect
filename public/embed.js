/*! Global Connect: reserva de talleres en cualquier sitio (T6, odd/tasks/talleres-reserva-publica.md).
 * <a href="https://<host>/talleres/reservar/<slug>" data-global-taller="<slug>"
 *    data-modo="modal|tarjeta|catalogo" data-edicion="<id opcional>">Reservar mi lugar</a> */
(function () {
  'use strict'
  // A second copy of the script only looks for new links.
  if (window.GlobalTaller) {
    window.GlobalTaller.iniciar()
    return
  }

  var script = document.currentScript || document.querySelector('script[src*="/embed.js"]')
  if (!script) return
  var ORIGEN = new URL(script.src, window.location.href).origin
  var RAIZ = ORIGEN + '/talleres/reservar'
  var SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  var ESTILO =
    '[data-global-taller-modal]{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:24px}' +
    '[data-global-taller-modal] .gt-velo{position:absolute;inset:0;background:rgba(14,14,18,.55)}' +
    '[data-global-taller-modal] .gt-panel{position:relative;width:min(680px,100%);height:min(760px,100%);border-radius:16px;overflow:hidden;' +
    'background:#fff;box-shadow:0 24px 64px rgba(0,0,0,.28);animation:gt-entrar .2s ease-out}' +
    '[data-global-taller-modal] iframe{display:block;width:100%;height:100%;border:0}' +
    '@keyframes gt-entrar{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}' +
    'iframe[data-global-taller-tarjeta]{display:block;width:100%;height:480px;border:0;background:transparent}' +
    '@media (prefers-reduced-motion:reduce){[data-global-taller-modal] .gt-panel{animation:none}}'

  var tarjetas = []
  var abierto = null

  function ponerEstilo() {
    if (document.getElementById('global-taller-estilo')) return
    var s = document.createElement('style')
    s.id = 'global-taller-estilo'
    s.textContent = ESTILO
    document.head.appendChild(s)
  }

  // null: a slug we do not accept (the link stays a plain link).
  function ruta(el, extra) {
    var modo = el.getAttribute('data-modo') || 'modal'
    var slug = el.getAttribute('data-global-taller') || ''
    var url
    if (modo === 'catalogo') url = RAIZ + '?embed=1'
    else if (SLUG.test(slug)) url = RAIZ + '/' + slug + '?embed=1'
    else return null
    if (extra) url += extra
    var edicion = el.getAttribute('data-edicion')
    if (modo !== 'catalogo' && edicion && UUID.test(edicion)) url += '&edicion=' + edicion
    return url
  }

  function enlaceDirecto(el) {
    var slug = el.getAttribute('data-global-taller') || ''
    return el.getAttribute('data-modo') === 'catalogo' || !SLUG.test(slug) ? RAIZ : RAIZ + '/' + slug
  }

  // Phones and pages without HTTPS get a new tab.
  function usarPestana() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
    return window.innerWidth < 640 || (window.location.protocol !== 'https:' && !local)
  }

  function cerrar() {
    if (!abierto) return
    var a = abierto
    abierto = null
    if (a.capa.parentNode) a.capa.parentNode.removeChild(a.capa)
    document.body.style.overflow = a.overflow
    document.removeEventListener('keydown', alTeclado, true)
    if (a.origen && a.origen.focus) a.origen.focus()
  }

  function alTeclado(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cerrar()
    }
  }

  function abrirModal(el, url) {
    cerrar()
    ponerEstilo()
    var capa = document.createElement('div')
    capa.setAttribute('data-global-taller-modal', '')
    capa.setAttribute('role', 'dialog')
    capa.setAttribute('aria-modal', 'true')
    capa.setAttribute('aria-label', (el.textContent || '').trim() || 'Reservar mi lugar')
    var velo = document.createElement('div')
    velo.className = 'gt-velo'
    velo.addEventListener('click', cerrar)
    var panel = document.createElement('div')
    panel.className = 'gt-panel'
    var iframe = document.createElement('iframe')
    iframe.setAttribute('src', url)
    iframe.setAttribute('title', 'Reservar mi lugar — Global Connect')
    iframe.setAttribute('allow', 'clipboard-write')
    panel.appendChild(iframe)
    capa.appendChild(velo)
    capa.appendChild(panel)
    abierto = { capa: capa, iframe: iframe, origen: el, overflow: document.body.style.overflow }
    document.body.appendChild(capa)
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', alTeclado, true)
    iframe.focus()
  }

  function prepararModal(el) {
    var url = ruta(el, '&modal=1')
    if (!url) return
    el.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      e.preventDefault()
      if (usarPestana()) window.open(enlaceDirecto(el), '_blank', 'noopener')
      else abrirModal(el, url)
    })
  }

  function prepararTarjeta(el) {
    var url = ruta(el)
    if (!url) return
    ponerEstilo()
    var iframe = document.createElement('iframe')
    iframe.setAttribute('src', url)
    iframe.setAttribute('title', (el.textContent || '').trim() || 'Grupos de Corto Plazo — Global Connect')
    iframe.setAttribute('loading', 'lazy')
    iframe.setAttribute('allow', 'clipboard-write')
    iframe.setAttribute('data-global-taller-tarjeta', '')
    el.parentNode.replaceChild(iframe, el)
    tarjetas.push(iframe)
  }

  function alMensaje(e) {
    if (e.origin !== ORIGEN || !e.data || typeof e.data.type !== 'string') return
    if (e.data.type === 'global-taller:close') {
      if (abierto && e.source === abierto.iframe.contentWindow) cerrar()
      return
    }
    if (e.data.type !== 'global-taller:resize') return
    var alto = Number(e.data.height)
    if (!isFinite(alto)) return
    for (var i = 0; i < tarjetas.length; i++) {
      if (tarjetas[i].contentWindow === e.source) {
        tarjetas[i].style.height = Math.min(Math.max(Math.ceil(alto), 120), 6000) + 'px'
      }
    }
  }

  function iniciar() {
    var nodos = document.querySelectorAll('[data-global-taller]:not([data-global-taller-listo])')
    for (var i = 0; i < nodos.length; i++) {
      var el = nodos[i]
      el.setAttribute('data-global-taller-listo', '')
      var modo = el.getAttribute('data-modo') || 'modal'
      if (modo === 'tarjeta' || modo === 'catalogo') prepararTarjeta(el)
      else if (modo === 'modal') prepararModal(el)
    }
  }

  window.addEventListener('message', alMensaje)
  window.GlobalTaller = { iniciar: iniciar, cerrar: cerrar }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
  else iniciar()
})()
