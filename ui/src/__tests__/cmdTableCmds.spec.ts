/**
 * R130 一百七十四批：命令面板表格域命令（⌘K 直达 导出/切密度/重置列宽）。
 * 锁定：
 * 1) QRT 行为：可见实例（mock offsetParent——happy-dom 无布局引擎恒 null）响应
 *    export（downloadText CSV+BOM）/dense（245 批复用为行高三档循环+落盘）/无数据导出给 warning；
 * 2) 不可见实例静默丢弃（KeepAlive 后台页/同页隐藏表防误响应，T30）；
 * 3) RT 行为：可见实例响应 export（downloadText 被调）；
 * 4) palette 源码锁：三条 table-cmd 命令在场。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

/* happy-dom 无布局引擎（offsetParent 恒 null、offsetWidth 恒 0）——
   实例级 defineProperty 模拟「可见」，未覆盖的实例即「不可见」 */
function markVisible(rootSel: string) {
  const root = host.querySelector(rootSel) as any;
  Object.defineProperty(root, 'offsetParent', { value: document.body, configurable: true });
}

const fire = (cmd: string) => window.dispatchEvent(new CustomEvent('table-cmd', { detail: { cmd } }));
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('QRT 表格域命令（一百七十四批）', () => {
  it('可见实例 export：downloadText 收 CSV（含表头+BOM）+ notify', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'tc1' });
    markVisible('.qrt');
    fire('export');
    await tick();
    expect(dl).toHaveBeenCalledTimes(1);
    const [name, content, mime, opts] = dl.mock.calls[0] as any[];
    expect(name, '255 批：文件名带可读时间戳').toMatch(/^table-export-\d{8}-\d{6}\.csv$/);
    /* csvCell 全包引号口径（与 RT 导出/复制 TSV 同源） */
    expect(content).toContain('"_id","name","age"');
    expect(content).toContain('"banana"');
    expect(mime).toBe('text/csv');
    expect(opts).toMatchObject({ bom: true });
    dl.mockRestore();
  });

  it('无数据 export 给 warning 不下载', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(QueryResultTable, { hits: [], storageKey: 'tc2' });
    markVisible('.qrt');
    fire('export');
    await tick();
    expect(dl).not.toHaveBeenCalled();
    dl.mockRestore();
  });

  it('可见实例 dense（245 批复用为行高三档循环）：cozy class 落盘；不可见实例静默丢弃', async () => {
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'tc3' });
    markVisible('.qrt');
    fire('dense');
    await tick();
    /* 循环序 紧凑→标准→宽松：默认 standard 首击 → cozy */
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
    expect(localStorage.getItem('es_tbl_rowh')).toBe('cozy'); /* 242 批全局键 */
    /* 不可见：卸载后重挂（不 markVisible），dense 不响应。
       242 批全局键：mount 时从全局记忆恢复 rowH=cozy；fire('dense') 被静默丢弃
       =保持 cozy 不翻转（若误响应会翻到 compact），丢弃语义不变 */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(QueryResultTable, { hits: HITS, storageKey: 'tc3b' });
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
    fire('dense');
    await tick();
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
    expect(host.querySelector('.qrt-tbl')!.classList.contains('dense')).toBe(false);
  });
});

describe('RT 表格域命令（一百七十四批）', () => {
  it('可见实例 export：downloadText 被调；不可见不响应', async () => {
    const mod = await import('../utils/format');
    const dl = vi.spyOn(mod, 'downloadText').mockImplementation(() => {});
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'tc-rt' });
    markVisible('.rt');
    fire('export');
    await tick();
    expect(dl).toHaveBeenCalledTimes(1);
    /* 重挂为不可见实例 */
    dl.mockClear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(ResultTable, { hits: HITS, total: 2, index: 'tc-rt2' });
    fire('export');
    await tick();
    expect(dl).not.toHaveBeenCalled();
    dl.mockRestore();
  });
});

describe('命令面板表格命令源码锁（一百七十四批；228 批 M3 dispatchTableCmd 协商）', () => {
  it('三条 table-cmd 命令在场（导出/密度/重置列宽）+ markHandled 协商', () => {
    const s = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');
    /* 228 批 M3：三条命令统一走 dispatchTableCmd（内含 table-cmd 广播 + markHandled 协商） */
    expect(s.match(/dispatchTableCmd\('/g)?.length).toBeGreaterThanOrEqual(3);
    expect(s).toContain("'table-cmd'");
    expect(s).toContain("dispatchTableCmd('export')");
    expect(s).toContain("dispatchTableCmd('dense')");
    expect(s).toContain("dispatchTableCmd('reset-widths')");
    /* 228 批 M3：无人认领显式提示（此前不可见表格静默吞命令） */
    expect(s).toContain('markHandled');
    expect(s).toContain('当前页面没有可见的结果表格');
  });
});
