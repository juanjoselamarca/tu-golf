'use client'

/**
 * /demo/scorecard — validación visual v2.
 * Fixes: eagle real, neto en todos los hoyos, stableford con neto,
 * bordes finos, separadores, HoleBar profesional, diseño premium.
 */

import { useState } from 'react'
import Scorecard, { type ScorecardHole } from '@/components/Scorecard'
import HoleBar from '@/components/HoleBar'
import ScoreSymbol, { GARMIN_COLORS } from '@/components/ScoreSymbol'

// ═══════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════

const H18: ScorecardHole[] = [
  { numero: 1, par: 4, stroke_index: 5, yardaje: 380 },
  { numero: 2, par: 4, stroke_index: 11, yardaje: 365 },
  { numero: 3, par: 3, stroke_index: 15, yardaje: 175 },
  { numero: 4, par: 5, stroke_index: 3, yardaje: 490 },
  { numero: 5, par: 4, stroke_index: 7, yardaje: 395 },
  { numero: 6, par: 3, stroke_index: 17, yardaje: 160 },
  { numero: 7, par: 4, stroke_index: 1, yardaje: 440 },
  { numero: 8, par: 5, stroke_index: 9, yardaje: 510 },
  { numero: 9, par: 4, stroke_index: 13, yardaje: 370 },
  { numero: 10, par: 4, stroke_index: 6, yardaje: 385 },
  { numero: 11, par: 5, stroke_index: 14, yardaje: 505 },
  { numero: 12, par: 4, stroke_index: 4, yardaje: 400 },
  { numero: 13, par: 4, stroke_index: 10, yardaje: 375 },
  { numero: 14, par: 3, stroke_index: 18, yardaje: 155 },
  { numero: 15, par: 4, stroke_index: 8, yardaje: 390 },
  { numero: 16, par: 3, stroke_index: 16, yardaje: 170 },
  { numero: 17, par: 5, stroke_index: 12, yardaje: 495 },
  { numero: 18, par: 4, stroke_index: 2, yardaje: 425 },
]

// Ronda 88 — mezcla de bogeys, dobles, pares
const SC88: Record<string, number> = {
  '1': 6, '2': 5, '3': 3, '4': 5, '5': 6, '6': 3, '7': 4, '8': 7, '9': 5,
  '10': 4, '11': 4, '12': 6, '13': 5, '14': 4, '15': 4, '16': 5, '17': 5, '18': 6,
}

// Ronda 72 con EAGLE real (hoyo 4 par 5 → 3) + 4 birdies
const SC72: Record<string, number> = {
  '1': 4, '2': 3, '3': 3, '4': 3, '5': 4, '6': 3, '7': 5, '8': 4, '9': 4,
  '10': 4, '11': 4, '12': 3, '13': 4, '14': 3, '15': 4, '16': 3, '17': 5, '18': 4,
}

// 9 hoyos
const SC9: Record<string, number> = {
  '1': 5, '2': 4, '3': 3, '4': 6, '5': 5, '6': 3, '7': 5, '8': 6, '9': 5,
}

const PARS = H18.map(h => h.par)

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const page: React.CSSProperties = {
  background: '#f7f7f8', minHeight: '100vh', padding: '20px 14px 80px',
  fontFamily: '"DM Sans", system-ui, sans-serif',
}
const wrap: React.CSSProperties = { maxWidth: 960, margin: '0 auto' }
const title: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: '#111827',
  marginTop: 28, marginBottom: 3, letterSpacing: '-0.01em',
}
const desc: React.CSSProperties = {
  fontSize: 12, color: '#6b7280', marginBottom: 10, lineHeight: 1.5,
}
const tag: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 4,
  fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
  marginRight: 5, marginBottom: 8,
  background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb',
}

// ═══════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════

