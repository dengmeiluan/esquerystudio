/**
 * 一千三百六十二批：诊断页「待处理任务」行没有右键。
 *
 * 真机取证（1440×900，mock 返回 3 条 pending task）：
 *   `.dg-pending-row` 右键 → **无菜单**（修复前）
 *   修复后 → 「待处理任务 · reindex:research_report」
 *           一级：复制这一条（TSV） / 复制…
 *           二级：复制任务来源 / 复制原始 JSON / 复制整段排队清单（N 条）
 *
 * 为什么是它：这行是纯展示三元组（priority / source / 排队时长），
 * 排查时最高频的动作就是「把这条贴给别人 / 贴进工单」——此前只能鼠标拖选。
 * 菜单全部只读，不新增任何写路径（诊断页没有"操作这一行"的写语义）。
 *
 * 本 spec 锁：
 *  ① 行上挂 contextmenu、菜单组件在场；
 *  ② 标题写明来源（不是干巴巴的「待处理任务」）；
 *  ③ 一级只有 2 项（符合项目右键约定：≤2 高频 + 分组）；
 *  ④ TSV 三列与渲染的三个值一一对应（priority / source / 时长），
 *     排队时长优先用 ES 的 time_in_queue 原文，缺失才回退 millis；
 *  ⑤ 负控：把时长列换成固定 '-' → ④ 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('1362 诊断页待处理任务行右键', () => {
  it('① 行上挂 contextmenu、菜单组件在场', () => {
    const i = SRC.indexOf('class="dg-pending-row"');
    expect(i, '必须有 pending 行').toBeGreaterThan(-1);
    expect(SRC.slice(i, SRC.indexOf('>', i)), '行必须挂 @contextmenu').toContain('@contextmenu.prevent');
    expect(SRC, '必须有菜单组件').toContain('<CellContextMenu');
  });

  it('② 标题写明来源', () => {
    expect(SRC).toMatch(/title: '待处理任务 · ' \+ \(p\.source \|\| '-'\)/);
  });

  it('③ 一级 2 项：复制这一条 + 复制…（分组）', () => {
    const start = SRC.indexOf('const pendingMenuItems');
    const retIdx = SRC.indexOf('return [', start);
    /* 一级 = children 数组出现之前的那几个顶层对象；children 内部的是二级 */
    const head = SRC.slice(retIdx, SRC.indexOf('children: [', retIdx));
    const lvl1 = [...head.matchAll(/key: '(pg-[^']+)'/g)].map(m => m[1]);
    expect(lvl1, '一级只有两个').toEqual(['pg-copy-row', 'pg-more']);
  });

  it('④ TSV 三列与渲染值对应；时长优先 time_in_queue 原文', () => {
    expect(SRC).toMatch(/function pendingTsv\(p: any\): string \{\s*return \[p\.priority \|\| '-', p\.source \|\| '-', queueMsText\(p\)\]\.join\('\\t'\);/);
    /* queueMsText 的口径：ES 已格式化串优先，缺失才 millis */
    expect(SRC).toMatch(/function queueMsText\(p: any\): string \{\s*if \(p\.time_in_queue\) return p\.time_in_queue;/);
  });

  it('⑤ 负控：时长列换成固定 "-" → ④ 的判据必须红', () => {
    const broken = SRC.replace(
      "return [p.priority || '-', p.source || '-', queueMsText(p)].join('\\t');",
      "return [p.priority || '-', p.source || '-', '-'].join('\\t');",
    );
    expect(broken, '负控必须真的改掉').not.toBe(SRC);
    expect(broken).not.toMatch(/p\.source \|\| '-', queueMsText\(p\)\]/);
  });
});
