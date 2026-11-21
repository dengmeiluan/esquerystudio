/**
 * v-tip 全局指令：原生 title 属性的统一替代（main.ts 全局注册，`app.directive('tip', vTip)`）。
 * 原生 title 浮层不受主题 token 控制、不可换行滚动、禁用控件上不出现；本指令提供
 * 统一浮层（theme.css 的 .vt-pop / .vt-long 承载样式）。
 *
 * 用法：v-tip="字符串" 或 v-tip="{ text, long }"；修饰符 .long 启用 320px 长文本档。
 * 值 falsy / 空串不显示（含值变化时的 updated 重算）。
 *
 * 通道与时序：
 * - hover 通道：仅精细指针（pointerType!=='touch' 且 matchMedia('(pointer: coarse)')
 *   不匹配）；显示延迟 300ms（防扫过误触），隐藏延迟 80ms——窗口期内移入相邻 tipped
 *   元素不打闪，浮层可见时切换宿主即时换内容重定位（不再吃 300ms）。
 * - 键盘通道：focusin/focusout 始终启用（触屏设备也走），立即显示无延迟。
 * - 触屏通道：coarse 指针 tap 宿主（pointerdown，与 hover 双闸对称）立即显示——
 *   触屏无 hover 可用，iOS Safari 点按 button 又不派发 focusin；tap 浮层外由
 *   document capture 收起。
 * 收起面除指针离开/focusout 外还有（均只在浮层可见期间挂监听、收起即摘，不常驻）：
 * 任意滚动、window resize/转屏（浮层 fixed 定位不随视口重排，与其漂移不如收起）、
 * Escape（键盘用户收起提示的惯例键）、tap 浮层外（触屏）。
 *
 * 禁用控件：disabled 的 button/input 不派发指针事件，pointerover/pointerout 与
 * 触屏 pointerdown 监听挂到 el.parentElement（无父级时回落 el 自身），处理器过滤
 * target 必须是 el 或其后代，保证同一代理容器内互不误触。
 *
 * 单例：全 document 唯一浮层元素 id="vt-tip"，同一时刻只显示一个 tooltip。
 * SSR 安全：无 window/document 时所有钩子 no-op。
 * aria：显示时宿主挂 aria-describedby="vt-tip"（浮层带 role="tooltip"），隐藏时移除。
 */
import type { Directive } from 'vue';

export type TipValue = string | { text: string; long?: boolean };

const POP_ID = 'vt-tip';
const SHOW_DELAY = 300;
const HIDE_DELAY = 80;
const VIEWPORT_GAP = 8;
const ANCHOR_GAP = 6;

interface HostState {
  value: TipValue | null | undefined;
  long: boolean;
  proxy: HTMLElement;
  onOver: (e: Event) => void;
  onOut: (e: Event) => void;
  onTouchDown: (e: Event) => void;
  onFocusIn: (e: FocusEvent) => void;
  onFocusOut: (e: FocusEvent) => void;
}

const hosts = new WeakMap<HTMLElement, HostState>();

let pop: HTMLElement | null = null;
let currentEl: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function normText(v: TipValue | null | undefined): string {
  if (!v) return '';
  return typeof v === 'string' ? v : (v.text ?? '');
}

function normLong(v: TipValue | null | undefined, modLong: boolean): boolean {
  if (v && typeof v === 'object') return !!v.long || modLong;
  return modLong;
}

function sameValue(a: TipValue | null | undefined, b: TipValue | null | undefined): boolean {
  return normText(a) === normText(b) && normLong(a, false) === normLong(b, false);
}

/** 精细指针判定：事件级 pointerType + 设备级 coarse 媒体查询双闸 */
function hoverChannelEnabled(e: Event): boolean {
  if ((e as PointerEvent).pointerType === 'touch') return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) return false;
  return true;
}

/** 触屏通道判定：与 hover 双闸对称——事件 touch 且设备 coarse 才启用（混合设备的
    鼠标按下、触屏模拟器的 fine 指针 tap 都不进触屏通道） */
function touchChannelEnabled(e: Event): boolean {
  if ((e as PointerEvent).pointerType !== 'touch') return false;
  if (typeof window.matchMedia === 'function' && !window.matchMedia('(pointer: coarse)').matches) return false;
  return true;
}

