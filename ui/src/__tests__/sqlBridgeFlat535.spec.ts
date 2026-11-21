/**
 * 五百三十五批：SqlBridge 面残面四件套契约看守。
 *  T1 三 pane 卡壳退役（四刀约定③④）：pane 即容器内容直贴，分界由 .br-card-hd 既有
 *     border-bottom 承接；.br-card 仅页面级 wide 卡（err 面板/对比表）保留。
 *     ⚠高度链承重墙等效迁移：.br-pane 保 height:100%+flex column（rp-content 已拉伸定高），
 *     monaco-host 直挂原 flex 字面（sqlLint534:145 锚随改用迁移，本件双锁防回退）。
 *  T2 竖排标题轨退役（刀①②）：BRIDGE_PANES title 置空即不渲染（519 批约定），标题语义落
 *     各 pane 行首横排 br-title（sec-t 档，DevTools 0b130b92 同款）。
 *  T3 页内查询历史（§6u 遗留补齐）：此前只写不显——open-hist 钮 + NModal + QueryHistoryPanel
 *     （mode=sql 单档过滤与 SqlConsole 共池，Lead 裁决；actions 四件/导入清空关闭）；
 *     试跑成功 push 历史（pickedIdx 优先，缺省解析 FROM 表名）。
 *  T4 试跑取消+读秒：useQueryRun 统一件——signal 传 api.sqlLenient 既有形参（零 api 改动），
 *     读秒文案+瞬时取消钮；AbortError 静默不进 br-result.err、不弹错误红条（R80 同语义）。
 *
 * 设施：NModal stub 直渲染 + MonacoEditor stub 回显 modelValue + seedHist 写 localStorage
 * 'es_query_hist_v2'（histEntry528 同款范式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';

const v = readFileSync(join(__dirname, '../views/SqlBridgeView.vue'), 'utf-8');

/* NModal：teleport/定位非测试目标——show=true 直渲染、false 不渲染 */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

/* MonacoEditor stub：回显 modelValue（草稿回填断言锚） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub', 'data-height': props.height }, String(props.modelValue ?? ''));
    },
  }),
}));

/* monaco 全链 mock：本视图对 monaco 的唯一消费是 ensureSqlCompletion(monaco, sqlCtx)（语言级
   provider 注册单例），挂载测试不关心 provider 内容——整链 stub 掉真模块（~5s 冷变换，
   默认 5s 用例超时边缘抖动；histEntry528 的 SqlConsole 挂载同源成本实测 4.2s） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({ default: {} }));
vi.mock('../utils/sqlCompletion', () => ({ ensureSqlCompletion: () => ({ dispose: () => {} }) }));

const sqlLenientFn = vi.fn();
const sqlTranslateFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      sqlLenient: (...a: any[]) => sqlLenientFn(...a),
      sqlTranslate: (...a: any[]) => sqlTranslateFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（store 初始化） */
      listStoredScripts: () => Promise.resolve({ scripts: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const apps: ReturnType<typeof createApp>[] = [];

async function mountBridge() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const { default: comp } = await import('../views/SqlBridgeView.vue');
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(20);
  await settle();
  const { useAppStore } = await import('../stores/app');
  return { host, store: useAppStore(), unmount: () => app.unmount() };
}

function seedHist(items: Array<Partial<{ id: string; mode: string; query: string; index: string; ts: number }>>) {
  localStorage.setItem('es_query_hist_v2', JSON.stringify(
    items.map((it, i) => ({ id: it.id ?? 'qh-' + i, mode: it.mode, query: it.query, index: it.index, ts: it.ts ?? 1700000000000 + i })),
  ));
}
function seedSqlDraft(q: string) {
  localStorage.setItem('esquerystudio.pref.sqlbridge.sql', JSON.stringify(q));
}
function findBtn(root: ParentNode, sel: string, attr = 'aria-label'): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>(sel)).find(b => b.getAttribute(attr));
}
function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sqlLenientFn.mockReset().mockResolvedValue({ rows: [['a']], columns: ['id'] });
  sqlTranslateFn.mockReset().mockResolvedValue({});
});

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

