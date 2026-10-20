// ~/.claude/projects 아래 JSONL을 tail 방식으로 읽어 사무실 이벤트로 바꾼다. (main 프로세스 전용)
const fs = require('fs');
const path = require('path');
const os = require('os');

const DAY = 24 * 3600e3;
const RESTORE_WINDOW = 3 * 3600e3;
const RESTORE_BYTES = 384 * 1024;

function projectsRoot() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

// /a/b → -a-b (Claude Code의 프로젝트 폴더 이름 규칙, Codex 세션도 같은 층에 모이게)
const encodeCwd = cwd => cwd.replace(/[^a-zA-Z0-9]/g, '-');

function short(s, n = 60) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// tool_use input → 한 줄 요약
function summarize(name, input = {}) {
  if (input.file_path || input.notebook_path) return path.basename(input.file_path || input.notebook_path);
  if (input.command) return short(input.command, 48);
  if (input.pattern) return short(input.pattern, 40);
  if (input.query) return short(input.query, 48);
  if (input.url) { try { return new URL(input.url).host; } catch { return short(input.url, 40); } }
  if (input.description) return short(input.description, 48);
  if (input.skill) return input.skill;
  if (Array.isArray(input.todos)) return `할 일 ${input.todos.length}개`;
  return '';
}

const IGNORED_USER = /^\s*(<command-|<system-reminder>|<local-command|<task-notification>|Caveat:)/;

// 한 파일 안의 상태(토큰 중복 제거 등)를 들고 한 줄씩 이벤트로 바꾼다.
function makeParser(ctx) {
  const seenTokens = new Map(); // message.id → 지금까지 센 output_tokens
  return function parseLine(line) {
    let d;
    try { d = JSON.parse(line); } catch { return []; }
    // 프로젝트 폴더 이름과 맞는 cwd만 층 이름으로 쓴다 (세션 중 cd 한 경로 제외)
    if (d.cwd && !ctx.projName && d.cwd.replace(/[^a-zA-Z0-9]/g, '-') === ctx.proj) ctx.projName = path.basename(d.cwd);
    const ts = d.timestamp ? Date.parse(d.timestamp) || Date.now() : Date.now();
    // 옛 버전: 메인 파일 안에 isSidechain 줄이 섞여 있음
    const agent = ctx.agent || (d.isSidechain ? (d.agentId ? 'side-' + d.agentId : 'side') : 'main');
    const base = { ts, src: 'claude', proj: ctx.proj, projName: ctx.projName, sess: ctx.sess, agent };
    if (ctx.label && agent === ctx.agent) Object.assign(base, ctx.label);
    const out = [];

    if (d.type === 'summary' && d.summary) out.push({ ...base, agent: 'main', k: 'title', text: d.summary });
    if (d.type === 'ai-title' && d.aiTitle) out.push({ ...base, agent: 'main', k: 'title', text: d.aiTitle });
    if (d.type === 'custom-title' && d.customTitle) out.push({ ...base, agent: 'main', k: 'title', text: d.customTitle });

    const msg = d.message;
    if (d.type === 'assistant' && msg && Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === 'tool_use') {
          const ev = { ...base, k: 'tool', id: c.id, name: c.name, summary: summarize(c.name, c.input) };
          if (c.name === 'Task' || c.name === 'Agent') {
            ev.desc = short(c.input?.description, 40);
            ev.subType = c.input?.subagent_type || 'general-purpose';
          }
          out.push(ev);
        } else if (c.type === 'text' && c.text?.trim()) {
          out.push({ ...base, k: 'say', text: short(c.text, 140) });
        } else if (c.type === 'thinking' || c.type === 'redacted_thinking') {
          out.push({ ...base, k: 'think' });
        }
      }
      const outTok = msg.usage?.output_tokens;
      if (msg.id && outTok > 0) {
        const prev = seenTokens.get(msg.id) || 0;
        if (outTok > prev) {
          seenTokens.set(msg.id, outTok);
          out.push({ ...base, k: 'tokens', n: outTok - prev });
        }
      }
    }

    if (d.type === 'user' && msg) {
      if (typeof msg.content === 'string') {
        if (!d.isMeta && !d.isSidechain && !IGNORED_USER.test(msg.content) && msg.content.trim())
          out.push({ ...base, k: 'user', text: short(msg.content, 140) });
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (c.type === 'tool_result') {
            const txt = typeof c.content === 'string' ? c.content
              : Array.isArray(c.content) ? c.content.map(x => x.text || '').join('') : '';
            // 백그라운드 에이전트는 "launched" 결과가 즉시 오므로 퇴근 신호가 아님
            out.push({ ...base, k: 'result', id: c.tool_use_id, async: /Async agent launched/.test(txt), error: !!c.is_error });
          }
        }
      }
    }
    return out;
  };
}

