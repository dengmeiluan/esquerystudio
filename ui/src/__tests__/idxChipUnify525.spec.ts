/**
 * 五百二十五批 W2：follow 档视图页内「选索引」入口收敛 TopBar——六视图改用只读 CurrentIdxChip
 * + ProfileFlameView 本地目标态语义修 + indexOptions 死代码删除 + 同文件顺手件。
 *
 * ① 改用源码锁（六视图）：页内 IndexPicker 退役换 <CurrentIdxChip />（MappingDesigner/Lucene/
 *    Ilm/ReindexPreview/DiffEditor 主选/SearchSandbox）；useIdxState follow 绑定零改
 *    （DiffEditor 对比位 idxB 的 IndexPicker 原样保留）；SearchSandbox「留空=全集群」语义
 *    保留（chip 只在选中时渲染，空态照旧走 _all）；Lucene 未选索引出 DslQueryView 同款空态。
 * ② ProfileFlameView 语义修（真 bug）：allow-wildcard + useIdxState({follow:true}) 组合会把
 *    页内通配符输入经 watch 上行 store.pick 污染全局（顶栏回显裸串/recentIdx 存脏值）——
 *    改 useUrlState('idx') 本地目标态：不 follow 不上行，pickedIdx 仅挂载时一次性单向回填。
 *    行为锁：输入通配符后 store.pickedIdx 不变（防回归主断言）。
 * ③ indexOptions 死代码删除：utils/indexOptions.ts 与其 spec 已删（IndexOptionRow 同源承担），
 *    AnalyzeView 无代码引用（524 批已迁，负向锁看守）。
 * ④ 顺手件源码锁：Lucene JSON 视图 _score 换 fmtScore 语义；SearchSandbox「在构建器中打开」
 *    桥（?dsl= 入站契约 DslQueryView onMounted 消费）+ 引导空态三件套 + 手写 ss-took sep 退役；
 *    Ilm 策略弹窗 JsonArea 视口档 min(60vh,358px) + 去 .meta-strip 双轨只留 .mono；
 *    MappingDesigner 两处空态补 actionText。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

const mdv = read('../views/MappingDesignerView.vue');
const lcv = read('../views/LuceneQueryView.vue');
const ssv = read('../views/SearchSandboxView.vue');
const ilm = read('../views/IlmView.vue');
const rpv = read('../views/ReindexPreviewView.vue');
const dfv = read('../views/DiffEditorView.vue');
const pfv = read('../views/ProfileFlameView.vue');

/* ═══════════ ① 六视图改用源码锁 ═══════════ */
describe('六视图页内选择器退役换 CurrentIdxChip（525 批源码锁）', () => {
  it.each([
    ['MappingDesignerView', mdv],
    ['LuceneQueryView', lcv],
    ['SearchSandboxView', ssv],
    ['IlmView', ilm],
    ['ReindexPreviewView', rpv],
  ])('%s：挂 CurrentIdxChip，页内 IndexPicker 清零，useIdxState follow 绑定零改', (name, src) => {
    expect(src, `${name} 必须挂只读 chip`).toContain('<CurrentIdxChip />');
    expect(src, `${name} 页内不再有可写索引选择器`).not.toContain('<IndexPicker');
    expect(src, `${name} follow 绑定不许顺手改（架构裁决：只换 UI 不动状态语义）`)
      .toMatch(/useIdxState\(\{ follow: true \}\)/);
  });

  it('DiffEditorView：主选换 chip，对比位 idxB 的 IndexPicker 原样保留', () => {
    expect(dfv).toContain('<CurrentIdxChip />');
    expect(dfv, '对比目标非「当前工作索引」语义，IndexPicker 保留').toContain('<IndexPicker v-model="idxB"');
  });

  it('SearchSandbox「留空=全集群」语义保留：chip 条件渲染 + indexName 空串走 _all 不回归', () => {
    expect(ssv).toMatch(/indexName\.value\.trim\(\) \|\| '_all'/);
    expect(ssv).toMatch(/indexName\.value \|\| undefined/);
  });

  it('Lucene 未选索引空态对齐 DslQueryView 范式（先在顶栏选择一个索引）', () => {
    expect(lcv).toContain('<EmptyState v-else-if="!index" compact :icon="SearchCode" text="先在顶栏选择一个索引" />');
  });
});

