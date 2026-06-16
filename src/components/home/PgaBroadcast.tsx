'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Widget PGA "lower-third de transmisión" del landing — diseño aprobado en el
 * prototipo (hero-wow2.html + pga-states.html, 4-jun), alimentado por la data real
 * de `/api/pga-live` (ESPN).
 *
 * Estados (CERO FALLOS — nunca "E/E/E" ni huecos):
 *  - Sin torneo y sin próximo evento → no se renderiza (el hero queda perfecto sin él).
 *  - Sin torneo activo pero hay próximo → tarjeta "Próximo evento".
 *  - En vivo / finalizado → leaderboard con banderas, latinos tintados, campeón con trofeo.
 *
 * NOTA: el feed de ESPN que consumimos NO trae línea de corte, corte proyectado ni
 * filas MC, así que no se muestran (no se inventan — honestidad de marca). El resto
 * del diseño del prototipo se reproduce fiel.
 */

const LATAM = new Set(['cl', 'ar', 'mx', 'co', 've', 'pe', 'uy', 'ec', 'br', 'py', 'pr', 'bo', 'cr', 'do', 'gt', 'hn', 'ni', 'pa', 'sv', 'cu'])

interface Player {
  position: string; name: string; nameFull: string
  score: string; today: string; thru: string
  flag: string; countryCode: string; isTeam?: boolean
}
interface NextEvent { name: string; start: string; end: string; venue: string }
interface PgaData {
  active: boolean; live?: boolean; complete?: boolean
  tournament?: string; round?: string
  players?: Player[]; next_event?: NextEvent; isTeamEvent?: boolean
  projectedCut?: string | null
}

const Trophy = () => (
  <svg className="champ-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4.5v.6A3 3 0 0 0 7.6 9.6M17 6h2.5v.6A3 3 0 0 1 16.4 9.6" />
    <path d="M12 13v3M9.5 19h5M10.5 16h3" />
  </svg>
)
const Clock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)

// "-12" → "−12" (signo menos tipográfico). "E"/"+1" quedan igual.
const dash = (s: string) => s.replace(/^-/, '−')
// dd mmm — venue
function fmtNext(ev: NextEvent): string {
  const f = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  }
  return `${f(ev.start)}–${f(ev.end)} · ${ev.venue}`
}

