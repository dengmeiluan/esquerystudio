/**
 * W1 Task 2：FieldPicker 行为保护网（行为保持型重构：内联 mapping 拉取/拍平/缓存 → useIndexFields）。
 * 锁定现状行为：focus 拉字段弹层 / loading 提示 / 输入过滤+高亮 / 排序（精确>前缀>包含）/
 * Enter 选择回填 / 失败 err 提示不伪装空态且可重试 / 失败退化纯手输 / multi 只补最后一段 /
 * 索引变化重拉 / 缓存命中零请求 / typeFilter 过滤 / ↑↓ 键盘导航。
 * teardown 统一走 afterEach 兜底 unmount：断言中途失败也不泄漏 document 级 mousedown listener。
 * 断言选择器沿用组件现有 class（.fxp-pop/.fxp-item/.fxp-hint）；弹层 Teleport 在 body 下，统一查 document.body。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

/* 只替换网络出口，组件/composable/store 全用真的 */
const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      /* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音 */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import FieldPicker from '../components/FieldPicker.vue';
import { __clearFieldCache } from '../composables/useIndexFields';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };
const ALL_NAMES = ['message', 'message.keyword', 'status', 'user', 'user.age', 'user.name'];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* F1 teardown 兜底：所有 mount 的 app 收集于此，afterEach 统一 unmount */
const apps: ReturnType<typeof createApp>[] = [];

