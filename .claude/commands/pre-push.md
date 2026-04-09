Protocolo pre-push obligatorio de Golfers+ — ejecutar ANTES de cada push:

1. CODE REVIEW (skill: code-review)
   - Verificar compliance CLAUDE.md
   - Detectar bugs en cambios
   - Score >= 80 para reportar

2. SECURITY REVIEW (skill: security-guidance)
   - Escanear por SQL injection, XSS, auth flaws
   - Verificar RLS, service keys, datos sensibles
   - npm audit

3. VERIFICACIONES TÉCNICAS
   - npx tsc --noEmit (0 errores)
   - npm run test (todos pasan)
   - npm run build (exitoso)
   - grep force-dynamic en API routes con supabase/server

4. TEST E2E contra BD real
   - INSERT real en la tabla principal afectada
   - Verificar CHECK constraints
   - Limpiar datos de test

5. ARCHIVOS PROTEGIDOS
   - Si se tocó Navbar.tsx, layout.tsx, middleware.ts o supabase.ts:
     → Commit individual separado
     → Verificar patrones prohibidos

Reportar:
  CODE REVIEW: PASS/FAIL (N issues)
  SECURITY: PASS/FAIL (N vulnerabilidades)
  TSC: PASS/FAIL
  TESTS: N/N passed
  BUILD: PASS/FAIL
  E2E BD: PASS/FAIL
  PROTEGIDOS: OK / REQUIERE PROTOCOLO
  === LISTO PARA PUSH / BLOQUEADO ===
