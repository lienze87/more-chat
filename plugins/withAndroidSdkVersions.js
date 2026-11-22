const {withGradleProperties} = require('expo/config-plugins');

/**
 * Pin the Android SDK / NDK versions used by `expo prebuild`.
 *
 * React Native 0.88 / Expo SDK 58 default to compileSdk 37, build-tools 37.0.0
 * and NDK 27.1.12297006. Autolinked Expo modules (expo-asset, expo-file-system,
 * ...) require compileSdk 37, so this project builds against SDK 37. NDK stays
 * at 28.2.13676358 (see README).
 *
 * - `android.*` properties are read by expo-autolinking's version catalog.
 * - bare `ndkVersion` becomes a project property consumed by expo-root-project.
 */
const PROPERTIES = {
  'android.compileSdkVersion': '37',
  'android.buildToolsVersion': '37.0.0',
  'android.cmakeVersion': '3.31.6',
  ndkVersion: '28.2.13676358',
};

module.exports = function withAndroidSdkVersions(config) {
  return withGradleProperties(config, gradleConfig => {
    gradleConfig.modResults = gradleConfig.modResults.filter(
      item => !(item.type === 'property' && item.key in PROPERTIES),
    );
    for (const [key, value] of Object.entries(PROPERTIES)) {
      gradleConfig.modResults.push({type: 'property', key, value});
    }
    return gradleConfig;
  });
};
