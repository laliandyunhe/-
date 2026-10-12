// 背景音乐：只播放用户自己导入的音频文件，不联网。
// 文件存 IndexedDB（localStorage 放不下音频）；清单 {id,name,tags,type,size} 同存一份，AI 从清单里选名称写 [music:名称]。
const MDB = (() => {
  let dbp = null;
  const open = () => dbp ??= new Promise((ok, no) => {
    if (!('indexedDB' in window)) return no(new Error('当前环境不支持 IndexedDB，无法导入音乐'));
    const r = indexedDB.open('xutang-music', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('meta', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((ok, no) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => ok(out?.result ?? out);
      t.onerror = t.onabort = () => no(t.error || new Error('存储失败（可能空间不足）'));
    });
  };
  return {
    list: () => tx(['meta'], 'readonly', t => t.objectStore('meta').getAll()),
    file: id => tx(['files'], 'readonly', t => t.objectStore('files').get(id)),
    put: (meta, blob) => tx(['meta', 'files'], 'readwrite', t => { t.objectStore('meta').put(meta); t.objectStore('files').put(blob, meta.id); }),
    meta: meta => tx(['meta'], 'readwrite', t => { t.objectStore('meta').put(meta); }),
    del: id => tx(['meta', 'files'], 'readwrite', t => { t.objectStore('meta').delete(id); t.objectStore('files').delete(id); }),
  };
})();

const bgm = () => document.getElementById('bgm');
let musicMeta = null;           // 清单缓存
const blobUrls = {};            // id -> objectURL
async function musicList(force) {
  if (!musicMeta || force) { try { musicMeta = await MDB.list(); } catch { musicMeta = []; } }
  return musicMeta;
}
// 给提示词用的清单文本：AI 只能从这里选
function musicListText(list) {
  if (!list.length) return '（玩家没有导入音乐，不要写 [music:…] 标记）';
  return list.map(m => `- ${m.name}${m.tags?.length ? '（' + m.tags.join('、') + '）' : ''}`).join('\n')
    + '\n只能写上面列出的名称，如 [music:' + list[0].name + ']；没有合适的就不写。';
}
// AI 写的名称 → 曲目：完全同名 > 标签相同 > 名称互相包含；都不中返回 null（不乱放）
function matchTrack(list, kw) {
  const n = s => String(s || '').toLowerCase().replace(/[\s\-_·—–()（）《》「」"'“”]/g, '');
  const k = n(kw);
  if (!k) return null;
  return list.find(m => n(m.name) === k)
    || list.find(m => (m.tags || []).some(t => n(t) === k))
    || list.find(m => n(m.name) && (k.includes(n(m.name)) || n(m.name).includes(k)))
    || null;
}
let curTrack = '';
async function playMusic(keyword) {
  if (!keyword || keyword === curTrack) return;
  curTrack = keyword;
  const el = document.getElementById('music-now');
  const m = matchTrack(await musicList(), keyword);
  if (!m) { el.textContent = ''; return; }   // 没导入对应音乐就安静，不打扰阅读
  try {
    if (!blobUrls[m.id]) { const b = await MDB.file(m.id); if (!b) throw 0; blobUrls[m.id] = URL.createObjectURL(b); }
  } catch { el.textContent = '♪ ' + m.name + '（文件丢失）'; return; }
  el.textContent = '♪ ' + m.name;
  const a = bgm();
  a.src = blobUrls[m.id];
  a.volume = Number(STORE.getItem('vol') || 0.6);
  a.play().catch(() => { el.textContent = '♪ ' + m.name + '（点击页面后播放）'; });
}
function stopMusic() { const a = bgm(); a.pause(); a.removeAttribute('src'); curTrack = ''; document.getElementById('music-now').textContent = ''; }

// 导入：一次可选多个文件；名称默认取文件名（去扩展名）
const MUSIC_MAX = 30 * 1024 * 1024;   // 单个文件上限，防止误选视频把存储撑爆
async function importMusicFiles(files) {
  const have = await musicList(), done = [], bad = [];
  for (const f of files) {
    if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(f.name)) { bad.push(`${f.name}：不是音频文件`); continue; }
    if (f.size > MUSIC_MAX) { bad.push(`${f.name}：超过 30MB`); continue; }
    let name = f.name.replace(/\.[^.]+$/, '').trim() || '未命名';
    for (let i = 2; have.concat(done).some(m => m.name === name); i++) name = name.replace(/ \(\d+\)$/, '') + ` (${i})`;
    const meta = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), name, tags: [], type: f.type, size: f.size };
    try { await MDB.put(meta, f); done.push(meta); } catch (e) { bad.push(`${f.name}：${e.message || e}`); }
  }
  await musicList(true);
  return { done, bad };
}
async function removeTrack(id) {
  await MDB.del(id);
  if (blobUrls[id]) { URL.revokeObjectURL(blobUrls[id]); delete blobUrls[id]; }
  await musicList(true);
}
async function updateTrack(id, patch) {
  const m = (await musicList()).find(x => x.id === id);
  if (!m) return;
  Object.assign(m, patch);
  await MDB.meta(m);
}
