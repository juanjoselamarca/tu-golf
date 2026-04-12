'use client'

/**
 * /demo/scorecard — página de validación visual para los componentes
 * nuevos de scorecard (fase 1 del rediseño estilo Garmin Golf).
 *
 * NO ES PARTE DE LA APP DE PRODUCCIÓN. Solo para review visual del CTO.
 * Se puede eliminar cuando el rediseño esté mergeado a main.
 */

import { useState } from 'react'
import Scorecard, { type ScorecardHole } from '@/components/Scorecard'
import HoleBar from '@/components/HoleBar'
import ScoreSymbol, { GARMIN_COLORS } from '@/components/ScoreSymbol'

// ═══════════════════════════════════════════════════════════
// MOCK DATA — rondas reales inspiradas en las capturas Garmin
// ═══════════════════════════════════════════════════════════

/** Lomas de la Dehesa — 18 hoyos stroke play */
const LOMAS_HOLES: ScorecardHole[] = [
  { numero: 1, par: 4, stroke_index: 5, yardaje: 380 },
  { numero: 2, par: 4, stroke_index: 11, yardaje: 365 },
  { numero: 3, par: 3, stroke_index: 15, yardaje: 175 },
  { numero: 4, par: 4, stroke_index: 3, yardaje: 410 },
  { numero: 5, par: 4, stroke_index: 7, yardaje: 395 },
  { numero: 6, par: 3, stroke_index: 17, yardaje: 160 },
  { numero: 7, par: 4, stroke_index: 1, yardaje: 440 },
  { numero: 8, par: 5, stroke_index: 9, yardaje: 510 },
  { numero: 9, par: 5, stroke_index: 13, yardaje: 490 },
  { numero: 10, par: 4, stroke_index: 6, yardaje: 385 },
  { numero: 11, par: 5, stroke_index: 14, yardaje: 505 },
  { numero: 12, par: 4, stroke_index: 4, yardaje: 400 },
  { numero: 13, par: 4, stroke_index: 10, yardaje: 375 },
  { numero: 14, par: 3, stroke_index: 18, yardaje: 155 },
  { numero: 15, par: 4, stroke_index: 8, yardaje: 390 },
  { numero: 16, par: 3, stroke_index: 16, yardaje: 170 },
  { numero: 17, par: 3, stroke_index: 12, yardaje: 180 },
  { numero: 18, par: 4, stroke_index: 2, yardaje: 425 },
]

/** Ronda mixta con birdie, bogeys, doble bogey, par */
const SCORES_LOMAS_88: Record<string, number> = {
  '1': 6, '2': 5, '3': 3, '4': 4, '5': 6, '6': 3, '7': 4, '8': 7, '9': 8,  // 46
  '10': 4, '11': 4, '12': 6, '13': 5, '14': 4, '15': 4, '16': 5, '17': 4, '18': 6, // 42
}

/** Ronda excelente con eagle + 3 birdies */
const SCORES_LOMAS_76: Record<string, number> = {
  '1': 4, '2': 3, '3': 2, '4': 4, '5': 5, '6': 3, '7': 5, '8': 4, '9': 4,  // 34
  '10': 4, '11': 4, '12': 4, '13': 3, '14': 3, '15': 4, '16': 4, '17': 3, '18': 5, // 34
}

/** 9 hoyos front solamente */
const SCORES_FRONT9: Record<string, number> = {
  '1': 5, '2': 4, '3': 3, '4': 5, '5': 5, '6': 3, '7': 5, '8': 6, '9': 6,
}

// Pars map para HoleBar
const LOMAS_PARS_ARRAY = LOMAS_HOLES.map(h => h.par)

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const pageStyle: React.CSSProperties = {
  background: '#f3f4f6',
  minHeight: '100vh',
  padding: '24px 16px 80px',
  fontFamily: '"DM Sans", sans-serif',
}

const containerStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: '0 auto',
}

const sectionTitleStyle: React.CSSProperties = {
  fontFamily: '"Playfair Display", serif',
  fontSize: 20,
  fontWeight: 700,
  color: '#111827',
  marginBottom: 4,
  marginTop: 32,
}

const sectionDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  marginBottom: 12,
  lineHeight: 1.5,
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 9px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  marginRight: 6,
  marginBottom: 8,
  background: 'rgba(196,153,42,0.1)',
  color: '#c4992a',
  border: '1px solid rgba(196,153,42,0.25)',
}

// ═══════════════════════════════════════════════════════════
// DEMO PAGE
// ═══════════════════════════════════════════════════════════

export default function ScorecardDemoPage() {
  const [showExtended, setShowExtended] = useState(false)

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 28,
            fontWeight: 700,
            color: '#111827',
            marginBottom: 4,
          }}>
            Rediseño Scorecards
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Fase 1 · Fundamentos visuales estilo Garmin Golf
          </div>
        </div>

        {/* ── Paleta de íconos ── */}
        <div style={sectionTitleStyle}>Sistema de íconos Garmin</div>
        <div style={sectionDescStyle}>
          Paleta verificada contra capturas reales. El número va dentro del ícono.
        </div>
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #e5e7eb',
          padding: '20px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { label: 'Albatross', score: 2, par: 5, color: GARMIN_COLORS.eagle },
              { label: 'Eagle', score: 3, par: 5, color: GARMIN_COLORS.eagle },
              { label: 'Birdie', score: 3, par: 4, color: GARMIN_COLORS.birdie },
              { label: 'Par', score: 4, par: 4, color: GARMIN_COLORS.neutral },
              { label: 'Bogey', score: 5, par: 4, color: GARMIN_COLORS.bogey },
              { label: 'Doble+', score: 6, par: 4, color: GARMIN_COLORS.double },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <ScoreSymbol score={item.score} par={item.par} size="lg" theme="light" />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: item.color }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 10, color: GARMIN_COLORS.mutedDark, marginTop: 2, fontFamily: '"DM Mono", monospace' }}>
                  {item.color}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── DEMO 1: Stroke Play Gross ── */}
        <div style={sectionTitleStyle}>1. Stroke Play Gross · 18 hoyos</div>
        <div style={sectionDescStyle}>
          Ronda normal sin handicap aplicado. Solo scores brutos.
        </div>
        <div>
          <span style={badgeStyle}>GROSS</span>
          <span style={badgeStyle}>18H</span>
        </div>
        <Scorecard
          holes={LOMAS_HOLES}
          scores={SCORES_LOMAS_88}
          courseHandicap={0}
          modo="gross"
          formato="stroke_play"
          playerName="Juan José Lamarca"
        />

        {/* ── DEMO 2: Stroke Play Neto con strokes ── */}
        <div style={sectionTitleStyle}>2. Stroke Play Neto · 18 hoyos</div>
        <div style={sectionDescStyle}>
          Jugador con course handicap 11. Se muestran los puntitos grises de strokes recibidos
          y el score neto en pequeño debajo del gross cuando hay strokes aplicados.
        </div>
        <div>
          <span style={badgeStyle}>NETO</span>
          <span style={badgeStyle}>HCP 11</span>
          <span style={badgeStyle}>18H</span>
        </div>
        <Scorecard
          holes={LOMAS_HOLES}
          scores={SCORES_LOMAS_88}
          courseHandicap={11}
          modo="neto"
          formato="stroke_play"
          playerName="Juan José Lamarca"
        />

        {/* ── DEMO 3: Stableford ── */}
        <div style={sectionTitleStyle}>3. Stableford · 18 hoyos</div>
        <div style={sectionDescStyle}>
          Score primario en puntos (dorado Golfers+). Muestra puntos por hoyo y total grande.
        </div>
        <div>
          <span style={badgeStyle}>STABLEFORD</span>
          <span style={badgeStyle}>HCP 11</span>
          <span style={badgeStyle}>18H</span>
        </div>
        <Scorecard
          holes={LOMAS_HOLES}
          scores={SCORES_LOMAS_88}
          courseHandicap={11}
          modo="neto"
          formato="stableford"
          playerName="Juan José Lamarca"
        />

        {/* ── DEMO 4: Ronda excelente con eagles y birdies ── */}
        <div style={sectionTitleStyle}>4. Ronda excelente · eagle + 3 birdies</div>
        <div style={sectionDescStyle}>
          Ronda de 76 con un eagle en el hoyo 3 (doble círculo azul) y múltiples birdies
          (círculos celestes). Muestra cómo se ven las rondas buenas — el ancla visual son los azules.
        </div>
        <div>
          <span style={badgeStyle}>GROSS</span>
          <span style={badgeStyle}>76 · 4 UNDER</span>
        </div>
        <Scorecard
          holes={LOMAS_HOLES}
          scores={SCORES_LOMAS_76}
          courseHandicap={0}
          modo="gross"
          formato="stroke_play"
          playerName="Juan José Lamarca"
        />

        {/* ── DEMO 5: 9 hoyos ── */}
        <div style={sectionTitleStyle}>5. Front 9 solamente</div>
        <div style={sectionDescStyle}>
          Ronda de 9 hoyos. El componente detecta que solo hay front 9 y no renderiza back 9 ni total final.
        </div>
        <div>
          <span style={badgeStyle}>NETO</span>
          <span style={badgeStyle}>HCP 11</span>
          <span style={badgeStyle}>9H</span>
        </div>
        <Scorecard
          holes={LOMAS_HOLES.slice(0, 9)}
          scores={SCORES_FRONT9}
          courseHandicap={11}
          modo="neto"
          formato="stroke_play"
          playerName="Juan José Lamarca"
        />

        {/* ── DEMO 6: Info extendida (toggle) ── */}
        <div style={sectionTitleStyle}>6. Modo extendido · yardajes + SI</div>
        <div style={sectionDescStyle}>
          Al tocar la tarjeta post-ronda, el usuario puede expandir para ver yardajes y stroke
          index por hoyo (como hace Garmin con &quot;View Full Scorecard&quot;).
        </div>
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setShowExtended(x => !x)}
            style={{
              background: showExtended ? '#c4992a' : '#ffffff',
              color: showExtended ? '#ffffff' : '#c4992a',
              border: '1px solid #c4992a',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {showExtended ? '− Ocultar detalles' : '+ Mostrar detalles'}
          </button>
        </div>
        <Scorecard
          holes={LOMAS_HOLES}
          scores={SCORES_LOMAS_88}
          courseHandicap={0}
          modo="gross"
          formato="stroke_play"
          playerName="Juan José Lamarca"
          showExtendedInfo={showExtended}
        />

        {/* ── DEMO 7: HoleBar para historial ── */}
        <div style={sectionTitleStyle}>7. HoleBar · historial estilo Garmin Activity</div>
        <div style={sectionDescStyle}>
          La barra horizontal de colores permite escanear el historial de un vistazo.
          Cada segmento es un hoyo coloreado por resultado.
        </div>
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #e5e7eb',
          padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Mock de cards de historial con HoleBar */}
          {[
            { title: 'Lomas de la Dehesa', date: '21 Abr 2026', score: 88, par: 72, scores: SCORES_LOMAS_88 },
            { title: 'Lomas de la Dehesa', date: '10 Mar 2026', score: 76, par: 72, scores: SCORES_LOMAS_76 },
            { title: 'Club de Golf Los Leones', date: '2 Feb 2026', score: 41, par: 36, scores: SCORES_FRONT9 },
          ].map((round, idx) => (
            <div
              key={idx}
              style={{
                padding: '16px 0',
                borderBottom: idx < 2 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark, letterSpacing: '0.04em' }}>
                  🏌️ Stroke Play
                </div>
                <div style={{ fontSize: 11, color: GARMIN_COLORS.mutedDark }}>
                  {round.date}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>
                  {round.title}
                </div>
                <div style={{ textAlign: 'right', marginLeft: 12 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#111827', fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>
                    {round.score}
                  </div>
                  <div style={{ fontSize: 12, color: GARMIN_COLORS.mutedDark, marginTop: 2, fontFamily: '"DM Mono", monospace' }}>
                    {round.score - round.par > 0 ? `+${round.score - round.par}` : round.score - round.par === 0 ? 'E' : `${round.score - round.par}`}
                  </div>
                </div>
              </div>
              <HoleBar
                scores={round.scores}
                pars={LOMAS_PARS_ARRAY}
                totalHoles={Object.keys(round.scores).length >= 18 ? 18 : 9}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, textAlign: 'center', fontSize: 11, color: GARMIN_COLORS.mutedDark }}>
          Esta página es solo para validación visual.<br />
          Será eliminada cuando el rediseño se mergee a main.
        </div>
      </div>
    </div>
  )
}
