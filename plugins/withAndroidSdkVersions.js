const {withGradleProperties} = require('expo/config-plugins');

// Expo and React Native supply compileSdk and Build Tools through their version catalog.
const PROPERTIES = {
  'android.cmakeVersion': '3.31.6',
  // quickjs-kt needs Kotlin 2.4 metadata support and Expo Pika needs a matching compiler.
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
