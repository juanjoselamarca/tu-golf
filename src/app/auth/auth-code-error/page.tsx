export default function AuthCodeErrorPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: 'var(--bg)', color: 'var(--text)', fontFamily: 'sans-serif'
    }}>
      <h1 style={{ color: '#8A6A16', fontSize: '2rem', marginBottom: '1rem' }}>
        Error de autenticación
      </h1>
      <p style={{ marginBottom: '2rem', color: 'var(--text-2)' }}>
        El enlace expiró o ya fue usado. Intenta iniciar sesión de nuevo.
      </p>
      <a href="/login" style={{
        background: '#c4992a', color: 'var(--brand-dark)', padding: '12px 24px',
        borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold'
      }}>
        Volver al login
      </a>
    </div>
  )
}
