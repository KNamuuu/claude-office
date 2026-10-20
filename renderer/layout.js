// 28x16 타일 사무실. 두 렌더러가 같은 좌표를 쓴다. 좌표는 타일 단위, 타일 (i,j)의 중심은 (i+0.5, j+0.5).
// 윗줄 방: y 0~6 (0행은 뒷벽), 복도: y 7~8, 아랫줄 방: y 9~15 (9행은 벽, 문 칸만 뚫림)
(function () {
  const W = 28, H = 16, CORRIDOR = [7, 8];

  // slot: [lx, ly, 바라보는 방향 u/d/l/r], furn: [종류, lx, ly, w, h, 막힘여부(기본 true)]
  const ROOMS = [
    {
      id: 'server', name: '서버실', x0: 0, top: true, door: 3, aisle: 5,
      floor: ['#1f2534', '#232a3b'], isoFloor: '#d9dee8',
      slots: [[1, 2, 'u'], [2, 2, 'u'], [4, 2, 'u'], [5, 2, 'u'], [5, 4, 'l']],
      furn: [['rack', 0, 1], ['rack', 1, 1], ['rack', 2, 1], ['rack', 4, 1], ['rack', 5, 1], ['rack', 6, 1],
        ['rack', 0, 3], ['rack', 0, 4], ['console', 6, 3, 1, 2]],
      wall: [['vent', 3, 1]],
    },
    {
      id: 'dev', name: '개발실', x0: 7, top: true, door: 3, aisle: 5,
      floor: ['#30271f', '#352b22'], isoFloor: '#e9dcc8',
      slots: [[1, 3, 'u'], [2, 3, 'u'], [4, 3, 'u'], [5, 3, 'u']],
      furn: [['desk', 1, 2, 2, 1], ['desk', 4, 2, 2, 1], ['plant', 0, 1], ['plant', 6, 1],
        ['chair', 1, 3, 1, 1, false], ['chair', 2, 3, 1, 1, false], ['chair', 4, 3, 1, 1, false], ['chair', 5, 3, 1, 1, false]],
      wall: [['poster', 1, 1], ['clock', 4, 1]],
    },
    {
      id: 'library', name: '자료실', x0: 14, top: true, door: 3, aisle: 5,
      floor: ['#2a2535', '#2e2939'], isoFloor: '#e4dccf',
      slots: [[1, 2, 'u'], [5, 2, 'u'], [2, 4, 'u'], [3, 4, 'u'], [4, 4, 'u']],
      furn: [['shelf', 0, 1, 3, 1], ['shelf', 4, 1, 3, 1], ['table', 2, 3, 3, 1], ['plant', 3, 1]],
      wall: [],
    },
    {
      id: 'meeting', name: '회의실', x0: 21, top: true, door: 3, aisle: 5,
      floor: ['#23302b', '#26342f'], isoFloor: '#dfe6e1',
      slots: [[1, 2, 'r'], [1, 3, 'r'], [5, 2, 'l'], [5, 3, 'l'], [3, 4, 'u']],
      furn: [['table', 2, 2, 3, 2], ['plant', 0, 1], ['plant', 6, 1]],
      wall: [['whiteboard', 2, 3]],
    },
    {
      id: 'lounge', name: '라운지', x0: 0, top: false, door: 3, aisle: 1,
      floor: ['#35252f', '#3a2934'], isoFloor: '#efe3d6',
      slots: [[1, 6, 'u'], [2, 6, 'u'], [3, 6, 'u'], [5, 5, 'l'], [5, 3, 'r']],
      furn: [['coffeetable', 1, 4, 3, 1], ['sofa', 1, 6, 3, 1, false], ['armchair', 5, 5, 1, 1, false],
        ['vending', 6, 2], ['coffee', 6, 3], ['plant', 0, 1], ['plant', 0, 6], ['plant', 6, 6]],
      wall: [['window', 1, 2], ['window', 4, 2]],
    },
    {
      id: 'desk', name: '내 자리', x0: 7, top: false, door: 3, aisle: 1,
      floor: ['#262c38', '#2a303d'], isoFloor: '#dde3ec',
      me: [3, 3],
      slots: [[2, 5, 'u'], [3, 5, 'u'], [4, 5, 'u'], [1, 4, 'r'], [5, 4, 'l']],
      furn: [['mydesk', 2, 4, 3, 1], ['shelf', 0, 2, 1, 1], ['cabinet', 6, 2], ['plant', 0, 6], ['plant', 6, 6]],
      wall: [['poster', 1, 1], ['window', 4, 2]],
    },
    {
      id: 'search', name: '정보검색실', x0: 14, top: false, door: 3, aisle: 1,
      floor: ['#1f2f35', '#22343a'], isoFloor: '#d8e6ea',
      slots: [[1, 4, 'u'], [2, 4, 'u'], [4, 4, 'u'], [5, 4, 'u']],
      furn: [['terminal', 1, 3, 2, 1], ['terminal', 4, 3, 2, 1], ['globe', 6, 2], ['plant', 0, 6], ['plant', 6, 6],
        ['chair', 1, 4, 1, 1, false], ['chair', 2, 4, 1, 1, false], ['chair', 4, 4, 1, 1, false], ['chair', 5, 4, 1, 1, false]],
      wall: [['worldmap', 0, 3], ['screen', 4, 2]],
    },
    {
      id: 'lobby', name: '엘리베이터 로비', x0: 21, top: false, door: 1, aisle: 1,
      floor: ['#2f2f37', '#34343d'], isoFloor: '#ececec',
      elevators: [3, 5],
      slots: [[2, 5, 'd'], [3, 5, 'd'], [4, 5, 'd']],
      furn: [['bench', 2, 5, 3, 1, false], ['plant', 0, 6], ['plant', 6, 6]],
      wall: [],
    },
  ];

  // 도구 → 방
  function roomForTool(name = '') {
    if (/^(Read|Grep|Glob|LS)$/.test(name)) return 'library';
    if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) return 'dev';
    if (/^(Bash|BashOutput|KillShell|KillBash|Monitor)$/.test(name)) return 'server';
    if (/^(WebSearch|WebFetch)$/.test(name) || name.startsWith('mcp__')) return 'search';
    if (name === 'AskUserQuestion') return 'desk';
    if (/^(TodoWrite|Task|Agent|ExitPlanMode|EnterPlanMode|Skill)$/.test(name) || /^Task/.test(name)) return 'meeting';
    return 'dev';
  }

  const LEGEND = [
    ['library', 'Read · Grep · Glob · LS'],
    ['dev', 'Edit · Write · MultiEdit · NotebookEdit'],
    ['server', 'Bash 계열'],
    ['search', 'WebSearch · WebFetch · mcp__*'],
    ['meeting', 'TodoWrite · Task · Agent · 플랜 · Skill'],
    ['desk', 'AskUserQuestion · 보고'],
    ['lounge', '90초 조용하면 휴식'],
    ['lobby', '서브에이전트 출입 · 퇴근'],
  ];

  // 절대 좌표로 펼치기
  for (const r of ROOMS) {
    r.y0 = r.top ? 0 : 9;
    r.rect = { x: r.x0, y: r.y0, w: 7, h: 7 };
    r.doorTile = { x: r.x0 + r.door, y: r.top ? 6 : 9 };
    r.aisleY = r.y0 + r.aisle;
    r.slots = r.slots.map(([x, y, dir]) => ({ x: r.x0 + x, y: r.y0 + y, dir }));
    r.furn = r.furn.map(([t, x, y, w = 1, h = 1, block = true]) => ({ t, x: r.x0 + x, y: r.y0 + y, w, h, block, room: r.id }));
    r.wall = r.wall.map(([t, x, w]) => ({ t, x: r.x0 + x, w, room: r.id }));
    if (r.me) r.meTile = { x: r.x0 + r.me[0], y: r.y0 + r.me[1] };
    if (r.elevators) r.elevatorTiles = r.elevators.map(x => ({ x: r.x0 + x, y: r.y0 + 1 }));
  }
  const ROOM = Object.fromEntries(ROOMS.map(r => [r.id, r]));

  function roomAt(x, y) {
    if (y >= CORRIDOR[0] && y <= CORRIDOR[1]) return null;
    return ROOMS.find(r => x >= r.x0 && x < r.x0 + 7 && y >= r.y0 && y < r.y0 + 7) || null;
  }

  // 걸을 수 있는 칸
  const walk = [];
  for (let y = 0; y < H; y++) {
    walk[y] = [];
    for (let x = 0; x < W; x++) {
      const r = roomAt(x, y);
      let ok = true;
      if (r && y === r.y0) ok = !r.top && x === r.doorTile.x; // 뒷벽/아래층 벽 (문 칸만 열림)
      walk[y][x] = ok;
    }
  }
  for (const r of ROOMS) {
    for (const f of r.furn) if (f.block) for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) walk[f.y + j][f.x + i] = false;
    if (r.meTile) walk[r.meTile.y][r.meTile.x] = false;
  }

  // 방과 복도 사이는 문 칸으로만 지나갈 수 있다 (벽 통과 금지)
  function canStep(ax, ay, bx, by) {
    if (bx < 0 || by < 0 || bx >= W || by >= H || !walk[by][bx]) return false;
    const ra = roomAt(ax, ay), rb = roomAt(bx, by);
    if (ra === rb) return true;
    if (ax !== bx) return false;
    const r = ra || rb, t = ra ? { x: ax, y: ay } : { x: bx, y: by };
    return !!r && (!ra || !rb) && t.x === r.doorTile.x && t.y === r.doorTile.y;
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // BFS로 거리 지도를 만든 뒤, 같은 방향을 유지하는 쪽을 골라 꺾임이 적은 길을 만든다
  function findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    const dist = new Map(), key = (x, y) => y * W + x;
    dist.set(key(tx, ty), 0);
    const q = [[tx, ty]];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === sx && y === sy) break;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (dist.has(key(nx, ny)) || !canStep(nx, ny, x, y)) continue;
        dist.set(key(nx, ny), dist.get(key(x, y)) + 1);
        q.push([nx, ny]);
      }
    }
    if (!dist.has(key(sx, sy))) return null;
    const path = [];
    let x = sx, y = sy, pd = null;
    while (!(x === tx && y === ty)) {
      const d = dist.get(key(x, y));
      const opts = DIRS.filter(([dx, dy]) => dist.get(key(x + dx, y + dy)) === d - 1 && canStep(x, y, x + dx, y + dy));
      const pick = opts.find(o => pd && o[0] === pd[0] && o[1] === pd[1]) || opts[0];
      x += pick[0]; y += pick[1]; pd = pick;
      path.push({ x, y });
    }
    return path;
  }

  // 슬롯이 다 찼을 때 쓸 빈 칸 (문 칸 제외, 통로에 가까운 순)
  function overflowTiles(r) {
    const out = [];
    for (let y = r.y0; y < r.y0 + 7; y++) for (let x = r.x0; x < r.x0 + 7; x++) {
      if (!walk[y][x] || (x === r.doorTile.x && y === r.doorTile.y)) continue;
      if (r.slots.some(s => s.x === x && s.y === y)) continue;
      if (r.elevatorTiles && r.elevatorTiles.some(e => e.x === x && e.y === y)) continue;
      out.push({ x, y, dir: 'd' });
    }
    return out.sort((a, b) => Math.abs(a.y - r.aisleY) - Math.abs(b.y - r.aisleY));
  }
  for (const r of ROOMS) r.overflow = overflowTiles(r);

  window.Layout = { W, H, CORRIDOR, ROOMS, ROOM, LEGEND, roomForTool, roomAt, walk, canStep, findPath };
})();
