module.exports = {
  // 使用 jest-expo 预设默认的 transformIgnorePatterns：它会把 .pnpm 下的依赖
  // 全部纳入 babel-jest 转换（自定义白名单会漏掉 @react-native/jest-preset 的 ESM setup）。
  preset: 'jest-expo',
  // Jest runs the WASM adapter, while Android and iOS resolve the native adapter.
  moduleNameMapper: {
    '/adapters/js/runJavaScript$': '<rootDir>/src/adapters/js/runJavaScript.ts',
  },
  // AsyncStorage 的原生模块在 Jest 里不可用，setupFiles 统一替换为内存实现。
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/build/',
    '/.cache/',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
};