/** 代理容器内只认本宿主及其后代目标 */
function hitEl(el: HTMLElement, e: Event): boolean {
  const t = e.target as Node | null;
  return !!t && (t === el || el.contains(t));
}

function cancelTimers() {
  if (showTimer) { clearTimeout(showTimer); showTimer = null; }
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
}

/** 首选 top 居中；上方放不下翻 bottom；水平 clamp 留 8px 视口边距（左右溢出的兜底即 clamp，
    260/320px 档宽下无需更激进的左右翻转） */
function position(el: HTMLElement, p: HTMLElement) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  p.style.display = 'block';
  p.style.visibility = 'hidden';
  const pw = p.offsetWidth;
  const ph = p.offsetHeight;
  let top = r.top - ph - ANCHOR_GAP;
  if (top < VIEWPORT_GAP) top = r.bottom + ANCHOR_GAP;
  let left = r.left + r.width / 2 - pw / 2;
  if (left < VIEWPORT_GAP) left = VIEWPORT_GAP;
  if (left + pw > vw - VIEWPORT_GAP) left = vw - VIEWPORT_GAP - pw;
  p.style.left = `${Math.round(left)}px`;
  p.style.top = `${Math.round(top)}px`;
  p.style.visibility = '';
}

function detachAria(el: HTMLElement) {
  if (el.getAttribute('aria-describedby') === POP_ID) el.removeAttribute('aria-describedby');
}

let scrollHide: (() => void) | null = null;
/* Escape / 视口变化 / 浮层外 tap 三类收起监听与 scrollHide 同模式：只在浮层可见期间在场 */
let escHide: ((e: KeyboardEvent) => void) | null = null;
let resizeHide: (() => void) | null = null;
let tapHide: ((e: PointerEvent) => void) | null = null;

function hide() {
  cancelTimers();
  if (currentEl) detachAria(currentEl);
  currentEl = null;
  if (pop) {
    pop.style.display = 'none';
    pop.classList.remove('vt-show');
  }
  if (scrollHide) {
    window.removeEventListener('scroll', scrollHide, true);
    scrollHide = null;
  }
  if (escHide) {
    document.removeEventListener('keydown', escHide, true);
    escHide = null;
  }
  if (resizeHide) {
    window.removeEventListener('resize', resizeHide);
    window.removeEventListener('orientationchange', resizeHide);
    resizeHide = null;
  }
  if (tapHide) {
    document.removeEventListener('pointerdown', tapHide, true);
    tapHide = null;
  }
}

function show(el: HTMLElement, st: HostState) {
  const text = normText(st.value);
  if (!text || typeof document === 'undefined') return;
  if (!el.isConnected) {
    /* 300ms 延迟窗口内宿主被卸载（轮询表格整拍换行）：浮层定位会全零，放弃显示；
       走 hide() 全量收场（清前宿主 aria-describedby、摘收起监听），不留残留态 */
    hide();
    return;
  }
  if (currentEl && currentEl !== el) detachAria(currentEl);
  currentEl = el;
  if (!pop) {
    pop = document.createElement('div');
    pop.id = POP_ID;
    pop.className = 'vt-pop';
    /* aria-describedby 指向的节点必须具备 tooltip 角色，读屏才按提示语义播报而非裸文本 */
    pop.setAttribute('role', 'tooltip');
    pop.style.display = 'none';
    document.body.appendChild(pop);
  } else if (!pop.isConnected) {
    // 单例浮层被外部清场（如单测间 body 清空）后游离，重新挂回
    document.body.appendChild(pop);
    pop.setAttribute('role', 'tooltip'); /* 重挂路径兜底同设：防外部清场篡改游离节点属性，幂等无害 */
  }
  pop.textContent = text;
  pop.classList.toggle('vt-long', st.long);
  position(el, pop);
  pop.classList.remove('vt-show');
  void pop.offsetWidth; /* 强制 reflow 落定 opacity:0 起始态，随后挂类触发 120ms 进入过渡 */
  pop.classList.add('vt-show');
  el.setAttribute('aria-describedby', POP_ID);
  if (!scrollHide) {
    /* 浮层 position:fixed 不随滚动跟随宿主：任意容器滚动即收起（capture 抓内滚体） */
    scrollHide = () => hide();
    window.addEventListener('scroll', scrollHide, true);
  }
  if (!escHide) {
    /* Escape 是键盘用户收起提示的惯例键；焦点归还不做——键盘通道显示时焦点本就在宿主上，
       hover 显示而焦点在他处时强行拉回反而打断用户位置 */
    escHide = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', escHide, true);
  }
  if (!resizeHide) {
    /* 浮层 fixed 定位不随窗口缩放/转屏重排：与滚动同理，与其漂移不如直接收起 */
    resizeHide = () => hide();
    window.addEventListener('resize', resizeHide);
    window.addEventListener('orientationchange', resizeHide);
  }
  if (!tapHide) {
    /* 触屏收起面：capture 在宿主代理处理之前——宿主自身的 tap（hitEl 放行）留给显示通道
       刷新、浮层内 tap（长文本档滚动区）放行，其余 tap 一律收起 */
    tapHide = (e: PointerEvent) => {
      if (!currentEl || hitEl(currentEl, e)) return;
      const t = e.target as Node | null;
      if (pop && t && (t === pop || pop.contains(t))) return;
      hide();
    };
    document.addEventListener('pointerdown', tapHide, true);
  }
}

