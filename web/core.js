'use strict';
// ============ 存储 ============
const K = 'xutang';
// 打包成 APK 后，部分 WebView 没开 DOM Storage，localStorage 为 null 或写入抛错。
// 此时退回内存存储，并提示一次，避免整个程序因为保存失败而卡死。
const STORE = (() => {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return localStorage; }
  catch { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, memory: true }; }
})();

const load = () => { try { return JSON.parse(STORE.getItem(K)) || {}; } catch { return {}; } };
let DB = load();
let saveWarned = false;
const save = () => {
  try { STORE.setItem(K, JSON.stringify(DB)); }
  catch (e) { if (!saveWarned) { saveWarned = true; alert('保存失败：' + e.message + '\n存储空间可能已满，请先导出备份。'); } }
};
if (STORE.memory) setTimeout(() => alert('当前环境无法使用本地存储，关闭应用后数据会丢失。\n如果是打包成的 APK，请在打包工具里开启"DOM Storage / 本地存储"。'), 500);

const DEF_STATS = ['执念', '理智', '体力', '声望', '羁绊'];
const PROMPT_KEYS = ['step1', 'step2', 'design', 'step3', 'step4', 'summary'];
const STAT_COLOR = { 执念: '#b06a8a', 理智: '#6a8fd0', 体力: '#7fa86a', 声望: '#c0a060', 羁绊: '#8a7fb0' };
const barColor = n => STAT_COLOR[n] || '#7a7a8a';

function initDB() {
  DB.apis ??= [];            // [{name,base,key,model,temp,maxTokens}]
  DB.apiCur ??= 0;
  DB.setting ??= {};         // {player:{presets,cur},chars,world,style}
  for (const f of ['player', 'chars', 'world', 'style'])
    DB.setting[f] ??= { presets: [{ name: '默认', text: '' }], cur: 0 };
  DB.prompts ??= {};         // {step1:{presets,cur},...}；design 为第二步与第三步之间的"游戏设计"
  for (const s of PROMPT_KEYS)
    DB.prompts[s] ??= { presets: structuredClone(DEFAULT_PRESETS[s]), cur: 0, api: -1 }; // api:-1 跟随主设置
  for (const s of PROMPT_KEYS) DB.prompts[s].api ??= -1;
  DB.game ??= null;          // 进行中的游戏
  DB.cfg ??= {};
  const d = { routeCount: 3, endingCount: 2, stats: DEF_STATS.slice(), pname: '你', mainCount: 4, npcCount: 5,
    ctxMode: 'raw',    // raw=只发原文 | sum=总结+缓冲
    ctxCount: 3,       // 发送最近几条路线原文
    sumAuto: true,     // 自动总结
    sumEvery: 10,      // 每积累多少条总结一次
    sumBuffer: 5,      // 总结后保留的缓冲条数
    gameCount: 3,      // 游戏设计步骤要做几个小游戏
    pcolor: '#e8d8b0', // 主控台词颜色
    ocolor: '#b8c4d0', // 没有专属颜色的其他角色
    qcolor: '#d9b48a' }; // 旁白里“引号”文本的颜色
  for (const k in d) DB.cfg[k] ??= d[k];
  if (DB.game) migrateGame(DB.game);
  save();
}
// 游戏存档结构：
// chapters: [{id, step, node, route, raw, parsed, ts, choice}] 所有 AI 正文永久保留
// visited:  离开过的节点序列；path: [{ch, opt, text, node}] 玩家实际走过的选择
function migrateGame(g) {
  g.summary ??= []; g.visited ??= []; g.path ??= []; g.shown ??= [];
  g.chapters ??= [];
  g.chars ??= {};             // 角色名 → {body, mind, att}；主控的键是 '你'
  // 旧版解析会把 AI 误写的 START 行当成节点；清掉，并把停在 START 上的进度挪到真正的起点
  if (g.nodes) {
    g.nodes = g.nodes.filter(n => !/^(START|无|-+)$/i.test(n.id || ''));
    if (g.s2parts?.s2_index) g.s2parts.s2_index = g.nodes;
    if (/^START$/i.test(g.node || '')) { const st = g.nodes.find(x => x.prev === 'START') || g.nodes[0]; if (st) { g.node = st.id; g.route = st.route; } }
  }
  if (g.chars['玩家'] && !g.chars['你']) { g.chars['你'] = g.chars['玩家']; delete g.chars['玩家']; }
  g.sums ??= [];              // 大总结 [{no, chain:[章节下标...], text, ts}]
  // 旧存档是线性的：补上 parent 链与总结的 chain
  g.chapters.forEach((c, i) => { if (c.parent === undefined) c.parent = i - 1; });
  if (g.summedTo && g.sums.length)
    for (const s of g.sums) s.chain ??= Array.from({ length: s.to ?? g.summedTo }, (_, k) => k);
  // 旧版本遗留：当前节点不在大纲里，或开场还没写就已经停在别的路线上
  if (g.nodes?.length && g.node && !/^END$/i.test(g.node) && !g.nodes.some(x => x.id === g.node)) {
    const st = g.nodes.find(x => x.prev === 'START');
    if (st) setTimeout(() => { if (confirm(`存档里的当前节点 ${g.node} 不在现在的大纲里（可能是旧大纲留下的）。\n重置到起点 ${st.id}？`)) { g.node = st.id; g.route = st.route; g.visited = []; save(); renderSide(); } }, 800);
  }
  delete g.summedTo;
  g.stats ??= Object.fromEntries(DB.cfg.stats.map(n => [n, 50]));
  if (g.s3raw && !g.chapters.length) g.chapters.push({ id: 1, step: 3, node: g.node, route: g.route, raw: g.s3raw, parsed: g.cur, ts: Date.now() });
  g.chIdx ??= g.chapters.length - 1;
  g.genAt ??= {}; // node -> 生成次数，防循环
}
initDB();

const S = n => document.getElementById(n);
// 主控在存档里统一用 '你' 作为键；AI 可能写成"你/主控/玩家/主角"或主控的名字，都归一
const PLAYER_KEY = '你';
const PLAYER_ALIAS = who => {
  const w = String(who || '').trim();
  return /^(你|主控|玩家|主角|我)$/.test(w) || (w && w === DB.cfg.pname) ? PLAYER_KEY : w;
};
// 说话人可以写成"称呼（档案本名）"：称呼用于显示，本名只用于匹配颜色与角色档案
// 未知身份允许写成 "黑衣人（？）"，此时没有本名
function splitWho(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(.*?)[（(]\s*(.*?)\s*[）)]$/);
  if (!m) { const a = PLAYER_ALIAS(s); return { show: a, real: a }; }
  const show = m[1].trim() || m[2].trim();
  const real = /^[?？\s]*$/.test(m[2]) ? '' : m[2].trim();
  return { show: PLAYER_ALIAS(show), real: real ? PLAYER_ALIAS(real) : '' };
}
// 台词颜色：专属设计 > 主控色 > 其他角色统一色
function sayColor(seg) {
  const cs = DB.game?.design?.colors || {};
  const key = seg.real || seg.who;
  if (key === PLAYER_KEY || seg.who === PLAYER_KEY) return DB.cfg.pcolor;
  return cs[key]?.color || cs[seg.who]?.color || DB.cfg.ocolor;
}
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&' + 'quot;' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ESC_MAP[c]);
const field = f => { const o = DB.setting[f]; return o.presets[o.cur]?.text || ''; };

