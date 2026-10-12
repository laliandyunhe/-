'use strict';
// ============ 侧边栏抽屉 ============
function sideOpen(on) {
  document.body.classList.toggle('side-open', on);
  S('scrim').hidden = !on;
  S('hamb').setAttribute('aria-expanded', String(on));
  if (on) renderSide();
}
const sideToggle = () => sideOpen(!document.body.classList.contains('side-open'));

function renderSide() {
  const g = DB.game;
  S('pname').textContent = DB.cfg.pname || '你';
  S('stats').innerHTML = DB.cfg.stats.map(n => {
    const v = Math.max(0, Math.min(100, (g?.stats?.[n]) ?? 50));
    return `<div class="stat">${esc(n)} <span class="muted">${v}</span>
      <div class="bar"><i style="width:${v}%;background:${barColor(n)}"></i></div></div>`;
  }).join('');
  S('route').textContent = g ? `路线 ${g.route || '—'} / 节点 ${g.node || '—'}` : '未开始';
  renderChars();
}

// 角色状态：主控置顶，其余按最近更新排序；点击展开
function renderChars() {
  const el = S('chars'), g = DB.game;
  if (!el) return;
  const P = PLAYER_KEY;
  const list = Object.entries(g?.chars || {}).sort((a, b) => (a[0] === P ? -1 : b[0] === P ? 1 : (b[1].ts || 0) - (a[1].ts || 0)));
  if (!list.length) { el.innerHTML = '<p class="muted" style="font-size:12px">暂无角色状态</p>'; return; }
  el.innerHTML = list.map(([n, c]) => `<details class="cs"${n === P ? ' open' : ''}>
      <summary style="color:${n === P ? '#e8d8b0' : whoColor(n)}">${esc(n === P ? (DB.cfg.pname || '你') : n)}</summary>
      <div><span class="muted">生理</span> ${esc(c.body || '—')}</div>
      <div><span class="muted">心理</span> ${esc(c.mind || '—')}</div>
      ${n === P ? '' : `<div><span class="muted">对你</span> ${esc(c.att || '—')}</div>`}
    </details>`).join('');
}