/* ═══════════ A 源锚：T1 降层 + T2 标题轨 ═══════════ */
describe('A SqlBridge 降层与标题轨（535 批 T1/T2）', () => {
  it('高度链承重墙等效迁移：br-pane 保 height:100%+flex column，monaco-host 直挂原 flex 字面', () => {
    expect(v).toContain('.br-pane { height: 100%; display: flex; flex-direction: column; }');
    expect(v).toContain('.br-pane > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }');
    /* 旧承重选择器不残留（sqlLint534:145 锚已同步更新 .br-pane 改用） */
    expect(v).not.toContain('.br-card { height: 100% }');
    expect(v).not.toContain('.br-card > :deep(.monaco-host)');
  });

  it('三 pane 挂载点换 br-pane 内容直贴；页面级 wide 卡（err 面板/对比表）保 .br-card 不动', () => {
    for (const slot of ['pane-bridge-sql', 'pane-bridge-dsl', 'pane-bridge-lucene']) {
      const seg = v.slice(v.indexOf(`<template #${slot}>`), v.indexOf('</template>', v.indexOf(`<template #${slot}>`)));
      expect(seg, slot + ' pane 根换 br-pane').toContain('<div class="br-pane">');
      expect(seg, slot + ' 不再挂 br-card 壳').not.toContain('class="br-card"');
    }
    /* 五百六十二批同步更新：失败面板脱 .br-card 卡壳 → 全局 .err-bar 形态承载（558b pf-err
       先例，role=alert 在场）；对比表页面级 br-card 卡与 .br-card 壳规则保留不动 */
    expect(v, '失败面板 err-bar 直贴（562 脱卡壳）').toContain('role="alert" class="err-bar br-err"');
    expect(v, '对比表页面级卡保留').toContain('<div class="br-card wide">');
    expect(v).toMatch(/\.br-card \{ background: var\(--card-bg\); border: 1px solid var\(--border\); border-radius: var\(--r-m\); overflow: hidden; display: flex; flex-direction: column; \}/);
  });

  it('竖排标题轨退役：三 title 置空即不渲染（519 约定）；标题语义落行首横排 br-title（sec-t 档）', () => {
    expect(v, 'SQL/DSL/Lucene 竖排轨不残留').not.toMatch(/title: '(SQL|DSL|Lucene)'/);
    expect((v.match(/title: ''/g) ?? []).length, '三 pane 全置空').toBe(3);
    expect(v, 'br-title 升 sec-t 档（tx1+加重，muted 弱化档退役）')
      .toContain('.br-title { color: var(--tx1); font-size: var(--fs-sm); font-weight: 600; flex: 1; }');
    for (const tt of ['分布式 SQL', 'Elasticsearch 原生 JSON', 'query_string 语法']) {
      expect(v, '行首横排标题文案在场：' + tt).toMatch(new RegExp('class="br-title">[^<]*' + tt));
    }
  });
});

/* ═══════════ B 源锚：T3 历史 + T4 取消读秒 ═══════════ */
describe('B SqlBridge 页内历史与试跑取消（535 批 T3/T4 源锚）', () => {
  it('open-hist 钮 + NModal + QueryHistoryPanel（sql 单档/actions 四件/导入清空关闭/成功 push）', () => {
    expect(v, '页头/卡头历史钮').toContain('data-test="open-hist"');
    expect(v).toContain('<n-modal v-model:show="histOpen"');
    expect(v).toContain(":actions=\"['play', 'fill', 'copy', 'del']\"");
    expect(v, '导入/清空入口关闭（同沙盒口径）').toContain(':clearable="false" :importable="false"');
    expect(v, 'mode=sql 单档过滤').toContain("qh.items.filter(i => i.mode === 'sql')");
    expect(v, '试跑成功记历史（与 SqlConsole 共池）').toContain("qh.push('sql'");
  });

  it('试跑接 useQueryRun：signal 传 sqlLenient 既有形参；AbortError 分支先于 err 写入（静默丢弃）', () => {
    expect(v).toContain('const qr = useQueryRun();');
    expect(v, 'signal 传 api（零 api 改动）').toContain('api.sqlLenient(JSON.stringify({ query: sql.value }), signal)');
    expect(v, '读秒文案').toContain("'试跑中 ' + (qr.elapsedMs.value / 1000).toFixed(1) + 's'");
    expect(v, '瞬时取消钮').toContain('v-if="qr.running.value" class="btn ghost xs" @click="qr.cancel()"');
    const catchSeg = v.slice(v.indexOf('catch (e: any) {', v.indexOf('async function runSql')), v.indexOf('finally { busy.value = false; qr.finish(); }'));
    expect(catchSeg, 'AbortError 静默分支在 err 写入之前').toBeTruthy();
    expect(catchSeg.indexOf("e?.name === 'AbortError'")).toBeLessThan(catchSeg.indexOf('sqlResult.value = { err: true'));
  });
});

