const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, ipcMain, systemPreferences, nativeImage } = require('electron');
const { analyzeScreenshot, errorMessage, MODEL } = require('./analyzer');

const { LiveMonitor } = require('./live-monitor');

const monitor = new LiveMonitor({
  capture: captureDisplayUnderCursor,
  analyze: async (jpeg, context) => {
    try { return await analyzeScreenshot(jpeg, context); }
    catch (err) { throw new Error(errorMessage(err)); }
  },
  emit: send,
});

const MOVE_STEP = 40;
const MAX_CAPTURE_WIDTH = 2400;

let win;
let clickThrough = false;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 440;
  const height = 560;

  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 20,
    y: workArea.y + 20,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Excludes the window from screen sharing, recordings and screenshots
  // (NSWindowSharingNone on macOS, WDA_EXCLUDEFROMCAPTURE on Windows).
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => {
    win.showInactive();
    send('config', { model: MODEL, hasKey: Boolean(process.env.ANTHROPIC_API_KEY) });
    if (process.env.ANTHROPIC_API_KEY && process.env.OVERLAY_LIVE !== '0') monitor.start();
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

async function captureDisplayUnderCursor() {
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    // Calling getSources triggers the permission prompt the first time.
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    throw new Error('Screen Recording permission needed: System Settings → Privacy & Security → Screen Recording → enable Electron, then restart the overlay.');
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error('Screen capture returned nothing');

  let image = source.thumbnail;
  if (image.getSize().width > MAX_CAPTURE_WIDTH) image = image.resize({ width: MAX_CAPTURE_WIDTH, quality: 'best' });
  // Mask our own UI even on capture backends that ignore content protection.
  // This prevents answers/status updates from triggering another analysis.
  const { width, height } = image.getSize();
  const pixels = image.toBitmap();
  if (win && win.isVisible()) {
    const bounds = win.getBounds();
    const sx = width / display.bounds.width;
    const sy = height / display.bounds.height;
    const left = Math.max(0, Math.floor((bounds.x - display.bounds.x) * sx));
    const right = Math.min(width, Math.ceil((bounds.x + bounds.width - display.bounds.x) * sx));
    const top = Math.max(0, Math.floor((bounds.y - display.bounds.y) * sy));
    const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height - display.bounds.y) * sy));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const i = (y * width + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 32;
        pixels[i + 3] = 255;
      }
    }
    image = nativeImage.createFromBitmap(pixels, { width, height });
  }
  const signature = image.resize({ width: Math.min(960, width), quality: 'best' });
  return { jpeg: image.toJPEG(85), pixels: signature.toBitmap(), source: `${source.id}:${width}x${height}` };
}

function runAnalysis() {
  void monitor.tick(true);
}

function toggleVisible() {
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function toggleClickThrough() {
  clickThrough = !clickThrough;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
  send('click-through', clickThrough);
}

function move(dx, dy) {
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}

function registerShortcuts() {
  const shortcuts = {
    'CommandOrControl+Shift+Enter': runAnalysis,
    'CommandOrControl+Shift+L': () => monitor.enabled ? monitor.stop() : monitor.start(),
    'CommandOrControl+Shift+H': toggleVisible,
    'CommandOrControl+Shift+K': toggleClickThrough,
    'CommandOrControl+Shift+R': () => send('clear'),
    'CommandOrControl+Shift+Up': () => move(0, -MOVE_STEP),
    'CommandOrControl+Shift+Down': () => move(0, MOVE_STEP),
    'CommandOrControl+Shift+Left': () => move(-MOVE_STEP, 0),
    'CommandOrControl+Shift+Right': () => move(MOVE_STEP, 0),
    'CommandOrControl+Shift+Q': () => app.quit(),
  };
  for (const [accelerator, handler] of Object.entries(shortcuts)) {
    if (!globalShortcut.register(accelerator, handler)) console.warn(`Shortcut ${accelerator} is taken by another app`);
  }
}

ipcMain.on('note', (_event, value) => monitor.setNote(String(value || '').slice(0, 2000)));
ipcMain.on('live', (_event, enabled) => enabled ? monitor.start() : monitor.stop());
ipcMain.on('analyze', runAnalysis);
ipcMain.on('hide', () => win.hide());

app.whenReady().then(() => {
  // No Dock icon and no Cmd+Tab entry.
  if (process.platform === 'darwin') app.dock.hide();
  createWindow();
  registerShortcuts();
  // Debug: OVERLAY_AUTOCHECK=1 npm start runs one check shortly after launch.
  if (process.env.OVERLAY_AUTOCHECK) setTimeout(runAnalysis, 3000);
});

app.on('will-quit', () => { monitor.stop(); globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());
