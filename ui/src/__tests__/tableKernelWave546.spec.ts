/**
 * 五百四十六批 W3（轨3 表格内核）：quickFilter / refresh 的工具行内建 opt-in UI。
 *
 * 背景：530 批 W-B 给 QRT（531 平移 RT）立了 quickFilter 单向 prop（跨可见列 contains
 * 过滤链），但全站 0 接线——没有输入 UI，能力悬空。约定内建 UI opt-in：
 * ① `searchable?: boolean`（缺省 false=无输入框，全站零增量）：true 时工具行（bar-left，
 *    与既有钮同排）内建搜索输入框，双绑驱动既有 quickFilter 过滤链——quickFilter 是单向
 *    prop，内部 ref 合成：输入非空以输入为准，空输入回落外部 quickFilter 播种值
 *    （既有 prop 契约不破）；Esc 清词；placeholder 中文。
 * ② `refreshable?: boolean`（缺省 false 零增量；QRT 专属，RT 备案不动）：工具行刷新钮，
 *    点击只 emit 'refresh' 意图（事件名对齐 RT 既有 refresh；525 分页同构：取数归宿主）。
 * ③ QRT 工具行寄居 storageKey 记忆启用的 qrt-bar（prefsOn）——接线宿主须同传 storageKey。
 * ④ SystemView 示范接线：searchable + refreshable + @refresh="run"（重跑当前查询）。
 * ⑤ ResultTable 同族 quickFilter（531 平移同构）→ searchable 同款加；refreshable 不加
 *    （任务书 G2 为 QRT 专属，RT 的 refresh 事件已由 commit 链消费）。
 *
 * 范围铁律：过滤/排序/导出既有链零触碰（quickFilterEff 只是 quickFilter 的取词收口，
 * 非 searchable 档逐字节回落 props.quickFilter）；高度模型零动。
 * 设施：qrtColFilter524 同款裸 createApp 直挂 QRT/RT（pinia，无 router）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const QRT_HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

const RT_HITS = [
  { _id: 'a', _source: { n: 30 } },
  { _id: 'b', _source: { n: 10 } },
  { _id: 'c', _source: { n: 20 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: unknown, propsFactory: () => Record<string, unknown>) {
  const app = createApp({ setup: () => () => h(comp as any, propsFactory()) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* 数据行计数（排除筛选空集提示行/截断提示行；用例内无展开行） */
const qrtRows = () => [...host.querySelectorAll('tbody tr')]
  .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
const rtRows = () => [...host.querySelectorAll('.rt-tbl tbody tr')];
const typeIn = async (sel: string, v: string) => {
  const inp = host.querySelector(sel) as HTMLInputElement;
  inp.value = v;
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
};

/* ═══════════ 一、QRT 缺省反锁（零增量）+ 既有 quickFilter prop 通道回归锚 ═══════════ */
describe('五百四十六批：QRT searchable/refreshable 缺省 false 全站零增量（反锁）', () => {
  it('缺省：无搜索框/无刷新钮，3 行全渲染；quickFilter 单向 prop 既有通道照常', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w546d' }));
    expect(host.querySelector('.qrt-qsearch'), '缺省无内建搜索框').toBeNull();
    expect(host.querySelector('.qrt-qsearch-inp')).toBeNull();
    expect([...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '刷新结果'),
      '缺省无刷新钮').toBeUndefined();
    expect(qrtRows().length, '缺省零增量：3 行全渲染').toBe(3);

    /* 既有通道回归锚：quickFilter prop 直接播种仍走原链（未被内建 UI 改道） */
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w546q', quickFilter: 'apple' }));
    expect(qrtRows().length, 'quickFilter prop 播种过滤照常').toBe(1);
    expect(qrtRows()[0].textContent).toContain('apple');
  });
});