function requestShow(el: HTMLElement, st: HostState, immediate: boolean) {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } /* 打闪窗口：先撤隐藏计时 */
  if (!normText(st.value)) return;
  const visible = !!pop && pop.style.display !== 'none';
  if (immediate || visible) {
    /* 键盘通道立即显示；浮层已可见时切换宿主同样即时（换内容重定位），不吃二次 300ms */
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    show(el, st);
    return;
  }
  if (showTimer) clearTimeout(showTimer);
  showTimer = setTimeout(() => { showTimer = null; show(el, st); }, SHOW_DELAY);
}

function makeHandlers(el: HTMLElement, st: HostState) {
  st.onOver = (e: Event) => {
    if (!hitEl(el, e) || !hoverChannelEnabled(e)) return;
    requestShow(el, st, false);
  };
  st.onOut = (e: Event) => {
    if (!hitEl(el, e) || !hoverChannelEnabled(e)) return;
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { hideTimer = null; hide(); }, HIDE_DELAY);
  };
  st.onTouchDown = (e: Event) => {
    /* 触屏没有 hover 可用、iOS Safari 点按 button 又不派发 focusin——tap 是触屏唯一入口；
       tap 是明确意图而非扫过，立即显示不吃 hover 的 300ms */
    if (!hitEl(el, e) || !touchChannelEnabled(e)) return;
    requestShow(el, st, true);
  };
  st.onFocusIn = () => requestShow(el, st, true);
  st.onFocusOut = () => hide();
}

export const vTip: Directive<HTMLElement, TipValue | null | undefined> = {
  mounted(el, binding) {
    if (typeof window === 'undefined') return; /* SSR 安全 */
    const st = {
      value: binding.value ?? null,
      long: normLong(binding.value, !!binding.modifiers?.long),
    } as HostState;
    /* disabled 控件不派发指针事件：监听挂父级代理（focus 事件本就不含 disabled 控件，挂 el 自身） */
    st.proxy = el.parentElement ?? el;
    makeHandlers(el, st);
    st.proxy.addEventListener('pointerover', st.onOver);
    st.proxy.addEventListener('pointerout', st.onOut);
    st.proxy.addEventListener('pointerdown', st.onTouchDown);
    el.addEventListener('focusin', st.onFocusIn);
    el.addEventListener('focusout', st.onFocusOut);
    hosts.set(el, st);
  },
  updated(el, binding) {
    const st = hosts.get(el);
    if (!st || sameValue(st.value, binding.value)) return;
    st.value = binding.value ?? null;
    st.long = normLong(binding.value, !!binding.modifiers?.long);
    if (currentEl === el && pop && pop.style.display !== 'none') {
      const text = normText(st.value);
      if (!text) { hide(); return; }
      pop.textContent = text;
      pop.classList.toggle('vt-long', st.long);
      position(el, pop);
    }
  },
  unmounted(el) {
    const st = hosts.get(el);
    if (!st) return;
    st.proxy.removeEventListener('pointerover', st.onOver);
    st.proxy.removeEventListener('pointerout', st.onOut);
    st.proxy.removeEventListener('pointerdown', st.onTouchDown);
    el.removeEventListener('focusin', st.onFocusIn);
    el.removeEventListener('focusout', st.onFocusOut);
    hosts.delete(el);
    if (currentEl === el) hide();
  },
};
