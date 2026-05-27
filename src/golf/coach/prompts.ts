// Compatibilidad con consumers existentes — la implementación vive en prompts/.
// Ola 0 Task 10: extracción de submódulos identidad/anti_hallucination/plantillas/contexto.
// Snapshot test en prompts/__tests__/snapshot.test.ts valida zero-change vs. el monolito previo.
export * from './prompts/index'
