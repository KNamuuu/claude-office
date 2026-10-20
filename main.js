const { app, BrowserWindow, Menu, ipcMain, shell, dialog, clipboard } = require('electron');
const path = require('path');
const { Watcher, projectsRoot, codexHome } = require('./watcher');
const updater = require('./updater');

const RING = 5000;
const ring = [];
let win = null, watcher = null;

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
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  // 확인용: OFFICE_UPDATE_TEST=1 이면 새 버전이 있을 때 바로 받아서 설치
  if (process.env.OFFICE_UPDATE_TEST) {
    updater.check().then(r => { console.log('update-check', JSON.stringify(r)); if (r.hasUpdate) return updater.install(r.assetUrl, () => {}); })
      .catch(e => console.log('update-error', e.message));
  }
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
    {
      role: 'appMenu',
      submenu: [
        { role: 'about' },
        { label: '업데이트 확인…', click: () => win && win.webContents.send('office:openUpdate') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
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
    {
      role: 'help', label: '도움말',
      submenu: [{
        label: '진단 정보…',
        click: async () => {
          const text = `Claude Office v${app.getVersion()} · ${process.arch}\n` + watcher.diagnose();
          const r = await dialog.showMessageBox(win, { message: '진단 정보', detail: text, buttons: ['복사', '닫기'], defaultId: 0 });
          if (r.response === 0) clipboard.writeText(text);
        },
      }],
    },
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

ipcMain.handle('update:check', () => updater.check().catch(e => ({ current: app.getVersion(), error: e.message })));
ipcMain.handle('update:setToken', (_e, token) => { updater.setToken(token); return updater.check().catch(e => ({ error: e.message })); });
ipcMain.handle('update:install', (e, url) => updater.install(url, p => e.sender.send('update:progress', p)).then(() => ({}), err => ({ error: err.message })));

app.whenReady().then(() => {
  buildMenu();
  watcher = new Watcher(send);
  watcher.start();
  createWindow();
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
