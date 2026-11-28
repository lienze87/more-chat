<p align="center">
  <img src="docs/app-icon.png" width="88" height="88" alt="MoreChat 应用图标" />
</p>

<h1 align="center">MoreChat</h1>

<p align="center">面向 Android 的 DeepSeek 聊天客户端，基于 Expo、React Native 和 TypeScript。</p>

## 功能

- **流式对话** · 随时停止生成，展开查看思考过程，阅读 Markdown 回复。
- **联网搜索和网页阅读** · 在回答中点击引用，打开原始来源。
- **本地会话和文件** · 切换历史对话，将助手生成的 Markdown 或 JSON 保存为文件并导出。
- **Skill 扩展** · 在应用内创建 Skill，或从 ZIP 和 GitHub 导入。

## 快速开始

Node.js 版本见 [package.json 的 engines](package.json)，pnpm 版本与 [CI 配置](.github/workflows/ci.yml) 保持一致。在项目根目录安装依赖并启动 Web 调试。

```bash
pnpm install
pnpm web
```

打开 `http://localhost:8081`，在 **设置 → 接口** 填入 DeepSeek API Key 并保存。Android 使用系统凭据存储保存 Key。Web 刷新后需重新输入。

## Android

本地编译需要 Android SDK 和 JDK。按 [Android 的 JDK 配置说明](https://developer.android.com/build/jdks) 选择与 Gradle 兼容的版本。SDK 与 Build Tools 版本见安装后的 `node_modules/react-native/gradle/libs.versions.toml`，NDK 和 CMake 版本见 [Expo 配置插件](plugins/withAndroidSdkVersions.js)。

```bash
pnpm android        # 生成原生工程并安装到设备或模拟器
pnpm android:build  # 在 build/android/ 生成 release APK
```

如需按当前 Expo 配置重新生成已有的 `android/`，运行 `pnpm prebuild:clean --platform android`。

Release APK 默认使用调试签名，正式发布前需配置发布签名。

## iOS

安装 Xcode、iOS 模拟器和 CocoaPods 后，运行 `pnpm ios`。生成原生工程时，CocoaPods 会下载 iOS `code_exec` 使用的固定版本 QuickJS。

## 开发文档

提交前可运行 `pnpm check`，执行格式、静态分析、类型、架构和单元测试检查。

- [架构说明](docs/ARCHITECTURE.md)
- [DeepSeek API 集成](docs/DEEPSEEK_INTEGRATION.md)
- [UI 设计系统](docs/UI_SYSTEM.md)
- [贡献指南与提交检查](docs/CONTRIBUTING.md)