// ============ 变量 ============
function buildVars() {
  const g = DB.game || {};
  return {
    player: field('player'), chars: field('chars'), world: field('world'), style: field('style'),
    stats: DB.cfg.stats.join('、'),
    s1_full: g.s1 || '', ...(g.s1parts || {}),
    s2_full: g.s2 || '', s2_routes: (g.s2parts || {}).s2_routes || '',
    route_count: DB.cfg.routeCount, ending_count: DB.cfg.endingCount,
    main_count: DB.cfg.mainCount, npc_count: DB.cfg.npcCount,
    total_count: DB.cfg.mainCount + DB.cfg.npcCount,
    cur_route: g.route || '未定', cur_node: g.node || 'START',
    recent: (g.summary || []).slice(-12).join('\n') || '（故事尚未开始）',
    state: JSON.stringify(g.stats || {}),
    pname: DB.cfg.pname || '你',
    stat_read: statRead(g.stats || {}),
    char_state: charStateText(g.chars || {}),
    music_list: musicListText(musicMeta || []),
    last_choice: g.lastChoiceText || '（无）',
    prev_text: (g.shown || []).join('\n') || '（无）',
    story_ctx: storyCtx(g),
    sum_prev: validSums(g).at(-1)?.text || '（这是第一次大总结，没有之前的总结）',
    sum_no: validSums(g).length + 1,
    sum_src: (() => { const r = sumRange(g); return histChapters(g).slice(r.from, r.to).map((x, j) => chRead(x, r.from + j)).join('\n\n') || '（无）'; })(),
    sum_span: (() => { const r = sumRange(g); return `第${r.from + 1}-${r.to}条`; })(),
    visited: (g.visited || []).join(' → ') || '（无）',
    route_outline: routeOutline(g),
    s25_full: g.design?.raw || '',
    color_table: colorTableText(g.design),
    stat_rules: statRulesText(g.design),
    stat_hit: activeStatRules(g),
    game_list: gameListText(g.design),
    game_count: DB.cfg.gameCount,
    pcolor: DB.cfg.pcolor, ocolor: DB.cfg.ocolor, qcolor: DB.cfg.qcolor,
    node_info: (() => { const n = (g.nodes || []).find(x => x.id === g.node); return n ? `${n.id} | ${n.route} | ${n.act} | 前置 ${n.prev} | ${n.n} 个选项` : '（索引中无此节点）'; })(),
    // 合法去向清单：摘要里的"新节点ID"只能从这里选
    next_opts: (() => {
      const nx = nextsOf(g, g.node).filter(n => !(g.visited || []).includes(n.id));
      if (!nx.length) return isEndNode(g) ? 'END（本节点是结局）' : '（大纲里没有后继节点，写 END）';
      // 结局判定节点：不按选项绑定结局，把条件交给 AI 按数值判断
      if (isEndingJudge(g, g.node)) {
        const E = endingsOf(g);
        return nx.map(n => n.id).join('、') + `
## 结局判定（本节点之后进入结局，由你判断）
${nx.map(n => `- ${n.id}${E[n.id]?.name ? '（' + E[n.id].name + '）' : ''}：条件 ${E[n.id]?.cond || '未写'}${E[n.id]?.tone ? '；基调 ' + E[n.id].tone : ''}`).join('\n')}
- 当前数值：${JSON.stringify(g.stats || {})}
每个分支按"当前数值 + 该分支的数值变化"对照上面的条件，判断主控会进入哪个结局；数值之外，也要考虑这一路的剧情是否让该结局成立。不同选项可以进入同一个结局。摘要的新节点ID写结局编号。`;
      }
      const m = (forkMapOf(g)[g.node] || []).filter(e => e.to);
      return nx.map(n => `${n.id}（${n.route} · ${n.act}）`).join('、')
        + (m.length ? '\n各选项的去向（大纲规定，照此写）：' + m.map(e => `选项${e.no}「${e.text.slice(0, 24)}」→ ${e.to}`).join('；') : '');
    })()
  };
}
// 从第二步路线详述中截取当前路线那一节；截不到就给全部
// 数值 → 文字提示，让 AI 知道该怎么写而不只是看见一个数
function statRead(stats) {
  return Object.entries(stats).map(([k, v]) => {
    const lv = v <= 15 ? '极低（必须在正文中明确体现）' : v <= 35 ? '偏低' : v >= 85 ? '极高（必须在正文中明确体现）' : v >= 65 ? '偏高' : '平稳';
    return `${k} ${v}：${lv}`;
  }).join('；') || '（无）';
}
// 角色状态 → 提示词文本
function charStateText(chars) {
  const rows = Object.entries(chars).map(([n, c]) => `  - ${n === PLAYER_KEY ? '你（主控）' : n}：生理〔${c.body || '未知'}〕 心理〔${c.mind || '未知'}〕${n === PLAYER_KEY ? '' : ` 对主控〔${c.att || '未知'}〕`}`);
  return rows.join('\n') || '  （尚无记录，本次请为出场角色给出初始状态）';
}
// [state:] 落地到存档。"同前"保留原值
function applyCharState(g, s) {
  const c = (g.chars ??= {})[s.who] ??= {};
  const keep = v => !v || v === '同前' || v === '—';
  if (!keep(s.body)) c.body = s.body;
  if (!keep(s.mind)) c.mind = s.mind;
  if (!keep(s.att)) c.att = s.att;
  c.ts = Date.now();
}

// 门槛：{需要:体力>=60}
const parseReq = t => {
  const m = t.match(/\s*[{｛]\s*需要\s*[:：]\s*(.+?)\s*(>=|<=|≥|≤)\s*(\d+)\s*[}｝]\s*$/);
  if (!m) return { text: t, req: null };
  return { text: t.slice(0, m.index).trim(), req: { stat: m[1], op: /[<≤]/.test(m[2]) ? '<=' : '>=', v: +m[3] } };
};
const reqOk = (req, stats) => !req || (req.op === '>=' ? (stats[req.stat] ?? 50) >= req.v : (stats[req.stat] ?? 50) <= req.v);
const reqText = r => `${r.stat}${r.op === '>=' ? '≥' : '≤'}${r.v}`;

// 可达性：从当前数值出发，枚举本次输出里所有能在门槛之前出现的数值变化组合，
// 看最好情况下能否满足门槛。主线门槛只能用主线前面的变化；分支内门槛还能叠加该分支前面的变化。
// ponytail: 小选项按"每组取对该数值最有利的一个"估算，组合规模小，不做全排列
function reachIssues(story, stats, statNames) {
  const bad = [];
  const best = (segs, stat, dir) => {
    let sum = 0;
    for (const s of segs) {
      if (s.t === 'stat' && s.name === stat) sum += s.d;
      if (s.t === 'minor') {
        const gains = Object.values(s.react).map(r => r.filter(x => x.t === 'stat' && x.name === stat).reduce((a, x) => a + x.d, 0));
        if (gains.length) sum += dir > 0 ? Math.max(0, ...gains) : Math.min(0, ...gains);
      }
    }
    return sum;
  };
  const check = (ch, before, where) => {
    if (!ch.opts.some(o => !o.req)) bad.push(`${where}的选择点所有选项都有门槛，必须至少留一个无门槛的退路`);
    for (const o of ch.opts) {
      if (!o.req) continue;
      const { stat, op, v } = o.req;
      if (!statNames.includes(stat)) { bad.push(`选项 ${o.id} 的门槛用了未定义的数值"${stat}"`); continue; }
      if (v < 0 || v > 100) { bad.push(`选项 ${o.id} 的门槛 ${reqText(o.req)} 超出 0-100`); continue; }
      const cur = stats[stat] ?? 50, dir = op === '>=' ? 1 : -1;
      const reach = Math.max(0, Math.min(100, cur + best(before, stat, dir)));
      const ok = op === '>=' ? reach >= v : reach <= v;
      if (!ok) bad.push(`选项 ${o.id} 要求 ${reqText(o.req)}，但玩家当前 ${stat}=${cur}，加上前面所有可选的数值变化最多只能到 ${reach}，这个选项不可能被选到`);
    }
  };
  const main = story.blocks.main || [];
  const mi = main.findIndex(s => s.t === 'choice');
  if (mi >= 0) check(main[mi], main.slice(0, mi), '主线');
  for (const [k, segs] of Object.entries(story.blocks)) {
    if (k === 'main') continue;
    const bi = segs.findIndex(s => s.t === 'choice');
    if (bi >= 0) check(segs[bi], [...main.slice(0, mi), ...segs.slice(0, bi)], `分支 ${k} `);
  }
  return bad;
}

