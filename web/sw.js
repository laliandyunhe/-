// 外壳缓存优先；API 请求和音乐不走缓存
const C = "xutang-v2";
const SHELL = ['./', 'index.html', 'style.css', 'prompts.js', 'music.js', 'core.js', 'app.js', 'manifest.json', 'icon.svg'];
// 逐个缓存：任何一个文件 404 都不能让整个新版本装不上（否则旧版本 SW 会一直接管页面）
self.addEventListener('install', e => e.waitUntil(caches.open(C)
  .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
  .then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // 网络优先，离线回退缓存，开发阶段改代码能立刻生效
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});