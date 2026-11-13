/**
 * 1209：文档对比（DocDiffModal）差异表此前**没有任何右键**——全项目唯一一张
 * 有数据、有交互、却只支持左键逐格复制的表。
 *
 * 现场依据（1208 同批普查）：console/src 下所有 `<table>` 宿主里，只有 DocDiffModal
 * 与 SqlBridgeView 的静态能力对比表没有 contextmenu；后者是纯文案矩阵（无数据、
 * 无动作），不补；本表是真实数据 diff，按项目右键约定补齐。
 *
 * 一级只留高频项 + 分组父行（不把 6 个动作平铺成一行）——与右键盘约定一致。
 * 本 spec 同时锁：三个槽位（字段/基准/目标）都能开菜单、整行 TSV 口径正确、
 * 二级「筛选与定位」真的改筛选态（不是空壳）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/DocDiffModal.vue'), 'utf-8');

describe('1209 文档对比差异表右键', () => {
  it('三个槽位都挂了 contextmenu（字段列 / 基准列 / 各目标列）', () => {
    expect(src).toContain('@contextmenu.prevent="openCellMenu($event, r, -1)"');
    expect(src).toContain('@contextmenu.prevent="openCellMenu($event, r, 0)"');
    expect(src).toContain('@contextmenu.prevent="openCellMenu($event, r, ti + 1)"');
    /* 1443：三个槽位都补菜单键入口（字段列同时补可聚焦） */
    expect(src).toContain('@keydown="onCellMenuKey($event, r, -1)"');
    expect(src).toContain('@keydown="onCellMenuKey($event, r, 0)"');
    expect(src).toContain('@keydown="onCellMenuKey($event, r, ti + 1)"');
  });

  it('共享件而非自造菜单：CellContextMenu + CcmItem', () => {
    expect(src).toContain("import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';");
    expect(src).toContain('<CellContextMenu v-if="cellMenu"');
    expect(src).toContain(':items="cellMenuItems"');
    /* 不得出现自造右键浮层（.ddm-ctx 之类） */
    expect(src).not.toMatch(/class="ddm-(ctx|menu)"/);
  });

  it('一级不铺开：带 children 的分组父行 >= 2，一级动作 <= 3', () => {
    const body = src.slice(src.indexOf('const cellMenuItems'), src.indexOf('</script>'));
    const parents = (body.match(/children:\s*\[/g) || []).length;
    expect(parents).toBeGreaterThanOrEqual(2);
    /* 一级直接项：复制值 / 复制字段路径（其余都在 children 里） */
    const flat = body.slice(0, body.indexOf("key: 'row'"));
    const direct = (flat.match(/key: '/g) || []).length;
    expect(direct).toBeLessThanOrEqual(2);
  });

  it('整行 TSV 口径：字段 + 基准 + 各目标，制表符换行折空格', () => {
    expect(src).toContain('const rowTsv = () => [m.row.path, m.row.base, ...m.row.targets]');
    expect(src).toContain(".map(x => (x === undefined ? '' : asText(x)).replace(/[\\t\\r\\n]/g, ' ')).join('\\t');");
  });

  it('「筛选与定位」二级真的改状态（不是空壳菜单）', () => {
    expect(src).toContain("run: () => { pathKw.value = m.row.path; }");
    expect(src).toContain("run: () => { onlyDiff.value = true; }");
    expect(src).toContain("run: () => { onlyDiff.value = false; pathKw.value = ''; }");
  });

  it('槽位取数：字段列无值（不出现复制值）、基准列取 base、目标列取 targets[ti]', () => {
    expect(src).toContain('if (ci < 0) return undefined;');
    expect(src).toContain('return ci === 0 ? row.base : row.targets[ci - 1];');
    expect(src).toContain('const hasVal = m.ci >= 0 && v !== undefined;');
  });

  it('标题用展示位次（#1/#2）而不是数组下标', () => {
    expect(src).toContain("const label = ci < 0 ? '字段' : ci === 0 ? '基准' : `#${targetNo(ci - 1)}`;");
  });
});