/* ═══════════ ② ProfileFlameView 本地目标态 ═══════════ */
describe('ProfileFlameView 本地目标态语义修（525 批）', () => {
  it('源码锁：不再 import useIdxState（不上行不 follow），IndexPicker allow-wildcard 保留', () => {
    /* 注释里的承接说明不算回潮，锁 import 声明形态本身 */
    expect(pfv, '通配符目标态不许再经 useIdxState 上行全局')
      .not.toMatch(/import \{[^}]*useIdxState[^}]*\} from '\.\.\/composables\/urlState'/);
    expect(pfv).toMatch(/const index = useUrlState\('idx'\)/);
    expect(pfv, '页内通配输入口保留').toMatch(/<IndexPicker v-model="index" placeholder="索引名（可含通配符）" allow-wildcard \/>/);
    expect(pfv, '挂载一次性单向回填 pickedIdx 初值保留').toMatch(/if \(!index\.value\) index\.value = store\.pickedIdx \|\| ''/);
  });
});

describe('ProfileFlameView 输入通配符不污染全局 pickedIdx（525 批行为锁）', () => {
  const mocks = vi.hoisted(() => ({ monacoSetup: vi.fn() }));
  vi.mock('../components/MonacoEditor.vue', () => ({
    default: {
      name: 'MonacoEditor',
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute', 'keydown'],
      setup: mocks.monacoSetup as any,
      template: '<div class="monaco-stub"></div>',
    },
  }));
  vi.mock('../api', async (importOriginal) => {
    const orig = await importOriginal<any>();
    return {
      ...orig,
      api: {
        ...orig.api,
        /* 挂载零网络预期——防御性挡真实 fetch 噪音（IndexPicker 展开/store 链路） */
        searchDsl: () => Promise.resolve({}),
        mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      },
    };
  });

  async function settle(n = 8) {
    const { nextTick } = await import('vue');
    for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
  }
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function mountView(hash: string) {
    location.hash = hash;
    const { createApp, h } = await import('vue');
    const { createPinia, setActivePinia } = await import('pinia');
    const { useAppStore } = await import('../stores/app');
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div/>' } }],
    });
    await router.push('/');
    await router.isReady();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const View = (await import('../views/ProfileFlameView.vue')).default;
    const app = createApp({ render: () => h(View as any) });
    app.use(pinia);
    app.use(router);
    app.config.warnHandler = () => {};
    app.mount(host);
    await settle();
    await wait(30);
    await settle();
    return { host, store, unmount: () => app.unmount() };
  }

  function setInput(el: HTMLInputElement, v: string) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    location.hash = '#/';
    localStorage.clear();
    sessionStorage.clear();
  });

  it('pickedIdx 在场 → 挂载回填初值；输入通配符 logs-* 后 store.pickedIdx 不变（主断言）', async () => {
    localStorage.setItem('es_picked', 'global_work_idx');
    const w = await mountView('#/profile-flame');
    const inp = () => w.host.querySelector<HTMLInputElement>('.pf-inputs .ixp-inp')!;
    expect(inp().value, '挂载一次性单向回填 pickedIdx').toBe('global_work_idx');
    setInput(inp(), 'logs-*');
    await settle();
    await wait(20);
    expect(w.store.pickedIdx, '通配符输入不许上行污染全局工作索引').toBe('global_work_idx');
    expect(inp().value).toBe('logs-*');
    expect(location.hash, '本地目标态照旧进 URL（刷新/分享可复原）').toContain('idx=logs-*');
    w.unmount();
  });

  it('深链 ?idx=logs-* 打开 → 页内回填但 pickedIdx 保持全局选中（旧 useIdxState 会 store.pick 污染）', async () => {
    localStorage.setItem('es_picked', 'global_work_idx');
    const w = await mountView('#/profile-flame?idx=logs-*');
    await wait(20);
    expect(w.host.querySelector<HTMLInputElement>('.pf-inputs .ixp-inp')?.value).toBe('logs-*');
    expect(w.store.pickedIdx, '通配深链不再上行顶栏').toBe('global_work_idx');
    w.unmount();
  });
});

