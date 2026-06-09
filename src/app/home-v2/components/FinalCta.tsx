import Link from 'next/link'
import { HOME } from '@/content/home'

/**
 * CTA final — fórmula CRO (titular + 3 pasos + doble CTA + proofbar).
 * "+180" es un piso honesto y durable: hoy hay 182 canchas activas en el catálogo
 * y el número solo crece (ver auditoría de canchas, 8-jun). Estático a propósito
 * para mantener un único número coherente en todo el landing.
 */

const Arrow = () => (
  <svg className="ar" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

export default function FinalCta() {
  const c = HOME.cta

  return (
    <section className="cta" id="cta">
      <span className="eyebrow"><span className="d" />{c.eyebrow}</span>
      <h2 className="display">
        {c.titleLine1} <span className="g">{c.titleLine2}</span>
      </h2>

      <div className="steps">
        {c.steps.map((s) => (
          <div className="step" key={s.num}>
            <div className="num">{s.num}</div>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="row">
        <Link className="commit" href="/register">
          {c.ctaPrimary}<span className="c"><Arrow /></span>
        </Link>
        <Link className="ghost" href="/demo">{c.ctaSecondary}</Link>
      </div>
      <p className="risk">{c.risk}</p>

      <div className="proofbar">
        <div className="pi"><span className="n mono">+180</span><span className="t">{c.proof.coursesLabel}</span></div>
        <div className="pi"><span className="n mono">100%</span><span className="t">{c.proof.freeLabel}</span></div>
        <div className="pi"><span className="t" style={{ fontSize: 13, color: 'var(--gold-ant)' }}>{c.proof.madeIn}</span></div>
      </div>
    </section>
  )
}
