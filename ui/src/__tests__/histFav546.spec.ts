/**
 * 五百四十六批工蚁2·轨4：历史收藏闭环（fav 一键转收藏 / DevTools 本 Tab 清空 / IndexHub docs 入历史）。
 *
 *  锁定：
 *  A QueryHistoryPanel 'fav' action（行为锁）：actions 枚举加 'fav' 出星标钮，点击 emit('fav', 行)；
 *    行级门=仅无 mode（页内自持历史，DslQueryView histRows 形状）或 mode='dsl' 行出钮——
 *    收藏存储（es_query_saved 保存的搜索）是 DSL 语义，sql/lucene 等跨模式行无收藏归宿，出钮即误导；
 *  B DslQueryView 宿主接线（源锚）：历史弹窗 actions 加 'fav' + @fav → favHistRow（行 DSL 装编辑器 +
 *    跨索引跟随 + 既有 saveQuery 命名弹窗链，「回放后另存」压缩为一步）；
 *  C QueryHubView 宿主接线（源锚）：跨模式抽屉 actions 加 'fav' + @fav → 确认后直写 es_query_saved
 *    （本页无命名弹窗，同名跳过防静默覆盖）；
 *  D DevToolsView 本 Tab 历史清空（源锚）：clearable 按汇聚范围开（仅本 Tab 档）+ @clear 确认链；
 *  E IndexHubView docs 检索入跨模式历史（源锚）：runDocs 成功/失败各 push 一条 mode='lucene'
 *    （:1157 push('dsl') 契约同构，回放走 esquerystudio.lucene.q 既有通道）。
 *
 * 面板挂载范式同 queryHistoryPanel.spec.ts（裸 createApp + pinia + vue-router mock）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/search' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { useAppStore } from '../stores/app';

const SRC = join(__dirname, '..');
const panelSrc = readFileSync(join(SRC, 'components/QueryHistoryPanel.vue'), 'utf-8');
const dslSrc = readFileSync(join(SRC, 'views/DslQueryView.vue'), 'utf-8');
const hubSrc = readFileSync(join(SRC, 'views/QueryHubView.vue'), 'utf-8');
const devSrc = readFileSync(join(SRC, 'views/DevToolsView.vue'), 'utf-8');
const ihSrc = readFileSync(join(SRC, 'views/IndexHubView.vue'), 'utf-8');

/* 行形状：无 mode=页内自持历史（DslQueryView histRows），带 mode=跨模式 store 条目（QueryHub 抽屉） */
const ITEMS = [
  { id: 'a', query: '{"query":{"match_all":{}}}', index: 'idx-a', ts: Date.now() - 1000 },
  { id: 'b', mode: 'dsl', query: 'status:active', index: 'idx-b', ts: Date.now() - 2000 },
  { id: 'c', mode: 'sql', query: 'SELECT 1', ts: Date.now() - 3000 },
];

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

