/**
 * 一千三百四十四批：Mapping 设计器的字段树行没有右键。
 *
 * 全站右键普查命中的第 4 处。本页字段树是「一个字段一行」，而字段的**全路径**
 * （含嵌套前缀，如 `publisher.org_name`）正是这页最常被拿走的东西：
 * 贴进 DSL 查询、贴进 PUT mapping、发给同事。
 * 点选只把字段名喂给「新建字段」表单，**拿不到路径**。
 *
 * 按项目右键约定补（一级 ≤2 个频繁动作 + 分组父项）：
 *   一级：复制字段全路径 | 更多…
 *   二级：复制末段字段名 | 复制 exists 查询片段 | 复制「路径 类型」
 *
 * 真机验收（headless Chrome + mock，真实鼠标）：
 *   顶层 `publish_time` → 复制字段全路径 → `publish_time`
 *   嵌套 `publisher` 展开后右键子字段 `org_name` → 复制字段全路径 → **`publisher.org_name`**
 *   （嵌套前缀必须带上——这是该动作相对「点选」的唯一增量）
 *
 * 本 spec 锁：
 *  ① 节点渲染挂 onContextmenu 且 preventDefault + stopPropagation（行有 onClick 选中）；
 *  ② 递归子节点把 ctx 往上传（否则只有第一层能右键）；
 *  ③ 一级恰 2 项；全路径取的是 `name`（渲染时已拼好 prefix），不是裸 `node.name`；
 *  ④ 二级 exists 片段是 `{exists:{field}}` 形态。
 * 负控：去掉节点上的 onContextmenu → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/MappingDesignerView.vue'), 'utf-8');

describe('1443 Mapping 字段树键盘', () => {
  it('字段行可聚焦，菜单键/Enter/Space/方向键接线', () => {
    expect(src).toContain("tabindex: '0', role: 'treeitem'");
    expect(src).toContain(`'aria-level': String(full.split('.').length)`);
    expect(src).toContain(`'aria-expanded': String(open.value)`);
    expect(src).toContain('role="tree" aria-label="字段树"');
    expect(src).toContain("role: 'group'");
    expect(src).toContain('onKeydown: (e: KeyboardEvent) => onNodeKey(e, n, full, hasChild)');
    expect(src).toContain("e.key === 'ArrowRight' || e.key === 'ArrowLeft'");
    expect(src).toContain("open.value = e.key === 'ArrowRight'");
    expect(src).toContain('const onNodeKey = (e: KeyboardEvent');
    expect(src).toContain('isMenuKey(e)');
    expect(src).toContain('menuKeyAnchor(e)');
    expect(src).toContain("e.key === 'Enter' || e.key === ' '");
    expect(src).toContain("querySelectorAll<HTMLElement>('.md-node')");
    expect(src).toContain(':deep(.md-node:focus-visible)');
  });
});

describe('1344 Mapping 字段树行右键', () => {
  it('节点挂 onContextmenu，且 preventDefault + stopPropagation', () => {
    const i = src.indexOf('onContextmenu:');
    expect(i, '节点必须挂 onContextmenu').toBeGreaterThan(-1);
    const seg = src.slice(i, i + 260);
    expect(seg).toContain('e.preventDefault()');
    expect(seg, '行有 onClick 选中，右键必须 stopPropagation').toContain('e.stopPropagation()');
  });

  it('递归子节点把 ctx 往上传（否则只有顶层能右键）', () => {
    const i = src.indexOf('h(MappingNode, { node: c, prefix: full');
    expect(i, '递归渲染必须存在').toBeGreaterThan(-1);
    const seg = src.slice(i, i + 260);
    expect(seg, '子节点必须转发 ctx').toContain('onCtx:');
  });

  it('一级恰 2 项：复制全路径 + 分组父项', () => {
    const i = src.indexOf('const fieldMenuItems');
    expect(i, 'fieldMenuItems 必须存在').toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n});', i));
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const topKeys = [...beforeChildren.matchAll(/key: '([a-z-]+)'/g)].map(m => m[1]);
    expect(topKeys).toEqual(['md-copy-path', 'md-more']);
  });

  it('全路径取渲染时拼好的 name（含 prefix），不是裸节点名', () => {
    const i = src.indexOf('const fieldMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body, '必须复制 n.name（渲染时已拼 prefix）').toContain('String(n.name)');
    expect(body, '末段才允许 split').toContain("String(n.name).split('.')");
  });

  it('二级 exists 片段是 {exists:{field}} 形态', () => {
    const i = src.indexOf('const fieldMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body).toContain('exists');
    expect(body).toMatch(/JSON\.stringify\(\{\s*exists:\s*\{\s*field:/);
  });
});
