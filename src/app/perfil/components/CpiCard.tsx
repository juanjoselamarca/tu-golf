import Link from 'next/link'
import { nivelCPI } from '@/golf/stats/cpi'
import { ChevronUp, ChevronDown } from '@/components/icons'
import type { ResultadoCPI } from '@/lib/data/perfil'
import { getCpiColor, getCpiLabel } from '../perfilFormat'

interface Props { cpiData: ResultadoCPI | null }

export function CpiCard({ cpiData }: Props) {
  if (!cpiData) return null

  // FIX (eng-review P0 + decisión Juanjo 08-jun): el original gateaba la card del
  // score con status === 'ok', valor que calcularCPI NUNCA devuelve → la card nunca
  // se mostraba a usuarios con rondas. Mapeo correcto:
  //   'insufficient_data' → card "Activa tu CPI"
  //   'provisional' | 'established' → card del SCORE
  if (cpiData.status === 'insufficient_data') {
    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(196,153,42,0.08) 0%, rgba(196,153,42,0.04) 100%)',
        border: '1px solid rgba(196,153,42,0.3)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '16px',
      }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '18px', color: '#c4992a', fontWeight: 700, marginBottom: '8px' }}>
          Activa tu CPI&trade;
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-2)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Necesitas 5+ rondas para activar tu CPI&trade;. Importa tus rondas hist&oacute;ricas para calcular tu &iacute;ndice de rendimiento.
        </p>
        <Link href="/importar" style={{
          display: 'inline-flex', alignItems: 'center',
          background: '#c4992a', color: 'var(--brand-dark)',
          padding: '10px 20px', borderRadius: '12px',
          fontSize: '14px', fontWeight: 700,
          textDecoration: 'none',
        }}>
          Importar historial &rarr;
        </Link>
      </div>
    )
  }

  // provisional | established → card del score.
  const isProvisional = cpiData.status === 'provisional'
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid rgba(196,153,42,0.22)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: '#c4992a', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>CPI&trade;</span>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>
          {nivelCPI(cpiData.score)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', marginBottom: '10px' }}>
        <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '36px', fontWeight: 700, color: getCpiColor(cpiData.score), lineHeight: 1 }}>
          {cpiData.score.toFixed(1)}
        </span>
        <span style={{
          background: `${getCpiColor(cpiData.score)}20`,
          color: getCpiColor(cpiData.score),
          padding: '3px 10px',
          borderRadius: '999px',
          fontSize: '12px',
          fontWeight: 600,
        }}>
          {getCpiLabel(cpiData.score)}
        </span>
        {cpiData.trend !== 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '14px', fontWeight: 600, color: cpiData.trend > 0 ? '#16a34a' : '#dc2626' }}>
            {cpiData.trend > 0 ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
            {cpiData.trend > 0 ? '+' : ''}{cpiData.trend.toFixed(1)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <div style={{ flex: 1, height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, cpiData.score))}%`, height: '100%', background: `linear-gradient(90deg, ${getCpiColor(cpiData.score)}cc, ${getCpiColor(cpiData.score)})`, borderRadius: '3px', transition: 'width 0.6s ease' }} />
        </div>
        <span style={{ fontSize: '12px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          {cpiData.rondas_usadas} rondas{isProvisional ? ' · provisional' : ''}
        </span>
      </div>
    </div>
  )
}
