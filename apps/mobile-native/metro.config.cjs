/* global __dirname */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../packages/finance-core')];
// Transformed universal sources also resolve Babel helpers from this app's
// isolated installation instead of relying on a parent web dependency graph.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), ...(config.resolver.nodeModulesPaths ?? [])];
module.exports = config;