// 从第二步路线详述中截取当前路线那一节；截不到就给全部
function routeOutline(g) {
  const d = g.s2parts?.s2_detail || '', r = g.route;
  // 共通线：给序幕全文 + 路线总览，让 AI 知道这个开场要引出哪些路线
  if (/^C$/i.test(r || '')) return [g.s2parts?.s2_common, g.s2parts?.s2_overview].filter(Boolean).join('\n\n') || g.s2parts?.s2_routes || '';
  if (!d || !r) return g.s2parts?.s2_routes || '';
  const parts = d.split(/^(?=###\s)/m);
  const hit = parts.find(p => p.replace(/^###\s*/, '').startsWith(r));
  return hit ? hit.trim() : (g.s2parts?.s2_routes || d);
}

// ============ 结局判定 ============
// 结局节点：ID 带 END，或选项数为 0、没有后继、属于终局
const isEndingNode = (g, n) => !!n && (/END/i.test(n.id) || (+n.n === 0 && !nextsOf(g, n.id).length && /终局|结局/.test(n.act || '')));
// 结局判定节点：后继全是结局节点（去哪个结局由 AI 按数值判断，不按选项绑定）
const isEndingJudge = (g, id) => { const k = nextsOf(g, id); return k.length > 0 && k.every(n => isEndingNode(g, n)); };
// 从第二步原文读结局：R1-END1 (金丝雀) / 羁绊≥60且理智≥55 / 内容 / 苦涩
function parseEndings(md, nodes) {
  const out = {}, ends = (nodes || []).filter(n => /END/i.test(n.id));
  for (const ln of String(md || '').split('\n')) {
    const t = ln.replace(/^[\s>*\-`]+/, '').trim();
    const nd = ends.find(n => normId(t).startsWith(normId(n.id)) && !/^[A-Z0-9]/.test(normId(t).slice(normId(n.id).length, normId(n.id).length + 1) || '|'));
    if (!nd || out[nd.id]) continue;
    const rest = t.slice(t.toUpperCase().indexOf(nd.id.toUpperCase()) + nd.id.length).trim();
    const name = (rest.match(/^[（(【\[]\s*([^）)】\]]+)\s*[）)】\]]/) || [])[1] || '';
    const parts = rest.replace(/^[（(【\[][^）)】\]]*[）)】\]]/, '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
    out[nd.id] = { name, cond: parts[0] || '', text: parts.slice(1, -1).join(' / ') || parts[1] || '', tone: parts.length > 2 ? parts.at(-1) : '' };
  }
  return out;
}
const endingsOf = g => (g.endings ??= parseEndings(g.s2 || '', g.nodes || []));
// 条件求值："羁绊≥60且理智≥55" → true/false；含看不懂的部分 → null（不评判）；"未满足条件" → 'else'
function evalCond(cond, stats) {
  const c = String(cond || '').replace(/\s+/g, '');
  if (!c) return null;
  if (/未满足|其余|其他|否则|兜底|默认/.test(c)) return 'else';
  const parts = c.split(/且|并且|和|与|&&|,|，|、/).filter(Boolean);
  let ok = true;
  for (const p of parts) {
    const m = p.match(/^(.+?)(>=|≥|<=|≤|>|<|=)(\d+)$/);
    if (!m || !(m[1] in stats)) return null;
    const v = +stats[m[1]], n = +m[3];
    const r = { '>=': v >= n, '≥': v >= n, '<=': v <= n, '≤': v <= n, '>': v > n, '<': v < n, '=': v === n }[m[2]];
    ok = ok && r;
  }
  return ok;
}
// "体力-5,羁绊+5" → {体力:-5, 羁绊:5}
const parseDelta = s => Object.fromEntries([...String(s || '').matchAll(/([^\s,，、+\-]+)\s*([+-])\s*(\d+)/g)].map(m => [m[1], (m[2] === '-' ? -1 : 1) * +m[3]]));
// 按条件推算该去哪个结局；推不出（条件看不懂）返回 ''
function predictEnding(g, judgeId, stats) {
  const ends = nextsOf(g, judgeId).filter(n => isEndingNode(g, n)), E = endingsOf(g);
  let fallback = '';
  for (const n of ends) {
    const r = evalCond(E[n.id]?.cond, stats);
    if (r === null) return '';
    if (r === 'else') { fallback = n.id; continue; }
    if (r) return n.id;
  }
  return fallback;
}
// 读 AI 写的结局：编号、END1、结局名、"金丝雀结局"
function readEndingRef(g, raw, ends) {
  const s = normId(raw), E = endingsOf(g);
  if (!s) return '';
  const hit = ends.find(n => s.includes(normId(n.id)));
  if (hit) return hit.id;
  const byName = ends.filter(n => E[n.id]?.name && s.includes(normId(E[n.id].name)));
  if (byName.length === 1) return byName[0].id;
  const m = s.match(/END(\d+)/);
  if (m) { const k = ends.filter(n => normId(n.id).endsWith('END' + m[1])); if (k.length === 1) return k[0].id; }
  return '';
}

// ============ 路线识别 ============
// 原则：去向由 AI 决定，程序只负责"读懂"AI 写了什么；读不准就交给玩家确认，绝不替 AI 随便挑一个。

// 节点ID 规范化：全角→半角、去空格、统一大写（"r2－n1 " → "R2-N1"）
const normId = s => String(s || '').replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/[‐-―−]/g, '-').replace(/\s+/g, '').toUpperCase();
// 当前节点的合法去向：前置等于它的节点
const nextsOf = (g, id) => (g.nodes || []).filter(n => normId(n.prev) === normId(id));
// 粗略文字相似度（二元组 Dice），用于把"选项文字"对到大纲里的描述
function textSim(a, b) {
  const bg = t => { t = String(t || '').replace(/[\s\p{P}]/gu, ''); const o = new Map(); for (let i = 0; i < t.length - 1; i++) { const k = t.slice(i, i + 2); o.set(k, (o.get(k) || 0) + 1); } return o; };
  const A = bg(a), B = bg(b); let hit = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v; for (const v of B.values()) nb += v;
  for (const [k, v] of A) hit += Math.min(v, B.get(k) || 0);
  return na + nb ? 2 * hit / (na + nb) : 0;
}

// 从 AI 写的"下一节点"文字里读出节点ID。兼容：多余空格、全角、括号注释、箭头、"进入R2"、只写路线、写 END。
// 返回 {id} 或 {end:true} 或 null（读不出）
function readNodeRef(g, raw, cands) {
  const s = normId(raw);
  if (!s) return null;
  const ids = (g.nodes || []).map(n => n.id);
  const byNorm = new Map(ids.map(id => [normId(id), id]));
  if (byNorm.has(s)) return { id: byNorm.get(s) };
  // 文本里嵌着一个合法节点ID（"→R2-N1（夜巡）"、"进入R2-N1"）；优先取候选里的，再取最长的
  const found = [...byNorm.keys()].filter(k => s.includes(k)).sort((a, b) => b.length - a.length);
  const inCand = found.find(k => cands.some(c => normId(c.id) === k));
  if (inCand || found[0]) return { id: byNorm.get(inCand || found[0]) };
  if (/^(END|结局|终局)/.test(s) || /^END$/i.test(s)) return { end: true };
  // 只写了路线（"R2"、"进入R2"、"第二条线"）：取候选中属于该路线的那一个，唯一才算
  const rm = s.match(/R(\d+)/) || s.match(/第([一二三四五六七八九十])条/);
  if (rm) {
    const num = /\d/.test(rm[1]) ? rm[1] : '一二三四五六七八九十'.indexOf(rm[1]) + 1;
    const hit = cands.filter(c => normId(c.route) === 'R' + num);
    if (hit.length === 1) return { id: hit[0].id };
  }
  return null;
}

// 选项去向表：对每个有 2 个以上后继的节点，从第二步大纲里它自己那一段读出 "选项N：文字 → 进入 X"
// 返回 {节点ID: [{no, text, to, manual}]}，to 是后继节点ID
// 只在该节点自己的段落里找（从以节点ID开头的行，到下一个节点ID开头的行或标题为止），
// 避免把 C-N1 的选项拼进 C-N3（v4 的 bug）
function parseForkMaps(md, nodes) {
  const list = nodes || [], out = {};
  const ids = list.map(n => normId(n.id));
  const kidsOf = id => list.filter(n => normId(n.prev) === normId(id));
  const headOf = ln => {
    const t = normId(ln.replace(/^[\s>*#\-`]+/, ''));
    return ids.filter(k => t.startsWith(k) && !/^[A-Z0-9]/.test(t.slice(k.length, k.length + 1) || '|')).sort((a, b) => b.length - a.length)[0] || null;
  };
  const lines = String(md || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h = headOf(lines[i]);
    if (!h) continue;
    let j = i + 1;
    while (j < lines.length && !headOf(lines[j]) && !/^\s*#/.test(lines[j])) j++;
    const node = list.find(n => normId(n.id) === h), kids = kidsOf(h);
    // 后继全是结局：结局由 AI 按数值判定，不建选项去向表
    if (!node || kids.length < 2 || out[node.id] || kids.every(c => /END/i.test(c.id) || (+c.n === 0 && !kidsOf(c.id).length))) { i = j - 1; continue; }
    const seg = lines.slice(i, j).join('\n');
    const marks = [...seg.matchAll(/选项\s*(\d+)\s*[：:.、]/g)];
    const ents = [];
    marks.forEach((m, k) => {
      const chunk = seg.slice(m.index + m[0].length, k + 1 < marks.length ? marks[k + 1].index : seg.length);
      const a = chunk.match(/(?:->|→|=>|—>)\s*(?:进入|通往|前往|去往|去)?\s*([A-Za-z]+\d*(?:-[A-Za-z]*\d+)?)/);
      if (!a) return;
      const tgt = normId(a[1]);
      const to = kids.find(c => normId(c.id) === tgt)?.id || (/^R\d+$/.test(tgt) ? kids.filter(c => normId(c.route) === tgt).map(c => c.id)[0] : '') || '';
      const text = chunk.slice(0, a.index).replace(/[（(][^）)]*[）)]/g, '').replace(/[\s；;，,。]+$/, '').trim();
      ents.push({ no: +m[1], text, to, manual: false });
    });
    if (ents.length) out[node.id] = ents;
    i = j - 1;
  }
  return out;
}
// 存档里的去向表；没有就从第二步原文解析一次
const forkMapOf = g => (g.forkMap ??= parseForkMaps(g.s2 || '', g.nodes || []));
// 把玩家点的选项对到去向表里的一条：先按文字，文字分不清再按序号
function pickEntry(map, optText, idx = -1) {
  let best = null, b = 0, s2 = 0;
  for (const e of map) { const s = textSim(optText, e.text); if (s > b) { s2 = b; b = s; best = e; } else if (s > s2) s2 = s; }
  if (best && b >= 0.2 && b - s2 >= 0.08) return { e: best, how: 'text' };
  const e = idx >= 0 ? map.find(x => x.no === idx + 1) : null;
  return e ? { e, how: 'index' } : null;
}

// 选项去向判定：综合三处来源
//   ① AI 摘要写的下一节点 ② 分岔表里与选项文字最像的一条 ③ 玩家以前确认过的结果
// 返回 {id, how}；需要玩家确认时返回 {ask:true, cands, reason, claimed}
function resolveNext(g, claimed, optText = '', optId = '', optIdx = -1) {
  const cur = g.node;
  const cands = nextsOf(g, cur).filter(n => !(g.visited || []).includes(n.id));
  const fixed = g.routeFix?.[`${cur}|${optId}`];
  if (fixed && (fixed === 'END' || (g.nodes || []).some(n => n.id === fixed))) return { id: fixed, how: '你之前确认过' };
  // 大纲还没解析到节点：只能照 AI 写的走
  if (!(g.nodes || []).length) return claimed ? { id: claimed, how: 'AI' } : { ask: true, cands: [], reason: '大纲里没有节点索引', claimed };
  const ref = readNodeRef(g, claimed, cands);

  // 结局判定节点：去哪个结局由 AI 按数值决定。认得出就照走；只有认不出或写成别处时才问
  if (isEndingJudge(g, cur)) {
    const ends = cands.filter(n => isEndingNode(g, n));
    const id = readEndingRef(g, claimed, ends);
    if (id) return { id, how: 'AI' };
    return { ask: true, cands: ends, claimed, ending: true, reason: `AI 写的结局"${claimed || '（空）'}"认不出，请按结局条件选择` };
  }

  // 结局：只有当前节点真的是终局，或已经没有任何后继时才认
  if (ref?.end) {
    if (isEndNode(g) || !cands.length) return { id: 'END', how: 'AI' };
    return { ask: true, cands, claimed, reason: `AI 写的是 END，但 ${cur} 后面还有节点` };
  }

  // 有去向表的节点（分岔节点、结局分流等）：AI 的去向要和表对得上；玩家手动指定的优先于程序解析
  const map = forkMapOf(g)[cur] || [];
  if (map.length && cands.length > 1) {
    const pk = pickEntry(map, optText, optIdx);
    const want = pk?.e?.to && cands.some(c => c.id === pk.e.to) ? pk.e.to : '';
    const src = pk?.e?.manual ? '你在路线图里的指定' : '大纲的选项去向';
    const aiNode = ref?.id && cands.some(c => c.id === ref.id) ? ref.id : '';
    if (aiNode && (!want || want === aiNode)) return { id: aiNode, how: want ? `AI＋${src}一致` : 'AI' };
    if (aiNode) return { ask: true, cands, claimed, suggest: want, reason: `AI 写的是 ${aiNode}，但${src}里这个选项通往 ${want}` };
    if (want && pk.e.manual && pk.how === 'text') return { id: want, how: src };
    if (want) return { ask: true, cands, claimed, suggest: want, reason: `AI 写的"${claimed || '（空）'}"认不出，按${src}推测是 ${want}` };
  }

  // 普通节点
  if (ref?.id) {
    const n = (g.nodes || []).find(x => x.id === ref.id);
    if (cands.some(c => c.id === ref.id)) return { id: ref.id, how: 'AI' };
    if ((g.visited || []).includes(ref.id)) return { ask: true, cands, claimed, reason: `AI 指向已经走过的 ${ref.id}，会造成循环` };
    // 跳步：AI 指向了大纲里存在、但不是当前节点直接后继的节点
    return { ask: true, cands, claimed, suggest: cands.length === 1 ? cands[0].id : '', reason: `AI 写的 ${ref.id}（${n?.route}/${n?.act}）不是 ${cur} 的下一步，可能跳过了中间的剧情` };
  }
  // 读不出：后继只有一个时这是唯一合理去向（不是"随便挑"），直接采用并说明
  if (cands.length === 1) return { id: cands[0].id, how: `AI 写的"${claimed || '（空）'}"认不出，${cur} 只有这一个后继` };
  if (!cands.length) return isEndNode(g) ? { id: 'END', how: '终局' } : { ask: true, cands: [], claimed, reason: `${cur} 在大纲里没有后继节点` };
  return { ask: true, cands, claimed, reason: `AI 写的"${claimed || '（空）'}"认不出，${cur} 有 ${cands.length} 个可能的去向` };
}
// 选出大纲中当前节点的下一个未访问节点（只用于界面提示，不再用于自动跳转）
function nextUnvisited(g, from) {
  const c = nextsOf(g, from).filter(n => !(g.visited || []).includes(n.id));
  return c.length === 1 ? c[0] : null;
}
// 故事是否真的结束：只看"刚读完的这一章"在大纲里还有没有后继。
// 不能用 nextUnvisited 判断——它在多后继（分岔、结局判定）时返回空，会把 C-N3 误判为结局（v4~v6 的 bug）
function storyOver(g) {
  if (/^END$/i.test(g.node || '')) return true;
  if (!(g.nodes || []).length) return false;
  const chNode = g.chapters?.[g.chIdx]?.node || g.node;
  return !nextsOf(g, chNode).filter(n => !(g.visited || []).includes(n.id)).length;
}
// 当前节点是不是真的结局节点
function isEndNode(g, id = g.node) {
  if (/^END$/i.test(id || '')) return true;
  const nd = (g.nodes || []).find(x => x.id === id);
  return /终局|结局|END/i.test(nd?.act || '') && !nextsOf(g, id).length;
}
// 二元组 Jaccard 相似度，用于发现 AI 重复上一段
function similarity(a, b) {
  const grams = s => { const t = s.replace(/\s+/g, ''), o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; };
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}
const segsText = segs => segs.filter(s => s.v).map(s => (s.who ? s.who + '：' : '') + s.v).join('\n');
const fillVars = (t, v) => String(t).replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v && v[k] !== '' ? v[k] : m));
function renderVarPreview(t, v) {
  return esc(t).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const has = k in v && v[k] !== '';
    return `<span class="var${has ? '' : ' miss'}">${has ? esc(v[k]) : esc(m) + '〈缺失〉'}</span>`;
  });
}
const messagesOf = (step, v = buildVars()) => {
  const p = DB.prompts[step], pre = p.presets[p.cur];
  const msgs = pre.entries.filter(e => e.on !== false).map(e => ({ role: e.role, content: fillVars(e.content, v) }));
  const c = pre.cot;
  if (c?.on) {
    // 思维链指引：作为最后一条 user 消息，紧贴生成位置，遵循率最高
    msgs.push({ role: 'user', content: fillVars(c.guide, v).replaceAll('{{cot_start}}', c.start).replaceAll('{{cot_end}}', c.end) });
    // 预填充：把开始标签塞进 assistant，强制模型从思维链开始写（部分模型不支持，可单独关掉）
    if (c.prefill) msgs.push({ role: 'assistant', content: c.start });
  }
  return msgs;
};
// 粗略 token 估算：中日韩字符约 1 token，其余约 4 字符 1 token
function estTokens(t) {
  const s = String(t || '');
  const cjk = (s.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk + (s.length - cjk) / 4);
}
// 剥掉思维链，只留正文。找不到结束标签时原样返回，交给格式检查报错
function stripCoT(txt, step) {
  const p = DB.prompts[step], c = p?.presets[p.cur]?.cot;
  if (!c?.on || !c.end) return { body: txt, cot: '' };
  const i = txt.lastIndexOf(c.end);
  if (i < 0) return { body: txt, cot: '', miss: true };
  const cot = txt.slice(0, i).replace(c.start, '').trim();
  return { body: txt.slice(i + c.end.length).replace(/^\s+/, ''), cot };
}
// 该步使用的 API：步骤单独设置优先，否则跟随主设置
const apiOf = step => { const i = DB.prompts[step]?.api; return DB.apis[i >= 0 && DB.apis[i] ? i : DB.apiCur]; };

