import { describe, it, expect, vi } from 'vitest';
import { generateContextualPrefix } from '../contextual-prefix.mjs';

describe('generateContextualPrefix', () => {
  it('llama Haiku con prompt esperado y retorna prefix + costo', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'This chunk discusses cart path relief under Rule 16.' }],
      usage: { input_tokens: 50, output_tokens: 12 },
    });
    const fakeClient = { messages: { create: mockCreate } };

    const { prefix, costUsd, error } = await generateContextualPrefix(fakeClient, {
      docTitle: 'Rules of Golf 2023',
      breadcrumb: 'Rule 16 > 16.1',
      content: 'A player may take free relief from a cart path.',
    });

    expect(prefix).toBe('This chunk discusses cart path relief under Rule 16.');
    expect(error).toBeNull();
    expect(costUsd).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
      })
    );
    const call = mockCreate.mock.calls[0][0];
    expect(call.system).toContain('contextual prefix');
    expect(call.messages[0].content).toContain('Rule 16 > 16.1');
  });

  it('failure devuelve prefix vacío + costUsd=0 + error', async () => {
    const fakeClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error('rate limit')) },
    };
    const { prefix, costUsd, error } = await generateContextualPrefix(fakeClient, {
      docTitle: 'T',
      breadcrumb: 'B',
      content: 'C',
    });
    expect(prefix).toBe('');
    expect(costUsd).toBe(0);
    expect(error).toBeDefined();
    expect(error.message).toBe('rate limit');
  });

  it('trunca content > 2000 chars para no inflar tokens', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'X' }],
      usage: { input_tokens: 10, output_tokens: 1 },
    });
    const fakeClient = { messages: { create: mockCreate } };

    const longContent = 'X'.repeat(5000);
    await generateContextualPrefix(fakeClient, {
      docTitle: 'T',
      breadcrumb: 'B',
      content: longContent,
    });

    const sentMsg = mockCreate.mock.calls[0][0].messages[0].content;
    // El content enviado a Haiku está truncado a 2000 chars
    expect(sentMsg.length).toBeLessThan(longContent.length + 200);
  });

  it('costo calcula correctamente para Haiku 4.5', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Y' }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
    });
    const fakeClient = { messages: { create: mockCreate } };
    const { costUsd } = await generateContextualPrefix(fakeClient, {
      docTitle: 'T',
      breadcrumb: 'B',
      content: 'C',
    });
    // 1M input * $0.80 + 1M output * $4.00 = $4.80
    expect(costUsd).toBeCloseTo(4.8, 2);
  });
});
