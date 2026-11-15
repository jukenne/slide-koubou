// スライド工房のアプリ本体（Electron）。
// index.html を専用ウィンドウで開き、「保存」「開く」を Windows 標準のダイアログにつなぐ。
const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const FILTERS = [{ name: 'HTMLスライド', extensions: ['html'] }];
const MAX_SIZE = 300 * 1024 * 1024;
let win = null;
let curPath = null;   // いま開いている／保存した資料の場所。画面側には渡さず、ここだけで持つ
let lastDir = null;   // 最後に使ったフォルダ（次のダイアログの最初の場所）
let dirty = false;    // 保存していない変更があるか（画面側から知らせてもらう）
let pending = null;   // 開くダイアログで選ばれたファイル（画面側が読み込みに成功するまでの仮置き）

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, show: false,
    title: 'スライド工房', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#f4f5f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.on('page-title-updated', ev => ev.preventDefault());
  win.on('close', ev => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', title: 'スライド工房', message: '保存していない変更がある。閉じる？',
      detail: '保存せずに閉じると、次に開いたとき続きから編集できるけど、ファイルには保存されていない。',
      buttons: ['保存せずに閉じる', 'キャンセル'], defaultId: 1, cancelId: 1, noLink: true
    });
    if (r === 1) ev.preventDefault();
  });
  win.on('closed', () => { win = null; app.quit(); });   // 編集画面を閉じたら、発表ウィンドウもまとめて終わる
}

// 新しいウィンドウ: 発表画面（blob:）だけ開く。Web のリンクは普段のブラウザに任せる。ほかは開かない
app.on('web-contents-created', (ev, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?:\/\/|mailto:)/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    if (/^blob:/i.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280, height: 760, title: '発表 - スライド工房', backgroundColor: '#000000', icon: path.join(__dirname, 'icon.png'),
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
        }
      };
    }
    return { action: 'deny' };
  });
  // ファイルを落としたときなどに、画面が別ページへ切り替わらないように（発表画面の blob: だけは通す）
  wc.on('will-navigate', (e, url) => { if (!/^blob:/i.test(url)) e.preventDefault(); });
  wc.on('before-input-event', (e, input) => {   // 調査用: F12 で開発者ツール
    if (input.type === 'keyDown' && input.key === 'F12') wc.toggleDevTools();
  });
});

const fromMain = ev => win && ev.sender === win.webContents;   // 編集画面からの頼みだけ受ける
const dirFor = name => path.join(lastDir || app.getPath('documents'), name);

ipcMain.handle('sk:save', async (ev, html, saveAs, name) => {
  if (!fromMain(ev) || typeof html !== 'string' || html.length > MAX_SIZE) return { error: '保存できない内容' };
  let p = curPath;
  if (!p || saveAs) {
    const safe = (String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'slides.html');
    const r = await dialog.showSaveDialog(win, { title: '資料を保存', defaultPath: curPath && saveAs ? curPath : dirFor(safe), filters: FILTERS });
    if (r.canceled || !r.filePath) return null;
    p = /\.html?$/i.test(r.filePath) ? r.filePath : r.filePath + '.html';
  }
  try {
    const tmp = p + '.tmp-' + process.pid;   // いったん別名で書いてから入れ替える（途中で落ちても元のファイルが壊れない）
    await fs.promises.writeFile(tmp, html, 'utf8');
    await fs.promises.rename(tmp, p);
  } catch (e) { return { error: e.message }; }
  curPath = p; lastDir = path.dirname(p);
  return { name: path.basename(p), dir: lastDir };
});

ipcMain.handle('sk:open', async ev => {
  if (!fromMain(ev)) return null;
  const r = await dialog.showOpenDialog(win, { title: '資料を開く', defaultPath: lastDir || app.getPath('documents'), filters: FILTERS, properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  try {
    if ((await fs.promises.stat(p)).size > MAX_SIZE) return { error: 'ファイルが大きすぎる' };
    const text = await fs.promises.readFile(p, 'utf8');
    pending = p;
    return { name: path.basename(p), text };
  } catch (e) { return { error: e.message }; }
});
// opened=true: 開くダイアログで選んだファイルを画面側が読み込めたので、それを「いまの資料」にする
// opened=false: 新しい資料を作ったので、保存先を忘れる
ipcMain.on('sk:reset', (ev, opened) => {
  if (!fromMain(ev)) return;
  curPath = opened && pending ? pending : null;
  if (curPath) lastDir = path.dirname(curPath);
  pending = null;
});
ipcMain.on('sk:state', (ev, s) => {
  if (!fromMain(ev) || !s) return;
  dirty = !!s.dirty;
  win.setTitle((s.title ? String(s.title).slice(0, 80) + (dirty ? ' ●' : '') + ' - ' : '') + 'スライド工房');
});

// 2つ目を起動したら、すでに開いているウィンドウを前に出すだけにする（同じ資料を2か所で編集して壊さないため）
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
