import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRANSFER_SHEET_BOTTOM_EXTRA,
  TRANSFER_SHEET_BOTTOM_MIN,
  transferSheetBottomPadding,
  transferSheetScrollPadding,
  transferSheetUsesDeviceInset,
} from '../lib/transferSheetLayout.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sheet = readFileSync(join(root, 'components/TransferPetSheet.tsx'), 'utf8');
const transferLogic = readFileSync(join(root, 'lib/petTransfer.ts'), 'utf8');
const worker = readFileSync(join(root, 'worker/index.js'), 'utf8');

describe('TransferPetSheet safe-area', () => {
  it('1. respeta bottom inset real', () => {
    assert.equal(transferSheetUsesDeviceInset(), true);
    assert.equal(transferSheetBottomPadding({ bottom: 48 }), 48 + TRANSFER_SHEET_BOTTOM_EXTRA);
    assert.equal(transferSheetBottomPadding({ bottom: 16 }), 16 + TRANSFER_SHEET_BOTTOM_EXTRA);
    assert.match(sheet, /useSafeAreaInsets/);
    assert.match(sheet, /transferSheetBottomPadding\(insets\)/);
    assert.match(sheet, /paddingBottom: sheetPad/);
  });

  it('2. CTA no depende de margen Samsung hardcodeado', () => {
    assert.doesNotMatch(sheet, /paddingBottom:\s*48/);
    assert.doesNotMatch(sheet, /marginBottom:\s*48/);
    assert.doesNotMatch(sheet, /samsung/i);
    assert.equal(TRANSFER_SHEET_BOTTOM_EXTRA < 24, true);
    assert.equal(transferSheetBottomPadding({ bottom: 0 }), TRANSFER_SHEET_BOTTOM_MIN);
    assert.equal(transferSheetBottomPadding({}), TRANSFER_SHEET_BOTTOM_MIN);
  });

  it('3. contenido puede scrollear y el teclado no tapa el CTA', () => {
    assert.match(sheet, /<ScrollView/);
    assert.match(sheet, /transferSheetScrollPadding/);
    assert.ok(transferSheetScrollPadding() > 0);
    assert.match(sheet, /KeyboardAvoidingView/);
    assert.match(sheet, /keyboardShouldPersistTaps="handled"/);
    assert.match(sheet, />Continuar</);
    assert.match(sheet, /maxHeight: '82%'/);
  });

  it('11. no regresión de transferencia de mascotas', () => {
    assert.match(sheet, /db\.transferPetInternal/);
    assert.match(sheet, /db\.createPetTransferRequest/);
    assert.match(sheet, /Transferir perfil a un usuario/);
    assert.match(transferLogic, /PET_TRANSFER_STALE/);
    assert.match(worker, /transferPetInternal/);
    assert.match(worker, /respondPetTransfer/);
  });
});
