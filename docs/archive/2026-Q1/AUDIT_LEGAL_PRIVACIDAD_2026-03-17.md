# Auditoria Legal y Privacidad

Fecha: 2026-03-17
Estado: diagnostico

## Hallazgos principales

### P0. No se observan politicas publicas de privacidad, terminos ni consentimiento

- No aparecen paginas o documentos productivos de politica de privacidad, terminos, cookies o consentimiento.
- La app recolecta email, nombre, handicap, historial deportivo, patrones de juego y eventos de analytics.

Impacto:
- base legal difusa para tratamiento de datos
- riesgo reputacional y de cumplimiento al abrir usuarios reales

### P1. El producto maneja datos potencialmente sensibles de performance sin governance visible

- Guarda historial de rondas, patrones del jugador, sesiones de coaching y eventos de actividad.
- El roadmap/documentacion menciona coaching, Garmin, profiling y tracking.

Impacto:
- usuarios pueden no entender que datos se usan para coaching o analitica
- mayor exigencia de transparencia y control del usuario

### P1. No se ve un flujo claro de derechos del usuario

- No aparece mecanismo visible para borrar cuenta, borrar datos, exportar datos o revocar integraciones.

Impacto:
- mala experiencia de confianza
- friccion frente a solicitudes reales de usuarios

### P1. Analytics y features futuras de IA/integraciones no tienen disclosure visible

- `analytics_events` ya se usa.
- Docs mencionan Garmin y coaching tipo tAIger.
- No se observa disclosure de finalidad, retencion ni terceros.

Impacto:
- riesgo de sobrecolecta
- promesa opaca sobre uso de datos

### P2. Mensajes internos de infraestructura se filtran al usuario

- Hay errores que muestran instrucciones como ejecutar SQL en Supabase.

Impacto:
- transmite inmadurez operacional
- expone informacion interna innecesaria

## Confirmado

- ausencia visible de politicas publicas dentro del producto/repo
- tratamiento de datos personales y de comportamiento deportivo
- ausencia visible de flujo de borrado/exportacion

## Requiere validacion manual

- textos legales existentes fuera del repo
- configuracion real de retencion de datos
- acuerdos de terceros aplicables para Supabase, Vercel, Google OAuth y futuras integraciones
