/**
 * v-tip 全局指令（src/directives/vTip.ts）行为规格：
 * 单例浮层 / 300ms 显示延迟与 80ms 隐藏延迟 / 宿主切换即时不打闪 / falsy 不显示 /
 * .long 档类名与 theme.css 320px-200px 源码锚 / aria-describedby 挂摘 /
 * touch 与 coarse 屏不触发 hover 通道 / focus 键盘通道 / unmount 清理 /
 * disabled 控件经父级代理显示（非冒泡事件反证监听不在控件自身）/ 值响应式更新 /
 * role="tooltip" 语义锚 / Escape·resize·转屏收起 / 触屏 tap 通道（双闸与浮层外收起）。
 * 挂具范式同 componentQualityBan1120（createApp 手工 mount），行为级 spec 自行
 * app.directive 注册——setupVTip.ts 只做告警过滤（全仓无 @vue/test-utils 真依赖）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import { vTip } from '../directives/vTip';

const SRC = join(__dirname, '..');

/* 两宿主：h1 带 .long 修饰符，h2 纯值（对象形态 { text, long } 也走 h2 验证） */
const TwoHost = {
  props: ['a', 'b'],
  template: '<div id="wrap"><button id="h1" v-tip.long="a">A</button><button id="h2" v-tip="b">B</button></div>',
};
const DisabledHost = {
  props: ['tip'],
  template: '<div id="wrap"><button id="db" disabled v-tip="tip">x</button></div>',
};

const apps: App[] = [];
async function mountHost(comp: unknown, source: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  /* render 逐键读 reactive source：属性变更触发重渲并驱动指令 updated 钩子 */
  const app = createApp({
    render: () => h(comp as never, Object.fromEntries(Object.keys(source).map((k) => [k, (source as Record<string, unknown>)[k]])) as never),
  });
  app.config.warnHandler = () => {};
  app.directive('tip', vTip);
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return { app, host };
}

function fire(el: Element, type: 'pointerover' | 'pointerout' | 'pointerdown', opts: { bubbles?: boolean; pointerType?: string } = {}) {
  const e = new MouseEvent(type, { bubbles: opts.bubbles ?? true });
  Object.defineProperty(e, 'pointerType', { value: opts.pointerType ?? 'mouse', configurable: true });
  el.dispatchEvent(e);
}

const getPop = () => document.getElementById('vt-tip');
const visible = () => { const p = getPop(); return !!p && p.style.display !== 'none'; };

