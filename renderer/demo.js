// Claude Code 없이도 사무실이 돌아가도록 가짜 이벤트를 만든다.
(function () {
  const PROJ = '__demo';
  const BASE = { proj: PROJ, projName: '데모 오피스' };
  const TOOLS = [
    ['Read', 'office.js'], ['Grep', 'roomForTool'], ['Glob', '**/*.ts'], ['Read', 'package.json'],
    ['Edit', 'main.js'], ['Write', 'README.md'], ['MultiEdit', 'pixel.js'],
    ['Bash', 'npm test'], ['Bash', 'git status'], ['Bash', 'npm run build'],
    ['WebSearch', 'electron contextBridge'], ['WebFetch', 'developer.mozilla.org'], ['mcp__github__search_issues', 'office bug'],
    ['TodoWrite', '할 일 4개'], ['Skill', 'review'],
  ];
  const SAYS = ['파일 구조를 확인했어요. 이제 고칠게요.', '테스트가 모두 통과했어요!', '렌더러를 두 개로 나눴어요.', '이 부분은 질문이 있어요.', '빌드 성공. 확인 부탁드려요.'];
  const ASKS = ['로그인 버그 좀 고쳐줘', '테스트 추가해줘', 'README 정리해줘'];
  const CODEX_TOOLS = [
    ['exec_command', 'rg "TODO" src', 'library'], ['exec_command', 'cargo test', 'server'], ['exec_command', 'pnpm build', 'server'],
    ['apply_patch', 'lib.rs', 'dev'], ['apply_patch', 'app.tsx', 'dev'], ['web_search', 'tokio select timeout', 'search'], ['update_plan', '', 'meeting'],
  ];
  const SUBS = [['코드베이스 탐색', 'Explore'], ['테스트 작성', 'general-purpose'], ['문서 조사', 'claude-code-guide'], ['리뷰', 'Plan']];

  let timers = [], running = false, seq = 0;
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  const later = (ms, fn) => timers.push(setTimeout(() => running && fn(), ms));

  function start(emit) {
    stop();
    running = true;
    const ev = (sess, agent, k, extra = {}) => emit([{ ...BASE, ts: Date.now(), src: sess.startsWith('demo-cx') ? 'codex' : 'claude', sess, agent, k, ...extra }]);

    // 쉬는 Claude 한 명은 2분 전 기록으로 라운지에 앉혀 둔다
    const past = Date.now() - 125e3;
    emit([
      { ...BASE, ts: past, sess: 'demo-3', agent: 'main', k: 'title', text: '어제 하던 리팩터링' },
      { ...BASE, ts: past, sess: 'demo-3', agent: 'main', k: 'tool', id: 'p1', name: 'Read', summary: 'old.js' },
      { ...BASE, ts: past, sess: 'demo-3', agent: 'main', k: 'result', id: 'p1' },
    ]);
    ev('demo-1', 'main', 'title', { text: '로그인 버그 고치기' });
    ev('demo-2', 'main', 'title', { text: '사무실 앱 만들기' });
    ev('demo-1', 'main', 'user', { text: rnd(ASKS) });

    function mainLoop(sess) {
      const r = Math.random();
      let wait = 1500 + Math.random() * 2500;
      if (r < 0.1) {
        ev(sess, 'main', 'say', { text: rnd(SAYS) });
        wait = 6000;
      } else if (r < 0.18) {
        ev(sess, 'main', 'think');
      } else if (r < 0.28) {
        spawnSub(sess);
      } else if (r < 0.31) {
        const id = 'd' + seq++;
        ev(sess, 'main', 'tool', { id, name: 'AskUserQuestion', summary: '어떤 방식이 좋을까요?' });
        later(4000, () => { ev(sess, 'main', 'user', { text: '첫 번째로 가자' }); ev(sess, 'main', 'result', { id }); });
        wait = 5000;
      } else {
        const [name, summary] = rnd(TOOLS), id = 'd' + seq++, dur = 800 + Math.random() * 4500;
        ev(sess, 'main', 'tool', { id, name, summary });
        later(dur, () => ev(sess, 'main', 'result', { id }));
        wait = Math.max(wait, dur + 300);
      }
      ev(sess, 'main', 'tokens', { n: 50 + Math.floor(Math.random() * 400) });
      later(wait, () => mainLoop(sess));
    }

    function spawnSub(sess) {
      const id = 'd' + seq++, agent = 'demo-sub-' + seq, [desc, subType] = rnd(SUBS);
      ev(sess, 'main', 'tool', { id, name: 'Task', summary: desc, desc, subType });
      let n = 3 + Math.floor(Math.random() * 4);
      const work = () => {
        if (n-- <= 0) {
          ev(sess, agent, 'say', { text: '다 했어요. 결과 정리해서 넘길게요.', desc, subType, toolUseId: id });
          later(2500, () => ev(sess, 'main', 'result', { id }));
          return;
        }
        const [name, summary] = rnd(TOOLS), tid = 'd' + seq++;
        ev(sess, agent, 'tool', { id: tid, name, summary, desc, subType, toolUseId: id });
        ev(sess, agent, 'tokens', { n: 80 + Math.floor(Math.random() * 300) });
        later(1500 + Math.random() * 2500, () => { ev(sess, agent, 'result', { id: tid }); later(400, work); });
      };
      later(1200, work);
    }

    // Codex 세션: exec_command / apply_patch / web_search
    ev('demo-cx', 'main', 'title', { text: 'Rust 파서 최적화' });
    function codexLoop() {
      const r = Math.random();
      let wait = 1800 + Math.random() * 2500;
      if (r < 0.12) { ev('demo-cx', 'main', 'say', { text: '패치 적용했어요. 테스트 돌려볼게요.' }); wait = 6000; }
      else if (r < 0.25) ev('demo-cx', 'main', 'think');
      else {
        const [name, summary, room] = rnd(CODEX_TOOLS), id = 'c' + seq++, dur = 800 + Math.random() * 4000;
        ev('demo-cx', 'main', 'tool', { id, name, summary, room });
        later(dur, () => ev('demo-cx', 'main', 'result', { id }));
        wait = Math.max(wait, dur + 300);
      }
      ev('demo-cx', 'main', 'tokens', { n: 40 + Math.floor(Math.random() * 300) });
      later(wait, codexLoop);
    }
    later(800, codexLoop);
    later(300, () => mainLoop('demo-1'));
    later(1500, () => mainLoop('demo-2'));
  }

  function stop() {
    running = false;
    timers.forEach(clearTimeout);
    timers = [];
  }

  window.Demo = { start, stop, PROJ, get running() { return running; } };
})();
