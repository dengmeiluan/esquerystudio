/**
 * 产线复现：持久化视图档被写成非法值（旧版本/手工存储）时，
 * host 的 hide-body 变为 true，而所有替代视图又不渲染 → 结果区整块空白。
 * 修复：所有视图档在读取时归一化，非法值回退表格。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

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
import QueryResultTable from '../components/QueryResultTable.vue';
import { normalizePrefEnum } from '../utils/prefEnum';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const IH = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

const HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
] as any;
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

async function mount(comp: any, props: Record<string, any>) {
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(comp, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('持久化视图档非法值归一化', () => {
  it('helper：非法/非字符串回退，合法值保留', () => {
    expect(normalizePrefEnum('bogus', ['table', 'json'], 'table')).toBe('table');
    expect(normalizePrefEnum(null, ['table', 'json'], 'table')).toBe('table');
    expect(normalizePrefEnum('json', ['table', 'json'], 'table')).toBe('json');
  });

  it('RT：非法 viewPrefKey 不隐藏表体（修复前 wrap display:none）', async () => {
    localStorage.setItem('esquerystudio.pref.ivp-rt', JSON.stringify('bogus'));
    await mount(ResultTable, { hits: HITS, viewSeg: true, viewPrefKey: 'ivp-rt', jsonHtml: '<b>x</b>' });
    const wrap = host.querySelector('.rt-wrap') as HTMLElement;
    expect(wrap, '表格容器必须在场').toBeTruthy();
    expect(wrap.style.display, '非法档必须回落表格').not.toBe('none');
    expect(host.querySelectorAll('.rt-tbl tbody tr').length).toBe(2);
  });

  it('QRT：非法 viewPrefKey 不隐藏表体', async () => {
    localStorage.setItem('esquerystudio.pref.ivp-qrt', JSON.stringify('bogus'));
    await mount(QueryResultTable, { cols: ['name', 'age'], rows: [['banana', 2], ['apple', 3]], viewSeg: true, viewPrefKey: 'ivp-qrt' });
    const wrap = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(wrap, '表格容器必须在场').toBeTruthy();
    expect(wrap.style.display, '非法档必须回落表格').not.toBe('none');
    expect(host.querySelectorAll('.qrt-tbl tbody tr').length).toBe(2);
  });

  it('表头粘性层级高于数据冻结列（行滚过时不得盖住表头）', () => {
    expect(RT).toContain('.rt-tbl th { position: sticky; top: 0; z-index: 2; background: var(--tbl-th);');
    expect(RT).toContain('.rt-tbl th.rt-chk, .rt-tbl th.rt-idx { z-index: 4; }');
    expect(RT).toContain('.rt-tbl th.rt-col-frozen { z-index: 4; background: var(--bg2); }');
    expect(QRT).toMatch(/\.qrt-tbl th \{[\s\S]*?z-index: 2;/);
    expect(QRT).toContain('.qrt-tbl th.qrt-idx { z-index: 4; }');
    expect(QRT).toContain('.qrt-tbl th.qrt-col-frozen { background: var(--bg2); z-index: 4; }');
  });

  it('非表格档表体壳塌缩（不得再占 240px 空白），编辑器层叠隔离', () => {
    expect(RT).toContain("'rt-body-hidden': bodyHidden");
    expect(RT).toContain('.rt.rt-body-hidden .rt-wrap-shell { display: none; }');
    expect(RT).toContain('.rt.rt-body-hidden { flex: 0 0 auto; height: auto; }');
    expect(QRT).toContain("'qrt-body-hidden': bodyHidden");
    expect(QRT).toContain('.qrt.qrt-body-hidden .qrt-wrap-shell { display: none; }');
    expect(DQ).toContain('isolation: isolate');
  });

  it('源码锁：五个消费面都走归一化，禁止再直接 usePref 视图档', () => {
    for (const [name, src] of [['RT', RT], ['QRT', QRT], ['IndexHub', IH], ['DslQueryView', DQ], ['Lucene', LUCENE]]) {
      expect(src, `${name} 必须归一化视图档`).toContain('normalizePrefEnum');
    }
    expect(IH).not.toContain("const docsView = usePref<IhViewKey>('ih.docs.view', 'table');");
    expect(IH).not.toContain("const qryView = usePref<IhViewKey>('ih.qry.view', 'table');");
    expect(LUCENE).not.toContain("const viewMode = usePref<'table' | 'json'>('lucene.viewMode', 'table');");
  });
});
