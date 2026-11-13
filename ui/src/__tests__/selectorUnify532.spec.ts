/**
 * 五百三十二批（工蚁4）：重复索引选择器合并 + 编辑器弹性档。
 *
 * ① 8 视图 IndexPicker 退役面（grep 防回潮）：PitScrollView / IndexSettingsView / IndexOptimizerView /
 *    BulkEditorView / UpdateByQueryView / ConfigValidatorView 页内选择器换只读 CurrentIdxChip
 *    （「选索引」唯一可写入口收敛顶栏，525 批 W1 口径推广）；RestView / SystemView 本无页内
 *    选择器，一并锁死不回潮。写类页（Optimizer/BulkEditor/UBQ/ConfigValidator）R61 不开 follow，
 *    「用当前索引」回填钮保留（AdhocRebuildView 范式）；IndexSettings chip 即当前索引，回填钮退役。
 * ② IndexSettings follow:true + 脏态 guard（源码锁）：diffCount>0 暂停跟随，watch(index) 承接
 *    「选中即拉取」（原 @picked 随退役走）。
 * ③ PitScrollView 卸载停循环（行为用例）：onBeforeUnmount 置 running=false/pause=true——
 *    PIT 随卸载关闭后拉取 while 循环必须在 in-flight 请求返回后退出，不再发 pitSearch。
 * ④ Monaco 塌缩兜底源码锁（2.9.115 P0 红线）：ConfigValidator stacked 档 host min-height:260px
 *    （AnalyzeView:546/BulkEditorView:331 同款）；BulkEditor 260px 兜底保留 + be-h-fixed 定高档；
 *    弹性档 usePref 键 bulk.edH / rest.edH / sys.edH 三键在场。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① IndexPicker 退役面 + chip 在场（源码锁） ═══════════ */
const CHIP_VIEWS = [
  'PitScrollView', 'IndexSettingsView', 'IndexOptimizerView',
  'BulkEditorView', 'UpdateByQueryView', 'ConfigValidatorView',
] as const;
const ALL_EIGHT = [...CHIP_VIEWS, 'RestView', 'SystemView'] as const;

describe('五百三十二批：8 视图 IndexPicker 退役面（防回潮）', () => {
  it('8 视图页内 IndexPicker 清零（模板标签与 import 双锚）', () => {
    for (const f of ALL_EIGHT) {
      const s = read(`../views/${f}.vue`);
      expect(s, `${f} 不得再渲染 IndexPicker（选索引入口收敛顶栏）`).not.toMatch(/<IndexPicker/);
      expect(s, `${f} 不得再 import IndexPicker`).not.toMatch(/import IndexPicker from '\.\.\/components\/IndexPicker\.vue'/);
    }
  });

  it('六视图 chip 在场（模板标签 + import）', () => {
    for (const f of CHIP_VIEWS) {
      const s = read(`../views/${f}.vue`);
      expect(s, `${f} 页内必须有 CurrentIdxChip 只读件`).toMatch(/<CurrentIdxChip/);
      expect(s, `${f} 必须 import CurrentIdxChip`).toMatch(/import CurrentIdxChip from '\.\.\/components\/CurrentIdxChip\.vue'/);
    }
  });

  it('写类四视图「用当前索引」回填钮合并 PickCurrentIdxBtn 统一件（558 批改锚；R61 不 follow 口径随注释保留）；IndexSettings 回填钮退役', () => {
    for (const f of ['IndexOptimizerView', 'BulkEditorView', 'UpdateByQueryView', 'ConfigValidatorView']) {
      const s = read(`../views/${f}.vue`);
      expect(s, `${f} 必须消费 PickCurrentIdxBtn 统一件（写类页 target 显式桥）`).toMatch(/<PickCurrentIdxBtn @pick=/);
      expect(s, `${f} 必须 import 统一件`).toMatch(/import PickCurrentIdxBtn from '\.\.\/components\/PickCurrentIdxBtn\.vue'/);
      expect(s, `${f} 内联钮退役（data-test/title/图标归组件内聚）`).not.toMatch(/data-test="use-current-idx"/);
    }
    const isv = read('../views/IndexSettingsView.vue');
    expect(isv, 'chip 即当前索引：IndexSettings 回填钮退役').not.toMatch(/use-current-idx/);
    expect(isv, '就地覆盖函数随钮退役').not.toMatch(/function useCurrentIdx\(\)/);
  });
});

