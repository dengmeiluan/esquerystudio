import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

import AltHitsViews from '../components/AltHitsViews.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import { createPressGuard } from '../utils/pressGuard';
import type { SearchHit } from '../types';

/* 971 用户实报随修：选择手势与交互手势的事件冲突全面收口。
 三组矿相：
 A 拖拽源收柄——builder 四节点与 Workspace 配置行此前 draggable 挂在整行根，
   行内值输入框想拖选文本/点选光标会触发挪动整块（HTML5 拖拽源域过大）；
   修=拖拽源收进既有 grip/grab 专属柄（ClusterSwitcher cm-grip 既有范式）。
 B 拖选守卫——文档渲染面与表格单元格拖选文本松手的 click 被当作单击
   （开抽屉/复制），pressGuard 位移阈值甄别拖选手势；
   导航面（AltHits 三档）另加单击延迟仲裁：双击选词的第二击到达即取消首击开抽屉。
 C 双击直达编辑退役（AltHits 三档）——双击选词与双击编辑在同一文本面不可调和
   （双击必然先选词），编辑保留两条显式通道（导航条「编辑文档」钮+打开抽屉后编辑）；
   ResultTable 内联编辑=数据网格惯例（Excel/dbx 同语言）且轻态非导航，保留。 */

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const mev = (type: string, x: number, y: number, detail = 1) =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, detail });

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountComp(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  vi.useRealTimers();
});

describe('A 拖拽源收柄（源码锁）', () => {
  it('builder 四节点：根节点不再 draggable，grip 柄承载拖拽源', () => {
    const cases = [
      ['ClauseNode.vue', 'cn-grip'],
      ['BoolGroupNode.vue', 'bgn-grip'],
      ['WrapNodeRow.vue', 'wnr-grip'],
      ['GenericNode.vue', 'gn-grip'],
    ] as const;
    for (const [f, grip] of cases) {
      const t = read(`../components/builder/${f}`);
      const rootLine = t.split('\n')[1] ?? '';
      expect(rootLine.includes('draggable'), `${f} 根节点不再 draggable（整行拖拽劫持值输入框的文本选择/光标）`).toBe(false);
      expect(t, `${f} grip 柄承载 draggable+dragstart`).toMatch(new RegExp(grip + '[^\\n]*draggable="true"[^\\n]*dragstart'));
    }
  });

  it('WorkspaceView 配置行：拖拽源收 grab 柄（行内 checkbox/select 原生手势回归）', () => {
    const t = read('../views/WorkspaceView.vue');
    expect(t, 'grab 柄承载 draggable+dragstart').toMatch(/ws-cfg-grab[^>]*draggable="true"[^>]*@dragstart/);
    const i = t.indexOf('class="ws-cfg-row"');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(t.slice(i, i + 200).includes('draggable'), '配置行根不再 draggable').toBe(false);
  });
});

describe('B pressGuard 单源', () => {
  it('moved 阈值甄别拖选；single 窗口内覆盖+cancelPending 取消', () => {
    vi.useFakeTimers();
    const g = createPressGuard(100);
    g.down(mev('mousedown', 10, 10));
    expect(g.moved(mev('click', 12, 12))).toBe(false);
    expect(g.moved(mev('click', 40, 10))).toBe(true);
    const fired: number[] = [];
    g.single(() => fired.push(1));
    g.single(() => fired.push(2));
    g.cancelPending();
    vi.advanceTimersByTime(300);
    expect(fired, '取消后不触发').toEqual([]);
    g.single(() => fired.push(3));
    vi.advanceTimersByTime(120);
    expect(fired).toEqual([3]);
    vi.useRealTimers();
  });
});

