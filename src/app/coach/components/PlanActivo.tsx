import { PlanActiveCard } from '@/components/coach/PlanActiveCard'
import type { ActivePlanSummary } from '@/golf/coach/intro'

/** Card "Tu plan activo" de /coach, con su línea de correlación. */
export function PlanActivo({ plan }: { plan: ActivePlanSummary }) {
  return (
    <PlanActiveCard
      title={plan.title}
      description={plan.description}
      status={plan.status}
      dots={plan.dots}
      correlationLine={
        plan.total > 0 ? (
          <>
            Aplicas el plan en <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: 'var(--font-dm-mono), monospace' }}>{plan.appliedPct}%</span> de las últimas <b style={{ color: 'var(--text)', fontWeight: 600 }}>{plan.total}</b> rondas con plan activo. <b style={{ color: 'var(--text)', fontWeight: 600 }}>El resto son donde la cabeza paga el precio.</b>
          </>
        ) : (
          <>Aún no registras rondas con este plan. La próxima cuenta.</>
        )
      }
    />
  )
}