/* ═══════════ ② IndexSettings follow:true + 脏态 guard（源码锁） ═══════════ */
describe('五百三十二批：IndexSettingsView follow 脏态 guard', () => {
  const s = read('../views/IndexSettingsView.vue');

  it('useIdxState 开 follow，guard 锚 diffCount（>0 暂停，保存/重载归零自动恢复）', () => {
    expect(s).toMatch(/const index = useIdxState\(\{ follow: \(\) => diffCount\.value === 0 \}\);/);
  });

  it('「选中即拉取」改 watch(index) 承接（原 @picked 随选择器退役），guard 内跳过', () => {
    expect(s, 'watch(index) 驱动 loadSettings').toMatch(/watch\(index, \(v\) => \{\s*\n\s*if \(!v \|\| diffCount\.value > 0\) return;\s*\n\s*loadSettings\(\);/);
    expect(s, '旧 pickedIdx 补空 watch 退役（follow 接管）').not.toMatch(/watch\(\(\) => store\.pickedIdx/);
  });
});

/* ═══════════ ④ Monaco 塌缩兜底 + 弹性档键（源码锁） ═══════════ */
describe('五百三十二批：Monaco 塌缩兜底（P0 红线）+ 弹性档 usePref 键', () => {
  it('ConfigValidator stacked 档 host min-height:260px（min-height:0 塌缩 0 高退役）', () => {
    const cv = read('../views/ConfigValidatorView.vue');
    expect(cv, 'flex 行 260px 兜底（AnalyzeView:546 范式）').toMatch(/\.cv-card > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 260px; \}/);
    expect(cv, 'min-height:0 裸收缩退役').not.toMatch(/\.cv-card > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 0; \}/);
  });

  it('BulkEditor 四档弹性：full 档 260px 兜底保留，S/M/L 定高档（be-h-fixed）停 flex 拉伸', () => {
    const be = read('../views/BulkEditorView.vue');
    expect(be, 'full 档塌缩兜底保留').toMatch(/\.be-card-editor > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 260px; \}/);
    expect(be, '定高档 flex-basis 让位内联定高').toMatch(/\.be-card-editor\.be-h-fixed > :deep\(\.monaco-host\) \{ flex: 0 0 auto; min-height: 0; \}/);
    expect(be, '高度走 EDITOR_HEIGHTS[editorH] 四档').toMatch(/:height="EDITOR_HEIGHTS\[editorH\]"/);
    expect(be, '四档钮组在场').toMatch(/EDITOR_H_TIERS/);
  });

  it('弹性档三键在场：bulk.edH（usePref）/ rest.edH / sys.edH（558 合并 useTierCycle）', () => {
    expect(read('../views/BulkEditorView.vue')).toMatch(/usePref<EditorHKey>\('bulk\.edH', 'full'\)/);
    /* 五百五十八批同步更新（击穿者：558 工蚁G——rest/sys 两键三件套合并 useTierCycle 单源）：
       usePref 键声明字面改合并接线锚（bulk.edH 未合并仍走 usePref；档值与 100% 兜底零迁） */
    expect(read('../views/RestView.vue')).toMatch(/useTierCycle\('rest\.edH', REST_ED_H_TIERS\)/);
    expect(read('../views/SystemView.vue')).toMatch(/useTierCycle\('sys\.edH', SYS_ED_H_TIERS\)/);
    expect(read('../views/RestView.vue'), 'RestView 100% 档 min-height 兜底保留').toMatch(/\.rt-body-wrap > \.rt-body-ed \{ min-height: max\(180px, 42vh\); \}/);
  });
});

/* ═══════════ ③ PitScrollView 卸载停循环（行为用例） ═══════════ */

