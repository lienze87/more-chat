/**
 * 打包 Android APK（零第三方依赖）。
 *
 * 1. `android/` 缺失时先执行一次 `expo prebuild --platform android`，
 *    保证从干净克隆也能直接打包；
 * 2. 调用 Gradle Wrapper 执行 `assemble<Release|Debug>`；
 * 3. 把产物复制到 `build/android/`，文件名取自 `package.json` 的 version。
 *
 * 用法：
 *   pnpm android:build              # release 包，JS bundle 打进 APK
 *   pnpm android:build -- --debug   # debug 包，运行时仍需连接 Metro
 *   pnpm android:build -- --prebuild # 强制重新生成原生工程
 */
import {spawnSync} from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const OUTPUT_DIR = path.join(ROOT, 'build', 'android');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const GRADLE_PROPERTIES = path.join(ANDROID_DIR, 'gradle.properties');
const SDK_CONFIG_PLUGIN = path.join(
  ROOT,
  'plugins',
  'withAndroidSdkVersions.js',
);
const IS_WINDOWS = process.platform === 'win32';

/** 版本号唯一来源：package.json（app.json 不再声明 version）。 */
const APP_VERSION = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).version;
if (!APP_VERSION) {
  fail('package.json 缺少 version 字段');
}

const argv = new Set(process.argv.slice(2));
const variant = argv.has('--debug') ? 'debug' : 'release';
const wantPrebuild = argv.has('--prebuild');
const task = `assemble${variant[0].toUpperCase()}${variant.slice(1)}`;

const log = message => process.stdout.write(`[android:build] ${message}\n`);

function fail(message) {
  process.stderr.write(`\n[android:build] ${message}\n\n`);
  process.exit(1);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    fail(`无法执行 ${command}：${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} 失败（退出码 ${result.status}）`);
  }
}

/** 读取上次 prebuild 写进 build.gradle 的 versionName。 */
function readNativeVersionName() {
  const buildGradle = path.join(ANDROID_DIR, 'app', 'build.gradle');
  if (!existsSync(buildGradle)) {
    return null;
  }
  const match = /versionName\s+"([^"]+)"/.exec(
    readFileSync(buildGradle, 'utf8'),
  );
  return match?.[1] ?? null;
}

/** 生成工程里的 Gradle 属性，形如 key=value。 */
function readGradleProperties() {
  if (!existsSync(GRADLE_PROPERTIES)) {
    return new Map();
  }
  return new Map(
    readFileSync(GRADLE_PROPERTIES, 'utf8')
      .split(/\r?\n/)
      .map(line => /^([^#=\s][^=]*)=(.*)$/.exec(line))
      .filter(Boolean)
      .map(match => [match[1].trim(), match[2].trim()]),
  );
}

/**
 * 配置插件写入的 Gradle 属性只在新生成的工程里生效。属性漂移说明 android/
 * 还是旧配置的产物，继续打包会沿用过期版本（例如 Kotlin 编译器）。
 */
function configPluginPropertiesMatch() {
  const require = createRequire(import.meta.url);
  let expected;
  try {
    expected = require(SDK_CONFIG_PLUGIN).PROPERTIES ?? {};
  } catch {
    // 依赖缺失时让后面的 prebuild 报出明确错误。
    return true;
  }
  const actual = readGradleProperties();
  return Object.entries(expected).every(
    ([key, value]) => actual.get(key) === value,
  );
}

/**
 * 原生工程是 prebuild 产物（已 gitignore）：缺失、版本号或配置插件属性漂移、
 * 显式要求时重新生成，保证 APK 与当前配置一致。
 */
function ensureNativeProject() {
  const hasWrapper = existsSync(
    path.join(ANDROID_DIR, IS_WINDOWS ? 'gradlew.bat' : 'gradlew'),
  );
  const nativeVersion = hasWrapper ? readNativeVersionName() : null;
  const staleConfig = hasWrapper && !configPluginPropertiesMatch();
  if (
    !wantPrebuild &&
    hasWrapper &&
    nativeVersion === APP_VERSION &&
    !staleConfig
  ) {
    return;
  }
  const require = createRequire(import.meta.url);
  let cli;
  try {
    cli = require.resolve('expo/bin/cli', {paths: [ROOT]});
  } catch {
    fail('未找到 expo CLI，请先执行 pnpm install');
  }
  if (nativeVersion !== null && nativeVersion !== APP_VERSION) {
    log(`版本号 ${nativeVersion} -> ${APP_VERSION}，重新生成原生工程`);
  } else if (staleConfig) {
    log('Gradle 属性与 config plugin 不一致，重新生成原生工程');
  }
  log('生成原生工程：expo prebuild --platform android');
  run(process.execPath, [
    cli,
    'prebuild',
    '--platform',
    'android',
    '--no-install',
  ]);
}

/** Gradle 需要 SDK 路径：优先 local.properties，其次环境变量。 */
function ensureAndroidSdk() {
  const localProperties = path.join(ANDROID_DIR, 'local.properties');
  let sdkDir;
  if (existsSync(localProperties)) {
    const match = /^sdk\.dir=(.*)$/m.exec(
      readFileSync(localProperties, 'utf8'),
    );
    if (match) {
      // .properties 里反斜杠与冒号都是转义写法。
      sdkDir = match[1].replaceAll('\\\\', '\\').replaceAll('\\:', ':').trim();
    }
  }
  sdkDir ??= process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdkDir) {
    fail(
      '未找到 Android SDK：请设置 ANDROID_HOME，或在 android/local.properties 写入 sdk.dir',
    );
  }
  if (!existsSync(sdkDir)) {
    fail(`Android SDK 路径不存在：${sdkDir}`);
  }
}

function runGradle() {
  log(`开始打包：${task}`);
  const gradleArgs = [task, '--console=plain'];
  if (IS_WINDOWS) {
    run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', ...gradleArgs], {
      cwd: ANDROID_DIR,
    });
  } else {
    run('./gradlew', gradleArgs, {cwd: ANDROID_DIR});
  }
}

/** 取 Gradle 产物；有多个时优先 `app-<variant>.apk`。 */
function findApk() {
  const apkDir = path.join(
    ANDROID_DIR,
    'app',
    'build',
    'outputs',
    'apk',
    variant,
  );
  if (!existsSync(apkDir)) {
    return null;
  }
  const apks = readdirSync(apkDir).filter(name => name.endsWith('.apk'));
  if (apks.length === 0) {
    return null;
  }
  const preferred = `app-${variant}.apk`;
  return path.join(apkDir, apks.includes(preferred) ? preferred : apks[0]);
}

function collectApk(apk) {
  const {expo = {}} = JSON.parse(
    readFileSync(path.join(ROOT, 'app.json'), 'utf8'),
  );
  const name = `${expo.slug ?? 'app'}-${APP_VERSION}-${variant}.apk`;
  mkdirSync(OUTPUT_DIR, {recursive: true});
  const target = path.join(OUTPUT_DIR, name);
  copyFileSync(apk, target);
  return target;
}

const toPosix = value => value.split(path.sep).join('/');
const toMegaBytes = bytes => (bytes / 1024 / 1024).toFixed(1);

ensureNativeProject();
ensureAndroidSdk();
runGradle();

const apk = findApk();
if (!apk) {
  fail('打包结束但没有找到 APK，请检查 Gradle 日志');
}

const target = collectApk(apk);
const size = toMegaBytes(statSync(target).size);
const relative = toPosix(path.relative(ROOT, target));
log(`完成：${relative}（版本 ${APP_VERSION}，${size} MB）`);
log(`安装：adb install -r "${target}"`);
