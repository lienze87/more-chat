/**
 * 架构边界检查，使用 TypeScript 解析模块依赖。
 *
 * oxlint 不做跨文件依赖分析，knip 只管未使用代码，两者都发现不了循环依赖
 * 与层次倒置。这个脚本补上这两类检查：
 *   1. 模块级循环依赖（值导入 + 类型导入）；
 *   2. 分层规则：下层不得依赖上层。
 *
 * 规则命中的位置就是需要改代码的位置，不需要额外配置。
 */
import {existsSync} from 'node:fs';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src');

const toPosix = value => value.split(path.sep).join('/');

async function collect(dir, acc = []) {
  const entries = await readdir(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(target, acc);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      acc.push(toPosix(path.relative(ROOT, target)));
    }
  }
  return acc;
}

function dependencySpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier;
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return node.argument.literal;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return node.arguments[0];
  }
}

/** 无法解析的相对导入：目录搬迁后最容易漏掉的一类问题。 */
const unresolved = [];

/** 把一个模块的 import 说明符解析成内部路径或裸包名。 */
function resolveSpecifier(fromFile, specifier, known) {
  const candidates = [];
  if (specifier.startsWith('.')) {
    const base = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromFile), specifier),
    );
    // 非脚本资源（如 src 里 import package.json 取版本号）只需文件存在。
    if (base.endsWith('.json')) {
      if (existsSync(path.join(ROOT, base))) {
        return base;
      }
      return null;
    }
    for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
      if (known.has(base + suffix)) {
        candidates.push(base + suffix);
      }
    }
    if (candidates.length === 0) {
      return null;
    }
    return candidates[0];
  }
  return specifier;
}

async function buildGraph() {
  const files = [...(await collect(SOURCE_DIR)), 'App.tsx'].filter(
    file => file.endsWith('.tsx') || file.endsWith('.ts'),
  );
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const text = await readFile(path.join(ROOT, file), 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
    const edges = new Map();
    const visit = node => {
      const specifier = dependencySpecifier(node);
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const resolved = resolveSpecifier(file, specifier.text, known);
        const {line} = source.getLineAndCharacterOfPosition(
          specifier.getStart(source),
        );
        if (!resolved) {
          unresolved.push({
            from: file,
            specifier: specifier.text,
            line: line + 1,
          });
        } else if (!edges.has(resolved)) {
          edges.set(resolved, line + 1);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    graph.set(file, edges);
  }
  return graph;
}

/** 分层规则：命中即视为层次倒置。 */
const RULES = [
  {
    from: /^src\/domain\//,
    to: /^(?!src\/domain\/)/,
    reason: 'domain 必须是纯模型层，只能依赖自身',
  },
  {
    from: /^src\/domain\//,
    to: /^(react$|react-native$|zustand$|@react-native-async-storage\/)/,
    reason: 'domain 不得依赖 React / RN / zustand / 存储实现',
  },
  {
    from: /^src\/config\//,
    to: /^src\//,
    reason: 'config 是最底层常量，不得依赖任何其它模块',
  },
  {
    from: /^src\/ui\/(primitives|theme)\//,
    to: /^src\/(features|adapters|app)\//,
    reason: '展示原语不得依赖状态层或编排层（主题应由调用方注入）',
  },
  {
    from: /^src\/ui\//,
    to: /^src\/app\//,
    reason: 'ui 不得依赖 app 组装层（路由契约由 ui 拥有）',
  },
  {
    from: /^src\/features\//,
    to: /^src\/ui\//,
    reason: 'features 不得依赖 UI',
  },
  {
    from: /^src\/features\//,
    to: /^(?:react|react-native|react-native-.*|expo(?:\/.*)?|expo-.*|@expo\/.*|@react-native\/.*|@react-navigation\/.*)$/,
    reason:
      'features 通过 adapters/platform 访问平台能力，保持可脱离 React 测试',
  },
  {
    from: /^src\/utils\//,
    to: /^(?:react|react-native|react-native-.*|expo(?:\/.*)?|expo-.*|@expo\/.*|@react-native\/.*|@react-navigation\/.*|zustand)$|^src\/(?:features|adapters|ui|app)\//,
    reason: 'utils 只放跨层纯函数；平台实现与状态放 features/adapters',
  },
  {
    from: /^src\/adapters\//,
    to: /^src\/(features|ui|app)\//,
    reason: 'adapters 只做协议/存储实现，不得依赖上层',
  },
];

function checkRules(graph) {
  const violations = [];
  for (const [from, edges] of graph) {
    for (const [to, line] of edges) {
      for (const rule of RULES) {
        if (rule.from.test(from) && rule.to.test(to)) {
          violations.push({from, to, line, reason: rule.reason});
        }
      }
    }
  }
  return violations;
}

function checkCycles(graph) {
  const cycles = [];
  const seen = new Set();
  const stack = [];
  const onStack = new Set();
  const settled = new Set();

  const visit = node => {
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node).keys()) {
      if (!graph.has(next)) {
        continue;
      }
      if (onStack.has(next)) {
        const cycle = stack.slice(stack.indexOf(next));
        const key = [...cycle].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (!settled.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    onStack.delete(node);
    settled.add(node);
  };

  for (const node of graph.keys()) {
    if (!settled.has(node)) {
      visit(node);
    }
  }
  return cycles;
}

const graph = await buildGraph();
const violations = checkRules(graph);
const cycles = checkCycles(graph);

if (cycles.length > 0) {
  console.error(`发现 ${cycles.length} 处循环依赖：`);
  for (const cycle of cycles) {
    console.error(`  ${[...cycle, cycle[0]].join(' -> ')}`);
  }
}

if (violations.length > 0) {
  console.error(`发现 ${violations.length} 处层次倒置：`);
  for (const {from, to, line, reason} of violations) {
    console.error(`  ${from}:${line} -> ${to}\n    ${reason}`);
  }
}

if (unresolved.length > 0) {
  console.error(`发现 ${unresolved.length} 处无法解析的相对导入：`);
  for (const {from, specifier, line} of unresolved) {
    console.error(`  ${from}:${line} -> ${specifier}`);
  }
}

if (cycles.length === 0 && violations.length === 0 && unresolved.length === 0) {
  const internalEdges = [...graph.values()].reduce(
    (total, edges) =>
      total + [...edges.keys()].filter(edge => graph.has(edge)).length,
    0,
  );
  process.stdout.write(
    `架构检查通过：${graph.size} 个模块，${internalEdges} 条内部依赖边，0 循环，0 倒置。\n`,
  );
}

process.exit(cycles.length + violations.length + unresolved.length > 0 ? 1 : 0);