/* ── 挂载 mock 面（histEntry528 同款骨架：NModal stub + Monaco stub + api 挡真实 fetch）── */
const pitOpenFn = vi.fn(async (..._a: any[]) => ({ id: 'pit-1' }));
const pitCloseFn = vi.fn(async (..._a: any[]) => ({}));
const pitSearchFn = vi.fn(async (..._a: any[]) => ({
  hits: { hits: [{ _id: 'x' + pitSearchFn.mock.calls.length, _source: { k: 1 }, sort: [pitSearchFn.mock.calls.length] }], total: { value: 0, relation: 'gte' } },
  pit_id: 'pit-1',
}));

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    api: {
      ...orig.api,
      pitOpen: (...a: any[]) => pitOpenFn(...a),
      pitClose: (...a: any[]) => pitCloseFn(...a),
      pitSearch: (...a: any[]) => pitSearchFn(...a),
      /* 防御性 stub 挡真实 fetch 噪音（FieldPicker/字段类型/模板清单/store 初始化） */
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...orig.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return { ...actual, NModal: { name: 'NModal', props: ['show'], template: '<div v-if="show"><slot /></div>' } };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub" :data-height="height"></div>',
  },
}));

/* 六百四十八批（G'4，先例 647-C3 ③ 落地）：视图动态 import 上提出 it 计时预算。实测该行为
   用例静默机独跑 4387ms（5s 默认阈贴线），大头是 it 内首触 PitScrollView 视图图（naive-ui
   实模块经 importOriginal）的 transform——负载窗口即越 5s 恒超时（647 三连复演）。上提到
   文件收集期执行：vi.mock 已提升 mock 面不变；本行置于三 pit mock const 与全部 vi.mock
   声明之后（工厂闭包引用 pitOpenFn 等，先初始化后触发，无 TDZ 风险）；it 内只剩 real-timer
   等待链 ~200ms。语义零变：挂载/断言时序原样。 */
const PitScrollView = (await import('../views/PitScrollView.vue')).default;

async function settle(n = 8) {
  const { nextTick } = await import('vue');
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function mountView(comp: any, opts: { hash?: string } = {}) {
  location.hash = opts.hash || '#/';
  const { createApp, h } = await import('vue');
  const { createPinia, setActivePinia } = await import('pinia');
  const { useAppStore } = await import('../stores/app');
  const { createRouter, createMemoryHistory } = await import('vue-router');
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAppStore();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp) });
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  app.mount(host);
  await settle();
  await wait(30);
  await settle();
  return { host, store, unmount: () => app.unmount() };
}

function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').trim().startsWith(text));
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  pitOpenFn.mockClear();
  pitCloseFn.mockClear();
  pitSearchFn.mockClear();
});
afterEach(() => { document.body.innerHTML = ''; });

describe('五百三十二批：PitScrollView 卸载停拉取循环（行为）', () => {
  it('开 PIT → 拉取循环在跑 → 卸载：pitClose 必调，且 pitSearch 在卸载后停止（in-flight 最多 +1）', async () => {
    /* 五百七十七批同步更新：mountView 内部 location.hash = opts.hash || '#/' 会覆盖前置赋值——
       旧写法先 set hash 再裸调 mountView，深链 ?idx= 被抹成 '#/'，pickedIdx 永不就位（chip
       恒不渲染）。深链改走 mountView opts.hash 通道（与该 helper 其余用例同款）。 */
    const { host, unmount } = await mountView(PitScrollView, { hash: '#/?idx=logs-1' });
    expect(host.querySelector('.pt-lb .cic-nm')?.textContent, 'chip 在场回显当前索引').toBe('logs-1');

    textBtn(host, '开 PIT')!.click();
    await settle();
    await wait(20);
    await settle();
    expect(pitOpenFn, '深链 idx 就位后可开 PIT').toHaveBeenCalledTimes(1);

    textBtn(host, '开始拉取')!.click();
    await settle();
    await wait(40);
    const before = pitSearchFn.mock.calls.length;
    expect(before, '拉取循环确在发 pitSearch').toBeGreaterThan(0);

    unmount();
    await wait(60);
    const after = pitSearchFn.mock.calls.length;
    expect(pitCloseFn, '卸载即关 PIT').toHaveBeenCalledWith('pit-1');
    expect(after - before, '卸载后循环必须停（in-flight 请求最多再 +1）').toBeLessThanOrEqual(1);
  }, 8000); /* 六百四十八批 G'4：单点放宽（先例 647-C3 ③ 约定 6000~8000 档取顶）——real-timer
               行为锁在负载窗口的保险带，与 import 上提双保险；禁全局调大 testTimeout
               （会掩盖真挂死），仅此用例生效。 */
});