let mm: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  /* 默认精细指针；coarse 用例内覆写返回值 */
  mm = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
});
afterEach(() => {
  apps.forEach((a) => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  /* 浮层是指令模块级单例：body 清空会把节点摘离文档而模块引用仍在（之后 show 会把
     内容写进游离节点，document 查不到）——清场后回挂 body 保持引用与文档一致 */
  const popEl = getPop();
  document.body.innerHTML = '';
  if (popEl) document.body.appendChild(popEl);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('v-tip：单例浮层与通道时序', () => {
  it('hover 通道 300ms 延迟显示：299ms 不出，整点后出浮层并挂 aria', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(299);
    expect(visible(), '299ms 时浮层不可见').toBe(false);
    fire(h1, 'pointerout'); /* 顺带撤掉 pending，排除下一断言吃到延迟残响 */
    vi.advanceTimersByTime(1);
    expect(visible(), 'pointerover 被撤销后不再显示').toBe(false);
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(visible()).toBe(true);
    expect(getPop()!.textContent).toBe('甲提示');
    expect(h1.getAttribute('aria-describedby')).toBe('vt-tip');
  });

  it('单例：两宿主先后触发全 document 只有一个浮层；可见态切换宿主即时换内容（不打闪）', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '乙提示' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    const h2 = host.querySelector('#h2') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(visible()).toBe(true);
    /* 离开 h1 进入 h2：80ms 隐藏窗口被新宿主撤销，浮层始终在场，内容即时切换 */
    fire(h1, 'pointerout');
    fire(h2, 'pointerover');
    expect(visible(), '切换瞬间浮层未消失（不打闪）').toBe(true);
    expect(getPop()!.textContent).toBe('乙提示');
    expect(h2.getAttribute('aria-describedby')).toBe('vt-tip');
    expect(h1.getAttribute('aria-describedby'), '旧宿主 aria 已摘').toBeNull();
    expect(document.querySelectorAll('#vt-tip').length, '全 document 唯一浮层').toBe(1);
  });

  it('离开 80ms 延迟隐藏：79ms 仍在场，到期隐藏并摘 aria', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    fire(h1, 'pointerout');
    vi.advanceTimersByTime(79);
    expect(visible(), '隐藏延迟窗口内仍在场').toBe(true);
    vi.advanceTimersByTime(1);
    expect(visible()).toBe(false);
    expect(h1.getAttribute('aria-describedby'), '隐藏时摘除 aria').toBeNull();
  });

  it('falsy/空串不显示（空串与空 text 对象两种形态）', async () => {
    const p = reactive<Record<string, unknown>>({ a: '', b: '' });
    const { host } = await mountHost(TwoHost, p);
    fire(host.querySelector('#h1') as HTMLElement, 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(visible()).toBe(false);
    p.b = { text: '' };
    await nextTick();
    fire(host.querySelector('#h2') as HTMLElement, 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(visible(), '空 text 对象同样不显示').toBe(false);
  });

  it('.long 修饰符挂 vt-long 类；对象 long 字段同效；theme.css 320px/200px 档源码锚', async () => {
    const p = reactive<Record<string, unknown>>({ a: '修饰符档', b: { text: '对象档', long: true } });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    const h2 = host.querySelector('#h2') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(getPop()!.classList.contains('vt-long'), '.long 修饰符档').toBe(true);
    fire(h1, 'pointerout');
    fire(h2, 'pointerover');
    expect(getPop()!.classList.contains('vt-long'), '{ text, long } 对象档').toBe(true);

    const css = readFileSync(join(SRC, 'theme.css'), 'utf-8');
    expect(css).toMatch(/\.vt-pop\.vt-long \{[^}]*max-width: 320px;[^}]*max-height: 200px;[^}]*overflow-y: auto;/);
    expect(css).toMatch(/\.vt-pop \{[^}]*z-index: var\(--z-island\);/);
    expect(css).toMatch(/\.vt-pop \{[^}]*max-width: 260px;/);
    expect(css).toMatch(/\.vt-pop \{ opacity: 0; transition: opacity 120ms ease-out; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.vt-pop \{ transition: none; \} \}/);
  });

  it('touch pointerType 不触发 hover 通道', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    fire(host.querySelector('#h1') as HTMLElement, 'pointerover', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    expect(visible()).toBe(false);
  });

  it('coarse 指针设备不启用 hover 通道（鼠标事件也被挡）', async () => {
    mm.mockReturnValue({ matches: true } as MediaQueryList);
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    fire(host.querySelector('#h1') as HTMLElement, 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(visible()).toBe(false);
  });

  it('focusin/focusout 键盘通道立即显示与隐藏（无 300ms）', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    h1.dispatchEvent(new Event('focusin'));
    expect(visible(), '键盘通道同步显示').toBe(true);
    expect(h1.getAttribute('aria-describedby')).toBe('vt-tip');
    h1.dispatchEvent(new Event('focusout'));
    expect(visible()).toBe(false);
  });

  it('unmount 清理：隐藏浮层、摘 aria、监听移除', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const mounted = await mountHost(TwoHost, p);
    const h1 = mounted.host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(visible()).toBe(true);
    mounted.app.unmount();
    expect(visible(), '卸载即隐藏').toBe(false);
    expect(h1.getAttribute('aria-describedby'), '卸载即摘 aria').toBeNull();
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(1000);
    expect(visible(), '监听已移除，游离宿主不再触发').toBe(false);
  });

  it('300ms 延迟窗口内宿主被卸载：pending 计时器照跑但不产生幽灵浮层', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const mounted = await mountHost(TwoHost, p);
    const h1 = mounted.host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(100);
    expect(visible(), '仍在延迟窗口内').toBe(false);
    mounted.app.unmount();
    vi.advanceTimersByTime(300);
    expect(visible(), '游离宿主的 show 被 isConnected 守卫拦下').toBe(false);
  });

  it('任意滚动即收起浮层（fixed 不随滚动跟随宿主）', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(visible()).toBe(true);
    window.dispatchEvent(new Event('scroll'));
    expect(visible(), '滚动即隐藏').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
  });

  it('disabled 按钮经父级代理显示：非冒泡事件不触发（监听不在按钮自身），冒泡事件可达父级', async () => {
    const p = reactive<Record<string, unknown>>({ tip: '禁用提示' });
    const { host } = await mountHost(DisabledHost, p);
    const db = host.querySelector('#db') as HTMLElement;
    fire(db, 'pointerover', { bubbles: false });
    vi.advanceTimersByTime(1000);
    expect(visible(), '监听不在 disabled 按钮自身（挂父级代理）').toBe(false);
    fire(db, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(visible(), '冒泡到父级代理后显示').toBe(true);
    expect(getPop()!.textContent).toBe('禁用提示');
    expect(db.getAttribute('aria-describedby')).toBe('vt-tip');
  });

  it('值响应式更新：显示中改文本即时刷新；改空串立即隐藏', async () => {
    const p = reactive<Record<string, unknown>>({ a: '旧提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerover');
    vi.advanceTimersByTime(300);
    expect(getPop()!.textContent).toBe('旧提示');
    p.a = '新提示';
    await nextTick();
    expect(getPop()!.textContent, 'updated 钩子刷新浮层文本').toBe('新提示');
    p.a = '';
    await nextTick();
    expect(visible(), '值变空串立即隐藏').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
  });
});

