import { HOME } from '@/content/home'

/**
 * Sección "El coach tAIger+" — 3 pasos (Registra → Encuentra tu fuga → Te da el plan).
 * Estático (Server Component). El copy viene de `HOME.coach`; los mini-visuales son
 * fixtures ilustrativos (chips de fuente, barras F9/B9, tarjeta de plan).
 */

// Iconos de las fuentes de registro (paso 1). Line icons finos, dorados — DESIGN.md.
const SOURCE_ICON: Record<string, JSX.Element> = {
  'En vivo': (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.6" fill="#e7b94c" stroke="none" />
    </svg>
  ),
  Foto: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M8 7l1.5-2h5L16 7" />
    </svg>
  ),
  Smartwatch: (
    <svg viewBox="0 0 24 24">
      <rect x="7" y="3" width="10" height="18" rx="3" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  ),
}

export default function CoachSteps() {
  const c = HOME.coach
  const [step1, step2, step3] = c.steps

  return (
    <section className="pro" id="coach">
      <div className="pinner">
        <div className="rv">
          <div style={{ textAlign: 'center', maxWidth: '52ch', margin: '0 auto' }}>
            <span className="eyebrow"><span className="d" />{c.eyebrow}</span>
            <h2 className="display" style={{ marginInline: 'auto' }}>
              {c.titleLine1} <span className="g">{c.titleLine2}</span>
            </h2>
            <p className="psub" style={{ marginInline: 'auto' }}>{c.subtitle}</p>
          </div>
        </div>

        <div className="steps3 rv">
          {/* Paso 1 — Registra tu ronda */}
          <div className="s3">
            <div className="s3n">1</div>
            <div className="s3viz">
              <div className="ins">
                {step1.chips?.map((chip) => (
                  <span key={chip}>{SOURCE_ICON[chip]}{chip}</span>
                ))}
              </div>
            </div>
            <h3>{step1.title}</h3>
            <p>{step1.desc}</p>
          </div>

          {/* Paso 2 — Encuentra tu fuga */}
          <div className="s3">
            <div className="s3n">2</div>
            <div className="s3viz">
              <div className="cmp">
                <div className="cl"><span>F9</span><i style={{ width: '38%' }} /></div>
                <div className="cl"><span>B9</span><i className="bad" style={{ width: '74%' }} /><b>+2</b></div>
              </div>
            </div>
            <h3>{step2.title}</h3>
            <p>{step2.desc}</p>
          </div>

          {/* Paso 3 — Te da tu plan */}
          <div className="s3">
            <div className="s3n">3</div>
            <div className="s3viz">
              <div className="plancard">
                <div className="pt">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e7b94c" strokeWidth="2.4">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {step3.planLabel}
                </div>
                <div className="pm">{step3.planMeta}</div>
              </div>
            </div>
            <h3>{step3.title}</h3>
            <p>{step3.desc}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
