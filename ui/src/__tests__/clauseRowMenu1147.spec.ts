/**
 * 1147：查询构建器条件行右键。
 *
 * 条件行行尾有 7 个 22px 图标钮（⏰/参数/复制条件/复制子树/包 bool/删除），
 * 窄栏里逐个点准成本高，且「复制为 DSL 片段 / 条件 JSON」此前完全没有入口。
 * 本批补 CellContextMenu（与表格/列表同一件）：
 * - 一级：停用切换 + 参数（有参数时）+ 复制… / 结构… 两组 + 删除
 * - 复制二级：条件 JSON / DSL 片段 / 子树
 * - 结构二级：复制条件 / 包成 bool 组
 * - 值输入框内右键不接管（浏览器原生复制粘贴留给输入框）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import ClauseNode from '../components/builder/ClauseNode.vue';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const NODE: any = { id: 'n1', type: 'leaf', op: 'term', field: 'status', value: 'ACTIVE', params: { boost: 2 } };
const FIELDS = ['status', 'title'];
const TYPES = { status: 'keyword', title: 'text' };

async function mountNode(overrides: Record<string, any> = {}, node: any = NODE) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({
    render: () => h(ClauseNode as any, { node, fields: FIELDS, types: TYPES, ...overrides }),
  });
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const row = () => host.querySelector('.cn') as HTMLElement;

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 260, clientY: 200 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1147 条件行右键', () => {
  it('右键条件行弹出菜单；标题写明算子与字段', async () => {
    await mountNode();
    expect(menuRoot(), '未右键不渲染').toBeNull();
    await rightClick(row());
    expect(menuRoot()).toBeTruthy();
    const hd = document.querySelector('.ccm-hd')!.textContent || '';
    expect(hd).toContain('精确匹配');
    expect(hd).toContain('status');
  });

  it('一级收口：停用 + 参数 + 复制…/结构… 两组 + 删除（不再平铺 7 个动作）', async () => {
    await mountNode();
    await rightClick(row());
    expect(topLabels()).toEqual(['临时停用（本次不匹配）', '参数（boost / operator…）', '复制…', '结构…', '删除此条件']);
  });

  it('复制二级含此前无入口的两条只读导出（条件 JSON / DSL 片段）', async () => {
    await mountNode();
    await rightClick(row());
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制条件 JSON', '复制为 DSL 片段', '复制子树（跨查询粘贴）']);
  });

  it('结构二级：复制条件 / 包成 bool 组', async () => {
    await mountNode();
    await rightClick(row());
    expect(await openGroup('结构…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制条件（插到下方）', '包成 bool 组']);
  });

  it('删除走既有 remove emit（不新增写路径）', async () => {
    const remove = vi.fn();
    await mountNode({ onRemove: remove });
    await rightClick(row());
    expect(await clickMenuItem('删除此条件')).toBe(true);
    await tick();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(menuRoot(), '点项后关菜单').toBeNull();
  });

  it('停用项文案随状态翻转', async () => {
    await mountNode({}, { ...NODE, disabled: true });
    await rightClick(row());
    expect(topLabels()[0]).toBe('恢复参与匹配');
  });

  it('值输入框内右键不接管（原生复制粘贴不被抢）', async () => {
    await mountNode();
    const inp = host.querySelector('input.inp') as HTMLElement | null;
    expect(inp, '条件行必须有值输入框').toBeTruthy();
    inp!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    expect(menuRoot(), '输入框内不弹行菜单').toBeNull();
  });
});
