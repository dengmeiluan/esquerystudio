/**
 * W2 Task 7b：LuceneInput 三段补全行为契约（TDD 先行，组件不存在时全红）。
 *
 * 硬契约 7 条：
 *   ① 输入 sta → 弹层出 status 字段项（类型徽标 keyword）；
 *   ② Enter / 点击回填 status；
 *   ③ 输入 status: → 值段弹 terms 建议（mock buckets，searchRaw 出口）；
 *   ④ date 类型字段值段出格式提示 now-1d/d；
 *   ⑤ mapping 失败 → 弹层 err 提示+「重试」，可继续手输（零降级）；
 *   ⑥ Esc 关层不丢文本；
 *   ⑦ 弹层不抢焦点（输入流不断）。
 * 增补：phrase 段不出层 / op 段 AND/OR/NOT 整词（选择替换前缀）/ numeric 格式提示 /
 *   to=false 就地模式 / Enter 透发三态（面板关透发、有候选不透发、无候选收层透发）/
 *   中段光标回填=替换段前缀且光标置段尾。
 *
 * mount 范式与 fieldPicker.spec.ts 一致（手工 createApp+h+createPinia，apps 收集 +
 * afterEach 兜底 unmount）；只 mock ../api 出口（mappingDetail/searchRaw，vi.fn 惰性包装防 TDZ）。
 * 弹层默认 Teleport 到 body：统一查 document.body；to=false 时查组件根。
 * 光标：happy-dom 程序赋值 value 后 selectionStart 自动置尾，直接赋值/setSelectionRange 均可用（已探针验证）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的 */
const mappingDetailFn = vi.fn();
const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      searchRaw: (...a: any[]) => searchRawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音 */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import LuceneInput from '../components/LuceneInput.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
  /* date 字段名避开 'sta' 子串（否则 field 段 sta 过滤出两项，污染①②⑪断言） */
  created_at: { type: 'date' },
} } };
const TERMS = { aggregations: { suggest: { buckets: [{ key: 'active' }, { key: 'closed' }] } } };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* teardown 兜底：所有 mount 的 app 收集于此，afterEach 统一 unmount（同 fieldPicker.spec 范式） */
const apps: ReturnType<typeof createApp>[] = [];

async function mountInput(init: { modelValue?: string; index?: string; to?: string | false } = {}) {
  const state = reactive({
    modelValue: init.modelValue ?? '',
    index: init.index ?? 'logs-2026.08',
  });
  const entered: number[] = [];
  const pinia = createPinia();
  /* 防御性保留：防 store 未来路由依赖（同 fieldPicker.spec 范式） */
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h(LuceneInput, {
      modelValue: state.modelValue,
      index: state.index,
      ...(init.to !== undefined ? { to: init.to } : {}),
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
      onEnter: () => entered.push(1),
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, state, entered };
}

/* 弹层 Teleport 到 body：统一在这里查 */
const pop = () => document.body.querySelector('.li-pop');
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.li-item'));
const itemTexts = () => Array.from(document.body.querySelectorAll('.li-item .li-name')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.li-inp')!;
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v; /* happy-dom：程序赋值后 selectionStart 自动置尾 */
  el.dispatchEvent(new Event('input'));
  await settle();
}
/* 指定光标本版：中段编辑场景（赋值后手动定位再派发 input） */
async function typeAt(host: ParentNode, v: string, cursor: number) {
  const el = inp(host);
  el.value = v;
  el.selectionStart = cursor;
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(host: ParentNode, k: string) {
  inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  await settle();
}
/* 弹层关闭走 <transition> 离场：断言「已关闭」前补一帧（同 fieldPicker.spec 的 flushLeave） */
async function flushLeave() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  await settle(3);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  __clearSuggestCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  searchRawFn.mockReset().mockResolvedValue(TERMS);
});

