/* W2 ：弹层列表 headless 骨架——FieldPicker/SettingsKeyInput 双实例同构抽取（行为保持型重构）。
 抽取面（两组件现状骨架交集，行为零增量下沉）：
 open/cursor 状态与 openPanel/close 语义；↑↓ 钳位导航 + scrollToCur；
 place() fixed 定位（minWidth/上下翻转阈值参数化——两实例数值分歧：280/260/280 与 340/280/300）；
 onKey 骨架：IME isComposing 守卫 → Esc 关层 → 面板关时 ↑↓ 开层 → 面板关时 Enter 透发（onEnter 可选）
 → ↑↓ 移 cursor → Enter 三段语义（有候选→onChoose 委托；无候选→收面板+onEnter 透发）；
 onDocDown 点击外部关闭（document mousedown 注册/注销随组件生命周期，内部收口不暴露）；
 listId 实例级唯一 id（aria combobox 关联，前缀参数化保持各实例命名语义）；
 Teleport 挂载点双模式（teleport|inplace——通用约定 8 容器边界载体；FieldPicker 现有 :to prop 逻辑下沉，
 缺省 'body' 即 SettingsKeyInput 现状）。
 分歧面（留组件侧，不进骨架）：
 items 数据源/过滤排序、行渲染与 hint 行、choose 具体回填（v-model/picked emit）、onInput 的 emit 部分、
 FieldPicker multi 段逻辑（applySeg）与 ensure 拉数（走 onOpen 钩子）、SettingsKeyInput 无 enter 透发
 （onEnter 缺省即不透发）。模板外壳不抽：各组件 hint 态与行渲染分歧大，留 ~18 行重复是可接受代价。 */
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

/** place() 定位参数：两实例分歧数值（FieldPicker 280/260/280 为默认；SettingsKeyInput 显式传 340/280/300） */
type PopupListPlace = {
  /** 弹层最小宽度（与锚元素宽度取大），默认 280 */
  minWidth?: number;
  /** 下方空间不足该值时考虑上翻，默认 260 */
  flipBelow?: number;
  /** 上翻条件之二：锚上方空间需大于该值，默认 280 */
  flipTop?: number;
};

type PopupListOpts<T> = {
  /** 当前候选（组件 computed 闭包传入，骨架只读消费） */
  items: () => T[];
  /** Enter 命中高亮项的选择委托（具体回填由调用方 choose 实现，关层用骨架返回的 close） */
  onChoose: (item: T) => void;
  /** enter 透发委托：无候选 Enter（收面板后）与面板关 Enter；缺省 = 不透发（SettingsKeyInput 现状） */
  onEnter?: () => void;
  /** 开层钩子（FieldPicker 的 ensure 拉字段清单走这里；同步调用即可） */
  onOpen?: () => void;
  /** 弹层挂载点：非空 string = Teleport 目标；false/空 = 就地渲染（跳过 place 的 fixed 坐标计算）。缺省 'body' */
  to?: () => string | false;
  /** 自定义定位锚点；返回 null/undefined 时跳过定位。缺省使用 rootEl */
  anchor?: () => HTMLElement | null | undefined;
  /** listId 前缀（保持各实例 aria id 命名语义：fxp-/skp-），默认 'pl' */
  idPrefix?: string;
  /** scrollToCur 定位高亮行的选择器（各实例 class 分歧：'.fxp-item.act'/'.skp-item.act'），默认 '.pl-item.act' */
  activeSelector?: string;
  /** place() 定位参数（分歧数值见 PopupListPlace） */
  place?: PopupListPlace;
};

