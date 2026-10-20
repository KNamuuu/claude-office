// UI · 카메라 · 렌더 루프
(function () {
  const { Layout, Office, Demo } = window;
  const RENDERERS = { pixel: window.PixelRenderer, iso: window.IsoRenderer, garden: window.GardenRenderer };
  const ROOM_COLORS = { server: '#e05a5a', dev: '#e0a03f', library: '#a070e6', meeting: '#3fbab2', lounge: '#e86fa6', desk: '#e07a3f', search: '#5b8def', lobby: '#9aa0ab', say: '#8f88a3', user: '#37d67a' };
  const PIK_COLORS = { red: '#ed5445', yellow: '#f0d26d', blue: '#5da2e3' };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  const canvas = $('canvas'), g = canvas.getContext('2d');
  const ui = {
    style: store.get('office.style', 'pixel'), floor: null, sess: null, sel: null,
    follow: store.get('office.follow', '1') === '1', lastEventAt: 0, root: '',
  };
  let cam = { z: 1, px: 0, py: 0 }, view = { s: 1, tx: 0, ty: 0 }, marks = [];

  // ── 층 ──────────────────────────────
  // 보기에서 켠 출처(Claude/Codex)의 세션이 있는 층만
  const lastTs = f => Office.stat(f).lastTs;
  const floorList = () => [...Office.floors.values()].filter(f => Office.stat(f).sessions > 0).sort((a, b) => a.name.localeCompare(b.name));
  const floorNo = f => floorList().indexOf(f) + 1;
  const curFloor = () => floorList().find(f => f.proj === ui.floor) || null;
  const mostRecent = () => floorList().sort((a, b) => lastTs(b) - lastTs(a))[0] || null;

  function setFloor(proj) {
    if (ui.floor === proj) return;
    ui.floor = proj; ui.sess = null; ui.sel = null;
    renderPanels(true);
  }

  // 지금 층이 20초 이상 조용하면 더 최근에 활동한 층으로 이동
  function followTick() {
    const cur = curFloor(), top = mostRecent();
    if (!top) return;
    if (!cur) return setFloor(top.proj);
    if (ui.follow && top !== cur && Date.now() - lastTs(cur) >= 20e3 && lastTs(top) > lastTs(cur)) setFloor(top.proj);
  }

  // ── 스타일 ──────────────────────────
  function setStyle(s) {
    if (!RENDERERS[s]) return;
    ui.style = s;
    store.set('office.style', s);
    document.body.className = 'theme-' + s;
    for (const b of document.querySelectorAll('#styleSeg button')) b.classList.toggle('on', b.dataset.style === s);
    resetCam();
    renderLegend();
    renderPanels(true);
  }

  // ── 카메라 ──────────────────────────
  function resetCam() { cam = { z: 1, px: 0, py: 0 }; }

  function computeView() {
    const R = RENDERERS[ui.style], b = R.bounds();
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const s = Math.min(cw / b.w, ch / b.h) * cam.z;
    view = { s, tx: cw / 2 - (b.x + b.w / 2) * s + cam.px, ty: ch / 2 - (b.y + b.h / 2) * s + cam.py, cw, ch, b };
  }

  function zoomAt(mx, my, factor) {
    computeView();
    const z = Math.max(0.5, Math.min(6, cam.z * factor));
    const wx = (mx - view.tx) / view.s, wy = (my - view.ty) / view.s;
    const s2 = view.s * z / cam.z, b = view.b;
    cam.z = z;
    cam.px = mx - wx * s2 - (view.cw / 2 - (b.x + b.w / 2) * s2);
    cam.py = my - wy * s2 - (view.ch / 2 - (b.y + b.h / 2) * s2);
  }

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  let drag = null;
  canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, px: cam.px, py: cam.py, moved: false }; });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; canvas.classList.add('drag'); }
    cam.px = drag.px + dx; cam.py = drag.py + dy;
  });
  window.addEventListener('mouseup', e => {
    if (drag && !drag.moved) pick(e);
    drag = null; canvas.classList.remove('drag');
  });
  canvas.addEventListener('dblclick', resetCam);

  function pick(e) {
    const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    let hit = null;
    for (const m of marks) {
      const h = m.hit, x = h.x * view.s + view.tx, y = h.y * view.s + view.ty;
      if (mx >= x && mx <= x + h.w * view.s && my >= y && my <= y + h.h * view.s) hit = m.c;
    }
    ui.sel = hit && hit.kind !== 'me' ? hit.key : null;
    if (hit && hit.sess) ui.sess = hit.sess;
    renderPanels(true);
  }

  // ── 그리기 ──────────────────────────
  let lastFrame = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    Office.tick(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    }
    const R = RENDERERS[ui.style];
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = R.bg; g.fillRect(0, 0, cw, ch);
    const f = curFloor();
    $('empty').hidden = !!f;
    if (!f) { marks = []; return; }
    computeView();
    g.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.tx, dpr * view.ty);
    marks = R.draw(g, f, Date.now(), ui.sel);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(marks);
  }

  // 이름표와 말풍선은 화면 좌표에서 또렷하게 그리고, 말풍선끼리는 겹치지 않게 위로 밀어 올린다
  function drawLabels(marks) {
    const pixel = ui.style !== 'iso';
    const garden = ui.style === 'garden';
    const font = pixel ? '11px Menlo, monospace' : '600 11px -apple-system, "Apple SD Gothic Neo", sans-serif';
    const S = m => ({ x: m.tagX * view.s + view.tx, y: m.tagY * view.s + view.ty, ax: m.ax * view.s + view.tx, ay: m.ay * view.s + view.ty });
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';

    for (const m of marks) {
      const p = S(m), c = m.c, txt = garden && c.kind === 'claude' ? '✳ ' + c.name : garden && c.kind === 'codex' ? '>_ ' + c.name : garden && c.kind === 'me' ? '캡틴' : c.name, w = g.measureText(txt).width + (pixel ? 10 : 18), h = pixel ? 15 : 17;
      const x = p.x - w / 2, y = p.y;
      if (pixel) {
        g.fillStyle = 'rgba(10,9,14,0.85)'; g.fillRect(x, y, w, h);
        g.fillStyle = c.kind === 'me' ? '#8d97ab' : garden && c.pik ? PIK_COLORS[c.pik] : c.color; g.fillRect(x, y + h - 2, w, 2);
        g.fillStyle = '#efe9f7';
      } else {
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
        g.strokeStyle = c.key === ui.sel ? '#e07a3f' : 'rgba(0,0,0,0.08)'; g.lineWidth = 1; g.stroke();
        g.fillStyle = c.kind === 'me' ? '#5f6b7d' : c.kind === 'sub' ? '#3d7be0' : c.color;
        g.beginPath(); g.arc(x + 8, y + h / 2, 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#22252c';
      }
      g.fillText(txt, p.x + (pixel ? 0 : 4), y + h / 2 + 0.5);
    }

    const bubbles = marks.filter(m => m.c.bubble).map(m => {
      const p = S(m), lines = wrap(m.c.bubble, 26, 3);
      const lh = 15, w = Math.max(...lines.map(l => g.measureText(l).width)) + 16, h = lines.length * lh + 10;
      return { c: m.c, ax: p.ax, ay: p.ay, lines, lh, w, h, x: p.ax - w / 2, y: p.ay - h - 8 };
    }).sort((a, b) => b.ay - a.ay);
    const placed = [];
    for (const b of bubbles) {
      b.x = Math.max(4, Math.min(view.cw - b.w - 4, b.x)); // 캔버스 밖으로 안 나가게
      for (let i = 0; i < 30; i++) {
        const o = placed.find(p => b.x < p.x + p.w + 4 && b.x + b.w + 4 > p.x && b.y < p.y + p.h + 4 && b.y + b.h + 4 > p.y);
        if (!o) break;
        b.y = o.y - b.h - 6;
      }
      placed.push(b);
    }
    for (const b of placed) {
      const think = b.c.chip === '고민 중';
      g.strokeStyle = pixel ? '#e07a3f' : 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(b.ax, b.y + b.h); g.lineTo(b.ax, b.ay); g.stroke();
      if (pixel) {
        g.fillStyle = '#f6efe2'; g.fillRect(b.x, b.y, b.w, b.h);
        g.fillStyle = b.c.kind === 'me' ? '#8d97ab' : b.c.color; g.fillRect(b.x, b.y, 3, b.h);
        g.strokeStyle = '#1c1418'; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      } else {
        g.fillStyle = think ? '#f3efff' : '#ffffff';
        g.shadowColor = 'rgba(0,0,0,0.12)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
        g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 8); g.fill();
        g.shadowColor = 'transparent';
      }
      g.textAlign = 'left';
      b.lines.forEach((l, i) => {
        g.fillStyle = i > 0 && /^고민 중/.test(l) ? '#8a5bd6' : (pixel ? '#1c1418' : '#22252c');
        g.fillText(l, b.x + 9, b.y + 5 + b.lh * i + b.lh / 2 + 0.5);
      });
      g.textAlign = 'center';
    }
  }

  function wrap(lines, n, max) {
    const out = [];
    for (const raw of lines) {
      let s = String(raw);
      while (s.length > n && out.length < max) { out.push(s.slice(0, n)); s = s.slice(n); }
      if (out.length < max) out.push(s);
      else { out[max - 1] = out[max - 1].replace(/…$/, '').slice(0, n - 1) + '…'; break; }
    }
    return out;
  }

  // ── 패널 ────────────────────────────
  const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n);
  const hms = ts => new Date(ts).toTimeString().slice(0, 8);
  const ago = ts => { const s = (Date.now() - ts) / 1000; return s < 60 ? '방금' : s < 3600 ? Math.floor(s / 60) + '분 전' : Math.floor(s / 3600) + '시간 전'; };

  let lastPanelKey = '';
  function renderPanels(force) {
    const f = curFloor();
    const people = f ? Office.present(f) : [];
    // 머리말
    $('floorLabel').textContent = f ? `${floorNo(f)}F · ${f.name}` : 'Claude 오피스';
    const visSessions = x => [...x.sessions.values()].filter(s => Office.visible[s.src]).sort((a, b) => b.lastTs - a.lastTs);
    const sessions = f ? visSessions(f) : [];
    const st = f ? Office.stat(f) : { tokens: 0, tools: 0, sessions: 0 };
    const sess = (ui.sess && f?.sessions.get(ui.sess)) || sessions[0];
    $('sessTitle').textContent = sess ? (sess.title || '제목 없는 세션') : '';
    $('stSess').textContent = st.sessions;
    $('stPeople').textContent = people.length;
    $('stTok').textContent = fmtNum(st.tokens);
    $('stTools').textContent = st.tools;
    const live = $('live');
    live.classList.toggle('active', Date.now() - ui.lastEventAt < 15e3);
    live.classList.toggle('demo', Demo.running);
    live.lastChild.textContent = Demo.running ? 'DEMO' : 'LIVE';
    $('demoBtn').classList.toggle('on', Demo.running);

    // 층별 안내 (높은 층이 위)
    const list = floorList();
    const key = JSON.stringify([ui.floor, ui.sess, ui.sel, list.map(x => [x.proj, x.name, Office.present(x).length, x.sessions.size, Math.floor((Date.now() - lastTs(x)) / 30e3)]), sessions.map(s => [s.id, s.title, Math.floor((Date.now() - s.lastTs) / 60e3)])]);
    if (force || key !== lastPanelKey) {
      lastPanelKey = key;
      $('floors').innerHTML = list.slice().reverse().map(x => {
        const sel = x.proj === ui.floor, hot = Date.now() - lastTs(x) < 90e3;
        const ss = sel ? `<div class="sessions">${visSessions(x).map(s =>
          `<div class="sess ${s.id === ui.sess ? 'sel' : ''}" data-sess="${esc(s.id)}" title="${esc(s.title || s.id)}"><span class="src ${s.src}">${s.src === 'codex' ? 'CX' : 'CC'}</span>${esc(s.title || s.id.slice(0, 8))} · ${ago(s.lastTs)}</div>`).join('')}</div>` : '';
        return `<li class="floor ${sel ? 'sel' : ''}" data-proj="${esc(x.proj)}"><div class="fhead"><span class="fno">${floorNo(x)}F</span><span class="fname" title="${esc(x.name)}">${esc(x.name)}</span><span class="cnt">${Office.present(x).length}명</span><span class="dot ${hot ? 'hot' : ''}"></span></div>${ss}</li>`;
      }).join('');
    }

    // 사무실 사람들
    $('people').innerHTML = people.length ? people.map(c =>
      `<li class="${c.key === ui.sel ? 'sel' : ''}" data-key="${esc(c.key)}"><span class="sw" style="background:${c.color}"></span><span class="nm">${esc(c.name)}${c.isSub ? ` <small style="color:var(--dim)">${esc(c.subType || '')}</small>` : ''}</span><span class="chip ${esc(c.chip.split(' ')[0])}">${esc(c.chip)}</span><span class="act">${esc(c.action)}</span><span class="cnt">도구 ${c.toolCount}회</span></li>`
    ).join('') : '<li class="empty">지금은 아무도 없어요</li>';

    // 활동 로그 (최신이 위)
    const logs = f ? f.log.filter(l => Office.visible[l.src]).slice(-120).reverse() : [];
    $('log').innerHTML = logs.length ? logs.map(l =>
      `<li><span class="t">${hms(l.ts)}</span><span class="w" style="color:${ROOM_COLORS[l.kind] || 'inherit'}">${esc(l.who)}</span><span class="x" title="${esc(l.text)}">${esc(l.text)}</span></li>`
    ).join('') : '<li class="empty">아직 활동이 없어요</li>';
  }

  const GARDEN_NAMES = { server: '전기 동굴', dev: '다리 공사장', library: '낙엽 수풀', meeting: '작전 바위', lounge: '꽃밭 쉼터', desk: '캡틴 착륙선', search: '반짝 연못', lobby: '양파 착륙장' };
  function renderLegend() {
    const name = id => (ui.style === 'garden' ? GARDEN_NAMES[id] : Layout.ROOM[id].name);
    $('legend').innerHTML = Layout.LEGEND.map(([id, tools]) =>
      `<li><span class="sw" style="background:${ROOM_COLORS[id]}"></span><b>${esc(name(id))}</b><span>${esc(tools)}</span></li>`).join('');
  }

  $('floors').addEventListener('click', e => {
    const s = e.target.closest('[data-sess]'), fl = e.target.closest('[data-proj]');
    if (s) {
      ui.sess = s.dataset.sess;
      const c = curFloor()?.chars.get(ui.sess + '/main');
      ui.sel = c && !c.gone ? c.key : null;
      renderPanels(true);
    } else if (fl) setFloor(fl.dataset.proj);
  });
  $('people').addEventListener('click', e => {
    const li = e.target.closest('[data-key]');
    if (!li) return;
    ui.sel = li.dataset.key;
    ui.sess = curFloor()?.chars.get(ui.sel)?.sess || ui.sess;
    renderPanels(true);
  });

  // ── 컨트롤 ──────────────────────────
  for (const b of document.querySelectorAll('#styleSeg button')) b.addEventListener('click', () => setStyle(b.dataset.style));
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
    if (e.key === '1') setStyle('pixel');
    if (e.key === '2') setStyle('iso');
    if (e.key === '3') setStyle('garden');
  });
  // 보기 선택: Claude / Codex (최소 하나는 켜 둔다)
  try { Object.assign(Office.visible, JSON.parse(store.get('office.sources', '{}'))); } catch {}
  function renderSources() {
    for (const b of document.querySelectorAll('#srcSeg button')) b.classList.toggle('on', !!Office.visible[b.dataset.src]);
  }
  for (const b of document.querySelectorAll('#srcSeg button')) b.addEventListener('click', () => {
    const k = b.dataset.src, other = k === 'claude' ? 'codex' : 'claude';
    Office.visible[k] = !Office.visible[k];
    if (!Office.visible[k] && !Office.visible[other]) Office.visible[other] = true;
    store.set('office.sources', JSON.stringify(Office.visible));
    if (ui.sel && !Office.present(curFloor() || { chars: new Map() }).some(c => c.key === ui.sel)) ui.sel = null;
    renderSources();
    followTick();
    renderPanels(true);
  });
  renderSources();
  $('follow').checked = ui.follow;
  $('follow').addEventListener('change', e => { ui.follow = e.target.checked; store.set('office.follow', ui.follow ? '1' : '0'); });

  function toggleDemo(on = !Demo.running) {
    if (on) {
      Demo.start(evts => Office.ingest(evts));
      setFloor(Demo.PROJ);
    } else {
      Demo.stop();
      Office.removeFloor(Demo.PROJ);
      ui.floor = null;
      followTick();
    }
    renderPanels(true);
  }
  $('demoBtn').addEventListener('click', () => toggleDemo());
  $('emptyDemo').addEventListener('click', () => toggleDemo(true));

  // ── 시작 ────────────────────────────
  async function init() {
    renderLegend();
    const info = await window.office.info();
    $('emptyPath').textContent = `감시 폴더: ${info.root} · ${info.codexRoot}`;
    setStyle(info.style || ui.style);
    Office.replay(await window.office.history());
    window.office.onEvents(batch => { ui.lastEventAt = Date.now(); Office.ingest(batch); });
    followTick();
    if (info.demo) toggleDemo(true);
    setInterval(followTick, 1000);
    setInterval(() => renderPanels(false), 500);
    renderPanels(true);
    requestAnimationFrame(frame);
  }
  init();
})();
