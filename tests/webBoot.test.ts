import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function importedModulesFromApp(appSrc: string): string[] {
  const mods: string[] = [];
  const re = /from '\.\/(screens\/[^']+|components\/[^']+|lib\/[^']+|features\/[^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appSrc))) mods.push(m[1].replace(/\\/g, '/'));
  return mods;
}

function moduleScopeColorsWithoutImport(src: string): boolean {
  const firstExport = src.search(/^export (default )?function /m);
  const prelude = firstExport === -1 ? src : src.slice(0, firstExport);
  const usesColors = /(^|\n)(const|let|var) [\s\S]*?\bcolors\./.test(prelude);
  const importsColors = /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"][^'"]*theme['"]/.test(src);
  return usesColors && !importsColors;
}

describe('web boot: no ReferenceError colors', () => {
  it('ActivityScreen importa colors para ICONS de módulo', () => {
    const activity = read('screens/ActivityScreen.tsx');
    assert.match(activity, /import \{[^}]*\bcolors\b[^}]*\} from '\.\.\/lib\/theme'/);
    assert.match(activity, /lost_breed_match: \{ name: 'paw', bg: colors\.primary \}/);
    assert.equal(moduleScopeColorsWithoutImport(activity), false);
  });

  it('App importa ActivityScreen en el grafo de arranque', () => {
    const app = read('App.tsx');
    assert.match(app, /import ActivityScreen from '\.\/screens\/ActivityScreen'/);
    assert.match(app, /<ThemeProvider>/);
    assert.match(app, /ThemedAppShell/);
  });

  it('ningún screen/component del import de App usa colors. en módulo sin importarlo', () => {
    const app = read('App.tsx');
    const broken: string[] = [];
    for (const rel of importedModulesFromApp(app)) {
      const file = rel.endsWith('.tsx') || rel.endsWith('.ts') ? rel : `${rel}.tsx`;
      let src = '';
      try {
        src = read(file);
      } catch {
        try {
          src = read(file.replace(/\.tsx$/, '.ts'));
        } catch {
          continue;
        }
      }
      if (moduleScopeColorsWithoutImport(src)) broken.push(file);
    }
    assert.deepEqual(broken, []);
  });

  it('screens migrados no dejan colors. suelto antes del export default', () => {
    const dir = join(root, 'screens');
    const broken: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue;
      const rel = `screens/${name}`;
      if (moduleScopeColorsWithoutImport(read(rel))) broken.push(rel);
    }
    assert.deepEqual(broken, []);
  });
});
