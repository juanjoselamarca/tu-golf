'use client'

import { useEffect, useRef } from 'react'
import { usePostHog } from 'posthog-js/react'
import { HOME } from '@/content/home'
import CTAButton from './CTAButton'

/**
 * Mini-juego "Pega tu tiro" — barra de potencia oscilante, 3 tiros, tracer SVG,
 * gancho al coach. Port fiel del prototipo aprobado (hero-wow2.html).
 *
 * La animación es imperativa (rAF + timeouts manipulando el DOM via refs), igual
 * que el prototipo: es la forma más confiable de reproducir el timing exacto sin
 * pelearse con el batching de React. El effect limpia TODO al desmontar (rAF,
 * timers, listener) — sin fugas, seguro ante StrictMode (doble-mount en dev).
 */

const Arrow = () => (
  <svg className="ar" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

export default function Game() {
  const g = HOME.game
  const posthog = usePostHog()
  const phRef = useRef(posthog)
  phRef.current = posthog
  const mark = useRef<HTMLDivElement>(null)
  const hit = useRef<HTMLButtonElement>(null)
  const shot = useRef<SVGPathElement>(null)
  const ball = useRef<SVGCircleElement>(null)
  const dist = useRef<HTMLDivElement>(null)
  const dv = useRef<HTMLSpanElement>(null)
  const react = useRef<HTMLDivElement>(null)
  const funnel = useRef<HTMLDivElement>(null)
  const disp = useRef<SVGGElement>(null)
  const shotn = useRef<HTMLSpanElement>(null)
  const bestEl = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const els = {
      mark: mark.current, hit: hit.current, shot: shot.current, ball: ball.current,
      dist: dist.current, dv: dv.current, react: react.current, funnel: funnel.current,
      disp: disp.current, shotn: shotn.current, bestEl: bestEl.current,
    }
    if (Object.values(els).some((e) => e === null)) return
    const { mark: m, hit: h, shot: sh, ball: bl, dist: di, dv: d, react: rc, funnel: fn, disp: dp, shotn: sn, bestEl: be } = els as {
      [K in keyof typeof els]: NonNullable<(typeof els)[K]>
    }

    const R = g.reactions
    let pos = 0, dir = 1, raf = 0, shotsLeft = 3, best = 0
    let state: 'ready' | 'end' = 'ready', animating = false, played = false
    const timers: number[] = []

    function osc() {
      pos += dir * 1.5
      if (pos >= 100) { pos = 100; dir = -1 }
      if (pos <= 0) { pos = 0; dir = 1 }
      m.style.left = pos + '%'
      raf = requestAnimationFrame(osc)
    }
    osc()

    function tick(to: number) {
      let s = 0
      const step = Math.max(1, Math.ceil(to / 26))
      const t = window.setInterval(() => {
        s += step
        if (s >= to) { s = to; window.clearInterval(t) }
        d.textContent = String(s)
      }, 22)
      timers.push(t)
    }

    function fire(power: number) {
      animating = true
      cancelAnimationFrame(raf)
      const sweet = power >= 80 && power <= 94
      const distance = Math.round(150 + power * 1.62 + (sweet ? 12 : 0))
      const ex = 120 + (power / 100) * 600
      const apexY = 352 - (60 + power * 2.3)
      sh.setAttribute('d', `M70,352 C ${70 + (ex - 70) * 0.30},${apexY} ${ex - (ex - 70) * 0.18},${apexY + 22} ${ex},344`)
      const len = sh.getTotalLength()
      sh.style.transition = 'none'
      sh.style.strokeDasharray = String(len)
      sh.style.strokeDashoffset = String(len)
      sh.getBoundingClientRect() // forzar reflow para que arranque la transición
      sh.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22,0.62,0.2,1)'
      sh.style.strokeDashoffset = '0'
      bl.style.opacity = '0'

      timers.push(window.setTimeout(() => {
        bl.setAttribute('cx', String(ex)); bl.setAttribute('cy', '344')
        bl.style.transition = 'opacity .25s'; bl.style.opacity = '1'
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        c.setAttribute('class', 'land'); c.setAttribute('cx', String(ex)); c.setAttribute('cy', '344')
        c.setAttribute('r', '3.4'); c.setAttribute('opacity', '0.55')
        dp.appendChild(c)
      }, 1020))

      timers.push(window.setTimeout(() => {
        di.classList.add('show'); di.classList.toggle('sweet', sweet); tick(distance)
        const nearFlag = Math.abs(ex - 600) < 46
        let msg: string
        if (nearFlag) msg = R.nearFlag
        else if (distance < 210) msg = R.short
        else if (distance < 255) msg = R.mid
        else if (sweet) msg = R.sweet
        else msg = R.generic
        rc.textContent = msg; rc.classList.add('show')
        if (nearFlag) { best++; be.textContent = String(best) }
        shotsLeft--
        if (shotsLeft <= 0) { fn.classList.add('show'); h.textContent = g.btnReplay; state = 'end' }
        else { sn.textContent = String(4 - shotsLeft); h.textContent = g.btnHitAgain; state = 'ready'; osc() }
        animating = false
      }, 1150))
    }

    function onHit() {
      if (animating) return
      if (state === 'end') {
        shotsLeft = 3; best = 0; be.textContent = '0'; sn.textContent = '1'; dp.innerHTML = ''
        di.classList.remove('show'); rc.classList.remove('show'); fn.classList.remove('show')
        h.textContent = g.btnHit; state = 'ready'; pos = 0; dir = 1; osc()
        return
      }
      cancelAnimationFrame(raf)
      const power = pos
      di.classList.remove('show', 'sweet'); rc.classList.remove('show')
      if (!played) { played = true; phRef.current?.capture('home_game_played') }
      fire(power)
    }

    h.addEventListener('click', onHit)
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t) })
      h.removeEventListener('click', onHit)
    }
  }, [g])

  return (
    <section className="game" id="game">
      <div className="grid" />
      <div className="ginner">
        <div className="ghead rv">
          <span className="eyebrow"><span className="d" />{g.eyebrow}</span>
          <h2 className="display">{g.titleLine1} <span className="g">{g.titleLine2}</span></h2>
          <p>{g.desc}</p>
        </div>

        <div className="stage rv">
          <span className="ymark" style={{ left: '34%' }}>100 y</span>
          <span className="ymark" style={{ left: '58%' }}>200 y</span>
          <span className="ymark" style={{ left: '82%' }}>300 y</span>
          <svg viewBox="0 0 800 450" preserveAspectRatio="none">
            <defs>
              <linearGradient id="mkt-gg" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#cbb188" stopOpacity="0.3" />
                <stop offset="50%" stopColor="#c4992a" />
                <stop offset="100%" stopColor="#e7b94c" />
              </linearGradient>
              <filter id="mkt-gl" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g className="flag">
              <line className="pole" x1="600" y1="352" x2="600" y2="300" />
              <path className="fl" d="M600,300 L624,308 L600,316 Z" />
            </g>
            <g ref={disp} />
            <path className="shotpath" ref={shot} d="" />
            <circle className="ball" ref={ball} r="6" />
            <circle className="tee" cx="70" cy="352" r="5" />
          </svg>

          <div className="hud">
            <span>{g.hudShot} <span className="b" ref={shotn}>1</span>/3</span>
            <span>{g.hudToFlag} <span className="b" ref={bestEl}>0</span>/3</span>
          </div>
          <div className="dist" ref={dist}>
            <span className="puro">{g.pureBadge}</span>
            <div className="v"><span ref={dv}>0</span><span className="u"> y</span></div>
          </div>
          <div className="ctrl">
            <div className="meter"><div className="spot" /><div className="mark" ref={mark} /></div>
            <button className="hit" ref={hit} type="button">{g.btnHit}</button>
          </div>
        </div>

        <div className="react" ref={react} />
        <div className="funnel" ref={funnel}>
          <p>{g.funnelText}</p>
          <div className="row">
            <CTAButton className="commit" href="#coach" location="game-funnel" target="coach">{g.funnelCta}<span className="c"><Arrow /></span></CTAButton>
          </div>
        </div>
      </div>
    </section>
  )
}
