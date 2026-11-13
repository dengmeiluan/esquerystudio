import { ref, watch, type Ref } from 'vue';

/* 键盘行导航共享内核——ResultTable（48 批）同构逻辑合并，
 QueryResultTable 同步接入（含滚动跟随）。语义口径与 48 批 ResultTable 完全一致：
 容器获焦后 ↑↓/Home/End 移动高亮行；输入框聚焦 / guard()===false（如行内编辑中）不接管；
 行集变化自动钳位；失焦清高亮。滚动跟随（scrollIntoView）由调用方自行接线——
 只有调用方知道自己哪层容器在滚。
 注：XmigrateView 已换壳 QRT rows 型（行导航由 QRT 内核的 useRowNav
 承担），此前的 Xmigrate 专用键控复合行为随换壳退役（(b) 注释事实
 修正：全库已无该键控字面）。
 内核补可选 onEnter/onCopy 回调（焦点行 Enter=打开详情、Ctrl+C=复制行，
 Xmigrate 同语义），调用方接线后行导航从「只能移动」升级为「移动+操作」。
 裁决：Enter 有激活语义而 Space 刻意不加——消费容器（.ih-list/.rt）皆
 scroll 滚层，滚层 Space=滚动是平台惯例；行级激活由行内 role=button 双键齐备承接，
 内核加 Space 反伤滚动习惯（spaceGuard829 负向锁看守）。 */
export function useRowNav(
  rowCount: Ref<number>,
  opts?: { guard?: () => boolean; onEnter?: (i: number) => void; onCopy?: (i: number) => void },
) {
  const focusIdx = ref(-1);
  const tblFocus = ref(false);

  function onRowNavKey(e: KeyboardEvent) {
    /* 输入焦点让路（键盘闭环）：INPUT/TEXTAREA 之外，SELECT 聚焦时 ↑↓ 是原生换选项、
 contentEditable 是文本编辑——都不该被行导航截胡 */
    const ael = document.activeElement as HTMLElement | null;
    const tag = ael?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ael?.isContentEditable || opts?.guard?.() === false) return;
    const n = rowCount.value;
    if (!n) return;
    if (e.key === 'ArrowDown') { focusIdx.value = Math.min(n - 1, focusIdx.value + 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { focusIdx.value = Math.max(0, focusIdx.value - 1); e.preventDefault(); }
    else if (e.key === 'Home') { focusIdx.value = 0; e.preventDefault(); }
    else if (e.key === 'End') { focusIdx.value = n - 1; e.preventDefault(); }
    else if (e.key === 'Enter' && opts?.onEnter && focusIdx.value >= 0) { e.preventDefault(); opts.onEnter(focusIdx.value); }
    else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && opts?.onCopy && focusIdx.value >= 0) { e.preventDefault(); opts.onCopy(focusIdx.value); }
  }

  watch(rowCount, (n) => { if (focusIdx.value >= n) focusIdx.value = n - 1; });
  watch(tblFocus, (on) => { if (!on) focusIdx.value = -1; });

  return { focusIdx, tblFocus, onRowNavKey };
}