/* ═══════════ 二、QRT searchable：输入框渲染 + 双绑过滤链 + Esc 清词 + 播种合成 ═══════════ */
describe('五百四十六批：QRT searchable 内建搜索框（工具行同排，驱动既有 quickFilter 链）', () => {
  it('开 prop → 输入框渲染（中文 placeholder）；输入触发过滤；Esc 清词恢复全行', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, total: 3, storageKey: 'w546s', searchable: true }));
    const inp = host.querySelector('.qrt-qsearch-inp') as HTMLInputElement;
    expect(inp, '开 searchable 后输入框在场（工具行内）').toBeTruthy();
    expect(inp.closest('.qrt-bar'), '输入框寄居既有工具行（与既有钮同排）').toBeTruthy();
    expect(inp.getAttribute('placeholder'), 'placeholder 中文').toBe('搜索结果…');
    expect(qrtRows().length).toBe(3);

    await typeIn('.qrt-qsearch-inp', 'an');
    expect(qrtRows().length, '输入 an → banana 一行（跨可见列 contains）').toBe(1);
    expect(qrtRows()[0].textContent).toContain('banana');
    /* 计数条行数=滤后所见（sortedRows 消费 quickFilterEff） */
    expect(host.querySelector('.qrt-bar')!.textContent).toContain('1/3');

    /* Esc 清词 → 过滤解除 */
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick();
    expect((host.querySelector('.qrt-qsearch-inp') as HTMLInputElement).value, 'Esc 清词').toBe('');
    expect(qrtRows().length, '清词后全行回归').toBe(3);
  });

  it('播种合成：外部 quickFilter 播种在输入空时生效；输入非空以输入为准；清空回落播种值', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w546c', searchable: true, quickFilter: 'apple' }));
    expect(qrtRows().length, '输入空：外部播种值生效（既有 prop 契约不破）').toBe(1);
    expect(qrtRows()[0].textContent).toContain('apple');

    await typeIn('.qrt-qsearch-inp', 'cherry');
    expect(qrtRows().length, '输入非空：以内建输入为准').toBe(1);
    expect(qrtRows()[0].textContent).toContain('cherry');

    await typeIn('.qrt-qsearch-inp', '');
    expect(qrtRows().length, '清空输入：回落外部播种值').toBe(1);
    expect(qrtRows()[0].textContent).toContain('apple');
  });
});

/* ═══════════ 三、QRT refreshable：刷新钮 + emit('refresh') ═══════════ */
describe('五百四十六批：QRT refreshable 刷新钮（只 emit 意图，取数归宿主）', () => {
  it('开 prop → 刷新钮在场；点击 emit refresh（对齐 RT 既有事件名）；内核不改行集', async () => {
    const got: number[] = [];
    await mountTbl(QueryResultTable, () => ({
      hits: QRT_HITS, storageKey: 'w546r', refreshable: true, onRefresh: () => { got.push(1); },
    }));
    const btn = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '刷新结果');
    expect(btn, '刷新钮在场（工具行内）').toBeTruthy();
    expect(btn!.closest('.qrt-bar')).toBeTruthy();
    btn!.click();
    await tick(4);
    expect(got.length, '点击 → emit refresh 一拍').toBe(1);
    expect(qrtRows().length, '内核不自行取数/改行集（3 行原样）').toBe(3);
  });
});

/* ═══════════ 四、RT 同族 quickFilter（531 平移同构）→ searchable 同款 ═══════════ */
describe('五百四十六批：ResultTable searchable 同款（quickFilter 同构平移）', () => {
  it('缺省无输入框（零增量）；开 prop 输入框渲染且过滤生效', async () => {
    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w546rt' }));
    expect(host.querySelector('.rt-qsearch-inp'), 'RT 缺省无内建搜索框').toBeNull();
    expect(rtRows().length).toBe(3);

    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w546rts', searchable: true }));
    const inp = host.querySelector('.rt-qsearch-inp') as HTMLInputElement;
    expect(inp, '开 searchable 后输入框在场').toBeTruthy();
    expect(inp.closest('.rt-bar'), '寄居 RT 工具行').toBeTruthy();
    expect(inp.getAttribute('placeholder')).toBe('搜索结果…');
    await typeIn('.rt-qsearch-inp', '30');
    expect(rtRows().length, '输入 30 → n=30 一行').toBe(1);
    expect(rtRows()[0].textContent).toContain('30');
  });
});

/* ═══════════ 五、SystemView 示范接线（源码锁）═══════════ */
describe('五百四十六批：SystemView 示范接线（源码锁）', () => {
  const sys = readFileSync(join(__dirname, '../views/SystemView.vue'), 'utf-8');
  it('QRT 标签 searchable + refreshable + @refresh="run"（重跑当前查询）', () => {
    const s = sys.indexOf('<QueryResultTable');
    expect(s, 'SystemView QRT 在场（防空跑）').toBeGreaterThan(-1);
    const tag = sys.slice(s, sys.indexOf('</QueryResultTable>', s));
    expect(tag).toMatch(/searchable/);
    expect(tag).toMatch(/refreshable/);
    expect(tag).toMatch(/@refresh="run"/);
  });
});
