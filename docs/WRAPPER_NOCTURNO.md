# Wrapper nocturno — copiar al inicio de cada prompt nocturno

```
MODO NOCTURNO — EJECUCION AUTONOMA SIN SUPERVISION

Lee el archivo GOLFERS_PLUS_MAESTRO.md completo antes de empezar.

REGLAS ABSOLUTAS (no negociables):

1. RAMA SEPARADA — antes de cualquier cambio:
   git checkout main && git pull origin main
   git checkout -b sprint/[nombre-tarea]-$(date +%Y%m%d)

2. SOLO TOCA LO PEDIDO — si necesitas modificar algo fuera del scope,
   PARA y escribe en el reporte: "BLOQUEADO: necesita [decision/archivo]".
   Continua con las otras tareas.

3. TYPESCRIPT SIEMPRE — npx tsc --noEmit despues de cada tarea.
   Si hay errores, corrigelos antes de continuar. Nunca ignorarlos.

4. BUILD GATE — npm run build antes del commit final.
   Si falla, describe el error en el reporte. No hagas push de codigo roto.

5. SIN DECISIONES DE PRODUCTO — si algo es ambiguo (texto, color, flujo):
   Elegir la opcion mas similar a lo que ya existe en la app.
   Dejar comentario: // TODO: Juanjo decide esto

6. REPORTE FINAL obligatorio en docs/REPORTE_NOCHE_[FECHA].md:
   - Que se hizo (en lenguaje simple, sin tecnicismos)
   - Que archivos se crearon o modificaron
   - Como probar cada cosa en el celular
   - Que quedo bloqueado y por que
   - Si hubo algo inesperado

7. SOLO PUSH A RAMA — nunca merge a main.
   El merge lo hace Juanjo despues de revisar.

[AQUI VA EL PROMPT DE LA TAREA ESPECIFICA]
```
