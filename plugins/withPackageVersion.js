const {version} = require('../package.json');

/**
 * Use package.json as the single source of the app version.
 *
 * expo prebuild stamps versionName in android/app/build.gradle from the
 * resolved Expo config. Taking version from package.json here keeps that
 * value in sync with the npm package: bump version and the next prebuild
 * (which pnpm android:build triggers when it detects the drift) stamps the
 * APK. app.json therefore carries no expo.version, leaving one source.
 */
module.exports = function withPackageVersion(config) {
  return {...config, version};
};
