/* 1041 批：日期区间快选 chips（时间窗心智）——公告/研报/舆情类查询的最高频手势
   是「发布时间窗」一击成窗：date 字段 range 条件给 近7天/近30天/近90天/近一年/今年
   五枚快选钮，点击即写 gte（相对锚）+lte=now 完整窗口；keyword 等非日期字段零增量。
   date-math 锚往返无损（AST 零改动）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1041 时间窗快选接线', () => {
  it('ClauseNode：cn-rchips 行 + DATE_CHIPS 五枚 + isDateRange 门控', () => {
    const src = srcOf('components/builder/ClauseNode.vue');
    expect(src).toContain('cn-rchips');
    expect(src).toContain('isDateRange');
    expect(src).toMatch(/近7天/);
    expect(src).toMatch(/近30天/);
    expect(src).toMatch(/近一年/);
  });
});

describe('1041 时间窗往返无损（AST 零改动回归）', () => {
  roundTrip('date range 快选窗口形态', {
    query: { range: { created_at: { gte: 'now-7d/d', lte: 'now' } } },
  });
  roundTrip('date range 仅下界形态', {
    query: { range: { created_at: { gte: 'now-30d/d' } } },
  });
});

describe('1041 快选动线（挂载）', () => {
  it('date 字段五枚快选在场；点 近7天 → gte/lte 完整窗口；再点 今年 → 窗口更新', async () => {
    const { createApp, h } = await import('vue');
    const ClauseNode = (await import('../components/builder/ClauseNode.vue')).default;
    const node: any = { id: 'n1', type: 'leaf', op: 'range', field: 'created_at', value: {}, params: {}, raw: null };
    let last: any = null;
    const nodeRef = (await import('vue')).ref(node);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(ClauseNode as any, {
      node: nodeRef.value, fields: ['created_at'], types: { created_at: 'date' },
      'onUpdate:node': (n: any) => { nodeRef.value = n; last = n; },
      onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    const chips = Array.prototype.map.call(host.querySelectorAll('.cn-rchip'), (b: HTMLElement) => (b.textContent || '').trim());
    expect(chips, '五枚快选在场').toEqual(['近7天', '近30天', '近90天', '近一年', '今年']);
    // 点 近7天 → 完整窗口
    const c7 = host.querySelectorAll('.cn-rchip')[0] as HTMLButtonElement;
    c7.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.value).toEqual({ gte: 'now-7d/d', lte: 'now' });
    // 再点 今年 → 窗口更新（gte 换锚）
    const cy = host.querySelectorAll('.cn-rchip')[4] as HTMLButtonElement;
    cy.click();
    await new Promise(r => setTimeout(r, 30));
    expect(last && last.value).toEqual({ gte: 'now/y', lte: 'now' });
    app.unmount();
    host.remove();
  });
  it('keyword 字段零增量（无快选）', async () => {
    const { createApp, h } = await import('vue');
    const ClauseNode = (await import('../components/builder/ClauseNode.vue')).default;
    const node: any = { id: 'n2', type: 'leaf', op: 'range', field: 'level', value: {}, params: {}, raw: null };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(ClauseNode as any, {
      node, fields: ['level'], types: { level: 'keyword' },
      'onUpdate:node': () => {}, onRemove: () => {}, onDuplicate: () => {}, onWrap: () => {},
    }) });
    app.mount(host);
    await new Promise(r => setTimeout(r, 30));
    expect(host.querySelector('.cn-rchips'), '非日期字段无快选').toBeNull();
    app.unmount();
    host.remove();
  });
});
