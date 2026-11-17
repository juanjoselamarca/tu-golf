import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { getPageUser } from '@/lib/auth/getPageUser'
import { TaigerHero } from '@/components/coach/TaigerHero'
import { MentalRecoveryCard } from '@/components/coach/MentalRecoveryCard'
import { HighlightsCarousel } from '@/components/coach/HighlightsCarousel'
import { HighlightCard } from '@/components/coach/HighlightCard'
import { CostoPsicologicoCard } from '@/components/coach/CostoPsicologicoCard'
import { CurvaMentalCard } from '@/components/coach/CurvaMentalCard'
import { PatternTile } from '@/components/coach/PatternTile'
import { ConversarStickyCTA } from '@/components/coach/ConversarStickyCTA'
import { DefaultTeeBanner } from '@/components/DefaultTeeBanner'
import { BANDA_MENTAL_ALTA, BANDA_MENTAL_MEDIA, etiquetaEspiral, fraseMentalIndex, resumenMentalDelCoach, textoVentanaMentalPosesivo, TITULO_BANDA_MENTAL } from '@/golf/coach/mental-index'
import { buildActivePlanSummary } from '@/golf/coach/intro'
import { fetchCoachHome } from '@/lib/data/coach-home'
import { PageTracker } from '@/components/PageTracker'
import { CoachGatePage } from './components/CoachGatePage'
import { CoachBetaBanner } from './components/CoachBetaBanner'
import { RondasNoLeidas } from './components/RondasNoLeidas'
import { HablarConMiCoach } from './components/HablarConMiCoach'
import { PlanActivo } from './components/PlanActivo'
import { SesionesAnteriores } from './components/SesionesAnteriores'
import { canUseCoach } from './lib/checkCoachAccess'
import { loginUrl } from '@/lib/auth/login-url'
import { fechaDeCalendario } from '@/lib/format'

export const dynamic = 'force-dynamic'

const PATTERN_NAMES: Record<string, string> = {
  post_bogey_spiral: 'Espiral post-bogey',
  pressure_deterioration: 'Deterioro bajo presión',
  first_hole_anxiety: 'Ansiedad en hoyo 1',
  back_nine_collapse: 'Caída en back nine',
  front_nine_struggles: 'Arranque lento',
  par_3_weakness: 'Par 3 destructivos',
  short_game_weakness: 'Juego corto débil',
  three_putt_frequency: 'Three putts frecuentes',
  driving_inconsistency: 'Scores irregulares entre rondas',
}

const MENTAL_PATTERN_IDS = new Set(['post_bogey_spiral', 'pressure_deterioration', 'first_hole_anxiety'])

function patternCategory(patternType: string): 'mental' | 'cancha' | 'tecnico' {
  if (MENTAL_PATTERN_IDS.has(patternType)) return 'mental'
  if (patternType === 'par_3_weakness' || patternType === 'short_game_weakness') return 'cancha'
  return 'tecnico'
}

const SEVERITY_WEIGHT: Record<string, number> = { critical: 3, warning: 2, info: 1 }

function patternSeverity(patternType: string): 'critical' | 'warning' | 'info' {
  if (patternType === 'post_bogey_spiral') return 'critical'
  if (patternType === 'driving_inconsistency' || patternType === 'par_3_weakness' || patternType === 'short_game_weakness') return 'info'
  return 'warning'
}

function patternScore(p: { pattern_type: string; confidence: number }): number {
  const sev = SEVERITY_WEIGHT[patternSeverity(p.pattern_type)] ?? 2
  return Math.round((sev * p.confidence) / 2.85 * 100)
}

