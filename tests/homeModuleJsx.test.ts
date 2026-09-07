import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const HOME_MODULE_TSX = [
  'components/FeedAdoptionsRow.tsx',
  'components/FeedReelsRow.tsx',
  'components/FeedPagesRow.tsx',
  'components/FeedAlertsRow.tsx',
  'components/StoryRail.tsx',
  'components/HomeHorizontalList.tsx',
  'components/HomeModuleTitle.tsx',
];

function parseTsx(source: string, filename: string) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    sourceFilename: filename,
    errorRecovery: false,
  });
}

describe('HOME MODULE JSX', () => {
  it('HomeHorizontalList no deja props como children', () => {
    for (const file of HOME_MODULE_TSX) {
      assert.doesNotMatch(read(file), /<HomeHorizontalList>\s*\w+=/);
    }
  });

  it('módulos Home parsean como TSX válido', () => {
    for (const file of HOME_MODULE_TSX) {
      assert.doesNotThrow(() => parseTsx(read(file), file), file);
    }
  });
});
