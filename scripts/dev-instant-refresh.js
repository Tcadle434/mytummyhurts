#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const WebSocket = require('ws');

const projectRoot = path.resolve(__dirname, '..');
const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const userArgs = process.argv.slice(2);
const expoArgs = ['expo', ...(userArgs.length > 0 ? userArgs : ['start', '--dev-client', '--lan'])];

const reloadableExtensions = new Set([
  '.avif',
  '.cjs',
  '.css',
  '.gif',
  '.heic',
  '.jpeg',
  '.jpg',
  '.js',
  '.json',
  '.jsx',
  '.m4a',
  '.mp3',
  '.otf',
  '.png',
  '.svg',
  '.ts',
  '.tsx',
  '.ttf',
  '.wav',
  '.webp',
  '.xml',
  '.yml',
  '.yaml',
]);

const watchTargets = [
  'src',
  'assets',
  'App.tsx',
  'index.ts',
  'app.json',
  'babel.config.js',
  'metro.config.js',
];

const ignoredSegments = new Set([
  '.DS_Store',
  '.expo',
  '.git',
  'ios',
  'node_modules',
  'output',
  'supabase',
]);

let metroReady = false;
let metroPort = 8081;
let reloadTimer = null;
let lastReloadAt = 0;
const knownMtimes = new Map();
const queuedMtimes = new Map();

function shouldIgnore(relativePath) {
  if (!relativePath) return true;

  const normalized = relativePath.split(path.sep);
  if (normalized.some((segment) => ignoredSegments.has(segment))) return true;

  const basename = path.basename(relativePath);
  if (basename.startsWith('.') && basename !== '.env.local') return true;
  if (basename.endsWith('~') || basename.endsWith('.tmp') || basename.endsWith('.swp')) return true;

  const ext = path.extname(relativePath);
  return ext !== '' && !reloadableExtensions.has(ext);
}

function broadcastReload(reason) {
  const socket = new WebSocket(`ws://127.0.0.1:${metroPort}/message`);

  socket.on('open', () => {
    socket.send(
      JSON.stringify({
        version: 2,
        method: 'reload',
      }),
    );
    setTimeout(() => socket.close(), 150);
  });

  socket.on('error', (error) => {
    console.warn(`[instant-refresh] Could not send reload (${reason}): ${error.message}`);
  });
}

function notifyMetroFileChange(relativePath) {
  return new Promise((resolve) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        path: `/__instant_refresh_change?file=${encodeURIComponent(relativePath)}`,
        port: metroPort,
        timeout: 1000,
      },
      (response) => {
        response.resume();
        response.on('end', resolve);
      },
    );

    request.on('error', (error) => {
      console.warn(`[instant-refresh] Could not notify Metro about ${relativePath}: ${error.message}`);
      resolve();
    });
    request.on('timeout', () => {
      request.destroy();
      resolve();
    });
    request.end();
  });
}

function queueReload(relativePath) {
  if (!metroReady || shouldIgnore(relativePath)) return;

  const absolutePath = path.join(projectRoot, relativePath);
  const currentMtime = fs.existsSync(absolutePath) ? fs.statSync(absolutePath).mtimeMs : -1;
  if (queuedMtimes.get(relativePath) === currentMtime) {
    return;
  }
  queuedMtimes.set(relativePath, currentMtime);
  knownMtimes.set(relativePath, currentMtime);

  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const now = Date.now();
    const wait = Math.max(0, 800 - (now - lastReloadAt));

    setTimeout(() => {
      lastReloadAt = Date.now();
      console.log(`\n[instant-refresh] ${relativePath} changed; invalidating Metro and reloading connected app(s).`);
      notifyMetroFileChange(relativePath).then(() => {
        setTimeout(() => broadcastReload(relativePath), 120);
      });
    }, wait);
  }, 250);
}

function watchPath(target) {
  const absolutePath = path.join(projectRoot, target);
  if (!fs.existsSync(absolutePath)) return;

  const stat = fs.statSync(absolutePath);
  const options = stat.isDirectory() ? { recursive: true } : {};

  const watcher = fs.watch(absolutePath, options, (_eventType, filename) => {
    const changedPath = stat.isDirectory() && filename ? path.join(target, filename.toString()) : target;
    queueReload(changedPath);
  });

  watcher.on('error', (error) => {
    console.warn(`[instant-refresh] Watch failed for ${target}: ${error.message}`);
  });
}

function visitReloadableFiles(target, visitor) {
  const absolutePath = path.join(projectRoot, target);
  if (!fs.existsSync(absolutePath)) return;

  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absolutePath, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(target, entry.name);
      if (shouldIgnore(relativePath)) continue;
      if (entry.isDirectory()) {
        visitReloadableFiles(relativePath, visitor);
      } else if (entry.isFile()) {
        visitor(relativePath, fs.statSync(path.join(projectRoot, relativePath)));
      }
    }
    return;
  }

  if (!shouldIgnore(target)) {
    visitor(target, stat);
  }
}

function snapshotWatchedFiles() {
  for (const target of watchTargets) {
    visitReloadableFiles(target, (relativePath, stat) => {
      knownMtimes.set(relativePath, stat.mtimeMs);
    });
  }
}

function pollWatchedFiles() {
  for (const target of watchTargets) {
    visitReloadableFiles(target, (relativePath, stat) => {
      const previousMtime = knownMtimes.get(relativePath);
      knownMtimes.set(relativePath, stat.mtimeMs);

      if (previousMtime !== undefined && previousMtime !== stat.mtimeMs) {
        queueReload(relativePath);
      }
    });
  }
}

const child = spawn(npxBin, expoArgs, {
  cwd: projectRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

// Expo may split readiness text across chunks in non-interactive mode. Once the
// process has had a moment to bind its port, allow save-triggered reloads.
setTimeout(() => {
  metroReady = true;
}, 3000);

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(chunk);

  const portMatch = text.match(/localhost:(\d+)/);
  if (portMatch) {
    metroPort = Number(portMatch[1]);
  }

  if (
    text.includes('Waiting on http://localhost:') ||
    text.includes('Logs for your project will appear below') ||
    text.includes('Using development build') ||
    text.includes('Web: http://localhost:8081')
  ) {
    metroReady = true;
  }
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
  process.exit();
});

for (const target of watchTargets) {
  watchPath(target);
}
snapshotWatchedFiles();
setInterval(pollWatchedFiles, 700);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    const input = chunk.toString();
    if (input === '\u0003') {
      child.kill('SIGINT');
      return;
    }
    if (input.toLowerCase() === 'r') {
      console.log('\n[instant-refresh] Manual reload requested.');
      broadcastReload('keyboard');
    }
  });
}

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
