/**
 * Adapted from the clean Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce:
 * electron-builder.config.ts, package.json's package command and
 * .github/workflows/build.yml's build-linux caller. InvokeAI
 * 4875d96531ca6712b288f6e660fcbb34143408c1 delegates desktop distribution to that
 * launcher in docs/src/content/docs/start-here/installation.mdx.
 *
 * This is an unsigned local Linux package, without a publishing/update feed.
 * Python/runtime/model artifacts have separate owners and are not app payloads.
 */
module.exports = {
  appId: 'studio.imagegen.desktop',
  productName: 'ImageGen Studio',
  executableName: 'imagegen-studio',
  directories: {
    output: 'release',
  },
  files: [
    'package.json',
    'dist/main/**/*',
    'dist/preload/**/*',
    'dist/renderer/**/*',
    '!dist/**/*.map',
  ],
  // electron-builder collects production dependencies and rebuilds the native
  // SQLite dependency for the selected Electron version instead of the host ABI.
  npmRebuild: true,
  asar: true,
  asarUnpack: ['**/*.node'],
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Graphics',
    artifactName: '${name}-${version}-${arch}.${ext}',
    extraResources: [{ from: 'dist/native/igs-wallet-bootstrap', to: 'igs-wallet-bootstrap' }],
  },
  publish: null,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  },
}