/* ═══════════ ③ indexOptions 死代码删除 ═══════════ */
describe('indexOptions 死代码删除（525 批）', () => {
  it('utils/indexOptions.ts 与其 spec 已删', () => {
    expect(existsSync(join(__dirname, '../utils/indexOptions.ts')), '实现文件已删').toBe(false);
    expect(existsSync(join(__dirname, '../utils/__tests__/indexOptions.spec.ts')), 'spec 已删').toBe(false);
  });
  it('AnalyzeView 无代码引用（524 批已迁 IndexOptionRow，负向锁看守）；注释残留由 AnalyzeView 责任批清理', () => {
    const av = read('../views/AnalyzeView.vue');
    expect(av).not.toMatch(/from '\.\.\/utils\/indexOptions'/);
  });
});

/* ═══════════ ④ 顺手件源码锁 ═══════════ */
describe('525 批顺手件', () => {
  it('Lucene JSON 视图 _score 换 fmtScore 语义（4 位小数/缺分-），裸 toFixed 退役', () => {
    expect(lcv).toContain('{{ fmtScore(h._score) }}');
    expect(lcv, '裸 toFixed 退役（0 分 falsy 短路成 - 的口径纠正）').not.toMatch(/_score\?\.\toFixed/);
    expect(lcv).toMatch(/function fmtScore\(s: any\): string \{\n {2}if \(s == null \|\| s === ''\) return '-';\n {2}const n = Number\(s\);\n {2}return isFinite\(n\) \? n\.toFixed\(4\) : String\(s\);\n\}/);
  });

  it('SearchSandbox「在构建器中打开」桥：?dsl= encodeDslParam + mode=dsl（DslQueryView 入站契约存在）', () => {
    expect(ssv).toContain("import { encodeDslParam } from '../utils/queryHub';");
    expect(ssv).toMatch(/function openInBuilder\(\)/);
    expect(ssv).toMatch(/path: '\/search',\s*\n\s*query: \{\s*\n\s*mode: 'dsl',/);
    expect(ssv).toMatch(/dsl: encodeDslParam\(dslBody\.value\)/);
    expect(ssv).toMatch(/<ListTree :size="11" \/> 在构建器中打开/);
  });

  it('SearchSandbox 引导空态三件套 + 手写 ss-took sep/包装退役', () => {
    expect(ssv).toMatch(/text="左侧编写 DSL 后 Ctrl\+Enter 执行"\s*\n\s*hint=/);
    expect(ssv).toMatch(/action-text="填入示例 DSL" @action="reset"/);
    /* 锁声明形态本身（注释里的承接说明不算回潮）：模板手写段与三条 scoped 规则均清 */
    expect(ssv).not.toMatch(/\.ss-took-(sep|i) \{|\.ss-took-i i \{/);
    expect(ssv).not.toMatch(/class="ss-took-(sep|i)/);
    expect(ssv, '插槽段挂组件同名形态类').toContain('<span class="ms-i ms-t"><i>took</i> <TookBadge :ms="took" /></span>');
  });

  it('Ilm 策略弹窗 JsonArea 视口档 min(60vh,358px) + 去 .meta-strip 双轨只留 .mono', () => {
    expect(ilm).toMatch(/class="ilm-policy-ja"[\s\S]{0,120}:rows="18"/);
    expect(ilm).toMatch(/\.ilm-policy-ja :deep\(\.monaco-host\) \{ height: min\(60vh, 358px\) !important; \}/);
    expect(ilm).toMatch(/<MetaStrip class="ilm-meta" :items="ilmMeta"/); /* 五百三十五批锚同步更新：.mono 摘除（组件 .ms 自带 mono 字族） */
    expect(ilm, '全局 .meta-strip 类退役').not.toMatch(/class="[^"]*meta-strip/);
  });

  it('MappingDesigner 过滤致空/未加载空态补 actionText（接现成 doLoad）', () => {
    expect(mdv).toMatch(/text="索引无字段或不存在 · 检查 index 名称后重新「加载」" action-text="重新加载" @action="doLoad"/);
    expect(mdv).toMatch(/text="未加载 · 输入 index 并点击「加载」" action-text="立即加载" @action="doLoad"/);
  });
});
