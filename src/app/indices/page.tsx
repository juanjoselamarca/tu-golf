'use client'

import Link from 'next/link'

/* ── Design tokens ──────────────────────────────────── */
const gold = '#C4992A'
const ivory = '#edeae4'
const bg = '#070d18'
const card = '#0e1c2f'
const textMuted = 'rgba(255,255,255,0.55)'
const textFaint = 'rgba(255,255,255,0.35)'
const border = 'rgba(196,153,42,0.12)'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: card, border: `1px solid ${border}`, borderRadius: '16px', padding: '24px 20px', marginBottom: '16px' }}>
      <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', fontWeight: 700, color: gold, margin: '0 0 16px', lineHeight: 1.2 }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function FormulaBlock({ formula, explanation }: { formula: string; explanation: string }) {
  return (
    <div style={{ background: 'rgba(196,153,42,0.06)', border: `1px solid ${border}`, borderRadius: '10px', padding: '14px 16px', margin: '12px 0' }}>
      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '14px', fontWeight: 600, color: gold, marginBottom: '6px', letterSpacing: '0.02em' }}>
        {formula}
      </div>
      <div style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5 }}>
        {explanation}
      </div>
    </div>
  )
}

function ScaleBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: ivory }}>{label}</span>
        <span style={{ fontSize: '12px', color, fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: '3px', transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function IndicesPage() {
  return (
    <div style={{ background: bg, minHeight: '100dvh', paddingBottom: '100px' }}>
      {/* Hero */}
      <div style={{ padding: '48px 20px 32px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '11px', fontWeight: 700, color: gold, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '12px' }}>
          LA CIENCIA DETR&Aacute;S DE TU JUEGO
        </div>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, color: ivory, margin: '0 0 12px', lineHeight: 1.1 }}>
          Dos &iacute;ndices que cuentan tu historia completa
        </h1>
        <p style={{ fontSize: '15px', color: textMuted, lineHeight: 1.6, maxWidth: '440px', margin: '0 auto' }}>
          Golfers+ mide tu juego con dos sistemas propietarios: el <strong style={{ color: gold }}>CPI&trade;</strong> para tu rendimiento individual y el <strong style={{ color: gold }}>GWI&trade;</strong> para tu probabilidad de ganar en tiempo real.
        </p>
      </div>

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 16px' }}>

        {/* ═══ CPI SECTION ═══ */}
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', fontWeight: 700, color: textFaint, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>
          &Iacute;NDICE 1
        </div>

        <Section title="CPI&trade; &mdash; Current Performance Index">
          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 16px' }}>
            Tu CPI mide <strong style={{ color: ivory }}>c&oacute;mo est&aacute;s jugando ahora mismo</strong> comparado con tu propio historial. No es tu handicap &mdash; es tu momentum. Un n&uacute;mero entre 0 y 100 que sube cuando mej&oacute;ras y baja cuando no.
          </p>

          <div style={{ fontSize: '13px', color: ivory, fontWeight: 600, marginBottom: '8px' }}>Escala</div>
          <ScaleBar value={90} label="75+ Elite" color="#16a34a" />
          <ScaleBar value={70} label="60-74 Fuerte" color={gold} />
          <ScaleBar value={50} label="40-59 Promedio" color="#94a8c0" />
          <ScaleBar value={30} label="25-39 En desarrollo" color="#d97706" />
          <ScaleBar value={15} label="0-24 Inicio" color="#dc2626" />
        </Section>

        <Section title="C&oacute;mo se calcula el CPI&trade;">
          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 12px' }}>
            El CPI combina 4 factores de tus &uacute;ltimas 20 rondas. Cada factor aporta puntos al total:
          </p>

          <FormulaBlock
            formula="Diferencial = (Gross - Course Rating) &times; 113 / Slope"
            explanation="Tu score ajustado por la dificultad de la cancha. Es la base de todo. Un diferencial de 10 significa que jugaste 10 strokes sobre el rating de la cancha."
          />

          <div style={{ margin: '16px 0 8px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.8 }}>
              <strong style={{ color: gold }}>Base (0-55 pts):</strong> Tu diferencial promedio ponderado. Scratch = 55, bogey golfer = 0.<br/>
              <strong style={{ color: gold }}>Consistencia (0-25 pts):</strong> Menos variaci&oacute;n entre rondas = m&aacute;s puntos. Si siempre tiras parecido, sos consistente.<br/>
              <strong style={{ color: gold }}>Tendencia (0-20 pts):</strong> Compara tus rondas recientes con las antiguas. Mejorando = m&aacute;s puntos.<br/>
              <strong style={{ color: gold }}>Volumen:</strong> Multiplicador de 0 a 1 seg&uacute;n cu&aacute;ntas rondas ten&eacute;s. Con 10+ rondas se desbloquea el 100%.
            </div>
          </div>

          <FormulaBlock
            formula="CPI = (Base + Consistencia + Tendencia) &times; Volumen"
            explanation="M&aacute;ximo te&oacute;rico: 55 + 25 + 20 = 100. Para llegar a 100 necesit&aacute;s: diferencial scratch, cero variaci&oacute;n, mejora constante, y 10+ rondas."
          />

          <p style={{ fontSize: '13px', color: textFaint, lineHeight: 1.5, marginTop: '12px' }}>
            El CPI se recalcula cada vez que registr&aacute;s una ronda. Necesit&aacute;s m&iacute;nimo 3 rondas con datos de cancha (slope y rating) para activarlo.
          </p>
        </Section>

        <Section title="CPI vs Handicap &mdash; &iquest;Cu&aacute;l es la diferencia?">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: textFaint, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', marginBottom: '6px' }}>HANDICAP</div>
              <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.5 }}>
                Mide tu <strong>potencial</strong>. Usa tus mejores rondas. Te dice de cu&aacute;nto sos capaz en un buen d&iacute;a.
              </div>
            </div>
            <div style={{ background: 'rgba(196,153,42,0.06)', borderRadius: '10px', padding: '14px', border: `1px solid ${border}` }}>
              <div style={{ fontSize: '11px', color: gold, fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', marginBottom: '6px' }}>CPI&trade;</div>
              <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.5 }}>
                Mide tu <strong>realidad actual</strong>. Usa todas tus rondas recientes. Te dice c&oacute;mo est&aacute;s jugando <em>hoy</em>.
              </div>
            </div>
          </div>
          <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5 }}>
            Pod&eacute;s tener handicap 12 y CPI 35 (est&aacute;s jugando peor de lo que tu handicap dice). O handicap 15 y CPI 72 (tu juego real es mejor que tu n&uacute;mero oficial). tAIger+ usa ambos para darte coaching espec&iacute;fico.
          </p>
        </Section>

        {/* ═══ GWI SECTION ═══ */}
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', fontWeight: 700, color: textFaint, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px', marginTop: '32px', paddingLeft: '4px' }}>
          &Iacute;NDICE 2
        </div>

        <Section title="GWI&trade; &mdash; Golf Win Index">
          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 16px' }}>
            Tu GWI es la <strong style={{ color: ivory }}>probabilidad de que ganes la ronda en la que est&aacute;s jugando</strong>. Cambia hoyo a hoyo, en tiempo real. Solo existe mientras la ronda est&aacute; activa &mdash; cuando termina, desaparece.
          </p>

          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 12px' }}>
            Si est&aacute;s jugando con 3 amigos y vas -2 despu&eacute;s de 9 hoyos, tu GWI puede ser 62% &mdash; significa que la matem&aacute;tica dice que ten&eacute;s 62% de probabilidad de ganar. Pero si hac&eacute;s triple bogey en el 10, baja a 38%.
          </p>
        </Section>

        <Section title="C&oacute;mo se calcula el GWI&trade;">
          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 12px' }}>
            El modelo usa un sistema estad&iacute;stico llamado <strong style={{ color: ivory }}>Bradley-Terry</strong>, adaptado al golf amateur:
          </p>

          <FormulaBlock
            formula="&sigma;(hoyo) = 1.50 + 0.085 &times; HCP + 0.0012 &times; HCP&sup2;"
            explanation="Varianza esperada por hoyo. Un scratch (HCP 0) var&iacute;a ~1.5 strokes por hoyo. Un HCP 20 var&iacute;a ~3.7. Esto modela cu&aacute;nto puede cambiar el resultado en los hoyos que faltan."
          />

          <FormulaBlock
            formula="&sigma;(total) = &radic;(hoyos restantes) &times; &sigma;(hoyo)"
            explanation="La incertidumbre total crece con la ra&iacute;z cuadrada de los hoyos que faltan. Con 9 hoyos por jugar hay m&aacute;s incertidumbre que con 2."
          />

          <div style={{ margin: '16px 0', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.8 }}>
              <strong style={{ color: gold }}>En cada hoyo:</strong> El modelo toma tu score actual vs el field, la varianza restante de cada jugador (basada en su handicap), y calcula la probabilidad de que termines con el score m&aacute;s bajo.<br/><br/>
              <strong style={{ color: gold }}>Resultado:</strong> Un porcentaje entre 0% y 100% que se actualiza cada vez que alguien registra un score.
            </div>
          </div>

          <p style={{ fontSize: '13px', color: textFaint, lineHeight: 1.5, marginTop: '12px' }}>
            El GWI funciona con 2 o m&aacute;s jugadores. Con 2 es como un cara a cara. Con 20 es como un torneo. La matem&aacute;tica es la misma &mdash; el modelo Bradley-Terry escala naturalmente.
          </p>
        </Section>

        <Section title="GWI en la pr&aacute;ctica">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            {[
              { pct: '80%+', label: 'Dominando', color: '#16a34a' },
              { pct: '40-60%', label: 'Parejo', color: gold },
              { pct: '<20%', label: 'Complicado', color: '#dc2626' },
            ].map(item => (
              <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: item.color, fontFamily: '"Cormorant Garamond", serif' }}>{item.pct}</div>
                <div style={{ fontSize: '11px', color: textFaint, marginTop: '4px' }}>{item.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '13px', color: textMuted, lineHeight: 1.5 }}>
            Compart&iacute; el leaderboard con tu grupo de WhatsApp y cada uno puede ver su GWI en vivo. Es la tensi&oacute;n del torneo profesional, en tu ronda del s&aacute;bado.
          </p>
        </Section>

        {/* ═══ ÍNDICE GOLFERS+ ═══ */}
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '10px', fontWeight: 700, color: textFaint, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px', marginTop: '32px', paddingLeft: '4px' }}>
          BONUS
        </div>

        <Section title="&Iacute;ndice Golfers+ &mdash; Tu handicap real">
          <p style={{ fontSize: '14px', color: textMuted, lineHeight: 1.6, margin: '0 0 12px' }}>
            Calculado con la <strong style={{ color: ivory }}>f&oacute;rmula oficial USGA</strong> usando tu historial real en Golfers+. Coexiste con tu &iacute;ndice de Federaci&oacute;n (que vos actualizas a mano).
          </p>

          <FormulaBlock
            formula="&Iacute;ndice = Promedio(mejores N diferenciales de &uacute;ltimas 20) &times; 0.96"
            explanation="N depende de cu&aacute;ntas rondas ten&eacute;s: con 3-6 usa la mejor, con 20 usa las 8 mejores. El 0.96 es el ajuste est&aacute;ndar USGA."
          />

          <div style={{ margin: '12px 0', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
            <div style={{ fontSize: '13px', color: ivory, lineHeight: 1.8 }}>
              <strong style={{ color: gold }}>3-6 rondas:</strong> usa 1 mejor diferencial<br/>
              <strong style={{ color: gold }}>7-8 rondas:</strong> usa 2 mejores<br/>
              <strong style={{ color: gold }}>9-11 rondas:</strong> usa 3 mejores<br/>
              <strong style={{ color: gold }}>12-14 rondas:</strong> usa 4 mejores<br/>
              <strong style={{ color: gold }}>15-16 rondas:</strong> usa 5 mejores<br/>
              <strong style={{ color: gold }}>17 rondas:</strong> usa 6 mejores<br/>
              <strong style={{ color: gold }}>18-19 rondas:</strong> usa 7 mejores<br/>
              <strong style={{ color: gold }}>20 rondas:</strong> usa 8 mejores
            </div>
          </div>

          <p style={{ fontSize: '13px', color: textFaint, lineHeight: 1.5 }}>
            Si tu Federaci&oacute;n dice 15.4 pero tu &Iacute;ndice Golfers+ dice 12.1, significa que est&aacute;s jugando mejor de lo que tu n&uacute;mero oficial refleja. tAIger+ usa ambos para entender la diferencia.
          </p>
        </Section>

        {/* CTA */}
        <div style={{ textAlign: 'center', marginTop: '32px' }}>
          <Link href="/perfil" style={{
            display: 'inline-block', background: gold, color: bg,
            padding: '14px 32px', borderRadius: '12px', fontSize: '15px', fontWeight: 700,
            textDecoration: 'none',
          }}>
            Ver mis &iacute;ndices
          </Link>
          <p style={{ fontSize: '12px', color: textFaint, marginTop: '12px' }}>
            Necesit&aacute;s 3+ rondas con datos de cancha para activar el CPI&trade; y el &Iacute;ndice Golfers+.
          </p>
        </div>
      </div>
    </div>
  )
}
