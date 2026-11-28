const {withGradleProperties} = require('expo/config-plugins');

// Expo and React Native supply compileSdk and Build Tools through their version catalog.
const PROPERTIES = {
  'android.cmakeVersion': '3.31.6',
  // quickjs-kt 的 AAR 由 Kotlin 2.4 编译，编译器版本低于 2.4 读不了它的元数据。
  'android.kotlinVersion': '2.4.20',
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

// 打包脚本用同一份属性判断生成工程是否过期。
module.exports.PROPERTIES = PROPERTIES;
