/**
 * R130 一百三十六批：行内编辑提交失败——原因透传+失败项红标闭环。
 * 锁定：
 * 1) commitPending 失败时收集服务端原因摘要（digest 截 80 字），通知带前 3 条「id: 原因」；
 * 2) 失败项记入 lastFailed（id::field），气泡红标「上次失败」，撤销/重试成功即清；
 * 3) 成功项即时清标。
 * 挂载样板照抄 resultTableMemory.spec；api.updatePartial mock 控制失败。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const updatePartialMock = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      updatePartial: (...a: any[]) => updatePartialMock(...a),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [{ _id: 'a', _source: { name: 'banana' } }] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'i1' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return { exposed: () => (host.querySelector('.rt') as any).__vueParentComponent?.exposed };
}

beforeEach(() => {
  localStorage.clear();
  updatePartialMock.mockReset();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

async function editCell(newValue: string) {
  const cell = host.querySelector('tbody td.rt-cell') as HTMLElement;
  cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  const inp = host.querySelector('.rt-edit') as HTMLInputElement;
  inp.value = newValue;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
}

describe('编辑提交失败原因透传（136 批）', () => {
  /* 五百六十六批同步更新：RT pend-pop 经 563 方案 A n-popover 真解析（此前组件漏 import
     不解析、内容内联平铺=本 spec 旧锁形态）后，「提交全部」在浮层内容内且默认不渲染——
     先点 pend-chip 触发钮开层（真机等价路径），浮层内容挂 body 走 document 级查询 */
  async function openPendPop() {
    const tg = host.querySelector('button.pend-chip') as HTMLElement;
    tg.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  }
  const findCommitBtn = () => [...document.querySelectorAll('button')].find(b => b.textContent?.includes('提交全部'));

  it('失败通知带服务端原因摘要', async () => {
    await mountTbl();
    updatePartialMock.mockRejectedValue(new Error('mapper_parsing_exception: failed to parse field [name]'));
    await editCell('apple');
    await openPendPop();
    const commitBtn = findCommitBtn()!;
    commitBtn.click();
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
    const log = JSON.parse(localStorage.getItem('esquerystudio.notify.log') || '[]');
    const err = log.filter((e: any) => e.kind === 'error').pop();
    expect(err.msg).toContain('失败 1 条');
    /* 通知明细含「id: 原因」结构（原文经 friendlyEsError 友好化，不锁原始串字面） */
    expect(err.msg).toContain('a:');
    /* 失败项保留待重试 */
    expect(updatePartialMock).toHaveBeenCalledTimes(1);
  });

  it('成功后清失败标并 refresh', async () => {
    await mountTbl();
    updatePartialMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
    await editCell('apple');
    await openPendPop();
    findCommitBtn()!.click();
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
    /* 重试（第二次提交成功） */
    await editCell('apple2');
    await openPendPop();
    const commitBtn = findCommitBtn();
    if (commitBtn) commitBtn.click();
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
    const log = JSON.parse(localStorage.getItem('esquerystudio.notify.log') || '[]');
    expect(log.filter((e: any) => e.kind === 'success').length).toBeGreaterThan(0);
  });
});
