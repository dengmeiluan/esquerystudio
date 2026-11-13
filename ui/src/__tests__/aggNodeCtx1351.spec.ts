/**
 * 一千三百五十一批 b：聚合树节点没有右键（条件行 1147 / 三类容器 1351a 之后）。
 *
 * 真机取证（DSL 工作台，1440×960，mock 后端，点「检索参数 → 聚合」chip → 添加聚合）：
 *   修复前 `.agn-hd` 右键 → 无菜单。这一行的三个入口（聚合名输入框 / 类型选择 / 删除）
 *   全都挤在输入框旁，窄栏里改名字时最容易点错。
 *   修复后 → 「聚合 · agg_1 · terms」
 *           一级：复制为 DSL 片段 / 复制… / 结构… / 删除此聚合
 *           二级：复制聚合 JSON（含子聚合） / 加子聚合
 *
 * 关键取舍：复制出去的片段必须和真正发出去的请求体同形——所以复用 `serAggNode`
 * （内部就是整棵 aggs 用的那个 serAggs），而不是在组件里另拼一份。
 *
 * 本 spec 锁：
 *  ① 行头挂 contextmenu、菜单组件在场；
 *  ② 一级标签符合项目约定（≤2 高频 + 分组 + danger 删除）；
 *  ③ 复制 JSON 的产物 = serAggNode(节点)，且带子聚合（不是只剩余本层）；
 *  ④ DSL 片段包在 aggs 键下（与请求体同形）；
 *  ⑤ 负控：把 serAggNode 换成「只拼本层」的实现 → ③ 必须红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AggTreeNode from '../components/builder/AggTreeNode.vue';
import { serAggNode, type AggNode } from '../utils/queryAst';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const SRC = readFileSync(join(__dirname, '../components/builder/AggTreeNode.vue'), 'utf-8');

const CHILD: AggNode = {
  id: 'c1', name: 'sub_1', op: 'avg', body: { field: 'price' },
  children: [], meta: {}, aggKey: 'aggs',
};
const NODE: AggNode = {
  id: 'a1', name: 'by_status', op: 'terms',
  body: { field: 'status', size: 10 }, children: [CHILD], meta: {}, aggKey: 'aggs',
};

const FIELDS = ['status', 'price'];
const TYPES = { status: 'keyword', price: 'double' };

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

async function mount(overrides: Record<string, any> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(AggTreeNode as any, { node: NODE, fields: FIELDS, types: TYPES, ...overrides }) });
  app.use(createPinia());
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 220 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1351b 聚合节点右键', () => {
  it('① 行头挂 contextmenu + 菜单组件在场', () => {
    const i = SRC.indexOf('class="agn-hd"');
    expect(i, '必须有 .agn-hd 行头').toBeGreaterThan(-1);
    expect(SRC.slice(i, SRC.indexOf('>', i)), '.agn-hd 必须挂 @contextmenu').toContain('@contextmenu.prevent');
    expect(SRC, '必须有菜单组件').toContain('<CellContextMenu');
  });

  it('② 一级符合约定：标题含聚合名与类型', async () => {
    await mount();
    expect(menuRoot(), '未右键不渲染').toBeNull();
    await rightClick(host.querySelector('.agn-hd') as HTMLElement);
    expect(menuRoot(), '右键必须出菜单').toBeTruthy();
    const hd = document.querySelector('.ccm-hd')!.textContent || '';
    expect(hd).toContain('by_status');
    expect(hd).toContain('terms');
    expect(topLabels()).toEqual(['复制为 DSL 片段', '复制…', '结构…', '删除此聚合']);
  });

  it('② 二级：聚合 JSON（含子聚合）+ 加子聚合', async () => {
    await mount();
    await rightClick(host.querySelector('.agn-hd') as HTMLElement);
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim())).toEqual(['复制聚合 JSON（含子聚合）']);
    expect(await openGroup('结构…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim())).toEqual(['加子聚合']);
  });

  it('③④ 复制产物与请求体同形：serAggNode 带子聚合，DSL 片段包在 aggs 下', () => {
    const json = serAggNode(NODE);
    expect(Object.keys(json)).toEqual(['by_status']);
    expect(json.by_status).toEqual({
      terms: { field: 'status', size: 10 },
      aggs: { sub_1: { avg: { field: 'price' } } },
    });
    /* 组件复用的就是同一个函数（不是另拼一份） */
    expect(SRC).toContain("import { nid, serAggNode, type AggNode } from '../../utils/queryAst'");
    expect(SRC, 'DSL 片段必须包在请求体的 aggs 键下').toContain("{ [props.node.aggKey || 'aggs']: serAggNode(props.node) }");
  });

  it('删除与加子聚合走既有 emit（不新增写路径）', async () => {
    const remove = vi.fn();
    const update = vi.fn();
    await mount({ onRemove: remove, 'onUpdate:node': update });
    await rightClick(host.querySelector('.agn-hd') as HTMLElement);
    expect(await clickMenuItem('删除此聚合')).toBe(true);
    await tick();
    expect(remove).toHaveBeenCalledTimes(1);

    await rightClick(host.querySelector('.agn-hd') as HTMLElement);
    expect(await clickMenuItem('加子聚合')).toBe(true);
    await tick();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].children.length).toBe(NODE.children.length + 1);
  });

  it('输入框内右键不接管（聚合名/参数输入框的原生复制粘贴）', async () => {
    await mount();
    const inp = host.querySelector('input.agn-name') as HTMLElement | null;
    expect(inp, '聚合行必须有名字输入框').toBeTruthy();
    await rightClick(inp!);
    expect(menuRoot(), '输入框内不弹行菜单').toBeNull();
  });

  it('⑤ 负控：只拼本层的实现 → serAggNode 判据必须红', () => {
    /* 一层投影：丢掉 children —— 正是「复制出去贴回去少了子聚合」的写法 */
    const oneLevel = (n: AggNode) => ({ [n.name]: { [n.op]: n.body } });
    expect(JSON.stringify(oneLevel(NODE))).not.toContain('sub_1');
    expect(JSON.stringify(serAggNode(NODE)), '正式实现必须带子聚合').toContain('sub_1');
  });
});
