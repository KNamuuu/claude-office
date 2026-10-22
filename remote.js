// SSH 서버의 ~/.claude/projects 를 이 컴퓨터로 계속 복사해 와서 Watcher가 함께 보게 한다. (main 프로세스 전용)
// 비밀번호는 처음 추가할 때 이 앱 전용 SSH 키를 서버에 등록하는 데만 쓰고 저장하지 않는다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const INTERVAL = 3000;      // 붙어 있을 때 복사 간격
const RETRY = 60e3;         // 접속이 안 되면 다시 시도하는 간격
const RECENT_MIN = 120;     // 최근 N분 안에 바뀐 기록만 복사

// OFFICE_REMOTE_DIR: 확인용으로 다른 폴더를 쓸 때
const dataDir = () => process.env.OFFICE_REMOTE_DIR || path.join(require('electron').app.getPath('userData'), 'remote');
const cfgPath = () => path.join(dataDir(), 'servers.json');
const keyPath = () => path.join(dataDir(), 'id_ed25519');
const askpassPath = () => path.join(dataDir(), 'askpass.sh');
const hostRoot = id => path.join(dataDir(), id, 'projects');

const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch { return []; } };
const writeCfg = list => { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(cfgPath(), JSON.stringify(list, null, 2), { mode: 0o600 }); };

function run(cmd, args, opts = {}) {
  return new Promise(resolve => {
    const child = execFile(cmd, args, { timeout: opts.timeout || 30e3, env: { ...process.env, ...opts.env }, maxBuffer: 8 << 20 },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr).trim(), code: err && err.code }));
    if (opts.input != null) child.stdin.end(opts.input);
  });
}

