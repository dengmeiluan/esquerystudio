/**
 * W7·P0：RT「以此值过滤并重查」单元格右键项（filter-hit 语义）。
 * 锁定：菜单项存在；emit('filter-hit', { field, value, op })——op 由 fieldTypes 判
 * （text→match，keyword/无映射→term）；事件只发不做路由（组件不发查询）；
 * 空值格不出该项（无值可过滤）。既有菜单项文案逐字保留（只新增）。
 * 挂载样板照抄 rtDslCopy（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { findMenuItem } from './helpers/ctxMenu';
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
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2, msg: 'hello world', hole: null } },
  { _id: 'b', _source: { name: 'apple', age: 3, msg: 'x', hole: null } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

function ctxOnCell(col: string, ri = 0) {
  const td = [...host.querySelectorAll('td.rt-cell')].find(td => (td as HTMLElement).dataset.col === col
    && (td as HTMLElement).dataset.ri === String(ri)) as HTMLElement;
  td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
}

/* 1142：动作项住分组二级——findMenuItem 会按需展开分组 */
const menuItem = (label: string) => findMenuItem(label);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('RT 以此值过滤并重查（W7 filter-hit）', () => {
  it('数值列 emit term；text 列 emit match；keyword 列 emit term（载荷 field/value/op）', async () => {
    const events: any[] = [];
    await mountTbl({
      hits: HITS, total: 2, index: 'fh1',
      fieldTypes: { msg: 'text', name: 'keyword' },
      onFilterHit: (p: any) => events.push(p),
    });
    /* age（long）→ term */
    ctxOnCell('age');
    await tick();
    const termBtn = await menuItem('以此值过滤并重查');
    expect(termBtn, '右键菜单应有「以此值过滤并重查」').toBeTruthy();
    (termBtn as HTMLElement).click();
    await tick();
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({ field: 'age', value: 2, op: 'term' });
    expect(document.body.querySelector('.ccm'), '动作后菜单应自动关闭').toBeFalsy();

    /* msg（text）→ match */
    ctxOnCell('msg');
    await tick();
    ((await menuItem('以此值过滤并重查')) as HTMLElement).click();
    await tick();
    expect(events[1]).toEqual({ field: 'msg', value: 'hello world', op: 'match' });

    /* name（keyword）→ term */
    ctxOnCell('name');
    await tick();
    ((await menuItem('以此值过滤并重查')) as HTMLElement).click();
    await tick();
    expect(events[2]).toEqual({ field: 'name', value: 'banana', op: 'term' });
    /* 事件只发不做路由：组件自身不应发起查询（无通知/无 DSL 复制副作用） */
    expect(events.length).toBe(3);
  });

  it('无类型映射列回落 term；空值格不出该项；既有项文案逐字保留', async () => {
    const events: any[] = [];
    await mountTbl({ hits: HITS, total: 2, index: 'fh2', onFilterHit: (p: any) => events.push(p) });
    /* 无 fieldTypes：age → term */
    ctxOnCell('age', 1);
    await tick();
    ((await menuItem('以此值过滤并重查')) as HTMLElement).click();
    await tick();
    expect(events[0]).toEqual({ field: 'age', value: 3, op: 'term' });
    /* 空值格（hole=null）不出项 */
    ctxOnCell('hole');
    await tick();
    expect(await menuItem('以此值过滤并重查'), '空值格不应出 filter-hit 项').toBeFalsy();
    /* 既有项文案逐字保留（契约同步更新锚点） */
    ctxOnCell('age');
    await tick();
    expect(await menuItem('复制值')).toBeTruthy();
    expect(await menuItem('筛选此列')).toBeTruthy();
    expect(await menuItem('复制为 term 查询')).toBeTruthy();
    expect(await menuItem('查看完整值')).toBeTruthy();
  });
});
