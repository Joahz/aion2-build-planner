const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const boundsFile = () => path.join(app.getPath('userData'), 'window.json');
const readBounds = () => { try { return JSON.parse(fs.readFileSync(boundsFile(), 'utf8')); } catch { return null; } };

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 900, minHeight: 600,
    ...readBounds(),
    backgroundColor: '#0e1016',
    title: 'Aion 2 Build Planner',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join('app', 'index.html'));
  // Links (database pages, sources) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', () => { try { fs.writeFileSync(boundsFile(), JSON.stringify(win.getBounds())); } catch {} });
});

app.on('window-all-closed', () => app.quit());
