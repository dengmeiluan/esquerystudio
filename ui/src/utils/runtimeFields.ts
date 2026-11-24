/* 1069：runtime_mappings 定义的运行时字段是「查询期可查」的一等字段——必须并入构建器
   字段源。此前 builderFields 只吃 mappingDetail（idxFields），用户刚在「运行时字段」里定义的
   字段在条件/排序/聚合/高亮的字段候选里完全不可见，手输还会被 FieldSelect 的未知字段黄点
   误判（mapping 里确实没有它）。这里做纯并轨：mapping 优先（ES 不允许 runtime 覆盖已映射
   字段，同名时以 mapping 类型为准），runtime 去重/去空名后追加，类型取 body.type；
   脚本字段无声明类型时留空（不猜类型，交给 opsForType 兜底）。 */
import type { FieldItem } from '../composables/useIndexFields';
import type { NamedSpecItem } from './queryAst';

export function runtimeFieldItems(items: NamedSpecItem[] | null | undefined): FieldItem[] {
  if (!items?.length) return [];
  const seen = new Set<string>();
  const out: FieldItem[] = [];
  for (const it of items) {
    const name = typeof it?.name === 'string' ? it.name.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const raw = it.body?.type;
    out.push({ path: name, type: typeof raw === 'string' ? raw : '' });
  }
  return out;
}

export function mergeRuntimeFields(base: readonly FieldItem[], items: NamedSpecItem[] | null | undefined): FieldItem[] {
  const extra = runtimeFieldItems(items);
  if (!extra.length) return base as FieldItem[];
  const known = new Set(base.map(f => f.path));
  return [...base, ...extra.filter(f => !known.has(f.path))];
}

export type RuntimeFieldType = 'keyword' | 'long' | 'double' | 'date' | 'boolean';

/* 1069 续：占位运行时字段（只有 type、没有 script）查询期不产出值。
   缺省/空串/空对象都算缺 script；非空字符串/数组等非标准形态不代 ES 判（不谎报）。 */
export function runtimeScriptMissing(body: Record<string, unknown> | null | undefined): boolean {
  const s = body?.script;
  if (s == null || s === '') return true;
  if (typeof s !== 'object' || Array.isArray(s)) return false;
  return Object.keys(s as object).length === 0;
}

/* 1069 续：条件里手输了一个 mapping 没有的字段时，一键建运行时字段。
   类型只做保守推断（宁 keyword 勿错型）：
   ① 布尔命名/布尔值 → boolean；
   ② 值形态（数字/小数/ISO 日期/布尔）优先——range 的 gte/gt 对象取首个边界；
   ③ 没有值（exists）或 range 的表达式值（now-7d）才看字段名：日期词根 → date、
      数值词根 → long；
   ④ 其余 keyword（runtime 不支持 text，keyword 最接近且 term/match 均可跑）。
   推断结果会显示在按钮 tooltip 里，用户可在运行时字段区改类型/补 script。 */
export function guessRuntimeType(field: string, op: string, value: unknown): RuntimeFieldType {
  const f = (field || '').toLowerCase();
  if (/^(is|has)_/.test(f)) return 'boolean';
  const v = firstScalar(value);
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return Number.isInteger(v) ? 'long' : 'double';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}([tT ].*)?$/.test(v)) return 'date';
    if (/^-?(0|[1-9]\d*)$/.test(v)) return 'long';
    if (/^-?(?:0|[1-9]\d*)\.\d+$/.test(v)) return 'double';
  }
  /* range 的表达式值（now-7d）与 exists 无值形态都靠字段名兜底；term 的普通字符串
     不按名猜（避免 wildcard '1*' 打到数值命名字段时被误建为 long）。 */
  if ((op === 'range' || op === 'exists' || !op) && (v == null || typeof v === 'string')) {
    if (/(^|_)(date|time|datetime|timestamp|ts|day|week|month|year)($|_)/.test(f) || /_at$/.test(f)) return 'date';
    if (/(^|_)(count|len|length|score|num|amount|price|qty|size|age|rank|total|sum|avg|min|max)($|_)/.test(f)) return 'long';
  }
  return 'keyword';
}

function firstScalar(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? v[0] : undefined;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['gte', 'gt', 'lte', 'lt', 'value', 'from', 'to']) {
      if (o[k] !== undefined) return o[k];
    }
    return undefined;
  }
  return v;
}