// ============ 续写上下文 ============
// 章节是一棵树：chapter.parent 指向上一章的下标，重读后做出不同选择会分叉出新的一页
// 当前这一页 = 从 chIdx 沿 parent 回溯到根的链条
function lineage(g) {
  const ch = g.chapters || [], out = [];
  for (let i = g.chIdx ?? -1, guard = 0; i >= 0 && i < ch.length && guard++ < 999; i = ch[i].parent ?? -1) out.push(i);
  return out.reverse();
}
const histChapters = g => lineage(g).map(i => g.chapters[i]);
// 本页经历过的节点，用于防循环；不再把别的分支算进来
const visitedOn = g => histChapters(g).map(c => c.node).filter(Boolean);

// "一条路线" = 一章里玩家实际读到的正文（含所做的选择），存于 chapter.read
const chRead = (c, i) => `【第${i + 1}条 · ${c.node || '?'}】\n${c.read || '（该章尚未读完）'}`;

// 只有"覆盖范围正好是当前页前缀"的总结才能用。
// 这样重读到第13条时，覆盖1-10的总结仍然有效，覆盖11-20的则自动失效。
function validSums(g) {
  const line = lineage(g), out = [];
  for (const s of g.sums || []) {
    const c = s.chain || [];
    if (c.length && c.length <= line.length && c.every((x, i) => x === line[i])) out.push(s);
  }
  return out.sort((a, b) => a.chain.length - b.chain.length);
}
const summedCount = g => validSums(g).at(-1)?.chain.length || 0;

