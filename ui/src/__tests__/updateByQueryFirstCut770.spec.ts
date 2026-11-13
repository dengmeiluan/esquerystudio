/**
 * 七百七十批：UpdateByQuery 首刀轮（R150；⑥769 头号建议落地=R149 裁决表
 * G241+G242+G243 首刀候选+G244 随批可裁；741 G148/743 G152/745/747/749/751/753/
 * 755/757/760/762/764/766/768 首刀族同构；UpdateByQuery 域首例真挂载首刀后
 * spec——progressLink557 同源挂载/mock 形态：视图/组件全真，只 mock ../api 出口+
 * askConfirm 边界+MonacoEditor stub+memory router）。
 *
 * ① G241（P3 铁律 D·头名）预估影响文档数钮仅 :disabled=estimating 无 Loader2
 *    spinning 无「预估中…」在途文案（769 S-G2 实锚 dis=true/spin=false/tx 恒；
 *    768 G238/766 G234/753 G190 族）——修法=Loader2 v-if estimating + Search
 *    v-else 双态+「预估中…」在途文案（MatchMatrix 766 G234 逐字同款）。
 * ② G243（P3 铁律 F·次刀）八字段 label（索引/max_docs/conflicts/slices/
 *    wait_for_completion/requests_per_second/refresh/scroll）无 :title 中文悬停
 *    释义（769 S-G4 实锚 title 全 null；option/placeholder 部分覆盖=弱合规；
 *    G191/G183/561 五参数同族）——修法=label title 静态中文释义（ReindexAdvanced
 *    745 G159「参数名：中文说明——细节」形态，label 文本不动英文留检索）。
 * ③ G242（弱 P3 aria·随批可裁）.uq-mode 无 role=group/aria-label+双模式钮无
 *    aria-pressed（769 S-G3 实锚全 null；G158/G164/G192/G224/G235 族）——修法=
 *    role=group+aria-label+双钮 :aria-pressed（QueryXray qx-tabs 753 G192 同款）。
 * ④ G244（观察·随批可裁）查进度钮 progressLoading 仅 disabled 无在途文案切换
 *    （行内 role=status「进度查询中…」在场=半合规）——修法=纯文本钮走文案通道
 *    （G81 口径，749 G171/755 G198/760 G213 族）「查进度中…」切换+行内 status 不动。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftStorageKey } from '../composables/useScopedDraft';

const src = readFileSync(join(__dirname, '../views/UpdateByQueryView.vue'), 'utf-8');

/* ---- 网络出口 mock：只换被测链路，视图/组件全真（progressLink557 同款） ---- */
const searchDslFn = vi.fn();
const updateByQueryFn = vi.fn();
const progressFn = vi.fn();
const askConfirmFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchDsl: (...args: any[]) => searchDslFn(...args),
      updateByQuery: (...args: any[]) => updateByQueryFn(...args),
      deleteByQuery: (...args: any[]) => Promise.resolve({ taskId: 'job-dq-x', deleted: 1 }),
      progress: (...args: any[]) => progressFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 挂载链路防御性 stub，挡真实 fetch 噪音（progressLink557 同款） */
      keys: () => Promise.resolve([]),
      clustersList: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({ body: { version: { number: '8.11.0' } } }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

vi.mock('../composables/confirm', () => ({
  askConfirm: (...args: any[]) => askConfirmFn(...args),
}));

/* JsonArea 内核 Monaco——happy-dom 不可用统一 stub（progressLink557 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import UpdateByQueryView from '../views/UpdateByQueryView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* UBQ 预置（progressLink557 逐字承）：?idx= 进 hash、query 进 sessionStorage 草稿 */
const UBQ_HASH = '#/update-by-query?idx=logs-*';
const UBQ_DRAFT_KEY = draftStorageKey({ route: 'update-by-query', index: () => 'logs-*' }, 'query');

async function mountUq() {
  location.hash = UBQ_HASH;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(UpdateByQueryView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

function findBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes(text));
}
/* 768-① 课（busy 文案切换钮探针锚双态）spec 侧同构：预估钮用「预估」子串一锚双态 */
const estBtn = (host: HTMLElement) => findBtn(host, '预估');

const FIELDS = ['索引（支持 pattern，如 logs-* / a,b,c）', 'max_docs（可选上限）', 'conflicts', 'slices（并行分片）',
  'wait_for_completion', 'requests_per_second（限流）', 'refresh', 'scroll'];
/* G243 释义关键词（title 必含的中文语义锚） */
const TIP_KEYS: Record<string, string> = {
  '索引': '通配', 'max_docs': '上限', 'conflicts': '冲突', 'slices': '并行',
  'wait_for_completion': '异步', 'requests_per_second': '限流', 'refresh': '刷新', 'scroll': '窗口',
};

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem(UBQ_DRAFT_KEY, '{ "match_all": {} }');
  askConfirmFn.mockReset().mockResolvedValue(true);
  searchDslFn.mockReset().mockResolvedValue({ hits: { total: { value: 1234, relation: 'eq' }, hits: [] } });
  updateByQueryFn.mockReset().mockResolvedValue({ taskId: 'job-uq-770', updated: 3 });
  progressFn.mockReset().mockResolvedValue({ status: 'RUNNING', total: 20, created: 7 });
});