// ── Codex (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl) ─────────
const READ_CMD = /^\s*(cat|rg|grep|sed\s+-n|head|tail|ls|find|fd|nl|wc|bat|tree)\b/;

function codexRoom(name, cmd = '') {
  if (/apply_patch|write_file|edit_file/.test(name)) return 'dev';
  if (/^(shell|local_shell|exec_command|write_stdin|container\.exec|unified_exec)$/.test(name)) return READ_CMD.test(cmd) ? 'library' : 'server';
  if (/^(view_image|read_file|list_dir)$/.test(name)) return 'library';
  if (/web|search/.test(name) || name.startsWith('mcp__')) return 'search';
  if (/plan|agent/.test(name)) return 'meeting';
  if (/request_user_input|ask_user/.test(name)) return 'desk';
  return null;
}

// JS/JSON 객체 문자열에서 요약에 쓸 만한 값을 하나 꺼낸다
function pickArg(text) {
  const m = /\b(cmd|command|q|query|search_query|ref_id|url|path|file_path|title)"?\s*:\s*\[?\s*"((?:[^"\\]|\\.)*)"/.exec(text || '');
  if (!m) return { key: '', val: '' };
  let val = m[2].replace(/\\"/g, '"').replace(/\\n/g, ' ');
  return { key: m[1], val };
}

function codexToolEvent(p) {
  let name = p.name || p.type, text = '';
  if (p.type === 'function_call') {
    if (p.namespace) name = `${p.namespace}__${p.name}`;
    text = p.arguments || '';
    try { const a = JSON.parse(text); if (Array.isArray(a.command)) text = JSON.stringify({ cmd: a.command.join(' ').replace(/^bash -lc /, '') }); } catch {}
  } else if (p.type === 'custom_tool_call') {
    text = p.input || '';
    const inner = /tools\.([\w.]+)\(/.exec(text);
    if (p.name === 'exec' && inner) name = inner[1];
    if (/apply_patch/.test(name)) {
      const f = /\*\*\* (?:Update|Add|Delete) File: (.+)/.exec(text);
      return { name, summary: f ? path.basename(f[1].trim()) : '', room: 'dev' };
    }
  } else if (p.type === 'local_shell_call') {
    name = 'shell';
    text = JSON.stringify({ cmd: (p.action?.command || []).join(' ') });
  }
  const { key, val } = pickArg(text);
  let summary = val;
  if (/url|ref_id/.test(key) && /^https?:/.test(val)) { try { summary = new URL(val).host; } catch {} }
  else if (/path/.test(key)) summary = path.basename(val);
  return { name, summary: short(summary, 48), room: codexRoom(name, key === 'cmd' || key === 'command' ? val : '') };
}

function makeCodexParser(ctx) {
  let lastTotal = 0;
  return function parseLine(line) {
    let d;
    try { d = JSON.parse(line); } catch { return []; }
    const ts = d.timestamp ? Date.parse(d.timestamp) || Date.now() : Date.now();
    const base = { ts, src: 'codex', proj: ctx.proj, projName: ctx.projName, sess: ctx.sess, agent: 'main' };
    const p = d.payload || {};
    const out = [];
    if (d.type === 'response_item') {
      if (p.type === 'message' && Array.isArray(p.content)) {
        const text = p.content.map(c => c.text || '').join('').trim();
        if (p.role === 'assistant' && text) out.push({ ...base, k: 'say', text: short(text, 140) });
        if (p.role === 'user' && text && !text.startsWith('<')) out.push({ ...base, k: 'user', text: short(text, 140) });
      } else if (p.type === 'reasoning') {
        out.push({ ...base, k: 'think' });
      } else if (/^(function_call|custom_tool_call|local_shell_call)$/.test(p.type)) {
        out.push({ ...base, k: 'tool', id: p.call_id || p.id, ...codexToolEvent(p) });
      } else if (/_output$/.test(p.type) && p.call_id) {
        out.push({ ...base, k: 'result', id: p.call_id });
      } else if (p.type === 'web_search_call') {
        const id = p.id || 'ws' + ts;
        out.push({ ...base, k: 'tool', id, name: 'web_search', summary: short(p.action?.query, 48), room: 'search' }, { ...base, k: 'result', id });
      }
    } else if (d.type === 'event_msg' && p.type === 'token_count') {
      const total = p.info?.total_token_usage?.output_tokens;
      if (total > lastTotal) out.push({ ...base, k: 'tokens', n: total - lastTotal });
      if (total >= 0) lastTotal = total;
    }
    return out;
  };
}

// 첫 줄(session_meta)에서 cwd를 읽는다. 아직 첫 줄이 다 안 쓰였으면 null
function readCodexMeta(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const chunks = [], buf = Buffer.alloc(64 * 1024);
    for (let pos = 0; pos < 4 * 1024 * 1024;) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (!n) return null;
      const nl = buf.subarray(0, n).indexOf(10);
      chunks.push(Buffer.from(buf.subarray(0, nl < 0 ? n : nl)));
      if (nl >= 0) {
        const d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return d.payload?.cwd ? { cwd: d.payload.cwd, id: d.payload.id } : null;
      }
      pos += n;
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

class Watcher {
  constructor(onEvents, root = projectsRoot(), codexRoot = codexHome()) {
    this.root = root;
    this.codexRoot = codexRoot;
    this.codexTitles = new Map(); // 세션 id → thread_name
    this.codexIndexMtime = 0;
    this.onEvents = onEvents;
    this.files = new Map(); // path → { pos, buf, parse, ctx, mtime }
    this.projNames = new Map();
  }

  start() {
    this.scan(true);
    this.pollTimer = setInterval(() => this.poll(), 700);
    this.scanTimer = setInterval(() => this.scan(false), 4000);
  }

  stop() { clearInterval(this.pollTimer); clearInterval(this.scanTimer); }

  // 메인 세션과 subagents/agent-*.jsonl 목록
  listFiles() {
    const found = [];
    let projects = [];
    try { projects = fs.readdirSync(this.root, { withFileTypes: true }).filter(e => e.isDirectory()); } catch { return found; }
    for (const p of projects) {
      const pdir = path.join(this.root, p.name);
      let entries = [];
      try { entries = fs.readdirSync(pdir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith('.jsonl')) {
          found.push({ file: path.join(pdir, e.name), proj: p.name, sess: e.name.slice(0, -6), agent: null });
        } else if (e.isDirectory()) {
          const sdir = path.join(pdir, e.name, 'subagents');
          let subs = [];
          try { subs = fs.readdirSync(sdir); } catch { continue; }
          for (const s of subs) {
            const m = /^agent-(.+)\.jsonl$/.exec(s);
            if (m) found.push({ file: path.join(sdir, s), proj: p.name, sess: e.name, agent: m[1] });
          }
        }
      }
    }
    // Codex: sessions/YYYY/MM/DD/rollout-…-<uuid>.jsonl
    const walk = (dir, depth) => {
      let es = [];
      try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of es) {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && depth < 3) walk(full, depth + 1);
        else if (e.isFile() && depth === 3 && e.name.endsWith('.jsonl')) {
          const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(e.name);
          found.push({ file: full, codex: true, sess: m ? m[1] : e.name.slice(0, -6), agent: null });
        }
      }
    };
    walk(path.join(this.codexRoot, 'sessions'), 0);
    return found;
  }

  // ~/.codex/session_index.jsonl 의 thread_name을 세션 제목으로
  readCodexTitles(batch) {
    const file = path.join(this.codexRoot, 'session_index.jsonl');
    let st;
    try { st = fs.statSync(file); } catch { return; }
    if (st.mtimeMs === this.codexIndexMtime) return;
    this.codexIndexMtime = st.mtimeMs;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    for (const line of text.split('\n')) {
      try {
        const d = JSON.parse(line);
        if (!d.id || !d.thread_name || this.codexTitles.get(d.id) === d.thread_name) continue;
        this.codexTitles.set(d.id, d.thread_name);
        const entry = [...this.files.values()].find(e => e.ctx.src === 'codex' && e.ctx.sess === d.id);
        if (entry) batch.push(this.codexTitleEvent(entry.ctx, d.thread_name));
      } catch {}
    }
  }

  codexTitleEvent(ctx, text) {
    return { ts: Date.now(), src: 'codex', proj: ctx.proj, projName: ctx.projName, sess: ctx.sess, agent: 'main', k: 'title', text: short(text, 80) };
  }

  scan(initial) {
    const now = Date.now();
    const batch = [];
    for (const f of this.listFiles()) {
      if (this.files.has(f.file)) continue;
      let st;
      try { st = fs.statSync(f.file); } catch { continue; }
      if (now - st.mtimeMs > DAY) continue;
      let ctx, parse;
      if (f.codex) {
        const meta = readCodexMeta(f.file);
        if (!meta) continue; // 첫 줄이 다 쓰이면 다음 스캔에서 다시
        ctx = { src: 'codex', proj: encodeCwd(meta.cwd), projName: path.basename(meta.cwd) || meta.cwd, sess: f.sess, agent: null };
        if (!this.projNames.has(ctx.proj)) this.projNames.set(ctx.proj, ctx.projName);
        parse = makeCodexParser(ctx);
      } else {
        ctx = { src: 'claude', proj: f.proj, sess: f.sess, agent: f.agent, projName: this.projNames.get(f.proj) };
        if (f.agent) ctx.label = this.readMeta(f.file);
        parse = makeParser(ctx);
      }
      const entry = { pos: st.size, buf: '', parse, ctx, mtime: st.mtimeMs };
      this.files.set(f.file, entry);
      if (!f.agent) batch.push({ ts: st.mtimeMs, src: ctx.src, proj: ctx.proj, projName: ctx.projName || this.fallbackName(ctx.proj), sess: f.sess, agent: 'main', k: 'session' });
      if (f.codex && this.codexTitles.has(f.sess)) batch.push(this.codexTitleEvent(ctx, this.codexTitles.get(f.sess)));
      // 시작 시 최근 3시간 파일은 끝부분으로 상태 복원, 실행 중 새로 생긴 파일은 처음부터(최대 384KB)
      if (!initial || now - st.mtimeMs < RESTORE_WINDOW) {
        entry.pos = Math.max(0, st.size - RESTORE_BYTES);
        entry.skipPartial = entry.pos > 0;
        batch.push(...this.read(f.file, entry, st.size));
      }
    }
    this.readCodexTitles(batch);
    if (batch.length) this.onEvents(batch);
  }

  readMeta(file) {
    try {
      const m = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
      return { desc: short(m.description, 40), subType: m.agentType, toolUseId: m.toolUseId };
    } catch { return null; }
  }

  fallbackName(dir) {
    const home = os.homedir().replace(/[\/.]/g, '-');
    const rest = dir.startsWith(home) ? dir.slice(home.length).replace(/^-/, '') : dir;
    if (dir === '-') return '/';
    return rest || '~';
  }

  poll() {
    const now = Date.now();
    const batch = [];
    for (const [file, entry] of this.files) {
      if (now - entry.mtime > DAY) continue;
      let st;
      try { st = fs.statSync(file); } catch { this.files.delete(file); continue; }
      entry.mtime = st.mtimeMs;
      if (st.size < entry.pos) { entry.pos = 0; entry.buf = ''; } // 잘렸거나 새로 쓰임
      if (st.size > entry.pos) batch.push(...this.read(file, entry, st.size));
    }
    if (batch.length) this.onEvents(batch);
  }

  read(file, entry, size) {
    let text;
    try {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(size - entry.pos);
      fs.readSync(fd, b, 0, b.length, entry.pos);
      fs.closeSync(fd);
      text = b.toString('utf8');
    } catch { return []; }
    entry.pos = size;
    let data = entry.buf + text;
    if (entry.skipPartial) { // 중간부터 읽었으면 첫 조각은 버린다
      const nl = data.indexOf('\n');
      data = nl < 0 ? '' : data.slice(nl + 1);
      entry.skipPartial = nl < 0;
    }
    const lines = data.split('\n');
    entry.buf = lines.pop(); // 반쯤 쓰인 줄은 다음 읽기에서 이어 붙인다
    const out = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const evs = entry.parse(line);
      if (entry.ctx.projName && !this.projNames.has(entry.ctx.proj)) this.projNames.set(entry.ctx.proj, entry.ctx.projName);
      for (const e of evs) e.projName = e.projName || this.projNames.get(e.proj) || this.fallbackName(e.proj);
      out.push(...evs);
    }
    return out;
  }
}

module.exports = { Watcher, makeParser, makeCodexParser, summarize, projectsRoot, codexHome };