function storyCtx(g = DB.game || {}) {
  // 最后一章就是 {{prev_text}}（刚读完的那一段），这里不再重复发送
  const ch = histChapters(g).slice(0, -1), c = DB.cfg;
  if (!ch.length) return '（无更早的剧情，上一段原文见下）';
  if (c.ctxMode !== 'sum') {
    const k = Math.max(1, c.ctxCount), start = Math.max(0, ch.length - k);
    return ch.slice(start).map((x, j) => chRead(x, start + j)).join('\n\n');
  }
  const last = validSums(g).at(-1);
  const from = summedCount(g);
  const buf = ch.slice(from).map((x, j) => chRead(x, from + j)).join('\n\n');
  return (last ? `# 剧情大总结（第${last.no}次，覆盖第1-${from}条）\n\n${last.text}\n\n# 之后的路线原文\n\n` : '') + (buf || '（无）');
}

// 是否该总结：未总结条数 ≥ 间隔 + 缓冲
function sumDue(g = DB.game) {
  const c = DB.cfg;
  if (!g || c.ctxMode !== 'sum') return false;
  return histChapters(g).length - summedCount(g) >= c.sumEvery + c.sumBuffer;
}
// 本次总结覆盖的范围 [from, to)，只含未被总结过的部分
function sumRange(g = DB.game) {
  const n = histChapters(g).length, from = summedCount(g);
  return { from, to: Math.min(from + DB.cfg.sumEvery, Math.max(from, n - DB.cfg.sumBuffer)) };
}

