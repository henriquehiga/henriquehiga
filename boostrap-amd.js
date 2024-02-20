/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// Store the node.js require function in a variable
// before loading our AMD loader to avoid issues
// when this file is bundled with other files.
const nodeRequire = require;

// VSCODE_GLOBALS: node_modules
globalThis._VSCODE_NODE_MODULES = new Proxy(Object.create(null), { get: (_target, mod) => nodeRequire(String(mod)) });

// VSCODE_GLOBALS: package/product.json
/** @type Record<string, any> */
globalThis._VSCODE_PRODUCT_JSON = require('../product.json');
if (process.env['VSCODE_DEV']) {
  // Patch product overrides when running out of sources
  try {
    // @ts-ignore
    const overrides = require('../product.overrides.json');
    globalThis._VSCODE_PRODUCT_JSON = Object.assign(globalThis._VSCODE_PRODUCT_JSON, overrides);
  } catch (error) { /* ignore */ }
}
globalThis._VSCODE_PACKAGE_JSON = require('../package.json');

// @ts-ignore
const loader = require('./vs/loader');
const bootstrap = require('./bootstrap');
const performance = require('./vs/base/common/performance');

// Bootstrap: NLS
const nlsConfig = bootstrap.setupNLS();

// Bootstrap: Loader
loader.config({
  baseUrl: bootstrap.fileUriFromPath(__dirname, { isWindows: process.platform === 'win32' }),
  catchError: true,
  nodeRequire,
  'vs/nls': nlsConfig,
  paths: { "apc": "file://./c:/Users/henri/AppData/Local/Programs/Microsoft VS Code/resources/app/out/patch" },
  recordStats: true
});

// Running in Electron
if (process.env['ELECTRON_RUN_AS_NODE'] || process.versions['electron']) {
  loader.define('fs', ['original-fs'], function (/** @type {import('fs')} */originalFS) {
    return originalFS;  // replace the patched electron fs with the original node fs for all AMD code
  });
}

// Pseudo NLS support
if (nlsConfig && nlsConfig.pseudo) {
  loader(['vs/nls'], function (/** @type {import('vs/nls')} */nlsPlugin) {
    nlsPlugin.setPseudoTranslation(!!nlsConfig.pseudo);
  });
}

/**
 * @param {string=} entrypoint
 * @param {(value: any) => void=} onLoad
 * @param {(err: Error) => void=} onError
 */
exports.load = function (entrypoint, onLoad, onError) {
  if (!entrypoint) {
    return;
  }

  // code cache config
  if (process.env['VSCODE_CODE_CACHE_PATH']) {
    loader.config({
      nodeCachedData: {
        path: process.env['VSCODE_CODE_CACHE_PATH'],
        seed: entrypoint
      }
    });
  }

  onLoad = onLoad || function () { };
  onError = onError || function (err) { console.error(err); };

  
  if (entrypoint === "vs/code/electron-main/main") {
    const fs = nodeRequire('fs');
    const p = nodeRequire('path');
    const readFile = fs.readFile;
    fs.readFile = function (path, options, callback) {
      if (path.endsWith(p.join('electron-main', 'main.js'))) {
        readFile(path, options, function () {
          loader(["apc/main"], console.log, console.log);
          callback.apply(this, arguments);
        });
      }
      else readFile(...arguments);
    };
  }
  performance.mark('code/fork/willLoadCode');
  // $apcExtensionBootstrapToken$
  loader([entrypoint], onLoad, onError);
};