describe('v-tip：可达性收起面与触屏通道', () => {
  it('浮层节点带 role="tooltip"：aria-describedby 指向的节点具备提示语义', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    (host.querySelector('#h1') as HTMLElement).dispatchEvent(new Event('focusin'));
    expect(visible()).toBe(true);
    expect(getPop()!.getAttribute('role')).toBe('tooltip');
  });

  it('Escape 收起：可见期间 document Escape 即收并摘 aria；非 Esc 键不收', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    h1.dispatchEvent(new Event('focusin'));
    expect(visible()).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(visible(), '非 Escape 键不收').toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(visible(), 'Escape 即收').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(visible(), '收起后监听已摘，重复 Escape 无副作用').toBe(false);
  });

  it('window resize 与转屏即收起（fixed 定位不随视口重排，与其漂移不如收起）', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    h1.dispatchEvent(new Event('focusin'));
    expect(visible()).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(visible(), 'resize 即收').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
    h1.dispatchEvent(new Event('focusin'));
    expect(visible()).toBe(true);
    window.dispatchEvent(new Event('orientationchange'));
    expect(visible(), '转屏即收').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
  });

  it('触屏通道：coarse 设备 tap 宿主立即显示（不吃 300ms），宿主再 tap 刷新不收，tap 浮层外收起', async () => {
    mm.mockReturnValue({ matches: true } as MediaQueryList);
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerdown', { pointerType: 'touch' });
    expect(visible(), 'tap 同步显示无延迟').toBe(true);
    expect(h1.getAttribute('aria-describedby')).toBe('vt-tip');
    fire(h1, 'pointerdown', { pointerType: 'touch' });
    expect(visible(), '宿主再 tap 走显示通道刷新，不被 document 收起面误杀').toBe(true);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    fire(outside, 'pointerdown', { pointerType: 'touch' });
    expect(visible(), 'tap 浮层外即收').toBe(false);
    expect(h1.getAttribute('aria-describedby')).toBeNull();
  });

  it('触屏双闸反证：非 touch pointerdown 与 fine 设备 tap 均不进触屏通道', async () => {
    const p = reactive<Record<string, unknown>>({ a: '甲提示', b: '' });
    const { host } = await mountHost(TwoHost, p);
    const h1 = host.querySelector('#h1') as HTMLElement;
    fire(h1, 'pointerdown', { pointerType: 'mouse' }); /* mm 默认精细指针 */
    vi.advanceTimersByTime(1000);
    expect(visible(), '鼠标按下不属于触屏通道').toBe(false);
    fire(h1, 'pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(1000);
    expect(visible(), 'fine 设备的 touch 事件同样被双闸挡下').toBe(false);
  });
});