// ============ 预设差异 ============
// 只比较会影响发送内容的字段：段落的 role / content / on，以及思维链
const presetSig = p => JSON.stringify({
  e: (p.entries || []).map(e => [e.role, e.content, e.on !== false]),
  c: p.cot ? [!!p.cot.on, !!p.cot.prefill, p.cot.start, p.cot.end, p.cot.guide] : null
});
function presetDiff(step, p) {
  const d = DEFAULT_PRESETS[step]?.[0];
  if (!d) return ['没有可对比的默认预设'];
  const out = [], a = p.entries || [], b = d.entries || [];
  if (a.length !== b.length) out.push(`段落数 ${a.length}（默认 ${b.length}）`);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (!x || !y) continue;
    if (x.role !== y.role) out.push(`#${i + 1} 角色 ${x.role}（默认 ${y.role}）`);
    if ((x.on !== false) !== (y.on !== false)) out.push(`#${i + 1} ${x.on === false ? '已关闭' : '已开启'}（默认${y.on === false ? '关闭' : '开启'}）`);
    if (x.content !== y.content) out.push(`#${i + 1} 内容已修改`);
  }
  const pc = p.cot || {}, dc = d.cot || {};
  if (!!pc.on !== !!dc.on) out.push(`思维链${pc.on ? '开启' : '关闭'}（默认${dc.on ? '开启' : '关闭'}）`);
  if (!!pc.prefill !== !!dc.prefill) out.push(`预填充${pc.prefill ? '开启' : '关闭'}（默认${dc.prefill ? '开启' : '关闭'}）`);
  if (pc.start !== dc.start || pc.end !== dc.end) out.push('思维链标签已修改');
  if (pc.guide !== dc.guide) out.push('思维链指引已修改');
  return out;
}

// ============ API ============
async function callAI(messages, onDelta, a = DB.apis[DB.apiCur]) {
  if (!a || !a.base) throw new Error('未配置 API，请到设置里添加');
  const url = a.base.replace(/\/+$/, '') + '/chat/completions';
  const body = { model: a.model || 'gpt-4o-mini', messages, stream: !!onDelta };
  if (a.temp != null && a.temp !== '') body.temperature = Number(a.temp);
  if (a.maxTokens) body.max_tokens = Number(a.maxTokens);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (a.key || '') },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  if (!onDelta) return (await r.json()).choices?.[0]?.message?.content || '';

  // SSE 流式
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = '', out = '';
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) {
      const s = ln.trim(); if (!s.startsWith('data:')) continue;
      const d = s.slice(5).trim(); if (d === '[DONE]') continue;
      try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) { out += t; onDelta(out); } } catch {}
    }
  }
  return out;
}

