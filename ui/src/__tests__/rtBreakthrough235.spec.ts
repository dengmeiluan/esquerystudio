/**
 * 二百三十五批：RT 侧破窗点落地——P2-10 双击列缘自适应 / XLSX 导出接线 / PNG 快照。
 * 锁定：
 * 1) 双击列缘 resize 柄 → 触发 fitCol（colWidths 落值），语义自「重置」互换为「自适应」；
 * 2) 右键切默认格式 XLSX → 点导出 → downloadBlob 收 .xlsx（PK 头字节）+ notify；
 * 3) 快照钮 → snapshotTableToPng 被调（html-to-image mock——happy-dom 无布局引擎）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findMenuItem } from './helpers/ctxMenu'; /* 1142：二级菜单取项 */
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import { snapshotTableToPng } from '../utils/tableSnapshot';
import type { SearchHit } from '../types';

/* html-to-image 在 happy-dom 无布局引擎不可真跑——mock 掉，锁接线而非像素 */
vi.mock('../utils/tableSnapshot', () => ({ snapshotTableToPng: vi.fn().mockResolvedValue(true) }));

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'xw1', ...props }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 破窗点接线（235 批）', () => {
  it('P2-10：双击列缘语义=自适应（不再重置：既有宽度不被清；绑定锁 @dblclick=fitCol）', async () => {
    /* 预置列宽记忆（fitCol 采样 scrollWidth 在 happy-dom 恒 0，真实自适应留真机单；
       此处锁「双击≠重置」的语义互换——旧实现 dblclick=resetColWidth 会删掉该列宽） */
    localStorage.setItem('es_tbl_w:xw1', JSON.stringify({ name: 300 }));
    await mountTbl();
    const th = [...host.querySelectorAll('thead th.rt-th')].find(t => (t as HTMLElement).dataset.col === 'name')!;
    const rs = th.querySelector('.rt-rs') as HTMLElement;
    rs.dispatchEvent(new Event('dblclick', { bubbles: true }));
    await tick();
    const saved = JSON.parse(localStorage.getItem('es_tbl_w:xw1') || '{}');
    expect(saved.name).toBe(300); // 旧语义此处会被清成 undefined
    /* 源码锁：绑定是 fitCol 而非 resetColWidth */
    const src = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
    expect(src).toContain('@dblclick="fitCol(c)"');
  });

  it('XLSX 导出：右键切默认格式→导出→downloadBlob 收 PK 头字节', async () => {
    const dl = vi.spyOn(await import('../utils/format'), 'downloadBlob').mockImplementation(() => {});
    await mountTbl();
    /* 右键切默认格式 XLSX */
    const td = host.querySelector('td.rt-cell') as HTMLElement;
    td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    /* 1142：导出格式项住「列与导出…」二级 */
    const fmtBtn = await findMenuItem('导出格式：XLSX');
    expect(fmtBtn, '右键格式组应有 XLSX').toBeTruthy();
    (fmtBtn as HTMLElement).click();
    await tick();
    /* 点工具条导出钮 */
    const expBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('导出') && b.querySelector('.rt-exp-btn-t'))!;
    (expBtn as HTMLElement).click();
    await tick();
    expect(dl).toHaveBeenCalledTimes(1);
    const [name, blob] = dl.mock.calls[0] as [string, Blob];
    expect(name, '255 批：文件名带可读时间戳').toMatch(/^xw1-page-\d{8}-\d{6}\.xlsx$/);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect(String.fromCharCode(head[0], head[1])).toBe('PK');
    dl.mockRestore();
  });

  it('快照钮：snapshotTableToPng 被调（html-to-image mock）', async () => {
    const spy = vi.mocked(snapshotTableToPng);
    spy.mockClear();
    await mountTbl();
    /* 1148：快照从工具行移入「视图 ⋯」菜单（低频分享动作不常驻）；先开菜单再取项 */
    const viewBtn = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '视图设置') as HTMLElement;
    expect(viewBtn, '工具条应有「视图 ⋯」').toBeTruthy();
    viewBtn.click();
    await tick();
    const snapBtn = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '表格快照 PNG') as HTMLElement;
    expect(snapBtn, '视图菜单里应有快照项').toBeTruthy();
    snapBtn.click();
    await tick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1], '255 批：快照名带可读时间戳').toMatch(/^xw1-snapshot-\d{8}-\d{6}\.png$/);
  });
});
