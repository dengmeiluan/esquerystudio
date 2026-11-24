/**
 * 1379：REST 直连响应区右键能力。
 *
 * 用户原话「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
 * 实测：RestView 响应区此前**完全没有右键**——复制只能点工具行那个钮，
 * 想只取 JQ 过滤后的结果、或把请求行搬走，只能手工全选。
 *
 * 本批接线并锁定三条：
 *  ① 响应容器挂 @contextmenu.prevent 且无响应时不弹（避免空菜单）；
 *  ② 一级菜单 ≤4 项且含 2 个分组父项（与表格右键「一级≤2+分组」约定同形，
 *     低频动作不许摊到一级）；
 *  ③ 复制走同一取值链（jqResult 优先），与工具行「复制」不产生两套口径。
 *
 * 负控：
 *  · 把一级项数改成 8 → ②必须红；
 *  · 把「复制原始响应」提到一级 → ②的分组数断言必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');

/** 抽出 respMenuItems 的数组字面量区间，用于结构判定 */
function menuBlock(): string {
  const i = src.indexOf('const respMenuItems');
  expect(i, '找不到 respMenuItems').toBeGreaterThan(-1);
  const j = src.indexOf('\n]);', i);
  expect(j, '找不到 respMenuItems 结尾').toBeGreaterThan(i);
  return src.slice(i, j);
}

describe('1379 REST 响应区右键', () => {
  it('① 响应容器挂右键且无响应不弹', () => {
    expect(src, '响应滚动容器必须挂 @contextmenu.prevent')
      .toMatch(/class="scroll-y rt-resp-scroll"[^>]*@contextmenu\.prevent="openRespMenu"/);
    const fn = src.slice(src.indexOf('function openRespMenu'), src.indexOf('function respText'));
    expect(fn, '无响应时不应出菜单').toMatch(/if \(!resp\.value\) return/);
    expect(src, '菜单组件必须挂载').toContain(':items="respMenuItems"');
  });

  it('② 一级菜单 ≤4 项，且低频动作收进分组（含 2 个分组父项）', () => {
    const block = menuBlock();
    /* 一级项 = 顶层 { key: '...' ... }，用 sep 定位不方便；改为数顶层 key 出现次数
       减去 children 内的 key。这里用「有无 children」判定分组父项。 */
    const topKeys = [...block.matchAll(/\{ key: '([\w-]+)'/g)].map(m => m[1]);
    const groupParents = [...block.matchAll(/children: \[/g)].length;
    expect(groupParents, `分组父项数量不对（实际 ${groupParents}）`).toBe(2);
    /* 顶层项 = 总项数 - 所有分组内项数。用缩进层级近似：顶层项缩进 2 空格 */
    const top = [...block.matchAll(/^  \{ key: '/gm)].length;
    expect(top, `一级项过多（${top}），应 ≤4`).toBeLessThanOrEqual(4);
    expect(top, '一级至少要保留复制与请求行两项直达').toBeGreaterThanOrEqual(2);
    /* 负控 A：若把「复制原始响应」提到一级，一级会变 5 项 → 本断言必红 */
    expect(block, '「复制原始响应」应在分组内（一级只放高频）')
      .not.toMatch(/^  \{ key: 'copy-resp-raw'/m);
    expect(topKeys.length).toBeGreaterThan(top);
  });

  it('③ 复制与工具行同取值链（jqResult 优先，不另造口径）', () => {
    const fn = src.slice(src.indexOf('function respText'), src.indexOf('function respSizeText'));
    expect(fn, 'respText 必须与 copyResp 同取值链').toMatch(/jqResult\.value !== null \? jqResult\.value : respParsed\.value/);
    /* 工具行 copyResp 也必须是这条链——两处不一致就是两套口径 */
    const cr = src.slice(src.indexOf('async function copyResp'), src.indexOf('/* ═══ 1379'));
    expect(cr).toMatch(/jqResult\.value !== null \? jqResult\.value : respParsed\.value/);
  });
});