export function usePopupList<T>(opts: PopupListOpts<T>) {
  const rootEl = ref<HTMLElement>();
  const listEl = ref<HTMLElement>();
  const open = ref(false);
  const cursor = ref(0);
  const popStyle = ref<Record<string, string>>({});

  /* Teleport 挂载点与开关分离：disabled 时 to 值被忽略，但仍需喂合法 string */
  const teleportTo = computed(() => {
    const t = opts.to ? opts.to() : 'body';
    return typeof t === 'string' && t ? t : 'body';
  });
  const inplace = computed(() => !(opts.to ? opts.to() : 'body'));

  /* combobox aria 关联用实例唯一 id（aria-controls / aria-activedescendant） */
  const listId = (opts.idPrefix || 'pl') + '-' + Math.random().toString(36).slice(2, 8);
  const itemId = (i: number) => listId + '-' + i;

  /* v3.0.0 纠错：候选集异步缩短（terms 回来/字段清单异步收窄）时高亮可能悬空——
 onInput 已复位 0 的组件不受影响，但 async 数据源（LuceneInput 值段/FieldPicker ensure）
 到位发生在输入之后，cursor 指向已消失项造成高亮错位（Enter 有 undefined 守卫不误选，
 视觉错）。watch 钳位到合法区间。 */
  watch(cursor, (c) => {
    const n = opts.items().length;
    if (n === 0) { if (c !== 0) cursor.value = 0; return; }
    if (c >= n) cursor.value = n - 1;
  });

  function place() {
    const r = (opts.anchor ? opts.anchor() : rootEl.value)?.getBoundingClientRect();
    if (!r) return;
    const minW = opts.place?.minWidth ?? 280;
    const flipBelow = opts.place?.flipBelow ?? 260;
    const flipTop = opts.place?.flipTop ?? 280;
    const w = Math.max(r.width, minW);
    /* T7b 评审修复：视口窄于弹层时 innerWidth - w - 8 为负，left 无下钳位会左溢出屏外——补 Math.max(8, …) */
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = window.innerHeight - r.bottom;
    popStyle.value = below < flipBelow && r.top > flipTop
      ? { left: left + 'px', bottom: (window.innerHeight - r.top + 4) + 'px', width: w + 'px' }
      : { left: left + 'px', top: (r.bottom + 4) + 'px', width: w + 'px' };
  }

  function openPanel() {
    open.value = true;
    cursor.value = 0;
    /* 就地模式弹层走 absolute 随根定位，place() 的 fixed 坐标计算不需要 */
    if (!inplace.value) place();
    opts.onOpen?.();
  }

  function close() {
    open.value = false;
  }

  function onKey(e: KeyboardEvent) {
    /* IME 组合态守卫：拼音态 Enter 是提交 IME 原文，不许误走 onChoose 替换手输 */
    if (e.isComposing) return;
    if (e.key === 'Escape') { open.value = false; return; }
    if (!open.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { openPanel(); return; }
    /* Enter 三段语义之「面板关」：透发 enter 让宿主接回快捷键（如场景任务的 Enter 生成） */
    if (e.key === 'Enter' && !open.value) { opts.onEnter?.(); return; }
    if (!open.value) return;
    const list = opts.items();
    /* T7b 评审修复：空列表 length-1=-1，↓ 会把 cursor 压成 -1——补 Math.max(0, …)（↑ 侧本就有 0 钳位） */
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor.value = Math.max(0, Math.min(cursor.value + 1, list.length - 1)); scrollToCur(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor.value = Math.max(cursor.value - 1, 0); scrollToCur(); }
    else if (e.key === 'Enter') {
      const it = list[cursor.value];
      /* 有高亮项取高亮（不透发 enter）；无匹配保留手输值收面板并透发 enter（脚本字段/未映射字段场景） */
      if (it && list.length) { e.preventDefault(); opts.onChoose(it); }
      else { open.value = false; opts.onEnter?.(); }
    }
  }

  function scrollToCur() {
    nextTick(() => listEl.value?.querySelector(opts.activeSelector || '.pl-item.act')?.scrollIntoView({ block: 'nearest' }));
  }

  /* 点击外部关闭：弹层 Teleport 在 body 下时，弹层自身 mousedown 需 .prevent.stop（模板侧既有处理），
 否则这里的 document 层判定会先关面板导致 click 选项丢失 */
  function onDocDown(e: MouseEvent) {
    if (!rootEl.value?.contains(e.target as Node)) open.value = false;
  }
  onMounted(() => document.addEventListener('mousedown', onDocDown));
  onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown));

  /* scrollToCur 不进返回面：仅 onKey 内部调用，无组件消费（返回面 13→12） */
  return { open, cursor, popStyle, teleportTo, inplace, listId, itemId, rootEl, listEl, openPanel, close, onKey };
}