export default function ScorecardDemoPage() {
  const [ext, setExt] = useState(false)

  return (
    <div style={page}>
      <div style={wrap}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
            Scorecard v2
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
            Paleta Garmin · bordes finos · neto completo · HoleBar pro
          </div>
        </div>

        {/* ── Paleta ── */}
        <div style={title}>Paleta de íconos</div>
        <div style={{
          background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
          padding: '16px 12px', display: 'flex', justifyContent: 'space-between',
        }}>
          {[
            { l: 'Albatross', s: 2, p: 5 },
            { l: 'Eagle', s: 3, p: 5 },
            { l: 'Birdie', s: 3, p: 4 },
            { l: 'Par', s: 4, p: 4 },
            { l: 'Bogey', s: 5, p: 4 },
            { l: 'Doble+', s: 7, p: 4 },
          ].map(i => (
            <div key={i.l} style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                <ScoreSymbol score={i.s} par={i.p} size="md" />
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#6b7280' }}>{i.l}</div>
            </div>
          ))}
        </div>

        {/* ── 1. Stroke Play Gross ── */}
        <div style={title}>1. Stroke Play Gross</div>
        <div style={desc}>Sin handicap. Solo scores brutos con íconos Garmin.</div>
        <div><span style={tag}>GROSS</span><span style={tag}>18H</span></div>
        <Scorecard holes={H18} scores={SC88} courseHandicap={0} modo="gross" formato="stroke_play" playerName="Juan José Lamarca" />

        {/* ── 2. Stroke Play Neto ── */}
        <div style={title}>2. Stroke Play Neto</div>
        <div style={desc}>
          HCP 11. Neto visible en TODOS los hoyos. Puntitos grises debajo del gross
          en hoyos donde hay palo. Labels a la izquierda: Hoyo, Par, Gross, Neto.
        </div>
        <div><span style={tag}>NETO</span><span style={tag}>HCP 11</span><span style={tag}>18H</span></div>
        <Scorecard holes={H18} scores={SC88} courseHandicap={11} modo="neto" formato="stroke_play" playerName="Juan José Lamarca" />

        {/* ── 3. Stableford ── */}
        <div style={title}>3. Stableford</div>
        <div style={desc}>
          HCP 11. Muestra gross con íconos, puntitos de strokes, neto por hoyo,
          y puntos stableford calculados desde el neto (no del gross). Ejemplo: si
          haces par gross en un hoyo con palo, tu neto es birdie = 3 pts.
        </div>
        <div><span style={tag}>STABLEFORD</span><span style={tag}>HCP 11</span></div>
        <Scorecard holes={H18} scores={SC88} courseHandicap={11} modo="neto" formato="stableford" playerName="Juan José Lamarca" />

        {/* ── 4. Ronda con Eagle ── */}
        <div style={title}>4. Eagle + 4 birdies</div>
        <div style={desc}>
          Hoyo 4 (par 5) con score 3 = eagle (doble círculo azul oscuro).
          Hoyos 2, 6, 12, 14, 16 con birdies (círculo celeste).
        </div>
        <div><span style={tag}>GROSS</span><span style={tag}>72 PAR</span></div>
        <Scorecard holes={H18} scores={SC72} courseHandicap={0} modo="gross" formato="stroke_play" playerName="Juan José Lamarca" />

        {/* ── 5. Front 9 ── */}
        <div style={title}>5. Front 9 solamente</div>
        <div style={desc}>Ronda de 9 hoyos en modo neto.</div>
        <div><span style={tag}>NETO</span><span style={tag}>HCP 11</span><span style={tag}>9H</span></div>
        <Scorecard holes={H18.slice(0, 9)} scores={SC9} courseHandicap={11} modo="neto" formato="stroke_play" playerName="Juan José Lamarca" />

        {/* ── 6. Modo extendido ── */}
        <div style={title}>6. Modo extendido</div>
        <div style={desc}>
          Agrega yardaje y stroke index debajo del par. Para análisis post-ronda.
        </div>
        <button
          onClick={() => setExt(x => !x)}
          style={{
            background: ext ? '#111827' : '#fff', color: ext ? '#fff' : '#111827',
            border: '1px solid #111827', padding: '6px 14px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
          }}
        >
          {ext ? 'Ocultar detalles' : 'Mostrar yardajes + Hdcp'}
        </button>
        <Scorecard holes={H18} scores={SC88} courseHandicap={0} modo="gross" formato="stroke_play" playerName="Juan José Lamarca" showExtendedInfo={ext} />

        {/* ── 7. HoleBar ── */}
        <div style={title}>7. HoleBar — historial</div>
        <div style={desc}>
          Barra de rendimiento hoyo-por-hoyo. Celeste = birdie+, gris = par,
          dorado = bogey, rojo = doble+.
        </div>
        <div style={{
          background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb',
          padding: '4px 14px',
        }}>
          {[
            { name: 'Lomas de la Dehesa', date: 'Abr 10', sc: SC88, g: 88, p: 72 },
            { name: 'Lomas de la Dehesa', date: 'Mar 21', sc: SC72, g: 72, p: 72 },
            { name: 'Los Leones', date: 'Feb 5', sc: SC9, g: 42, p: 36, h: 9 },
          ].map((r, i) => (
            <div key={i} style={{ padding: '14px 0', borderBottom: i < 2 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>Stroke Play</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{r.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#111827', flex: 1 }}>{r.name}</span>
                <div style={{ textAlign: 'right', marginLeft: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{r.g}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: '"DM Mono", monospace', marginTop: 1 }}>
                    {r.g - r.p > 0 ? `+${r.g - r.p}` : r.g - r.p === 0 ? 'E' : r.g - r.p}
                  </div>
                </div>
              </div>
              <HoleBar scores={r.sc} pars={PARS} totalHoles={r.h ?? 18} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 10, color: '#9ca3af' }}>
          Página temporal de review · se elimina al mergear
        </div>
      </div>
    </div>
  )
}
