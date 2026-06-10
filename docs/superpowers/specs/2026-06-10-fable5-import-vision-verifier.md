# Spec — Verificador de visión Fable 5 para el import de scorecards

**Fecha:** 2026-06-10
**Estado:** PROPUESTO — requiere OK de Juanjo (decisión de costo)
**Autor:** Claude (CTO)

## Problema

El import de fotos/screenshots de scorecards es **la tarea más crítica para CERO FALLOS**:
un número mal leído → score mal → diferencial mal → índice WHS mal → confianza destruida.
Ya nos pasó con Nicolás (primer usuario externo, cadena de bugs de import).

Hoy `src/app/api/import/screenshot/route.ts` usa **`gemini-2.5-flash`** ($0.1/$0.4 por 1M)
para el OCR. Es barato y rápido, pero la visión de Gemini Flash comete errores en casos
duros: dígitos borrosos, manuscritos, fotos con sol/sombra, tablas con líneas tenues.

Fable 5 (GA 09-jun-2026) es **state-of-the-art en visión**: "extrae números precisos de
figuras científicas" y "reconstruye el código de una web app desde un screenshot". Es
exactamente nuestro problema. Pero cuesta **$10/$50 por 1M — ~100× Gemini Flash**.

## Propuesta — NO reemplazar, VERIFICAR selectivamente

Patrón de dos etapas (barato primero, caro solo cuando hace falta):

1. **Etapa 1 — Gemini Flash lee (como hoy).** Además del score, devuelve una **señal de
   confianza** por celda/hoyo (ya disponible si pedimos `confidence` en el prompt
   estructurado) y nosotros corremos un **check aritmético** (suma de hoyos = total, par
   coherente con la cancha del catálogo — infra de import-hardening PR #122).

2. **Etapa 2 — Fable 5 verifica SOLO cuando hay duda.** Se dispara únicamente si:
   - alguna celda tiene confianza < umbral, **o**
   - la suma de hoyos no cuadra con el total declarado, **o**
   - el diferencial resultante cae fuera de un rango razonable para el jugador.

   Fable re-lee esa scorecard (o solo la región dudosa) y devuelve la lectura corregida.
   En la mayoría de imports limpios, **Fable nunca se invoca** → costo marginal ~0.

## Modelo de costo

- Import limpio (estimado ~80-90%): solo Gemini → costo igual a hoy.
- Import dudoso (~10-20%): + 1 llamada Fable sobre 1 imagen (~1-2K tokens in, ~500 out)
  ≈ **$0.04-0.05 por scorecard verificada**. Despreciable vs el costo de un índice mal
  calculado que ahuyenta a un usuario.
- Cota dura sugerida: límite de N verificaciones Fable por usuario/día para evitar abuso.

## Por qué esto y no swap total

- Gemini Flash ya resuelve el 80-90% bien y es 100× más barato. Pagar Fable en cada
  import sería quemar plata sin mejorar esos casos.
- El valor de Fable está en la **cola de casos difíciles**, que es justo donde hoy
  fallamos y donde un error duele más (CERO FALLOS).

## Rollout seguro

1. Feature flag `IMPORT_FABLE_VERIFIER_ENABLED` (default OFF).
2. Shadow mode primero: cuando se dispararía la verificación, **logear** lo que Fable
   habría corregido vs lo que Gemini leyó, sin cambiar el resultado mostrado. Medir
   cuántas correcciones reales aporta antes de activarlo de cara al usuario.
3. Activar solo si shadow mode muestra ganancia real de accuracy.
4. Medir contra el banco de casos canario de import (scorecards reales difíciles).

## Decisión pendiente para Juanjo (producto/costo)

- ¿Autorizamos el gasto marginal de Fable como verificador (estimado <$0.05 por import
  dudoso, con cota diaria)? El resto es ejecución técnica que manejo solo.

## Notas de arquitectura

- Fable se invoca vía la SDK de Anthropic igual que el coach (no necesita wiring nuevo:
  `model: 'claude-fable-5'`). El gateway actual (`callLLM`) es single-shot no-streaming,
  así que sirve directo para esta llamada de verificación (no necesita streaming).
- El verificador vive en `src/golf/` (lógica de golf) o `src/lib/import/`, NO embebido en
  el handler de la route (regla "el que toca ordena").
