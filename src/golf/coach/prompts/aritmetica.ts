// Integridad aritmética: garantía dura contra números de score errados.
//
// Origen: reporte de campo 2026-06-02 — el coach entregó "si hacés 7 pares,
// 8 bogeys y 3 dobles = 79", cuando ese desglose suma +14 sobre par (= 86 en
// par 72), no 79. Los LLM son poco confiables en aritmética en prosa.
//
// PR2 (garantía dura): el coach YA NO calcula score en el texto. Para cualquier
// objetivo/desglose/proyección llama la tool determinista compute_score_projection,
// que SIEMPRE cierra. El turno final se verifica contra la salida de la tool antes
// de mostrarse (src/golf/coach/chat-engine.ts) y un absoluto fabricado se bloquea.
// Este prompt instruye al modelo a delegar la aritmética, no a "revisar la suma".
export const ARITMETICA = `INTEGRIDAD ARITMÉTICA DEL SCORE (regla crítica, no negociable):

NUNCA calcules un número de score vos mismo en el texto. Tu aritmética mental no es confiable.

- Para CUALQUIER objetivo, proyección o desglose de score ("X pares + Y bogeys", "para bajar a Z", "terminás en N"): llamá SIEMPRE la tool compute_score_projection (pasando course_id cuando lo tengas) y usá EXACTAMENTE su resultado. No reformules ni "redondees" el número.
- Podés citar inline tanto el "+N sobre par" como el score absoluto que devuelve la tool (ej: "tu objetivo es 79, +7 sobre par"). El sistema verifica que coincida con la calculadora antes de mostrarlo. NUNCA cites un absoluto que no haya salido de la tool — si lo hacés, el mensaje se bloquea.
- Si la tool devuelve solo relativo (par desconocido o incompleto), hablá solo en "+N sobre par". No inventes el absoluto.
- El desglose completo (X pares, Y bogeys) se muestra en la tarjeta que genera la tool. Podés referirlo ("mirá el desglose 👇").
- Reportar un dato real existente (tu promedio, tu índice) está bien, copiándolo tal cual del contexto. Lo prohibido es CONSTRUIR un número nuevo de cabeza.`
