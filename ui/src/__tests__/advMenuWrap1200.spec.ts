/**
 * 1200：wrap 容器族（nested / has_child / has_parent）在构建器里**没有任何新建入口**。
 *
 * 这三个算子：有渲染器（WrapNodeRow，含字段类型路由 nested/object → join 字段）、
 * 有参数表（WRAP_PARAMS：inner_hits / score_mode / min_children…）、能无损往返——
 * 但「+ 高级」菜单与算子下拉里都找不到它们。用户只能先手写 DSL 才能用上，
 * 支持读、支持改，唯独不支持新建：这是「双向映射不全面」最典型的一种。
 *
 * 两处根因（都要锁）：
 *  ① ADV_MENU 里压根没有这三个算子（BoolGroupNode 的「+ 高级」直接渲染 ADV_MENU，故一并缺失）；
 *  ② ClauseNode 的算子下拉对 ADV_MENU 过滤时写了 `OPS_META[o] &&`——wrap/多容器族不在 OPS_META，
 *     所以即便加进 ADV_MENU 也会被这个判据悄悄滤掉（两处入口口径不一致）。
 *
 * 锁：① ADV_MENU 含三员且落在「关系与嵌套」组；
 *     ② ClauseNode 的过滤判据是「任一注册表存在」而非只认 OPS_META；
 *     ③ 全量普查：ADV_MENU 引用的每个算子都必须在三张注册表之一（防幽灵项）；
 *     ④ 全量普查：每个 wrap / multi 算子都必须在 ADV_MENU 里可达（防将来新增又漏）；
 *     ⑤ makeNodeByOp 能为三员造出 wrap 节点（创建路径确实通）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADV_MENU, OPS_META, MULTI_META } from '../utils/queryAstOps';
import { WRAP_META, makeNodeByOp } from '../utils/queryAst';

const clause = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

const advAll = ADV_MENU.flatMap(g => g.ops);
const has = (op: string) => advAll.includes(op);

describe('1200 wrap 容器族的新建入口', () => {
  it('ADV_MENU 收录 nested / has_child / has_parent，且同处「关系与嵌套」组', () => {
    const grp = ADV_MENU.find(g => g.group === '关系与嵌套');
    expect(grp, '必须有「关系与嵌套」分组').toBeTruthy();
    expect(grp!.ops.sort()).toEqual(['has_child', 'has_parent', 'nested']);
  });

  it('ClauseNode 叶子下拉仍只认 OPS_META（容器不能从叶子行换过去）', () => {
    /* 985 既定契约：wrap/multi 不是叶子，放进叶子下拉会写出 {term:{nested:…}} 这类非法体。
       本批第一版把判据改成「任一注册表」——被 builder985「下拉不得含复合容器」当场打红，
       这里正面锁住回退后的口径，防止下次又顺手放宽。 */
    expect(clause).toMatch(/g\.ops\.filter\(o => OPS_META\[o\] && !seen\.has\(o\)\)/);
    expect(clause).not.toMatch(/g\.ops\.filter\(o => \(OPS_META\[o\] \|\| WRAP_META\[o\]/);
  });

  it('普查：ADV_MENU 里没有幽灵算子（必须在三张注册表之一）', () => {
    const ghosts = advAll.filter(o => !OPS_META[o] && !WRAP_META[o] && !MULTI_META[o]);
    expect(ghosts, `ADV_MENU 引用了未注册算子：${ghosts.join(',')}`).toEqual([]);
  });

  it('普查：每个 wrap / multi 算子都能从 ADV_MENU 到达（防将来新增又漏）', () => {
    const unreachable = [
      ...Object.keys(WRAP_META).filter(o => !has(o)),
      ...Object.keys(MULTI_META).filter(o => !has(o)),
    ].filter(o => o !== 'span_gap'); /* span_gap 是 span_near 的间隙占位，独立出现 ES 拒绝，刻意不给入口 */
    expect(unreachable, `这些容器算子没有新建入口：${unreachable.join(',')}`).toEqual([]);
  });

  it('创建路径真的通：makeNodeByOp 为三员造出 wrap 节点', () => {
    for (const op of ['nested', 'has_child', 'has_parent']) {
      const n = makeNodeByOp(op) as any;
      expect(n.type, `${op} 必须是 wrap 节点`).toBe('wrap');
      expect(n.op).toBe(op);
      expect(n.childKey).toBe(WRAP_META[op].childKey);
    }
  });
});
