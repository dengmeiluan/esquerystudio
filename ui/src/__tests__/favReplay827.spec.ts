import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRouter, createMemoryHistory } from 'vue-router';
import { replayFavorite, replayTarget } from '../utils/favReplay';

// 八百二十七批·用户实报随修「收藏夹『打开』跳转无效+不自动填充」两根因（R208——纯前端零 Java）。
// 根因①favReplay 缺 devtools 分支：DevTools saveFav 落 tags ['rest','devtools']，重放坠 /rest
// 通用兜底=不回源视图（用户预期=回到 DevTools 且请求装好）。
// 根因②DevToolsView consumePrefill 只挂 onMounted 而 DevToolsView 在 KEEP_ALIVE_VIEWS 白名单
// =缓存实例再进入不消费——esquerystudio.devtools.open 既有 5 写入方（DslQuery/Watcher/IndexHub/
// Ilm/CmdPalette）预填在缓存态全被吞（App.vue 白名单注释 line95「深链预填在 onActivated 下仍可
// 消费」的入名单漏）。
// 全类清点（826 批⑥在案）：9 支 carry 键消费方余 7 支全在位=A4 全类守卫锚固化。

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

function mkRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/devtools', component: { template: '<div class="stub-devtools"/>' } },
      { path: '/rest', component: { template: '<div class="stub-rest"/>' } },
      { path: '/search', component: { template: '<div class="stub-search"/>' } },
    ],
  });
}
const settle = async () => { await new Promise(r => setTimeout(r, 0)); for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('favReplay827 devtools 分支（实报根因①）', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('A1 kind=rest tags=[rest,devtools] → 写 esquerystudio.devtools.open+push /devtools（不坠 /rest 兜底）', async () => {
    const router = mkRouter();
    await router.push('/'); await router.isReady();
    const notify = vi.fn();
    replayFavorite(
      { kind: 'rest', tags: ['rest', 'devtools'], payload: { method: 'GET', path: '/_cat/indices?v&format=json', body: '' } },
      router, notify,
    );
    await settle();
    expect(router.currentRoute.value.path).toBe('/devtools');
    const raw = sessionStorage.getItem('esquerystudio.devtools.open');
    expect(raw).toBeTruthy();
    const p = JSON.parse(raw!);
    expect(p.method).toBe('GET');
    expect(p.path).toBe('/_cat/indices?v&format=json');
    expect(p.body).toBe('');
    expect(notify).toHaveBeenCalledWith('success', expect.stringContaining('Dev Tools'));
  });

  it('A2 payload 缺失=partial 诚实提示仍到 DevTools（R56 语义不回退）', async () => {
    const router = mkRouter();
    await router.push('/'); await router.isReady();
    const notify = vi.fn();
    replayFavorite({ kind: 'rest', tags: ['rest', 'devtools'], payload: {} }, router, notify);
    await settle();
    expect(router.currentRoute.value.path).toBe('/devtools');
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('不完整'));
  });

  it('A3 replayTarget devtools 标注「Dev Tools」（R56 去向前置可见对齐）', () => {
    const t = replayTarget({ kind: 'rest', tags: ['rest', 'devtools'], payload: {} });
    expect(t.path).toBe('/devtools');
    expect(t.label).toBe('Dev Tools');
  });

  it('A4 无 devtools 标签的通用 REST 收藏仍走 /rest 兜底（原语义零回退）', async () => {
    const router = mkRouter();
    await router.push('/'); await router.isReady();
    const notify = vi.fn();
    replayFavorite({ kind: 'rest', tags: ['rest'], payload: { method: 'GET', path: '/_cluster/health' } }, router, notify);
    await settle();
    expect(router.currentRoute.value.path).toBe('/rest');
  });
});

describe('favReplay827 KeepAlive 预填（实报根因②）', () => {
  it('B1 DevToolsView consumePrefill 挂 onActivated（白名单再进入仍消费）', () => {
    const v = rd('../views/DevToolsView.vue');
    const start = v.indexOf('onActivated(');
    const block = v.slice(start, v.indexOf('onDeactivated(', start));
    expect(block).toContain('consumePrefill();');
    expect(block).toContain("window.addEventListener('keydown', onGlobalRunKey)");
  });
});

describe('favReplay827 全类守卫（9 支 carry 键消费方在位=826 批⑥清点固化）', () => {
  const FAMILY: Array<[string, string]> = [
    ['esquerystudio.dsl.carry', '../views/QueryHubView.vue'],
    ['esquerystudio.sql.prefill', '../views/QueryHubView.vue'],
    ['esquerystudio.lucene.q', '../views/QueryHubView.vue'],
    ['esquerystudio.bulk.carry', '../views/BulkEditorView.vue'],
    ['esquerystudio.ubq.carry', '../views/UpdateByQueryView.vue'],
    ['esquerystudio.reindex-advanced.body', '../views/ReindexAdvancedView.vue'],
    ['esquerystudio.doc-diff.carry.source', '../views/DiffEditorView.vue'],
    ['esquerystudio.sandbox.body', '../views/SearchSandboxView.vue'],
    ['esquerystudio.devtools.open', '../views/DevToolsView.vue'],
  ];
  it.each(FAMILY)('%s 消费方在位', (key, consumer) => {
    expect(rd(consumer)).toContain(key);
  });
});
