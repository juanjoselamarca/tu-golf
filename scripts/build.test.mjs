import { describe, it, expect } from 'vitest';
import { isGoogleFontsFlake } from './build.mjs';

describe('build.mjs — reintento solo ante la falla de Google Fonts', () => {
  it('reconoce la falla real de los deploys del 27-sep y 02-oct', () => {
    expect(isGoogleFontsFlake('Error: next/font/google queries have exactly one entry')).toBe(true);
    expect(isGoogleFontsFlake('Failed to fetch `DM Sans` from Google Fonts.')).toBe(true);
    expect(isGoogleFontsFlake('request to https://fonts.gstatic.com/l/font?kit=abc failed')).toBe(true);
  });

  it.each([
    "Type error: Property 'x' does not exist on type 'Y'.",
    'Module not found: Can\'t resolve \'@/lib/foo\'',
    'Error occurred prerendering page "/torneos"',
    '',
  ])('NO reintenta un error real: %s', (out) => {
    expect(isGoogleFontsFlake(out)).toBe(false);
  });
});