// 이 앱 전용 키 (없으면 만든다)
async function ensureKey() {
  fs.mkdirSync(dataDir(), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(keyPath())) {
    const r = await run('/usr/bin/ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'claude-office', '-f', keyPath()]);
    if (!r.ok) throw new Error('SSH 키를 만들지 못했어요: ' + r.stderr);
  }
  return fs.readFileSync(keyPath() + '.pub', 'utf8').trim();
}

const target = s => s.user ? `${s.user}@${s.host}` : s.host;
// -i 를 주면 ssh가 기본 키(~/.ssh/id_*)를 안 쓰므로 함께 넘긴다. ~/.ssh/config 별칭·IdentityFile은 그대로 쓰인다
const DEFAULT_KEYS = ['id_ed25519', 'id_ecdsa', 'id_rsa'].map(n => path.join(os.homedir(), '.ssh', n));
// 키 접속은 연결 하나를 재사용한다 (3초마다 새로 접속하면 서버 auth 로그·fail2ban·MaxStartups에 걸림).
// 소켓 경로는 104자 제한이 있다. macOS os.tmpdir()(/var/folders/…)도 %C(40자)+임시 접미사를 붙이면 넘쳐서 /tmp에 사용자별로 둔다
const controlOpts = () => ['-o', 'ControlMaster=auto', '-o', 'ControlPersist=60', '-o', `ControlPath=/tmp/co${process.getuid()}-%C`];
const sshOpts = (s, batch = true) => [
  ...(batch ? ['-o', 'BatchMode=yes', ...controlOpts()] : ['-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'NumberOfPasswordPrompts=1', '-o', 'PreferredAuthentications=password,keyboard-interactive']),
  '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new',
  ...[keyPath(), ...DEFAULT_KEYS.filter(f => fs.existsSync(f))].flatMap(f => ['-i', f]),
  ...(s.port ? ['-p', String(s.port)] : []),
];

function friendly(stderr) {
  if (/Permission denied/i.test(stderr)) return '아이디나 비밀번호가 맞지 않아요';
  if (/Could not resolve|nodename nor servname/i.test(stderr)) return '서버 주소를 찾을 수 없어요';
  if (/timed out|No route|Network is unreachable/i.test(stderr)) return '서버에 닿지 않아요 (VPN·네트워크 확인)';
  if (/Connection refused/i.test(stderr)) return '서버가 접속을 거부했어요 (포트 확인)';
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION/i.test(stderr)) return '서버 지문이 예전과 달라요 (~/.ssh/known_hosts 확인)';
  return stderr.split('\n').pop() || '연결하지 못했어요';
}

// 비밀번호로 한 번 접속해서 앱 전용 공개키를 authorized_keys 에 넣는다
async function installKey(s, password) {
  const pub = await ensureKey();
  fs.writeFileSync(askpassPath(), '#!/bin/sh\nprintf \'%s\\n\' "$CLAUDE_OFFICE_SSH_PASS"\n', { mode: 0o700 });
  const script = 'k=$(cat); umask 077; mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && (grep -qxF "$k" ~/.ssh/authorized_keys || echo "$k" >> ~/.ssh/authorized_keys)';
  const r = await run('/usr/bin/ssh', [...sshOpts(s, false), target(s), script], {
    input: pub + '\n',
    env: { SSH_ASKPASS: askpassPath(), SSH_ASKPASS_REQUIRE: 'force', DISPLAY: ':0', CLAUDE_OFFICE_SSH_PASS: password },
  });
  if (!r.ok) throw new Error(friendly(r.stderr));
}

const findCmd = `cd ~/.claude/projects 2>/dev/null && find . \\( -name '*.jsonl' -o -name '*.meta.json' \\) -mmin -${RECENT_MIN}`;

const loops = new Map(); // id → { timer, stopped }
const status = new Map(); // id → { ok, msg, at }

async function syncOnce(s) {
  await ensureKey();
  const ls = await run('/usr/bin/ssh', [...sshOpts(s), target(s), findCmd]);
  if (!ls.ok && ls.code !== 1) throw new Error(friendly(ls.stderr)); // 1: 서버에 아직 기록 폴더가 없음
  const files = ls.stdout.split('\n').filter(Boolean);
  if (!files.length) return 0;
  const dest = hostRoot(s.id);
  fs.mkdirSync(dest, { recursive: true });
  const list = path.join(dataDir(), s.id, 'files.txt');
  fs.writeFileSync(list, files.join('\n') + '\n');
  // --inplace: 덧붙여진 부분만 써서 Watcher의 tail 읽기가 처음부터 다시 읽지 않게
  const ssh = ['/usr/bin/ssh', ...sshOpts(s)].map(a => /\s/.test(a) ? `'${a}'` : a).join(' ');
  const r = await run('/usr/bin/rsync', ['-a', '--inplace', '-e', ssh, `--files-from=${list}`, `${target(s)}:.claude/projects/`, dest + '/'], { timeout: 120e3 });
  if (!r.ok) throw new Error(friendly(r.stderr));
  return files.length;
}

function startLoop(s) {
  stopLoop(s.id);
  const loop = { stopped: false };
  loops.set(s.id, loop);
  const tick = async () => {
    let wait = INTERVAL;
    try {
      const n = await syncOnce(s);
      status.set(s.id, { ok: true, msg: n ? `최근 기록 ${n}개 받는 중` : '연결됨 · 최근 기록 없음', at: Date.now() });
    } catch (e) {
      status.set(s.id, { ok: false, msg: e.message, at: Date.now() });
      wait = RETRY;
    }
    if (!loop.stopped) loop.timer = setTimeout(tick, wait);
  };
  tick();
}

function stopLoop(id) {
  const l = loops.get(id);
  if (l) { l.stopped = true; clearTimeout(l.timer); loops.delete(id); }
}

const slug = s => s.replace(/[^a-zA-Z0-9가-힣._-]/g, '-').slice(0, 40) || 'server';

function list() {
  return readCfg().map(s => ({ ...s, status: status.get(s.id) || { ok: null, msg: '연결 중…' } }));
}

async function add({ host, user, port, password, name }) {
  host = String(host || '').trim(); user = String(user || '').trim(); name = String(name || '').trim() || host;
  port = Number(port) || 0;
  if (!host) throw new Error('서버 주소를 적어 주세요');
  const cfg = readCfg();
  let id = slug(name);
  while (cfg.some(s => s.id === id)) id += '-2';
  const s = { id, name, host, user, port };
  if (password) await installKey(s, password);
  // 키로 접속되는지 확인 (비밀번호를 안 넣었으면 ~/.ssh/config·기존 키로 되는지)
  await ensureKey();
  const r = await run('/usr/bin/ssh', [...sshOpts(s), target(s), 'true']);
  if (!r.ok) throw new Error(password ? friendly(r.stderr) : `${friendly(r.stderr)} · 처음이면 비밀번호를 함께 넣어 주세요`);
  writeCfg([...cfg, s]);
  startLoop(s);
  return list();
}

function remove(id) {
  stopLoop(id);
  const s = readCfg().find(x => x.id === id);
  if (s) run('/usr/bin/ssh', [...sshOpts(s), '-O', 'exit', target(s)]); // 재사용 중인 연결 닫기
  status.delete(id);
  writeCfg(readCfg().filter(s => s.id !== id));
  fs.rmSync(path.join(dataDir(), id), { recursive: true, force: true });
  return list();
}

function start() { for (const s of readCfg()) startLoop(s); }

// Watcher가 함께 볼 폴더들
// 층 구분은 id로(이름이 같은 서버도 안 섞이게), 층 이름에는 name을 쓴다
const roots = () => readCfg().map(s => ({ root: hostRoot(s.id), id: s.id, host: s.name }));

module.exports = { start, list, add, remove, roots, syncOnce, installKey };
