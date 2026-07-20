// SPDX-License-Identifier: Apache-2.0
// Vite config installed over the upstream viewer's own config by build-from-source.sh.
//
// Differences from TinyTapeout/xschem-viewer's vite.config.js:
//   - `base: './'`            so the built page works under the webview's <base href="dist/">
//   - un-hashed asset names   so dist/assets/index.js keeps a stable path the extension can point at
//
// It deliberately does NOT use vite-plugin-string-replace (which upstream's extension build uses to
// rewrite the GitHub library URLs). This fork patches src/model/libraries.ts directly instead, so
// the library map is readable in source rather than produced by a build-time string substitution.
import child from 'child_process';
import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const commitHash = child.execSync('git rev-parse --short HEAD').toString();

export default defineConfig(() => {
  return {
    plugins: [solidPlugin()],

    define: {
      __COMMIT_HASH__: JSON.stringify(commitHash.trim()),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    resolve: {
      alias: [{ find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url)) }],
    },

    base: './',

    build: {
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name].js`,
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`,
        },
      },
    },
  };
});
