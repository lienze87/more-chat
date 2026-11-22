// AsyncStorage 的原生模块在 Jest 里是 null，换成官方内存实现。
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
