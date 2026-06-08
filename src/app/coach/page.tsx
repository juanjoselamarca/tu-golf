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
import {
  calcularMentalIndex,
  calcularCostoPsicologico,
  clasificarHoyo,
  type MentalIndexResult,
  type MentalState,
} from '@/golf/coach/mental-index'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'
import { parPerHoleArray } from '@/golf/core/compare'

export const dynamic = 'force-dynamic'

interface Session {
  id: string
  session_type: string
  created_at: string
  next_focus: string | null
}

interface PatternRow {
  id: string
  pattern_type: string
  confidence: number
  data_points: number
  status: string
  first_detected: string
}

interface PlanRow {
  id: string
  pattern_id: string
  hypothesis: string
  rule: string
  status: string
  created_at: string
  duration_days: number
}

interface OutcomeRow {
  target_reached: boolean
  compliance: string
  played_at: string
}

interface RoundRow {
  id: string
  scores: (number | null)[] | null
  total_gross: number | null
  course_name: string | null
  // par_per_hole en BD es JSONB indexado por número de hoyo como string
  // ({"1":4,"2":4,...}), NO array posicional. Normalizar con parPerHoleArray
  // antes de iterar/reducir — ver src/golf/core/compare.ts.
  par_per_hole: Record<string, number> | null
  played_at: string
  course_rating: number | null
  slope_rating: number | null
  holes_played: number | null
}

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
  if (!user) redirect('/login?next=/coach')

  // Todas las queries en paralelo, server-side (sin waterfall de hidratación).
  const [sessionsRes, primaryRes, roundsRes, patternsRes, planRes, totalRes] = await Promise.all([
    supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('taiger_sessions').select('id').eq('user_id', user.id).eq('is_primary', true).maybeSingle(),
    supabase.from('historical_rounds').select('id, scores, total_gross, course_name, par_per_hole, played_at, course_rating, slope_rating, holes_played').eq('user_id', user.id).order('played_at', { ascending: false }).limit(10),
    supabase.from('player_patterns').select('id, pattern_type, confidence, data_points, status, first_detected').eq('user_id', user.id).in('status', ['active', 'monitoring']),
    supabase.from('coach_plans').select('id, pattern_id, hypothesis, rule, status, created_at, duration_days').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
    supabase.from('historical_rounds').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  let outcomes: OutcomeRow[] = []
  if (planRes.data) {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
    const outcomesRes = await supabase.from('plan_outcomes').select('target_reached, compliance, played_at').eq('plan_id', planRes.data.id).gte('played_at', fourWeeksAgo).order('played_at', { ascending: false })
    outcomes = (outcomesRes.data as OutcomeRow[]) || []
  }

  const sessions = (sessionsRes.data as Session[]) || []
  const primarySessionId = (primaryRes.data as { id: string } | null)?.id ?? null
  const rounds = (roundsRes.data as RoundRow[]) || []
  const patterns = (patternsRes.data as PatternRow[]) || []
  const plan = (planRes.data as PlanRow | null) ?? null
  const totalRounds = totalRes.count ?? 0

  if (totalRounds === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
        <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
        <div style={{ background: 'var(--coach-brass-soft)', border: '1px solid var(--coach-brass)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            Registra tu primera ronda para activar tu coach
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '14px', maxWidth: '340px', marginLeft: 'auto', marginRight: 'auto' }}>
            tAIger+ necesita conocer tu juego para hablarte con datos reales. Subí una tarjeta o juega una ronda libre y arrancamos la conversación.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/ronda-libre/nueva" style={{ display: 'inline-block', background: 'var(--coach-brass)', color: 'var(--bg)', fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none' }}>Nueva ronda</Link>
            <Link href="/perfil/historial" style={{ display: 'inline-block', background: 'transparent', color: 'var(--coach-brass)', fontWeight: 600, fontSize: '13px', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none', border: '1px solid var(--coach-brass)' }}>Importar historial</Link>
          </div>
        </div>
      </div>
    )
  }

  const cpi: ResultadoCPI | null = rounds.length >= 3
    ? calcularCPI(rounds.map(r => ({
        played_at: r.played_at,
        total_gross: r.total_gross ?? 0,
        course_rating: r.course_rating,
        slope_rating: r.slope_rating,
        holes_played: r.holes_played,
      })))
    : null

  const mentalIndex: MentalIndexResult = calcularMentalIndex({
    activePatterns: patterns.filter(p => p.status === 'active').map(p => ({ pattern_type: p.pattern_type, confidence: p.confidence })),
    activePlan: plan ? { id: plan.id } : null,
    outcomes,
    cpi,
    totalRounds,
    previousScore: null,
  })

  const hasActiveSpiralPattern = patterns.some(p => p.pattern_type === 'post_bogey_spiral' && p.status === 'active')
  // Costo Psicológico: TODO se calcula sobre UN solo universo (últimas 5 rondas).
  // Antes había mismatch: evitables sobre 8 rondas, promedios sobre 5 → "36" inflado
  // vs delta promedio. Ahora invariante: evitables === windowSize × (real − contenido).
  // Ver mental-index.ts:calcularCostoPsicologico para la lógica.
  const costoPsicologico = hasActiveSpiralPattern
    ? calcularCostoPsicologico(rounds.map(r => ({
        id: r.id,
        total_gross: r.total_gross,
        scores: r.scores ?? [],
        hole_pars: parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0) ?? null,
      })), 5)
    : null

  const recoveryTitle = mentalIndex.band === 'high' ? 'Tu cabeza está equilibrada' : mentalIndex.band === 'mid' ? 'Tu cabeza está bajo presión' : 'Tu cabeza necesita reset'
  const recoveryDesc = `Patrones activos: ${patterns.filter(p => p.status === 'active').length}. Adherencia: ${outcomes.length > 0 ? Math.round(outcomes.filter(o => o.target_reached).length / outcomes.length * 100) : 0}%.`

  const ctaHref = `/coach/sesion/${primarySessionId ?? 'nueva'}`
  const ctaLabel = primarySessionId ? 'Conversar con tAIger+' : 'Iniciar conversación con tAIger+'

  const lastRound = rounds[0]
  // par_per_hole viene como objeto JSONB {"1":4,...} — normalizar a array
  // ANTES de cualquier .reduce/.slice/.map. Sin esto, /coach crashea con
  // TypeError porque objetos no tienen .reduce.
  const lastRoundParArr: number[] | null = lastRound
    ? parPerHoleArray(lastRound.par_per_hole, lastRound.scores?.length ?? 0) ?? null
    : null
  const lastRoundParTotal = lastRoundParArr?.reduce((a, b) => a + b, 0) ?? 72
  let curvaStates: Array<MentalState | null> = []
  if (lastRound && lastRound.scores) {
    const roundForAnalysis = { id: lastRound.id, scores: lastRound.scores, hole_pars: lastRoundParArr }
    // length real (9 o 18) — evita estados null falsos para hoyos no jugados.
    curvaStates = Array.from({ length: lastRound.scores.length }, (_, i) => clasificarHoyo(roundForAnalysis, i))
  }
  const tiltCount = curvaStates.filter(s => s === 'tilt').length

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 0' }}>
      <div style={{ padding: '0 16px' }}>
        <TaigerHero subtitle={mentalIndex.band === 'low' ? 'Tu coach detectó algo importante esta semana' : mentalIndex.band === 'mid' ? 'Tu coach está leyendo tu juego' : 'Tu coach de rendimiento con inteligencia artificial'} />
      </div>

      <div style={{ padding: '12px 16px 0' }}>
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
            <span style={{ display: 'block', fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700 }}>
              Tu progreso
            </span>
            <span style={{ display: 'block', fontSize: '14px', color: 'var(--text)', fontWeight: 600, marginTop: '2px' }}>
              La bajada hacia tu meta
            </span>
          </span>
          <span style={{ color: 'var(--coach-brass)', fontSize: '18px' }} aria-hidden>→</span>
        </Link>
      </div>

      {mentalIndex.status !== 'insufficient_data' && (
        <MentalRecoveryCard
          score={mentalIndex.score}
          band={mentalIndex.band}
          delta={mentalIndex.delta}
          title={recoveryTitle}
          description={recoveryDesc}
        />
      )}

      {patterns.length > 0 && (
        <HighlightsCarousel label="Highlights · esta semana">
          {patterns.slice(0, 3).map(p => (
            <HighlightCard
              key={p.id}
              narrative={
                <>
                  El patrón <b style={{ color: 'var(--coach-recovery-low)', fontWeight: 600 }}>{PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}</b> apareció con confianza <b style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.round(p.confidence * 100)}%</b> sobre <b>{p.data_points}</b> rondas.
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

      {costoPsicologico && costoPsicologico.evitables > 0 && costoPsicologico.lastRound && (
        <CostoPsicologicoCard
          evitables={costoPsicologico.evitables}
          promedioReal={costoPsicologico.promedioReal}
          promedioContenido={costoPsicologico.promedioContenido}
          windowSize={costoPsicologico.windowSize}
          realScore={costoPsicologico.lastRound.realScore}
          ghostScore={costoPsicologico.lastRound.ghostScore}
          delta={costoPsicologico.lastRound.strokes_saved}
          holesAffected={costoPsicologico.lastRound.holes}
        />
      )}

      {lastRound && lastRound.scores && lastRoundParArr && (
        <CurvaMentalCard
          fecha={`Ronda ${new Date(lastRound.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'America/Santiago' })}`}
          curso={lastRound.course_name ?? 'la cancha'}
          totalScore={lastRound.total_gross ?? 0}
          overPar={(lastRound.total_gross ?? 0) - lastRoundParTotal}
          states={curvaStates}
          scores={lastRound.scores}
          hole_pars={lastRoundParArr}
          espirales={tiltCount}
        />
      )}

      {patterns.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '14px' }}>Patrones detectados</div>
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
                footMeta={`${p.data_points} rondas · ${Math.round(p.confidence * 100)}% conf`}
              />
            )
          })}
        </div>
      )}

      {plan && (
        <PlanActiveCard
          title={plan.hypothesis}
          description={plan.rule}
          status={plan.status as 'active' | 'resolved' | 'expired' | 'superseded' | 'cancelled'}
          dots={outcomes
            .slice(0, 7)
            .map(o => ({
              label: new Date(o.played_at).toLocaleDateString('es-CL', { day: '2-digit', timeZone: 'America/Santiago' }),
              state: o.target_reached ? 'on' as const : 'miss' as const,
            }))
            .reverse()
          }
          appliedRatio={outcomes.length > 0 ? outcomes.filter(o => o.target_reached).length / outcomes.length : 0}
          correlationLine={
            <>
              Aplicas el plan en <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: '"DM Mono", monospace' }}>{outcomes.length > 0 ? Math.round(outcomes.filter(o => o.target_reached).length / outcomes.length * 100) : 0}%</span> de las últimas <b style={{ color: 'var(--text)', fontWeight: 600 }}>{outcomes.length}</b> rondas con plan activo. <b style={{ color: 'var(--text)', fontWeight: 600 }}>El resto son donde la cabeza paga el precio.</b>
            </>
          }
        />
      )}

      {sessions.filter(s => s.id !== primarySessionId).length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Sesiones anteriores
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sessions.filter(s => s.id !== primarySessionId).map(s => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 16px', textDecoration: 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{SESSION_LABELS[s.session_type] ?? s.session_type}</div>
                  {s.next_focus && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>Foco: {s.next_focus}</div>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' })}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConversarStickyCTA href={ctaHref} label={ctaLabel} />
    </div>
  )
}
