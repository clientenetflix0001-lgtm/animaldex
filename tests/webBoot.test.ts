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

function topLevelChunks(src: string): { name: string; body: string }[] {
  const lines = src.split('\n');
  const chunks: { name: string; body: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^(export )?(default )?(function (\w+)|const (\w+) = )/);
    if (m && !lines[i].startsWith(' ')) {
      const name = m[4] || m[5];
      const start = i;
      i += 1;
      while (i < lines.length) {
        if (/^(export )?(default )?(function |const \w+ = )/.test(lines[i]) && !lines[i].startsWith(' ')) break;
        i += 1;
      }
      chunks.push({ name, body: lines.slice(start, i).join('\n') });
      continue;
    }
    i += 1;
  }
  return chunks;
}

/** Helpers de módulo que usan colors. sin useAppTheme ni import de colors. */
function hookColorsUnbound(src: string): string[] {
  const importsColors = /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"][^'"]*theme['"]/.test(src);
  if (importsColors) return [];
  const chunks = topLevelChunks(src);
  return chunks
    .filter((c) => c.name !== 'makeStyles' && !c.name.endsWith('Styles'))
    .filter((c) => /\bcolors\./.test(c.body))
    .filter((c) => !c.body.includes('useAppTheme') && !c.body.includes('const { colors'))
    .filter((c) => !/\bcolors\s*[:),]/.test(c.body.slice(0, 400)) && !c.body.slice(0, 300).includes('ThemeColors'))
    .map((c) => c.name);
}

/** Helpers de módulo que usan styles del padre (useMemo makeStyles) sin definirlos. */
function hookStylesUnbound(src: string): string[] {
  const chunks = topLevelChunks(src);
  const hookDefined = chunks.some((c) => c.body.includes('useMemo(() => makeStyles'));
  if (!hookDefined) return [];
  const moduleStyles = chunks.some((c) => /^const styles = StyleSheet\.create/m.test(c.body));
  if (moduleStyles) return [];
  return chunks
    .filter((c) => c.name !== 'makeStyles' && !c.name.endsWith('Styles'))
    .filter((c) => /\bstyles\./.test(c.body) && !c.body.includes('const styles'))
    .map((c) => c.name);
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

  it('helpers de módulo no usan styles del padre sin definirlos', () => {
    const broken: string[] = [];
    for (const dir of ['screens', 'components', 'features', 'lib']) {
      const walk = (folder: string) => {
        for (const name of readdirSync(join(root, folder))) {
          const rel = `${folder}/${name}`;
          const abs = join(root, rel);
          try {
            if (readdirSync(abs)) walk(rel);
            continue;
          } catch {
            /* file */
          }
          if (!name.endsWith('.tsx')) continue;
          const src = read(rel);
          const unbound = hookStylesUnbound(src);
          if (unbound.length) broken.push(`${rel}:styles:${unbound.join(',')}`);
          const colors = hookColorsUnbound(src);
          if (colors.length) broken.push(`${rel}:colors:${colors.join(',')}`);
        }
      };
      walk(dir);
    }
    assert.deepEqual(broken, []);
  });

  it('ExternalNavButton resuelve colors con useAppTheme', () => {
    const src = read('lib/guestAccess.tsx');
    assert.match(src, /export function ExternalNavButton/);
    const unbound = hookColorsUnbound(src);
    assert.deepEqual(unbound, []);
    assert.match(src, /function ExternalNavButton[\s\S]*useAppTheme\(\)/);
  });
});