// ============ 产出切分 ============
// AI 常见格式偏差的自动修正：全角括号/冒号、外层代码块、加粗标题、编号标题
function normalizeMD(md) {
  let s = String(md).replace(/\r\n?/g, '\n');
  // 去掉包裹整篇的 ```markdown ... ```
  const fence = s.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (fence) s = fence[1];
  return s.split('\n').map(ln => {
    let t = ln;
    // ## **一、标题** / ## 1. 标题 → ## 标题
    t = t.replace(/^(#{2,3})\s*\**\s*(?:[一二三四五六七八九十]+[、.．]|\d+[、.．)]\s*)?\s*(.+?)\s*\**\s*[:：]?\s*$/, (m, h, x) => `${h} ${x.replace(/\*+/g, '')}`);
    // 标签内全角符号 → 半角
    t = t.replace(/[【［]/g, '[').replace(/[】］]/g, ']');
    t = t.replace(/^\s*\[(say|music|stat|state|branch|react)\s*[：:]\s*/i, (m, k) => `[${k.toLowerCase()}:`);
    t = t.replace(/^\s*\[\s*(\/?)\s*(choice|think|minor|react)\s*\]/i, (m, sl, k) => `[${sl}${k.toLowerCase()}]`);
    // 选项行：- （A）文字 / 1. (A) 文字 / - A. 文字
    t = t.replace(/^\s*(?:[-*]|\d+[.、)])?\s*[（(]\s*([\w-]+)\s*[)）]\s*/, '- ($1) ');
    return t;
  }).join('\n');
}

// 按二级标题切块，返回 {标题: 内容}
function splitSections(md) {
  const out = {}; let cur = null;
  for (const ln of normalizeMD(md).split('\n')) {
    const m = ln.match(/^##\s+(.+?)\s*$/);
    if (m && !ln.startsWith('###')) { cur = m[1].trim(); out[cur] = ''; } else if (cur) out[cur] += ln + '\n';
  }
  for (const k in out) out[k] = out[k].trim();
  return out;
}
// 标题模糊匹配：AI 写成"世界观设定（整合）"也能认
const pick = (sec, ...names) => {
  for (const n of names) if (sec[n]) return sec[n];
  for (const n of names) for (const k in sec) if (k.includes(n) && sec[k]) return sec[k];
  return '';
};

// ============ 游戏设计步骤（第三步）解析 ============
// 产出三张表：角色颜色 / 数值阈值规则 / 小游戏。全部存进 g.design
function parseDesign(md) {
  const s = splitSections(md);
  const rows = txt => String(txt).split('\n').map(l => l.trim())
    .filter(l => l.includes('|') && !/^[|\-: ]+$/.test(l))
    .map(l => l.replace(/^[-*`|\s]+|[|`\s]+$/g, '').split('|').map(x => x.trim()));

  // 角色颜色：角色名 | 颜色 | 理由
  const colors = {};
  for (const c of rows(pick(s, '角色颜色表', '角色说话颜色'))) {
    if (!c[0] || /角色名/.test(c[0])) continue;
    const hex = (c[1] || '').match(/#[0-9a-f]{3,8}/i);
    if (hex) colors[PLAYER_ALIAS(c[0])] = { color: hex[0], why: c[2] || '' };
  }
  // 数值阈值：数值名 | 区间 | 触发的反应
  const statRules = {};
  for (const c of rows(pick(s, '数值阈值设计', '数值阈值'))) {
    if (!c[0] || /数值名/.test(c[0])) continue;
    const lo = +(c[1] || '').match(/\d+/)?.[0];
    const hi = +((c[1] || '').match(/\d+/g) || [])[1];
    (statRules[c[0]] ??= []).push({ range: c[1] || '', lo: isNaN(lo) ? 0 : lo, hi: isNaN(hi) ? 100 : hi, effect: c[2] || '' });
  }
  // 小游戏：每个三级标题一节，内含标记、名称、说明、HTML 代码块
  const games = [];
  for (const part of String(pick(s, '小游戏')).split(/^(?=###\s)/m)) {
    if (!/^###\s/.test(part)) continue;
    const name = part.match(/^###\s*(.+)$/m)?.[1]?.trim() || '未命名';
    const tag = part.match(/\[game:\s*([\w-]+)\s*\]/)?.[1] || part.match(/标记[：:]\s*\[?([\w-]+)\]?/)?.[1];
    const code = part.match(/```(?:html)?\s*\n([\s\S]*?)```/)?.[1]?.trim() || '';
    // 说明 = 去掉标题、标记行与代码块后剩下的文字
    const use = part.replace(/^###.*$/m, '').replace(/```[\s\S]*?```/g, '')
      .replace(/^.*\[game:[\w-]+\].*$/gm, '').replace(/^\s*标记[：:].*$/gm, '').trim();
    if (tag && code) games.push({ tag, name, use, code });
  }
  return { colors, statRules, games, raw: md };
}
// 小游戏说明清单 → 提示词（只给标记和用法，不给代码，省 token）
function gameListText(d) {
  const gs = d?.games || [];
  if (!gs.length) return '（本作没有小游戏，不要输出 [game:] 标记）';
  return gs.map(g => `- \`[game:${g.tag}]\` ${g.name}：${(g.use || '').replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');
}
function colorTableText(d) {
  const e = Object.entries(d?.colors || {});
  if (!e.length) return '（尚未设计角色颜色）';
  return e.map(([n, c]) => `- ${n}：${c.color}${c.why ? '（' + c.why + '）' : ''}`).join('\n');
}
function statRulesText(d) {
  const e = Object.entries(d?.statRules || {});
  if (!e.length) return '（尚未设计数值阈值）';
  return e.map(([n, rs]) => `- ${n}：` + rs.map(r => `${r.range} → ${r.effect}`).join('；')).join('\n');
}
// 当前数值命中的阈值规则，发给续写用
function activeStatRules(g) {
  const rs = g.design?.statRules || {}, out = [];
  for (const [n, list] of Object.entries(rs)) {
    const v = g.stats?.[n]; if (v == null) continue;
    for (const r of list) if (v >= r.lo && v <= r.hi) out.push(`${n}=${v}（${r.range}）→ ${r.effect}`);
  }
  return out.join('\n') || '（当前数值未命中任何已设计的阈值）';
}

function parseStep1(md) {
  const s = splitSections(md);
  return {
    s1_world: pick(s, '世界观设定'), s1_player: pick(s, '主控档案', '玩家档案'),
    s1_chars: pick(s, '角色档案'), s1_relations: pick(s, '人物关系图'),
    s1_truth: pick(s, '真相线大纲'), s1_theme: pick(s, '母题与基调'), s1_notes: pick(s, '改写说明')
  };
}
function parseStep2(md) {
  const s = splitSections(md);
  const idx = pick(s, '节点索引').split('\n').map(l => l.trim())
    .filter(l => l.includes('|') && !/^[|\-: ]+$/.test(l))
    .map(l => { const c = l.replace(/^[-*`|\s]+|[|`\s]+$/g, '').split('|').map(x => x.trim()); return { id: c[0], route: c[1], act: c[2], prev: c[3], n: +c[4] || 0 }; })
    // START 是"无前置"的占位符，不是节点；AI 常把它误写成一行，会造成重复ID
    .filter(n => n.id && !/节点ID/.test(n.id) && !/^(START|无|-+)$/i.test(n.id))
    // 节点ID 只能是 C-N1 / R2-END1 这种英数字编号。AI 常把伏笔清单等别的表格塞进节点索引，
    // 那些行第一列是中文描述，不是节点，直接丢掉
    .filter(n => /^[A-Za-z]+\d*(-[A-Za-z0-9]+)+$/.test(n.id));
  return {
    s2_routes: [pick(s, '共通线'), pick(s, '路线总览'), pick(s, '路线详述')].filter(Boolean).join('\n\n'),
    s2_common: pick(s, '共通线'),
    s2_overview: pick(s, '路线总览'), s2_detail: pick(s, '路线详述'),
    s2_index: idx, s2_statspec: pick(s, '数值规约')
  };
}
// ============ 路线图编辑（纯数据，界面在 app.js） ============
// 会不会成环：把 id 的前置设成 prev 后，从 prev 往上追能不能追回 id
function makesCycle(nodes, id, prev) {
  const by = new Map(nodes.map(n => [n.id, n]));
  for (let p = prev, k = 0; p && p !== 'START' && k < 999; p = by.get(p)?.prev, k++) if (p === id) return true;
  return false;
}
// 改/建一个节点。old 为空表示新建。返回错误文字或 ''
// 改 ID 时同步：其他节点的前置、去向表、玩家确认过的去向、当前节点、已访问
function upsertNode(g, old, nd) {
  const nodes = g.nodes || (g.nodes = []);
  nd = { id: normId(nd.id), route: normId(nd.route), act: String(nd.act || '').trim(), prev: nd.prev === 'START' ? 'START' : normId(nd.prev), n: Math.max(0, +nd.n || 0) };
  if (!nd.id) return '节点ID不能为空';
  if (nd.id === 'START' || nd.id === 'END') return 'START / END 是保留字，不能作为节点ID';
  if (nodes.some(x => x.id === nd.id && x.id !== old)) return `节点ID ${nd.id} 已存在`;
  if (nd.prev === nd.id) return '前置不能是自己';
  if (old && makesCycle(nodes.map(x => x.id === old ? { ...x, id: nd.id } : x.prev === old ? { ...x, prev: nd.id } : x), nd.id, nd.prev)) return `把前置设为 ${nd.prev} 会形成循环`;
  if (!old) { nodes.push(nd); }
  else {
    const i = nodes.findIndex(x => x.id === old);
    if (i < 0) return `找不到节点 ${old}`;
    nodes[i] = nd;
    if (old !== nd.id) {
      for (const x of nodes) if (x.prev === old) x.prev = nd.id;
      const fm = g.forkMap || {};
      if (fm[old]) { fm[nd.id] = fm[old]; delete fm[old]; }
      for (const k in fm) for (const e of fm[k]) if (e.to === old) e.to = nd.id;
      for (const k of Object.keys(g.routeFix || {})) {
        const [a, b] = k.split('|'), v = g.routeFix[k];
        delete g.routeFix[k];
        g.routeFix[`${a === old ? nd.id : a}|${b}`] = v === old ? nd.id : v;
      }
      if (g.node === old) g.node = nd.id;
      g.visited = (g.visited || []).map(v => v === old ? nd.id : v);
    }
  }
  if (g.node === nd.id) g.route = nd.route;
  if (g.s2parts) g.s2parts.s2_index = nodes;
  return '';
}
// 删除节点：把它当前置的节点不自动改，留给检查标红
function deleteNode(g, id) {
  g.nodes = (g.nodes || []).filter(x => x.id !== id);
  if (g.forkMap) { delete g.forkMap[id]; for (const k in g.forkMap) for (const e of g.forkMap[k]) if (e.to === id) e.to = ''; }
  if (g.s2parts) g.s2parts.s2_index = g.nodes;
}
// 新节点建议ID：该路线 N 编号最大的 +1
function suggestId(g, route) {
  const r = normId(route), nums = (g.nodes || []).filter(n => normId(n.route) === r).map(n => +(n.id.match(/-N(\d+)$/i)?.[1] || 0));
  return `${r}-N${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
// 全图检查：返回 {节点ID: [问题]}，'*' 收全局问题
function routeIssues(g, routeCount) {
  const nodes = g.nodes || [], out = {}, add = (id, m) => (out[id] ??= []).push(m);
  const ids = new Map();
  for (const n of nodes) ids.set(n.id, (ids.get(n.id) || 0) + 1);
  const starts = nodes.filter(n => n.prev === 'START');
  if (starts.length !== 1) add('*', `有 ${starts.length} 个节点的前置是 START，应当只有 1 个`);
  for (const n of nodes) {
    if (ids.get(n.id) > 1) add(n.id, 'ID 重复');
    if (n.prev !== 'START' && !ids.has(n.prev)) add(n.id, `前置 ${n.prev} 不存在`);
    if (makesCycle(nodes, n.id, n.prev)) add(n.id, '前置链路形成循环');
    const kids = nextsOf(g, n.id);
    if (!kids.length && !/终局|结局|END/i.test(n.act)) add(n.id, '没有后继，也不是终局');
    if (/END/i.test(n.id) && !endingsOf(g)[n.id]?.cond) add(n.id, '没有写结局条件（AI 判定结局时无据可依）');
    const fm = (g.forkMap || {})[n.id];
    if (fm && kids.length > 1 && !isEndingJudge(g, n.id)) {
      const miss = fm.filter(e => !e.to || !kids.some(k => k.id === e.to));
      if (miss.length) add(n.id, `选项 ${miss.map(e => e.no).join('、')} 没有指定有效去向`);
      const tos = fm.map(e => e.to).filter(Boolean), dup = tos.filter((x, i) => tos.indexOf(x) !== i);
      if (dup.length && n === forkNode(nodes)) add(n.id, `多个选项都通往 ${[...new Set(dup)].join('、')}`);
      const unused = kids.filter(k => !tos.includes(k.id));
      if (unused.length) add(n.id, `没有选项通往 ${unused.map(k => k.id).join('、')}`);
    }
  }
  const fk = forkNode(nodes);
  if (fk && routeCount && nextsOf(g, fk.id).length !== routeCount) add(fk.id, `分岔出 ${nextsOf(g, fk.id).length} 条路线，设置是 ${routeCount} 条`);
  return out;
}

// 分岔节点：前置是共通线节点、自身属于路线的节点，其前置即为分岔点
function forkNode(nodes) {
  const isC = n => /^C$/i.test(n?.route || '');
  const hit = (nodes || []).find(n => !isC(n) && (nodes || []).some(m => m.id === n.prev && isC(m)));
  return hit ? (nodes || []).find(m => m.id === hit.prev) : null;
}

// 正文解析 → {blocks:{main|选项ID:[seg]}, summary, sum, warn:[行级问题]}
function parseStory(md) {
  const sec = splitSections(md);
  const body = pick(sec, '正文') || normalizeMD(md);
  const summary = pick(sec, '节点摘要');
  const blocks = { main: [] }, warn = []; let cur = 'main';
  const lines = body.split('\n');
  const TAG = /^\[(say:|think\]|music:|stat:|state:|choice\]|\/choice\]|branch:|minor\]|\/minor\]|react:|\/react\]|game:)/;
  // 解析单行台词/旁白/数值/音乐，供主线与小选项反应共用
  const lineSeg = (ln, n) => {
    let m;
    if ((m = ln.match(/^\[music:\s*(.+?)\s*\]$/))) return { t: 'music', v: m[1] };
    if ((m = ln.match(/^\[stat:\s*(.+?)\s*([+-])\s*(\d+)\s*\]$/))) return { t: 'stat', name: m[1], d: (m[2] === '-' ? -1 : 1) * +m[3] };
    if ((m = ln.match(/^\[game:\s*([\w-]+)\s*\]$/))) return { t: 'game', tag: m[1] };
    if ((m = ln.match(/^\[say:\s*(.+?)\s*\]\s*(.*)$/))) {
      if (!m[2]) warn.push(`第${n}行：台词为空`);
      // [say:王主任（王明）] —— 括号外是主控此刻对他的称呼，括号内是档案本名（只用于匹配颜色，不显示）
      const sp = splitWho(m[1]);
      return { t: 'say', who: sp.show, real: sp.real, v: m[2] };
    }
    if ((m = ln.match(/^\[state:\s*(.+?)\s*\]$/))) {
      const c = m[1].split('|').map(x => x.trim());
      if (c.length < 3) warn.push(`第${n}行：[state:] 需要"角色名|生理|心理|对主控态度"四段`);
      // 状态按档案本名归档，避免同一个人因称呼变化而出现两条
      const sw = splitWho(c[0]);
      return { t: 'state', who: sw.real || sw.show, body: c[1] || '', mind: c[2] || '', att: c[3] || '' };
    }
    if ((m = ln.match(/^\[think\]\s*(.*)$/))) return { t: 'think', v: m[1] };
    if (ln.startsWith('[') && !ln.startsWith('[[') && !TAG.test(ln)) warn.push(`第${n}行：无法识别的标签 "${ln.slice(0, 20)}"`);
    if (/^\s*-\s*\(/.test(ln)) warn.push(`第${n}行：选项行出现在 [choice]/[minor] 之外`);
    if (/^[“"「].+[”"」]\s*[^\s]{0,6}[说道问]/.test(ln)) warn.push(`第${n}行：疑似用引号写的台词，应改为 [say:角色名]`);
    if ((ln.match(/\[\[/g) || []).length !== (ln.match(/\]\]/g) || []).length) warn.push(`第${n}行：可点击文本 [[ ]] 未配对`);
    return { t: 'p', v: ln.replace(/\*\*(.+?)\*\*/g, '$1') };
  };
  const readOpts = (closeRe, tagName) => {
    const opts = [], start = i;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (closeRe.test(t)) { i++; break; }
      const o = t.match(/^-\s*\(([\w-]+)\)\s*(.+)$/);
      if (o) { const { text, req } = parseReq(o[2]); opts.push({ id: o[1], text, req }); i++; continue; }
      if (!t) { i++; continue; }
      warn.push(`第${start}行：[${tagName}] 没有用 [/${tagName}] 闭合`); break;
    }
    if (!opts.length) warn.push(`第${start}行：[${tagName}] 内没有合法选项行（应为 "- (ID) 文字"）`);
    return opts;
  };
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i].trim(); i++;
    if (!ln || /^```/.test(ln) || /^-{3,}$/.test(ln)) continue;
    let m;
    if ((m = ln.match(/^\[branch:\s*(.+?)\s*\]$/))) { cur = m[1]; if (blocks[cur]) warn.push(`第${i}行：分支 ${cur} 重复出现`); blocks[cur] = []; continue; }
    const arr = blocks[cur] || (blocks[cur] = []);
    if (/^\[choice\]$/.test(ln)) { arr.push({ t: 'choice', opts: readOpts(/^\[\/choice\]$/, 'choice') }); continue; }
    if (/^\[minor\]$/.test(ln)) {
      const start = i, opts = readOpts(/^\[\/minor\]$/, 'minor'), react = {};
      // 读取 [react:id] … 直到 [/react]；遇到 choice/branch/minor 视为漏写 [/react]
      // 兼容两种收尾写法：整组一个 [/react]，或每段反应各自一个 [/react]（AI 很常这样写）
      let rid = null;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (/^\[\/react\]$/.test(t)) {
          i++;
          // 后面紧跟（可隔空行）的还是 [react:]，说明是"每段各自收尾"，继续读
          let j = i; while (j < lines.length && !lines[j].trim()) j++;
          if (j < lines.length && /^\[react:\s*[\w-]+\s*\]$/.test(lines[j].trim())) { i = j; continue; }
          break;
        }
        const r = t.match(/^\[react:\s*([\w-]+)\s*\]$/);
        if (r) { rid = r[1]; react[rid] = []; i++; continue; }
        if (/^\[(choice|branch:|minor)/.test(t)) { warn.push(`第${start}行：[minor] 的反应缺少 [/react] 收尾`); break; }
        i++;
        if (!t) continue;
        if (!rid) { warn.push(`第${i}行：[/minor] 之后应紧跟 [react:选项ID]`); continue; }
        const seg = lineSeg(t, i);
        if (seg.t === 'stat' && Math.abs(seg.d) > 5) warn.push(`第${i}行：小选项的数值变化 ${seg.d} 超过 ±5`);
        react[rid].push(seg);
      }
      for (const o of opts) if (!react[o.id]?.length) warn.push(`小选项 ${o.id} 缺少 [react:${o.id}] 反应`);
      arr.push({ t: 'minor', opts, react }); continue;
    }
    arr.push(lineSeg(ln, i));
  }
  return { blocks, summary, sum: parseSummary(summary), warn };
}
// 节点摘要 → {选项ID: {fact, next, delta, kind}}
function parseSummary(txt) {
  const out = {};
  for (const ln of String(txt).split('\n')) {
    const s = ln.trim().replace(/^[-*|`]+|[|`]+$/g, '').trim();
    if (!s.includes('|')) continue;
    const c = s.split('|').map(x => x.trim());
    if (!c[0] || /选项ID/.test(c[0])) continue;
    out[c[0]] = { fact: c[1] || '', next: c[2] || '', delta: c[3] || '', kind: c[4] || '' };
  }
  return out;
}