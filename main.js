const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { Watcher, projectsRoot, codexHome } = require('./watcher');

const RING = 5000;
const ring = [];
let win = null;

function send(batch) {
  ring.push(...batch);
  if (ring.length > RING) ring.splice(0, ring.length - RING);
  if (win && !win.isDestroyed()) win.webContents.send('office:events', batch);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 620,
    title: 'Claude 오피스',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#14121a',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });

  // 확인용: OFFICE_SHOT=경로.png 이면 몇 초 뒤 화면을 저장하고 종료
  if (process.env.OFFICE_SHOT) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('fs').writeFileSync(process.env.OFFICE_SHOT, img.toPNG());
      app.quit();
    }, Number(process.env.OFFICE_SHOT_DELAY || 6000)));
  }
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: '보기',
      submenu: [
        {
          label: '항상 위에 표시', type: 'checkbox', checked: false,
          click: (item) => win && win.setAlwaysOnTop(item.checked, 'floating'),
        },
        { type: 'separator' },
        { role: 'reload', label: '새로고침' },
        { role: 'toggleDevTools', label: '개발자 도구' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '전체 화면' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle('office:history', () => ring);
ipcMain.handle('office:info', () => ({
  root: projectsRoot(),
  codexRoot: require('path').join(codexHome(), 'sessions'),
  demo: process.env.OFFICE_DEMO === '1',
  style: process.env.OFFICE_STYLE || null,
}));

app.whenReady().then(() => {
  buildMenu();
  new Watcher(send).start();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
