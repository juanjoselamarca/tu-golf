// GWI del scramble: barra dividida con el % de ganar de cada equipo (2 equipos, en vivo). Gratis (decisión de Juanjo,
// 26-nov). Lo ve el espectador con sesión y, en un scramble de equipos de club, también el que entra con el link sin
// sesión; en otra ronda neto el anónimo no (`vistaVisor.soloBruto`: sería el % del gross). El modelo vive en `@/golf/stats/gwi-scramble`.
import { porcentajesDeGanarScramble, type EquipoGWIScramble } from '@/golf/stats/gwi-scramble'

export interface EquipoDelGwi extends EquipoGWIScramble {
  nombre: string
}

/** `equipos` en el orden de la tabla (el que va primero, a la izquierda). */
export function GwiScramble({ equipos, totalHoyos }: { equipos: readonly EquipoDelGwi[]; totalHoyos: number }) {
  if (equipos.length !== 2) return null
  const [a, b] = equipos
  const pct = porcentajesDeGanarScramble(a, b, totalHoyos)
  if (!pct) return null
  const [pa, pb] = pct
  const lado = (nombre: string, p: number, alinear: 'left' | 'right', lidera: boolean) => (
    <div style={{ minWidth: 0, textAlign: alinear }}>
      <div style={{
        fontFamily: '"DM Mono", monospace', fontSize: '30px', fontWeight: 700, lineHeight: 1,
        color: lidera ? 'var(--brand-on-bg)' : 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
      }}>
        {p}<span style={{ fontSize: '16px', marginLeft: '1px' }}>%</span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '6px', overflowWrap: 'anywhere' }}>
        {nombre}
      </div>
    </div>
  )
  return (
    <section
      aria-label={`Probabilidad de ganar: ${a.nombre} ${pa} %, ${b.nombre} ${pb} %`}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '14px 16px 16px', marginBottom: '12px',
      }}
    >
      <div aria-hidden style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand-on-bg)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.08em' }}>GWI&trade;</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Probabilidad de ganar</span>
      </div>
      <div aria-hidden style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'end' }}>
        {lado(a.nombre, pa, 'left', pa >= pb)}
        {lado(b.nombre, pb, 'right', pb > pa)}
      </div>
      <div aria-hidden style={{ display: 'flex', gap: '3px', height: '8px', marginTop: '12px' }}>
        <div style={{ width: `${pa}%`, background: pa >= pb ? 'var(--brand)' : 'var(--text-3)', borderRadius: '4px 0 0 4px', opacity: pa >= pb ? 1 : 0.45, transition: 'width .6s ease' }} />
        <div style={{ width: `${pb}%`, background: pb > pa ? 'var(--brand)' : 'var(--text-3)', borderRadius: '0 4px 4px 0', opacity: pb > pa ? 1 : 0.45, transition: 'width .6s ease' }} />
      </div>
    </section>
  )
}
