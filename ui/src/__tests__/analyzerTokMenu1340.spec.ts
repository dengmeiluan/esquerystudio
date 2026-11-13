/**
 * 一千三百四十批：分析器实验室的 token 胶囊没有右键——单个词拿不走。
 *
 * 背景（用户长期诉求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」）：
 * 分词实验室的结果就是一排 token 胶囊（`.al-tok`），每颗带 pos/offsets/type 的 title。
 * 此前全页只有两个**整列**导出按钮（TSV / 全量 JSON），要拿**某一个词**——
 * 去比对词表、贴进 term 查询、报给同事——只能整列导出再手工挑。
 * 而「这一个词」正是分词调试里最高频的操作。
 *
 * 修法遵循项目右键约定（一级 ≤2 个频繁动作 + 分组父项）：
 *   一级：复制这个词 / 更多…
 *   二级：复制词项信息（词\t类型\t位置\t区间） / 复制位置区间 / 复制为 JSON
 * 四个动作都只作用于**这一个 token**，与既有整列导出互补、不重复。
 *
 * 本 spec 锁：
 *  ① 模板里 token 元素挂了 contextmenu 且 **.prevent.stop**（不吃冒泡，避免与容器级手势打架）；
 *  ② 一级恰为 2 项，且含「复制这个词」+ 一个分组父项；
 *  ③ 二级 3 项，文案里带得出该 token 的真实 offsets（不是写死的占位）；
 *  ④ 既有两个整列导出按钮仍在（不是被替换掉）。
 * 负控：删掉 token 上的 @contextmenu → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AnalyzerLabView.vue'), 'utf-8');

describe('1340 分析器 token 右键', () => {
  it('token 元素挂 contextmenu，且 prevent.stop', () => {
    const i = src.indexOf('class="al-tok"');
    expect(i, 'token 元素必须存在').toBeGreaterThan(-1);
    const seg = src.slice(i, i + 400);
    expect(seg, 'token 必须可右键').toMatch(/@contextmenu\.prevent\.stop="openTokMenu\(/);
  });

  it('一级恰 2 项：复制这个词 + 分组父项', () => {
    const i = src.indexOf('const tokMenuItems');
    expect(i, 'tokMenuItems 必须存在').toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n});', i));
    /* 一级 = 顶层对象里的 key（二级在 children 内，不参与一级计数） */
    expect(body).toContain("key: 'tok-copy'");
    expect(body).toContain("key: 'tok-more'");
    expect(body, '一级第二项必须是分组父项（带 children）').toMatch(/key: 'tok-more'[\s\S]{0,200}children:/);
    /* 除 tok-copy / tok-more 外，顶层不应再出现第三个 key: '...'（children 内除外） */
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const topKeys = [...beforeChildren.matchAll(/key: '([a-z-]+)'/g)].map(m => m[1]);
    expect(topKeys, '一级项数').toEqual(['tok-copy', 'tok-more']);
  });

  it('二级 3 项，且引用真实字段（不是写死文案）', () => {
    const i = src.indexOf('const tokMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body).toContain('t.start_offset');
    expect(body).toContain('t.end_offset');
    expect(body).toContain('t.position');
    const sub = body.slice(body.indexOf('children:'));
    const subKeys = [...sub.matchAll(/key: '([a-z-]+)'/g)].map(m => m[1]);
    expect(subKeys.length, '二级项数').toBe(3);
  });

  it('既有整列导出仍在（不是被替换）', () => {
    expect(src, 'TSV 整列导出').toContain('copyLaneTsv');
    expect(src, 'JSON 全量导出').toContain('copyLaneJson');
    expect(src).toMatch(/@click="copyLaneTsv\(l\)"/);
    expect(src).toMatch(/@click="copyLaneJson\(l\)"/);
  });

  it('菜单挂在 CellContextMenu 共享件上（不另造皮）', () => {
    expect(src).toContain("import CellContextMenu, { type CcmItem }");
    expect(src).toMatch(/<CellContextMenu v-if="tokMenu"/);
  });
});
