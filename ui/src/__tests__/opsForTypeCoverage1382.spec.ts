/**
 * 1382：字段类型 → 推荐算子 的**兜底空洞**普查。
 *
 * opsForType 是「选中字段后算子下拉把哪些算子排前面」的唯一来源。真正的缺陷形态是：
 * 某 mapping 类型在 ES 里真实存在、注册表里也已有算子声明支持它，但 opsForType
 * **整条落到兜底 ['exists']** —— 用户选完字段只看到「字段存在」，读成「不支持」。
 *
 * 判据只针对这种空洞（不要求把所有声明支持的算子都塞进推荐位）：
 *   ① 推荐结果必须都在注册表里；
 *   ② 若推荐就是兜底 `['exists']`，则该类型不得有别的已注册算子声明支持它；
 *   ③ 容器算子（wrap/multi）不得出现在推荐里（叶子算子位放容器会写出非法 DSL）。
 *
 * 说明：为什么不去要求「注册表声明支持的算子必须出现在推荐里」——那会把
 * terms_set / bitmap_terms / distance_feature 这类低频特异算子挤进数值/日期字段的
 * 高频推荐位，实测撞了 545/548/554 三条既有行为锁（它们锁的正是高频位次序）。
 * 低频算子的可达路径是下拉里的「高级分组」（ADV_MENU），不是推荐位。
 */
import { describe, it, expect } from 'vitest';
import { OPS_META, WRAP_LABELS, MULTI_LABELS, opsForType } from '../utils/queryAstOps';

const ALL = new Set([...Object.keys(OPS_META), ...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);

/* 占位类型名（不是真实 mapping 类型）：`number` 只是 OPS_META 里给 term/terms/range
   声明「数值族」用的抽象名，索引 mapping 永远不会是 number；真实类型由 NUMERIC_VALUE_TYPES
   逐个覆盖。把它当缺口会逼出无意义分支，用证据豁免而非静默过滤。 */
const PLACEHOLDER_TYPES: Record<string, string> = {
  number: '抽象占位名（真实映射类型是 long/integer/double…，逐个已覆盖）',
};

function opsByType(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const [op, meta] of Object.entries(OPS_META)) {
    for (const t of (meta as any).types ?? []) {
      if (!m.has(t)) m.set(t, []);
      m.get(t)!.push(op);
    }
  }
  return m;
}

describe('1382 推荐算子兜底空洞', () => {
  const byType = opsByType();
  const types = [...byType.keys()].sort();

  it('① 清单非空（防呆）', () => {
    expect(types.length, '注册表里至少要声明出多种类型').toBeGreaterThanOrEqual(10);
  });

  it('② 推荐的算子必须都在注册表里（不能建议不存在的算子）', () => {
    const bad: string[] = [];
    for (const t of types) {
      for (const op of opsForType(t)) if (!ALL.has(op)) bad.push(`${t} → ${op}`);
    }
    expect(bad, `推荐了未注册算子：${bad.join(', ')}`).toEqual([]);
  });

  it('③ 不得整条落兜底（有条件可用的类型必须有专属推荐）', () => {
    const holes: string[] = [];
    for (const t of types) {
      if (t in PLACEHOLDER_TYPES) continue; /* 证据豁免见 PLACEHOLDER_TYPES */
      const rec = opsForType(t);
      if (rec.length === 1 && rec[0] === 'exists') {
        const others = byType.get(t)!.filter(op => op !== 'exists');
        if (others.length) holes.push(`${t}: 兜底 only，但 ${others.join('/')} 可用`);
      }
    }
    expect(holes, '这些类型选完字段只看到「字段存在」：\n' + holes.join('\n')).toEqual([]);
  });

  it('④ 容器算子不得出现在推荐里（叶子位放容器会写出非法 DSL）', () => {
    const containers = new Set([...Object.keys(WRAP_LABELS), ...Object.keys(MULTI_LABELS)]);
    const bad: string[] = [];
    for (const t of types) {
      for (const op of opsForType(t)) if (containers.has(op)) bad.push(`${t} → ${op}`);
    }
    expect(bad, `容器算子进了叶子推荐：${bad.join(', ')}`).toEqual([]);
  });

  it('⑤ 负控：不存在/未指定类型必须落兜底（判据不是恒真）', () => {
    expect(opsForType('__no_such_type__')).toEqual(['exists']);
    expect(opsForType(undefined)).toEqual(['exists']);
  });
});
