// 파서 · tail 읽기 최소 확인: node test/watcher-check.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Watcher, makeParser } = require('../watcher');

const p = makeParser({ proj: 'P', sess: 'S', agent: null });
const L = o => JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', ...o });

let ev = p(L({ type: 'assistant', message: { id: 'm1', usage: { output_tokens: 10 }, content: [
  { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a/b/app.js' } },
  { type: 'tool_use', id: 't2', name: 'Task', input: { description: '탐색', subagent_type: 'Explore', prompt: 'x' } },
  { type: 'tool_use', id: 't3', name: 'WebFetch', input: { url: 'https://example.com/x' } },
  { type: 'text', text: '안녕' }, { type: 'thinking', thinking: '...' }] } }));
assert.deepStrictEqual(ev.map(e => e.k), ['tool', 'tool', 'tool', 'say', 'think', 'tokens']);
assert.strictEqual(ev[0].summary, 'app.js');
assert.strictEqual(ev[1].desc, '탐색'); assert.strictEqual(ev[1].subType, 'Explore');
assert.strictEqual(ev[2].summary, 'example.com');
// 같은 message.id 토큰은 차이만 센다
ev = p(L({ type: 'assistant', message: { id: 'm1', usage: { output_tokens: 25 }, content: [] } }));
assert.deepStrictEqual(ev.map(e => [e.k, e.n]), [['tokens', 15]]);
ev = p(L({ type: 'assistant', message: { id: 'm1', usage: { output_tokens: 25 }, content: [] } }));
assert.strictEqual(ev.length, 0);
// 사용자 요청 필터
assert.strictEqual(p(L({ type: 'user', message: { content: '버그 고쳐줘' } }))[0].k, 'user');
for (const c of ['<command-name>x', '<system-reminder>y', 'Caveat: z']) assert.strictEqual(p(L({ type: 'user', message: { content: c } })).length, 0);
assert.strictEqual(p(L({ type: 'user', isMeta: true, message: { content: 'hi' } })).length, 0);
// tool_result, 백그라운드 에이전트
ev = p(L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } }));
assert.deepStrictEqual([ev[0].k, ev[0].id, ev[0].async], ['result', 't2', true]);
// 제목, 옛 사이드체인
assert.strictEqual(p(L({ type: 'summary', summary: '제목' }))[0].text, '제목');
assert.strictEqual(p(L({ type: 'assistant', isSidechain: true, message: { content: [{ type: 'text', text: 'x' }] } }))[0].agent, 'side');

// tail: 반쯤 쓰인 줄은 다음 읽기에서 이어 붙인다
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-'));
fs.mkdirSync(path.join(root, 'proj', 'S1', 'subagents'), { recursive: true });
const main = path.join(root, 'proj', 'S1.jsonl');
const line = L({ type: 'assistant', cwd: '/x/proj', message: { content: [{ type: 'text', text: '반가워요' }] } });
fs.writeFileSync(main, line.slice(0, 20));
fs.writeFileSync(path.join(root, 'proj', 'S1', 'subagents', 'agent-ab.jsonl'), L({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'x', name: 'Bash', input: { command: 'ls' } }] } }) + '\n');
fs.writeFileSync(path.join(root, 'proj', 'S1', 'subagents', 'agent-ab.meta.json'), JSON.stringify({ description: '조사', agentType: 'Explore', toolUseId: 'tt' }));
const got = [];
const w = new Watcher(b => got.push(...b), root, path.join(root, 'no-codex'));
w.scan(true);
assert.ok(got.some(e => e.k === 'session'));
const sub = got.find(e => e.k === 'tool');
assert.deepStrictEqual([sub.agent, sub.desc, sub.toolUseId, sub.summary], ['ab', '조사', 'tt', 'ls']);
assert.ok(!got.some(e => e.k === 'say'));
fs.appendFileSync(main, line.slice(20) + '\n');
w.poll();
const say = got.find(e => e.k === 'say');
assert.ok(say && say.text === '반가워요' && say.projName === 'proj', 'partial line joined');
fs.rmSync(root, { recursive: true });
console.log('watcher-check OK');

// Codex
const { makeCodexParser } = require('../watcher');
const cp = makeCodexParser({ proj: 'P', sess: 'C' });
const R = payload => JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', type: 'response_item', payload });
let cx = cp(R({ type: 'custom_tool_call', call_id: 'k1', name: 'exec', input: 'text(await tools.exec_command({cmd:"rg foo src",max_output_tokens:4000}));' }));
assert.deepStrictEqual([cx[0].src, cx[0].k, cx[0].id, cx[0].name, cx[0].summary, cx[0].room], ['codex', 'tool', 'k1', 'exec_command', 'rg foo src', 'library']);
cx = cp(R({ type: 'function_call', call_id: 'k2', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', 'npm test'] }) }));
assert.deepStrictEqual([cx[0].name, cx[0].room], ['shell', 'server']);
cx = cp(R({ type: 'custom_tool_call', call_id: 'k3', name: 'apply_patch', input: '*** Begin Patch\n*** Update File: src/app.ts\n@@' }));
assert.deepStrictEqual([cx[0].summary, cx[0].room], ['app.ts', 'dev']);
assert.strictEqual(cp(R({ type: 'custom_tool_call_output', call_id: 'k1', output: [] }))[0].k, 'result');
assert.strictEqual(cp(R({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '완료' }] }))[0].k, 'say');
assert.strictEqual(cp(R({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>' }] })).length, 0);
assert.strictEqual(cp(R({ type: 'message', role: 'user', content: [{ type: 'input_text', text: '고쳐줘' }] }))[0].k, 'user');
const tok = n => JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { output_tokens: n } } } });
assert.strictEqual(cp(tok(100))[0].n, 100);
assert.strictEqual(cp(tok(130))[0].n, 30);
assert.strictEqual(cp(tok(130)).length, 0);
console.log('codex-check OK');

// Codex 압축 세션(.jsonl.zst)
{
  const zlib = require('zlib');
  const croot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-'));
  const day = path.join(croot, 'sessions', '2026', '10', '21');
  fs.mkdirSync(day, { recursive: true });
  const id = '01a15a16-3ce6-76a3-bb3c-116386669d7f';
  const body = [
    { timestamp: new Date().toISOString(), type: 'session_meta', payload: { id, cwd: '/x/zproj' } },
    { timestamp: new Date().toISOString(), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: '압축 안녕' }] } },
  ].map(d => JSON.stringify(d)).join('\n') + '\n';
  fs.writeFileSync(path.join(day, `rollout-2026-10-21T01-12-49-${id}.jsonl.zst`), zlib.zstdCompressSync(Buffer.from(body)));
  const got2 = [];
  const w2 = new Watcher(b => got2.push(...b), path.join(croot, 'none'), croot);
  w2.scan(true);
  assert.ok(got2.some(e => e.k === 'session' && e.src === 'codex' && e.sess === id && e.projName === 'zproj'), 'zst session');
  assert.ok(got2.some(e => e.k === 'say' && e.text === '압축 안녕'), 'zst say');
  fs.rmSync(croot, { recursive: true });
  console.log('codex-zst OK');
}
