/**
 * 五百一十九批：QRT 四缺口补齐行为锁（RT 236 批列详情 / 162 批全列适应 / 130 批矩阵复制的对位合并）。
 * 锁定：
 * 1) 列头右键「列详情」→ 共享 ColDetailModal（.rt-cd）显示去重/高频值（数值口径 fieldTypes 优先）；
 * 2) 列头右键「全列适应内容」项存在（happy-dom 无布局引擎 scrollWidth=0 安全 no-op 不写宽）；
 * 3) 单元格右键「复制整表（当前页）为 TSV」→ 剪贴板=表头行+全量行（sortedRows 口径，含未渲染行序）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

const HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'banana', age: 1 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

const thOf = (col: string) =>
  [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes(col)) as HTMLElement;

async function openColMenu(col: string) {
  thOf(col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  await tick(4);
}
/* 1142：动作项住分组二级——helper 按需展开 */
import { findMenuItem } from './helpers/ctxMenu';
const menuButtons = () => [...document.querySelectorAll('.ccm-mask .ccm-it')] as HTMLButtonElement[];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('QRT 列详情/全列适应/整表复制（五百一十九批）', () => {
  it('列头右键「列详情」→ 共享弹窗统计（去重/高频值；数值列 Σ 走 fieldTypes 口径）', async () => {
    await mountTbl({ hits: HITS, storageKey: 'qcd1', fieldTypes: { age: 'long' } });
    await openColMenu('name');
    const btn = menuButtons().find(b => b.textContent?.includes('列详情'));
    expect(btn, '列头右键应有「列详情」').toBeTruthy();
    btn!.click();
    await tick(6);
    const card = document.body.querySelector('.rt-cd') as HTMLElement | null;
    expect(card, '列详情弹窗应打开（共享 ColDetailModal）').toBeTruthy();
    expect(card!.textContent).toContain('name');
    /* name: banana×2 + apple → 去重 2、高频 banana 2 行 */
    expect(card!.textContent).toContain('banana');
    /* 数值口径：age 类型 long → 数字字符串/数值均可统计——此处 age 全 number，Σ=6 avg=2 */
    await openColMenu('age');
    (menuButtons().find(b => b.textContent?.includes('列详情')) as HTMLElement).click();
    await tick(6);
    const card2 = document.body.querySelector('.rt-cd') as HTMLElement;
    expect(card2.textContent).toContain('6');
    expect(card2.textContent).toContain('2.00');
  });

  it('列头右键含「全列适应内容」；happy-dom 下 scrollWidth=0 安全 no-op 不写宽', async () => {
    await mountTbl({ hits: HITS, storageKey: 'qcd2' });
    await openColMenu('name');
    const fitAll = menuButtons().find(b => b.textContent?.includes('全列适应内容'));
    expect(fitAll, '列头右键应有「全列适应内容」').toBeTruthy();
    fitAll!.click();
    await tick(8);
    expect(JSON.parse(localStorage.getItem('es_tbl_w:qcd2') || '{}')).toEqual({});
  });

  it('单元格右键「复制整表（当前页）为 TSV」→ 表头+全量行（含未勾选语义）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl({ hits: HITS, storageKey: 'qcd3', sortable: true });
    const cell = host.querySelector('tbody tr:first-child td.qrt-cell') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick(4);
    /* 1142：整表 TSV 住「复制…」二级 */
    const btn = await findMenuItem('复制整表（当前页）为 TSV');
    expect(btn, '单元格右键应有「复制整表」').toBeTruthy();
    (btn as HTMLButtonElement).click();
    await tick(6);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('_id\tname\tage\na\tbanana\t2\nb\tapple\t3\nc\tbanana\t1');
  });
});