async function mountPicker(init: { modelValue?: string; index?: string; multi?: boolean; typeFilter?: string; to?: string | false; typePriority?: string[] } = {}) {
  const state = reactive({
    modelValue: init.modelValue ?? '',
    index: init.index ?? 'logs-2026.08',
    multi: init.multi ?? false,
    typeFilter: init.typeFilter ?? '',
  });
  const picked: string[] = [];
  const pickedTypes: (string | undefined)[] = [];
  const entered: number[] = [];
  const pinia = createPinia();
  /* 防御性保留：组件自身无路由依赖，防 store 未来路由依赖（仓内 jobTracker 已依赖全局 router） */
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  /* props 必须在 render 闭包内联求值（state 响应式更新随重渲染下行）；
     to 缺省时不传 prop：锁定「默认 teleport」的真默认路径，而非显式 'body' */
  const app = createApp({
    render: () => h(FieldPicker, {
      modelValue: state.modelValue,
      index: state.index,
      multi: state.multi,
      typeFilter: state.typeFilter,
      ...(init.to !== undefined ? { to: init.to } : {}),
      ...(init.typePriority !== undefined ? { typePriority: init.typePriority } : {}),
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
      onPicked: (v: string, t?: string) => { picked.push(v); pickedTypes.push(t); },
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
  return { app, host, state, picked, pickedTypes, entered };
}

/* 弹层 Teleport 到 body：统一在这里查 */
const pop = () => document.body.querySelector('.fxp-pop');
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.fxp-item'));
const itemNames = () => Array.from(document.body.querySelectorAll('.fxp-item .fxp-name')).map(el => el.textContent);
const groupHeads = () => Array.from(document.body.querySelectorAll('.fxp-gh')).map(el => el.textContent);
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.fxp-inp')!;
async function focus(host: ParentNode) { inp(host).dispatchEvent(new Event('focus')); await settle(); }
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(host: ParentNode, k: string) {
  inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  await settle();
}
/* 弹层关闭走 <transition> 离场：jsdom 无 CSS 时长，Vue 在 rAF 帧收尾才移除元素——断言「已关闭」前补一帧 */
async function flushLeave() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  await settle(3);
}

/* 统一 teardown 兜底：断言中途失败也回收 app，document 级 mousedown listener 不泄漏级联假红 */
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  __clearFieldCache();
  /* 重构前实现缓存在 window.__fxpFieldCache：一并清掉保证用例隔离（重构后此行无害） */
  delete (window as any).__fxpFieldCache;
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
});

describe('FieldPicker 行为保护网', () => {
  it('无索引：focus 出引导提示且零请求', async () => {
    const { host } = await mountPicker({ index: '' });
    await focus(host);
    expect(pop()).toBeTruthy();
    expect(pop()!.querySelector('.fxp-hint')!.textContent).toContain('先在上方选择索引');
    expect(mappingDetailFn, '无索引不许发请求').not.toHaveBeenCalled();
  });

  it('focus 拉字段弹层：拍平含嵌套+multi-fields，类型徽标与计数在；重开命中缓存零请求', async () => {
    const { host } = await mountPicker();
    expect(mappingDetailFn, '未 focus 不许预拉').not.toHaveBeenCalled();
    await focus(host);
    expect(mappingDetailFn).toHaveBeenCalledTimes(1);
    expect(mappingDetailFn.mock.calls[0][0]).toBe('logs-2026.08');
    expect(itemNames()).toEqual(ALL_NAMES);
    expect(pop()!.querySelector('[data-t="object"]'), '嵌套 object 徽标在').toBeTruthy();
    expect(pop()!.querySelector('[data-t="keyword"]')).toBeTruthy();
    expect(pop()!.textContent).toContain('6 字段');
    /* 关面板重开：缓存命中，不再请求 */
    await key(host, 'Escape');
    await flushLeave();
    expect(pop(), 'Esc 后弹层必须关闭').toBeNull();
    await focus(host);
    expect(items().length).toBe(6);
    expect(mappingDetailFn, '缓存命中不许二次请求').toHaveBeenCalledTimes(1);
  });

  it('loading：拉取中出加载提示，不闪空态/列表；到位后列表出', async () => {
    let resolveMd: (v: any) => void = () => {};
    mappingDetailFn.mockReturnValue(new Promise(r => { resolveMd = r; }));
    const { host } = await mountPicker();
    inp(host).dispatchEvent(new Event('focus'));
    await settle(3);
    expect(pop()!.querySelector('.fxp-hint')!.textContent).toContain('正在加载 logs-2026.08 的字段清单');
    expect(items().length, '加载中不许闪列表').toBe(0);
    resolveMd(MAPPING);
    await settle();
    expect(itemNames()).toEqual(ALL_NAMES);
  });

  it('输入过滤 + <mark> 高亮 + 排序：精确 > 前缀', async () => {
    const { host } = await mountPicker();
    await focus(host);
    await type(host, 'user.n');
    expect(itemNames()).toEqual(['user.name']);
    const mark = pop()!.querySelector('.fxp-item .fxp-name mark');
    expect(mark, '匹配片段必须 <mark> 高亮').toBeTruthy();
    expect(mark!.textContent).toBe('user.n');
    /* 精确排最前，前缀次之 */
    await type(host, 'message');
    expect(itemNames()).toEqual(['message', 'message.keyword']);
  });

  it('Enter 选择回填：v-model 更新 + picked 发出 + 面板关闭', async () => {
    const { host, state, picked } = await mountPicker();
    await focus(host);
    await type(host, 'stat');
    expect(itemNames()).toEqual(['status']);
    await key(host, 'Enter');
    expect(state.modelValue).toBe('status');
    expect(picked).toEqual(['status']);
    await flushLeave();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  it('IME 组合态 Enter 守卫：isComposing keydown 不触发 choose，手输值保留、弹层不收', async () => {
    const { host, state, picked } = await mountPicker();
    await focus(host);
    await type(host, 'stat');
    expect(itemNames()).toEqual(['status']);
    inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    await settle();
    expect(state.modelValue, 'IME 组合态 Enter 不许替换手输值').toBe('stat');
    expect(picked, 'IME 组合态 Enter 不许发 picked').toEqual([]);
    expect(pop(), 'IME 组合态 Enter 后弹层保持打开').toBeTruthy();
  });

  it('失败：err 提示不伪装空态；重开面板可重试并恢复', async () => {
    mappingDetailFn.mockRejectedValueOnce(new Error('connect refused'));
    const { host } = await mountPicker();
    await focus(host);
    const hint = pop()!.querySelector('.fxp-hint')!;
    expect(hint.textContent).toContain('字段清单加载失败');
    expect(hint.textContent).toContain('connect refused');
    expect(hint.textContent).toContain('仍可手输');
    expect(pop()!.textContent, '失败不许伪装空态').not.toContain('该索引没有可选字段');
    /* 重开面板即重试（失败不写缓存） */
    await key(host, 'Escape');
    await focus(host);
    expect(mappingDetailFn, '重开必须重拉').toHaveBeenCalledTimes(2);
    expect(itemNames()).toEqual(ALL_NAMES);
    expect(pop()!.textContent, '恢复后 err 必须消').not.toContain('字段清单加载失败');
  });

  it('失败：err 提示行「重试」按钮直拉 reload 恢复（W1 Task2 有意行为增量）', async () => {
    mappingDetailFn.mockRejectedValueOnce(new Error('connect refused'));
    const { host } = await mountPicker();
    await focus(host);
    const hint = pop()!.querySelector('.fxp-hint')!;
    expect(hint.textContent).toContain('connect refused');
    const retryBtn = Array.from(hint.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('重试'));
    expect(retryBtn, 'err 提示行必须带重试按钮').toBeTruthy();
    retryBtn!.click();
    await settle();
    expect(mappingDetailFn, '重试必须重拉').toHaveBeenCalledTimes(2);
    expect(itemNames(), '重试成功后列表必须出').toEqual(ALL_NAMES);
    expect(pop()!.textContent, '重试成功后 err 必须消').not.toContain('字段清单加载失败');
  });

  it('失败退化纯手输：无匹配 Enter 收面板，手输值保留', async () => {
    mappingDetailFn.mockRejectedValueOnce(new Error('boom'));
    const { host, state } = await mountPicker();
    await focus(host);
    expect(pop()!.textContent).toContain('字段清单加载失败');
    await type(host, 'custom.field');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('custom.field');
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
  });

  it('multi 模式：只补全/替换最后一段', async () => {
    const { host, state, picked } = await mountPicker({ multi: true, modelValue: 'status, mess' });
    await focus(host);
    expect(itemNames()).toEqual(['message', 'message.keyword']);
    await key(host, 'Enter');
    expect(state.modelValue).toBe('status, message');
    expect(picked).toEqual(['status, message']);
  });

  it('索引变化：面板开着时重拉，内容跟随新索引', async () => {
    mappingDetailFn.mockImplementation((index: string) => Promise.resolve(
      index === 'a-idx'
        ? { raw: { properties: { alpha: { type: 'keyword' } } } }
        : { raw: { properties: { beta: { type: 'text' } } } }));
    const { host, state } = await mountPicker({ index: 'a-idx' });
    await focus(host);
    expect(itemNames()).toEqual(['alpha']);
    state.index = 'b-idx';
    await settle();
    expect(mappingDetailFn, '换 key 必须重拉').toHaveBeenCalledTimes(2);
    expect(mappingDetailFn.mock.calls[1][0]).toBe('b-idx');
    expect(itemNames(), '必须换成新索引字段').toEqual(['beta']);
  });

  it('typeFilter：只列 keyword 项，页脚带过滤提示', async () => {
    const { host } = await mountPicker({ typeFilter: 'keyword' });
    await focus(host);
    expect(itemNames(), '弹层只剩 keyword 字段项').toEqual(['message.keyword', 'status']);
    expect(Array.from(pop()!.querySelectorAll('.fxp-item .fxp-type')).map(el => el.textContent),
      '列项类型徽标必须全是 keyword').toEqual(['keyword', 'keyword']);
    expect(pop()!.querySelector('.fxp-ft')!.textContent, '页脚必须带 typeFilter 提示').toContain('（keyword）');
  });

  it('键盘导航：↓/↑ 移动高亮项（onKey 箭头分支 + cursor）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), '打开默认高亮首项').toBe(0);
    await key(host, 'ArrowDown');
    expect(actIdx(), '↓ 落到第二项').toBe(1);
    await key(host, 'ArrowDown');
    expect(actIdx(), '↓↓ 落到第三项').toBe(2);
    await key(host, 'ArrowUp');
    expect(actIdx(), '↑ 回退到第二项').toBe(1);
  });

  /* ==== W1 Task 4 评审修复：to prop 就地模式 + enter 透发 ==== */

  it('就地模式（to=false）：弹层渲染在组件根子树内，body 直子无新增弹层', async () => {
    const { host } = await mountPicker({ to: false });
    await focus(host);
    expect(host.querySelector('.fxp-pop'), '弹层必须在组件根子树内').toBeTruthy();
    expect(Array.from(document.body.children).some(el => el.classList.contains('fxp-pop')),
      'body 直子不许新增弹层').toBe(false);
    expect(itemNames(), '就地模式候选照常出').toEqual(ALL_NAMES);
  });

  it('默认模式：弹层仍 Teleport 到 body（锁定既有行为不回归）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    expect(host.querySelector('.fxp-pop'), '组件根内不许有弹层').toBeNull();
    expect(Array.from(document.body.children).some(el => el.classList.contains('fxp-pop')),
      '弹层必须 Teleport 到 body 直子').toBe(true);
  });

  it('Enter 透发：面板关 Enter 透发 enter（宿主快捷键接回）', async () => {
    const { host, entered } = await mountPicker();
    await key(host, 'Enter');
    expect(entered.length, '面板关 Enter 必须透发 enter').toBe(1);
  });

  it('Enter 透发：面板开无候选 Enter 收面板且透发；无匹配 hint 带「（仍可手输）」后缀', async () => {
    const { host, state, entered, picked } = await mountPicker();
    await focus(host);
    await type(host, 'nope.field');
    expect(items().length, '必须无候选').toBe(0);
    expect(pop()!.querySelector('.fxp-hint')!.textContent,
      '无匹配 hint 必须补安抚后缀（与 err 行口径对齐）').toContain('没有匹配「nope.field」的字段（仍可手输）');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('nope.field');
    expect(picked, '无候选不许发 picked').toEqual([]);
    expect(entered.length, '无候选 Enter 必须透发 enter').toBe(1);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
  });

  /* ==== W2 T7a 评审修复：mouseenter 路径覆盖（模板 @mouseenter="cursor = i" 直接赋值解构 ref 的隐式契约保险） ==== */

  it('mouseenter 移动高亮项：鼠标悬停第二项 → act 落在第二项', async () => {
    const { host } = await mountPicker();
    await focus(host);
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), '打开默认高亮首项').toBe(0);
    items()[1].dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(actIdx(), 'mouseenter 后高亮必须移到第二项').toBe(1);
  });

  it('mouseenter 高亮后 Enter：回填鼠标高亮项（覆盖键盘 cursor 原位）', async () => {
    const { host, state, picked } = await mountPicker();
    await focus(host);
    await key(host, 'ArrowDown');
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), '键盘 cursor 落在第二项').toBe(1);
    items()[2].dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(actIdx(), 'mouseenter 必须覆盖键盘 cursor 原位').toBe(2);
    await key(host, 'Enter');
    expect(state.modelValue, 'Enter 必须回填鼠标高亮项').toBe('status');
    expect(picked).toEqual(['status']);
    await flushLeave();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  /* ==== 智能排序：typePriority 命中类型分组排前 + 组间类型标签 ==== */

  it('typePriority 智能排序：命中类型排前带组标签，其余殿后保持原序', async () => {
    const { host } = await mountPicker({ typePriority: ['keyword'] });
    await focus(host);
    /* keyword 组（message.keyword, status）排前；其余按现状字母序殿后 */
    expect(itemNames()).toEqual(['message.keyword', 'status', 'message', 'user', 'user.age', 'user.name']);
    /* 558b 同步更新：组头人话词面升级（GH_LABEL→FIELD_TYPE_ZH 兜底），keyword→精确值 */
    expect(groupHeads(), '组间必须插类型标签').toEqual(['精确值 字段', '其他 字段']);
  });

  it('typePriority 多类型按给定次序分组，数值族出中文名标签', async () => {
    const { host } = await mountPicker({ typePriority: ['integer', 'keyword'] });
    await focus(host);
    expect(itemNames()).toEqual(['user.age', 'message.keyword', 'status', 'message', 'user', 'user.name']);
    /* 558b 同步更新：组头人话词面升级（GH_LABEL→FIELD_TYPE_ZH 兜底），keyword→精确值 */
    expect(groupHeads(), 'integer→数值、keyword→精确值、其余→其他').toEqual(['数值 字段', '精确值 字段', '其他 字段']);
  });

  it('不传 typePriority：零分组标签、排序维持现状（向后兼容）', async () => {
    const { host } = await mountPicker();
    await focus(host);
    expect(itemNames()).toEqual(ALL_NAMES);
    expect(groupHeads(), '不传新 prop 不许出现分组标签').toEqual([]);
  });

  it('智能排序下键盘 Enter 选中分组首项；picked 第三参带字段类型（类型驱动钩子）', async () => {
    const { host, state, picked, pickedTypes } = await mountPicker({ typePriority: ['keyword'] });
    await focus(host);
    await key(host, 'Enter');
    expect(state.modelValue, 'Enter 必须选中 keyword 组首项').toBe('message.keyword');
    expect(picked).toEqual(['message.keyword']);
    expect(pickedTypes, 'picked 必须附带字段类型供消费方做类型驱动行为').toEqual(['keyword']);
  });

  /* ==== 五百一十九批：记忆闭环——per-index recent 回写 + 页脚 N/M 匹配计数 ==== */

  it('选中字段写 per-index 最近使用（esquerystudio_qb_field_recent::<idx>，FieldSelect 同通道）', async () => {
    const { host } = await mountPicker({ index: 'a-idx' });
    await focus(host);
    await type(host, 'status');
    (document.body.querySelector('.fxp-item') as HTMLElement).click();
    await settle();
    const recent = JSON.parse(localStorage.getItem('esquerystudio_qb_field_recent::a-idx') || '[]');
    expect(recent, '选择必须回写本索引最近使用').toContain('status');
  });

  it('页脚补 N/M 匹配计数；保留既有「N 字段」文案', async () => {
    const { host } = await mountPicker({ index: 'a-idx' });
    await focus(host);
    const ft = pop()!.querySelector('.fxp-ft')!.textContent!;
    expect(ft, '既有「N 字段」契约保持').toContain('6 字段');
    expect(ft, '空 query 全量可见：6/6 匹配').toContain('6/6 匹配');
    await type(host, 'user');
    const ft2 = pop()!.querySelector('.fxp-ft')!.textContent!;
    /* total 是过滤后总命中：'user' 命中 user/user.age/user.name 共 3，全部可见 → 3/3 */
    expect(ft2).toContain('3/3 匹配');
  });

  it('候选超 cap 50 时页脚显示 N/M 截断读数（50/60）与收窄提示', async () => {
    const big = { raw: { properties: Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`f${i}`, { type: 'keyword' }]),
    ) } };
    mappingDetailFn.mockResolvedValue(big);
    const { host } = await mountPicker({ index: 'a-idx' });
    await focus(host);
    const ft = pop()!.querySelector('.fxp-ft')!.textContent!;
    expect(ft).toContain('60 字段');
    expect(ft, 'cap 50 截断：显示 50/60 匹配').toContain('50/60 匹配');
    expect(ft).toContain('仅显示前 50 个');
  });

  /* ==== 右键菜单：候选行选用/复制（共享 CellContextMenu；键盘 ContextMenu 同入口） ==== */

  it('候选行右键：标题带字段+类型，选用回填并关层；键盘 ContextMenu 对高亮项开同一菜单', async () => {
    const { host, state, picked } = await mountPicker();
    await focus(host);
    items()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 }));
    await settle();
    const menu = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu, '右键必须出共享 CellContextMenu').toBeTruthy();
    expect(menu.querySelector('.ccm-hd')!.textContent).toContain('message.keyword');
    const labels = Array.from(menu.querySelectorAll('.ccm-it')).map(el => el.textContent?.trim());
    expect(labels).toEqual(['选用此字段', '复制字段名']);
    (menu.querySelector('[data-key="field-pick"]') as HTMLElement).click();
    await settle();
    expect(state.modelValue).toBe('message.keyword');
    expect(picked).toEqual(['message.keyword']);
    await flushLeave();
    expect(pop(), '选用后面板必须关闭').toBeNull();

    /* 键盘入口：弹层焦点在输入框，ContextMenu 对当前高亮候选开菜单 */
    await focus(host);
    await key(host, 'ContextMenu');
    const menu2 = document.body.querySelector('.ccm') as HTMLElement;
    expect(menu2, 'ContextMenu 键必须对高亮候选项开菜单').toBeTruthy();
    expect(menu2.querySelector('.ccm-hd')!.textContent).toContain('message.keyword');
  });

  it('候选行右键复制字段名：剪贴板写入字段路径并给成功提示', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { host } = await mountPicker();
    await focus(host);
    items()[2].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }));
    await settle();
    (document.body.querySelector('.ccm [data-key="field-copy"]') as HTMLElement).click();
    await settle(3);
    expect(writeText).toHaveBeenCalledWith('status');
    delete (navigator as any).clipboard;
  });
});
