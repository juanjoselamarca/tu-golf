# AUDIT DE HARDENING — Golfers+

**Fecha:** 24 Mar 2026
**Alcance:** Toda la app (39 API routes, 33 paginas, 13 librerias, middleware, RLS)

---

## RESUMEN EJECUTIVO

La app tiene buena base (auth, RLS en todas las tablas, secrets protegidos) pero crecio rapido
y acumulo deuda tecnica en validaciones, manejo de errores y edge cases. Se identificaron
**5 problemas criticos**, **8 altos** y **12 medios**.

---

## P0 — CRITICOS (riesgo de seguridad o perdida de datos)

### 1. API /push/send sin autenticacion
**Archivo:** `src/app/api/push/send/route.ts`
**Problema:** Cualquiera puede enviar push notifications a todos los usuarios sin autenticarse
**Impacto:** Spam, phishing, abuso
**Fix:** Agregar isAdmin check

### 2. API /admin/debug-auth sin admin check
**Archivo:** `src/app/api/admin/debug-auth/route.ts`
**Problema:** Endpoint expone datos de auth sin verificar que sea admin
**Impacto:** Information disclosure
**Fix:** Agregar isAdmin check o eliminar

### 3. RLS ronda_libre_jugadores — UPDATE sin verificar creador
**Archivo:** EJECUTAR_EN_SUPABASE.sql
**Problema:** Cualquier usuario autenticado puede actualizar scores si user_id=null
**Impacto:** Un usuario externo puede tomar control de un jugador anonimo
**Fix:** Agregar check de creador de la ronda en la policy

### 4. RLS hole_scores — UPDATE sin verificar estado del torneo
**Archivo:** supabase/migrations/001_initial_schema.sql
**Problema:** Jugador puede editar scores mientras round no sea confirmed/corrected,
sin importar si el torneo esta cerrado
**Impacto:** Manipulacion de scores post-torneo
**Fix:** Agregar check de round.status en la policy

### 5. CSP permite unsafe-inline y unsafe-eval
**Archivo:** next.config.js
**Problema:** Content Security Policy no bloquea scripts inline en produccion
**Impacto:** Vulnerabilidad XSS
**Fix:** Remover unsafe-inline/eval o usar nonces

---

## P1 — ALTOS (experiencia rota o datos incorrectos)

### 6. GWILeaderboard crash si 0 jugadores
**Archivo:** `src/components/GWILeaderboard.tsx` linea ~101
**Problema:** Accede sorted[0].nombre sin verificar que sorted no este vacio
**Fix:** Guard clause si sorted.length === 0

### 7. MiniLeaderboard division por cero
**Archivo:** `src/components/MiniLeaderboard.tsx` linea ~26
**Problema:** Si parMap vacio y totalHoles=0, parTotal=0
**Fix:** Guard parTotal > 0

### 8. Tournament score save sin feedback de error
**Archivo:** `src/app/torneo/[slug]/score/page.tsx` linea ~70
**Problema:** Si /api/game falla, usuario no sabe que scores no se guardaron
**Fix:** Agregar try/catch y toast de error

### 9. Missing HSTS header
**Archivo:** next.config.js
**Problema:** Sin Strict-Transport-Security, navegadores no fuerzan HTTPS
**Fix:** Agregar header

### 10. Navbar race condition con isAdmin
**Archivo:** `src/components/Navbar.tsx` linea ~26
**Problema:** isAdmin se setea async despues del render, estado puede quedar stale
**Fix:** Unificar query de user + role

### 11. Push VAPID key vacia no falla loud
**Archivo:** `src/lib/push-notifications.ts` linea ~46
**Problema:** Si VAPID_PUBLIC_KEY no esta seteada, usa string vacio y falla despues
**Fix:** Throw error early si key vacia

### 12. GWI winProbability sin clamp
**Archivo:** `src/lib/gwi.ts`
**Problema:** Probabilidad puede exceder 100% o ser negativa en edge cases
**Fix:** Math.max(0, Math.min(100, prob))

### 13. Import ronda: handicap negativo mal manejado
**Archivo:** `src/lib/import-round.ts` linea ~114
**Problema:** Plus handicap produce neto > gross sin warning
**Fix:** Validar y advertir

---

## P2 — MEDIOS (suboptimal pero no rompe)

### 14. localStorage JSON.parse sin try-catch (push-notifications)
### 15. Share card canvas sin error boundary
### 16. Analytics trackEvent falla silenciosamente
### 17. Score page: cualquier usuario puede scorear en ronda ajena (depende de RLS)
### 18. Admin auth check repetido 32 veces (deberia ser middleware)
### 19. Polling no se pausa cuando tab esta inactivo
### 20. Ronda libre codes enumerables (sin rate limit)
### 21. Profile data stale despues de admin edit
### 22. CPI trend invalido con < 5 rondas
### 23. Score-colors: bogey y eagle dificiles de distinguir en light mode
### 24. Import: matching de cancha por nombre parcial puede dar false positives
### 25. No audit logging para cambios de scores de jugadores

---

## POSITIVO (lo que esta bien)

- RLS habilitado en TODAS las tablas (27 verificadas)
- Service role key nunca expuesto al cliente
- No secrets hardcodeados en codigo fuente
- Browser client usa ANON key correctamente
- Auth helpers validan role per request
- Cookies con flags seguros (httpOnly, sameSite, secure)
- X-Frame-Options: DENY
- Cascade deletes en admin correctamente ordenados
- CSV parser maneja inyeccion
- Freemium limits en tAIger enforced
