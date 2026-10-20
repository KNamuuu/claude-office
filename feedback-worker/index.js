// 앱의 건의사항을 받아 GitHub 이슈로 등록하는 중계 서버. 토큰은 Worker 비밀값(GITHUB_TOKEN)에만 있다.
const REPO = 'KNamuuu/claude-office';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return json({ error: 'POST만 받아요' }, 405);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.LIMIT.limit({ key: ip });
    if (!success) return json({ error: '잠시 후 다시 보내 주세요 (1분에 3건까지)' }, 429);

    let d;
    try { d = await req.json(); } catch { return json({ error: '형식이 잘못됐어요' }, 400); }
    const title = String(d.title || '').trim().slice(0, 120);
    const body = String(d.body || '').trim().slice(0, 8000);
    if (!title || !body) return json({ error: '제목과 내용이 필요해요' }, 400);

    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json', 'User-Agent': 'claude-office-feedback',
      },
      body: JSON.stringify({ title, body: `${body}\n\n_(앱 건의사항으로 등록됨)_`, labels: ['feedback'] }),
    });
    if (!res.ok) return json({ error: `GitHub 응답 ${res.status}` }, 502);
    const issue = await res.json();
    return json({ number: issue.number, url: issue.html_url });
  },
};
