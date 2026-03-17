# Auditoria Seguridad

Fecha: 2026-03-17
Estado: diagnostico

## Hallazgos principales

### P0. Endpoint de scoring con service role y sin rastro de auditoria

- `/api/game` usa `SUPABASE_SERVICE_ROLE_KEY` para actualizar `hole_scores` y `rounds`.
- No genera registros en `score_audit_log`.
- No fuerza reglas claras por estado de ronda antes de escribir.

Impacto:
- alteracion de scores oficiales
- imposibilidad de investigar fraude o errores
- bypass practico de RLS en el flujo mas sensible del producto

### P1. Riesgo de open redirect en callback de auth

- `src/app/auth/callback/route.ts` concatena `next` directamente a la URL final.
- No restringe `next` a rutas internas seguras.

Impacto:
- phishing post-login
- redireccion indeseada de usuarios autenticados

### P1. Modelo admin hardcodeado

- `src/lib/admin.ts` define admins por email fijo.
- Rutas `/admin/*` dependen de ese check.

Impacto:
- sin delegacion segura
- sin revocacion limpia
- alto riesgo operacional si cambia el correo o el equipo

### P1. Superficie publica de datos sensible por defaults amplios o inciertos

- El repo no versiona claramente las politicas RLS de tablas nuevas usadas por producto.
- Varias tablas nuevas aparecen en docs y SQL pendiente, pero no en la migracion base.

Impacto:
- exposicion accidental de datos personales o competitivos
- imposibilidad de auditar seguridad real desde repo

### P2. Falta rate limiting y protecciones anti-abuso en rutas criticas

- No se observan limites ni protecciones en `/api/game`, `/api/admin/*`, `/api/taiger/*`.

Impacto:
- abuso de recursos
- spam de scoring
- degradacion de servicio

## Confirmado

- service role en scoring
- open redirect probable
- admin por email
- ausencia de audit trail integrado

## Requiere validacion manual

- RLS real de `rondas_libres`, `ronda_libre_jugadores`, `historical_rounds`, `analytics_events`, `player_patterns`, `taiger_sessions`
- existencia de rate limiting a nivel edge, proxy o Supabase
