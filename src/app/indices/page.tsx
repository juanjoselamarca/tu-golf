'use client'

import { useState } from 'react'
import Link from 'next/link'

/* ── Design tokens ──────────────────────────────────── */
const gold = '#C4992A'
const ivory = '#edeae4'
const bg = '#070d18'
const card = '#0e1c2f'
const textMuted = 'rgba(255,255,255,0.55)'
const textFaint = 'rgba(255,255,255,0.35)'
const border = 'rgba(196,153,42,0.12)'
const green = '#16a34a'
const red = '#dc2626'

/* ── Reusable components ──────────────────────────────── */

function LabBadge() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: 'rgba(196,153,42,0.1)', border: `1px solid rgba(196,153,42,0.25)`,
      borderRadius: '20px', padding: '4px 12px',
      fontFamily: '"DM Mono", monospace', fontSize: '10px', fontWeight: 700,
      color: gold, letterSpacing: '0.15em', textTransform: 'uppercase' as const,
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: gold, animation: 'labPulse 2s ease infinite' }} />
      LABS
    </span>
  )
}

function Section({ id, title, subtitle, children }: { id?: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div id={id} style={{ background: card, border: `1px solid ${border}`, borderRadius: '16px', padding: '24px 20px', marginBottom: '16px' }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: gold, margin: '0 0 4px', lineHeight: 1.2 }}>
        {title}
      </h2>
      {subtitle && <p style={{ fontSize: '12px', color: textFaint, margin: '0 0 16px', fontFamily: '"DM Mono", monospace', letterSpacing: '0.05em' }}>{subtitle}</p>}
      {!subtitle && <div style={{ marginBottom: '16px' }} />}
      {children}
    </div>
  )
}

function FormulaBlock({ formula, explanation }: { formula: string; explanation: string }) {
  return (
    <div style={{ background: 'rgba(196,153,42,0.06)', border: `1px solid ${border}`, borderRadius: '10px', padding: '14px 16px', margin: '12px 0' }}>
      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '13px', fontWeight: 600, color: gold, marginBottom: '6px' }}>{formula}</div>
      <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5 }}>{explanation}</div>
    </div>
  )
}

