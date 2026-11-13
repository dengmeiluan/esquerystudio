/**
 * 1180：JSON 视图行级右键。
 *
 * 现场：JSON 视图（文档/响应/映射）此前只有一个「复制全文」——想拿单个字段值、
 * 单个字段路径，只能手工框选再删。字段路径恰恰是后面所有动作的输入
 * （贴进 DSL、贴进 SQL、发给同事定位），所以右键必须落在「这一行」上。
 *
 * 锁：① 行挂 contextmenu 且吃掉冒泡（行树常嵌在表格单元格里，不能和单元格菜单同开）；
 * ② 标题 = 点分路径；③ 一级只留高频两项 + 分组父行（不平铺）；
 * ④ 值位按类型分档（字符串给原文，对象给缩进 JSON）；⑤ 复制真写剪贴板并有回执。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h } from 'vue';
import JsonTree from '../components/JsonTree.vue';

const DATA = {
  _source: { title: '样例研报', publisher: { org_name: '示例机构' }, tags: ['a', 'b'] },
};

let written: string[] = [];
const mounted: Array<() => void> = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } },
    configurable: true,
  });
});
/* 断言失败也不让上一例的挂载/teleport 菜单漏到下一例（菜单挂在 body 上） */
afterEach(() => {
  while (mounted.length) mounted.pop()!();
  document.querySelectorAll('.ccm-mask').forEach(el => el.remove());
});

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

interface H { host: HTMLElement; app: any; stop: () => void }
function mountTree(): H {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(JsonTree, { data: DATA }) });
  app.mount(host);
  const stop = () => { app.unmount(); host.remove(); };
  mounted.push(stop);
  return { host, app, stop };
}

function row(h: H, jid: string): HTMLElement {
  const el = h.host.querySelector(`[data-jid="${jid}"]`) as HTMLElement;
  expect(el, `必须存在路径 ${jid} 的行`).toBeTruthy();
  return el;
}
function openMenu(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
}
const labelsOf = (sel: string) => [...document.querySelectorAll(sel)].map(b => (b.textContent || '').trim());
const clickLabel = (label: string) => {
  const btn = [...document.querySelectorAll('.ccm-it')].find(b => (b.textContent || '').trim() === label) as HTMLButtonElement;
  expect(btn, `菜单里必须有「${label}」`).toBeTruthy();
  btn.click();
};

describe('1443 JSON 树键盘导航', () => {
  it('根 Tab 停靠；↑/↓/Home/End 游走行；菜单键开当前行菜单；Enter 收起/展开', async () => {
    const h = mountTree();
    const root = h.host.querySelector('.jtree') as HTMLElement;
    expect(root.tabIndex, '树根是唯一 Tab 停靠点').toBe(0);
    expect(root.getAttribute('role')).toBe('tree');
    expect(root.getAttribute('aria-label')).toContain('JSON');
    expect(root.querySelector('.jnode')?.getAttribute('role'), 'treeitem 容器为 group').toBe('group');
    const rows = [...h.host.querySelectorAll<HTMLElement>('.jrow:not(.jmore)')];
    expect(rows.length).toBeGreaterThan(2);
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(rows[0]);
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(rows[rows.length - 1]);
    rows[rows.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(rows[0]);

    const leaf = row(h, '_source.title');
    leaf.focus();
    leaf.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.ccm'), '菜单键开菜单').toBeTruthy();
    expect(document.querySelector('.ccm-hd')?.textContent || '').toContain('_source.title');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();

    const pub = row(h, '_source.publisher');
    const child = () => h.host.querySelector('[data-jid="_source.publisher.org_name"]');
    expect(child(), '初始展开').toBeTruthy();
    expect(pub.getAttribute('role')).toBe('treeitem');
    expect(pub.getAttribute('aria-expanded')).toBe('true');
    pub.focus();
    pub.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(child(), 'Enter 收起').toBe(null);
    expect(pub.getAttribute('aria-expanded'), '收起后 aria-expanded=false').toBe('false');
    pub.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick();
    expect(child(), 'Enter 再展开').toBeTruthy();
    expect(pub.getAttribute('aria-expanded')).toBe('true');
    pub.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await tick();
    expect(child(), '← 收起').toBe(null);
    expect(pub.getAttribute('aria-expanded')).toBe('false');
    pub.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await tick();
    expect(child(), '→ 展开').toBeTruthy();
    expect(pub.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('1180 JSON 视图行级右键', () => {
  it('右键叶子行：标题是点分路径，一级只有两项 + 分组父行', async () => {
    const h = mountTree();
    openMenu(row(h, '_source.title'));
    await tick();

    const mask = document.querySelector('.ccm-mask');
    expect(mask, '行上右键必须开出菜单').toBeTruthy();
    expect(mask!.querySelector('.ccm-hd')!.textContent!.trim()).toBe('_source.title');

    expect(labelsOf('.ccm-mask > .ccm > .ccm-it')).toEqual(['复制值', '复制路径', '更多…']);
    const parent = [...document.querySelectorAll('.ccm-it')].find(b => (b.textContent || '').trim() === '更多…')!;
    expect(parent.getAttribute('aria-haspopup'), '低频项必须住二级').toBe('menu');
    h.stop();
  });

  it('叶子「复制值」给原文字符串（不带引号，可直接粘进 term 查询）', async () => {
    const h = mountTree();
    openMenu(row(h, '_source.title'));
    await tick();
    clickLabel('复制值');
    await tick();
    expect(written).toEqual(['样例研报']);
    /* 回执落在动作发生处，不依赖全局 toast（组件在表格行内嵌时没有 store 上下文） */
    expect(h.host.querySelector('.jt-flash')?.textContent).toContain('已复制值');
    expect(document.querySelector('.ccm-mask'), '动作后菜单自关').toBeFalsy();
    h.stop();
  });

  it('对象行的动作名换成「复制此节点 JSON」，二级给「路径: 值」与整棵复制', async () => {
    const h = mountTree();
    openMenu(row(h, '_source.publisher'));
    await tick();
    const top = labelsOf('.ccm-mask > .ccm > .ccm-it');
    expect(top).toContain('复制此节点 JSON');
    expect(top).not.toContain('复制值');

    clickLabel('更多…');
    await tick();
    expect(labelsOf('.ccm-sub .ccm-it')).toEqual(['复制键名', '复制「路径: 值」', '复制整棵 JSON']);
    h.stop();
  });

  it('「复制路径」拿到的就是 _source 字段路径', async () => {
    const h = mountTree();
    openMenu(row(h, '_source.publisher.org_name'));
    await tick();
    clickLabel('复制路径');
    await tick();
    expect(written).toEqual(['_source.publisher.org_name']);
    h.stop();
  });

  it('行树嵌在别的右键区域里：行菜单吃掉冒泡，外层不再跟着开', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let outer = 0;
    const app = createApp({
      render: () => h('div', { onContextmenu: (e: Event) => { e.preventDefault(); outer++; } }, [h(JsonTree, { data: DATA })]),
    });
    app.mount(host);
    mounted.push(() => { app.unmount(); host.remove(); });
    row({ host, app, stop: () => {} }, '_source.title')
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    await tick();
    expect(outer, '行级右键必须 stopPropagation').toBe(0);
    expect(document.querySelector('.ccm-mask')).toBeTruthy();
  });

  it('负控：鼠标左键点行不开菜单', async () => {
    const h = mountTree();
    row(h, '_source.title').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();
    expect(document.querySelector('.ccm-mask')).toBeFalsy();
    h.stop();
  });
});