/* ═══════════ C 挂载：历史面板与试跑链路 ═══════════ */
describe('SqlBridgeView：页内历史入口（535 批 T3）', () => {
  it('开面板只出 mode=sql 条目；fill 回填草稿不执行', async () => {
    seedHist([
      { id: 'a', mode: 'sql', query: 'SELECT 1' },
      { id: 'b', mode: 'lucene', query: 'status:ACTIVE' },
    ]);
    const { host, unmount } = await mountBridge();
    const open = host.querySelector<HTMLButtonElement>('[data-test="open-hist"]');
    expect(open, '页头历史钮必须在').toBeTruthy();
    open!.click();
    await settle();
    const items = host.querySelectorAll('.nm-stub .qhp-item');
    expect(items.length, '两条历史只出 sql 一档').toBe(1);
    findBtn(items[0] as ParentNode, 'button[aria-label="仅填入"]')!.click();
    await settle();
    expect(host.querySelector('.monaco-stub')!.textContent).toBe('SELECT 1');
    expect(sqlLenientFn, 'fill 只回填不执行').not.toHaveBeenCalled();
    expect(host.querySelector('.nm-stub'), '面板随回填关闭').toBeNull();
    unmount();
  });

  it('play 回填并试跑：sqlLenient 收到回填稿；成功后 push 历史（FROM 解析索引锚，与 SqlConsole 共池）', async () => {
    seedHist([{ id: 'a', mode: 'sql', query: 'SELECT id FROM "my-index" LIMIT 10' }]);
    const { host, unmount } = await mountBridge();
    host.querySelector<HTMLButtonElement>('[data-test="open-hist"]')!.click();
    await settle();
    findBtn(host.querySelector('.nm-stub')!, 'button[aria-label="回放/执行"]')!.click();
    await settle();
    await wait(20);
    await settle();
    expect(sqlLenientFn, 'play=回填并试跑').toHaveBeenCalledTimes(1);
    expect(String(sqlLenientFn.mock.calls[0][0])).toContain('my-index');
    expect(host.querySelector('.br-result')!.textContent).toContain('✅ 成功');
    const { useQueryHistoryStore } = await import('../stores/queryHistory');
    const items = useQueryHistoryStore().items;
    const pushed = items.find(i => i.query === 'SELECT id FROM "my-index" LIMIT 10' && i.index === 'my-index');
    expect(pushed, '成功后 push：pickedIdx 空走 FROM 解析（引号壳兼容）').toBeTruthy();
    expect(pushed!.mode, 'mode=sql 与 SqlConsole 共池（Lead 裁决）').toBe('sql');
    unmount();
  });

  it('试跑读秒+取消：AbortError 静默——不进 br-result.err、不弹错误红条、取消钮随收', async () => {
    seedSqlDraft('SELECT 1');
    const { host, store, unmount } = await mountBridge();
    sqlLenientFn.mockImplementation((_body: string, signal?: AbortSignal) => new Promise((_res, rej) => {
      signal?.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        (err as any).name = 'AbortError';
        rej(err);
      });
    }));
    const notify = vi.spyOn(store, 'notify');
    textBtn(host, '试跑')!.click();
    await settle();
    expect(textBtn(host, '试跑')!.textContent, '读秒文案换字').toMatch(/试跑中/);
    const cancel = textBtn(host, '取消');
    expect(cancel, '瞬时取消钮在场').toBeTruthy();
    cancel!.click();
    await settle();
    await wait(20);
    await settle();
    expect(host.querySelector('.br-result.err'), 'AbortError 不进结果红条').toBeNull();
    expect(notify, '不弹错误红条（至多 info 轻提示）').not.toHaveBeenCalledWith('error', expect.anything());
    expect(textBtn(host, '取消'), '取消钮随收').toBeUndefined();
    expect(textBtn(host, '试跑')!.textContent, '钮文案复位').toContain('试跑');
    unmount();
  });
});
