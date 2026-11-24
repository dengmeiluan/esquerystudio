/* 浏览器模式 fetch-config 的 connId 解析看守。
 *
 * 服务端 /xmigrate/fetch-config?connId= 走服务端取密；浏览器端此前把 connId 丢弃
 * 只认 body.conn——「选已存档案拉结构」（托管重建「从集群复刻」/迁移页拉取预览）
 * 在浏览器模式必打空连接（源集群 host 不能为空）。本件锁：connId 且 body.conn 无
 * host/url 时，从本机档案库（browserProfiles，含凭据）解析出连接再发起 sourceCall；
 * 档案不存在 → 404 CONN_NOT_FOUND，不静默回落当前激活档案。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { browserFetch } from '../platform/browserApi';
import { upsertProfile, __resetBrowserProfilesForTests } from '../platform/browserProfiles';

const calls: { url: string }[] = [];

beforeEach(() => {
  __resetBrowserProfilesForTests();
  calls.length = 0;
  vi.stubGlobal('fetch', async (input: any) => {
    calls.push({ url: String(input) });
    const url = String(input);
    if (url.includes('/_mapping')) {
      return new Response(JSON.stringify({ idx: { mappings: { properties: { t: { type: 'text' } } } } }), { status: 200 });
    }
    if (url.includes('/_settings')) {
      return new Response(JSON.stringify({ idx: { settings: { index: { number_of_shards: '5' } } } }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('浏览器模式 fetch-config connId 档案解析', () => {
  it('connId 且 body.conn 无连接信息 → 按档案 url 发起源请求（不丢 connId）', async () => {
    upsertProfile({ name: '生产', url: 'http://es-prod.internal:9200', username: 'u', password: 'p' });
    const profiles = JSON.parse(localStorage.getItem('esquerystudio.browser.profiles') || '[]');
    const pid = profiles[0].id;

    const resp = await browserFetch(`/internal/es/xmigrate/fetch-config?sourceIndex=idx&connId=${pid}`,
      { method: 'POST', body: '{}' });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.settings).toContain('number_of_shards');
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain('http://es-prod.internal:9200/idx/_mapping');
    expect(calls[1].url).toContain('http://es-prod.internal:9200/idx/_settings');
  });

  it('connId 档案不存在 → 404 CONN_NOT_FOUND（不回落激活档案）', async () => {
    const resp = await browserFetch('/internal/es/xmigrate/fetch-config?sourceIndex=idx&connId=nope',
      { method: 'POST', body: '{}' });
    expect(resp.status).toBe(404);
    const data = await resp.json();
    expect(data.code).toBe('CONN_NOT_FOUND');
    expect(calls.length).toBe(0);
  });

  it('body.conn 自带连接信息 → 保持既有直连路径（connId 不覆盖显式 conn）', async () => {
    upsertProfile({ name: '档案A', url: 'http://a:9200', username: '', password: '' });
    const profiles = JSON.parse(localStorage.getItem('esquerystudio.browser.profiles') || '[]');
    const pid = profiles[0].id;
    /* 真实调用形态：POST body 本身就是扁平 conn（XMigrateView connBody()） */
    const resp = await browserFetch(`/internal/es/xmigrate/fetch-config?sourceIndex=idx&connId=${pid}`,
      { method: 'POST', body: JSON.stringify({ scheme: 'http', host: 'explicit-host', port: 9200 }) });
    expect(resp.status).toBe(200);
    expect(calls[0].url).toContain('http://explicit-host:9200/idx/_mapping');
  });
});
