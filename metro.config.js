const {getDefaultConfig} = require('expo/metro-config');

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The asm.js loader imports this only in its Node runtime branch.
  if (
    moduleName === 'module' &&
    /[/\\]@jitl[/\\]quickjs-asmjs-mjs-release-sync[/\\]/.test(
      context.originModulePath,
    )
  ) {
    return {type: 'empty'};
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
