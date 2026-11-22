const {withGradleProperties} = require('expo/config-plugins');

/**
 * Pin the Android SDK / NDK versions used by `expo prebuild`.
 *
 * React Native 0.88 / Expo SDK 58 default to compileSdk 37, build-tools 37.0.0
 * and NDK 27.1.12297006. This project historically builds against SDK 36 and
 * NDK 28.2.13676358 (see README), so keep those versions when regenerating the
 * native project.
 *
 * - `android.*` properties are read by expo-autolinking's version catalog.
 * - bare `ndkVersion` becomes a project property consumed by expo-root-project.
 */
const PROPERTIES = {
  'android.compileSdkVersion': '36',
  'android.buildToolsVersion': '36.0.0',
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
