'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
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
  strokesEvitables,
  clasificarHoyo,
  type MentalIndexResult,
  type MentalState,
} from '@/golf/coach/mental-index'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'

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
  par_per_hole: number[] | null
  played_at: string
  course_rating: number | null
  slope_rating: number | null
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
  driving_inconsistency: 'Inconsistencia con driver',
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

interface PageState {
  sessions: Session[]
  primarySessionId: string | null
  rounds: RoundRow[]
  patterns: PatternRow[]
  plan: PlanRow | null
  outcomes: OutcomeRow[]
  totalRounds: number
  loading: boolean
  error: string | null
}

export default function CoachDashboard() {
  const router = useRouter()
  const [state, setState] = useState<PageState>({
    sessions: [], primarySessionId: null, rounds: [], patterns: [], plan: null, outcomes: [],
    totalRounds: 0, loading: true, error: null,
  })

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?next=/coach'); return }

      try {
        const [sessionsRes, primaryRes, roundsRes, patternsRes, planRes, totalRes] = await Promise.all([
          supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('taiger_sessions').select('id').eq('user_id', user.id).eq('is_primary', true).maybeSingle(),
          supabase.from('historical_rounds').select('id, scores, total_gross, course_name, par_per_hole, played_at, course_rating, slope_rating').eq('user_id', user.id).order('played_at', { ascending: false }).limit(10),
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

        setState({
          sessions: (sessionsRes.data as Session[]) || [],
          primarySessionId: (primaryRes.data as { id: string } | null)?.id ?? null,
          rounds: (roundsRes.data as RoundRow[]) || [],
          patterns: (patternsRes.data as PatternRow[]) || [],
          plan: (planRes.data as PlanRow | null) ?? null,
          outcomes,
          totalRounds: totalRes.count ?? 0,
          loading: false,
          error: null,
        })
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error cargando coach' }))
      }
    }
    load()
  }, [router])

  if (state.loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px', animation: 'tpulse 1.5s ease infinite', color: 'var(--coach-brass)' }}><TaigerIcon size={48} /></div>
          <div style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: 600 }}>Cargando tAIger+...</div>
          <style>{`@keyframes tpulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>
        <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
        <div style={{ background: 'var(--coach-recovery-low-soft)', border: '1px solid var(--coach-recovery-low)', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--coach-recovery-low)', fontWeight: 600, marginBottom: '6px' }}>No pude cargar tu data</div>
          <div style={{ color: 'var(--text-2)', fontSize: '13px' }}>{state.error}</div>
        </div>
      </div>
    )
  }

  if (state.totalRounds === 0) {
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

  const cpi: ResultadoCPI | null = state.rounds.length >= 3
    ? calcularCPI(state.rounds.map(r => ({
        played_at: r.played_at,
        total_gross: r.total_gross ?? 0,
        course_rating: r.course_rating,
        slope_rating: r.slope_rating,
      })))
    : null

  const mentalIndex: MentalIndexResult = calcularMentalIndex({
    activePatterns: state.patterns.filter(p => p.status === 'active').map(p => ({ pattern_type: p.pattern_type, confidence: p.confidence })),
    activePlan: state.plan ? { id: state.plan.id } : null,
    outcomes: state.outcomes,
    cpi,
    totalRounds: state.totalRounds,
    previousScore: null,
  })

  const hasActiveSpiralPattern = state.patterns.some(p => p.pattern_type === 'post_bogey_spiral' && p.status === 'active')
  const evitables = hasActiveSpiralPattern
    ? strokesEvitables(state.rounds.slice(0, 8).map(r => ({ id: r.id, scores: r.scores ?? [], hole_pars: r.par_per_hole })))
    : null

  const recoveryTitle = mentalIndex.band === 'high' ? 'Tu cabeza está equilibrada' : mentalIndex.band === 'mid' ? 'Tu cabeza está bajo presión' : 'Tu cabeza necesita reset'
  const recoveryDesc = `Patrones activos: ${state.patterns.filter(p => p.status === 'active').length}. Adherencia: ${state.outcomes.length > 0 ? Math.round(state.outcomes.filter(o => o.target_reached).length / state.outcomes.length * 100) : 0}%.`

  const ctaHref = `/coach/sesion/${state.primarySessionId ?? 'nueva'}`
  const ctaLabel = state.primarySessionId ? 'Conversar con tAIger+' : 'Iniciar conversación con tAIger+'

  const lastRound = state.rounds[0]
  const lastRoundParTotal = lastRound?.par_per_hole?.reduce((a, b) => a + b, 0) ?? 72
  let curvaStates: Array<MentalState | null> = []
  if (lastRound && lastRound.scores) {
    const roundForAnalysis = { id: lastRound.id, scores: lastRound.scores, hole_pars: lastRound.par_per_hole }
    // length real (9 o 18) — evita estados null falsos para hoyos no jugados.
    curvaStates = Array.from({ length: lastRound.scores.length }, (_, i) => clasificarHoyo(roundForAnalysis, i))
  }
  const tiltCount = curvaStates.filter(s => s === 'tilt').length

  // CostoPsicológicoCard: derivamos strokes ahorrados por ronda — denominador consistente
  // (antes: evitables.total agregaba hasta 8 rondas, se dividía por 5 hardcodeado).
  const fiveRounds = state.rounds.slice(0, 5)
  const fiveRealAvg = fiveRounds.length > 0
    ? fiveRounds.reduce((a, r) => a + (r.total_gross ?? 0), 0) / fiveRounds.length
    : 0
  const fiveSaved = evitables
    ? fiveRounds.reduce((sum, r) => sum + (evitables.instances.find(i => i.round_id === r.id)?.strokes_saved ?? 0), 0)
    : 0
  const fiveContainedAvg = fiveRounds.length > 0
    ? fiveRealAvg - fiveSaved / fiveRounds.length
    : 0
  const lastRoundInstance = evitables?.instances.find(i => i.round_id === lastRound?.id)
  const lastRoundSaved = lastRoundInstance?.strokes_saved ?? 0
  const lastRoundHoles = lastRoundInstance?.holes ?? []

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 0' }}>
      <div style={{ padding: '0 16px' }}>
        <TaigerHero subtitle={mentalIndex.band === 'low' ? 'Tu coach detectó algo importante esta semana' : mentalIndex.band === 'mid' ? 'Tu coach está leyendo tu juego' : 'Tu coach de rendimiento con inteligencia artificial'} />
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

      {state.patterns.length > 0 && (
        <HighlightsCarousel label="Highlights · esta semana">
          {state.patterns.slice(0, 3).map(p => (
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

      {evitables && evitables.total > 0 && lastRound && lastRoundHoles.length > 0 && (
        <CostoPsicologicoCard
          evitables={evitables.total}
          promedioReal={fiveRealAvg}
          promedioContenido={fiveContainedAvg}
          realScore={lastRound.total_gross ?? 0}
          ghostScore={(lastRound.total_gross ?? 0) - lastRoundSaved}
          delta={lastRoundSaved}
          holesAffected={lastRoundHoles}
        />
      )}

      {lastRound && lastRound.scores && lastRound.par_per_hole && (
        <CurvaMentalCard
          fecha={`Ronda ${new Date(lastRound.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`}
          curso={lastRound.course_name ?? 'la cancha'}
          totalScore={lastRound.total_gross ?? 0}
          overPar={(lastRound.total_gross ?? 0) - lastRoundParTotal}
          states={curvaStates}
          scores={lastRound.scores}
          hole_pars={lastRound.par_per_hole}
          espirales={tiltCount}
        />
      )}

      {state.patterns.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '14px' }}>Patrones detectados</div>
          {state.patterns.map(p => {
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

      {state.plan && (
        <PlanActiveCard
          title={state.plan.hypothesis}
          description={state.plan.rule}
          status={state.plan.status as 'active' | 'resolved' | 'expired' | 'superseded' | 'cancelled'}
          dots={state.outcomes
            .slice(0, 7)
            .map(o => ({
              label: String(new Date(o.played_at).getDate()).padStart(2, '0'),
              state: o.target_reached ? 'on' as const : 'miss' as const,
            }))
            .reverse()
          }
          appliedRatio={state.outcomes.length > 0 ? state.outcomes.filter(o => o.target_reached).length / state.outcomes.length : 0}
          correlationLine={
            <>
              Aplicas el plan en <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: '"DM Mono", monospace' }}>{state.outcomes.length > 0 ? Math.round(state.outcomes.filter(o => o.target_reached).length / state.outcomes.length * 100) : 0}%</span> de las últimas <b style={{ color: 'var(--text)', fontWeight: 600 }}>{state.outcomes.length}</b> rondas con plan activo. <b style={{ color: 'var(--text)', fontWeight: 600 }}>El resto son donde la cabeza paga el precio.</b>
            </>
          }
        />
      )}

      {state.sessions.filter(s => s.id !== state.primarySessionId).length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Sesiones anteriores
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {state.sessions.filter(s => s.id !== state.primarySessionId).map(s => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 16px', textDecoration: 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{SESSION_LABELS[s.session_type] ?? s.session_type}</div>
                  {s.next_focus && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>Foco: {s.next_focus}</div>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConversarStickyCTA href={ctaHref} label={ctaLabel} />
    </div>
  )
}