describe('B AltHitsViews 三档手势仲裁（行为锚）', () => {
  it('json 档：拖选松手不开抽屉；单击延迟开；双击=选词（抽屉与编辑器都不抢）', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    await mountComp(AltHitsViews, {
      view: 'json',
      jsonHtml: '<span class="j-doc-block" data-doc-i="0">{"a":"text"}</span>',
      docCount: 1,
      editable: true,
      onOpenDocAt: (i: number) => events.push('open:' + i),
      onEditDocAt: (i: number) => events.push('edit:' + i),
    });
    const target = host.querySelector('[data-doc-i]') as HTMLElement;
    expect(target).toBeTruthy();
    /* 拖选：mousedown→远距 click 松手，不当作单击 */
    target.dispatchEvent(mev('mousedown', 10, 10));
    target.dispatchEvent(mev('click', 90, 60));
    expect(events, '拖选松手不开抽屉').toEqual([]);
    /* 纯单击：延迟窗口后开 */
    target.dispatchEvent(mev('mousedown', 10, 10));
    target.dispatchEvent(mev('click', 10, 10));
    vi.advanceTimersByTime(300);
    expect(events).toEqual(['open:0']);
    /* 双击：首击被延迟仲裁取消，双击不发编辑 */
    target.dispatchEvent(mev('mousedown', 10, 10));
    target.dispatchEvent(mev('click', 10, 10));
    target.dispatchEvent(mev('dblclick', 10, 10, 2));
    vi.advanceTimersByTime(300);
    expect(events, '双击=选词手势：抽屉与编辑器都不出现').toEqual(['open:0']);
    vi.useRealTimers();
  });

  it('cards 档：拖选松手不开抽屉；双击不开抽屉（编辑 emit 已退役）', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const hits = [{ _id: 'd1', _index: 'i', score: 1, _score: 1, _source: { f: 'value' } }] as unknown as SearchHit[];
    await mountComp(AltHitsViews, {
      view: 'cards',
      hits,
      onOpenDoc: () => events.push('open'),
    });
    const card = host.querySelector('.dq-card') as HTMLElement;
    expect(card).toBeTruthy();
    card.dispatchEvent(mev('mousedown', 5, 5));
    card.dispatchEvent(mev('click', 90, 40));
    expect(events, '拖选松手不开抽屉').toEqual([]);
    card.dispatchEvent(mev('mousedown', 5, 5));
    card.dispatchEvent(mev('click', 5, 5));
    card.dispatchEvent(mev('dblclick', 5, 5, 2));
    vi.advanceTimersByTime(300);
    expect(events, '双击选词：抽屉不抢（编辑 emit 已退役）').toEqual([]);
    vi.useRealTimers();
  });
});

describe('B QRT 单元格拖选守卫（行为锚）', () => {
  it('拖选松手不复制；同位单击也不复制（1374 单击复制退役）', async () => {
    const mod = await import('../utils/format');
    const spy = vi.spyOn(mod, 'copyText').mockResolvedValue(true);
    const hits = [{ _id: 'a', _source: { s: 'abc' } }] as unknown as SearchHit[];
    await mountComp(QueryResultTable, { hits, storageKey: 'k' });
    const tds = [...host.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    const td = tds[2] as HTMLElement;
    expect(td).toBeTruthy();
    /* 拖选守卫本身仍在：位移超阈的松手不触发复制 */
    td.dispatchEvent(mev('mousedown', 3, 3));
    td.dispatchEvent(mev('click', 100, 100));
    expect(spy, '拖选松手不触发复制').not.toHaveBeenCalled();
    /* 1374：同位单击同样不复制（该守卫的「对照组」随之改变，守卫逻辑零改动） */
    td.dispatchEvent(mev('mousedown', 3, 3));
    td.dispatchEvent(mev('click', 3, 3));
    expect(spy, '同位单击也不再复制').not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('C 双击直达编辑退役（源码锁）', () => {
  it('AltHits 三档：双击处理器只做取消仲裁，不再发编辑', () => {
    const t = read('../components/AltHitsViews.vue');
    expect(t, 'json 档双击=取消待发单击').toMatch(/function onPreDblClick\([^)]*\)\s*\{\s*guard\.cancelPending\(\);?\s*\}/);
    expect(t, 'tree 档双击=取消待发单击').toMatch(/function onTreeDblClick\([^)]*\)\s*\{\s*guard\.cancelPending\(\);?\s*\}/);
    expect(t, 'cards 档编辑 emit 退役').not.toContain("emit('edit-doc'");
    expect(t, 'edit-doc-at 发射只存在于导航条编辑钮').toMatch(/ah-nav-edit[^>]*@click="emit\('edit-doc-at', docCursor\)"/);
  });

  it('DQ cards 编辑死链退役（RT 行内编辑通道不波及）', () => {
    const dq = read('../views/DslQueryView.vue');
    expect(dq, 'cards 档不再接 edit-doc').not.toContain('@open-doc="openDoc" @edit-doc=');
    expect(dq, 'RT 行内编辑通道保留').toMatch(/:editable="canWrite" @edit-doc="h => openDoc\(h, true\)"/);
  });
});
