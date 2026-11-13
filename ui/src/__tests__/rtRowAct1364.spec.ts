/**
 * 一千三百六十四批：RT 行尾平铺 7 个图标钮（用户反复说的「太多功能平铺」）。
 *
 * 真机取证（DSL 工作台 1440×900，执行一次查询后读 `td.rt-act`）：
 *
 *   修复前 7 个 30px 图标钮：查看文档 / 编辑文档 / 展开此行详情 / 复制行 JSON /
 *                            解释这条命中得分 / 词频取证 / 删除文档
 *           「操作」列宽 658px，按钮总宽仅 210px → 448px 是空占位
 *   修复后 行内 4 个：查看文档 / 展开此行详情 / 复制行 JSON(仅 hover) / 更多 ⋯
 *           「更多 ⋯」菜单里 5 项全在：编辑文档 / 复制行 JSON / 解释这条命中得分 /
 *                                      词频取证 / 删除文档
 *           操作列宽 658 → 469px（省 189px）
 *
 * 一级只留两个高频（打开文档、就地展开整行），符合项目右键约定；
 * 动作本体、emit、守卫条件（`editable && canWrite` / `props.showRelevance` / `canOps`）
 * 逐字沿用，不新增写路径。
 *
 * 本 spec 锁：
 *  ① 行尾不再逐个平铺那 5 个低频钮（源文本里它们只出现在菜单项里）；
 *  ② 「更多 ⋯」入口在场且 aria-haspopup；
 *  ③ 菜单包含 5 个动作，且守卫条件与原来一致（不是无条件全给）；
 *  ④ 删除仍是 danger 档（破坏性动作不许被"收起来"顺手降级）；
 *  ⑤ 负控：把某个低频钮加回行内 → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

/** `<td class="rt-act">` 到 `</td>` 之间的行内动作区 */
function actCell(): string {
  const i = RT.indexOf('<td class="rt-act">');
  expect(i, '必须有行操作单元格').toBeGreaterThan(-1);
  return RT.slice(i, RT.indexOf('</td>', i));
}

describe('1364 行尾动作收口（7 → 2 高频 + 更多）', () => {
  it('① 行内不再平铺那 5 个低频钮', () => {
    const cell = actCell();
    for (const label of ['编辑文档', '解释这条命中得分', '词频取证', '删除文档']) {
      expect(cell, `行内不该再出现「${label}」`).not.toContain(`aria-label="${label}"`);
    }
  });

  it('② 「更多 ⋯」入口在场且声明为菜单触发器', () => {
    const cell = actCell();
    expect(cell).toContain('class="btn sm ghost rt-row-more"');
    expect(cell, '必须有可读名').toContain('aria-label="此行更多操作"');
    expect(cell, '必须声明是菜单').toContain('aria-haspopup="menu"');
  });

  it('③ 菜单含 5 个动作，且守卫条件与原来一致', () => {
    const i = RT.indexOf('const actMenuItems');
    const block = RT.slice(i, RT.indexOf('});', i));
    expect(block, '编辑仍受 editable+canWrite 守卫').toMatch(/props\.editable && canWrite\.value/);
    expect(block, '得分两项仍受 showRelevance 守卫').toMatch(/props\.showRelevance/);
    expect(block, '删除仍受 canOps 守卫').toMatch(/canOps\.value/);
    for (const k of ['act-edit', 'act-copy', 'act-explain', 'act-xray', 'act-del']) {
      expect(block, `菜单项 ${k} 必须在`).toContain(`key: '${k}'`);
    }
  });

  it('④ 删除仍是 danger 档', () => {
    const i = RT.indexOf('const actMenuItems');
    const block = RT.slice(i, RT.indexOf('});', i));
    expect(block).toMatch(/key: 'act-del'[^}]*danger: true/);
  });

  it('⑤ 负控：把「删除文档」加回行内 → ① 必须红', () => {
    const broken = RT.replace('<td class="rt-act">',
      '<td class="rt-act">\n<button aria-label="删除文档"></button>');
    expect(broken, '负控必须真的改掉').not.toBe(RT);
    const i = broken.indexOf('<td class="rt-act">');
    const cell = broken.slice(i, broken.indexOf('</td>', i));
    expect(cell, '加回后必须判不合格').toContain('aria-label="删除文档"');
  });
});
