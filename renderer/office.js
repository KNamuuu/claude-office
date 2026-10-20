// 이벤트를 받아 층(프로젝트) · 세션 · 캐릭터 상태를 만들고, 매 프레임 캐릭터를 걷게 한다.
(function () {
  const { ROOM, roomForTool, findPath, canStep, roomAt } = window.Layout;
  const { COLORS } = window.Sprites;

  const REST_AFTER = 90e3;
  const HOME_AFTER = 30 * 60e3;
  const REPORT_AFTER = 3500;
  const SUB_IDLE = 45e3;
  const PENDING_MAX = 10 * 60e3; // 결과가 끝내 안 오는 도구는 이 시간 뒤 무시
  const SPEED = 3.4; // 타일/초
  const LOG_MAX = 300;

  const floors = new Map();
  const listeners = [];
  let replaying = false;
  const visible = { claude: true, codex: true }; // 상단 '보기' 선택

  const PIKS = ['red', 'yellow', 'blue'];
  const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

  function toolLabel(name, summary) {
    const n = name.startsWith('mcp__') ? name.split('__').slice(1).join('·') : name;
    return summary ? `${n} · ${summary}` : n;
  }

  function getFloor(ev) {
    let f = floors.get(ev.proj);
    if (!f) {
      f = {
        proj: ev.proj, name: ev.projName || ev.proj, sessions: new Map(), chars: new Map(),
        log: [], occ: new Map(), heat: { server: [], dev: [] }, elevators: [0, 0, 0], me: null,
        by: { claude: { tokens: 0, tools: 0, lastTs: 0, seq: 0 }, codex: { tokens: 0, tools: 0, lastTs: 0, seq: 0 } },
      };
      const r = ROOM.desk;
      f.me = { key: '__me', kind: 'me', name: '나', color: COLORS.me, x: r.meTile.x + 0.5, y: r.meTile.y + 0.5, dir: 'd', path: [], chip: null, bubble: null, said: null };
      floors.set(ev.proj, f);
    }
    if (ev.projName && !ev.projName.startsWith('-')) f.name = ev.projName;
    return f;
  }

  function getSession(f, id, src) {
    let s = f.sessions.get(id);
    if (!s) {
      s = { id, src, title: '', lastTs: 0, tokens: 0, tools: 0, tasks: new Map(), num: 0 };
      f.sessions.set(id, s);
    }
    return s;
  }

  function getChar(f, s, ev) {
    const key = ev.sess + '/' + ev.agent;
    let c = f.chars.get(key);
    if (!c) {
      const isSub = ev.agent !== 'main';
      c = {
        key, sess: ev.sess, agent: ev.agent, isSub, src: s.src, kind: isSub ? 'sub' : s.src,
        name: 'Claude', label: '', toolCount: 0, pending: new Map(), lastTool: null, lastSay: null, lastThink: 0,
        lastTs: ev.ts, firstTs: ev.ts, done: false, gone: true, x: 0, y: 0, dir: 'd', path: [], target: null, room: null,
        color: isSub ? COLORS.subs[hash(key) % COLORS.subs.length] : COLORS[s.src], chip: '', action: '', bubble: null,
        pik: PIKS[hash(key + ':pik') % PIKS.length], // 정원 스타일 색: 세션마다 랜덤(같은 세션은 항상 같은 색)
      };
      if (isSub) {
        let tid = ev.toolUseId, info = tid && s.tasks.get(tid);
        if (!info) { // 메타 파일이 없는 옛 형식: 아직 짝이 없는 가장 오래된 Task와 연결
          for (const [id, t] of s.tasks) if (!t.claimed) { tid = id; info = t; break; }
        }
        if (info) info.claimed = true;
        c.toolUseId = tid;
        c.label = ev.desc || info?.desc || '';
        c.subType = ev.subType || info?.subType || 'general-purpose';
        c.name = c.label || c.subType || '서브에이전트';
      } else {
        s.num = ++f.by[s.src].seq;
      }
      f.chars.set(key, c);
    }
    return c;
  }

  function log(f, ts, who, text, kind, src, sess, agent) {
    f.log.push({ ts, who, text, kind, src, sess, agent });
    // 여러 파일에서 오는 이벤트가 섞여도 시간순 유지
    if (f.log.length > 1 && f.log[f.log.length - 2].ts > ts) f.log.sort((a, b) => a.ts - b.ts);
    if (f.log.length > LOG_MAX) f.log.splice(0, f.log.length - LOG_MAX);
  }

  function handle(ev) {
    const f = getFloor(ev);
    const s = getSession(f, ev.sess, ev.src || 'claude');
    const B = f.by[s.src];
    if (ev.k === 'session') { s.lastTs = Math.max(s.lastTs, ev.ts); return; }
    if (ev.k === 'title') { s.title = ev.text; return; }
    s.lastTs = Math.max(s.lastTs, ev.ts);
    B.lastTs = Math.max(B.lastTs, ev.ts);
    if (ev.k === 'tokens') { B.tokens += ev.n; s.tokens += ev.n; return; }
    if (ev.k === 'user') {
      s.request = ev.text; s.requestTs = ev.ts;
      const main = f.chars.get(ev.sess + '/main');
      if (main) { main.completed = false; main.lastSay = null; main.lastThink = 0; main.lastTool = null; main.lastError = null; main.pending.clear(); main.lastTs = ev.ts; if (main.gone) wake(f, main); }
      f.me.said = { text: ev.text, ts: ev.ts };
      log(f, ev.ts, '나', '요청: ' + ev.text, 'user', s.src, s.id, 'main');
      return;
    }

    const c = getChar(f, s, ev);
    c.lastTs = Math.max(c.lastTs, ev.ts);
    if (c.gone && !c.done) wake(f, c);
    const who = () => displayName(f, c);
    const addLog = (text, kind) => log(f, ev.ts, who(), text, kind, s.src, s.id, c.agent);
    if (['tool', 'think', 'start'].includes(ev.k)) c.completed = false;
    if (ev.k === 'complete' || (ev.k === 'say' && ev.final)) { c.completed = true; c.completedTs = ev.ts; }

    if (ev.k === 'tool') {
      c.toolCount++; B.tools++; s.tools++;
      const room = ev.room || roomForTool(ev.name);
      c.pending.set(ev.id, { name: ev.name, summary: ev.summary, ts: ev.ts, room });
      c.lastTool = { name: ev.name, summary: ev.summary, ts: ev.ts, room };
      if (ev.name === 'Task' || ev.name === 'Agent') s.tasks.set(ev.id, { desc: ev.desc, subType: ev.subType, claimed: false });
      if (f.heat[room]) f.heat[room].push(ev.ts);
      addLog(toolLabel(ev.name, ev.summary), room);
    } else if (ev.k === 'result') {
      const pending = c.pending.get(ev.id);
      c.pending.delete(ev.id);
      c.lastResult = { ts: ev.ts, text: (pending ? toolLabel(pending.name, pending.summary) : '도구') + (ev.error ? ' · 실패' : ' · 결과 수신'), error: !!ev.error };
      c.lastError = ev.error ? c.lastResult : null;
      addLog(c.lastResult.text, ev.error ? 'error' : 'result');
      if (s.tasks.has(ev.id) && !ev.async) {
        for (const o of f.chars.values()) if (o.isSub && o.toolUseId === ev.id && !o.done) {
          o.done = true;
          log(f, ev.ts, displayName(f, o), '일을 마치고 퇴근', 'lobby', s.src, s.id, o.agent);
        }
      }
    } else if (ev.k === 'say') {
      c.lastSay = { text: ev.text, ts: ev.ts, ask: !!ev.ask };
      addLog('“' + ev.text + '”', 'say');
    } else if (ev.k === 'think') {
      c.lastThink = ev.ts;
    }
  }

  // 퇴근했던 캐릭터가 다시 일을 시작하면 엘리베이터로 출근
  function wake(f, c) {
    c.gone = false;
    c.leaving = false;
    c.target = null;
    if (replaying) return; // 복원 중엔 마지막에 자리로 바로 배치
    spawnAtElevator(f, c);
  }

  function spawnAtElevator(f, c) {
    const tiles = ROOM.lobby.elevatorTiles;
    const i = PIKS.indexOf(c.pik) % tiles.length; // 자기 색 양파(엘리베이터)에서 출근
    c.x = tiles[i].x + 0.5; c.y = tiles[i].y + 0.5; c.dir = 'd'; c.path = [];
    c.elevator = i;
    f.elevators[i] = performance.now() + 1800;
  }

  function displayName(f, c) {
    if (c.isSub) return c.name;
    const label = c.src === 'codex' ? 'Codex' : 'Claude';
    const mains = [...f.chars.values()].filter(o => !o.isSub && !o.gone && o.src === c.src);
    return mains.length > 1 ? `${label} ${f.sessions.get(c.sess)?.num || 1}` : label;
  }

  // 지금 시각 기준으로 캐릭터가 있어야 할 방과 상태를 정한다
  function decide(f, c, now) {
    const idle = now - c.lastTs;
    if (c.isSub ? (c.done || (idle > SUB_IDLE && !c.pending.size)) : (idle > HOME_AFTER && !c.pending.size)) {
      return { room: 'lobby', leave: true, chip: '퇴근', action: '엘리베이터로 퇴근 중' };
    }
    let pend = null;
    for (const p of c.pending.values()) if (now - p.ts < PENDING_MAX && (!pend || p.ts > pend.ts)) pend = p;
    if (pend) {
      const secs = Math.floor((now - pend.ts) / 1000);
      const label = toolLabel(pend.name, pend.summary);
      const lines = secs >= 1 ? [label, `응답 기다림 · ${secs}s`] : [label];
      if (pend.room === 'desk') return { room: 'desk', chip: '입력 필요', action: '질문하는 중 · ' + (pend.summary || ''), bubble: ['질문이 있어요!', ...lines.slice(1)] };
      return { room: pend.room, chip: '실행 중', action: label, bubble: lines };
    }
    if (c.lastError) return { room: c.room || 'dev', chip: '오류 확인', action: c.lastError.text, bubble: [c.lastError.text] };
    // 마지막 말이 질문이면 내 자리로 와서 답할 때까지 기다린다 (라운지로 가지 않음)
    if (!c.isSub && c.lastSay?.ask && c.lastSay.ts >= (c.lastTool ? c.lastTool.ts : 0) && now - c.lastSay.ts >= REPORT_AFTER) {
      return { room: 'desk', chip: '답변 기다림', action: '질문하고 답을 기다리는 중', bubble: ['질문이 있어요!', c.lastSay.text] };
    }
    if (c.completed) return { room: 'desk', chip: '응답 완료', action: '응답 완료 · 다음 요청 대기', bubble: c.lastSay ? [c.lastSay.text] : null };
    if (c.pending.size) return { room: c.room || 'dev', chip: '상태 미확인', action: '10분 이상 결과가 기록되지 않았어요', bubble: null };
    if (!c.isSub && idle > REST_AFTER) return { room: 'lounge', chip: '활동 없음', action: `마지막 활동 ${Math.floor(idle / 60000)}분 전` };
    const lastToolTs = c.lastTool ? c.lastTool.ts : 0;
    const stayRoom = c.room && c.room !== 'lobby' && c.room !== 'lounge' ? c.room : (c.lastTool ? c.lastTool.room : (c.isSub ? 'meeting' : 'dev'));
    if (c.lastSay && c.lastSay.ts >= lastToolTs) {
      const reporting = now - c.lastSay.ts >= REPORT_AFTER;
      if (reporting && !c.isSub) return { room: 'desk', chip: '응답 대기', action: '최근 메시지 · 완료 여부 미확인', bubble: [c.lastSay.text] };
      return { room: stayRoom, chip: c.isSub && reporting ? '보고 중' : '작업 중', action: '말하는 중', bubble: [c.lastSay.text] };
    }
    if (c.lastThink && c.lastThink >= lastToolTs) return { room: stayRoom, chip: '고민 중', action: '생각 정리 중', bubble: ['💭 …'] };
    return { room: stayRoom, chip: '작업 중', action: c.lastTool ? toolLabel(c.lastTool.name, c.lastTool.summary) : '출근', bubble: null };
  }

  function release(f, c) {
    if (c.target) f.occ.delete(c.target.x + ',' + c.target.y);
  }

  function claim(f, c, roomId, leave) {
    const r = ROOM[roomId];
    let spot;
    if (leave) {
      const i = c.elevator ?? PIKS.indexOf(c.pik) % r.elevatorTiles.length;
      spot = { ...r.elevatorTiles[i], dir: 'u' };
      c.elevator = i;
    } else {
      spot = [...r.slots, ...r.overflow].find(s => !f.occ.has(s.x + ',' + s.y)) || r.overflow[hash(c.key) % r.overflow.length];
      f.occ.set(spot.x + ',' + spot.y, c.key);
    }
    c.target = spot;
    c.room = roomId;
  }

  function route(c) {
    const sx = Math.max(0, Math.min(27, Math.floor(c.x))), sy = Math.max(0, Math.min(15, Math.floor(c.y)));
    const p = findPath(sx, sy, c.target.x, c.target.y) || [];
    c.path = [{ x: sx, y: sy }, ...p].map(t => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  }

  function walkAlong(c, dt) {
    let left = SPEED * dt;
    c.moving = c.path.length > 0;
    while (left > 0 && c.path.length) {
      const p = c.path[0], dx = p.x - c.x, dy = p.y - c.y, dist = Math.hypot(dx, dy);
      if (dist > 1e-6) c.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
      if (dist <= left) { c.x = p.x; c.y = p.y; left -= dist; c.path.shift(); }
      else { c.x += dx / dist * left; c.y += dy / dist * left; left = 0; }
    }
  }

  // 방향키로 '나'를 한 칸씩 움직인다 (#4). 내 의자 칸은 다른 캐릭터는 못 쓰지만 나는 돌아올 수 있다
  function moveMe(f, dx, dy) {
    const me = f.me;
    if (me.path.length) return;
    const x = Math.floor(me.x), y = Math.floor(me.y), nx = x + dx, ny = y + dy, home = ROOM.desk.meTile;
    me.dir = dx > 0 ? 'r' : dx < 0 ? 'l' : dy > 0 ? 'd' : 'u';
    const toHome = nx === home.x && ny === home.y && roomAt(x, y) === roomAt(nx, ny);
    if (toHome || canStep(x, y, nx, ny)) me.path = [{ x: nx + 0.5, y: ny + 0.5 }];
  }

  function step(f, c, now, dt, instant) {
    const d = decide(f, c, now);
    c.chip = d.chip; c.action = d.action; c.bubble = d.bubble || null;
    if (c.leaving && !d.leave) c.leaving = false;
    if (!c.target || c.room !== d.room || (d.leave && !c.leaving)) {
      release(f, c);
      claim(f, c, d.room, d.leave);
      c.leaving = !!d.leave;
      if (instant) {
        if (d.leave) { c.gone = true; release(f, c); c.target = null; return; }
        c.x = c.target.x + 0.5; c.y = c.target.y + 0.5; c.path = [];
      } else route(c);
    }
    walkAlong(c, dt);
    if (!c.path.length) {
      if (c.target && !c.moving) c.dir = c.target.dir;
      if (c.leaving && !c.exitAt) {
        c.exitAt = now + 900;
        f.elevators[c.elevator] = performance.now() + 1600;
      }
    }
    if (c.exitAt && now >= c.exitAt) {
      c.exitAt = 0; c.gone = true; c.leaving = false; release(f, c); c.target = null;
    }
  }

  function tick(dt, instant = false) {
    const now = Date.now();
    for (const f of floors.values()) {
      for (const c of f.chars.values()) if (!c.gone) step(f, c, now, dt, instant);
      // 이름 붙이기 (한 층에 Claude 여럿이면 번호)
      for (const c of f.chars.values()) if (!c.isSub) c.name = displayName(f, c);
      const me = f.me;
      walkAlong(me, dt);
      me.bubble = me.said && now - me.said.ts < 8000 ? [me.said.text] : null;
      for (const k of Object.keys(f.heat)) f.heat[k] = f.heat[k].filter(t => now - t < 30e3);
    }
  }

  // 기록 복원: 상태만 쌓고 마지막에 자리로 순간이동
  function replay(events) {
    replaying = true;
    for (const e of events) handle(e);
    replaying = false;
    for (const f of floors.values()) for (const c of f.chars.values()) {
      if (c.gone && !c.done && Date.now() - c.lastTs < (c.isSub ? SUB_IDLE : HOME_AFTER)) c.gone = false;
    }
    tick(0, true);
    emit();
  }

  function ingest(events) {
    for (const e of events) handle(e);
    emit();
  }

  function emit() { for (const l of listeners) l(); }

  function removeFloor(proj) { floors.delete(proj); emit(); }

  window.Office = {
    floors, tick, replay, ingest, removeFloor, toolLabel, moveMe,
    state: (f, c) => decide(f, c, Date.now()),
    taskTitle: (f, c) => c.isSub ? c.name : (f.sessions.get(c.sess)?.title || f.sessions.get(c.sess)?.request || '제목 없는 작업'),
    onChange: cb => listeners.push(cb),
    visible,
    present: f => [...f.chars.values()].filter(c => !c.gone && visible[c.src]),
    // 보기에서 켠 출처만 합산
    stat: f => {
      const o = { tokens: 0, tools: 0, lastTs: 0, sessions: 0 };
      for (const [src, b] of Object.entries(f.by)) if (visible[src]) { o.tokens += b.tokens; o.tools += b.tools; o.lastTs = Math.max(o.lastTs, b.lastTs); }
      for (const s of f.sessions.values()) if (visible[s.src]) o.sessions++;
      return o;
    },
    consts: { REST_AFTER, HOME_AFTER, SUB_IDLE },
  };
})();