type Emitted = Record<string, unknown[][]>;
async function mountPanel(props: Record<string, any> = {}) {
  const emitted: Emitted = {};
  const app = createApp({
    setup() {
      const store = useAppStore();
      void store;
      return () => h(QueryHistoryPanel as any, {
        items: ITEMS,
        actions: ['play', 'fav'],
        clearable: false,
        onPlay: (it: unknown) => (emitted.play = [...(emitted.play || []), [it]]),
        onFav: (it: unknown) => (emitted.fav = [...(emitted.fav || []), [it]]),
        ...props,
      }, undefined);
    },
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return emitted;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

afterEach(() => {
  while (apps.length) apps.pop()!.unmount();
});

describe('A QueryHistoryPanel fav action（行为锁）', () => {
  it("actions 含 'fav'：无 mode 行与 mode='dsl' 行出星标钮，mode='sql' 行不出（收藏=DSL 语义行级门）", () => {
    void mountPanel();
    const btns = [...host.querySelectorAll('button[aria-label="转为收藏（保存的搜索）"]')];
    expect(btns.length).toBe(2); /* 行 a（无 mode）+ 行 b（dsl） */
  });

  it('点击星标钮 emit fav 且载荷=该行（行对象原样）', async () => {
    const emitted = await mountPanel();
    const btn = host.querySelectorAll('button[aria-label="转为收藏（保存的搜索）"]')[0] as HTMLButtonElement;
    btn!.click();
    await nextTick();
    expect(emitted.fav?.length).toBe(1);
    expect(emitted.fav![0]![0]).toMatchObject({ id: 'a', query: '{"query":{"match_all":{}}}' });
  });

  it("actions 不含 'fav'（缺省/既有消费方）：零星标钮，既有面板行为零变化", () => {
    void mountPanel({ actions: ['play', 'copy', 'del'] });
    expect(host.querySelectorAll('button[aria-label="转为收藏（保存的搜索）"]').length).toBe(0);
    expect(host.querySelectorAll('.qhp-item').length).toBe(3);
  });

  it('源锚：fav 在 actions 枚举与 emits 契约在册（Star 图标钮接 $emit）', () => {
    /* 五百五十二批同步更新（击穿者：552 轨2 刀③——actions 联合类型加 'curl'，行级仅 emit、
       组装归宿主）：枚举字面同步更新六成员形，fav 在册语义零回退 */
    expect(panelSrc).toContain("'play' | 'fill' | 'copy' | 'curl' | 'del' | 'rename' | 'fav'");
    expect(panelSrc).toContain("(e: 'fav', it: HistRow): void;");
    expect(panelSrc).toContain('@click="$emit(\'fav\', it)"');
  });
});

describe('B DslQueryView 宿主接线（源锚）', () => {
  it('历史弹窗 actions 加 fav + @fav=favHistRow；favHistRow=行 DSL 装编辑器 + 跨索引跟随 + 既有保存弹窗链', () => {
    /* 五百五十四批同步更新（击穿者：554 B1 刀③——DQ 历史/保存面板 actions 加 'curl'，
       QueryHistoryPanel 行级仅 emit、curl 组装归宿主 histCurl；fav 在册语义零回退，
       七动作序=552 DevTools 六动作形同构 'curl' 置 del 前）
       五百六十二批同步更新（击穿者：kibanaWave562 K4——DQ 历史行带到 DevTools 新 Tab）：
       actions 加 'newtab'，_prefill 组装归宿主 histNewTab */
    expect(dslSrc).toContain("['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']");
    expect(dslSrc).toContain('@fav="favHistRow"');
    expect(dslSrc).toContain('function favHistRow');
    /* 「回放后另存」压缩链三要素：跨索引 suppress 跟随（replaySavedRow 同套路）、
       行 DSL 装入编辑器、走既有 saveQuery 命名弹窗（confirmSave 覆盖/布局重捕获语义原样） */
    expect(dslSrc).toContain('suppressIdxDslLoad = true;');
    expect(dslSrc).toMatch(/favHistRow[\s\S]{0,400}saveQuery\(\)/);
  });
});

describe('C QueryHubView 宿主接线（源锚）', () => {
  it('跨模式抽屉 actions 加 fav + @fav=确认后直写 es_query_saved（同名跳过防静默覆盖）', () => {
    expect(hubSrc).toContain("'play', 'fav', 'copy', 'del'");
    expect(hubSrc).toContain('@fav="favHistRow"');
    expect(hubSrc).toContain('es_query_saved');
    expect(hubSrc).toContain('if (Array.isArray(r)) saved = r');
  });
});

describe('D DevToolsView 本 Tab 历史清空（源锚）', () => {
  it('clearable 随汇聚范围开（仅本 Tab 档）+ @clear 确认链 + 清当前 tab history', () => {
    expect(devSrc).toContain(':clearable="histScope === \'tab\'"');
    expect(devSrc).toContain('@clear="askClearTabHist"');
    expect(devSrc).toContain('function askClearTabHist');
    expect(devSrc).toContain('askConfirm');
    expect(devSrc).toMatch(/askClearTabHist[\s\S]{0,600}t\.history = \[\]/);
  });
});

describe('E IndexHubView docs 检索入跨模式历史（源锚）', () => {
  it('runDocs 成功 push lucene（took 直通）/ 失败 push lucene（-1, false 红点口径）', () => {
    /* 1439 迁移：记发送时快照（runDocs 的 sigAtSend）而不是响应时的当前稿 */
    expect(ihSrc).toContain("push('lucene', sigAtSend, idx, r.took)");
    expect(ihSrc).toContain("push('lucene', sigAtSend, idx, -1, false)");
  });
  it('空词不入历史（切 docs tab 自动浏览是页面行为非用户查询，真机 546 实证空串刷屏）', () => {
    const guarded = ihSrc.match(/if \(sigAtSend\.trim\(\)\) useQueryHistoryStore\(\)\.push\('lucene'/g) || [];
    expect(guarded.length).toBe(2);
  });
});
