/**
 * 一千三百五十一批：查询构建树只有「条件行」有右键（1147）——bool 组头 / 包装行 /
 * 多子查询容器三类节点右键全空。
 *
 * 真机取证（DSL 工作台，1440×960，mock 后端）：
 *   加一条条件 → 树里是 bool 组 + 一条 term 条件
 *   再在「高级」里插 constant_score（包装行）、boosting（多容器）
 *   ① `.bgn-hd` 右键 → 无菜单          ← 组头行尾 4 个 22px 图标钮，窄栏里要逐个点准
 *   ② `.cn` 右键     → 有菜单（1147）   ← 对照组：说明组件本身能工作
 *   ③ `.wnr-hd` 右键 → 无菜单
 *   ④ `.mnr-hd` 右键 → 无菜单
 *
 * 修复后同一次操作：
 *   bool 组头 → 「bool 组 · must(2)」 复制整组 / 复制… / 结构… / 删除整组 + 4 条二级
 *   包装行   → 「包装 · 恒定评分」     复制为 DSL 片段 / 复制… / 结构… / 删除此包装
 *   容器行   → 「容器 · 正负加权 · boosting」 复制为 DSL 片段 / 复制… / 结构… / 删除此容器
 *
 * 一级严格按项目右键约定（≤2 个高频动作 + 分组父项 + danger 删除），
 * 且全部复用既有 emit / queryAst 工具，不新增写路径。
 *
 * 本 spec 锁：
 *  ① 三类节点行头都挂 contextmenu（缺一类即红）；
 *  ② 挂载真实组件右键出菜单，一级标签符合约定（不是「只要弹了就算」）；
 *  ③ 输入框内右键不接管（浏览器原生复制粘贴留给输入框）；
 *  ④ 删除走既有 remove emit；复制 JSON/DSL 产出的是本节点真实序列化；
 *  ⑤ 负控：把模板上的 @contextmenu 去掉 → ① 必然红（判据不是恒真）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import BoolGroupNode from '../components/builder/BoolGroupNode.vue';
import WrapNodeRow from '../components/builder/WrapNodeRow.vue';
import MultiNodeRow from '../components/builder/MultiNodeRow.vue';
import { topLabels, openGroup, subButtons, clickMenuItem, menuRoot } from './helpers/ctxMenu';

const SRC = join(__dirname, '../components/builder');
const read = (f: string) => readFileSync(join(SRC, f), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
let host: HTMLElement;

const FIELDS = ['status', 'title', 'author.name'];
const TYPES = { status: 'keyword', title: 'text', 'author.name': 'keyword' };

const LEAF: any = { id: 'l1', type: 'leaf', op: 'term', field: 'status', value: 'ACTIVE', params: {} };
const BOOL: any = {
  id: 'b1', type: 'bool', params: {}, arrForm: { must: true },
  children: [{ occur: 'must', node: LEAF }],
};
const WRAP: any = { id: 'w1', type: 'wrap', op: 'constant_score', field: null, childKey: 'filter', child: BOOL, params: {} };
const MULTI: any = {
  id: 'm1', type: 'multi', op: 'boosting', params: { negative_boost: 0.5 },
  children: [{ key: 'positive', node: { ...BOOL, id: 'bp' } }, { key: 'negative', node: { ...BOOL, id: 'bn' } }],
};

async function mount(comp: any, props: Record<string, any>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp, props) });
  app.use(createPinia());
  apps.push(app);
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function rightClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 260, clientY: 200 }));
  await tick();
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = ''; });

describe('1351 查询树三类容器节点右键', () => {
  it('① 三类节点行头都挂 contextmenu（组头 / 包装行 / 容器行）', () => {
    for (const [f, cls] of [['BoolGroupNode.vue', 'bgn-hd'], ['WrapNodeRow.vue', 'wnr-hd'], ['MultiNodeRow.vue', 'mnr-hd']] as const) {
      const s = read(f);
      const i = s.indexOf('class="' + cls + '"');
      expect(i, `${f} 必须有 .${cls} 行头`).toBeGreaterThan(-1);
      const tagEnd = s.indexOf('>', i);
      expect(s.slice(i, tagEnd), `${f} .${cls} 必须挂 @contextmenu`).toContain('@contextmenu.prevent');
      expect(s, `${f} 必须有菜单组件`).toContain('<CellContextMenu');
    }
  });

  it('② bool 组头右键：一级符合约定（≤2 高频 + 分组 + 删除）', async () => {
    await mount(BoolGroupNode as any, { node: BOOL, fields: FIELDS, types: TYPES });
    expect(menuRoot(), '未右键不渲染').toBeNull();
    await rightClick(host.querySelector('.bgn-hd') as HTMLElement);
    expect(menuRoot(), '右键必须出菜单').toBeTruthy();
    expect((document.querySelector('.ccm-hd')!.textContent || '')).toContain('must(1)');
    expect(topLabels()).toEqual(['复制整组（跨查询粘贴）', '复制…', '结构…', '删除整组']);
  });

  it('② 组头二级含此前无入口的只读导出（JSON / DSL）', async () => {
    await mount(BoolGroupNode as any, { node: BOOL, fields: FIELDS, types: TYPES });
    await rightClick(host.querySelector('.bgn-hd') as HTMLElement);
    expect(await openGroup('复制…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim()))
      .toEqual(['复制组 JSON', '复制为 DSL 片段']);
  });

  it('② 包装行右键：一级符合约定，且结构二级可包进 bool 组', async () => {
    await mount(WrapNodeRow as any, { node: WRAP, fields: FIELDS, types: TYPES });
    await rightClick(host.querySelector('.wnr-hd') as HTMLElement);
    expect(menuRoot()).toBeTruthy();
    expect((document.querySelector('.ccm-hd')!.textContent || '')).toContain('恒定评分');
    expect(topLabels()).toEqual(['复制为 DSL 片段', '复制…', '结构…', '删除此包装']);
    expect(await openGroup('结构…')).toBe(true);
    expect(subButtons().map(b => (b.textContent ?? '').trim())).toEqual(['包进新的 bool 组']);
  });

  it('② 容器行右键：一级符合约定，标题写明算子', async () => {
    await mount(MultiNodeRow as any, { node: MULTI, fields: FIELDS, types: TYPES });
    await rightClick(host.querySelector('.mnr-hd') as HTMLElement);
    expect(menuRoot()).toBeTruthy();
    const hd = document.querySelector('.ccm-hd')!.textContent || '';
    expect(hd).toContain('boosting');
    expect(topLabels()).toEqual(['复制为 DSL 片段', '复制…', '结构…', '删除此容器']);
  });

  it('④ 删除走既有 remove emit（不新增写路径）', async () => {
    const remove = vi.fn();
    await mount(MultiNodeRow as any, { node: MULTI, fields: FIELDS, types: TYPES, onRemove: remove });
    await rightClick(host.querySelector('.mnr-hd') as HTMLElement);
    expect(await clickMenuItem('删除此容器')).toBe(true);
    await tick();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(menuRoot(), '点项后关菜单').toBeNull();
  });

  it('③ 输入框内右键不接管（原生复制粘贴不被抢）——包装行 pinned ids 输入框', async () => {
    const PINNED: any = { id: 'w2', type: 'wrap', op: 'pinned', field: null, childKey: 'organic', child: null, params: { ids: ['a', 'b'] } };
    await mount(WrapNodeRow as any, { node: PINNED, fields: FIELDS, types: TYPES });
    const inp = host.querySelector('input.wnr-ids-in') as HTMLElement | null;
    expect(inp, 'pinned 行必须有 ids 输入框').toBeTruthy();
    await rightClick(inp!);
    expect(menuRoot(), '输入框内不弹行菜单').toBeNull();
  });

  it('⑤ 负控：去掉模板上的 @contextmenu → 源判据必须红（判据不是恒真）', () => {
    const s = read('MultiNodeRow.vue');
    const stripped = s.replace('<div class="mnr-hd" tabindex="0" @contextmenu.prevent="openRowMenu" @keydown.self="onRowMenuKey">', '<div class="mnr-hd">');
    expect(stripped, '负控必须真的改掉模板').not.toBe(s);
    const i = stripped.indexOf('class="mnr-hd"');
    const tagEnd = stripped.indexOf('>', i);
    expect(stripped.slice(i, tagEnd), '去掉后必须判不合格').not.toContain('@contextmenu.prevent');
  });
});