// 角色名配色：按名字哈希取柔和色相
function whoColor(name) {
  if (name === PLAYER_KEY) return '#e8d8b0';   // 主控固定暖色，和侧边栏一致
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h},42%,68%)`;
}

// ============ 弹窗 ============
// 所有弹窗统一带返回条，title 为空则只显示关闭
function dialog(html, titleText, onBack) {
  S('dlg-body').innerHTML = `<div class="row dlg-bar">
      <button type="button" id="dlg-back">${onBack ? '← 返回' : '← 关闭'}</button>
      <b style="flex:1">${esc(titleText || '')}</b>
      <button type="button" id="dlg-x">×</button>
    </div><div id="dlg-main">${html}</div>`;
  if (!S('dlg').open) S('dlg').showModal();
  S('dlg-back').onclick = () => (onBack ? onBack() : closeDlg());
  S('dlg-x').onclick = closeDlg;
  S('dlg').scrollTop = 0;
  return S('dlg-main');
}
const closeDlg = () => S('dlg').close();

// ============ 预设通用 UI ============
// list: 预设数组对象 {presets,cur}；render 之后调用 onChange
function presetBar(o, onChange, label = '预设') {
  const sel = document.createElement('select');
  o.presets.forEach((p, i) => sel.add(new Option(p.name, i, false, i === o.cur)));
  sel.onchange = () => { o.cur = +sel.value; save(); onChange(); };
  const wrap = document.createElement('div'); wrap.className = 'row';
  wrap.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: label }), sel);
  const btn = (t, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = fn; wrap.append(b); return b; };
  btn('新建', () => { const n = prompt('预设名'); if (!n) return; o.presets.push({ name: n, text: '', entries: [] }); o.cur = o.presets.length - 1; save(); onChange(); });
  btn('重命名', () => { const n = prompt('新名称', o.presets[o.cur].name); if (!n) return; o.presets[o.cur].name = n; save(); onChange(); });
  btn('删除', () => { if (o.presets.length < 2) return alert('至少保留一个'); if (!confirm('删除预设 ' + o.presets[o.cur].name + '？')) return; o.presets.splice(o.cur, 1); o.cur = 0; save(); onChange(); });
  return wrap;
}

function exportJSON(obj, name) {
  const txt = JSON.stringify(obj, null, 2);
  // 内置浏览器 / WebView 常常不支持 <a download>：先试系统分享，再退到"复制文本"弹窗，保证一定能导出
  // APK 外壳提供原生保存：直接写进手机「下载」目录，并告诉用户具体路径
  if (window.AndroidBridge?.saveFile) {
    const r = window.AndroidBridge.saveFile(name, txt);
    if (r && !r.startsWith('ERR:')) return alert('已导出到：\n' + r + '\n\n可在文件管理 →「下载」(Download) 中找到。');
    alert('写入文件失败：' + (r || '未知错误') + '\n下面改为复制文本导出。');
    return textExport(txt, name);
  }
  const file = typeof File === 'function' ? new File([txt], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: name }).catch(e => { if (e.name !== 'AbortError') textExport(txt, name); });
    return;
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch { /* 走下面的兜底 */ }
  // 无法确认下载是否真的发生，所以总是给出文本兜底
  textExport(txt, name);
}
function textExport(txt, name) {
  const box = dialog(`<p class="muted">如果没有弹出下载，请把下面的内容复制保存为 <code>${esc(name)}</code>。</p>
    <div class="row"><button type="button" id="tx-copy">复制全部</button><span id="tx-msg" class="muted"></span></div>
    <textarea id="tx-body" readonly style="min-height:240px" aria-label="导出内容">${esc(txt)}</textarea>`, '导出');
  box.querySelector('#tx-copy').onclick = async () => {
    const ta = box.querySelector('#tx-body'), m = box.querySelector('#tx-msg');
    try { await navigator.clipboard.writeText(txt); m.textContent = '已复制'; }
    catch { ta.select(); m.textContent = document.execCommand('copy') ? '已复制' : '请长按文本框手动全选复制'; }
  };
}
function importJSON(cb) {
  // 文件选择器在部分内置浏览器里也不可用，同时提供"粘贴文本"入口
  const box = dialog(`<div class="row"><button type="button" id="im-file">选择文件</button></div>
    <p class="muted">或者把导出的内容粘贴到下面：</p>
    <textarea id="im-body" style="min-height:200px" aria-label="粘贴导入内容"></textarea>
    <div class="row"><button type="button" id="im-go">导入粘贴的内容</button></div>`, '导入');
  const run = t => { try { const o = JSON.parse(t); closeDlg(); cb(o); } catch (e) { alert('解析失败：' + e.message); } };
  box.querySelector('#im-go').onclick = () => run(box.querySelector('#im-body').value);
  box.querySelector('#im-file').onclick = () => {
    const inp = S('file-in');
    inp.onchange = () => { const f = inp.files[0]; if (f) f.text().then(run); inp.value = ''; };
    inp.click();
  };
}

// ============ 设置 ============
let setTab = 'api';
function openSettings(tab) {
  setTab = tab || setTab;
  dialog(`<div class="row tabs">
    ${['api:API', 'text:设定输入', 'game:数值与玩家', 'color:台词颜色', 'mini:小游戏', 'music:音乐', 'data:数据'].map(t => {
      const [k, n] = t.split(':');
      return `<button type="button" data-tab="${k}" class="${setTab === k ? 'on' : ''}">${n}</button>`;
    }).join('')}
  </div><div id="set-body"></div>`, '设置');
  S('dlg-body').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => openSettings(b.dataset.tab));
  ({ api: setApi, text: setText, game: setGame, color: setColor, mini: setMini, music: setMusic, data: setData }[setTab])();
}

// 音乐：导入本机音频；名称和标签发给 AI 选曲（AI 写 [music:名称]）
async function setMusic() {
  const box = S('set-body');
  const list = await musicList(true);
  const mb = n => (n / 1048576).toFixed(1) + 'MB';
  box.innerHTML = `<p class="muted">只播放你自己导入的音频，文件保存在本机，不联网。名称和标签会发给 AI，AI 按场景从中挑选；没导入音乐时 AI 不会写音乐标记。</p>
    <div class="row"><button type="button" id="mu-add">导入音乐</button>
      <span class="muted" style="font-size:12px">可多选；mp3 / m4a / ogg / wav / flac，单个不超过 30MB</span></div>
    <p id="mu-msg" role="status" class="muted"></p>
    ${list.length ? list.map(m => `<div class="entry" data-id="${esc(m.id)}">
      <label class="muted" for="mu-n-${esc(m.id)}" style="font-size:12px">名称</label>
      <input id="mu-n-${esc(m.id)}" data-f="name" value="${esc(m.name)}" autocomplete="off">
      <label class="muted" for="mu-t-${esc(m.id)}" style="font-size:12px">标签（场景/情绪，用逗号分隔，如：紧张,夜晚）</label>
      <input id="mu-t-${esc(m.id)}" data-f="tags" value="${esc((m.tags || []).join('，'))}" autocomplete="off">
      <div class="row"><button type="button" data-act="play">试听</button><button type="button" data-act="save">保存</button>
        <button type="button" data-act="del">删除</button><span class="muted" style="font-size:12px">${mb(m.size || 0)}</span></div></div>`).join('')
      : '<p class="muted">还没有导入音乐。</p>'}`;
  S('mu-add').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac'; inp.multiple = true;
    inp.onchange = async () => {
      if (!inp.files.length) return;
      S('mu-msg').textContent = '正在导入…';
      try {
        const r = await importMusicFiles([...inp.files]);
        await setMusic();
        S('mu-msg').textContent = `已导入 ${r.done.length} 首` + (r.bad.length ? `；未导入：${r.bad.join('；')}` : '');
        S('mu-msg').className = r.bad.length ? 'err' : 'ok';
      } catch (e) { S('mu-msg').textContent = '导入失败：' + (e.message || e); S('mu-msg').className = 'err'; }
    };
    inp.click();
  };
  box.querySelectorAll('.entry[data-id]').forEach(row => {
    const id = row.dataset.id, f = k => row.querySelector(`[data-f="${k}"]`).value;
    row.querySelector('[data-act="play"]').onclick = () => { curTrack = ''; playMusic(f('name')); };
    row.querySelector('[data-act="save"]').onclick = async () => {
      const name = f('name').trim();
      if (!name) { S('mu-msg').textContent = '名称不能为空'; S('mu-msg').className = 'err'; return; }
      if ((await musicList()).some(m => m.id !== id && m.name === name)) { S('mu-msg').textContent = '已有同名音乐'; S('mu-msg').className = 'err'; return; }
      await updateTrack(id, { name, tags: f('tags').split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean) });
      S('mu-msg').textContent = '已保存'; S('mu-msg').className = 'ok';
    };
    row.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm(`删除"${f('name')}"？`)) return;
      stopMusic(); await removeTrack(id); await setMusic();
    };
  });
}

// 台词颜色：主控 / 无专属颜色的角色 / 旁白引号 三项由玩家定；角色专属色来自游戏设计步骤，可在此微调
function setColor() {
  const c = DB.cfg, d = DB.game?.design;
  const row = (id, label, val) => `<div class="row"><input type="color" id="${id}" value="${esc(val)}" aria-label="${esc(label)}">
    <span>${esc(label)}</span><span style="color:${esc(val)}" id="${id}-demo">示例：今晚的雨不会停了。</span></div>`;
  S('set-body').innerHTML = `<p class="muted">台词按说话人的档案本名匹配颜色；没有专属颜色的角色用"其他角色"色。</p>
    ${row('k-p', '主控（你）', c.pcolor)}
    ${row('k-o', '其他角色（无专属颜色）', c.ocolor)}
    ${row('k-q', '旁白里“引号”中的话', c.qcolor)}
    <h3>角色专属颜色（来自游戏设计步骤）</h3>
    ${d && Object.keys(d.colors || {}).length
      ? Object.entries(d.colors).map(([n, x], i) => `<div class="row"><input type="color" data-ck="${esc(n)}" value="${esc(/^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#cccccc')}" aria-label="${esc(n)} 的颜色">
          <span style="color:${esc(x.color)}">${esc(n)}</span><span class="muted" style="font-size:12px">${esc(x.why || '')}</span></div>`).join('')
      : '<p class="muted">还没有完成游戏设计步骤。</p>'}
    <div class="row"><button type="button" id="k-save">保存</button><span id="k-msg" class="muted"></span></div>`;
  for (const id of ['k-p', 'k-o', 'k-q']) S(id).oninput = e => { S(id + '-demo').style.color = e.target.value; };
  S('k-save').onclick = () => {
    Object.assign(c, { pcolor: S('k-p').value, ocolor: S('k-o').value, qcolor: S('k-q').value });
    S('set-body').querySelectorAll('[data-ck]').forEach(el => { if (d.colors[el.dataset.ck]) d.colors[el.dataset.ck].color = el.value; });
    save(); S('k-msg').textContent = '已保存'; S('k-msg').className = 'ok';
  };
}

// 已制作的小游戏：查看说明、代码、试玩、删除
function setMini() {
  const d = DB.game?.design, gs = d?.games || [];
  S('set-body').innerHTML = gs.length
    ? `<p class="muted">共 ${gs.length} 个。后续写作只会收到标记与使用说明，代码只保存在本机。</p>` +
      gs.map((gm, i) => `<div class="entry"><div class="row"><b>${esc(gm.name)}</b><code class="var">[game:${esc(gm.tag)}]</code>
          <button type="button" data-play="${i}">试玩</button><button type="button" data-del="${i}">删除</button></div>
        <details><summary>使用说明</summary><pre>${esc(gm.use || '（空）')}</pre></details>
        <details><summary>代码</summary><pre>${esc(gm.code)}</pre></details></div>`).join('') +
      `<p class="muted">游玩记录：${(DB.game.gameLog || []).length} 局，胜 ${(DB.game.gameLog || []).filter(x => x.win).length}。</p>`
    : '<p class="muted">还没有小游戏。请在流程中的「游戏设计」步骤生成。</p>';
  S('set-body').querySelectorAll('[data-play]').forEach(b => b.onclick = () => tryGame(gs[+b.dataset.play]));
  S('set-body').querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const gm = gs[+b.dataset.del];
    if (!confirm(`删除小游戏「${gm.name}」？已写好的正文里的 [game:${gm.tag}] 会被跳过。`)) return;
    gs.splice(+b.dataset.del, 1); save(); setMini();
  });
}

function setApi() {
  const o = { presets: DB.apis, cur: DB.apiCur };
  if (!DB.apis.length) { DB.apis.push({ name: '新配置', base: 'https://api.openai.com/v1', key: '', model: 'gpt-4o-mini', temp: 0.9, maxTokens: 8000 }); DB.apiCur = 0; save(); }
  const a = DB.apis[DB.apiCur] || DB.apis[0];
  const b = S('set-body');
  b.innerHTML = `<div id="pb"></div>
    <label>Base URL（到 /v1 为止）</label><input id="f-base" value="${esc(a.base)}">
    <label>API Key</label><input id="f-key" type="password" value="${esc(a.key)}">
    <label>模型</label><input id="f-model" value="${esc(a.model)}">
    <div class="row"><span>temperature</span><input id="f-temp" style="width:80px" value="${esc(a.temp)}">
    <span>max_tokens</span><input id="f-max" style="width:100px" value="${esc(a.maxTokens)}"></div>
    <div class="row"><button type="button" id="f-save">保存</button><button type="button" id="f-test">测试连通</button>
    <span id="f-msg" class="muted"></span></div>
    <p class="muted">Key 存在本机 localStorage，仅此设备可见。请求直接发往你填的 Base URL。</p>`;
  S('pb').append(presetBar({ get presets() { return DB.apis; }, get cur() { return DB.apiCur; }, set cur(v) { DB.apiCur = v; } }, setApi, 'API 配置'));
  S('f-save').onclick = () => {
    Object.assign(a, { base: S('f-base').value.trim(), key: S('f-key').value.trim(), model: S('f-model').value.trim(), temp: S('f-temp').value, maxTokens: S('f-max').value });
    save(); S('f-msg').textContent = '已保存'; S('f-msg').className = 'ok';
  };
  S('f-test').onclick = async () => {
    S('f-save').click(); S('f-msg').textContent = '测试中…'; S('f-msg').className = 'muted';
    try { const r = await callAI([{ role: 'user', content: '回复"ok"两个字' }]); S('f-msg').textContent = '连通：' + r.slice(0, 40); S('f-msg').className = 'ok'; }
    catch (e) { S('f-msg').textContent = e.message; S('f-msg').className = 'err'; }
  };
}

const TEXT_FIELDS = [
  ['player', '主控身份设定', '姓名、年龄、外貌、性格、偏好…（性格/偏好/外貌会被当作不可改动的核心锚点）。主控＝你在游戏里扮演的那个角色'],
  ['chars', '自定义角色设定', '每个角色一段：姓名、与主控的关系、他怎么称呼主控、外貌、性格…'],
  ['world', '世界观', '时代、地点、规则、社会结构、当前矛盾…'],
  ['style', '剧情风格', '可从下方风格预设填入，或自行描述文风与禁忌']
];
function setText() {
  const b = S('set-body');
  b.innerHTML = TEXT_FIELDS.map(([k, n, ph]) => `<div class="entry"><b>${n}</b><div id="pb-${k}"></div>
    <textarea id="t-${k}" placeholder="${esc(ph)}" style="min-height:120px">${esc(field(k))}</textarea>
    ${k === 'style' ? `<div class="row"><select id="style-pick"><option value="">— 内置风格预设 —</option>${Object.keys(STYLE_PRESETS).map(s => `<option>${s}</option>`).join('')}</select><button type="button" id="style-ins">填入</button></div>` : ''}
    </div>`).join('') + `<div class="row"><button type="button" id="t-save">保存全部</button><span id="t-msg" class="muted"></span></div>`;
  for (const [k] of TEXT_FIELDS) {
    S('pb-' + k).append(presetBar(DB.setting[k], setText));
    S('t-' + k).oninput = e => { DB.setting[k].presets[DB.setting[k].cur].text = e.target.value; };
  }
  S('style-ins').onclick = () => { const v = S('style-pick').value; if (!v) return; const ta = S('t-style'); ta.value = STYLE_PRESETS[v]; ta.oninput({ target: ta }); };
  S('t-save').onclick = () => { save(); S('t-msg').textContent = '已保存'; S('t-msg').className = 'ok'; };
}

function setGame() {
  const c = DB.cfg;
  S('set-body').innerHTML = `<label>主控显示名（侧边栏用；旁白里一律称"你"）</label><input id="g-name" value="${esc(c.pname)}">
    <label>数值项（逗号分隔，至少 5 项）</label><input id="g-stats" value="${esc(c.stats.join(','))}">
    <div class="row"><span>路线数</span><input id="g-rc" type="number" min="1" max="8" style="width:70px" value="${c.routeCount}">
    <span>每路线结局数</span><input id="g-ec" type="number" min="1" max="6" style="width:70px" value="${c.endingCount}"></div>
    <div class="row"><span>主要角色最少</span><input id="g-mc" type="number" min="1" max="20" style="width:70px" value="${c.mainCount}">
    <span>次要 NPC 最少</span><input id="g-nc" type="number" min="0" max="30" style="width:70px" value="${c.npcCount}"></div>
    <p class="muted">这两项会写进第一步提示词，并在检查时统计 AI 实际写了几位。</p>
    <label>续写剧情上下文</label>
    <div class="row"><label class="sw"><input type="radio" name="g-cm" value="raw" ${c.ctxMode !== 'sum' ? 'checked' : ''}> 只发原文</label>
      <span class="muted">最近</span><input id="g-cc" type="number" min="1" max="50" style="width:60px" value="${c.ctxCount}"><span class="muted">条路线</span></div>
    <div class="row"><label class="sw"><input type="radio" name="g-cm" value="sum" ${c.ctxMode === 'sum' ? 'checked' : ''}> 大总结＋缓冲原文</label>
      <label class="sw"><input type="checkbox" id="g-sa" ${c.sumAuto ? 'checked' : ''}> 自动总结</label></div>
    <div class="row"><span class="muted">每</span><input id="g-se" type="number" min="1" max="100" style="width:60px" value="${c.sumEvery}">
      <span class="muted">条总结一次，缓冲保留</span><input id="g-sb" type="number" min="0" max="50" style="width:60px" value="${c.sumBuffer}"><span class="muted">条原文</span></div>
    <p class="muted" style="font-size:12px">例：每 10 条、缓冲 5 条。玩到第 15 条时先总结第 1-10 条，续写只发总结＋第 11-15 条原文；到第 25 条再总结第 11-20 条，以此类推。总结用的提示词、API、思维链在「总结」页设置。关闭自动总结后，到点会提示你去手动总结。</p>
    <div class="row"><span>音量</span><input id="g-vol" type="range" min="0" max="1" step="0.05" value="${STORE.getItem('vol') || 0.6}"></div>
    <div class="row"><button type="button" id="g-save">保存</button><span id="g-msg" class="muted"></span></div>`;
  S('g-vol').oninput = e => { STORE.setItem('vol', e.target.value); bgm().volume = +e.target.value; };
  S('g-save').onclick = () => {
    const st = S('g-stats').value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (st.length < 5) return alert('至少 5 项数值');
    Object.assign(c, {
      pname: S('g-name').value.trim() || '你', stats: st,
      routeCount: +S('g-rc').value || 3, endingCount: +S('g-ec').value || 2,
      mainCount: Math.max(1, +S('g-mc').value || 4), npcCount: Math.max(0, +S('g-nc').value || 5),
      ctxMode: document.querySelector('input[name="g-cm"]:checked')?.value || 'raw',
      ctxCount: Math.max(1, +S('g-cc').value || 3),
      sumAuto: S('g-sa').checked,
      sumEvery: Math.max(1, +S('g-se').value || 10),
      sumBuffer: Math.max(0, +S('g-sb').value || 0)
    });
    save(); renderSide(); S('g-msg').textContent = '已保存'; S('g-msg').className = 'ok';
  };
}

function setData() {
  S('set-body').innerHTML = `<div class="row"><button type="button" id="d-exp">导出全部数据</button>
    <button type="button" id="d-imp">导入全部数据</button></div>
    <div class="row"><button type="button" id="d-rp">重置提示词为默认</button>
    <button type="button" id="d-rg">删除当前游戏存档</button></div>
    <p class="muted">导出文件含 API Key，请勿外传。</p>`;
  S('d-exp').onclick = () => exportJSON(DB, 'xutang-backup.json');
  S('d-imp').onclick = () => importJSON(o => { if (!confirm('覆盖当前全部数据？')) return; DB = o; initDB(); renderSide(); openSettings('data'); });
  S('d-rp').onclick = () => { if (!confirm('全部提示词（各步骤、游戏设计与总结）恢复默认？')) return; for (const s of PROMPT_KEYS) DB.prompts[s] = { presets: structuredClone(DEFAULT_PRESETS[s]), cur: 0, api: DB.prompts[s]?.api ?? -1 }; save(); alert('已重置'); };
  S('d-rg').onclick = () => { if (!confirm('删除存档？不可恢复')) return; DB.game = null; save(); renderSide(); stopMusic(); title(); closeDlg(); };
}

// ============ 标题页 ============
function title() {
  stopMusic();
  S('main').innerHTML = `<div class="center">
    <h2 style="border:0;font-size:28px">AI 文字冒险</h2>
    <p class="muted">设定 → 资料整合 → 路线大纲 → 游戏设计 → 开场 → 续写</p>
    <div class="row" style="justify-content:center">
      <button id="btn-new">开始游戏</button>
      ${DB.game?.cur ? '<button id="btn-cont">继续游戏</button>' : ''}
      ${DB.game ? '<button id="btn-steps">回到创建流程</button>' : ''}
    </div>
    <p class="muted">左上角 ☰ 打开侧边栏</p></div>`;
  S('btn-new').onclick = () => {
    if (DB.game && !confirm('已有进度，重新开始会覆盖。继续？')) return;
    DB.game = { stats: Object.fromEntries(DB.cfg.stats.map(n => [n, 50])) };
    migrateGame(DB.game); save(); renderSide(); step(1);
  };
  if (S('btn-cont')) S('btn-cont').onclick = () => playFrom();
  if (S('btn-steps')) S('btn-steps').onclick = () => step(DB.game.chapters?.length ? 4 : DB.game.design ? 3 : DB.game.s2 ? 'D' : DB.game.s1 ? 2 : 1);
  renderSide();
}

// ============ 提示词编辑器（四步 + 总结共用） ============
const ROLES = ['system', 'user', 'assistant', 'developer'];
// 步骤键：D = 游戏设计（第二步与第三步之间），S = 总结
const keyOf = n => n === 'S' ? 'summary' : n === 'D' ? 'design' : 'step' + n;
// 流程顺序，用于"进入下一步"
const STEP_FLOW = [1, 2, 'D', 3, 4];
const nextStep = n => STEP_FLOW[STEP_FLOW.indexOf(n) + 1];

function step(n) {
  const key = keyOf(n), o = DB.prompts[key], isSum = n === 'S', isDesign = n === 'D';
  const titles = { 1: '第一步 · 资料整合与大纲', 2: '第二步 · 路线与结局大纲', D: '游戏设计 · 颜色 / 数值 / 小游戏', 3: '第三步 · 开场正文', 4: '第四步 · 剧本续写', S: '剧情大总结' };
  S('main').innerHTML = `<h2>${titles[n]}</h2>
    <div class="row">${STEP_FLOW.map(i => `<button type="button" data-go="${i}" ${i === n ? 'disabled' : ''}>${i === 'D' ? '游戏设计' : '第' + i + '步'}</button>`).join('')}
      <button type="button" data-go="S" ${isSum ? 'disabled' : ''}>总结</button>
      <button type="button" data-go="0">标题</button>
      ${DB.game?.chapters?.length ? '<button type="button" data-go="-1">回到游戏</button>' : ''}</div>
    <div id="pbar"></div>
    <p class="muted" id="p-diff"></p>
    ${isSum ? `<div class="entry" id="sum-info"></div>` : ''}
    ${isDesign ? `<div class="entry" id="dz-info"></div>` : ''}
    ${n === 2 ? `<div class="row"><span class="muted">路线数</span><input id="s-rc" type="number" style="width:70px" value="${DB.cfg.routeCount}">
      <span class="muted">结局数/路线</span><input id="s-ec" type="number" style="width:70px" value="${DB.cfg.endingCount}"></div>` : ''}
    ${isDesign ? `<div class="row"><span class="muted">小游戏数量</span><input id="s-gc" type="number" min="0" max="8" style="width:70px" value="${DB.cfg.gameCount}"></div>` : ''}
    ${typeof n === 'number' && n >= 3 ? `<div class="row"><span class="muted">路线</span><input id="s-route" style="width:160px" value="${esc(DB.game?.route || '')}" placeholder="R1">
      <span class="muted">节点</span><input id="s-node" style="width:120px" value="${esc(DB.game?.node || '')}" placeholder="R1-N1">
      <button type="button" id="s-pick">从大纲选节点</button></div>
      <p class="muted" id="s-hint"></p>` : ''}
    <div id="entries"></div>
    <div class="entry" id="cot-box"></div>
    <div class="row"><span class="muted">本步 API</span><select id="s-api"></select>
      <span class="muted" id="s-api-msg"></span></div>
    <div class="row"><button type="button" id="e-add">+ 新增提示词</button>
      <button type="button" id="e-prev">预览（替换变量）</button>
      <button type="button" id="e-vars">变量表</button>
      <button type="button" id="e-exp">导出预设</button>
      <button type="button" id="e-imp">导入预设</button></div>
    <div class="row"><button type="button" id="e-run">发送给 AI</button>
      <span id="e-msg" class="muted"></span></div>
    <div id="out"></div>`;
  S('main').querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    const v = b.dataset.go;
    if (v === 'S' || v === 'D') return step(v);
    const t = +v;
    t > 0 ? step(t) : t < 0 ? playFrom() : title();
  });
  const bar = presetBar(o, () => step(n), '提示词预设');
  // 另存为新预设：先比对默认，没有区别就不必新建
  const sv = document.createElement('button'); sv.type = 'button'; sv.textContent = '另存为新预设';
  sv.onclick = () => {
    const cur = o.presets[o.cur], diff = presetDiff(key, cur);
    if (!diff.length && !confirm('当前提示词与默认完全相同（含分段开关与思维链），仍要另存？')) return;
    const dup = o.presets.find((p, i) => i !== o.cur && presetSig(p) === presetSig(cur));
    if (dup && !confirm(`已有内容完全相同的预设「${dup.name}」，仍要另存？`)) return;
    const name = prompt('新预设名称', cur.name + ' 副本'); if (!name) return;
    o.presets.push({ ...structuredClone(cur), name }); o.cur = o.presets.length - 1; save(); step(n);
  };
  bar.append(sv);
  S('pbar').append(bar);
  const diff = presetDiff(key, o.presets[o.cur]);
  S('p-diff').innerHTML = diff.length
    ? `与默认相比有 ${diff.length} 处不同：${diff.slice(0, 6).map(esc).join('；')}${diff.length > 6 ? '…' : ''}`
    : '与默认提示词一致。';
  if (isSum) {
    const g = DB.game || {}, r = sumRange(g), c = DB.cfg, vs = validSums(g);
    S('sum-info').innerHTML = `<div>本页有效总结 ${vs.length} 次（全部存档 ${(g.sums || []).length} 次），已覆盖到第 ${summedCount(g)} 条。本页共 ${histChapters(g).length} 条路线。</div>
      <div>本次将总结 <b>第 ${r.from + 1}-${r.to} 条</b>${r.to <= r.from ? '（没有可总结的新内容）' : ''}，之后保留最新 ${c.sumBuffer} 条原文作为缓冲。</div>
      <div class="muted">续写模式：${c.ctxMode === 'sum' ? `总结＋缓冲（${c.sumAuto ? '自动' : '手动'}，每 ${c.sumEvery} 条）` : `仅发送最近 ${c.ctxCount} 条原文`}，可在设置里修改。</div>`;
  }
  if (isDesign) {
    const g = DB.game || {}, d = g.design;
    S('s-gc').onchange = e => { DB.cfg.gameCount = Math.max(0, +e.target.value || 0); save(); };
    S('dz-info').innerHTML = d
      ? `<div>已登记：角色颜色 <b>${Object.keys(d.colors || {}).length}</b> 个、数值规则 <b>${Object.values(d.statRules || {}).flat().length}</b> 条、小游戏 <b>${(d.games || []).length}</b> 个。</div>
         <div class="muted">颜色与规则会自动发给第三、四步；小游戏只发标记与说明，代码留在本地。可在「设置 → 小游戏」里试玩。</div>`
      : `<div class="muted">这一步给每个角色定说话颜色、把数值划成有反应的区间、并生成可玩的小游戏。产出会存进存档，供第三、四步引用。</div>`;
  }
  if (n === 2) { S('s-rc').onchange = e => { DB.cfg.routeCount = +e.target.value; save(); }; S('s-ec').onchange = e => { DB.cfg.endingCount = +e.target.value; save(); }; }
  if (n >= 3) {
    const g = DB.game || {};
    S('s-route').oninput = e => { g.route = e.target.value; save(); renderSide(); };
    S('s-node').oninput = e => { g.node = e.target.value; save(); renderSide(); };
    S('s-pick').onclick = () => {
      const nodes = g.nodes || [];
      if (!nodes.length) return alert('第二步还没有解析到节点索引');
      const seen = new Set(g.visited || []);
      dialog(nodes.map(x => `<div><span class="link" data-n="${esc(x.id)}">${esc(x.id)}</span>
        <span class="muted">${esc(x.route)} / ${esc(x.act)} / 前置 ${esc(x.prev)}${seen.has(x.id) ? ' · 已访问' : ''}</span></div>`).join(''), '选择节点')
        .querySelectorAll('[data-n]').forEach(el => el.onclick = () => {
          const nd = nodes.find(x => x.id === el.dataset.n);
          g.node = nd.id; g.route = nd.route; save(); closeDlg(); step(n);
        });
    };
    const nxt = nextUnvisited(g, g.node);
    const kids = nextsOf(g, g.node).filter(n => !(g.visited || []).includes(n.id));
    S('s-hint').innerHTML = (g.visited || []).includes(g.node)
      ? `<span class="err">当前节点 ${esc(g.node)} 已访问过，继续生成可能造成剧情循环。建议改为 ${esc(kids.map(k => k.id).join(' / ') || 'END')}。</span>`
      : nxt ? `大纲中下一个未访问节点：<span class="link" id="s-use">${esc(nxt.id)}</span>`
      : kids.length ? `${esc(g.node)} 之后有 ${kids.length} 个去向：${esc(kids.map(k => k.id).join('、'))}，由选择决定。` : '大纲节点已全部访问。';
    if (S('s-use')) S('s-use').onclick = () => { g.node = nxt.id; g.route = nxt.route; save(); step(n); };
  }

  const pre = o.presets[o.cur];
  pre.entries ??= [];
  const draw = () => {
    const v = buildVars();
    S('entries').innerHTML = pre.entries.map((e, i) => `<div class="entry ${e.on === false ? 'off' : ''}">
      <div class="row"><label class="sw"><input type="checkbox" data-t="${i}" ${e.on === false ? '' : 'checked'}> ${e.on === false ? '已关闭，不发送' : '发送'}</label>
        <select data-r="${i}">${ROLES.map(r => `<option ${r === e.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <button type="button" data-u="${i}">↑</button><button type="button" data-d="${i}">↓</button>
        <button type="button" data-del="${i}">删除</button>
        <span class="muted">#${i + 1} · 约 ${estTokens(fillVars(e.content, v))} tokens</span></div>
      <textarea data-c="${i}">${esc(e.content)}</textarea></div>`).join('') || '<p class="muted">还没有提示词，点下面新增。</p>';
    const q = (a, fn) => S('entries').querySelectorAll('[data-' + a + ']').forEach(el => fn(el, +el.dataset[a]));
    q('r', (el, i) => el.onchange = () => { pre.entries[i].role = el.value; save(); });
    q('c', (el, i) => el.oninput = () => { pre.entries[i].content = el.value; save(); });
    q('u', (el, i) => el.onclick = () => { if (i) { [pre.entries[i - 1], pre.entries[i]] = [pre.entries[i], pre.entries[i - 1]]; save(); draw(); } });
    q('d', (el, i) => el.onclick = () => { if (i < pre.entries.length - 1) { [pre.entries[i + 1], pre.entries[i]] = [pre.entries[i], pre.entries[i + 1]]; save(); draw(); } });
    q('t', (el, i) => el.onchange = () => { pre.entries[i].on = el.checked; save(); draw(); });
    q('del', (el, i) => el.onclick = () => { if (confirm('删除第 ' + (i + 1) + ' 段？')) { pre.entries.splice(i, 1); save(); draw(); } });
  };
  draw();

  // 思维链设置：总开关与预填充开关分开，预填充不被所有模型支持
  const drawCot = () => {
    const c = pre.cot ??= structuredClone(COT[key] || { on: false, prefill: false, start: '<思考>', end: '</思考>', guide: '' });
    S('cot-box').className = 'entry' + (c.on ? '' : ' off');
    S('cot-box').innerHTML = `<div class="row"><b>思维链 CoT</b>
        <label class="sw"><input type="checkbox" id="c-on" ${c.on ? 'checked' : ''}> 启用</label>
        <label class="sw"><input type="checkbox" id="c-pre" ${c.prefill ? 'checked' : ''} ${c.on ? '' : 'disabled'}> 预填开始标签</label>
        <span class="muted">约 ${c.on ? estTokens(c.guide) + (c.prefill ? estTokens(c.start) : 0) : 0} tokens</span></div>
      <p class="muted" style="font-size:12px">预填充把开始标签作为 assistant 消息发出，强制模型先写思维链。若接口报错（部分模型不允许以 assistant 结尾），关掉预填充，指引仍会发送。</p>
      <div class="row"><span class="muted">开始</span><input id="c-s" style="width:130px" value="${esc(c.start)}">
        <span class="muted">结束</span><input id="c-e" style="width:130px" value="${esc(c.end)}">
        <button type="button" id="c-rst">恢复默认</button></div>
      <textarea id="c-g" placeholder="思维链指引，可用 {{cot_start}} {{cot_end}} 与所有变量">${esc(c.guide)}</textarea>`;
    S('c-on').onchange = () => { c.on = S('c-on').checked; save(); drawCot(); };
    S('c-pre').onchange = () => { c.prefill = S('c-pre').checked; save(); drawCot(); };
    S('c-s').oninput = () => { c.start = S('c-s').value; save(); };
    S('c-e').oninput = () => { c.end = S('c-e').value; save(); };
    S('c-g').oninput = () => { c.guide = S('c-g').value; save(); };
    S('c-rst').onclick = () => { if (COT[key] && confirm('恢复本步默认思维链？')) { pre.cot = structuredClone(COT[key]); save(); drawCot(); } };
  };
  drawCot();

  // 本步 API：-1 跟随主设置
  const sel = S('s-api');
  sel.innerHTML = `<option value="-1">跟随主设置（${esc(DB.apis[DB.apiCur]?.name || '未配置')}）</option>` +
    DB.apis.map((a, i) => `<option value="${i}">${esc(a.name || 'API ' + (i + 1))}${a.model ? ' · ' + esc(a.model) : ''}</option>`).join('');
  sel.value = String(o.api >= 0 && DB.apis[o.api] ? o.api : -1);
  const apiMsg = () => { const a = apiOf(key); S('s-api-msg').textContent = a?.base ? `实际使用：${a.name || a.model || '未命名'}` : '未配置 API'; };
  apiMsg();
  sel.onchange = () => { o.api = +sel.value; save(); apiMsg(); };

  S('e-add').onclick = () => { pre.entries.push({ role: 'user', content: '', on: true }); save(); draw(); };
  S('e-vars').onclick = () => {
    const v = buildVars();
    dialog(Object.entries(VAR_DOC).map(([k, d]) => `<div class="entry"><code class="var">{{${k}}}</code> <span class="muted">${esc(d)}</span>
        <div class="muted">当前值：${v[k] ? esc(String(v[k]).slice(0, 120)) : '<span class="err">空</span>'}</div></div>`).join(''), '可用变量');
  };
  S('e-prev').onclick = () => {
    const v = buildVars(), msgs = messagesOf(key, v);
    const act = pre.entries.filter(e => e.on !== false);
    const off = pre.entries.length - act.length;
    const tot = msgs.reduce((s, m) => s + estTokens(m.content), 0);
    const chars = msgs.reduce((s, m) => s + m.content.length, 0);
    // 预览按实际发送的消息列表渲染，含思维链
    dialog(`<p class="muted">实际发送 ${msgs.length} 条 · 约 ${tot} tokens · ${chars} 字${off ? ` · 已关闭 ${off} 段未计入` : ''}
        ${pre.cot?.on ? '<br>思维链已启用' + (pre.cot.prefill ? '（含预填充）' : '（未预填充）') : ''}
        <br>token 为粗略估算：中文按 1 字 1 token，其他按 4 字符 1 token。</p>` +
      msgs.map((m, i) => `<div class="entry"><div class="row"><b class="var">${m.role}</b>
          <span class="muted">#${i + 1} · 约 ${estTokens(m.content)} tokens</span></div>
        <pre>${renderVarPreview(m.content, v)}</pre></div>`).join(''), '完整提示词预览');
  };
  S('e-exp').onclick = () => exportJSON(pre, `prompt-${key}-${pre.name}.json`);
  S('e-imp').onclick = () => importJSON(j => {
    const list = Array.isArray(j) ? j : [j];
    for (const p of list) if (p.entries) o.presets.push(p);
    o.cur = o.presets.length - 1; save(); step(n);
  });
  S('e-run').onclick = () => isSum ? runSummary() : runStep(n);

  // 已有结果则显示（第三/四步显示最近一章；总结页显示最近一次总结）
  const g = DB.game || {};
  if (isSum) { const s = validSums(g).at(-1); if (s) S('out').innerHTML = `<p class="muted">本页最近一次：第${s.no}次，覆盖第1-${s.chain.length}条</p><pre>${esc(s.text)}</pre>`; return; }
  const last = (g.chapters || []).filter(c => c.step === n).slice(-1)[0];
  const had = n === 1 ? g.s1 : n === 2 ? g.s2 : n === 'D' ? g.design?.raw : last?.raw;
  if (had) showResult(n, had);
}

