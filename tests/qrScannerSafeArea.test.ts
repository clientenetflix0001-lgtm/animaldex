import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scanner = readFileSync(join(root, 'screens/QRScannerScreen.tsx'), 'utf8');

describe('QR scanner safe area', () => {
  it('el sheet de Continuar / Escanear de nuevo usa inset inferior', () => {
    assert.match(scanner, /Escanear de nuevo/);
    assert.match(scanner, /Continuar/);
    assert.match(scanner, /useSafeAreaInsets/);
    assert.match(scanner, /styles\.resultSheet/);
    assert.match(scanner, /Math\.max\(insets\.bottom \+ 12, 20\)/);
    assert.match(scanner, /position: 'absolute'/);
    assert.match(scanner, /bottom: 0/);
  });
});
