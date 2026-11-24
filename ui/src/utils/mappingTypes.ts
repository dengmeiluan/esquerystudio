/* W2-1：mapping properties 展平。从 DslQueryView.preloadMapping 的内联 walk 抽出，
 额外产出 field→type 映射（原实现只在 type==='date' 时记 date，其余类型丢弃），
 供查询构建器按类型给出算子候选与值控件。纯函数，可穷举单测。

 行为等价约束（回归网 三态与 pickHistField 都依赖它）：
 - fields 顺序 = 父先子后的深度优先，调用方仍做 [...new Set()].sort()
 - dates 顺序 = 遍历顺序，调用方只做 [...new Set()] 不排序（pickHistField 认首个）
 - 只递归 v.properties，不下钻 multi-fields 的 v.fields */
export function walkMappingTypes(props: unknown, prefix = ''):
  { fields: string[]; dates: string[]; types: Record<string, string> } {
  const fields: string[] = [];
  const dates: string[] = [];
  const types: Record<string, string> = {};
  const walk = (p: unknown, pre: string) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    for (const [k, v] of Object.entries(p as Record<string, any>)) {
      const path = pre ? pre + '.' + k : k;
      fields.push(path);
      if (v && typeof v === 'object') {
        if (typeof v.type === 'string') types[path] = v.type;
        if (v.type === 'date') dates.push(path);
        if (v.properties) walk(v.properties, path);
      }
    }
  };
  walk(props, prefix);
  return { fields, dates, types };
}

/* multi-field 子域类型表（父字段名 + '.' + 子域 → 类型）。
 与 walkMappingTypes 分家：fields 清单对外是「可查询字段」语义，multi-fields 仍按历史
 口径不进清单（源码锁依赖）；但排序/聚合裁决需要知道 a.keyword 是否存在且是 keyword，
 否则 text 列会被误判成不可排序。纯函数，可穷举单测。 */
export function flattenSubFieldTypes(props: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (p: unknown, pre: string) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return;
    for (const [k, v] of Object.entries(p as Record<string, any>)) {
      const path = pre ? pre + '.' + k : k;
      if (v && typeof v === 'object') {
        for (const [sub, sd] of Object.entries<any>(v.fields || {})) {
          if (sd?.type) out[path + '.' + sub] = sd.type;
        }
        if (v.properties) walk(v.properties, path);
      }
    }
  };
  walk(props, prefix);
  return out;
}
