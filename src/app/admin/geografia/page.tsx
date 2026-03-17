'use client'

const card = {
  background: '#0a1628',
  border: '1px solid #132540',
  borderRadius: '12px',
  padding: '24px',
}

export default function GeografiaPage() {
  return (
    <div style={{ padding: '32px', maxWidth: 1200, margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'var(--font-playfair), serif',
          fontSize: '2.5rem',
          color: '#c4992a',
          marginBottom: '8px',
        }}
      >
        Geografía
      </h1>
      <p style={{ color: '#7a8fa8', marginBottom: '32px' }}>
        Distribución geográfica de usuarios y canchas
      </p>

      {/* Distribución por país */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          Distribución por país
        </h2>
        <div style={card}>
          <p style={{ color: '#7a8fa8', marginBottom: '20px', fontSize: '0.95rem' }}>
            La mayoría de los usuarios son de Chile. Distribución detallada disponible
            cuando haya datos de más países.
          </p>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <span style={{ color: '#edeae4', fontSize: '1rem' }}>Chile 🇨🇱</span>
              <span style={{ color: '#c4992a', fontWeight: 600 }}>100%</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '12px',
                background: '#132540',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(90deg, #c4992a, #e6b94d)',
                  borderRadius: '6px',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Top canchas más usadas */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          Top canchas más usadas
        </h2>
        <div style={card}>
          <p style={{ color: '#7a8fa8', fontSize: '0.95rem' }}>
            Las canchas más populares aparecerán aquí basadas en torneos y rondas registradas.
          </p>
          <div
            style={{
              marginTop: '20px',
              padding: '24px',
              border: '1px dashed #132540',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <span style={{ color: '#7a8fa8', fontSize: '0.9rem' }}>
              Sin datos suficientes aún
            </span>
          </div>
        </div>
      </section>

      {/* Canchas sin datos completos */}
      <section>
        <h2
          style={{
            fontFamily: 'var(--font-playfair), serif',
            fontSize: '1.5rem',
            color: '#edeae4',
            marginBottom: '16px',
          }}
        >
          Canchas sin datos completos
        </h2>
        <div style={card}>
          <p style={{ color: '#7a8fa8', fontSize: '0.95rem', marginBottom: '4px' }}>
            Canchas sin stroke_index — GWI y neto no disponibles para estas canchas.
          </p>
          <p style={{ color: '#7a8fa8', fontSize: '0.95rem' }}>
            Información disponible próximamente.
          </p>
          <div
            style={{
              marginTop: '20px',
              padding: '24px',
              border: '1px dashed #132540',
              borderRadius: '8px',
              textAlign: 'center',
            }}
          >
            <span style={{ color: '#7a8fa8', fontSize: '0.9rem' }}>
              Sin datos suficientes aún
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