describe('770 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头双模式钮+八字段 label+模板四钮+收藏/清空+预估/执行+Painless 区在场', async () => {
    const { app, host } = await mountUq();
    expect(findBtn(host, 'update_by_query'), 'update 模式钮').toBeTruthy();
    expect(findBtn(host, 'delete_by_query'), 'delete 模式钮').toBeTruthy();
    const fields = [...host.querySelectorAll('.uq-field label')].map(l => (l.textContent || '').trim());
    expect(FIELDS.filter(f => !fields.includes(f)), '八字段全在场').toEqual([]);
    const tplBtns = [...host.querySelectorAll('.uq-card-hd-r button')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim());
    expect(tplBtns.some(t => t.includes('match_all'))).toBe(true);
    expect(tplBtns.some(t => t.includes('term'))).toBe(true);
    expect(tplBtns.some(t => t.includes('range'))).toBe(true);
    expect(tplBtns.some(t => t.includes('bool'))).toBe(true);
    expect(tplBtns.some(t => t.includes('收藏'))).toBe(true);
    expect(tplBtns.some(t => t.includes('清空'))).toBe(true);
    expect(estBtn(host), '预估钮').toBeTruthy();
    expect(findBtn(host, '执行'), '执行钮').toBeTruthy();
    expect((host.textContent || '').includes('Painless Script'), 'Painless 区').toBe(true);
    app.unmount();
  });
});