export default async function CoachDashboard() {
  const supabase = await createClient()
  const user = await getPageUser(supabase)
  if (!user) redirect(loginUrl('/coach'))

  // Acceso: fuente única `canUseCoach` (checkCoachAccess.ts), la misma de las
  // sub-rutas y de los endpoints: beta (TAIGER25) O plan pago ('coach-plan', con
  // paywall encendido) — decisión de Juanjo 03-oct-2026. Sin acceso → pantalla de
  // beta (campo del código TAIGER25).
  if (!(await canUseCoach(supabase, user.id))) {
    return <CoachGatePage />
  }

  const { sessions, primarySessionId, patterns, plan, outcomes, rondas } = await fetchCoachHome(supabase, user.id)
  // Card "Tu plan activo": misma derivación canónica que el estado vacío del chat
  // (un concepto, una fuente). `outcomes` ya viene scopeado al plan + 4 semanas.
  const planSummary = buildActivePlanSummary(plan, outcomes)
  // La conversación principal si existe: el CTA nunca abre un chat vacío a quien ya conversa.
  const ctaHref = `/coach/sesion/${primarySessionId ?? 'nueva'}`

  // Falló la lectura de rondas: se dice y se reintenta, pero el coach sigue
  // accesible (CTA, plan y sesiones se leen aparte). Nunca "Bienvenido" a quien
  // sí tiene rondas.
  if (rondas === null) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 100px' }}>
        <PageTracker page="/coach" />
        <CoachBetaBanner />
        <div style={{ padding: '0 16px' }}>
          <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
          <RondasNoLeidas />
          <div style={{ textAlign: 'center', margin: '16px 0 24px' }}>
            <HablarConMiCoach href={ctaHref} />
          </div>
        </div>
        {planSummary && <PlanActivo plan={planSummary} />}
        <SesionesAnteriores sesiones={sessions} />
      </div>
    )
  }

  if (rondas.length === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
        <CoachBetaBanner />
        <TaigerHero subtitle="Tu coach de juego mental. Cuéntame sobre tu golf y empezamos." />
        <div style={{ background: 'var(--coach-brass-soft)', border: '1px solid var(--coach-brass)', borderRadius: '14px', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
            Bienvenido a tAIger+
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '18px', maxWidth: '340px', marginLeft: 'auto', marginRight: 'auto' }}>
            Soy tu coach de rendimiento con inteligencia artificial. Conozco cada golpe, cada patrón, cada tendencia de tu juego. Háblame y empezamos a trabajar juntos.
          </div>
          <HablarConMiCoach />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '14px' }}>
            <Link href="/ronda-libre/nueva" style={{ display: 'inline-block', background: 'transparent', color: 'var(--coach-brass)', fontWeight: 600, fontSize: '13px', padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', border: '1px solid var(--coach-brass)' }}>Nueva ronda</Link>
            <Link href="/importar" style={{ display: 'inline-block', background: 'transparent', color: 'var(--coach-brass)', fontWeight: 600, fontSize: '13px', padding: '8px 16px', borderRadius: '10px', textDecoration: 'none', border: '1px solid var(--coach-brass)' }}>Importar historial</Link>
          </div>
        </div>
      </div>
    )
  }

  // Índice, costo y curva sobre UNA ventana (las últimas 5 rondas del bucket
  // principal, con pares reales) y con UNA definición de espiral.
  const { indice, costo, curva } = resumenMentalDelCoach(rondas)

  const ctaLabel = primarySessionId ? 'Conversar con tAIger+' : 'Iniciar conversación con tAIger+'

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 0' }}>
      <CoachBetaBanner />
      <PageTracker page="/coach" />
      <div style={{ padding: '0 16px' }}>
        <TaigerHero subtitle={indice.band === 'low' ? 'Tu coach detectó algo importante en tus últimas rondas' : indice.band === 'mid' ? 'Tu coach está leyendo tu juego' : 'Tu coach de rendimiento con inteligencia artificial'} />
      </div>

      {/* Red de seguridad: si importó tarjetas sin tee y no fijó su tee habitual,
          sus rondas no alimentan el índice. Auto-oculto si ya lo fijó. */}
      <div style={{ padding: '12px 16px 0' }}>
        <DefaultTeeBanner />
      </div>

      {/* Mismo margen lateral (20px) y separación (24px) que las cards que siguen:
          sin el margen inferior quedaba pegada al Mental Index. */}
      <div style={{ padding: '12px 20px 0', marginBottom: '24px' }}>
        <Link
          href="/coach/progreso"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface)',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '14px 18px',
            textDecoration: 'none',
          }}
        >
          <span>
            <span style={{ display: 'block', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700 }}>
              Tu progreso
            </span>
            <span style={{ display: 'block', fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginTop: '2px' }}>
              La bajada hacia tu meta
            </span>
          </span>
          <span style={{ color: 'var(--coach-brass)', fontSize: '18px' }} aria-hidden>→</span>
        </Link>
      </div>

      {/* Sin datos suficientes no queda mudo: tarjeta sobria que dice qué falta. */}
      {indice.score != null && indice.band != null ? (
        <MentalRecoveryCard
          score={indice.score}
          band={indice.band}
          delta={null}
          title={TITULO_BANDA_MENTAL[indice.band]}
          description={fraseMentalIndex(indice)}
          umbrales={{ media: BANDA_MENTAL_MEDIA, alta: BANDA_MENTAL_ALTA }}
        />
      ) : (
        <MentalRecoveryCard score={null} description={fraseMentalIndex(indice)} />
      )}

      {patterns.length > 0 && (
        <HighlightsCarousel label="Highlights">
          {patterns.slice(0, 3).map(p => (
            <HighlightCard
              key={p.id}
              narrative={
                <>
                  El patrón <b style={{ color: 'var(--coach-recovery-low)', fontWeight: 600 }}>{PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}</b> apareció con confianza <b style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.round(p.confidence * 100)}%</b>.
                </>
              }
              spark={[
                { height: 30, tone: 'ink' }, { height: 60, tone: 'ink' }, { height: 80, tone: 'ink' }, { height: 100, tone: 'ink' },
              ]}
              pill={{ text: `${Math.round(p.confidence * 100)}%`, tone: patternCategory(p.pattern_type) === 'mental' ? 'neg' : 'warn' }}
            />
          ))}
        </HighlightsCarousel>
      )}

      {/* Misma ventana y mismo umbral que el Mental Index; solo si la última ronda costó golpes. */}
      {indice.status !== 'insufficient_data' && costo.lastRound && (
        <CostoPsicologicoCard
          evitables={costo.evitables}
          promedioReal={costo.promedioReal}
          promedioContenido={costo.promedioContenido}
          ventana={textoVentanaMentalPosesivo(costo.windowSize, costo.bucket)}
          realScore={costo.lastRound.realScore}
          ghostScore={costo.lastRound.ghostScore}
          delta={costo.lastRound.strokes_saved}
          espirales={costo.lastRound.espirales.map(etiquetaEspiral)}
        />
      )}

      {curva && (
        <CurvaMentalCard
          fecha={`Ronda ${fechaDeCalendario(curva.ronda.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })}`}
          curso={curva.ronda.course_name || 'la cancha'}
          totalScore={curva.ronda.total_gross}
          overPar={curva.ronda.vsPar}
          states={curva.estados}
          scores={curva.ronda.tarjeta}
          pares={curva.ronda.pares}
          espirales={curva.espirales.length}
          detalleHref={`/perfil/historial/${curva.ronda.id}`}
        />
      )}

      {patterns.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '14px' }}>Patrones detectados</div>
          {patterns.map(p => {
            const isActive = p.status === 'active'
            // La espiral ya tiene su número: el Mental Index. Un segundo "47/100" con
            // el sentido opuesto competía con él (vuelta 1 de revisión del PR3).
            const conNumero = p.pattern_type !== 'post_bogey_spiral'
            return (
              <PatternTile
                key={p.id}
                category={patternCategory(p.pattern_type)}
                state={isActive ? 'active' : 'latente'}
                name={PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}
                score={conNumero ? patternScore(p) : undefined}
                scoreSuffix={conNumero ? '/100' : undefined}
                spark={isActive ? [
                  { height: 30, tone: 'ink' }, { height: 60, tone: 'ink' }, { height: 80, tone: 'ink' }, { height: 100, tone: 'ink' },
                  { height: 80, tone: 'ink' }, { height: 75, tone: 'ink' }, { height: 90, tone: 'ink' },
                ] : []}
                footMeta={`${Math.round(p.confidence * 100)}% conf`}
              />
            )
          })}
        </div>
      )}

      {planSummary && <PlanActivo plan={planSummary} />}

      {/* La sesión principal ya la abre el CTA fijo de abajo. */}
      <SesionesAnteriores sesiones={sessions.filter(s => s.id !== primarySessionId)} />

      <ConversarStickyCTA href={ctaHref} label={ctaLabel} />
    </div>
  )
}
