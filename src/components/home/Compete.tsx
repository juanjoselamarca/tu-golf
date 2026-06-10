import { HOME } from '@/content/home'
import CTAButton from './CTAButton'

/**
 * Sección "Compete" — torneos + leaderboard en vivo. Estático (Server Component).
 * El copy viene de `HOME.compete`; las filas del leaderboard son ilustrativas
 * (un torneo de ejemplo, no data real).
 */

type Row = { pos: string; name: string; thru: string; score: string; under?: boolean; lead?: boolean }

const ROWS: Row[] = [
  { pos: '1', name: 'Tomás Vidal', thru: 'H14', score: '−3', under: true, lead: true },
  { pos: '2', name: 'Matías Rojas', thru: 'H14', score: '−1', under: true },
  { pos: '3', name: 'Diego Soto', thru: 'H13', score: '+1' },
  { pos: '4', name: 'Andrés Court', thru: 'H14', score: '+2' },
]

export default function Compete() {
  const c = HOME.compete

  return (
    <section className="compete">
      <div className="cinner">
        <div className="ctxt rv">
          <span className="eyebrow"><span className="d" />{c.eyebrow}</span>
          <h2 className="display">
            {c.titleLine1} <span className="g">{c.titleLine2}</span>
          </h2>
          <p>{c.desc}</p>
          <CTAButton className="cl2" href="/demo" location="compete" target="demo">
            {c.cta}
            <svg className="ar" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </CTAButton>
        </div>

        <div className="lb rv">
          <div className="lbhd">
            <span className="lbt">{c.leaderboardTitle}</span>
            <span className="lblive"><span className="pdot" />{c.leaderboardLive}</span>
          </div>
          {ROWS.map((r) => (
            <div key={r.pos} className={`lbrow${r.lead ? ' lead' : ''}`}>
              <span className="pos">{r.pos}</span>
              <span className="nm">{r.name}</span>
              <span className="thru">{r.thru}</span>
              <span className={`sc${r.under ? ' under' : ''}`}>{r.score}</span>
            </div>
          ))}
          <div className="lbfoot">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbb188" strokeWidth="2">
              <path d="M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            {c.leaderboardFooter}
          </div>
        </div>
      </div>
    </section>
  )
}
