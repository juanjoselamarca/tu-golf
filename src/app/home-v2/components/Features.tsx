import { HOME } from '@/content/home'

/**
 * Sección "Lo que necesitas" — grid 2×2, cada feature con su mini-visual.
 * Estático (Server Component). Copy de `HOME.features`; los números de los
 * visuales (índices, ratings de cancha, sparkline) son ilustrativos.
 */

// Canchas de ejemplo para el visual de la card 03 (ilustrativo, no data real).
const SAMPLE_COURSES = [
  { name: 'C.G. Los Leones', rating: 'CR 72.1 · 130' },
  { name: 'C.G. Sport Francés', rating: 'CR 71.4 · 128' },
  { name: 'C.G. Prince of Wales', rating: 'CR 73.0 · 134' },
]

export default function Features() {
  const f = HOME.features
  const [dual, importar, canchas, historial] = f.items

  return (
    <section className="feats-sec">
      <div className="pinner">
        <div className="rv" style={{ textAlign: 'center', maxWidth: '50ch', margin: '0 auto 42px' }}>
          <span className="eyebrow"><span className="d" />{f.eyebrow}</span>
          <h2
            className="display"
            style={{ fontWeight: 600, fontSize: 'clamp(28px,3.2vw,46px)', marginTop: 16, letterSpacing: '-0.02em', lineHeight: 1.02 }}
          >
            {f.titleLine1} <span style={{ color: 'var(--gold)' }}>{f.titleLine2}</span>
          </h2>
        </div>

        <div className="feats rv">
          {/* 01 · Índice Dual */}
          <div className="ft">
            <div className="fn">{dual.kicker}</div>
            <div className="ftviz vdual">
              <div className="dt"><span className="dl">{dual.vizOfficial}</span><span className="dn">12.4</span></div>
              <div className="dt hot"><span className="dl">{dual.vizReal}</span><span className="dn">9.8</span></div>
            </div>
            <h3>{dual.title}</h3>
            <p>{dual.desc}</p>
          </div>

          {/* 02 · Importación guiada */}
          <div className="ft">
            <div className="fn">{importar.kicker}</div>
            <div className="ftviz">
              <div className="srcs">
                <span className="src">
                  <svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="12" cy="13" r="3" /><path d="M8 7l1.5-2h5L16 7" /></svg>
                  Foto
                </span>
                <span className="src">
                  <svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="3" /><circle cx="12" cy="12" r="2.4" /></svg>
                  Smartwatch
                </span>
                <span className="src">CSV</span>
              </div>
              <div className="readrow">
                <span>4</span><span>5</span><span className="b">3</span><span>4</span><span>6</span><span className="b">4</span><span>5</span><span>3</span><span>4</span>
              </div>
            </div>
            <h3>{importar.title}</h3>
            <p>{importar.desc}</p>
          </div>

          {/* 03 · 137 canchas FedeGolf */}
          <div className="ft">
            <div className="fn">{canchas.kicker}</div>
            <div className="ftviz courses">
              {SAMPLE_COURSES.map((co) => (
                <div className="crow" key={co.name}>
                  <span className="cn">{co.name}</span>
                  <span className="crr">{co.rating}</span>
                </div>
              ))}
            </div>
            <h3>{canchas.title}</h3>
            <p>{canchas.desc}</p>
          </div>

          {/* 04 · Historial que progresa */}
          <div className="ft">
            <div className="fn">{historial.kicker}</div>
            <div className="ftviz">
              <div className="trendlbl"><span>{historial.vizLabel}</span><span className="dn2">18.2 → 12.4</span></div>
              <svg className="spark" viewBox="0 0 240 60" preserveAspectRatio="none">
                <polyline points="6,14 40,22 74,18 108,30 142,28 176,40 210,38 234,50" />
                <circle cx="6" cy="14" r="3" /><circle cx="234" cy="50" r="3.6" />
              </svg>
            </div>
            <h3>{historial.title}</h3>
            <p>{historial.desc}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
