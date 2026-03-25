'use strict';

// Minimal preload script — exposes no Node.js APIs to the renderer by default.
// Extend this file if you need to expose safe IPC bridges via contextBridge.

const { contextBridge } = require('electron');

// Example: expose the app version to the web page
// contextBridge.exposeInMainWorld('electron', {
//   version: process.versions.electron,
// });