describe('770 G241 预估钮在途双态（铁律 D·头名·768 G238/766 G234/753 G190 spinning+在途文案族）', () => {
  it('挂载实锚：estimating→钮「预估中…」+Loader2 spinning+disabled+Search 让位；完成复常+千分位单发', async () => {
    let resolveEst!: (v: any) => void;
    searchDslFn.mockImplementation(() => new Promise(res => { resolveEst = res; }));
    const { app, host } = await mountUq();
    const btn = estBtn(host)!;
    expect(btn.disabled, '常态可点').toBe(false);
    expect(btn.textContent, '常态文案').toContain('预估影响文档数');
    btn.click();
    await settle(6);
    expect(btn.disabled, '在途窗禁用').toBe(true);
    expect(btn.textContent, '在途文案').toContain('预估中');
    expect(btn.querySelector('.spinning'), 'Loader2 spinning 图标在场').toBeTruthy();
    /* 766 探针课（lucide 类名 -icon 后缀）：图标类断言用 class*= 包含形态 */
    expect(btn.querySelector('[class*="lucide-search"]'), 'busy 期 Search 静态图标让位').toBe(null);
    resolveEst({ hits: { total: { value: 1234, relation: 'eq' }, hits: [] } });
    await settle(10);
    expect(btn.disabled, '完成复常解禁').toBe(false);
    expect(btn.textContent, '复常文案').toContain('预估影响文档数');
    expect(btn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    expect(btn.querySelector('[class*="lucide-search"]'), 'Search 图标复位').toBeTruthy();
    expect(searchDslFn, '单发（无重复触发）').toHaveBeenCalledTimes(1);
    expect((host.textContent || ''), '千分位结果在场').toContain('1,234');
    expect((host.textContent || ''), '「文档匹配」文案在场').toContain('文档匹配');
    app.unmount();
  });
  it('源码锁：预估钮双态（Loader2/Search 互换+在途文案）', () => {
    expect(src, '预估钮双态刀面')
      .toMatch(/<Loader2 v-if="estimating" :size="12" class="spinning" \/><Search v-else :size="12" \/> \{\{ estimating \? '预估中…' : '预估影响文档数' \}\}/);
  });
});

describe('770 G243 八字段 label :title 中文悬停释义（铁律 F·次刀·G191/G183/561 五参数族）', () => {
  it('挂载实锚：八字段 label title 全非空+各含中文语义关键词', async () => {
    const { app, host } = await mountUq();
    const labels = [...host.querySelectorAll('.uq-field label')] as HTMLLabelElement[];
    expect(labels.length, '八字段（双 sec 布局）').toBe(8);
    const misses: string[] = [];
    for (const l of labels) {
      const tx = (l.textContent || '').trim();
      const title = l.getAttribute('title') || '';
      const key = Object.keys(TIP_KEYS).find(k => tx.startsWith(k));
      if (!key) { misses.push(`无关键词映射:${tx}`); continue; }
      if (!title) misses.push(`${tx}:title 空`);
      else if (!title.includes(TIP_KEYS[key])) misses.push(`${tx}:缺「${TIP_KEYS[key]}」`);
    }
    expect(misses, '八字段释义缺口').toEqual([]);
    app.unmount();
  });
  it('源码锁：八字段 title 各含参数名+中文释义（label 文本不动英文留检索）', () => {
    const locks: [RegExp, string][] = [
      [/<label title="索引：[^"]*通配[^"]*">索引（支持 pattern，如 logs-\* \/ a,b,c）<\/label>/, '索引'],
      [/<label title="max_docs：[^"]*上限[^"]*">max_docs（可选上限）<\/label>/, 'max_docs'],
      [/<label title="conflicts：[^"]*冲突[^"]*">conflicts<\/label>/, 'conflicts'],
      [/<label title="slices：[^"]*并行[^"]*">slices（并行分片）<\/label>/, 'slices'],
      [/<label title="wait_for_completion：[^"]*异步[^"]*">wait_for_completion<\/label>/, 'wait_for_completion'],
      [/<label title="requests_per_second：[^"]*限流[^"]*">requests_per_second（限流）<\/label>/, 'requests_per_second'],
      [/<label title="refresh：[^"]*刷新[^"]*">refresh<\/label>/, 'refresh'],
      [/<label title="scroll：[^"]*窗口[^"]*">scroll<\/label>/, 'scroll'],
    ];
    for (const [re, name] of locks) expect(src, `${name} label title 中文释义`).toMatch(re);
  });
});

describe('770 G242 模式组 aria（弱 P3·随批可裁·G158/G164/G192/G224/G235 族）', () => {
  it('挂载实锚：.uq-mode role=group+aria-label；双模式钮 aria-pressed 精确翻转', async () => {
    const { app, host } = await mountUq();
    const grp = host.querySelector('.uq-mode')!;
    expect(grp, '.uq-mode 在场').toBeTruthy();
    expect(grp.getAttribute('role')).toBe('group');
    expect(grp.getAttribute('aria-label') || '').toContain('模式');
    const upd = findBtn(host, 'update_by_query')!;
    const del = findBtn(host, 'delete_by_query')!;
    expect(upd.getAttribute('aria-pressed'), 'update 默认选中').toBe('true');
    expect(del.getAttribute('aria-pressed'), 'delete 默认未选').toBe('false');
    del.click();
    await settle(4);
    expect(upd.getAttribute('aria-pressed'), '切 delete 后 update 翻 false').toBe('false');
    expect(del.getAttribute('aria-pressed'), '切 delete 后 delete 翻 true').toBe('true');
    app.unmount();
  });
  it('源码锁：role=group+aria-label+双钮 :aria-pressed', () => {
    expect(src).toMatch(/<div class="uq-mode" role="group" aria-label="[^"]*模式[^"]*">/);
    expect(src).toMatch(/:aria-pressed="mode === 'update'"/);
    expect(src).toMatch(/:aria-pressed="mode === 'delete'"/);
  });
});

describe('770 G244 查进度钮在途文案通道（观察·随批可裁·G81 纯文本钮口径；行内 role=status 不动）', () => {
  it('挂载实锚：提交→查进度在途窗钮「查进度中…」+disabled；复常「查进度」+进行中计数', async () => {
    let resolveProg!: (v: any) => void;
    progressFn.mockImplementation(() => new Promise(res => { resolveProg = res; }));
    const { app, host } = await mountUq();
    findBtn(host, '执行')!.click();
    await settle(10);
    const btn = host.querySelector<HTMLButtonElement>('[data-test="ubq-progress"]');
    expect(btn, '结果卡查进度钮在场').toBeTruthy();
    expect((host.textContent || '').includes('job-uq-770'), 'taskId 出场').toBe(true);
    btn!.click();
    await settle(6);
    expect(btn!.disabled, '在途窗禁用').toBe(true);
    expect(btn!.textContent, '在途文案切换').toContain('查进度中');
    resolveProg({ status: 'RUNNING', total: 20, created: 7 });
    await settle(10);
    expect(btn!.disabled, '复常解禁').toBe(false);
    expect(btn!.textContent, '复常文案').toContain('查进度');
    expect((host.textContent || ''), '行内进行中计数（role=status 通道不动）').toContain('进行中 7/20');
    app.unmount();
  });
  it('源码锁：查进度钮文案双态+行内 status 三态文案不动', () => {
    expect(src).toMatch(/\{\{ progressLoading \? '查进度中…' : '查进度' \}\}/);
    expect(src).toMatch(/progressLoading \? '进度查询中…' : progressText/);
  });
});
