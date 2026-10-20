// GitHub 릴리스에서 새 버전 확인 · 받아서 앱 교체. 저장소가 비공개라 읽기 전용 토큰이 필요하다.
// 서명 없는 앱이라 Squirrel 자동 업데이트 대신 dmg를 직접 받아 ditto로 바꿔 끼운다.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const REPO = 'KNamuuu/claude-office';
const cfgPath = () => path.join(app.getPath('userData'), 'update.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { return {}; } };

function setToken(token) {
  fs.writeFileSync(cfgPath(), JSON.stringify({ ...readCfg(), token: token.trim() }), { mode: 0o600 });
}

const newer = (a, b) => {  // a > b ?
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

async function check() {
  const current = app.getVersion();
  const { token } = readCfg();
  if (!token) return { current, needToken: true };
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (res.status === 401 || res.status === 404) return { current, needToken: true, error: '토큰이 맞지 않거나 저장소 읽기 권한이 없어요' };
  if (!res.ok) return { current, error: `GitHub 응답 ${res.status}` };
  const rel = await res.json();
  const latest = rel.tag_name.replace(/^v/, '');
  const asset = rel.assets.find(a => a.name.endsWith(`-${process.arch}.dmg`));
  return { current, latest, notes: rel.body || '', hasUpdate: newer(latest, current) && !!asset, assetUrl: asset?.url };
}

// 지금 실행 중인 .app 경로 (…/X.app/Contents/MacOS/X → …/X.app)
const appBundle = () => path.resolve(app.getPath('exe'), '../../..');

async function install(assetUrl, onProgress) {
  const target = appBundle();
  if (!target.endsWith('.app') || target.startsWith('/Volumes/')) throw new Error('응용 프로그램 폴더로 옮긴 앱에서만 업데이트할 수 있어요');
  fs.accessSync(path.dirname(target), fs.constants.W_OK);

  const res = await fetch(assetUrl, { headers: { Authorization: `Bearer ${readCfg().token}`, Accept: 'application/octet-stream' } });
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-'));
  const dmg = path.join(dir, 'update.dmg');
  const out = fs.createWriteStream(dmg);
  let got = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    got += chunk.length;
    if (total) onProgress(got / total);
  }
  await new Promise(r => out.end(r));

  const mnt = path.join(dir, 'mnt');
  execFileSync('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mnt]);
  const src = fs.readdirSync(mnt).find(n => n.endsWith('.app'));
  if (!src) { execFileSync('hdiutil', ['detach', mnt, '-force']); throw new Error('dmg 안에 앱이 없어요'); }

  // 앱이 꺼진 뒤 바꿔 끼우고 다시 실행
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
    `ditto ${q(path.join(mnt, src))} ${q(target + '.new')} && rm -rf ${q(target)} && mv ${q(target + '.new')} ${q(target)}`,
    `xattr -cr ${q(target)}`,
    `hdiutil detach ${q(mnt)} -force; rm -rf ${q(dir)}`,
    `open ${q(target)}`,
  ].join('\n');
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

module.exports = { check, install, setToken, newer };
