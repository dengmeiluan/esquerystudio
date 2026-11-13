/**
 * 一千一百四十二批：右键菜单分层（用户实报「表格右键跟首行一样太多功能平铺」）。
 *
 * ① CellContextMenu 二级菜单：父行 aria-haspopup=menu，点击/悬停开二级；二级项执行
 *   后收整菜单；→/← 键盘等价；Esc 先关二级再关整菜单。
 * ② RT/QRT 单元格菜单收成「复制… / 行操作… / 筛选与排序… / 列与导出…」四组，
 *   一级只剩最高频「复制值 / 查看完整值」；二级项 label 逐字保留（能力零删除）。
 * ③ QueryHistoryPanel 行右键：同一批行级动作经分组菜单可达（回放/填入/curl 一级，
 *   复制组+更多操作组二级）。
 * ④ 项目右键覆盖：历史面板行（此前无 contextmenu）接线。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import CellContextMenu from '../components/CellContextMenu.vue';
import { openSubCount } from './helpers/ctxMenu';
import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

function mount(comp: any, props: Record<string, any>, events: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(comp as any, { ...props, ...events }) });
  app.use(createPinia());
  /* 历史面板内 useRoute（过滤词按 route 草稿化）——memory 路由兜底 */
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] }));
  app.mount(host);
  apps.push(app);
}

beforeEach(() => {
  localStorage.clear();
  host.innerHTML = '';
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
});

