/* 1143：表格级视图开关（聚合行 / 转置 / 语义格式化）已从列头菜单归位到工具行「视图 ⋯」。
   测试统一经此 helper 打开菜单并点项，避免每处各写一套选择器。 */
import { nextTick } from 'vue';

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/** 打开「视图 ⋯」菜单（工具行右簇 aria-label="视图设置"） */
export async function openViewMenu(root: ParentNode = document): Promise<boolean> {
  const btn = [...root.querySelectorAll('button')]
    .find(b => b.getAttribute('aria-label') === '视图设置') as HTMLButtonElement | undefined;
  if (!btn) return false;
  btn.click();
  await tick();
  return true;
}

/** 视图菜单里的表格级开关按钮（aria-label 以「聚合行/转置视图/语义格式化」开头） */
export function viewSwitch(label: '聚合行' | '转置视图' | '语义格式化', root: ParentNode = document): HTMLButtonElement | null {
  const items = [...root.querySelectorAll('.qrt-menu button, .rt-menu button')] as HTMLButtonElement[];
  return items.find(b => (b.getAttribute('aria-label') ?? '').startsWith(label))
    ?? items.find(b => (b.textContent ?? '').includes(label))
    ?? null;
}

/** 打开视图菜单并点开关（幂等：菜单已开时直接点） */
export async function toggleViewSwitch(label: '聚合行' | '转置视图' | '语义格式化', root: ParentNode = document): Promise<boolean> {
  if (!viewSwitch(label, root)) await openViewMenu(root);
  const btn = viewSwitch(label, root);
  if (!btn) return false;
  btn.click();
  await tick();
  return true;
}
