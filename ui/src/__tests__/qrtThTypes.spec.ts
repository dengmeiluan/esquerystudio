/**
 * R130 一百七十一批：QRT 双层列头（RT 156 批同款类型徽标）+ useIndexFieldTypes composable。
 * 锁定：
 * 1) QRT 无 fieldTypes → 单层列头零增量（无 .qrt-th-sub，SQL 通道现状不变）；
 * 2) 有 fieldTypes → 列头启用双层（每列 .qrt-th-sub 常驻对齐），有类型的列显示 info 蓝徽标，
 *    无类型列留空位；
 * 3) composable：mapping-detail raw.properties 取顶层叶子（object 容器剔除）、旧形态回退
 *    （m.mappings）、索引空值清空、拉取失败静默回退单层（不抛错）；
 * 4) 消费方静态锁：Lucene/PIT 模板传 :field-types（照 qrtSortable 静态锁样板）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mappingDetailMock = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, mappingDetail: (...a: any[]) => mappingDetailMock(...a) } };
});

import QueryResultTable from '../components/QueryResultTable.vue';
import { useIndexFieldTypes } from '../composables/useIndexFieldTypes';

const HITS = [{ _id: 'a', _source: { name: 'banana', age: 2 } }] as any;

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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mappingDetailMock.mockReset();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('QRT 双层列头（一百七十一批）', () => {
  it('无 fieldTypes：单层列头零增量（无 sub 行）', async () => {
    await mountTbl({ hits: HITS, storageKey: 'tt1' });
    expect(host.querySelector('.qrt-th-sub')).toBeNull();
  });

  it('有 fieldTypes：双层启用，类型列显示徽标、无类型列留空位', async () => {
    await mountTbl({ hits: HITS, storageKey: 'tt2', fieldTypes: { name: 'keyword' } });
    const subs = [...host.querySelectorAll('thead th .qrt-th-sub')];
    /* 数据列（_id/name/age）各一行 sub 常驻；冻结序号列（167 批）无 sub */
    expect(subs.length).toBe(3);
    const types = subs.map(s => s.querySelector('.qrt-th-type')?.textContent?.trim() ?? '');
    expect(types.filter(Boolean)).toEqual(['keyword']); // 只有 name 列有徽标
  });

  /* 五百二十八批扩权（Lead 解除 171 批「无映射整体单层」承诺）：rows 型按值采样档
     （527 契约 inferredTypes）也出徽标；hit 型采样恒空零增量不受影响 */
  it('528 扩权：rows 型按值采样出徽标（无显式映射也双层）', async () => {
    await mountTbl({ cols: ['d'], rows: [['2024-01-02T03:04:05Z'], ['2024-02-03T05:06:07Z']] });
    const sub = host.querySelector('thead th .qrt-th-sub');
    expect(sub, '采样推断出 date → 双层列头启用').toBeTruthy();
    expect(sub!.querySelector('.qrt-th-type')?.textContent?.trim()).toBe('date');
  });

  it('528 扩权：采样无过半形态仍单层零增量', async () => {
    await mountTbl({ cols: ['x'], rows: [['abc'], ['def']] });
    expect(host.querySelector('.qrt-th-sub')).toBeNull();
  });
});

describe('useIndexFieldTypes composable（一百七十一批）', () => {
  function harness(initial: string) {
    const idx = ref(initial);
    let api: any = null;
    const app = createApp({
      setup() {
        api = useIndexFieldTypes(idx);
        return () => h('div');
      },
    });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    return { idx, fieldTypes: () => api.value };
  }
  const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

  it('raw.properties 顶层叶子类型；object 容器剔除', async () => {
    mappingDetailMock.mockResolvedValue({
      index: 'i1',
      raw: { properties: { name: { type: 'text' }, age: { type: 'long' }, obj: { properties: { a: { type: 'keyword' } } } } },
    });
    const { fieldTypes } = harness('i1');
    await tick();
    expect(mappingDetailMock).toHaveBeenCalledWith('i1');
    expect(fieldTypes()).toEqual({ name: 'text', age: 'long' });
  });

  it('旧形态回退（m.mappings）+ 索引清空清映射', async () => {
    mappingDetailMock.mockResolvedValue({ mappings: { properties: { city: { type: 'keyword' } } } });
    const { idx, fieldTypes } = harness('i2');
    await tick();
    expect(fieldTypes()).toEqual({ city: 'keyword' });
    idx.value = '';
    await tick();
    expect(fieldTypes()).toEqual({});
  });

  it('拉取失败静默回退空表（单层列头），不抛错', async () => {
    mappingDetailMock.mockRejectedValue(new Error('denied'));
    const { fieldTypes } = harness('i3');
    await tick();
    expect(fieldTypes()).toEqual({});
  });
});

describe('QRT 双层列头消费方接线（一百七十一批，静态锁）', () => {
  it('Lucene/PIT 均传 :field-types', () => {
    for (const f of ['LuceneQueryView.vue', 'PitScrollView.vue']) {
      const s = readFileSync(join(__dirname, '../views', f), 'utf-8');
      const tpl = s.split('<script')[0];
      expect(tpl, f + ' 应存在 QueryResultTable 标签（防空跑）').toMatch('<QueryResultTable');
      expect(tpl, f + ' 应传 :field-types').toMatch(/:field-types="fieldTypes"/);
    }
  });
});
