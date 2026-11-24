/**
 * 1201 接线面：stats 聚合行必须真的渲染出字段选择器（不只是表里有名字）。
 * 纯表断言绿 ≠ UI 有位——本仓库已有"函数对但没接上"的先例，这里补挂载验证。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import AggTreeNode from '../components/builder/AggTreeNode.vue';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mount(op: string, body: any) {
  host = document.createElement('div'); document.body.appendChild(host);
  const node = {
    id: 'a1', type: 'agg', op, name: 'a', body, meta: {},
    children: [], params: {},
  };
  const app = createApp({
    render: () => h(AggTreeNode as any, {
      node, fields: ['score', 'title'], types: { score: 'double', title: 'text' },
    }),
  });
  apps.push(app); app.mount(host);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return host;
}

afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1201 stats 的字段行真的渲染', () => {
  it('stats 行出字段选择器（与 avg 同形）', async () => {
    await mount('stats', { field: 'score' });
    const sel = document.querySelector('.agn input, .agn .fs-trigger, .agn [class*=fs-]');
    expect(sel, 'stats 必须有字段选择器').toBeTruthy();
  });

  it('matrix_stats 不出字段行（它的主键是 fields 数组，不是 field）', async () => {
    await mount('matrix_stats', { fields: ['score', 'title'] });
    const label = document.querySelector('.agn');
    expect(label).toBeTruthy();
    /* 不该出现单值 field 的输入位：body 里的 fields 是数组，走自由表 */
    const inputs = document.querySelectorAll('.agn .fs-trigger, .agn input[class*=fs]');
    expect(inputs.length, 'matrix_stats 不得给单值 field 假入口').toBe(0);
  });
});