// ============ 剧情大总结 ============
// 每次只总结未被总结过的那一段（sumRange 保证 [summedTo, summedTo+every)）
async function runSummary(auto) {
  const g = DB.game, msg = S('e-msg'), out = S('out');
  if (!g) return alert('没有进行中的游戏');
  const r = sumRange(g);
  if (r.to <= r.from) { const m = '没有可总结的新内容'; msg ? (msg.textContent = m, msg.className = 'muted') : alert(m); return false; }
  if (msg) { msg.textContent = `正在总结第 ${r.from + 1}-${r.to} 条…`; msg.className = 'muted'; }
  if (out) out.innerHTML = '<pre id="stream"></pre>';
  const txt = await callAI(messagesOf('summary', buildVars()), t => { if (S('stream')) S('stream').textContent = t; }, apiOf('summary'));
  const { body, cot } = stripCoT(txt, 'summary');
  if (cot) lastCoT = cot;
  // chain 记下这次总结覆盖的具体章节，换页后自动失效
  g.sums.push({ no: g.sums.length + 1, chain: lineage(g).slice(0, r.to), text: body.trim(), ts: Date.now() });
  save();
  if (msg) { msg.textContent = `第 ${g.sums.length} 次总结完成，已覆盖到第 ${r.to} 条`; msg.className = 'ok'; }
  if (out) out.innerHTML = `<pre>${esc(body)}</pre>`;
  return true;
}

// 续写前的闸门：该总结时先总结。自动模式直接做，手动模式让玩家决定
async function sumGate() {
  if (!sumDue()) return true;
  const g = DB.game, r = sumRange(g);
  if (DB.cfg.sumAuto) {
    // 设置调小后可能一次欠了好几批，逐批补齐（每批只总结未总结的部分）
    for (let k = 0; k < 20 && sumDue(); k++) {
      const rr = sumRange(DB.game);
      const box = S('e-msg') || S('story');
      if (box) { box.textContent = `剧情较长，正在总结第 ${rr.from + 1}-${rr.to} 条，请稍候…`; box.className = 'muted'; }
      try { if (!await runSummary(true)) break; } catch (e) { alert('总结失败：' + e.message + '\n可稍后在「总结」页手动重试。'); return false; }
    }
    return true;
  }
  if (confirm(`剧情已积累 ${histChapters(g).length - summedCount(g)} 条未总结内容。\n建议先总结第 ${r.from + 1}-${r.to} 条再续写。\n现在去总结页？`)) { step('S'); return false; }
  return true;
}

