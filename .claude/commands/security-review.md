Ejecutar revisión de seguridad completa de Golfers+:

1. Escanear todos los archivos modificados (git diff --name-only HEAD) por:
   - SQL injection (queries dinámicas sin parametrizar)
   - XSS (innerHTML, dangerouslySetInnerHTML, user input sin sanitizar)
   - Auth flaws (rutas sin verificación de usuario, RLS bypass)
   - Data exposure (service role key en client-side, secrets en código)
   - Insecure data handling (PII sin encriptar, tokens en localStorage)

2. Verificar configuración de Supabase:
   - RLS activo en todas las tablas con datos de usuario
   - Service role key NUNCA expuesta en código client-side
   - SUPABASE_ACCESS_TOKEN solo en .env.local (gitignored)
   - API routes validan auth antes de operar

3. Verificar dependencias:
   - npm audit (vulnerabilidades conocidas)

4. Datos sensibles de Golfers+:
   - profiles (email, nombre, handicap)
   - player_psych_profile (respuestas psicológicas del tAIger)
   - taiger_sessions (conversaciones privadas)
   - push_subscriptions (tokens de notificación)

Reportar en formato:
  VULNERABILIDADES CRÍTICAS: N
  VULNERABILIDADES MEDIAS: N
  VULNERABILIDADES BAJAS: N
  [lista con severidad, archivo:linea, descripción, fix recomendado]
  VEREDICTO: SEGURO / REQUIERE FIXES ANTES DE PUSH
