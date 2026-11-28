import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

const script = join(__dirname, '..', 'scripts', 'check-architecture.mjs');

function checkFixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'morechat-arch-'));
  try {
    for (const [name, source] of Object.entries({'App.tsx': '', ...files})) {
      const file = join(root, name);
      mkdirSync(dirname(file), {recursive: true});
      writeFileSync(file, source);
    }
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5_000,
    });
    if (result.error) {
      throw result.error;
    }
    return result;
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

it.each([
  ['side-effect imports', "import '../ui/view';"],
  ['re-exports', "export {View} from '../ui/view';"],
  ['type imports', "import type {View} from '../ui/view';"],
  ['import type expressions', "export type View = import('../ui/view').View;"],
  ['dynamic imports', "void import('../ui/view');"],
  ['template literal imports', 'void import(`../ui/view`);'],
])('checks layer boundaries for %s', (_syntax, source) => {
  const result = checkFixture({
    'src/features/sample.ts': `\n${source}`,
    'src/ui/view.ts': '',
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处层次倒置');
  expect(result.stderr).toContain('src/features/sample.ts:2 -> src/ui/view.ts');
});

it('treats domain as a leaf, including platform packages', () => {
  const result = checkFixture({
    'src/domain/model.ts': "import {useState} from 'react';",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处层次倒置');
  expect(result.stderr).toContain('domain 只能是纯模型层');
});

it('keeps ui independent from the app assembly layer', () => {
  const result = checkFixture({
    'src/ui/screen.ts': "import {AppRoot} from '../app/AppRoot';",
    'src/app/AppRoot.ts': '',
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处层次倒置');
  expect(result.stderr).toContain('src/ui/screen.ts:1 -> src/app/AppRoot.ts');
  expect(result.stderr).toContain('ui 不得依赖 app 组装层');
});

it('keeps feature code independent from platform packages', () => {
  const result = checkFixture({
    'src/features/sample.ts': "import {Platform} from 'react-native';",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处层次倒置');
  expect(result.stderr).toContain(
    'features 通过 adapters/platform 访问平台能力',
  );
});

it('keeps utils limited to pure cross-layer helpers', () => {
  const result = checkFixture({
    'src/utils/format.ts': "import {getRandomValues} from 'expo-crypto';",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处层次倒置');
  expect(result.stderr).toContain('utils 只放跨层纯函数');
});

it('ignores import examples in comments and strings', () => {
  const result = checkFixture({
    'src/features/sample.ts': [
      "// Example: import {demo} from './missing';",
      "const example = `import {demo} from './missing'`;",
    ].join('\n'),
  });

  expect(result.status).toBe(0);
  expect(result.stdout).toContain('0 条内部依赖边');
});

it('detects a cycle through a dynamic import', () => {
  const result = checkFixture({
    'src/features/a.ts': "void import('./b');",
    'src/features/b.ts': "import './a';",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('发现 1 处循环依赖');
});

it('reports the location of an unresolved dynamic import', () => {
  const result = checkFixture({
    'src/features/sample.ts': "\nvoid import('./missing');",
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('src/features/sample.ts:2 -> ./missing');
});
