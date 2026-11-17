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
import { PlanActiveCard } from '@/components/coach/PlanActiveCard'
import { ConversarStickyCTA } from '@/components/coach/ConversarStickyCTA'
import { DefaultTeeBanner } from '@/components/DefaultTeeBanner'
import { fraseMentalIndex, resumenMentalDelCoach, TITULO_BANDA_MENTAL } from '@/golf/coach/mental-index'
import { buildActivePlanSummary } from '@/golf/coach/intro'
import { fetchCoachHome } from '@/lib/data/coach-home'
import { textoPlano } from '@/lib/text/texto-plano'
import { PageTracker } from '@/components/PageTracker'
import { CoachGatePage } from './components/CoachGatePage'
import { CoachBetaBanner } from './components/CoachBetaBanner'
import { RondasNoLeidas } from './components/RondasNoLeidas'
import { canUseCoach } from './lib/checkCoachAccess'
import { loginUrl } from '@/lib/auth/login-url'
import { fechaDeCalendario } from '@/lib/format'

export const dynamic = 'force-dynamic'

const SESSION_LABELS: Record<string, string> = {
  continuous: 'Conversación continua',
  post_round: 'Análisis post-ronda',
  weekly_plan: 'Plan semanal',
  pre_tournament: 'Pre-torneo',
  free: 'Consulta libre',
  onboarding: 'Onboarding',
}

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

  // Falló la lectura: se dice y se reintenta. Nunca "Bienvenido" a quien sí tiene rondas.
  if (rondas === null) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
        <CoachBetaBanner />
        <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
        <RondasNoLeidas />
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
          <Link
            href="/coach/sesion/nueva"
            style={{ display: 'inline-block', background: 'var(--coach-brass)', color: 'var(--bg)', fontWeight: 700, fontSize: '14px', padding: '12px 28px', borderRadius: '10px', textDecoration: 'none' }}
          >
            Hablar con mi coach
          </Link>
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

  const ctaHref = `/coach/sesion/${primarySessionId ?? 'nueva'}`
  const ctaLabel = primarySessionId ? 'Conversar con tAIger+' : 'Iniciar conversación con tAIger+'

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 0' }}>
      <CoachBetaBanner />
      <PageTracker page="/coach" />
      <div style={{ padding: '0 16px' }}>
        <TaigerHero subtitle={indice.band === 'low' ? 'Tu coach detectó algo importante esta semana' : indice.band === 'mid' ? 'Tu coach está leyendo tu juego' : 'Tu coach de rendimiento con inteligencia artificial'} />
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

      {indice.score != null && indice.band != null && (
        <MentalRecoveryCard
          score={indice.score}
          band={indice.band}
          delta={null}
          title={TITULO_BANDA_MENTAL[indice.band]}
          description={fraseMentalIndex(indice)}
        />
      )}

      {patterns.length > 0 && (
        <HighlightsCarousel label="Highlights · esta semana">
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
          windowSize={costo.windowSize}
          bucket={costo.bucket}
          realScore={costo.lastRound.realScore}
          ghostScore={costo.lastRound.ghostScore}
          delta={costo.lastRound.strokes_saved}
          espirales={costo.lastRound.espirales}
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
            return (
              <PatternTile
                key={p.id}
                category={patternCategory(p.pattern_type)}
                state={isActive ? 'active' : 'latente'}
                name={PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}
                score={patternScore(p)}
                scoreSuffix="/100"
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

      {planSummary && (
        <PlanActiveCard
          title={planSummary.title}
          description={planSummary.description}
          status={planSummary.status}
          dots={planSummary.dots}
          correlationLine={
            planSummary.total > 0 ? (
              <>
                Aplicas el plan en <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace' }}>{planSummary.appliedPct}%</span> de las últimas <b style={{ color: 'var(--text)', fontWeight: 600 }}>{planSummary.total}</b> rondas con plan activo. <b style={{ color: 'var(--text)', fontWeight: 600 }}>El resto son donde la cabeza paga el precio.</b>
              </>
            ) : (
              <>Aún no registras rondas con este plan. La próxima cuenta.</>
            )
          }
        />
      )}

      {sessions.filter(s => s.id !== primarySessionId).length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono), monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Sesiones anteriores
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.filter(s => s.id !== primarySessionId).map(s => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 16px', textDecoration: 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{SESSION_LABELS[s.session_type] ?? s.session_type}</div>
                  {s.next_focus && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>Foco: {textoPlano(s.next_focus, 90)}</div>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' })}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConversarStickyCTA href={ctaHref} label={ctaLabel} />
    </div>
  )
}
