const {withPodfileProperties} = require('expo/config-plugins');

module.exports = function withIosQuickJS(config) {
  return withPodfileProperties(config, podfile => {
    const key = 'apple.extraPods';
    const pods = JSON.parse(podfile.modResults[key] ?? '[]').filter(
      pod => pod.name !== 'MoreChatQuickJS',
    );
    pods.push({
      name: 'MoreChatQuickJS',
      podspec: '../modules/code-exec/quickjs/MoreChatQuickJS.podspec',
    });
    podfile.modResults[key] = JSON.stringify(pods);
    return podfile;
  });
};
