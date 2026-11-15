// アプリ版を exe つきのフォルダ（dist\スライド工房-win32-x64）にまとめる。使い方: npm run pack
// コマンドの引数で日本語の名前を渡すと文字が化けるので、名前は package.json の productName から読む
const path = require('path');
const root = path.join(__dirname, '..');

(async () => {
  const { packager } = await import('@electron/packager');
  const out = await packager({
    dir: root, out: path.join(root, 'dist'), overwrite: true,
    name: require(path.join(root, 'package.json')).productName,
    platform: 'win32', arch: 'x64', icon: path.join(root, 'app', 'icon.ico'),
    // アプリに入れるのは index.html・app・package.json だけ。資料（slides）や開発用のものは入れない
    ignore: [/^\/(slides|tools|dist|start\.bat|CLAUDE\.md|\.gitignore|\.claude|.*\.lnk)/]
  });
  // まとめ役のツールが、名前の濁点を「ト＋゛」の2文字に分けてしまう（見た目は同じでも別の名前扱いになる）。
  // そのままだとショートカットなどから見つけられないので、普通の「ド」1文字の名前に付け直す
  const fs = require('fs'), nfc = s => s.normalize('NFC');
  for (let dir of out) {
    for (const n of fs.readdirSync(dir)) if (n !== nfc(n)) fs.renameSync(path.join(dir, n), path.join(dir, nfc(n)));
    const to = path.join(path.dirname(dir), nfc(path.basename(dir)));
    if (to !== dir) { fs.rmSync(to, { recursive: true, force: true }); fs.renameSync(dir, to); dir = to; }
    console.log('ok', dir);
  }
})().catch(e => { console.error(e); process.exit(1); });
