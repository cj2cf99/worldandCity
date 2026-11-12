// 挂进主站（cloudflaremyapp）时的入口：页面、静态资源、接口都先过主站传入的 authorize（Access 身份）。
// 路径：/worldandcity/（页面与静态文件）、/api/worldandcity/v1/*（接口，去掉前缀后交给 api.mjs，用 D1 绑定 mymaindb）。
// 只做接线：页面不加主站页头（页面自带“返回首页”按钮）。
import { handle } from './api.mjs';

const BASE = '/worldandcity', API = '/api/worldandcity/v1';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";
const STATIC = /^(assets\/[\w.-]+\.(?:js|css)|geo\/(?:jp|cn|adm1)\/[\w.-]+\.json)$/; // 只放行构建产物与几何文件
const json = (body, status) => Response.json(body, { status, headers });

export function createWorldCityHandler({ authorize }) {
  return async function handleWorldCity(request, env) {
    const url = new URL(request.url), path = url.pathname;
    const api = path === API || path.startsWith(API + '/');
    if (path !== BASE && !path.startsWith(BASE + '/') && !api) return null;
    try {
      const identity = await authorize(request, env);
      if (!identity?.ownerId) return json({ error: { code: 'UNAUTHORIZED', message: '请登录后访问' } }, 401);
      const method = request.method;
      if (!api) {
        if (method !== 'GET' && method !== 'HEAD') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: '方法不支持' } }, 405);
        if (path === BASE) return new Response(null, { status: 308, headers: { ...headers, Location: BASE + '/' + url.search } });
        const rel = path.slice(BASE.length + 1);
        const file = rel === '' || /^n\/[^/]+$/.test(rel) ? 'index.html' : STATIC.test(rel) ? rel : null; // 页面内的 /n/<id> 深链接都回到同一个页面
        if (!file) return json({ error: { code: 'NOT_FOUND', message: '页面不存在' } }, 404);
        if (!env.STOCKCHECK_ASSETS?.fetch) return json({ error: { code: 'ASSETS_MISSING', message: '静态资源未配置' } }, 503);
        const target = new URL(request.url); target.pathname = `${BASE}/${file}`; target.search = '';
        const clean = new Headers(request.headers); clean.delete('If-None-Match'); clean.delete('If-Modified-Since');
        const res = await env.STOCKCHECK_ASSETS.fetch(new Request(target, { method, headers: clean }));
        const out = new Headers(res.headers);
        for (const [k, v] of Object.entries(headers)) out.set(k, v);
        out.delete('ETag'); out.delete('Content-Length');
        if (file === 'index.html') { out.set('Content-Security-Policy', csp); out.set('Referrer-Policy', 'strict-origin-when-cross-origin'); } // OSM 瓦片政策要求请求带 Referer：页面只向外部发送站点来源（不含路径），其余响应仍为 no-referrer
        return new Response(method === 'HEAD' ? null : res.body, { status: res.status, headers: out });
      }
      if (method !== 'GET' && ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')) {
        return json({ error: { code: 'ORIGIN_REJECTED', message: '不允许跨站修改数据' } }, 403);
      }
      if (!env.mymaindb) return json({ error: { code: 'DATABASE_MISSING', message: '数据库未配置' } }, 503);
      const inner = new URL(request.url); inner.pathname = '/api/v1' + path.slice(API.length);
      const res = await handle(new Request(inner, request), env.mymaindb);
      const out = new Headers(res.headers); for (const [k, v] of Object.entries(headers)) out.set(k, v);
      return new Response(res.body, { status: res.status, headers: out });
    } catch (e) {
      if (e?.status) return json({ error: { code: e.code || 'ERROR', message: e.message } }, e.status);
      return json({ error: { code: 'INTERNAL', message: '服务异常' } }, 500);
    }
  };
}
