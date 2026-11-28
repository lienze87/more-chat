export async function loadQuickJS() {
  const [{default: variant}, {newQuickJSWASMModuleFromVariant}] =
    await Promise.all([
      import('@jitl/quickjs-singlefile-browser-release-sync'),
      import('quickjs-emscripten-core'),
    ]);
  return newQuickJSWASMModuleFromVariant(variant);
}
