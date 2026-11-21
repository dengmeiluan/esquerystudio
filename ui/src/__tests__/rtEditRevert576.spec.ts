/**
 * 五百七十六批·用户实报：表格就地编辑「二次编辑没变化」——pending 在场时改回原值被静默吞。
 *
 *  现象（用户截图+口述「表格编辑，二次编辑，编辑没发生变化」）：第一次编辑 1→0 进
 *  pending（显示 0+原值删除线+工具行待提交徽标）；二次双击同格改回 1 → applyEdit 同值
 *  短路以 hit._source 原值为唯一基准（显示与编辑初值基准却是 displayVal=pending.newVal）
 *  → 静默 return 且 pending 残留——用户输入被无视，格子纹丝不动，编辑路径无法到达撤销。
 *
 *  修复契约：同值短路分支区分两态——pending 在场=「改回原值=撤销语义」，接 revertOne
 *  （撤销钮同款单格 API：删条目+清 lastFailed），显示回原值+徽标减数；pending 不在场
 *  =真无操作短路维持。三用例：①复现实报（修复前红）②二次编辑改新值覆盖 pending（正向，
 *  防修复误伤覆盖语义）③无 pending 同值编辑零扰动（真短路防回归）。
 *
 *  挂载样板照抄 commitFailReason.spec（136 批）：me=null 时 canWrite 恒 true 免 auth 铺设；
 *  updatePartial mock 控提交链（本 spec 三用例均不点提交，mock 仅堵网络出口）。
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

const HITS: SearchHit[] = [{ _id: 'a', _source: { n: 1 } }] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl() {
  const app = createApp({ setup: () => () => h(ResultTable as any, { hits: HITS, total: 1, index: 'i1' }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
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

const cellTextOf = () => (host.querySelector('tbody td.rt-cell') as HTMLElement)?.textContent?.trim() ?? '';
const pendChipIn = () => !!host.querySelector('button.pend-chip');

describe('五百七十六批·就地编辑二次编辑（pending 在场改回原值=撤销语义）', () => {
  it('复现实报：1→0 进 pending 后二次编辑改回 1——pending 撤销清空，格子回原值', async () => {
    await mountTbl();
    /* 第一次编辑：1→0，进 pending（徽标在场+格子显示 0） */
    await editCell('0');
    expect(pendChipIn(), '第一次编辑后待提交徽标在场').toBe(true);
    expect(cellTextOf()).toContain('0');
    /* 二次编辑：改回原值 1——修复前同值短路静默吞，pending 残留显示仍 0（用户实报形态） */
    await editCell('1');
    expect(pendChipIn(), '改回原值=撤销语义，待提交徽标应消失').toBe(false);
    expect(cellTextOf(), '格子显示应回到 _source 原值 1').toContain('1');
    expect(cellTextOf()).not.toContain('0');
  });

  it('正向防误伤：pending 在场二次编辑改成新值——覆盖 pending（oldVal 基准不变），不撤销', async () => {
    await mountTbl();
    await editCell('0');
    await editCell('2');
    expect(pendChipIn(), '二次编辑新值应保留待提交徽标').toBe(true);
    expect(cellTextOf()).toContain('2');
    /* 提交体=最新值 2（覆盖语义），updatePartial 未点提交零调用 */
    expect(updatePartialMock).not.toHaveBeenCalled();
  });

  it('真短路防回归：无 pending 时同值编辑零扰动（不凭空造撤销/徽标）', async () => {
    await mountTbl();
    await editCell('1');
    expect(pendChipIn(), '同值编辑不产生待提交徽标').toBe(false);
    expect(cellTextOf()).toContain('1');
    expect(updatePartialMock).not.toHaveBeenCalled();
  });
});
