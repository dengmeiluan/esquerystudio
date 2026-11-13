/**
 * 1142 共享测试助手：单元格右键菜单收成两级后，动作项住在分组二级里。
 *
 * 提供：
 * - topLabels()：仅一级可见项（含分组父行）
 * - groupLabelOf(label)：某动作项所属一级分组（找不到返回 null）
 * - allLabels()：一级 + 逐个展开各分组收集的二级项（能力面完整性断言用）
 * - clickMenuItem(label)：按 label 点动作项（必要时先展开其分组）
 *
 * 范式：菜单 teleport 到 body → 一律在 document 上查。
 */
import { nextTick } from 'vue';

async function turn(n = 6) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

export function menuRoot(): HTMLElement | null {
  return document.querySelector('.ccm-mask');
}

export function topButtons(): HTMLButtonElement[] {
  const root = menuRoot();
  if (!root) return [];
  return [...root.querySelectorAll(':scope > .ccm > .ccm-it')] as HTMLButtonElement[];
}

export function topLabels(): string[] {
  return topButtons().map(b => (b.textContent ?? '').trim());
}

/* 二级面板按父项常驻 DOM（v-show 切换），取项只看当前可见的那个面板 */
function visibleSubRoots(): HTMLElement[] {
  return ([...document.querySelectorAll('.ccm-sub')] as HTMLElement[])
    .filter(el => (el as HTMLElement).style.display !== 'none');
}

export function subButtons(): HTMLButtonElement[] {
  return visibleSubRoots().flatMap(el => [...el.querySelectorAll('.ccm-it')] as HTMLButtonElement[]);
}

/** 可见二级面板数（Esc 两段/开合断言用） */
export function openSubCount(): number {
  return visibleSubRoots().length;
}

function labelOf(b: HTMLButtonElement) { return (b.textContent ?? '').trim(); }

export async function openGroup(name: string): Promise<boolean> {
  const parent = topButtons().find(b => labelOf(b).includes(name) && b.getAttribute('aria-haspopup') === 'menu');
  if (!parent) return false;
  parent.click();
  await turn();
  return true;
}

/** 一级 + 逐个分组展开后的二级 label 并集（每次重新展开，避免依赖当前开层状态） */
export async function allLabels(): Promise<string[]> {
  const out = topLabels();
  const groups = topButtons().filter(b => b.getAttribute('aria-haspopup') === 'menu');
  for (const g of groups) {
    g.click();
    await turn(3);
    for (const s of subButtons()) out.push(labelOf(s));
  }
  return out;
}

/** 点动作项：先找二级（必要时逐个分组展开），再回落一级 */
export async function clickMenuItem(label: string): Promise<boolean> {
  const direct = subButtons().find(b => labelOf(b).includes(label));
  if (direct) { direct.click(); await turn(); return true; }
  const groups = topButtons().filter(b => b.getAttribute('aria-haspopup') === 'menu');
  for (const g of groups) {
    g.click();
    await turn(3);
    const hit = subButtons().find(b => labelOf(b).includes(label));
    if (hit) { hit.click(); await turn(); return true; }
  }
  const top = topButtons().find(b => labelOf(b).includes(label));
  if (top) { top.click(); await turn(); return true; }
  return false;
}

/** 找动作项（不点击）——二级优先，必要时展开分组 */
export async function findMenuItem(label: string): Promise<HTMLButtonElement | null> {
  const direct = subButtons().find(b => labelOf(b).includes(label));
  if (direct) return direct;
  const groups = topButtons().filter(b => b.getAttribute('aria-haspopup') === 'menu');
  for (const g of groups) {
    g.click();
    await turn(3);
    const hit = subButtons().find(b => labelOf(b).includes(label));
    if (hit) return hit;
  }
  return topButtons().find(b => labelOf(b).includes(label)) ?? null;
}
