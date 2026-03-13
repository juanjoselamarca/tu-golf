export default function AuthCodeErrorPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh',
      background: '#070d18', color: '#edeae4', fontFamily: 'sans-serif'
    }}>
      <h1 style={{ color: '#c4992a', fontSize: '2rem', marginBottom: '1rem' }}>
        Error de autenticación
      </h1>
      <p style={{ marginBottom: '2rem', color: '#7a8fa8' }}>
        El enlace expiró o ya fue usado. Intenta iniciar sesión de nuevo.
      </p>
      <a href="/login" style={{
        background: '#c4992a', color: '#070d18', padding: '12px 24px',
        borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold'
      }}>
        Volver al login
      </a>
    </div>
  )
}