function PgaCard({ player, moment, cpiEstimate, description, color }: { player: string; moment: string; cpiEstimate: number; description: string; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${border}`, borderRadius: '12px', padding: '16px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: ivory }}>{player}</div>
          <div style={{ fontSize: '11px', color: textFaint, fontFamily: '"DM Mono", monospace' }}>{moment}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color, fontFamily: '"Cormorant Garamond", serif', lineHeight: 1 }}>{cpiEstimate}</div>
          <div style={{ fontSize: '9px', color: textFaint, fontFamily: '"DM Mono", monospace' }}>CPI EST.</div>
        </div>
      </div>
      <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5, margin: 0 }}>{description}</p>
    </div>
  )
}

function GwiScenarioStep({ hole, event, gwi, delta }: { hole: number; event: string; gwi: number; delta: number }) {
  const deltaColor = delta > 0 ? green : delta < 0 ? red : textFaint
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(196,153,42,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '12px', fontWeight: 700, color: gold }}>H{hole}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', color: ivory }}>{event}</div>
      </div>
      <div style={{ textAlign: 'right', minWidth: '60px' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: gold, fontFamily: '"Cormorant Garamond", serif' }}>{gwi}%</div>
        <div style={{ fontSize: '11px', color: deltaColor, fontWeight: 600 }}>{delta > 0 ? `+${delta}` : delta}%</div>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────── */

export default function IndicesPage() {
  const [activeTab, setActiveTab] = useState<'cpi' | 'gwi' | 'indice'>('cpi')

  return (
    <div style={{ background: bg, minHeight: '100dvh', paddingBottom: '100px' }}>
      <style>{`
        @keyframes labPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* ═══ HERO ═══ */}
      <div style={{ padding: '40px 20px 24px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <LabBadge />
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '28px', fontWeight: 700, color: ivory, margin: '16px 0 10px', lineHeight: 1.1 }}>
          Golf Intelligence
        </h1>
        <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, maxWidth: '400px', margin: '0 auto' }}>
          La ciencia que usan los profesionales, aplicada a tu juego amateur. Tres sistemas propietarios que transforman datos en ventaja competitiva.
        </p>
      </div>

      {/* ═══ TAB NAVIGATION ═══ */}
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '3px', gap: '3px' }}>
          {([
            { key: 'cpi' as const, label: 'CPI\u2122' },
            { key: 'gwi' as const, label: 'GWI\u2122' },
            { key: 'indice' as const, label: '\u00cdndice G+' },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              border: 'none', cursor: 'pointer', fontFamily: '"DM Mono", monospace',
              background: activeTab === tab.key ? gold : 'transparent',
              color: activeTab === tab.key ? bg : textFaint,
              transition: 'all 0.15s ease',
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 16px' }}>

        {/* ═══════════════════════════════════════════ */}
        {/* ═══ CPI TAB ═══ */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === 'cpi' && (
          <>
            <Section title="Current Performance Index" subtitle="TU MOMENTUM EN UN N\u00daMERO">
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 16px' }}>
                El CPI no mide tu potencial — mide <strong style={{ color: ivory }}>c\u00f3mo est\u00e1s jugando ahora mismo</strong>. Es la diferencia entre &quot;soy handicap 12&quot; y &quot;esta semana estoy jugando como un 8&quot;.
              </p>
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0' }}>
                Un n\u00famero entre 0 y 100 que sube cuando mejor\u00e1s y baja cuando no. Calculado en tiempo real con tus \u00faltimas 20 rondas.
              </p>
            </Section>

            <Section title="Si el PGA Tour tuviera CPI\u2122" subtitle="ESTIMACIONES BASADAS EN DATOS P\u00daBLICOS">
              <PgaCard
                player="Tiger Woods"
                moment="Masters 2019 \u2014 La remontada"
                cpiEstimate={96}
                color={green}
                description="4 rondas consistentes (70-68-67-70), tendencia ascendente todo el torneo, varianza m\u00ednima. Su CPI habr\u00eda estado en el top 1% del field."
              />
              <PgaCard
                player="Jordan Spieth"
                moment="Open Championship 2017 \u2014 Hoyo 13, \u00faltima ronda"
                cpiEstimate={91}
                color={green}
                description="Ven\u00eda de 5 birdies en 6 hoyos. Su tendencia intraronda habr\u00eda disparado el CPI. Un momento donde el momentum era medible."
              />
              <PgaCard
                player="Rory McIlroy"
                moment="Masters 2011 \u2014 Domingo en Augusta"
                cpiEstimate={34}
                color={red}
                description="L\u00edder por 4 al arrancar el domingo, termin\u00f3 con 80. Diferencial alto, inconsistencia extrema, tendencia negativa. El CPI habr\u00eda ca\u00eddo en cada hoyo del back nine."
              />
              <PgaCard
                player="Amateur promedio Chile"
                moment="Temporada regular \u2014 HCP 15"
                cpiEstimate={42}
                color={gold}
                description="Juega 1-2 veces por semana, tira entre 85 y 95. Buena consistencia pero diferencial alto. Con m\u00e1s rondas y mejor tendencia, puede subir a 55+."
              />
              <p style={{ fontSize: '11px', color: textFaint, fontStyle: 'italic', marginTop: '8px' }}>
                * Estimaciones ilustrativas basadas en datos p\u00fablicos de torneos. El CPI\u2122 es propietario de Golfers+.
              </p>
            </Section>

            <Section title="Los 4 factores del CPI\u2122" subtitle="QU\u00c9 MUEVE TU N\u00daMERO">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { pts: '55', label: 'Base', desc: 'Tu diferencial promedio ponderado por recencia. Scratch = 55 pts.', icon: '\u26f3' },
                  { pts: '25', label: 'Consistencia', desc: 'Menos variaci\u00f3n entre rondas = m\u00e1s puntos. La desviaci\u00f3n te penaliza.', icon: '\ud83c\udfaf' },
                  { pts: '20', label: 'Tendencia', desc: 'Rondas recientes vs antiguas. Mejorando = m\u00e1s puntos.', icon: '\ud83d\udcc8' },
                  { pts: '\u00d71', label: 'Volumen', desc: 'Multiplicador de 0 a 1. Con 10+ rondas se desbloquea el 100%.', icon: '\ud83d\udcca' },
                ].map(f => (
                  <div key={f.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '14px' }}>
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '22px', fontWeight: 700, color: gold }}>{f.pts}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: ivory }}>{f.label}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: textMuted, lineHeight: 1.4 }}>{f.desc}</div>
                  </div>
                ))}
              </div>

              <FormulaBlock
                formula="CPI = (Base + Consistencia + Tendencia) \u00d7 Volumen"
                explanation="M\u00e1ximo te\u00f3rico: 100. Para llegar necesit\u00e1s: diferencial scratch, cero variaci\u00f3n, mejora constante, y 10+ rondas. Tiger en su prime: ~96."
              />
            </Section>

            <Section title="CPI vs \u00cdndice" subtitle="\u00bfCU\u00c1L ES LA DIFERENCIA?">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: textFaint, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', marginBottom: '8px' }}>ÍNDICE</div>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: textMuted, fontFamily: '"Cormorant Garamond", serif', lineHeight: 1 }}>12</div>
                  <div style={{ fontSize: '12px', color: textMuted, marginTop: '8px', lineHeight: 1.4 }}>Tu <strong>potencial</strong>. Usa tus mejores rondas. Lo que pod\u00e9s hacer en un buen d\u00eda.</div>
                </div>
                <div style={{ background: 'rgba(196,153,42,0.06)', borderRadius: '10px', padding: '14px', border: `1px solid ${border}`, textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: gold, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', marginBottom: '8px' }}>CPI\u2122</div>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: gold, fontFamily: '"Cormorant Garamond", serif', lineHeight: 1 }}>67</div>
                  <div style={{ fontSize: '12px', color: textMuted, marginTop: '8px', lineHeight: 1.4 }}>Tu <strong>realidad hoy</strong>. Usa todas tus rondas recientes. C\u00f3mo est\u00e1s jugando <em>ahora</em>.</div>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5, margin: 0 }}>
                Pod\u00e9s tener handicap 12 y CPI 35 (mal momento). O handicap 15 y CPI 72 (est\u00e1s en racha). El tAIger+ usa ambos para entender d\u00f3nde est\u00e1s parado.
              </p>
            </Section>
          </>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* ═══ GWI TAB ═══ */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === 'gwi' && (
          <>
            <Section title="Golf Win Index" subtitle="PROBABILIDAD DE GANAR EN TIEMPO REAL">
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 16px' }}>
                El GWI responde una sola pregunta: <strong style={{ color: ivory }}>&quot;\u00bfcu\u00e1nta chance tengo de ganar esta ronda?&quot;</strong> Cambia hoyo a hoyo. Cuando la ronda termina, desaparece. Es pura tensi\u00f3n en tiempo real.
              </p>
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0' }}>
                Funciona con 2 jugadores o con 100. El modelo matem\u00e1tico es el mismo que usan las casas de apuestas para el PGA Tour, adaptado al golf amateur.
              </p>
            </Section>

            <Section title="Una ronda entre amigos \u2014 hoyo a hoyo" subtitle="ESCENARIO: 4 JUGADORES, LOS LEONES, PAR 72">
              <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5, margin: '0 0 12px' }}>
                Segu\u00ed el GWI de <strong style={{ color: gold }}>Mart\u00edn (HCP 14)</strong> durante una ronda real:
              </p>
              <GwiScenarioStep hole={1} event="Par. Todos pares. Arranca parejo." gwi={25} delta={0} />
              <GwiScenarioStep hole={3} event="Birdie en par 5. Toma la punta." gwi={34} delta={9} />
              <GwiScenarioStep hole={6} event="Tres pares seguidos. Consistente." gwi={38} delta={4} />
              <GwiScenarioStep hole={9} event="OUT: 38 (-1). L\u00edder por 2." gwi={52} delta={14} />
              <GwiScenarioStep hole={12} event="Triple bogey en par 3. Desastre." gwi={28} delta={-24} />
              <GwiScenarioStep hole={14} event="Birdie. Se recupera." gwi={41} delta={13} />
              <GwiScenarioStep hole={17} event="Par. Segundo lugar a 1 golpe." gwi={35} delta={-6} />
              <GwiScenarioStep hole={18} event="Birdie en el 18. GANA por 1." gwi={100} delta={65} />
              <p style={{ fontSize: '12px', color: gold, fontWeight: 600, textAlign: 'center', marginTop: '12px' }}>
                De 25% a 100% en 18 hoyos. Esa es la historia que el GWI cuenta.
              </p>
            </Section>

            <Section title="La matem\u00e1tica detr\u00e1s" subtitle="MODELO BRADLEY-TERRY ADAPTADO">
              <FormulaBlock
                formula="\u03c3(hoyo) = 1.50 + 0.085 \u00d7 HCP + 0.0012 \u00d7 HCP\u00b2"
                explanation="Varianza esperada por hoyo. Un scratch var\u00eda ~1.5 strokes. Un HCP 20 var\u00eda ~3.7. A mayor handicap, m\u00e1s impredecible el resultado."
              />
              <FormulaBlock
                formula="\u03c3(total) = \u221a(hoyos restantes) \u00d7 \u03c3(hoyo)"
                explanation="La incertidumbre crece con la ra\u00edz cuadrada de los hoyos que faltan. Con 9 por jugar: mucho puede pasar. Con 2: el l\u00edder casi siempre gana."
              />
              <div style={{ margin: '16px 0', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.8 }}>
                  <strong style={{ color: gold }}>En la pr\u00e1ctica:</strong> Si vas -2 despu\u00e9s de 9 hoyos contra 3 amigos HCP 15, tu GWI es ~55%. Parece poco, pero quedan 9 hoyos de incertidumbre. Un triple bogey cambia todo.<br/><br/>
                  <strong style={{ color: gold }}>Dato PGA:</strong> En el Masters 2023, los l\u00edderes despu\u00e9s del hoyo 9 del domingo ganaron solo el 61% de las veces. El back nine de Augusta es otro torneo.
                </div>
              </div>
            </Section>

            <Section title="\u00bfPor qu\u00e9 desaparece?" subtitle="DISE\u00d1O INTENCIONAL">
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0' }}>
                El GWI solo existe mientras la ronda est\u00e1 activa. No se guarda, no se acumula, no aparece en tu perfil. Es <strong style={{ color: ivory }}>tensi\u00f3n pura del momento</strong> \u2014 como el latido del coraz\u00f3n durante una competencia. Cuando termina, lo \u00fanico que queda es el resultado. Y la historia que vas a contar.
              </p>
            </Section>
          </>
        )}

        {/* ═══════════════════════════════════════════ */}
        {/* ═══ ÍNDICE G+ TAB ═══ */}
        {/* ═══════════════════════════════════════════ */}
        {activeTab === 'indice' && (
          <>
            <Section title="\u00cdndice Golfers+" subtitle="TU \u00cdNDICE CALCULADO CON F\u00d3RMULA USGA">
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 16px' }}>
                La misma f\u00f3rmula que usa la USGA para calcular el World Handicap System, aplicada a tus rondas reales en Golfers+. Coexiste con tu \u00edndice de Federaci\u00f3n \u2014 la app nunca toca tu n\u00famero oficial.
              </p>
              <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0' }}>
                Si tu Federaci\u00f3n dice 15.4 (calculado hace 6 meses) pero tu \u00cdndice Golfers+ dice 12.1, significa que <strong style={{ color: ivory }}>est\u00e1s jugando mejor de lo que tu n\u00famero oficial refleja</strong>. El tAIger+ usa esa diferencia para calibrar tu coaching.
              </p>
            </Section>

            <Section title="La f\u00f3rmula paso a paso" subtitle="WORLD HANDICAP SYSTEM">
              <FormulaBlock
                formula="Diferencial = (Gross - Course Rating) \u00d7 113 / Slope"
                explanation="Cada ronda se convierte en un diferencial que normaliza la dificultad de la cancha. 113 es el slope est\u00e1ndar. As\u00ed un 82 en Los Leones (slope 113) y un 85 en Santo Domingo (slope 128) son comparables."
              />

              <div style={{ margin: '16px 0 8px', fontSize: '13px', fontWeight: 600, color: ivory }}>Tabla USGA: cu\u00e1ntos diferenciales usar</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' }}>
                {[
                  { rondas: '3-6', usar: '1 mejor' },
                  { rondas: '7-8', usar: '2 mejores' },
                  { rondas: '9-11', usar: '3 mejores' },
                  { rondas: '12-14', usar: '4 mejores' },
                  { rondas: '15-16', usar: '5 mejores' },
                  { rondas: '17', usar: '6 mejores' },
                  { rondas: '18-19', usar: '7 mejores' },
                  { rondas: '20', usar: '8 mejores' },
                ].map(row => (
                  <div key={row.rondas} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <span style={{ fontSize: '12px', color: textMuted }}>{row.rondas} rondas</span>
                    <span style={{ fontSize: '12px', color: gold, fontWeight: 600 }}>{row.usar}</span>
                  </div>
                ))}
              </div>

              <FormulaBlock
                formula="\u00cdndice = Promedio(mejores N) \u00d7 0.96"
                explanation="El 0.96 es el ajuste est\u00e1ndar USGA. Significa que tu \u00edndice es ligeramente mejor que tu promedio de mejores rondas \u2014 refleja tu potencial demostrado."
              />
            </Section>

            <Section title="Ejemplo real" subtitle="JUGADOR HCP 14 \u2014 12 RONDAS">
              <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.8 }}>
                  <strong style={{ color: gold }}>12 rondas \u2192 usar 4 mejores diferenciales</strong><br/>
                  Diferenciales ordenados: <span style={{ fontFamily: '"DM Mono", monospace', color: green }}>11.2, 12.8, 13.1, 14.0</span><span style={{ color: textFaint }}>, 15.3, 16.1, 17.4, 18.2, 19.0, 20.1, 21.5, 23.8</span><br/><br/>
                  Promedio mejores 4: (11.2 + 12.8 + 13.1 + 14.0) / 4 = <strong style={{ color: gold }}>12.78</strong><br/>
                  \u00cdndice: 12.78 \u00d7 0.96 = <strong style={{ color: gold, fontSize: '16px' }}>12.3</strong>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: textFaint, lineHeight: 1.5, margin: 0 }}>
                Necesit\u00e1s m\u00ednimo 3 rondas de 18 hoyos con datos de cancha (slope y rating) para activar tu \u00cdndice Golfers+. Se recalcula autom\u00e1ticamente cada vez que registr\u00e1s una ronda.
              </p>
            </Section>
          </>
        )}

        {/* ═══ CTA ═══ */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <Link href="/perfil" style={{
            display: 'inline-block', background: gold, color: bg,
            padding: '14px 32px', borderRadius: '12px', fontSize: '15px', fontWeight: 700,
            textDecoration: 'none',
          }}>
            Ver mis \u00edndices
          </Link>
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <Link href="/demo" style={{ fontSize: '13px', color: textFaint, textDecoration: 'none' }}>Ver perfil demo</Link>
            <Link href="/register" style={{ fontSize: '13px', color: gold, textDecoration: 'none', fontWeight: 600 }}>Crear cuenta gratis</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
