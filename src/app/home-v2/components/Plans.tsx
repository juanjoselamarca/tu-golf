import Link from 'next/link'
import { HOME } from '@/content/home'

/**
 * Sección "Planes" — teaser SIN precios (decisión PM: no casarse con CLP antes de
 * validar van Westendorp). Estático. Copy de `HOME.plans`. Gratis vs Pro destacada.
 */

const Check = () => (
  <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
)
const Arrow = () => (
  <svg className="ar" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)

export default function Plans() {
  const p = HOME.plans

  return (
    <section className="plans-sec">
      <div className="pinner">
        <div className="rv" style={{ textAlign: 'center', maxWidth: '50ch', margin: '0 auto' }}>
          <span className="eyebrow"><span className="d" />{p.eyebrow}</span>
          <h2
            className="display"
            style={{ fontWeight: 600, fontSize: 'clamp(28px,3.4vw,48px)', marginTop: 16, letterSpacing: '-0.02em', lineHeight: 1.02 }}
          >
            {p.titleLine1} <span style={{ color: 'var(--gold)' }}>{p.titleLine2}</span>
          </h2>
          <p style={{ fontSize: 'clamp(15px,1.4vw,17px)', color: 'var(--mute)', maxWidth: '46ch', margin: '16px auto 0', lineHeight: 1.55 }}>
            {p.subtitle}
          </p>
        </div>

        <div className="plans rv">
          {/* Gratis */}
          <div className="plan-c">
            <div className="pname">{p.free.name}</div>
            <div className="ptag">{p.free.tag}</div>
            <ul className="pl">
              {p.free.features.map((feat) => (
                <li key={feat}><Check />{feat}</li>
              ))}
            </ul>
            <Link className="ghost" href="/register">{p.free.cta}</Link>
          </div>

          {/* Pro (destacada) */}
          <div className="plan-c feat">
            <span className="plan-rib">{p.pro.ribbon}</span>
            <div className="pname">{p.pro.name}</div>
            <div className="ptag">{p.pro.tag}</div>
            <ul className="pl">
              {p.pro.features.map((feat) => (
                <li key={feat}><Check />{feat}</li>
              ))}
            </ul>
            <div className="trialhook">{p.pro.trialHook}</div>
            <Link className="commit" href="/register">
              {p.pro.cta}<span className="c"><Arrow /></span>
            </Link>
          </div>
        </div>

        <p className="plans-foot">{p.footer}</p>
      </div>
    </section>
  )
}