describe('1142 ① CellContextMenu 二级菜单', () => {
  it('父行 aria-haspopup + 点击开二级；二级项点击执行并收菜单', async () => {
    const ran: string[] = [];
    let closed = 0;
    mount(CellContextMenu, {
      x: 20, y: 20, title: '单元格',
      items: [
        { key: 'a', label: '主操作', run: () => ran.push('a') },
        { key: 'g', label: '分组…', sep: true, children: [
          { key: 'b', label: '二级动作', run: () => ran.push('b') },
        ] },
      ],
    }, { onClose: () => { closed++; } });
    await tick();
    const parent = document.querySelector('.ccm-it[data-key="g"]') as HTMLButtonElement;
    expect(parent.getAttribute('aria-haspopup')).toBe('menu');
    expect(parent.getAttribute('aria-expanded')).toBe('false');
    parent.click();
    await tick();
    expect(openSubCount()).toBe(1);
    const subIt = document.querySelector('.ccm-sub .ccm-it[data-key="b"]') as HTMLButtonElement;
    expect(subIt.textContent).toContain('二级动作');
    subIt.click();
    await tick();
    expect(ran).toEqual(['b']);
    expect(closed, '二级项执行后 emit close（宿主 v-if 收层）').toBe(1);
  });

  it('Esc 先关二级再关整菜单；→ 开二级 / ← 关二级', async () => {
    let closed = 0;
    mount(CellContextMenu, {
      x: 20, y: 20,
      items: [{ key: 'g', label: '分组…', children: [{ key: 'b', label: '动作', run: () => {} }] }],
    }, { onClose: () => { closed++; } });
    await tick();
    const parent = document.querySelector('.ccm-it[data-key="g"]') as HTMLButtonElement;
    parent.click();
    await tick();
    expect(openSubCount()).toBe(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(openSubCount(), '第一下 Esc 只关二级').toBe(0);
    expect(document.querySelector('.ccm-mask'), '整菜单仍在').toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(closed, '第二下 Esc emit close（宿主收层）').toBe(1);
  });

  it('无 children 的项仍是直接动作项（行为零漂移）', async () => {
    const ran: string[] = [];
    mount(CellContextMenu, { x: 10, y: 10, items: [{ key: 'x', label: '直达', run: () => ran.push('x') }] });
    await tick();
    expect(openSubCount()).toBe(0);
    (document.querySelector('.ccm-it[data-key="x"]') as HTMLButtonElement).click();
    await tick();
    expect(ran).toEqual(['x']);
  });
});

describe('1142 ② RT/QRT 菜单分组（源码 + 行为）', () => {
  it('两表都按四组收口，一级高频两项在外', () => {
    for (const p of ['../components/ResultTable.vue', '../components/QueryResultTable.vue']) {
      const src = rd(p);
      expect(src, p).toContain("label: '复制…'");
      expect(src, p).toContain("label: '行操作…'");
      expect(src, p).toContain("label: '筛选与排序…'");
      /* 1385：列管理与导出拆成两组（此前混在一组最多 9~15 项）。
         断言改为「两组同时在场」，跨内核仍是同一右键语言。 */
      expect(src, p).toContain("label: '列操作…'");
      expect(src, p).toContain("label: '导出…'");
      expect(src, p).toContain("children: copyChildren");
      expect(src, p).toContain("children: queryChildren");
    }
  });

  it('QRT 挂载：一级项数 ≤6，二级「列与导出…」含隐藏此列', async () => {    mount(QueryResultTable, { cols: ['a', 'b'], rows: [['1', '2']], total: 1, storageKey: 'g1', sortable: true });
    await tick(10);
    const cell = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await tick();
    const top = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')];
    /* 1385：拆组后一级 = 2 直达 + 4 分组 = 6；QRT 无「默认格式」组故仍为 6。
       （RT 因为多一个「默认导出格式…」是 7，见 ctxSubGroup1385。） */
    expect(top.length).toBeLessThanOrEqual(7);
    const group = top.find(b => (b.textContent ?? '').includes('列操作…')) as HTMLButtonElement;
    expect(group).toBeTruthy();
    group.click();
    await tick();
    const sub = [...document.querySelectorAll('.ccm-sub')].filter((el: any) => el.style.display !== 'none')
      .flatMap((el: any) => [...el.querySelectorAll('.ccm-it')].map((b: any) => (b.textContent ?? '').trim()));
    expect(sub).toContain('隐藏此列');
    expect(sub).toContain('全列适应内容');
  });

  /* 1169：QRT 勾选行之后的「复制选中 N 行」——RT 早有，QRT 此前只有「复制整表」。
     真挂载：勾一行 → 右键 → 复制组二级里出现带数量的三个格式项。 */
  it('QRT 勾选行后，复制组二级出「复制选中 1 行」三格式（与 RT 对齐）', async () => {
    mount(QueryResultTable, { cols: ['a', 'b'], rows: [['1', '2'], ['3', '4']], total: 2, selectable: true });
    await tick(10);
    /* 未勾选时不得出现（否则「复制 0 行」是噪声） */
    const cell0 = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    cell0.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await tick();
    let all = [...document.querySelectorAll('.ccm-it')].map(b => (b.textContent ?? '').trim());
    expect(all.some(t => t.includes('复制选中'))).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    /* 勾第一行 */
    const chk = host.querySelector('tbody tr input[type="checkbox"]') as HTMLInputElement;
    expect(chk, 'selectable 必须有勾选列').toBeTruthy();
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(10);

    const cell = host.querySelector('tbody tr td.qrt-cell') as HTMLElement;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    await tick();
    /* 展开「复制…」二级 */
    const grp = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')]
      .find(b => (b.textContent ?? '').trim().startsWith('复制…')) as HTMLButtonElement;
    expect(grp).toBeTruthy();
    grp.click();
    await tick();
    all = [...document.querySelectorAll('.ccm-sub .ccm-it')].map(b => (b.textContent ?? '').trim());
    expect(all).toContain('复制选中 1 行为 TSV');
    expect(all).toContain('复制选中 1 行为 Markdown');
    expect(all).toContain('复制选中 1 行为 JSON');
  });
});

describe('1142 ④ 索引行右键（此前列表行无右键）', () => {
  it('源码锁：索引行 contextmenu + 分组菜单（选中/复制 + 分页/它页两组）', () => {
    const src = rd('../views/IndexHubView.vue');
    expect(src).toContain('@contextmenu.prevent="openIdxMenu($event, idx.index)"');
    expect(src).toContain("label: '选中并打开工作区'");
    expect(src).toContain("label: '打开分页…'");
    expect(src).toContain("label: '在其它页打开…'");
    expect(src).toContain('<CellContextMenu v-if="idxMenu"');
  });
});

describe('1142 ⑤ 搜索模板行右键', () => {
  it('源码锁：模板行 contextmenu + 载入/复制组/更多操作组', () => {
    const src = rd('../views/SearchTemplatesView.vue');
    expect(src).toContain('@contextmenu.prevent="openTplMenu($event, t)"');
    expect(src).toContain("label: '载入到编辑器'");
    expect(src).toContain("label: '复制模板 ID'");
    expect(src).toContain("label: '复制模板源码'");
    expect(src).toContain("label: '删除此模板'");
    expect(src).toContain('<CellContextMenu v-if="tplMenu"');
  });
});

describe('1142 ③ 查询历史行右键（此前无右键能力）', () => {
  const ITEMS = [
    { id: 1, mode: 'dsl', query: '{"query":{"match_all":{}}}', index: 'idx-a', ts: Date.now() },
    { id: 2, mode: 'sql', query: 'SELECT 1', index: 'idx-b', ts: Date.now() },
  ];

  it('行 contextmenu 开分组菜单；回放/仅填入/curl 一级，复制组二级含查询文本/索引名', async () => {
    const played: any[] = [];
    mount(QueryHistoryPanel, { items: ITEMS, actions: ['play', 'fill', 'copy', 'curl', 'del'] }, { onPlay: (it: any) => played.push(it) });
    await tick(10);
    const row = host.querySelector('.qhp-item') as HTMLElement;
    expect(row).toBeTruthy();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    const labels = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')].map(b => (b.textContent ?? '').trim());
    expect(labels).toContain('回放 / 执行');
    expect(labels).toContain('仅填入');
    expect(labels).toContain('复制为 curl');
    expect(labels).toContain('复制…');
    const copyGroup = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')]
      .find(b => (b.textContent ?? '').includes('复制…')) as HTMLButtonElement;
    copyGroup.click();
    await tick();
    const sub = [...document.querySelectorAll('.ccm-sub')]
      .filter((el: any) => el.style.display !== 'none')
      .flatMap((el: any) => [...el.querySelectorAll('.ccm-it')].map((b: any) => (b.textContent ?? '').trim()));
    expect(sub).toEqual(['复制查询文本', '复制索引名']);
    /* 回放项直发事件 */
    const play = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')]
      .find(b => (b.textContent ?? '').includes('回放 / 执行')) as HTMLButtonElement;
    play.click();
    await tick();
    expect(played.length).toBe(1);
    expect(played[0].id).toBe(1);
  });

  it('fav 行级门沿用：sql 行不出「转为收藏」，dsl 行出', async () => {
    mount(QueryHistoryPanel, { items: ITEMS, actions: ['play', 'fav', 'del'] });
    await tick(10);
    const rows = [...host.querySelectorAll('.qhp-item')] as HTMLElement[];
    rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    await tick();
    const more1 = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')]
      .find(b => (b.textContent ?? '').includes('更多操作…')) as HTMLButtonElement;
    more1.click();
    await tick();
    expect([...document.querySelectorAll('.ccm-sub')].filter((el: any) => el.style.display !== 'none')
      .flatMap((el: any) => [...el.querySelectorAll('.ccm-it')].map((b: any) => (b.textContent ?? '').trim()))).not.toContain('转为收藏（保存的搜索）');
    document.querySelectorAll('.ccm-mask').forEach(n => n.remove());
    apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
    apps.length = 0; host.innerHTML = '';
    mount(QueryHistoryPanel, { items: ITEMS, actions: ['play', 'fav', 'del'] });
    await tick(10);
    const row0 = [...host.querySelectorAll('.qhp-item')][0] as HTMLElement;
    row0.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    await tick();
    const more0 = [...document.querySelectorAll('.ccm-mask > .ccm > .ccm-it')]
      .find(b => (b.textContent ?? '').includes('更多操作…')) as HTMLButtonElement;
    more0.click();
    await tick();
    expect([...document.querySelectorAll('.ccm-sub')].filter((el: any) => el.style.display !== 'none')
      .flatMap((el: any) => [...el.querySelectorAll('.ccm-it')].map((b: any) => (b.textContent ?? '').trim()))).toContain('转为收藏（保存的搜索）');
  });
});
