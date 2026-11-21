/**
 * 1220：DSL 语法全覆盖的**清单级守卫**。
 *
 * 用户的核心诉求是「所有 DSL 查询语法全部支持，常用和非常用都要」。
 * 1181 已经用骨架表跑 parse→serialize 往返，但那条 spec 只在「已有骨架」的范围内生效——
 * 如果哪天 `OPS_META` 新加一个算子却忘了补 `QUERY_SNIPPETS`，1181 不会红
 * （它只遍历骨架表），**新算子就会静默地无骨架、无往返保障**。本 spec 把两侧清单钉在一起。
 *
 * 关于 agg 侧：`AGG_OPS` 68 个里有 21 个没有 `AGG_BODY_PARAMS`，这**不是缺口**——
 * 实测 `weighted_avg` 在聚合编辑器里能完整编辑 `value.field` / `weight.field`，
 * 且带「+ 键名」通用键值通道（截图 agg-panel-1220.png）。那张 schema 表只是常用键的快捷提示，
 * 真正兜底的是通用编辑。所以不对 agg 做"必须有 schema"的断言，避免把设计判成缺陷。
 *
 * ⚠ 本 spec 曾经用「读源码正则数键名」代替真实 import，得到一个 52 的假数
 * （正则只吃了 2 空格缩进的条目），据此报出 10 个"孤儿骨架"——全是假的。
 * 教训：清单类断言必须用**真实模块导出**，不能用文本解析近似。
 */
import { describe, it, expect } from 'vitest';
import { QUERY_SNIPPETS } from '../utils/dslCompletionContext';
import { OPS_META, WRAP_LABELS, MULTI_LABELS } from '../utils/queryAstOps';

const opsMeta = Object.keys(OPS_META);
const wrap = Object.keys(WRAP_LABELS);
const multi = Object.keys(MULTI_LABELS);
const snips = Object.keys(QUERY_SNIPPETS);

describe('1220 DSL 算子覆盖清单', () => {
  it('三张表都读到了（防空表假绿）', () => {
    expect(opsMeta.length).toBeGreaterThan(30);
    expect(wrap.length).toBeGreaterThan(5);
    expect(multi.length).toBeGreaterThan(3);
    expect(snips.length).toBeGreaterThan(30);
  });

  it('注册表里的每个算子都有骨架（新增算子必须同步补骨架）', () => {
    const reg = [...new Set([...opsMeta, ...wrap, ...multi])];
    const have = new Set(snips);
    const missing = reg.filter(o => !have.has(o)).sort();
    expect(missing, '缺骨架的算子:\n' + missing.join('\n')).toEqual([]);
  });

  it('骨架表里没有注册表之外的孤儿（bool 是容器，豁免）', () => {
    const reg = new Set([...opsMeta, ...wrap, ...multi, 'bool']);
    const orphan = snips.filter(o => !reg.has(o)).sort();
    expect(orphan, '孤儿骨架:\n' + orphan.join('\n')).toEqual([]);
  });

  it('总数锁定（防止批量删骨架让上一条空转）', () => {
    const reg = [...new Set([...opsMeta, ...wrap, ...multi])];
    expect(reg.length).toBe(62);
    expect(snips.length).toBe(63); /* 62 + bool */
  });
});
