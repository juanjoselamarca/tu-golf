'use client'

import Link from 'next/link'

const S = {
  page: {
    background: 'var(--bg)',
    minHeight: '100vh',
    padding: '24px 16px 80px',
  } as React.CSSProperties,
  container: {
    maxWidth: 680,
    margin: '0 auto',
  } as React.CSSProperties,
  banner: {
    background: 'rgba(200,165,90,0.10)',
    border: '1px solid rgba(200,165,90,0.25)',
    borderRadius: 8,
    padding: '10px 16px',
    marginBottom: 32,
    textAlign: 'center' as const,
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 13,
    color: 'var(--gold)',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  date: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: 11,
    color: 'var(--text-3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 8,
  } as React.CSSProperties,
  h1: {
    fontFamily: 'var(--font-playfair), serif',
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ivory)',
    marginBottom: 32,
    lineHeight: 1.3,
  } as React.CSSProperties,
  h2: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--gold)',
    marginTop: 36,
    marginBottom: 12,
  } as React.CSSProperties,
  body: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
  } as React.CSSProperties,
  separator: {
    borderTop: '1px solid rgba(200,165,90,0.18)',
    margin: '36px 0',
  } as React.CSSProperties,
  link: {
    color: 'var(--brand)',
    textDecoration: 'underline',
  } as React.CSSProperties,
  list: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
    paddingLeft: 24,
  } as React.CSSProperties,
}

export default function PrivacidadPage() {
  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={S.banner}>
          Documento pendiente de revisi&oacute;n legal profesional
        </div>

        <p style={S.date}>Vigente desde 29 marzo 2026</p>
        <h1 style={S.h1}>Pol&iacute;tica de Privacidad</h1>

        <p style={S.body}>
          Esta pol&iacute;tica describe c&oacute;mo Golfers+ recopila, usa y protege la informaci&oacute;n personal
          de sus usuarios, en conformidad con la Ley 19.628 sobre Protecci&oacute;n de la Vida Privada de Chile.
        </p>

        <h2 style={S.h2}>1. Responsable del tratamiento</h2>
        <p style={S.body}>
          Juan Jos&eacute; Lamarca / Golfers+, con domicilio en Santiago, Chile. Contacto:{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>2. Datos que recopilamos</h2>
        <p style={S.body}>Recopilamos los siguientes datos proporcionados por el usuario:</p>
        <ul style={S.list}>
          <li>Nombre y correo electr&oacute;nico (registro de cuenta).</li>
          <li>Scores de golf y datos de rondas.</li>
          <li>Handicap index.</li>
          <li>Datos de uso de la aplicaci&oacute;n (p&aacute;ginas visitadas, funciones utilizadas).</li>
        </ul>

        <h2 style={S.h2}>3. Datos que NO recopilamos</h2>
        <ul style={S.list}>
          <li>Datos de pago o informaci&oacute;n financiera.</li>
          <li>Ubicaci&oacute;n GPS.</li>
          <li>Datos de salud.</li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>4. Base legal</h2>
        <p style={S.body}>
          El tratamiento de datos personales se realiza con el consentimiento expreso del usuario al registrarse
          en la plataforma, conforme al Art&iacute;culo 4 de la Ley 19.628.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>5. Compartici&oacute;n de datos con terceros</h2>
        <p style={S.body}>
          Para operar la plataforma, compartimos datos con los siguientes proveedores de infraestructura,
          todos bajo cl&aacute;usulas contractuales de protecci&oacute;n de datos:
        </p>
        <ul style={S.list}>
          <li><strong>Supabase Inc.</strong> (Estados Unidos) &mdash; Base de datos y autenticaci&oacute;n.</li>
          <li><strong>Vercel Inc.</strong> (Estados Unidos) &mdash; Hosting y despliegue de la aplicaci&oacute;n.</li>
          <li><strong>Anthropic PBC</strong> (Estados Unidos) &mdash; Motor de IA para tAIger+.</li>
        </ul>
        <p style={{ ...S.body, fontWeight: 600 }}>
          Golfers+ NO vende datos personales a anunciantes ni a terceros con fines comerciales.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>6. Retenci&oacute;n de datos</h2>
        <p style={S.body}>
          Los datos personales se conservan mientras la cuenta del usuario est&eacute; activa. Tras una solicitud
          de eliminaci&oacute;n, los datos ser&aacute;n eliminados en un plazo m&aacute;ximo de 30 d&iacute;as h&aacute;biles.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>7. Derechos del usuario (Art. 12 Ley 19.628)</h2>
        <p style={S.body}>Todo usuario tiene derecho a:</p>
        <ul style={S.list}>
          <li><strong>Acceso:</strong> conocer qu&eacute; datos personales almacenamos.</li>
          <li><strong>Rectificaci&oacute;n:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong>Cancelaci&oacute;n:</strong> solicitar la eliminaci&oacute;n de sus datos personales.</li>
        </ul>
        <p style={S.body}>
          Para ejercer estos derechos, enviar un correo a{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>{' '}
          con el asunto &ldquo;DATOS PERSONALES&rdquo;. Responderemos en un plazo m&aacute;ximo de 15 d&iacute;as h&aacute;biles.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>8. Cookies</h2>
        <p style={S.body}>
          Golfers+ utiliza &uacute;nicamente cookies t&eacute;cnicas necesarias para el funcionamiento de la plataforma
          (autenticaci&oacute;n y sesi&oacute;n). No utilizamos cookies publicitarias ni de seguimiento de terceros.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>9. Reclamos</h2>
        <p style={S.body}>
          Si considera que sus derechos han sido vulnerados, puede presentar un reclamo ante el{' '}
          <strong>SERNAC</strong> (Servicio Nacional del Consumidor) o ante los tribunales ordinarios de
          Santiago de Chile.
        </p>

        <div style={S.separator} />

        <p style={{ ...S.body, color: 'var(--text-3)', marginTop: 24 }}>
          &Uacute;ltima actualizaci&oacute;n: 29 de marzo de 2026
        </p>

        <p style={{ ...S.body, marginTop: 8 }}>
          <Link href="/terminos" style={S.link}>T&eacute;rminos y Condiciones</Link>
          {' · '}
          <Link href="/reembolsos" style={S.link}>Pol&iacute;tica de Reembolsos</Link>
        </p>
      </div>
    </div>
  )
}