// ============ 执行与审阅 ============
let lastCoT = '';   // 最近一次思维链，仅用于排查，不入存档
async function runStep(n) {
  const msg = S('e-msg'), out = S('out');
  const g = DB.game;
  const key = keyOf(n);
  const num = typeof n === 'number' ? n : 0;   // 'D' 不参与数字比较
  if ((num >= 2 || n === 'D') && !g?.s1) return alert('请先完成并确认第一步');
  if ((num >= 3 || n === 'D') && !g?.s2) return alert('请先完成并确认第二步');
  if (num >= 3 && !g.node) return alert('请填写待写节点 ID（可用"从大纲选节点"）');
  // 开场一律从大纲唯一起点写（旧存档里残留的 R1-N3 之类会让开场写错路线）
  if (num === 3) {
    const st = (g.nodes || []).find(x => x.prev === 'START');
    if (st && g.node !== st.id) {
      if (!confirm(`开场应从大纲起点 ${st.id} 开始，当前节点是 ${g.node}。\n改为从 ${st.id} 开始？（选"取消"则按 ${g.node} 生成）`)) { /* 尊重玩家选择 */ }
      else { g.node = st.id; g.route = st.route; g.visited = []; save(); renderSide(); }
    }
  }
  if (num === 3 && !g.design && !confirm('还没有完成「游戏设计」步骤：角色将没有专属颜色，数值没有阈值规则，也不会出现小游戏。\n仍要直接生成开场？')) return;
  if (num === 4 && !g.chapters.length) return alert('请先在第三步生成开场');
  if (num === 4 && !await sumGate()) return;
  if (num >= 3 && (g.visited || []).includes(g.node)) {
    const ks = nextsOf(g, g.node).filter(n => !(g.visited || []).includes(n.id)).map(n => n.id);
    if (!confirm(`节点 ${g.node} 已访问过，继续生成可能让剧情绕回原地。\n建议改为 ${ks.join(' / ') || 'END'}。\n仍要按当前节点生成？`)) return;
  }
  // 同一节点反复生成也算循环风险
  if (num >= 3) {
    g.genAt[g.node] = (g.genAt[g.node] || 0) + 1;
    if (g.genAt[g.node] > 3 && !confirm(`节点 ${g.node} 已生成 ${g.genAt[g.node] - 1} 次。继续？`)) { g.genAt[g.node]--; return; }
  }
  save();

  msg.textContent = '生成中…'; msg.className = 'muted';
  out.innerHTML = '<pre id="stream"></pre>';
  try {
    const txt = await callAI(messagesOf(key, buildVars()), t => { S('stream').textContent = t; }, apiOf(key));
    const { body, cot, miss } = stripCoT(txt, key);
    msg.textContent = miss ? '完成，但没找到思维链结束标签（已按原样审阅）' : '完成，请审阅';
    msg.className = miss ? 'err' : 'ok';
    if (cot) lastCoT = cot;
    showResult(n, body, true);
  } catch (e) { msg.textContent = e.message; msg.className = 'err'; out.innerHTML = ''; }
}

// 把检查出的问题回注给 AI，让它基于原稿修正，而不是从零重写
async function retryWithErrors(n, badText, issues, extra) {
  const msg = S('e-msg'), out = S('out');
  const key = keyOf(n);
  const base = messagesOf(key, buildVars());
  const fix = `你刚才的输出未通过程序的格式校验。下面是你的原始输出与逐条问题。

# 你的原始输出
${badText}

# 校验发现的问题
${issues.map((x, i) => `${i + 1}. ${x}`).join('\n')}
${extra ? `\n# 我的补充说明\n${extra}\n` : ''}
# 修正要求
1. 在**保留原有内容与情节**的前提下，只修复上述问题，不要重新构思、不要大幅改写已经合格的部分。
2. 重新输出**完整的、修正后的全文**，区块名与顺序严格按最初的要求，不要只给出差异部分。
3. 不要解释你改了什么，不要道歉，不要加任何前后说明，直接给修正后的正文。
4. 再次核对：区块是否齐全、顺序是否正确、每一行标注语法是否合法、清单每行字段是否完整。`;

  msg.textContent = '正在让 AI 修正…'; msg.className = 'muted';
  out.innerHTML = '<pre id="stream"></pre>';
  try {
    const txt = await callAI([...base, { role: 'assistant', content: badText }, { role: 'user', content: fix }],
      t => { S('stream').textContent = t; }, apiOf(key));
    const { body, cot } = stripCoT(txt, key);
    if (cot) lastCoT = cot;
    const left = issuesOf(n, body, DB.game);
    msg.textContent = left.length ? `仍有 ${left.length} 个问题` : '修正完成，检查通过';
    msg.className = left.length ? 'err' : 'ok';
    showResult(n, body, true);
  } catch (e) { msg.textContent = e.message; msg.className = 'err'; out.innerHTML = ''; }
}

// 第一步问题清单：区块缺失 + 角色数量下限
function step1Issues(txt) {
  const p = parseStep1(txt), bad = [];
  const NAMES = { s1_world: '世界观设定', s1_player: '主控档案', s1_chars: '角色档案', s1_relations: '人物关系图', s1_truth: '真相线大纲', s1_theme: '母题与基调', s1_notes: '改写说明' };
  for (const k in NAMES) if (!p[k]) bad.push(`缺少区块「${NAMES[k]}」或其内容为空`);
  if (p.s1_chars) {
    const cards = p.s1_chars.split(/^###\s+/m).slice(1);
    // 定位行写法很多（主要角色/主角/核心角色；次要NPC/次要 NPC/NPC/配角），都要算进去
    const role = c => (c.match(/定位[^\n]*/) || [''])[0];
    const main = cards.filter(c => /主要|核心|主角/.test(role(c))).length;
    const npc = cards.filter(c => /次要|NPC|配角/i.test(role(c)) && !/主要|核心|主角/.test(role(c))).length;
    if (!cards.length) bad.push('角色档案里没有用 ### 角色名 分条，无法统计角色数量');
    else {
      if (main < DB.cfg.mainCount) bad.push(`主要角色只有 ${main} 位，要求至少 ${DB.cfg.mainCount} 位（请补写 ${DB.cfg.mainCount - main} 位，每位用 ### 角色名 开头、定位写"主要角色"）`);
      if (npc < DB.cfg.npcCount) bad.push(`次要 NPC 只有 ${npc} 位，要求至少 ${DB.cfg.npcCount} 位（请补写 ${DB.cfg.npcCount - npc} 位，定位写"次要NPC"）`);
    }
  }
  if (p.s1_relations && !/--\[.+?\]-->/.test(p.s1_relations)) bad.push('人物关系图没有使用 A --[关系]--> B 的箭头格式');
  if (p.s1_truth) for (const a of ['序幕', '第一幕', '第二幕', '第三幕', '终局'])
    if (!p.s1_truth.includes(a)) bad.push(`真相线大纲缺少【${a}】`);
  return bad;
}

