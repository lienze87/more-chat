// AsyncStorage 的原生模块在 Jest 里是 null，换成官方内存实现。
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Use Node's cryptographic RNG in place of the native Expo module in Jest.
jest.mock('expo-crypto', () => ({
  getRandomValues: bytes => require('node:crypto').randomFillSync(bytes),
}));
