/**
 * 一千三百三十三批：查询工作台的「那份表」同样漏了宿主注入项（1330 的姊妹缺口）。
 *
 * 1330 只修了索引工作区的两个 tab，查询工作台（DslQueryView）当时没接 `bar-menu-extra`。
 * 它的 bar-extra 里塞了 1 个图标钮 + 1 个自造「更多」菜单，共 4 个宿主动作：
 *
 *   真机（DSL 查询，1280，执行示例后右键工具行）
 *   一级：导出当前页 / 行高 / 快照 PNG / 更多…
 *   二级（修复前）：重置列宽 / 全部列适应 / 聚合行 / 转置 / 语义格式化   ← 宿主 4 项一个都没有
 *   二级（修复后）：… + 查看原始 IO / 导出本页为 JSON / 全量导出… / 按当前 query 删除
 *
 * 也就是说窄档下「原始 IO」只剩一枚无文字图标；全量导出与按查询删除更是只能从
 * 那个自造弹层里找。工具行右键本该是这张表的完整入口。
 *
 * 硬证据（真实点击那条菜单项）：Blob 73B application/json + a[download]=
 * `research_report-results.json`，菜单随即自关——不是只有文字。
 *
 * 本 spec 锁：绑定了 prop、四项在册、且可用性条件跟按钮同源
 * （expRunning 时「全量导出」变「取消」、canOps 才给删除）。
 * 负控：删掉模板上的 `:bar-menu-extra` → 第一条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('1333 查询工作台工具行右键要覆盖宿主注入项', () => {
  it('模板把 dqBarMenuExtra 绑到结果表', () => {
    expect(dq, '必须绑 :bar-menu-extra="dqBarMenuExtra"').toContain(':bar-menu-extra="dqBarMenuExtra"');
    /* 绑在结果表标签内，不是别处。
       ⚠标签里有 `h => openDoc(h, true)` 这类箭头函数，`[\s\S]*?>` 会在 `=>` 的 `>` 处提前截断
       （1333 第一版就踩了，断言假红）——改用「到独占一行的 `>`」作为标签终点。 */
    const start = dq.indexOf('<ResultTable ref="resultTbl"');
    expect(start, '必须有结果表标签').toBeGreaterThan(-1);
    const end = dq.indexOf('\n          >', start);
    expect(end, '结果表开标签必须能定位到结束').toBeGreaterThan(start);
    expect(dq.slice(start, end), '绑定必须在这个开标签里').toContain(':bar-menu-extra="dqBarMenuExtra"');
  });

  it('四项宿主动作都在册（原始 IO / 导出本页 / 全量导出 / 按查询删除）', () => {
    const i = dq.indexOf('const dqBarMenuExtra');
    expect(i, 'dqBarMenuExtra 必须声明').toBeGreaterThan(-1);
    const seg = dq.slice(i, dq.indexOf(']);', i) + 3);
    expect(seg).toContain('查看原始 IO');
    expect(seg).toContain('导出本页为 JSON');
    expect(seg).toContain('全量导出');
    expect(seg).toContain('按当前 query 删除');
  });

  it('可用性条件与工具栏按钮同源（不是恒亮）', () => {
    const i = dq.indexOf('const dqBarMenuExtra');
    const seg = dq.slice(i, dq.indexOf(']);', i) + 3);
    /* 导出中：「全量导出」必须变成「取消全量导出」，否则菜单里会出现一个点了没反应的项 */
    expect(seg, '导出中必须给取消项').toContain('取消全量导出');
    expect(seg, '取消项须受 expRunning 门控').toContain('expRunning.value');
    /* 删除是危险动作：与按钮同一条 canOps 权限闸 */
    expect(seg, '删除项须受 canOps 门控').toContain('canOps.value');
  });
});