// 第二步问题清单
function step2Issues(txt) {
  const p = parseStep2(txt), bad = [];
  if (!p.s2_overview) bad.push('缺少区块「路线总览」');
  if (!p.s2_detail) bad.push('缺少区块「路线详述」');
  if (!p.s2_common) bad.push('缺少区块「共通线」（所有路线共用的序幕）');
  // 数值规约通常在最后，缺失多半是输出被截断（max_tokens 不够）
  if (!p.s2_statspec) bad.push('缺少区块「数值规约」。它是最后一个区块，缺失通常是输出被截断：可以在设置 → API 里调大 max_tokens，或点"把问题发回给 AI 修正"让它补上');
  // 伏笔混进节点索引：解析时已经丢弃，但要提醒 AI 放回正确的区块
  const rawIdx = pick(splitSections(txt), '节点索引').split('\n').filter(l => l.includes('|') && !/^[|\-: ]+$/.test(l.trim()));
  const junk = rawIdx.filter(l => !/^[-*`|\s]*(START|[A-Za-z]+\d*(-[A-Za-z0-9]+)+)\s*\|/i.test(l) && !/节点ID/.test(l));
  if (junk.length) bad.push(`节点索引里混进了 ${junk.length} 行不是节点的内容（例如"${junk[0].replace(/[|`]/g, ' ').trim().slice(0, 20)}…"），看起来是伏笔清单。请把它们移到「## 伏笔清单」区块，节点索引里只保留节点行`);
  if (!p.s2_index.length) bad.push('缺少区块「节点索引」，或没有一行符合 `节点ID | 路线 | 幕 | 前置 | 选项数` 格式');
  else {
    const ids = p.s2_index.map(x => x.id);
    const fk = forkNode(p.s2_index);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) bad.push(`节点索引里有重复ID：${[...new Set(dup)].join('、')}`);
    for (const nd of p.s2_index) {
      if (!nd.route || !nd.act || !nd.prev) bad.push(`节点 ${nd.id} 的字段不全（路线/幕/前置 有空缺）`);
      if (nd.prev !== 'START' && !ids.includes(nd.prev)) bad.push(`节点 ${nd.id} 的前置 ${nd.prev} 不在索引中`);
      // 选项数非终局节点必须 ≥2，否则第三/四步没法写出合法的选择点
      const end = /终局|END/i.test(nd.act || '');
      if (!end && nd.n < 2) bad.push(`节点 ${nd.id} 的选项数是 ${nd.n || '空'}，非终局节点必须至少 2 个`);
      if (nd.n > 4 && nd !== fk) bad.push(`节点 ${nd.id} 的选项数是 ${nd.n}，上限为 4 个`);
    }
    // 共通线：全表只有一个起点，且它在共通线上；各路线从分岔节点进入
    const starts = p.s2_index.filter(x => x.prev === 'START');
    const common = p.s2_index.filter(x => /^C$/i.test(x.route));
    if (!common.length) bad.push('没有共通线：请用路线编号 C 写出所有路线共用的序幕（C-N1、C-N2…），最后一个是分岔节点');
    if (starts.length !== 1) bad.push(`有 ${starts.length} 个节点的前置是 START（${starts.map(x => x.id).join('、')}），只能有一个，就是共通线的第一个节点 C-N1。各路线的起点前置应写分岔节点`);
    else if (common.length && !/^C$/i.test(starts[0].route)) bad.push(`唯一接 START 的节点 ${starts[0].id} 不在共通线 C 上`);
    if (common.length && !fk) bad.push('找不到分岔节点：各路线第一个节点的前置应当是共通线的最后一个节点');
    if (fk && fk.n !== DB.cfg.routeCount) bad.push(`分岔节点 ${fk.id} 的选项数是 ${fk.n}，应等于路线数 ${DB.cfg.routeCount}`);
    const roads = [...new Set(p.s2_index.filter(x => !/^C$/i.test(x.route)).map(x => x.route))];
    for (const r of roads) {
      const first = p.s2_index.filter(x => x.route === r && !p.s2_index.some(y => y.id === x.prev && y.route === r));
      if (fk && !first.some(x => x.prev === fk.id)) bad.push(`路线 ${r} 的第一个节点没有接在分岔节点 ${fk.id} 之后`);
      if (p.s2_index.some(x => x.route === r && /序幕/.test(x.act))) bad.push(`路线 ${r} 里出现了"序幕"节点。序幕属于共通线，路线从第一幕开始`);
    }
    // 全部都是 2 个选项，通常是 AI 偷懒
    const mid = p.s2_index.filter(x => !/终局|END/i.test(x.act) && x !== fk);
    if (mid.length >= 6 && mid.every(x => x.n === 2)) bad.push('除分岔节点外所有节点的选项数都是 2。请按情境调整，有多个合理去向的节点改为 3 或 4');
    const routes = new Set(roads);
    if (routes.size < DB.cfg.routeCount) bad.push(`节点索引只覆盖 ${routes.size} 条路线，要求 ${DB.cfg.routeCount} 条（共通线 C 不计入）`);
  }
  const detailRoutes = (p.s2_detail.match(/^###\s+/gm) || []).length;
  if (detailRoutes && detailRoutes < DB.cfg.routeCount) bad.push(`路线详述只写了 ${detailRoutes} 条路线，要求 ${DB.cfg.routeCount} 条`);
  return bad;
}

// 正文类结果的质量检查
function storyIssues(st, g) {
  const bad = [...(st.warn || [])];
  const main = st.blocks.main || [];
  if (!main.length) bad.push('未解析到正文段落');
  if (!main.some(s => s.t === 'p' || s.t === 'say')) bad.push('正文里没有任何旁白或台词');
  const ch = main.find(s => s.t === 'choice');
  const isEnd = /终局|END/i.test((g.nodes || []).find(x => x.id === g.node)?.act || '');
  if (!ch && !isEnd) bad.push('缺少 [choice] 选择点');
  if (ch) {
    if (ch.opts.length < 2) bad.push('选择点的选项少于 2 个');
    for (const o of ch.opts) if (!st.blocks[o.id]) bad.push(`选项 ${o.id} 缺少对应的 [branch:${o.id}] 分支正文`);
    const extra = Object.keys(st.blocks).filter(k => k !== 'main' && !ch.opts.some(o => o.id === k));
    if (extra.length) bad.push(`分支 ${extra.join('、')} 没有对应的选项`);
  }
  const names = new Set(DB.cfg.stats);
  const all = [];
  for (const k in st.blocks) for (const s of st.blocks[k]) {
    all.push(s);
    if (s.t === 'minor') for (const r of Object.values(s.react)) all.push(...r);
  }
  for (const s of all)
    if (s.t === 'stat' && !names.has(s.name)) bad.push(`[stat:${s.name}] 不是已定义的数值项（可用：${DB.cfg.stats.join('、')}）`);
  // 大纲节点规定的选项数必须原样出现（1 个选项的大纲本身就是错的，不拿来卡正文）
  const nd = (g.nodes || []).find(x => x.id === g.node);
  const ndIsEnd = /终局|END/i.test(nd?.act || '');
  if (ch && nd?.n >= 2 && ch.opts.length !== nd.n)
    bad.push(`大纲规定节点 ${nd.id} 有 ${nd.n} 个选项，正文 [choice] 给了 ${ch.opts.length} 个`);
  if (ch && nd && nd.n === 1 && !ndIsEnd)
    bad.push(`大纲把节点 ${nd.id} 的选项数写成了 1，这不合法（选择点至少 2 个）。请回到第二步把该行改为 2 或以上，再生成本章`);
  // 门槛可达性：所有选项加减组合都达不到的门槛就是错误选项
  bad.push(...reachIssues(st, g.stats || {}, DB.cfg.stats));
  for (const k in st.blocks) for (const s of st.blocks[k])
    if (s.t === 'minor' && s.opts.some(o => o.req)) bad.push('互动小选项不允许设置数值门槛');
  // 状态行的角色名必须存在于制作圣经或为主控
  const roster = g.s1parts?.s1_chars || '';
  for (const s of all) if (s.t === 'state' && s.who !== PLAYER_KEY && roster && !roster.includes(s.who))
    bad.push(`[state:${s.who}] 的角色不在角色档案中`);
  // [say:称呼（本名）]：括号里的本名必须在角色档案里，否则颜色匹配不上
  for (const s of all) if (s.t === 'say' && s.real && s.real !== PLAYER_KEY && s.real !== s.who && roster && !roster.includes(s.real))
    bad.push(`[say:${s.who}（${s.real}）] 括号里的本名「${s.real}」不在角色档案中`);
  // 小游戏标记必须来自设计清单，且一次最多一个
  const tags = new Set((g.design?.games || []).map(x => x.tag));
  const usedGames = all.filter(s => s.t === 'game');
  for (const s of usedGames) if (!tags.has(s.tag)) bad.push(`[game:${s.tag}] 不在可用小游戏清单中${tags.size ? '（可用：' + [...tags].join('、') + '）' : '（本作没有小游戏）'}`);
  for (const k in st.blocks) {
    const c = st.blocks[k].filter(s => s.t === 'game').length;
    if (c > 1) bad.push(`${k === 'main' ? '主线' : '分支 ' + k} 里插了 ${c} 个小游戏，每块最多 1 个`);
  }
  // 旁白里用主控名字代替"你"
  const pn = DB.cfg.pname;
  if (pn && pn !== '你' && all.some(s => s.t === 'p' && s.v.includes(pn)))
    bad.push(`旁白里出现了主控的名字"${pn}"，旁白中主控应一律称"你"（他人台词里叫名字是可以的）`);
  // 小选项数量节奏
  const minors = main.filter(s => s.t === 'minor').length;
  if (minors > 2) bad.push(`主线里放了 ${minors} 个互动小选项，上限为 2 个`);
  for (const k in st.blocks) if (k !== 'main' && st.blocks[k].filter(s => s.t === 'minor').length > 1) bad.push(`分支 ${k} 里的互动小选项超过 1 个`);
  // 第四面墙：只抓确实不该出现在故事世界里的词
  const text = all.filter(s => s.v).map(s => s.v).join('\n');
  const WALL = ['这是游戏', '玩家', '读者', '剧情需要', '本章', '下一章', '存档', '点击'];
  for (const w of WALL) if (text.includes(w)) bad.push(`正文出现"${w}"，疑似打破第四面墙`);
  const OMNI = /(他|她|你)(并)?(不知道|没想到|没有意识到)[^。]*(将|会|竟)|殊不知|此时此刻[^。]*另一边|与此同时[^。]*(远处|另一)/;
  const om = text.match(OMNI);
  if (om) bad.push(`疑似全知旁白："${om[0].slice(0, 24)}…"（旁白只能写主控能感知的内容）`);
  if (!Object.keys(st.sum || {}).length) bad.push('缺少可解析的「节点摘要」，每行应为 `选项ID | 事实 | 新节点ID | 数值变化 | 推进类型`');
  if (ch) for (const o of ch.opts) if (!st.sum[o.id]) bad.push(`节点摘要里缺少选项 ${o.id} 的那一行`);
  for (const [id, s] of Object.entries(st.sum || {})) {
    if (!s.next) { bad.push(`摘要 ${id} 未给出新节点ID`); continue; }
    if (!(g.nodes || []).length) continue;
    // 与游玩时用同一套识别规则：这里报的问题，就是玩家点选项时会弹窗确认的情况
    const cands = nextsOf(g, g.node).filter(n => !(g.visited || []).includes(n.id));
    const legal = cands.map(c => c.id).join('、') || 'END';
    // 结局判定节点：认得出结局即可；条件推算不一致只作提醒（AI 可能考虑了剧情因素），不拦截
    if (isEndingJudge(g, g.node)) {
      const eid = readEndingRef(g, s.next, cands);
      if (!eid) { bad.push(`摘要 ${id} 的结局"${s.next}"认不出，请写结局编号：${legal}`); continue; }
      const after = { ...(g.stats || {}) };
      for (const [k, v] of Object.entries(parseDelta(s.delta))) if (k in after) after[k] = Math.max(0, Math.min(100, after[k] + v));
      const pred = predictEnding(g, g.node, after);
      if (pred && pred !== eid) (st.notes ??= []).push(`选项 ${id}：按结局条件推算（选后数值 ${JSON.stringify(after)}）应是 ${pred}，AI 写了 ${eid}。若是剧情需要可忽略。`);
      continue;
    }
    const ref = readNodeRef(g, s.next, cands);
    if (ref?.end) { if (!isEndNode(g) && cands.length) bad.push(`摘要 ${id} 写了 END，但 ${g.node} 不是终局，合法去向：${legal}`); }
    else if (!ref) bad.push(`摘要 ${id} 的新节点"${s.next}"认不出，请只写节点ID，合法去向：${legal}`);
    else if ((g.visited || []).includes(ref.id)) bad.push(`摘要 ${id} 指向已访问节点 ${ref.id}（会造成循环），合法去向：${legal}`);
    else if (!cands.some(c => c.id === ref.id)) bad.push(`摘要 ${id} 指向 ${ref.id}，它不是 ${g.node} 的下一步（会跳过剧情），合法去向：${legal}`);
  }
  // 分岔节点：不同选项不能都去同一条路线
  const fk = forkNode(g.nodes);
  if (fk && fk.id === g.node && ch) {
    const outs = ch.opts.map(o => readNodeRef(g, st.sum?.[o.id]?.next, nextsOf(g, g.node))?.id).filter(Boolean);
    const dup = outs.filter((x, i) => outs.indexOf(x) !== i);
    if (dup.length) bad.push(`分岔节点 ${g.node} 有多个选项都通往 ${[...new Set(dup)].join('、')}，每个选项应通往不同的路线`);
  }
  // 有去向表的节点：AI 写的去向要和大纲/玩家指定的一致（结局判定节点不适用）
  const fmap = isEndingJudge(g, g.node) ? [] : (forkMapOf(g)[g.node] || []);
  if (fmap.length && ch) ch.opts.forEach((o, i) => {
    const pk = pickEntry(fmap, o.text, i), want = pk?.e?.to;
    const got = readNodeRef(g, st.sum?.[o.id]?.next, nextsOf(g, g.node))?.id;
    if (want && got && want !== got) bad.push(`选项 ${o.id}「${o.text.slice(0, 20)}」在${pk.e.manual ? '你的指定' : '大纲'}里通往 ${want}，摘要却写了 ${got}`);
  });
  const prev = (g.shown || []).join('\n');
  if (prev) {
    const sim = similarity(prev, segsText(main));
    if (sim > 0.55) bad.push(`与上一段正文相似度 ${(sim * 100) | 0}%，疑似重复推进`);
  }
  return [...new Set(bad)];
}

// 游戏设计步骤的问题清单：三张表都要能被解析出来
function designIssues(txt) {
  const d = parseDesign(txt), bad = [], s = splitSections(txt);
  if (!pick(s, '角色颜色表', '角色说话颜色')) bad.push('缺少区块「角色颜色表」');
  if (!pick(s, '数值阈值设计', '数值阈值')) bad.push('缺少区块「数值阈值设计」');
  if (!pick(s, '小游戏')) bad.push('缺少区块「小游戏」');

  const names = Object.keys(d.colors);
  if (!names.length) bad.push('角色颜色表里没有解析到任何一行，每行应为 `角色名 | #RRGGBB | 理由`');
  if (d.colors[PLAYER_KEY]) bad.push('不要给主控分配颜色，主控颜色由玩家在设置里选');
  // 颜色要在深色背景上看得清
  const lum = h => { const v = h.replace('#', ''); const x = v.length === 3 ? v.split('').map(c => c + c).join('') : v; const [r, gg, b] = [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); return 0.299 * r + 0.587 * gg + 0.114 * b; };
  for (const [n, c] of Object.entries(d.colors)) if (lum(c.color) < 90) bad.push(`${n} 的颜色 ${c.color} 在深色背景上太暗，请换明度更高的颜色`);
  // 颜色重复
  const seen = {};
  for (const [n, c] of Object.entries(d.colors)) {
    const k = c.color.toLowerCase();
    if (seen[k]) bad.push(`${seen[k]} 与 ${n} 用了同一个颜色 ${c.color}`); else seen[k] = n;
  }
  // 角色档案里的人是否都分到了颜色
  const roster = (DB.game?.s1parts?.s1_chars || '').split(/^###\s+/m).slice(1)
    .map(c => c.split('\n')[0].trim()).filter(Boolean);
  const missed = roster.filter(r => !names.some(n => r.includes(n) || n.includes(r)));
  if (roster.length && missed.length) bad.push(`角色档案里这些人没有分配颜色：${missed.join('、')}`);

  // 数值阈值
  for (const st of DB.cfg.stats) {
    const rs = d.statRules[st];
    if (!rs?.length) { bad.push(`数值「${st}」没有任何阈值区间`); continue; }
    if (rs.length < 3) bad.push(`数值「${st}」只划了 ${rs.length} 个区间，至少要 3 个`);
    const sorted = [...rs].sort((a, b) => a.lo - b.lo);
    if (sorted[0].lo > 0) bad.push(`数值「${st}」的区间没有从 0 开始`);
    if (sorted.at(-1).hi < 100) bad.push(`数值「${st}」的区间没有覆盖到 100`);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].lo <= sorted[i - 1].hi) bad.push(`数值「${st}」的区间 ${sorted[i - 1].range} 与 ${sorted[i].range} 重叠`);
    for (const r of rs) if (!r.effect) bad.push(`数值「${st}」的区间 ${r.range} 没有写反应`);
  }
  for (const k of Object.keys(d.statRules)) if (!DB.cfg.stats.includes(k)) bad.push(`数值阈值里的「${k}」不是已定义的数值项（可用：${DB.cfg.stats.join('、')}）`);

  // 小游戏
  const want = DB.cfg.gameCount;
  if (d.games.length < want) bad.push(`只解析到 ${d.games.length} 个小游戏，要求 ${want} 个。每个需要 \`### 游戏名\`、\`[game:标记]\` 和一个 \`\`\`html 代码块`);
  const tags = {};
  for (const gm of d.games) {
    if (tags[gm.tag]) bad.push(`小游戏标记 ${gm.tag} 重复`); else tags[gm.tag] = 1;
    if (!/game-result/.test(gm.code)) bad.push(`小游戏「${gm.name}」没有调用 postMessage 上报 game-result，程序无法判定胜负`);
    if (!/postMessage/.test(gm.code)) bad.push(`小游戏「${gm.name}」缺少 parent.postMessage 调用`);
    if (/<\/?(html|head|body)\b/i.test(gm.code)) bad.push(`小游戏「${gm.name}」不要写 <html>/<head>/<body> 外层标签`);
    if (/\b(alert|confirm|prompt)\s*\(/.test(gm.code)) bad.push(`小游戏「${gm.name}」不允许使用 alert / confirm / prompt`);
    if (/(src|href)\s*=\s*["']https?:/i.test(gm.code) || /\bimport\s|\bfetch\s*\(/.test(gm.code)) bad.push(`小游戏「${gm.name}」引用了外部资源或发起了网络请求`);
    if (/localStorage|sessionStorage/.test(gm.code)) bad.push(`小游戏「${gm.name}」不允许读写本地存储`);
    if ((gm.use || '').length < 40) bad.push(`小游戏「${gm.name}」的使用说明太短，后续写作环节只能看到这段说明`);
  }
  return [...new Set(bad)];
}

const issuesOf = (n, txt, g) => n === 1 ? step1Issues(txt) : n === 2 ? step2Issues(txt) : n === 'D' ? designIssues(txt) : storyIssues(parseStory(txt), g);

function showResult(n, txt, fresh) {
  const g = DB.game;
  const parts = n === 2 ? parseStep2(txt) : null;
  const missing = issuesOf(n, txt, g);
  const nx = nextStep(n);
  const nxName = nx === 'D' ? '游戏设计' : nx ? '第' + nx + '步' : '';
  const isStory = n === 3 || n === 4;
  // 提醒（不算错误、不拦截保存）：目前只有结局条件推算不一致
  const notes = [];
  if (isStory) { const st = parseStory(txt); storyIssues(st, g); notes.push(...(st.notes || [])); }
  S('out').innerHTML = `<h2>AI 输出${fresh ? '' : '（已保存）'}</h2>
    ${notes.length ? `<div class="entry" style="border-color:#a88a3a"><p style="color:#d8b860;margin:0">提醒（可直接保存）：</p>
        <ul style="color:#d8b860;margin:0 0 .3em 1.2em">${notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${missing.length ? `<div class="entry"><p class="err">检查未通过，共 ${missing.length} 项：</p>
        <ol class="err" style="margin:0 0 .5em 1.2em">${missing.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
        <div class="row"><button type="button" id="r-fix">把问题发回给 AI 修正</button>
          <button type="button" id="r-fix2">补充说明后修正</button>
          <button type="button" id="r-copy">复制问题清单</button></div></div>`
      : '<p class="ok">检查通过。</p>'}
    ${n === 'D' ? designPreview(parseDesign(txt)) : ''}
    <pre id="res">${esc(txt)}</pre>
    <div class="row"><button type="button" id="r-ok">确认并保存</button>
      <button type="button" id="r-edit">手动编辑</button>
      <button type="button" id="r-recheck">重新检查</button>
      <button type="button" id="r-re">完全重新生成</button>
      ${lastCoT ? '<button type="button" id="r-cot">查看思维链</button>' : ''}
      ${!isStory ? `<button type="button" id="r-next">进入${nxName}</button>` : '<button type="button" id="r-play">保存并游玩</button>'}
    </div>
    ${n === 2 && parts.s2_index.length ? `<p class="muted">解析到 ${parts.s2_index.length} 个节点：${parts.s2_index.map(x => esc(x.id)).join(' · ')}</p>
      ${(() => {
        const fm = parseForkMaps(txt, parts.s2_index);
        const ks = Object.keys(fm);
        if (!forkNode(parts.s2_index)) return '<p class="err">没有识别到分岔节点</p>';
        return ks.map(k => `<div class="entry"><b>程序识别到的选项去向（${esc(k)}）</b>
          ${fm[k].map(e => `<div>选项${e.no}：${esc(e.text.slice(0, 50))} → ${e.to ? `<b>${esc(e.to)}</b>` : '<span class="err">（没认出去向）</span>'}</div>`).join('')}</div>`).join('')
          + '<p class="muted" style="font-size:12px">确认后可在「路线图」里点节点修改、手动指定选项去向。</p>';
      })()}` : ''}`;
  if (n === 'D') bindDesignPreview(parseDesign(txt));
  if (missing.length) {
    S('r-fix').onclick = () => retryWithErrors(n, S('res').textContent, missing);
    S('r-fix2').onclick = () => {
      const extra = prompt('补充说明（会和问题清单一起发给 AI，可留空）', '');
      if (extra === null) return;
      retryWithErrors(n, S('res').textContent, missing, extra.trim());
    };
    S('r-copy').onclick = () => navigator.clipboard?.writeText(missing.join('\n')).then(() => { S('e-msg').textContent = '问题清单已复制'; S('e-msg').className = 'ok'; });
  }
  S('r-recheck').onclick = () => showResult(n, S('res').textContent, fresh);
  if (S('r-cot')) S('r-cot').onclick = () => dialog(`<p class="muted">约 ${estTokens(lastCoT)} tokens，仅供排查，不会写入存档。</p><pre>${esc(lastCoT)}</pre>`, '思维链');
  const commit = () => {
    const t = S('res').textContent;
    if (n === 1) { g.s1 = t; g.s1parts = parseStep1(t); }
    else if (n === 2) {
      g.s2 = t; const p = parseStep2(t);
      // 大纲换了：旧节点、旧的走法、旧的去向确认都作废，重新从唯一起点开始（"一开始就在 R1-N3"的根因）
      const sig = x => (x || []).map(n => `${n.id}|${n.prev}`).join(',');
      const changed = sig(g.nodes) !== sig(p.s2_index);
      g.s2parts = p; g.nodes = p.s2_index;
      // 去向表跟着大纲重建；大纲没变时保留玩家的手动指定
      if (changed || !g.forkMap) g.forkMap = parseForkMaps(t, p.s2_index);
      if (changed || !g.endings) g.endings = parseEndings(t, p.s2_index);
      if ((changed || !g.node || !p.s2_index.some(x => x.id === g.node)) && p.s2_index.length) {
        const st = p.s2_index.find(x => x.prev === 'START') || p.s2_index[0];
        g.node = st.id; g.route = st.route; g.visited = []; g.routeFix = {};
      }
    } else if (n === 'D') {
      // 颜色、阈值、小游戏代码全部入存档；小游戏代码不进提示词，只有标记与说明会发给后续步骤
      g.design = parseDesign(t);
    } else {
      const parsed = parseStory(t);
      // 每次生成都追加为新章节，永久保留可追溯
      g.chapters.push({ id: g.chapters.length + 1, step: n, node: g.node, route: g.route, raw: t, parsed, ts: Date.now(),
        parent: n === 3 ? -1 : (g.chIdx ?? -1),   // 续写挂在当前章之下，构成"页"
        parentChoice: n === 3 ? null : (g.pendingParentChoice ?? null),
        statsAt: { ...g.stats }, charsAt: structuredClone(g.chars) });
      g.chIdx = g.chapters.length - 1;
      g.cur = parsed;
      delete g.pendingParentChoice;
      if (n === 3) { g.path = []; g.shown = []; g.summary = []; g.sums = []; }
      g.visited = visitedOn(g);
    }
    save(); renderSide();
  };
  S('r-ok').onclick = () => {
    if (missing.length && !confirm(`还有 ${missing.length} 项检查未通过，确定按现在的内容保存？`)) return;
    commit(); S('e-msg').textContent = '已保存' + (n === 'D' ? '游戏设计' : '第' + n + '步'); S('e-msg').className = 'ok';
  };
  S('r-edit').onclick = () => { S('res').contentEditable = 'true'; S('res').focus(); S('e-msg').textContent = '可直接编辑，改完点"重新检查"或"确认并保存"'; };
  S('r-re').onclick = () => runStep(n);
  if (S('r-next')) S('r-next').onclick = () => { commit(); step(nx); };
  if (S('r-play')) S('r-play').onclick = () => { commit(); playFrom(); };
}

// ============ 游戏设计产出：预览与试玩 ============
function designPreview(d) {
  const colors = Object.entries(d.colors || {});
  return `<div class="entry"><b>解析结果</b>
    <div>角色颜色 ${colors.length} 个：${colors.map(([n, c]) => `<span style="color:${esc(c.color)}">${esc(n)}</span>`).join('、') || '<span class="err">无</span>'}</div>
    <div>数值规则 ${Object.values(d.statRules || {}).flat().length} 条，覆盖 ${Object.keys(d.statRules || {}).length} 项数值</div>
    <div>小游戏 ${(d.games || []).length} 个：${(d.games || []).map((g, i) => `<span class="link" data-try="${i}">${esc(g.name)}（${esc(g.tag)}）</span>`).join(' · ') || '<span class="err">无</span>'}</div>
    <div class="muted" style="font-size:12px">点小游戏名可以直接试玩。只有"确认并保存"之后才会写入存档。</div></div>`;
}
function bindDesignPreview(d) {
  S('out').querySelectorAll('[data-try]').forEach(el => el.onclick = () => {
    const gm = (d.games || [])[+el.dataset.try];
    if (gm) tryGame(gm);
  });
}
// 小游戏放在 sandbox iframe 里跑：允许脚本，但没有同源权限，拿不到存档与 API Key
function gameFrame(code, onResult) {
  const fr = document.createElement('iframe');
  fr.className = 'gamebox';
  fr.setAttribute('sandbox', 'allow-scripts');
  fr.srcdoc = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;padding:8px;background:#15151c;color:#ddd;font:14px/1.6 system-ui,sans-serif}
      button{min-height:36px;font-size:14px}</style>${code}`;
  const h = e => {
    if (e.source !== fr.contentWindow || e.data?.type !== 'game-result') return;
    window.removeEventListener('message', h);
    onResult({ win: !!e.data.win, detail: String(e.data.detail || '') });
  };
  window.addEventListener('message', h);
  // 调用方负责插入 DOM；返回 iframe 与一个清理函数
  return { fr, off: () => window.removeEventListener('message', h) };
}
function tryGame(gm) {
  const box = dialog(`<p class="muted">${esc(gm.name)} · 标记 <code class="var">[game:${esc(gm.tag)}]</code></p>
    <div id="try-host"></div>
    <p class="muted" id="try-res">结果会显示在这里。</p>
    <details><summary>使用说明（会发给后续写作环节）</summary><pre>${esc(gm.use || '（空）')}</pre></details>
    <details><summary>代码（仅本地保存，不进提示词）</summary><pre>${esc(gm.code)}</pre></details>`, '试玩小游戏');
  const { fr } = gameFrame(gm.code, r => {
    const el = box.querySelector('#try-res');
    if (el) { el.textContent = `上报结果：${r.win ? '胜' : '负'}${r.detail ? ' · ' + r.detail : ''}`; el.className = r.win ? 'ok' : 'err'; }
  });
  box.querySelector('#try-host').append(fr);
}

// ============ 路线预览 ============
// 路线图：按 前置→后继 画树；点节点就地编辑；分岔选项可手动指定去向；每次改动都重新检查
let RP_EDIT = null;   // {old: 原ID（新建为空）, draft: 节点草稿}
function routePreview() {
  const g = DB.game;
  if (!g?.s2parts) return dialog('<p class="muted">还没有第二步大纲。</p>', '路线图');
  const keep = S('dlg').open ? S('dlg').scrollTop : 0;
  const nodes = g.nodes || [], fm = forkMapOf(g), E = endingsOf(g);
  const seen = new Set(g.visited || []), writ = new Set((g.chapters || []).map(c => c.node));
  const bad = routeIssues(g, DB.cfg.routeCount);
  const roots = nodes.filter(n => n.prev === 'START');
  const drawn = new Set();
  const tag = n => `<button type="button" data-ed="${esc(n.id)}" class="nd ${n.id === g.node ? 'now' : seen.has(n.id) ? 'seen' : 'lock'}"
      ${bad[n.id] ? 'style="border-color:#d07a7a;color:#d07a7a"' : ''} aria-label="编辑节点 ${esc(n.id)}，${esc(n.route)} ${esc(n.act)}">${esc(n.id)}${writ.has(n.id) ? '★' : ''}</button>
      <span class="muted" style="font-size:12px">${esc(n.act)} · ${n.n} 个选项</span>`;
  // 有 2 个以上后继的节点：每个选项一个下拉框，指定它通往哪个后继
  const optsUI = n => {
    const kids = nextsOf(g, n.id);
    if (kids.length < 2) return '';
    if (isEndingJudge(g, n.id)) return `<div class="muted" style="margin:4px 0 4px 14px;font-size:12px">结局由 AI 根据数值与剧情判定，不按选项绑定：
      ${kids.map(k => `<div>· ${esc(k.id)}${E[k.id]?.name ? '（' + esc(E[k.id].name) + '）' : ''}：${E[k.id]?.cond ? esc(E[k.id].cond) : '<span class="err">未写条件</span>'}</div>`).join('')}</div>`;
    const m = fm[n.id];
    if (!m?.length) return `<div class="row" style="margin-left:14px"><button type="button" data-mkmap="${esc(n.id)}">设置选项去向</button>
      <span class="muted" style="font-size:12px">大纲里没读到这个节点的"选项 → 去向"</span></div>`;
    return `<div style="margin:4px 0 4px 14px;font-size:13px">${m.map((e, i) => `<div class="row">
        <label for="fm-${esc(n.id)}-${i}" style="display:inline;margin:0;color:#ddd">选项${e.no}${e.text ? '：' + esc(e.text.slice(0, 30)) : ''}</label> →
        <select id="fm-${esc(n.id)}-${i}" data-fm="${esc(n.id)}" data-i="${i}"><option value="">（未指定）</option>
          ${kids.map(k => `<option${k.id === e.to ? ' selected' : ''}>${esc(k.id)}</option>`).join('')}</select>
        ${e.manual ? '<span class="ch-sel" style="font-size:12px">手动</span>' : ''}</div>`).join('')}</div>`;
  };
  const tree = (n, d) => {
    if (drawn.has(n.id) || d > 80) return '';
    drawn.add(n.id);
    const kids = nextsOf(g, n.id);
    const note = bad[n.id] ? `<div class="err" style="font-size:12px">⚠ ${esc(n.id)}：${esc(bad[n.id].join('；'))}</div>` : '';
    const head = `<div>${tag(n)}${kids.length > 1 ? ' <span class="muted">分岔</span>' : ''}</div>` + note + optsUI(n);
    if (kids.length > 1) return head + kids.map(k => `<div style="margin-left:14px;border-left:2px solid #333;padding-left:8px;margin-top:6px">${tree(k, d + 1)}</div>`).join('');
    return head + (kids[0] ? `<div class="muted">↓</div>${tree(kids[0], d + 1)}` : '');
  };
  const treeHtml = roots.map(r => tree(r, 0)).join('<hr>');
  const orphan = nodes.filter(n => !drawn.has(n.id));
  const routes = [...new Set(nodes.map(n => n.route))];
  const nextR = 'R' + (Math.max(0, ...routes.map(r => +(String(r).match(/^R(\d+)$/i)?.[1] || 0))) + 1);

  // 编辑面板
  let edHtml = '';
  if (RP_EDIT) {
    const d = RP_EDIT.draft, old = RP_EDIT.old;
    const acts = ['序幕', '第一幕', '第二幕', '第三幕', '终局'];
    if (d.act && !acts.includes(d.act)) acts.push(d.act);
    const prevs = ['START', ...nodes.map(n => n.id).filter(x => x !== old)];
    edHtml = `<div class="entry" id="rp-ed" style="border-color:#4f8fe6"><b>${old ? '编辑节点 ' + esc(old) : '新增节点'}</b>
      <label for="ed-id">节点ID</label><input id="ed-id" value="${esc(d.id)}" autocomplete="off">
      <label for="ed-route">路线</label><input id="ed-route" list="ed-routes" value="${esc(d.route)}" autocomplete="off">
        <datalist id="ed-routes">${routes.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <label for="ed-act">所属幕</label><select id="ed-act">${acts.map(a => `<option${a === d.act ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select>
      <label for="ed-prev">前置节点</label><select id="ed-prev">${prevs.map(p => {
        const cyc = old && p !== 'START' && makesCycle(nodes, old, p);
        return `<option value="${esc(p)}"${p === d.prev ? ' selected' : ''}${cyc ? ' disabled' : ''}>${esc(p)}${cyc ? '（会形成循环）' : ''}</option>`;
      }).join('')}</select>
      <label for="ed-n">选项数</label><input id="ed-n" type="number" min="0" max="6" value="${+d.n || 0}">
      ${/END/i.test(d.id || '') ? `<label for="ed-ename">结局名</label><input id="ed-ename" value="${esc(E[old]?.name || '')}" autocomplete="off">
      <label for="ed-econd">结局条件</label><input id="ed-econd" value="${esc(E[old]?.cond || '')}" placeholder="如：羁绊≥60且理智≥55，兜底写：未满足条件" autocomplete="off">
      <p class="muted" style="font-size:12px">条件会在写结局判定节点时发给 AI，由 AI 判断进入哪个结局。</p>` : ''}
      <div class="row" style="margin-top:8px"><button type="button" id="ed-save">保存</button>
        ${old ? '<button type="button" id="ed-del">删除节点</button>' : ''}<button type="button" id="ed-cancel">取消</button></div>
      <p id="ed-msg" class="err" role="alert"></p></div>`;
  }

  const body = `
    <p class="muted">点节点可编辑。绿＝已经历，蓝＝当前，灰＝未到；★ 已生成正文；红色＝有问题。</p>
    ${bad['*'] ? `<p class="err">⚠ ${esc(bad['*'].join('；'))}</p>` : ''}
    ${edHtml}
    <div class="entry">${treeHtml || '<span class="err">没有前置为 START 的起点节点</span>'}
      ${orphan.length ? `<div class="err" style="margin-top:8px">未接入树的节点（点击编辑）：${orphan.map(n => tag(n)).join(' ')}</div>` : ''}
      <div class="row" style="margin-top:10px;flex-wrap:wrap">${routes.map(r => `<button type="button" data-add="${esc(r)}">＋ ${esc(r)} 新增节点</button>`).join('')}
        <button type="button" data-add="${esc(nextR)}">＋ 新路线 ${esc(nextR)}</button></div>
      <div class="row"><button type="button" id="rp-reparse">从大纲重新解析选项去向</button>
        <span class="muted" style="font-size:12px">会清掉你手动指定的去向</span></div></div>
    <div class="entry"><b>当前位置</b>
      <div class="row"><label for="rp-node" style="display:inline;margin:0">当前节点</label>
        <select id="rp-node">${nodes.map(n => `<option${n.id === g.node ? ' selected' : ''}>${esc(n.id)}</option>`).join('')}</select>
        <button type="button" id="rp-set">设为当前</button><button type="button" id="rp-reset">回到起点</button></div>
      <p class="muted" style="font-size:12px">只改程序记录的位置，不改已写好的正文。走错路线时用它纠正。</p></div>
    ${Object.keys(g.routeFix || {}).length ? `<div class="entry"><b>你确认过的去向</b>
      ${Object.entries(g.routeFix).map(([k, v]) => `<div class="row"><span>${esc(k.replace('|', ' 选项 '))} → <b>${esc(v)}</b></span>
        <button type="button" data-unfix="${esc(k)}">撤销</button></div>`).join('')}</div>` : ''}
    <details class="entry"><summary><b>批量编辑节点表</b></summary>
      <p class="muted" style="font-size:12px">格式：节点ID | 路线 | 所属幕 | 前置 | 选项数</p>
      <textarea id="rp-idx" aria-label="节点表" style="min-height:200px;width:100%;font-family:monospace;font-size:13px">${esc(nodes.map(n => `${n.id} | ${n.route} | ${n.act} | ${n.prev} | ${n.n}`).join('\n'))}</textarea>
      <div class="row"><button type="button" id="rp-save">保存节点表</button><span id="rp-msg" class="muted"></span></div></details>
    <div class="entry"><b>玩家实际走过的路径</b>
      ${(g.path || []).length ? g.path.map((p, i) => `<div>${i + 1}. <span class="ch-sel">${esc(p.text)}</span>
        <span class="muted">→ ${esc(p.node || '?')}</span></div>`).join('') : '<p class="muted">尚未做出选择。</p>'}</div>
    <div class="entry"><b>当前路线详述</b><pre>${esc(routeOutline(g))}</pre></div>`;

  const box = dialog(body, '路线图');
  S('dlg').scrollTop = keep;
  const q = s => box.querySelector(s);
  const redraw = () => { save(); renderSide(); routePreview(); };
  // 改了节点之后：当前节点若被删/不存在，回到起点并提示
  const fixCur = () => {
    if (g.node && !/^END$/i.test(g.node) && !g.nodes.some(x => x.id === g.node)) {
      const st = g.nodes.find(x => x.prev === 'START') || g.nodes[0];
      if (st) { alert(`当前节点 ${g.node} 已不存在，已改为 ${st.id}。可在「当前位置」里重新选择。`); g.node = st.id; g.route = st.route; }
    }
  };

  box.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => {
    const n = nodes.find(x => x.id === b.dataset.ed);
    RP_EDIT = { old: n.id, draft: { ...n } };
    routePreview(); q('#rp-ed')?.scrollIntoView({ block: 'start' }); S('ed-id')?.focus();
  });
  box.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const r = b.dataset.add;
    const last = nodes.filter(n => n.route === r && !/END/i.test(n.id) && !/终局/.test(n.act)).at(-1)
      || nodes.filter(n => n.route === r).at(-1);
    const fk = forkNode(nodes);
    RP_EDIT = { old: '', draft: { id: suggestId(g, r), route: r, act: last?.act || '第一幕', prev: last?.id || fk?.id || 'START', n: 2 } };
    routePreview(); q('#rp-ed')?.scrollIntoView({ block: 'start' }); S('ed-id')?.focus();
  });
  if (RP_EDIT) {
    const read = () => ({ id: S('ed-id').value, route: S('ed-route').value, act: S('ed-act').value, prev: S('ed-prev').value, n: S('ed-n').value });
    S('ed-save').onclick = () => {
      const v = read(), err = upsertNode(g, RP_EDIT.old, v);
      if (err) { S('ed-msg').textContent = err; return; }
      if (S('ed-econd')) {
        const id = normId(v.id), E2 = (g.endings ??= {});
        const prevE = E2[RP_EDIT.old] || {};
        if (RP_EDIT.old && RP_EDIT.old !== id) delete E2[RP_EDIT.old];
        E2[id] = { ...prevE, name: S('ed-ename').value.trim(), cond: S('ed-econd').value.trim() };
      }
      RP_EDIT = null; fixCur(); redraw();
    };
    S('ed-cancel').onclick = () => { RP_EDIT = null; routePreview(); };
    if (S('ed-del')) S('ed-del').onclick = () => {
      const id = RP_EDIT.old, deps = nodes.filter(x => x.prev === id).map(x => x.id);
      if (!confirm(`删除节点 ${id}？${deps.length ? `\n${deps.join('、')} 的前置会变成"不存在"并标红，需要你再改。` : ''}\n已写好的正文不受影响。`)) return;
      deleteNode(g, id); RP_EDIT = null; fixCur(); redraw();
    };
  }
  box.querySelectorAll('[data-fm]').forEach(s => s.onchange = () => {
    const e = g.forkMap[s.dataset.fm][+s.dataset.i];
    e.to = s.value; e.manual = true; redraw();
  });
  box.querySelectorAll('[data-mkmap]').forEach(b => b.onclick = () => {
    const id = b.dataset.mkmap, n = nodes.find(x => x.id === id), k = nextsOf(g, id).length;
    g.forkMap[id] = Array.from({ length: Math.max(n?.n || 0, k) }, (_, i) => ({ no: i + 1, text: '', to: '', manual: true }));
    redraw();
  });
  q('#rp-reparse').onclick = () => {
    if (!confirm('按第二步大纲原文重新解析所有"选项 → 去向"？你手动指定的会被清掉。')) return;
    g.forkMap = parseForkMaps(g.s2 || '', nodes); g.endings = parseEndings(g.s2 || '', nodes); redraw();
  };
  q('#rp-set').onclick = () => { const nd = nodes.find(x => x.id === q('#rp-node').value); g.node = nd.id; g.route = nd.route; redraw(); };
  q('#rp-reset').onclick = () => {
    const st = roots[0]; if (!st) return;
    if (!confirm(`回到起点 ${st.id}？已访问记录会清空，已写好的章节保留。`)) return;
    g.node = st.id; g.route = st.route; g.visited = []; redraw();
  };
  box.querySelectorAll('[data-unfix]').forEach(b => b.onclick = () => { delete g.routeFix[b.dataset.unfix]; redraw(); });
  q('#rp-save').onclick = () => {
    // 复用第二步的解析器：手动编辑与 AI 输出走同一套规则
    const p = parseStep2('## 节点索引\n' + q('#rp-idx').value);
    if (!p.s2_index.length) { q('#rp-msg').textContent = '没有解析到任何节点，未保存'; q('#rp-msg').className = 'err'; return; }
    g.nodes = p.s2_index; g.s2parts.s2_index = p.s2_index;
    fixCur(); redraw();
  };
}


// 进入某一章：所有"走过的路"都按这一页（parent 链）重建，别的分支不参与
function enterChapter(g, i) {
  const c = g.chapters[i];
  g.chIdx = i; g.cur = c.parsed; g.node = c.node; g.route = c.route;
  if (c.statsAt) g.stats = { ...c.statsAt };
  if (c.charsAt) g.chars = structuredClone(c.charsAt);
  const before = lineage(g).slice(0, -1).map(k => g.chapters[k]);
  g.visited = before.map(x => x.node).filter(Boolean);
  g.path = before.filter(x => x.choice).map(x => ({ ch: x.id, opt: x.choice, text: x.choiceText, node: x.nextNode }));
  g.summary = before.map(x => x.sumLine).filter(Boolean);
  g.lastChoiceText = before.at(-1)?.lastChoiceText || '';
}

// 该章在当前页之后、做了同样选择的子章（已经写过，可直接接着读）
const childOf = (g, i, opt) => g.chapters.findIndex(c => c.parent === i && c.parentChoice === opt);
// 页：每个"叶子章"代表一条完整的路线
function pages(g) {
  const ch = g.chapters || [], hasKid = new Set(ch.map(c => c.parent));
  return ch.map((c, i) => i).filter(i => !hasKid.has(i));
}

// ============ 剧情档案（全部 AI 正文可追溯） ============
function archive(pageArg) {
  const g = DB.game;
  if (typeof pageArg !== 'number') pageArg = undefined;   // 事件对象当参数传进来时忽略
  if (!g?.chapters?.length) return dialog('<p class="muted">还没有生成过剧情。</p>', '剧情档案');
  const pg = pages(g);
  // 默认打开当前所在的那一页
  const curLeaf = pg.find(l => lineage({ chapters: g.chapters, chIdx: l }).includes(g.chIdx));
  let p = pageArg ?? Math.max(0, pg.indexOf(curLeaf ?? pg.at(-1)));
  p = Math.min(Math.max(0, p), pg.length - 1);
  const tmp = { chapters: g.chapters, chIdx: pg[p] };
  const line = lineage(tmp);
  const forkAt = j => { const kids = g.chapters.filter(c => c.parent === line[j - 1]).length; return j > 0 && kids > 1; };
  const body = `<div class="row"><button type="button" id="a-prev" ${p ? '' : 'disabled'}>◀ 上一页</button>
      <b>第 ${p + 1} / ${pg.length} 页</b>
      <button type="button" id="a-next" ${p < pg.length - 1 ? '' : 'disabled'}>下一页 ▶</button>
      <span style="flex:1"></span><button type="button" id="a-exp">导出全部剧情</button></div>
    <p class="muted">每一页是一条完整路线（共 ${line.length} 章）。从某章重读后做出不同选择，就会在那里分出新的一页；相同的选择会沿用已写好的章节。</p>
    ${line.map((ci, j) => { const c = g.chapters[ci]; return `<div class="entry"><div class="row">
      <b>第${j + 1}章</b><span class="muted">${esc(c.route || '?')} / ${esc(c.node || '?')} · ${new Date(c.ts).toLocaleString()}</span>
      ${forkAt(j) ? '<span class="req no">分叉点</span>' : ''}
      ${ci === g.chIdx ? '<span class="ch-sel">当前</span>' : ''}
      <span style="flex:1"></span>
      <button type="button" data-raw="${ci}">看原文</button>
      <button type="button" data-re="${ci}">从此章重读</button></div>
      ${c.choiceText ? `<div class="muted">▸ ${esc(c.choiceText)}</div>` : ''}</div>`; }).join('')}`;
  const root = dialog(body, '剧情档案');
  S('a-prev').onclick = () => archive(p - 1);
  S('a-next').onclick = () => archive(p + 1);
  S('a-exp').onclick = () => exportJSON({ chapters: g.chapters, sums: g.sums }, 'story-archive.json');
  root.querySelectorAll('[data-raw]').forEach(b => b.onclick = () => {
    const c = g.chapters[+b.dataset.raw];
    dialog(`<pre>${esc(c.raw)}</pre>`, `${c.node} 原文`, () => archive(p));
  });
  root.querySelectorAll('[data-re]').forEach(b => b.onclick = () => {
    const i = +b.dataset.re, c = g.chapters[i];
    if (!confirm(`从 ${c.node} 重新读起？数值与角色状态回到该章开始时的样子。\n做出相同选择会沿用已写好的后续；做出不同选择会开启新的一页，原来的页仍保留。`)) return;
    enterChapter(g, i);
    save(); closeDlg(); playFrom();
  });
}

// ============ 游玩：逐段点击 ============
let PLAY = null; // {segs,i}

function playFrom(segs) {
  const g = DB.game, cur = g?.cur;
  if (!cur) return alert('还没有生成正文');
  PLAY = { segs: (segs || cur.blocks.main).slice(), i: 0 };
  if (!segs) {
    g.shown = [];
    // 从章节开头重播时回到该章的快照，否则 [stat:] 会被重复叠加
    const ch = g.chapters?.[g.chIdx];
    if (ch?.statsAt) g.stats = { ...ch.statsAt };
    if (ch?.charsAt) g.chars = structuredClone(ch.charsAt);
    save(); renderSide();
  }
  S('main').innerHTML = `<div id="story"></div><div id="ctl" class="row"></div>`;
  S('ctl').innerHTML = `<button type="button" id="p-menu">标题</button>
    <button type="button" id="p-routes">路线</button>
    <button type="button" id="p-arch">档案</button>`;
  S('p-menu').onclick = title;
  S('p-routes').onclick = routePreview;
  S('p-arch').onclick = archive;
  advance();
}

function segHTML(s) {
  const link = t => esc(t).replace(/\[\[(.+?)\|(.+?)\]\]/g, (m, a, b) => `<span class="link" data-tip="${b}">${a}</span>`);
  // 旁白里“引号”包起来的话（没有专属说话人）统一上色，颜色在设置里选。
  // esc() 会把半角 " 转成实体，所以这里按实体匹配（拆开拼写，避免被编辑器还原成引号）
  const Q = '&' + 'quot;';
  const quoteRe = new RegExp(`(“[^”]*”|「[^」]*」|${Q}.*?${Q})`, 'g');
  const quote = h => h.replace(quoteRe, m => `<span style="color:${esc(DB.cfg.qcolor)}">${m}</span>`);
  if (s.t === 'say') {
    // 只显示括号外的称呼；颜色按括号内的本名匹配
    const c = esc(sayColor(s));
    return `<p class="p say"><span class="who" style="color:${c}">${esc(s.who)}：</span><span style="color:${c}">${link(s.v)}</span></p>`;
  }
  if (s.t === 'think') return `<p class="p" style="color:#9a9ab0"><i>（${link(s.v)}）</i></p>`;
  return `<p class="p">${quote(link(s.v))}</p>`;
}

// 小游戏：渲染 iframe，玩完按结果给出反馈后再继续往下读
function renderGame(s) {
  const st = S('story'), g = DB.game;
  const gm = (g.design?.games || []).find(x => x.tag === s.tag);
  if (!gm) {   // 标记失效（AI 写错或设计被改过）就跳过，不卡住流程
    st.insertAdjacentHTML('beforeend', `<p class="muted" style="font-size:12px">（此处的小游戏 ${esc(s.tag)} 不存在，已跳过）</p>`);
    return advance();
  }
  const wrap = document.createElement('div');
  wrap.className = 'entry game-wrap';
  wrap.innerHTML = `<div class="row"><b>${esc(gm.name)}</b><button type="button" class="g-skip">跳过</button></div>`;
  const done = r => {
    off();
    wrap.querySelector('.g-skip')?.remove();
    const line = r ? `（${gm.name}：${r.win ? '胜' : '负'}${r.detail ? '，' + r.detail : ''}）` : `（跳过了${gm.name}）`;
    wrap.insertAdjacentHTML('beforeend', `<p class="${r ? (r.win ? 'ok' : 'err') : 'muted'}">${esc(line)}</p>`);
    g.shown.push(line);
    if (r) { g.gameLog ??= []; g.gameLog.push({ tag: gm.tag, win: r.win, detail: r.detail, ch: g.chIdx, ts: Date.now() }); }
    save();
    advance();
  };
  const { fr, off } = gameFrame(gm.code, done);
  wrap.querySelector('.g-skip').onclick = () => { if (confirm('跳过这个小游戏？')) done(null); };
  wrap.append(fr);
  st.append(wrap);
  wrap.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

function advance() {
  const st = S('story'), next = S('next-btn');
  if (next) next.remove();
  while (PLAY.i < PLAY.segs.length) {
    const s = PLAY.segs[PLAY.i++];
    if (s.t === 'music') { playMusic(s.v); continue; }
    if (s.t === 'stat') { applyStat(s.name, s.d); continue; }
    if (s.t === 'state') { applyCharState(DB.game, s); save(); renderChars(); continue; }
    if (s.t === 'choice') { renderChoice(s.opts); return; }
    if (s.t === 'minor') { renderMinor(s); return; }
    if (s.t === 'game') { renderGame(s); return; }
    st.insertAdjacentHTML('beforeend', segHTML(s));
    bindLinks(st.lastElementChild);
    DB.game.shown.push((s.who ? s.who + '：' : '') + s.v); save();
    break;
  }
  if (PLAY.i < PLAY.segs.length) {
    st.insertAdjacentHTML('beforeend', `<div class="next" id="next-btn">▼ 继续</div>`);
    S('next-btn').onclick = advance;
  } else if (!S('choices') || S('choices').classList.contains('minor')) endOfChapter();
  st.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

// 一章读完且没有选择点：要么是结局，要么该去第四步续写
function endOfChapter() {
  const g = DB.game, st = S('story');
  // 只有"当前节点是终局节点"或"大纲里真的没有未访问节点了"才算结局，
  // 否则一律按未完待续处理（AI 提前写 END 造成的假结局在此被拦下）
  const nx = nextUnvisited(g, g.node);
  const isEnd = storyOver(g);
  st.insertAdjacentHTML('beforeend', isEnd
    ? `<p class="muted">—— 本结局结束 ——</p>
       <p class="muted" style="font-size:12px">${esc(g.chapters?.[g.chIdx]?.node || g.node)} 在大纲里没有后续节点。若你认为故事还没走完，可以继续续写。</p>
       <div class="row"><button type="button" id="p-arch2">查看剧情档案</button>
         <button type="button" id="p-go4">仍要继续续写</button></div>`
    : `<p class="muted">本章到此结束。接下来由第四步按大纲续写。</p>
       <div class="row"><button type="button" id="p-go4">续写下一章</button>
         <button type="button" id="p-sum">剧情总结</button></div>`);
  if (S('p-sum')) S('p-sum').onclick = () => step('S');
  if (S('p-arch2')) S('p-arch2').onclick = archive;
  if (S('p-go4')) S('p-go4').onclick = () => {
    // 结局后继续：把节点挪到一个还没走过的节点上，否则第四步无处可写
    if (isEnd && nx && !confirm(`将从节点 ${nx.id} 继续续写。继续？`)) return;
    if (isEnd && nx) { g.node = nx.id; g.route = nx.route; save(); renderSide(); }
    step(4);
  };
}

function bindLinks(el) {
  el?.querySelectorAll('.link').forEach(a => a.onclick = () => {
    if (a.dataset.done) return;
    a.dataset.done = '1';
    a.insertAdjacentHTML('afterend', ` <span class="muted">（${esc(a.dataset.tip)}）</span>`);
  });
}

function applyStat(name, d) {
  const g = DB.game;
  const key = DB.cfg.stats.find(s => s === name) || name;
  const before = g.stats[key] ?? 50;
  g.stats[key] = Math.max(0, Math.min(100, before + d));
  save(); renderSide();
  // 数值变化给玩家一个可见反馈
  S('story')?.insertAdjacentHTML('beforeend', `<p class="stat-pop">${esc(key)} ${d > 0 ? '+' : ''}${d}（${g.stats[key]}）</p>`);
}

// 互动小选项：选完插入对应反应，然后接回同一条主线（不改节点、不进摘要）
function renderMinor(s) {
  const st = S('story');
  st.insertAdjacentHTML('beforeend', `<div class="choices minor" id="choices">${s.opts.map(o => optHTML(o, 'data-m', '·')).join('')}</div>`);
  S('choices').querySelectorAll('[data-m]').forEach(el => el.onclick = () => {
    const o = s.opts.find(x => x.id === el.dataset.m);
    S('choices').outerHTML = `<p class="p ch-sel">· ${esc(o?.text || '')}</p>`;
    DB.game.shown.push('（你选择：' + (o?.text || '') + '）');
    PLAY.segs.splice(PLAY.i, 0, ...(s.react[el.dataset.m] || []));
    advance();
  });
  st.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

// 选项：未满足门槛的显示为灰色不可点，并标出差多少
function optHTML(o, attr, mark) {
  const stats = DB.game.stats;
  if (!o.req) return `<div><span class="link" ${attr}="${esc(o.id)}">${mark} ${esc(o.text)}</span></div>`;
  const ok = reqOk(o.req, stats), cur = stats[o.req.stat] ?? 50;
  const tag = `<span class="req ${ok ? 'ok' : 'no'}">［${esc(reqText(o.req))}，当前 ${cur}］</span>`;
  return ok ? `<div><span class="link" ${attr}="${esc(o.id)}">${mark} ${esc(o.text)}</span>${tag}</div>`
    : `<div><span class="opt-lock" aria-disabled="true">${mark} ${esc(o.text)}</span>${tag}</div>`;
}

function renderChoice(opts) {
  const st = S('story');
  st.insertAdjacentHTML('beforeend', `<div class="choices" id="choices">${opts.map(o => optHTML(o, 'data-opt', '▸')).join('')}</div>`);
  S('choices').querySelectorAll('[data-opt]').forEach(el => el.onclick = () => chooseOpt(el.dataset.opt, opts));
  st.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

// 去向确认弹窗：写明 AI 说了什么、大纲建议什么、为什么不确定；玩家选完记住，同一选项不再问
function askRoute(r, optId, optText, retry) {
  const g = DB.game, ND = id => (g.nodes || []).find(x => x.id === id);
  const all = r.cands.length ? r.cands : (g.nodes || []).filter(n => !(g.visited || []).includes(n.id));
  const E = r.ending ? endingsOf(g) : {};
  const row = n => `<button type="button" class="rt-pick${n.id === r.suggest ? ' on' : ''}" data-id="${esc(n.id)}" style="display:block;width:100%;text-align:left;margin:6px 0">
      <b>${esc(n.id)}</b> <span class="muted">${r.ending ? esc((E[n.id]?.name || '') + ' · 条件：' + (E[n.id]?.cond || '未写')) : esc(n.route) + ' · ' + esc(n.act)}${n.id === r.suggest ? ' · 大纲建议' : ''}</span></button>`;
  const box = dialog(`<p>你选择了：<b>${esc(optText)}</b></p>
    <p class="err">${esc(r.reason)}</p>
    <p class="muted">AI 在摘要里写的去向：${esc(r.claimed || '（空）')}</p>
    ${r.ending ? `<p class="muted">当前数值：${esc(statRead(g.stats || {}))}</p>` : ''}
    <p>请选择这个选项实际通往的节点：</p>
    ${all.map(row).join('')}
    <div class="row" style="margin-top:6px">
      <button type="button" class="rt-pick" data-id="END">按结局处理</button>
      <span class="muted">选择会被记住，重读到这里不再询问。可在「路线预览」里修改。</span></div>`, '确认去向');
  box.querySelectorAll('.rt-pick').forEach(b => b.onclick = () => {
    (g.routeFix ??= {})[`${g.node}|${optId}`] = b.dataset.id;
    save(); closeDlg(); retry();
  });
  return null;
}

function chooseOpt(id, opts) {
  const g = DB.game, cur = g.cur;
  const text = opts.find(o => o.id === id)?.text || id;
  // 本页已访问节点：按 parent 链重算，不受别的分支污染（重读后"选什么都是结局"的根因）
  g.visited = visitedOn(g);
  const s = (cur.sum || {})[id] || {};
  // 先判定去向，需要玩家确认时停在这里，什么都还没改
  const pre = resolveNext(g, s.next || '', text, id, opts.findIndex(o => o.id === id));
  if (pre.ask) return askRoute(pre, id, text, () => chooseOpt(id, opts));
  S('choices').outerHTML = `<p class="p ch-sel">▸ ${esc(text)}</p>`;
  const ch = g.chapters[g.chIdx];
  g.lastChoiceText = `${id}（${text}）${s.fact ? '，结果：' + s.fact : ''}`;
  const line = `${g.node} → ${text}${s.fact ? '：' + s.fact : ''}`;
  g.summary.push(line);

  // 下一节点：上面已判定（AI 决定去向，程序只核对）
  const r = pre;
  if (r.how && r.how !== 'AI') g.summary.push(`（去向 ${r.id}：${r.how}）`);
  const nextId = r.id;
  const nd = (g.nodes || []).find(x => x.id === nextId);
  g.path.push({ ch: ch?.id, opt: id, text, node: nextId });
  g.lastChoice = id;

  // 章内有分支 → 这是主选择，进入分支继续读
  const branch = cur.blocks[id];
  if (branch) {
    if (ch) { ch.choice = id; ch.choiceText = text; ch.sumLine = line; }
    g.node = nextId; if (nd) g.route = nd.route;
    save(); renderSide();
    PLAY = { segs: branch.slice(), i: 0 };
    advance();
    return;
  }

  // 没有分支 → 分支末尾的内层选择，决定下一章。记下离开本章时的完整状态
  if (ch) {
    ch.exitChoice = id; ch.exitText = text; ch.nextNode = nextId;
    ch.lastChoiceText = g.lastChoiceText;
    ch.read = (g.shown || []).join('\n') + `\n▸ 玩家选择：${text}`;
  }
  g.node = nextId; if (nd) g.route = nd.route;
  save(); renderSide();

  // 这一页之前走过相同的选择 → 直接沿用已写好的下一章
  const kid = childOf(g, g.chIdx, id);
  if (kid >= 0) {
    const k = g.chapters[kid];
    // 子章的起始状态以本次实际状态为准，覆盖旧快照
    k.statsAt = { ...g.stats }; k.charsAt = structuredClone(g.chars);
    enterChapter(g, kid); save();
    S('story').insertAdjacentHTML('beforeend', `<p class="muted">（沿用已写好的后续：${esc(k.node)}）</p>`);
    PLAY = null; playFrom();
    return;
  }
  g.pendingParentChoice = id;   // 交给下一次第四步生成时写入 parentChoice
  save();
  endOfChapter();
}

// ============ 启动 ============
S('hamb').onclick = sideToggle;
S('side-close').onclick = () => sideOpen(false);
S('scrim').onclick = () => sideOpen(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('side-open')) sideOpen(false); });
document.querySelectorAll('#side [data-act]').forEach(b => b.onclick = () => {
  sideOpen(false);
  ({ settings: openSettings, routes: routePreview, archive, title, terms: () => showTerms(true) }[b.dataset.act])();
});
// ============ 免责声明 ============
// 改了条款就把版本号 +1，所有人会重新看到并确认一次
const TERMS_VER = 1;
const TERMS = [
  ['软件性质', '絮糖是作者个人开发、免费分发的本地工具软件，不收取任何费用，不提供 AI 模型、API 接口、账号或任何在线服务，也不设服务器。'],
  ['内容生成', '软件内的剧情、对话、选项等全部内容，均由用户自行配置的第三方 AI 大语言模型实时生成。作者无法预先审核或干预，生成内容不代表作者立场。'],
  ['虚构性', '软件中的角色、情节、组织、世界观均为 AI 生成的虚构内容，与现实人物、团体、事件无关。请自行判断内容是否适合自己。'],
  ['用户责任', '你应当遵守所在地法律法规以及所用 AI 服务商的使用条款，不得利用本软件生成、传播违法违规内容（包括但不限于色情、暴力、侵害他人权益、危害国家安全的内容）。你输入的设定、生成的内容由你自行负责；如需对外传播，请自行审核并承担相应责任。'],
  ['API 与费用', 'API 地址与密钥由你自行填写，仅保存在本机，并直接发送到你填写的服务商。由此产生的费用、账号风险及服务商对内容的处理，均与作者无关。'],
  ['数据存储', '设定、存档、密钥等数据只保存在本机，作者不收集、不上传、不接触任何用户数据。卸载软件或清除数据会导致内容丢失，请自行导出备份。'],
  ['年龄限制', '本软件仅供年满 18 周岁的成年人使用。未成年人请勿使用。'],
  ['免责范围', '本软件按"现状"提供，不保证无错误或持续可用。在法律允许的范围内，因使用本软件或 AI 生成内容所产生的任何直接或间接后果，作者不承担责任。'],
  ['条款变更', '作者可随时修改本声明，或停止更新本软件。条款更新后会在启动时再次提示。'],
];
function showTerms(force) {
  if (!force && +STORE.getItem('xutang-terms') === TERMS_VER) return;
  const d = document.createElement('dialog');
  d.id = 'terms';
  d.setAttribute('aria-labelledby', 'terms-h');
  d.innerHTML = `<h2 id="terms-h" style="color:#e8d8b0;margin:.2em 0 .6em">使用须知与免责声明</h2>
    <div style="max-height:58vh;overflow:auto;line-height:1.7;font-size:14px">
      ${TERMS.map(([t, s], i) => `<p><b>${i + 1}. ${esc(t)}</b><br>${esc(s)}</p>`).join('')}
      <p class="muted">点击"同意并继续"即表示你已年满 18 周岁，并已阅读、理解并同意以上全部内容。</p></div>
    <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="terms-ck"> 我已年满 18 周岁，并同意以上条款</label>
    <div class="row"><button type="button" id="terms-ok" disabled>同意并继续</button>
      ${force ? '<button type="button" id="terms-x">关闭</button>' : '<button type="button" id="terms-no">不同意</button>'}</div>
    <p id="terms-msg" class="err" role="alert"></p>`;
  document.body.append(d);
  d.addEventListener('cancel', e => { if (!force) e.preventDefault(); });   // 首次必须明确选择，返回键不能跳过
  d.showModal();
  const ck = d.querySelector('#terms-ck'), ok = d.querySelector('#terms-ok');
  ck.onchange = () => { ok.disabled = !ck.checked; };
  ok.onclick = () => { STORE.setItem('xutang-terms', String(TERMS_VER)); d.close(); d.remove(); };
  if (force) d.querySelector('#terms-x').onclick = () => { d.close(); d.remove(); };
  else d.querySelector('#terms-no').onclick = () => {
    d.querySelector('#terms-msg').textContent = '不同意将无法使用本软件，请直接退出。';
  };
}
title();
showTerms();
musicList();   // 预读音乐清单，生成时提示词要用
if ('serviceWorker' in navigator && location.protocol !== 'file:')
  navigator.serviceWorker.register('sw.js').catch(() => {});

// (end)