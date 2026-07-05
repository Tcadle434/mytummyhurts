const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo SDK 55 + Metro can mis-resolve react-native-web's internal subpaths when
// package exports are enabled. Falling back to classic resolution restores the
// expected `react-native` -> `react-native-web` mapping for web bundles.
config.resolver.unstable_enablePackageExports = false;
config.resolver.useWatchman = false;

// Keep the NestJS backend (server/) out of the React Native bundle graph. It
// imports Node-only packages (@nestjs/*, pg, etc.) that must never be crawled
// or bundled by Metro. Preserve any blockList the default Expo config set.
const serverBlock = /[\\/]server[\\/].*/;
// web/ hosts standalone web projects (landing page) with their own node_modules.
const webBlock = /[\\/]web[\\/].*/;
config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, serverBlock, webBlock)
  : [serverBlock, webBlock];

function isInside(parent, child) {
  const relativePath = path.relative(parent, child);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function getFileMetadata(absolutePath) {
  const stat = fs.lstatSync(absolutePath);
  const type = stat.isSymbolicLink() ? 'l' : stat.isDirectory() ? 'd' : stat.isFile() ? 'f' : null;

  if (!type) {
    return null;
  }

  return {
    modifiedTime: stat.mtime.getTime(),
    size: stat.size,
    type,
  };
}

const previousEnhanceMiddleware = config.server.enhanceMiddleware;

config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhancedMiddleware = previousEnhanceMiddleware
    ? previousEnhanceMiddleware(middleware, metroServer)
    : middleware;

  return (req, res, next) => {
    if (!req.url?.startsWith('/__instant_refresh_change')) {
      return enhancedMiddleware(req, res, next);
    }

    try {
      const requestUrl = new URL(req.url, 'http://localhost');
      const requestedFile = requestUrl.searchParams.get('file');

      if (!requestedFile) {
        res.writeHead(400);
        res.end('Missing file query parameter');
        return;
      }

      const absolutePath = path.resolve(__dirname, requestedFile);
      if (!isInside(__dirname, absolutePath)) {
        res.writeHead(400);
        res.end('File is outside project root');
        return;
      }

      const watcher = metroServer.getBundler().getBundler().getWatcher()._watcher;
      const backends = watcher?._backends ?? [];
      const backend = backends.find((candidate) => isInside(candidate.root, absolutePath));

      if (!backend) {
        res.writeHead(404);
        res.end('No Metro watcher backend owns this file');
        return;
      }

      const relativePath = path.relative(backend.root, absolutePath);
      const metadata = fs.existsSync(absolutePath) ? getFileMetadata(absolutePath) : null;

      backend.emitFileEvent(
        metadata
          ? {
              event: 'touch',
              relativePath,
              metadata,
            }
          : {
              event: 'delete',
              relativePath,
            },
      );

      res.writeHead(204);
      res.end();
    } catch (error) {
      res.writeHead(500);
      res.end(error instanceof Error ? error.message : 'Unknown instant refresh error');
    }
  };
};

// Resolve the local shared package (@mth/shared-domain). packages/ lives inside
// the project root so Metro already watches it; this forces resolution to the
// package's react-native entry (src/index.ts) regardless of symlink handling.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@mth/shared-domain': path.resolve(__dirname, 'packages/shared-domain'),
};

module.exports = config;
