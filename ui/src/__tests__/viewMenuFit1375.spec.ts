/**
 * 一千三百七十五批：工具栏「视图 ⋯」菜单够不着（末项被视口裁掉、点不到）。
 *
 * 真机实测（1440×1000，DSL 工作台执行后展开「视图 ⋯」）：
 *   菜单 top 732 / bottom 1028，视口 1000 → **溢出 28px**，且 overflow-y: visible，
 *   最后一项「✓ 语义格式化」被裁在屏幕外，鼠标点不到（用户说的「操作报错/遮挡」）。
 *
 * 修法：菜单可用高度按**触发器到视口底**实时算（`viewMenuMaxH`），留 20px 呼吸 +
 * 内部滚动兜底。修复后 bottom 985 < 1000；滚到底后末项 inViewport 且点击生效。
 *
 * 本 spec 锁：
 *  ① 高度由触发器位置实时算，不是写死的固定值；
 *  ② 菜单自身可滚动（超长时兜底）；
 *  ③ 两内核同修（QRT 工具行菜单同病）；
 *  ④ 负控：把计算换回固定 420px → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('1375 视图菜单装得下', () => {
  it('① 高度按触发器到视口底实时算（不是固定值）', () => {
    expect(RT, '必须有实时计算函数').toMatch(/function toggleViewMenu\(e: MouseEvent\)/);
    expect(RT, '必须用 innerHeight - 触发器底').toMatch(/window\.innerHeight - r\.bottom/);
    expect(RT, '菜单必须消费该值').toMatch(/:style="\{ maxHeight: viewMenuMaxH \+ 'px' \}"/);
    expect(RT, '打开按钮必须走该函数').toContain('@click.stop="toggleViewMenu($event)"');
  });

  it('② 菜单自身可滚动（超长兜底）', () => {
    for (const [name, src, sel] of [['RT', RT, '.rt-menu'], ['QRT', QRT, '.qrt-menu']] as const) {
      const i = src.indexOf(sel + ' {');
      expect(i, `${name} 必须有 ${sel}`).toBeGreaterThan(-1);
      const body = src.slice(i, src.indexOf('}', i));
      expect(body, `${name} 菜单必须可内部滚动`).toContain('overflow-y: auto');
      expect(body, `${name} 菜单必须有高度上限`).toMatch(/max-height:\s*min\(70dvh/);
    }
  });

  it('③ 两内核同修（QRT 工具行菜单同一病）', () => {
    const i = QRT.indexOf('.qrt-menu {');
    expect(QRT.slice(i, QRT.indexOf('}', i)), 'QRT 也要有滚动兜底').toContain('overscroll-behavior: contain');
  });

  it('④ 负控：换回固定 420px → ① 必须红', () => {
    const broken = RT.replace(
      'viewMenuMaxH.value = Math.max(160, Math.floor(window.innerHeight - r.bottom - 20));',
      'viewMenuMaxH.value = 420;',
    );
    expect(broken, '负控必须真的改掉').not.toBe(RT);
    expect(broken, '固定值必须判不合格').not.toMatch(/window\.innerHeight - r\.bottom/);
  });
});
