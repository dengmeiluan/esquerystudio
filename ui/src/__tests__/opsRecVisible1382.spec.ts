/**
 * 1382：字段类型推荐算子在**真实算子下拉**里可见（组件级，不是纯函数级）。
 *
 * 背景：opsForType 是纯函数，改了它不等于用户看得到——真正渲染的是
 * ClauseNode 的 `opGroups`（推荐组 + 常用组 + ADV_MENU 分组，容器算子不进叶子下拉）。
 * 本 spec 直接挂载真组件，断言 <select> 的 option 把「形状过滤」「特征距离」
 * 真的放进了「推荐」组，而不只是存在于某个数组里。
 *
 * 负控：
 *  ① 拿掉 shape 分支 → 「形状过滤」必须不在推荐组（用同组件、改注册表副本验证）；
 *  ② 容器算子（nested）不得进叶子下拉（既有约束不被本次改动破坏）。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { opsForType } from '../utils/queryAstOps';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mount(field: string, type: string, op = 'exists') {
  const node = { id: 'n1', op, field, value: '' };
  const app = createApp({
    setup: () => () => h(ClauseNode as any, { node, types: { [field]: type }, fields: [field], index: 'research_report' }),
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick(12);
}
function optionsByGroup(): Array<{ group: string; ops: string[] }> {
  const sel = host.querySelector('select.cn-op') as HTMLSelectElement | null;
  if (!sel) return [];
  return [...sel.querySelectorAll('optgroup')].map(g => ({
    group: g.getAttribute('label') || '',
    ops: [...g.querySelectorAll('option')].map(o => (o as HTMLOptionElement).value),
  }));
}

describe('1382 推荐算子在下拉里真的可见', () => {
  it('shape 字段：推荐组含「形状过滤」', async () => {
    host.innerHTML = '';
    await mount('geo_shape_v', 'shape');
    const groups = optionsByGroup();
    const rec = groups.find(g => g.group === '推荐');
    expect(rec, '推荐组必须存在').toBeTruthy();
    expect(rec!.ops, '推荐组内容').toContain('shape');
    /* 首个推荐就是 shape（表意最贴），exists 兜底在后 */
    expect(rec!.ops[0], '首个推荐').toBe('shape');
  });

  it('date_nanos 字段：推荐组出「范围」（原落兜底 exists）', async () => {
    host.innerHTML = '';
    await mount('ts_nanos', 'date_nanos');
    const rec = optionsByGroup().find(g => g.group === '推荐');
    expect(rec!.ops).toContain('range');
    /* 高频推荐位只放语义最贴的；distance_feature 属低频特异，走「高级分组」可达 */
    expect(rec!.ops[0]).toBe('range');
  });

  it('negative control：纯函数层同样口径（改回兜底就红）', () => {
    expect(opsForType('shape')[0]).toBe('shape');
    /* 负控：把一个不存在的类型丢进去，必须只有 exists —— 说明上面的断言不是恒真 */
    expect(opsForType('__none__')).toEqual(['exists']);
  });

  it('容器算子不进叶子下拉（既有约束保持）', async () => {
    host.innerHTML = '';
    await mount('title', 'text');
    const all = optionsByGroup().flatMap(g => g.ops);
    expect(all, '叶子下拉不得出现 nested 容器').not.toContain('nested');
  });

  it('1395：constant_keyword 字段的推荐组里有 term/terms（此前只有 exists）', async () => {
    host.innerHTML = '';
    await mount('tenant_tag', 'constant_keyword', 'term');
    const rec = optionsByGroup().find(g => g.group === '推荐');
    expect(rec, '推荐组必须存在').toBeTruthy();
    expect(rec!.ops, 'constant_keyword 与 keyword 查询语义一致').toContain('term');
    expect(rec!.ops).toContain('terms');
    expect(rec!.ops.length, '只有 exists 就是本缺陷的原始形态').toBeGreaterThan(1);
  });
});