afterEach(() => {
  vi.useRealTimers();
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('LuceneInput 三段补全', () => {
  it('① field 段：输入 sta → 弹层出 status 字段项（类型徽标 keyword），mapping 只拉一次且不发 terms 请求', async () => {
    const { host } = await mountInput();
    expect(mappingDetailFn, '未输入不许预拉').not.toHaveBeenCalled();
    await type(host, 'sta');
    expect(pop(), '输入后必须出层').toBeTruthy();
    expect(itemTexts()).toEqual(['status']);
    const badge = pop()!.querySelector('.li-item .li-type');
    expect(badge, '字段项必须带类型徽标').toBeTruthy();
    expect(badge!.getAttribute('data-t')).toBe('keyword');
    expect(badge!.textContent).toBe('keyword');
    expect(mappingDetailFn, 'field 段拉一次字段清单').toHaveBeenCalledTimes(1);
    expect(searchRawFn, 'field 段不许发 terms 请求').not.toHaveBeenCalled();
  });

  it('② Enter 回填 status：替换段前缀，面板关闭，不透发 enter，光标置段尾', async () => {
    const { host, state, entered } = await mountInput();
    await type(host, 'sta');
    expect(itemTexts()).toEqual(['status']);
    await key(host, 'Enter');
    expect(state.modelValue).toBe('status');
    expect(entered, '有候选 Enter 走 choose，不透发 enter').toEqual([]);
    expect(inp(host).selectionStart, '补全后光标置段尾').toBe(6);
    await flushLeave();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  it('② 点击回填 status（鼠标路径等价 Enter）', async () => {
    const { host, state } = await mountInput();
    await type(host, 'sta');
    items()[0].click();
    await settle();
    expect(state.modelValue).toBe('status');
    await flushLeave();
    expect(pop(), '点击选择后面板必须关闭').toBeNull();
  });

  it('③ value 段 keyword：status: → 防抖后弹 terms 建议（searchRaw 出口），Enter 回填替换值前缀', async () => {
    const { host, state } = await mountInput();
    vi.useFakeTimers();
    await type(host, 'status:');
    /* 防抖 300ms 未过：suggestions 未到位，不出空层 */
    expect(searchRawFn, '防抖期内不许发请求').not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(searchRawFn.mock.calls[0][0]).toBe('logs-2026.08');
    const body = JSON.parse(searchRawFn.mock.calls[0][1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(body.aggs.suggest.terms.include, '空前缀省略 include（top 20 by doc_count）').toBeUndefined();
    expect(itemTexts(), 'terms buckets 必须出层').toEqual(['active', 'closed']);
    /* 继续输入前缀：本地 startsWith 过滤实时收窄，防抖后服务端 include 收口 */
    await type(host, 'status:ac');
    expect(itemTexts(), '旧建议按当前前缀本地过滤').toEqual(['active']);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    const body2 = JSON.parse(searchRawFn.mock.calls[1][1]);
    expect(body2.aggs.suggest.terms.include).toBe('ac.*');
    /* 关层断言前切回真实定时器：transition 离场探测 rAF 在 fake 期注册会挂起 */
    vi.useRealTimers();
    await key(host, 'Enter');
    expect(state.modelValue, '回填=替换值段前缀').toBe('status:active');
    await flushLeave();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  it('④ date 类型字段值段：created_at: → 静态格式提示含 now-1d/d（不发 terms 请求）', async () => {
    const { host } = await mountInput();
    await type(host, 'created_at:');
    expect(pop(), 'date 值段必须出层').toBeTruthy();
    expect(itemTexts()).toEqual(['now-1h/h', 'now-1d/d', '>=2026-08-01']);
    expect(searchRawFn, 'date 段不发 terms 请求').not.toHaveBeenCalled();
  });

  it('⑤ mapping 失败：err 行提示+重试按钮；可继续手输（零降级）；重试恢复出列表', async () => {
    mappingDetailFn.mockRejectedValueOnce(new Error('connect refused'));
    const { host, state, entered } = await mountInput();
    await type(host, 'sta');
    const hintEl = pop()!.querySelector('.li-hint');
    expect(hintEl, '失败必须出 err 提示行').toBeTruthy();
    expect(hintEl!.textContent).toContain('字段清单加载失败');
    expect(hintEl!.textContent).toContain('connect refused');
    expect(hintEl!.textContent).toContain('仍可手输');
    expect(items().length, '失败不许伪装列表').toBe(0);
    /* 零降级：继续手输，Enter 收层保留手输值并透发 enter */
    await type(host, 'custom.field');
    expect(pop()!.textContent, '手输期间 err 行保持').toContain('字段清单加载失败');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('custom.field');
    expect(entered.length, '无候选 Enter 必须透发').toBe(1);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
    /* 再输入重开层点「重试」→ reload 恢复 */
    await type(host, 'custom');
    const retryBtn = Array.from(pop()!.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('重试'));
    expect(retryBtn, 'err 行必须带重试按钮').toBeTruthy();
    retryBtn!.click();
    await settle();
    expect(mappingDetailFn, '重试必须重拉').toHaveBeenCalledTimes(2);
    expect(pop()!.textContent, '重试成功后 err 必须消').not.toContain('字段清单加载失败');
    /* 重试成功时当前段 prefix='custom' 本就无匹配；换 sta 验证列表恢复 */
    await type(host, 'sta');
    expect(itemTexts(), '重试成功后字段列表必须出').toEqual(['status']);
  });

  it('⑥ Esc 关层不丢文本', async () => {
    const { host, state } = await mountInput();
    await type(host, 'sta');
    expect(pop()).toBeTruthy();
    await key(host, 'Escape');
    expect(state.modelValue, 'Esc 不许丢/改文本').toBe('sta');
    await flushLeave();
    expect(pop(), 'Esc 后弹层必须关闭').toBeNull();
  });

  it('⑦ 弹层不抢焦点：出层/连续输入全程 activeElement 保持 input（输入流不断）', async () => {
    const { host, state } = await mountInput();
    const el = inp(host);
    el.focus();
    await type(host, 'sta');
    expect(pop(), '弹层必须已开').toBeTruthy();
    expect(document.activeElement, '出层不许抢焦点').toBe(el);
    await type(host, 'stat');
    expect(document.activeElement, '连续输入焦点不许漂移').toBe(el);
    expect(state.modelValue, '输入流不断').toBe('stat');
    expect(itemTexts()).toEqual(['status']);
  });

  it('phrase 段不出层：未闭合引号内自由文本，零请求零弹层', async () => {
    const { host, state } = await mountInput();
    await type(host, 'message:"hello wo');
    expect(pop(), 'phrase 段不许出层').toBeNull();
    expect(mappingDetailFn, 'phrase 段不许拉字段').not.toHaveBeenCalled();
    expect(searchRawFn, 'phrase 段不许发 terms').not.toHaveBeenCalled();
    expect(state.modelValue, 'phrase 文本原样保留').toBe('message:"hello wo');
  });

  it('op 段：整词 AND 出 AND/OR/NOT 提示，↓ 选 OR 替换段前缀', async () => {
    const { host, state } = await mountInput();
    await type(host, 'status:ok AND');
    expect(itemTexts(), 'op 段提示三整词').toEqual(['AND', 'OR', 'NOT']);
    await key(host, 'ArrowDown');
    await key(host, 'Enter');
    expect(state.modelValue, 'op 回填=替换整词前缀').toBe('status:ok OR');
  });

  it('numeric 类型字段值段：user.age: → 静态格式提示 >100 / [10 TO 20]', async () => {
    const { host } = await mountInput();
    await type(host, 'user.age:');
    expect(itemTexts()).toEqual(['>100', '[10 TO 20]']);
    expect(searchRawFn, 'numeric 段不发 terms 请求').not.toHaveBeenCalled();
  });

  it('to=false 就地模式：弹层渲染在组件根子树内，body 直子无新增弹层', async () => {
    const { host } = await mountInput({ to: false });
    await type(host, 'sta');
    const popEl = host.querySelector<HTMLElement>('.li-pop');
    expect(popEl, '弹层必须在组件根子树内').toBeTruthy();
    expect(popEl!.getAttribute('style') ?? '', '就地模式跳过 place()，popStyle 为空对象（无 fixed 坐标）').toBe('');
    expect(Array.from(document.body.children).some(el => el.classList.contains('li-pop')),
      'body 直子不许新增弹层').toBe(false);
    expect(itemTexts(), '就地模式候选照常出').toEqual(['status']);
  });

  it('Enter 透发三态：面板关透发 / 有候选不透发 / 无候选收层透发且手输保留', async () => {
    const { host, state, entered } = await mountInput();
    /* 面板关 Enter → 透发（宿主接回执行查询） */
    await key(host, 'Enter');
    expect(entered.length, '面板关 Enter 必须透发').toBe(1);
    /* 面板开有候选 Enter → choose，不透发 */
    await type(host, 'sta');
    await key(host, 'Enter');
    expect(state.modelValue).toBe('status');
    expect(entered.length, '有候选 Enter 不透发').toBe(1);
    /* 面板开无候选 Enter → 收层透发，手输保留 */
    await type(host, 'zzz');
    expect(items().length, '必须无候选').toBe(0);
    expect(pop()!.querySelector('.li-hint')!.textContent).toContain('仍可手输');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('zzz');
    expect(entered.length, '无候选 Enter 必须透发').toBe(2);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
  });

  it('中段光标：值段回填替换段前缀且不动后文，光标置段尾', async () => {
    const { host, state } = await mountInput();
    vi.useFakeTimers();
    /* 光标 9 = 'status:ac' 之后、' AND ...' 之前 */
    await typeAt(host, 'status:ac AND message:x', 9);
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(itemTexts(), '按中段光标所在段出 terms').toEqual(['active']);
    await key(host, 'Enter');
    expect(state.modelValue, '只替换当前段前缀，后文不动').toBe('status:active AND message:x');
    expect(inp(host).selectionStart, '光标置段尾（status:active 末尾）').toBe(13);
    vi.useRealTimers();
  });
});

describe('LuceneInput 评审修复回归（I1/I2/M1/M4）', () => {
  it('I1：terms 持续失败 → 无重试风暴（catch 不赋新引用，切断 watch→refresh→suggest 循环）', async () => {
    searchRawFn.mockReset().mockRejectedValue(new Error('terms down'));
    const { host } = await mountInput();
    vi.useFakeTimers();
    await type(host, 'status:');
    await vi.advanceTimersByTimeAsync(3000);
    await settle();
    /* 修复前：失败→新引用 []→watch→refresh→suggest→300ms 后再失败 ≈3req/s，3s 内约 10 次；
       修复后：首周期失败即停（suggestions 本就为空不重置），至多 2 次（首周期+一次清空重估裕量） */
    expect(searchRawFn.mock.calls.length, '持续失败不许形成重试风暴').toBeLessThanOrEqual(2);
    vi.useRealTimers();
  });

  it('I2：列表收窄后 cursor 越界——输入复位 cursor，Enter 回填唯一候选且不透发 enter', async () => {
    const { host, state, entered } = await mountInput();
    await type(host, 'user.');
    expect(itemTexts()).toEqual(['user.age', 'user.name']);
    await key(host, 'ArrowDown'); /* cursor=1 */
    await type(host, 'user.a'); /* 收窄为 1 项；cursor 必须复位 0（修复前越界无高亮） */
    expect(itemTexts()).toEqual(['user.age']);
    await key(host, 'Enter');
    expect(state.modelValue, 'Enter 必须回填收窄后的唯一候选').toBe('user.age');
    expect(entered, '有候选 Enter 不透发').toEqual([]);
  });

  it('M1：弹层打开后 ArrowLeft 移动光标（无 input 事件）→ 关层且文本不变，继续打字重开', async () => {
    const { host, state } = await mountInput();
    await type(host, 'sta');
    expect(pop()).toBeTruthy();
    const el = inp(host);
    el.selectionStart = el.selectionEnd = 2; /* 模拟光标左移（无 input 事件） */
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' }));
    await settle();
    await flushLeave();
    expect(pop(), '光标偏离段快照后弹层必须关闭').toBeNull();
    expect(state.modelValue, '文本不许变').toBe('sta');
    await type(host, 'stat');
    expect(pop(), '继续输入必须经 refresh 重开弹层').toBeTruthy();
    expect(itemTexts()).toEqual(['status']);
  });

  it('M4①：index 切换——A 出建议中切 B，按新索引重拉 mapping/terms，无旧索引残留', async () => {
    const TERMS_B = { aggregations: { suggest: { buckets: [{ key: 'active-b' }] } } };
    searchRawFn.mockReset().mockResolvedValueOnce(TERMS).mockResolvedValue(TERMS_B);
    const { host, state } = await mountInput();
    vi.useFakeTimers();
    await type(host, 'status:');
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(searchRawFn.mock.calls[0][0]).toBe('logs-2026.08');
    expect(itemTexts()).toEqual(['active', 'closed']);
    state.index = 'logs-2026.09';
    await settle();
    await vi.advanceTimersByTimeAsync(300);
    await settle();
    expect(mappingDetailFn.mock.calls.map(c => c[0]), 'mapping 必须按新索引重拉').toEqual(['logs-2026.08', 'logs-2026.09']);
    expect(searchRawFn, 'terms 必须按新索引重拉').toHaveBeenCalledTimes(2);
    expect(searchRawFn.mock.calls[1][0]).toBe('logs-2026.09');
    const body = JSON.parse(searchRawFn.mock.calls[1][1]);
    expect(body.aggs.suggest.terms.field).toBe('status');
    expect(itemTexts(), '建议必须来自新索引响应，无旧索引残留').toEqual(['active-b']);
    vi.useRealTimers();
  });

  it('M4②：卸载清理——弹层开+防抖 pending 态 unmount，推进定时器无新请求无报错', async () => {
    const { app, host } = await mountInput();
    vi.useFakeTimers();
    await type(host, 'status:');
    expect(pop(), '弹层必须已开').toBeTruthy();
    expect(searchRawFn, '防抖 pending，请求未发').not.toHaveBeenCalled();
    apps.splice(apps.indexOf(app), 1);
    app.unmount();
    await vi.advanceTimersByTimeAsync(1000);
    expect(searchRawFn, '卸载后防抖定时器必须已清，零新请求').not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('M4④：空列表（loading 期无匹配项）按 ↓ cursor 钳位 0——列表到位后高亮首项、Enter 选中', async () => {
    let resolveMapping!: (v: any) => void;
    mappingDetailFn.mockReset().mockImplementation(() => new Promise(res => { resolveMapping = res; }));
    const { host, state, entered } = await mountInput();
    await type(host, 'st');
    expect(pop()!.textContent).toContain('正在加载');
    expect(items().length, 'loading 期列表为空').toBe(0);
    await key(host, 'ArrowDown'); /* 空列表 ↓：cursor 钳 0（length-1=-1 不许压成 -1） */
    resolveMapping(MAPPING);
    await settle();
    expect(itemTexts()).toEqual(['status']);
    expect(inp(host).getAttribute('aria-activedescendant'), 'cursor=0 必须高亮首项').toBe(items()[0].id);
    await key(host, 'Enter');
    expect(state.modelValue).toBe('status');
    expect(entered, '有候选 Enter 不透发').toEqual([]);
  });

  /* ==== 右键菜单：候选行填入/复制（共享 CellContextMenu；键盘 ContextMenu 同入口） ==== */
  it('候选行右键：标题带候选/类型，复制候选文本走剪贴板；键盘 ContextMenu 开同一菜单并填入', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { host, state } = await mountInput();
    await type(host, 'sta');
    items()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 12, clientY: 24 }));
    await settle();
    const menu = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu, '右键必须出共享 CellContextMenu').toBeTruthy();
    expect(menu.querySelector('.ccm-hd')!.textContent).toContain('status');
    expect(menu.querySelector('.ccm-hd')!.textContent).toContain('keyword');
    (menu.querySelector('[data-key="li-copy"]') as HTMLElement).click();
    await settle(3);
    expect(writeText).toHaveBeenCalledWith('status');
    delete (navigator as any).clipboard;

    await key(host, 'ContextMenu');
    const menu2 = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu2, 'ContextMenu 键必须对高亮候选开菜单').toBeTruthy();
    (menu2.querySelector('[data-key="li-pick"]') as HTMLElement).click();
    await settle();
    expect(state.modelValue, '菜单填入必须回填候选').toBe('status');
  });
});