export default function PgaBroadcast() {
  const [data, setData] = useState<PgaData | null>(null)
  const pathname = usePathname()
  const winRef = useRef<HTMLDivElement>(null)

  // ── Fetch + polling cada 30s (re-fetch al volver a "/") ──
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/pga-live')
        const json = (await res.json()) as PgaData
        if (alive) setData(json)
      } catch {
        if (alive) setData({ active: false })
      }
    }
    load()
    const t = setInterval(load, 30000)
    return () => { alive = false; clearInterval(t) }
  }, [pathname])

  // ── Auto-crawl suave + scroll/drag manual del leaderboard ──
  useEffect(() => {
    const win = winRef.current
    if (!win) return
    let paused = false, raf = 0, last = 0
    let resumeT: ReturnType<typeof setTimeout> | undefined
    const soft = (ms = 3500) => { paused = true; if (resumeT) clearTimeout(resumeT); resumeT = setTimeout(() => { paused = false }, ms) }
    // Una vuelta completa dura ~LOOP_MS sin importar cuántos jugadores haya: con el
    // campo completo (~150) el crawl mantiene la misma sensación que con 10. Basado
    // en delta-time (no px/frame fijos) → velocidad estable en cualquier refresh-rate.
    const LOOP_MS = 38000
    const loop = (now: number) => {
      const max = win.scrollHeight - win.clientHeight
      if (!paused && max > 0 && last) {
        win.scrollTop += (max / LOOP_MS) * (now - last)
        if (win.scrollTop >= max - 1) win.scrollTop = 0
      }
      last = now
      raf = requestAnimationFrame(loop)
    }
    const onEnter = () => { paused = true; if (resumeT) clearTimeout(resumeT) }
    const onLeave = () => soft(700)
    const onWheel = () => soft()
    let down = false, sy = 0, st = 0
    const onDown = (e: PointerEvent) => { down = true; sy = e.clientY; st = win.scrollTop; paused = true; win.classList.add('grabbing'); try { win.setPointerCapture(e.pointerId) } catch { /* noop */ } }
    const onMove = (e: PointerEvent) => { if (down) win.scrollTop = st - (e.clientY - sy) }
    const onUp = () => { down = false; win.classList.remove('grabbing'); soft() }
    win.addEventListener('mouseenter', onEnter)
    win.addEventListener('mouseleave', onLeave)
    win.addEventListener('wheel', onWheel, { passive: true })
    win.addEventListener('pointerdown', onDown)
    win.addEventListener('pointermove', onMove)
    win.addEventListener('pointerup', onUp)
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf); if (resumeT) clearTimeout(resumeT)
      win.removeEventListener('mouseenter', onEnter)
      win.removeEventListener('mouseleave', onLeave)
      win.removeEventListener('wheel', onWheel)
      win.removeEventListener('pointerdown', onDown)
      win.removeEventListener('pointermove', onMove)
      win.removeEventListener('pointerup', onUp)
    }
  }, [data])

  if (!data) return null
  const players = data.players ?? []
  const next = data.next_event
  const showBoard = data.active && players.length > 0
  if (!showBoard && !next) return null // nada que mostrar → hero perfecto sin widget

  const state = data.complete ? 'done' : data.active ? 'live' : 'off'
  const label = state === 'done' ? 'Final · PGA Tour' : state === 'live' ? 'En vivo · PGA Tour' : 'Próximo · PGA Tour'
  // Nombre del campeonato (lo importante) como chip primario; la ronda, secundaria.
  const tour = showBoard ? (data.tournament || '') : (next ? next.name : '')
  const roundLabel = showBoard ? (data.round || '') : ''
  const champ = data.complete ? players[0] : undefined

  // Línea de corte: la insertamos en su lugar real (tras el último jugador que
  // pasa el corte), no al fondo de las ~150 filas. Solo en vivo (projectedCut null
  // si no hay corte). score formateado: "E"→0, "+3"→3, "-5"→-5.
  const cutVal = data.projectedCut != null ? parseFloat(data.projectedCut) : NaN
  const cutAfterIdx = !Number.isNaN(cutVal)
    ? players.reduce((acc, p, i) => {
        const s = p.score === 'E' ? 0 : parseFloat(p.score)
        return !Number.isNaN(s) && s <= cutVal ? i : acc
      }, -1)
    : -1

  return (
    <div className="pgalive">
      <div className="ph">
        <span className={`live ${state}`}><span className="ld" />{label}</span>
        {(tour || roundLabel) && (
          <span className="phr">
            {tour && <span className="tour">{tour}</span>}
            {roundLabel && <span className="rd">{roundLabel}</span>}
          </span>
        )}
      </div>

      {showBoard ? (
        <>
          <div className="pcols"><span /><span /><span /><span /><span>Hoy</span><span>Total</span></div>
          <div className="pwin" ref={winRef}>
            {players.map((p, i) => {
              const latam = LATAM.has(p.countryCode)
              const isChamp = data.complete && i === 0
              const todayOver = p.today?.startsWith('+')
              const todayDash = !p.today || p.today === '-'
              return (
                <Fragment key={p.nameFull || i}>
                  <div className={`prow${latam ? ' cl' : ''}${isChamp ? ' champ' : ''}`}>
                    <span className="pp">{p.position}</span>
                    {!p.isTeam && p.flag
                      ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="fg" src={p.flag} alt="" loading="lazy" decoding="async" />
                      : <span className="fg" style={{ background: 'rgba(255,255,255,0.08)' }} />}
                    <span className="pn">{isChamp && <Trophy />}{p.name}</span>
                    <span className="pt">{p.thru}</span>
                    <span className={`ptd${todayDash ? ' dash' : todayOver ? ' over' : ''}`}>{todayDash ? '–' : dash(p.today)}</span>
                    <span className={`ps${p.score?.startsWith('-') ? ' u' : ''}`}>{dash(p.score)}</span>
                  </div>
                  {data.projectedCut && i === cutAfterIdx && (
                    <div className="cutline proj">Corte proyectado · {dash(data.projectedCut)}</div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </>
      ) : (
        next && (
          <div className="evcard">
            <div className="ev-k">Próximo evento</div>
            <div className="ev-n">{next.name}</div>
            <div className="ev-d">{fmtNext(next)}</div>
          </div>
        )
      )}

      <div className="pf">
        {champ ? <><Trophy />Campeón: <b>&nbsp;{champ.name} {dash(champ.score)}</b></> : <><Clock />El golf en vivo, también en Golfers+</>}
      </div>
    </div>
  )
}
