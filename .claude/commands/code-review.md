Ejecutar code review completo del código modificado en esta sesión:

1. Listar archivos modificados: git diff --name-only HEAD
2. Para cada archivo modificado, verificar:
   - Compliance con CLAUDE.md (force-dynamic, archivos protegidos, patrones prohibidos)
   - Bugs obvios en los cambios
   - Contexto de git blame/historial
3. Puntuar cada issue encontrado de 0-100
4. Solo reportar issues con score >= 80
5. Verificar reglas específicas de Golfers+:
   - API routes con createClient DEBEN tener export const dynamic = 'force-dynamic'
   - Navbar.tsx: NO onAuthStateChange(async, NO async function en useEffect de auth
   - Archivos protegidos (Navbar, layout, middleware, supabase.ts) requieren protocolo completo
   - ModoJuego debe incluir match_play_neto en todos los switch/Record
6. Ejecutar: npx tsc --noEmit && npm run test

Reportar en formato:
  ISSUES ENCONTRADOS: N (score >= 80)
  [lista de issues con archivo:linea, descripción, score]
  COMPLIANCE CLAUDE.md: OK/FAIL
  TypeScript: OK/FAIL
  Tests: OK/FAIL
  VEREDICTO: LISTO PARA PUSH / REQUIERE FIXES
