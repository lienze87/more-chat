const {withGradleProperties} = require('expo/config-plugins');

// Expo and React Native supply compileSdk and Build Tools through their version catalog.
const PROPERTIES = {
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
