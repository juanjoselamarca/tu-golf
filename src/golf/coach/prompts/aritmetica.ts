// Integridad aritmética: regla dura contra desgloses de score que no cierran.
//
// Origen: reporte de campo 2026-06-02 — el coach entregó "si hacés 7 pares,
// 8 bogeys y 3 dobles = 79", cuando ese desglose suma +14 sobre par (= 86 en
// par 72), no 79 (+7). Los LLM son poco confiables en aritmética en prosa; sin
// una regla explícita con la fórmula y un auto-chequeo, inventan números que se
// ven plausibles pero están mal. En una app de golf, un número de score erróneo
// destruye la credibilidad del coach (directiva CERO FALLOS).
export const ARITMETICA = `INTEGRIDAD ARITMÉTICA DEL SCORE (regla crítica, no negociable):

Cuando proyectes o desgloses un score (ej: "X pares + Y bogeys + Z dobles = score objetivo"), la aritmética DEBE cerrar exactamente. Antes de escribir el número, verificá en silencio con estas dos fórmulas:

1. SUMA DE HOYOS: pares + birdies + bogeys + dobles + triples + ... = cantidad de hoyos de la ronda (18, o 9 si es media ronda). Si no suman, el desglose está mal.

2. SCORE TOTAL = par del campo + golpes sobre par, donde:
   - birdie = −1 ;  par = 0 ;  bogey = +1 ;  doble = +2 ;  triple = +3 ;  (+N) = +N
   score = par_campo + (bogeys×1) + (dobles×2) + (triples×3) + … − (birdies×1) − (eagles×2)
   El "sobre par" del desglose = score − par_campo. Tiene que dar el mismo número en ambos lados.

EJEMPLO de error a NO cometer: "7 pares + 8 bogeys + 3 dobles = 79" en un campo par 72.
   → sobre par = 8×1 + 3×2 = +14 → score = 72 + 14 = 86, NO 79. El desglose no cierra.
   Para llegar a 79 (par 72 → +7) un desglose válido sería, por ejemplo, 11 pares + 7 bogeys + 0 dobles (= +7).

REGLAS:
- Si tu desglose no cierra contra el score objetivo, RECALCULALO antes de enviarlo. Nunca muestres un desglose cuya suma no dé exactamente el score que afirmás.
- Partí del objetivo en "sobre par" (objetivo − par del campo) y construí el reparto de hoyos PARA que sume eso. No al revés.
- Si no conocés el par real del campo, no inventes el total: hablá en "sobre par" (ej: "+7") o pedí el par. No afirmes un score absoluto sin par verificado.
- Esta verificación aplica a CUALQUIER número de score que generes (objetivos, proyecciones, "en números", planes hoyo a hoyo).`
