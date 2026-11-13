/* 字段搜索共享内核：FieldPicker（顶层字段补全）与 FieldSelect（builder 条件/排序/高亮行）
 同一套 rank 排序 / 类型分组 / mark 切分，抽到这里避免两份复制粘贴逻辑漂移。
 输入 fields+query，输出 排序+分组+matched 片段——片段由模板按段渲染 <mark>
 （splitMark 纯函数复用，不开 v-html 注入面，同 MarkText 手法）。
 rank 规则（FieldPicker 既有语义原样下沉）：精确=0 > 前缀=1 > 包含=2，同级字母序。 */
import { ref } from 'vue';
import { writeStoredRaw } from './safeJson';
/* 件⑤：splitMark 改从 utils/markSeg 引（原反向 import composables/useGridSearch
 的依赖倒挂退役；useGridSearch re-export 同一函数引用，行为零漂移） */
import { splitMark } from './markSeg';
import type { FieldItem } from '../composables/useIndexFields';
import { opsForType, NUMERIC_VALUE_TYPES } from './queryAstOps';
import { editDistance } from './editDistance';
import { FIELD_TYPE_ZH } from './esEnumZh'; /* 558b 批：组头人话兜底（跨页单一出处，只读消费） */
import { fieldRoleOf, aliasStemsFor, defaultOpForField, type FieldRole } from './fieldRole';

export type MarkSeg = { t: string; m: boolean };

export interface FieldHit {
  path: string;
  type: string;
  /** 排序档：精确 0 / 前缀 1 / 包含 2（空 query 时全部为 1，等价纯字母序）；
 * 548 C：零命中近似候选恒为 3（见 fuzzy） */
  rank: number;
  /** 输入匹配切分片段（m=true 为命中段，渲染 <mark>） */
  segs: MarkSeg[];
  /** flat 全局序号——cursor/Enter 按 items 索引导航，分组标签不进候选集 */
  i: number;
  /** 548 C：零命中近似候选标记（编辑距离 ≤2 补充；仅精确/前缀/包含三档全空时出现） */
  fuzzy?: boolean;
  /** 1045：中文业务词扩展命中（「主体/公告/研报/债券/舆情」→ 英文字段词根） */
  alias?: boolean;
}

interface FieldGroup { label: string; hits: FieldHit[] }

/* 组头中文名（FieldPicker 既有 GH_LABEL 迁入）：数值族/date 给中文名，其余用类型原名。
 只增 date_nanos（ opsForType/值档已并入 date 族的组头归一，fieldSelectPopup
 锁面无此类型不受影响）；text/keyword 等组头字面被既有 spec 锁定不扩——全类型人话词表
 收口在 utils/esEnumZh.FIELD_TYPE_ZH（本表后续扩容从彼接线）。
 558b 批：接线兑现——groupLabelOf 兜底链 GH_LABEL[type] || FIELD_TYPE_ZH[type] || type，
 text/keyword/ip/boolean/geo_point/object 等组头出人话（词面升级，fieldSelectPopup/
 fieldPicker/boostFieldPrioW3b/ 锁面已同步同步更新）；GH_LABEL 优先保既有档
 零回退。 */
const GH_LABEL: Record<string, string> = {
  long: '数值', integer: '数值', short: '数值', byte: '数值',
  double: '数值', float: '数值', half_float: '数值', scaled_float: '数值', date: '日期',
  date_nanos: '日期',
};

function groupLabelOf(type: string, prio: string[] | null): string {
  /* typePriority 模式：不在优先表里的类型全归「其他」；无 prio 模式按类型原名归组。
 558b 批：兜底链接 esEnumZh.FIELD_TYPE_ZH（跨页单一出处，只读消费不改动彼文件） */
  if (prio && !prio.includes(type)) return '其他 字段';
  return type ? (GH_LABEL[type] || FIELD_TYPE_ZH[type] || type) + ' 字段' : '其他 字段';
}

/** 排序后的命中按组头标签归堆：同标签聚合为一组、组序=标签首次出现序（FieldSelect 类型分组用；
 * typePriority 模式下命中类型本就连续，归堆结果与 FieldPicker 既有逐行插签一致） */
export function groupByLabel(hits: FieldHit[], prio: string[] | null = null): FieldGroup[] {
  const out: FieldGroup[] = [];
  const byLabel = new Map<string, FieldGroup>();
  for (const h of hits) {
    const label = groupLabelOf(h.type, prio);
    let g = byLabel.get(label);
    if (!g) { g = { label, hits: [] }; byLabel.set(label, g); out.push(g); }
    g.hits.push(h);
  }
  return out;
}

export function searchFields(opts: {
  fields: FieldItem[];
  query: string;
  /** 只列这些类型；空 = 全部（FieldPicker typeFilter 语义） */
  typeFilter?: string[];
  /** 智能排序：命中这些类型的字段分组排前（组间标签），空 = 纯 rank+字母序平铺（FieldPicker 无 typePriority 现状） */
  typePriority?: string[];
  /** 1045：业务角色优先序（同一类型/同一 typePriority 组内再按角色排），空 = 不干预 */
  rolePriority?: FieldRole[];
  /** 候选上限，默认 50 = FieldPicker 现状 */
  cap?: number;
}): { total: number; capped: boolean; flat: FieldHit[]; groups: FieldGroup[] } {
  const rawQ = (opts.query || '').trim();
  const kw = rawQ.toLowerCase();
  const wanted = opts.typeFilter?.length ? opts.typeFilter : null;
  const prio = opts.typePriority?.length ? opts.typePriority : null;
  /* 1170：路径段感知——此前只比整串，于是输入 code 时 bond_code（尾段恰好是 code）与
     encode_flag（en·code 只是段内子串）同档并列、按字母序排，真正想找的「编码」字段被淹；
     输入 publish 时 publisher.org_name（另一个词根）还会排在 publish_date 前面。
     分档（越靠前越像用户想找的那个字段）：某段**等于**查询词（首段/尾段/中段递减）
     → 段**前缀**命中 → 段**子串**命中；段边界按 . 与 _ 切（ES 字段命名就这两套）。
     单段路径（nickname / publishTime）不吃分段分：它们与顶层字段同属「顶层候选」，
     维持既有「精确>前缀>包含，同级字母序」口径（fieldSelectPopup 锁面）——不能因为
     user.name 的尾段等于 name 就压过 nickname，那会让**嵌套优先于顶层**，与直觉相反。 */
  const segRank = (n: string): number => {
    if (!kw) return 0;
    const segs = n.toLowerCase().split(/[._]/).filter(Boolean);
    if (segs.length < 2) return 0;
    const eq = segs.findIndex(s => s === kw);
    if (eq >= 0) return eq === 0 ? 1 : eq === segs.length - 1 ? 2 : 3;
    const pre = segs.findIndex(s => s.startsWith(kw));
    if (pre >= 0) return pre === 0 ? 4 : pre === segs.length - 1 ? 5 : 6;
    const inc = segs.findIndex(s => s.includes(kw));
    if (inc >= 0) return inc === 0 ? 7 : inc === segs.length - 1 ? 8 : 9;
    return 10;
  };
  const rankOf = (n: string) => n.toLowerCase() === kw ? 0 : n.toLowerCase().startsWith(kw) ? 1 : 2;
  const cmp = (a: FieldItem, b: FieldItem) => rankOf(a.path) - rankOf(b.path)
    || segRank(a.path) - segRank(b.path)
    || a.path.localeCompare(b.path);
  const base = opts.fields
    .filter(f => (!wanted || wanted.includes(f.type)) && (!kw || f.path.toLowerCase().includes(kw)))
    .sort(cmp);
  /* 1045：业务角色档——同一类型/同一优先组内，把「本算子最相关」的角色提前；
     稳定排序，不改变 rank 档与组内字母序。 */
  const rolePrio = opts.rolePriority?.length ? opts.rolePriority : null;
  const roleIdx = (f: FieldItem) => {
    if (!rolePrio) return 0;
    const i = rolePrio.indexOf(fieldRoleOf(f.path, f.type));
    return i < 0 ? rolePrio.length : i;
  };
  /* 智能排序：prio 命中类型按给定次序分组排前（组内角色→rank+字母序），其余殿后原序 */
  const sorted = prio
    ? [
        ...base.filter(f => prio.includes(f.type)).sort((a, b) => prio.indexOf(a.type) - prio.indexOf(b.type) || roleIdx(a) - roleIdx(b)),
        ...base.filter(f => !prio.includes(f.type)).sort((a, b) => roleIdx(a) - roleIdx(b)),
      ]
    : rolePrio ? base.slice().sort((a, b) => roleIdx(a) - roleIdx(b)) : base;
  const cap = opts.cap ?? 50;
  const flat: FieldHit[] = sorted.slice(0, cap).map((f, i) => ({
    path: f.path, type: f.type, rank: rankOf(f.path),
    segs: splitMark(f.path, rawQ),
    i,
  }));
  /* 548 C：零命中纠错——精确/前缀/包含三档全空且查询词非空时，附编辑距离 ≤2 的 top-5
 最近字段为「近似候选」：rank=3 恒居既有三档之后（仅零命中时存在，天然殿后），
 距离升序、同距字母序；typeFilter 语义照常生效（不越类型域）；空查询不纠错（无笔误可纠正）。
 total 随之计入近似候选数（消费方 N/N 计数连贯），capped 仍只按真实命中判定。
 短词阈值收紧：kw ≤2 字符时距离 ≤1 才纠错——两字全换的 d=2 候选（'ab'→'bd'）
 基本无关，噪音大于价值；≥3 字符维持既有 ≤2 口径（548 C 锁面不回退） */
  let total = base.length;
  if (!flat.length && kw) {
    /* 1045：中文业务词别名扩展——输入「主体/公告/研报/债券/舆情」等零直配时，
       展开到 mapping 里真实存在的英文字段词根（不生成字段，只抬出已有候选）。 */
    const stems = aliasStemsFor(rawQ);
    const aliasFields = stems.length
      ? opts.fields
        .filter(f => !wanted || wanted.includes(f.type))
        .filter(f => {
          const lower = f.path.toLowerCase();
          return stems.some(s => lower.includes(s));
        })
        .sort((a, b) => roleIdx(a) - roleIdx(b) || a.path.localeCompare(b.path))
        .slice(0, 8)
      : [];
    const aliasHits: FieldHit[] = aliasFields.map((f, i): FieldHit => ({
      path: f.path, type: f.type, rank: 2, alias: true,
      segs: [{ t: f.path, m: false }], i,
    }));
    flat.push(...aliasHits);
    if (aliasHits.length) total = aliasHits.length;
    const maxD = kw.length <= 2 ? 1 : 2;
    const fuzzy = opts.fields
      .filter(f => !wanted || wanted.includes(f.type))
      .filter(f => !aliasFields.some(a => a.path === f.path))
      .map(f => ({ f, d: editDistance(kw, f.path.toLowerCase()) }))
      .filter(x => x.d <= maxD)
      .sort((a, b) => a.d - b.d || a.f.path.localeCompare(b.f.path))
      .slice(0, 5)
      .map((x, i): FieldHit => ({ path: x.f.path, type: x.f.type, rank: 3, fuzzy: true, segs: splitMark(x.f.path, rawQ), i: aliasHits.length + i }));
    flat.push(...fuzzy);
    total = aliasHits.length + fuzzy.length;
  }
  return { total, capped: base.length > flat.length, flat, groups: prio ? groupByLabel(flat, prio) : [] };
}

/* ═══ 1054：nested 查询内的字段域 ═══
   nested 子查询只对 path 下的子字段生效；顶层字段在内嵌文档上下文里查不到（静默零命中）。
   把候选收窄到 path.*（不含 path 自身——object/nested 路径不是可查询叶子）。
   映射未展开子字段时回退全量并返回 fallback=true，由 UI 明示而不是让候选凭空消失。 */
export function nestedFieldScope(fields: string[], path: string | null | undefined): { fields: string[]; fallback: boolean; prefix: string } {
  const prefix = (path || '').trim().replace(/\.+$/, '');
  if (!prefix) return { fields, fallback: false, prefix: '' };
  const inner = fields.filter(f => f.startsWith(prefix + '.'));
  return inner.length ? { fields: inner, fallback: false, prefix } : { fields, fallback: true, prefix };
}

/* ═══ per-index 最近字段记忆（FieldSelect recent 升级 + defaultLeaf 记忆共用） ═══
 key 规则：拼当前索引（esquerystudio_qb_field_recent::<idx>）；读不到（无记录）回退全局键，
 升级前写过的全局记录不丢。idx 为空（无索引语境/测试直挂）即全局键本身。 */
const RECENT_KEY = 'esquerystudio_qb_field_recent';
const RECENT_CAP = 10;

/* 当前索引上下文：FieldSelect 深嵌在 NodeRenderer 子树，逐层透传 index prop 会波及组件树
 锁定面——由 QueryTreePane/RootExtrasPane 随自身 index prop 写入模块级现状，FieldSelect 只读 */
const curIndex = ref('');
export function setFieldSearchIndex(idx: string) { curIndex.value = (idx || '').trim(); }
export function curFieldSearchIndex(): string { return curIndex.value; }

/* ═══ ：树内已用字段上下文（FieldSelect 候选 used 前置段的数据源） ═══
 setFieldSearchIndex 同款模块态范式：QueryTreePane watch 树变化收集全部叶子条件字段名
 （去重）写入，FieldSelect 只读——免 prop 逐层透传（NodeRenderer 之下透传面过大，既有先例）。
 语义本就是「本次查询全局已用」（非组件私有态），FieldSelect 多实例同页读同一份可接受。 */
const usedFields = ref<string[]>([]);
export function setFieldSearchUsedFields(names: string[]): void {
  usedFields.value = [...new Set(names.filter(n => !!n))];
}
export function getFieldSearchUsedFields(): string[] { return usedFields.value; }

/** 换号清理：当前索引/已用字段是上一账号查询树的上下文，换人后新树首帧
 *  不能拿旧索引的字段集过滤候选。 */
export function clearFieldSearchContext(): void {
  curIndex.value = '';
  usedFields.value = [];
}

const recentKeyOf = (idx: string) => (idx ? RECENT_KEY + '::' + idx : RECENT_KEY);
function readArr(key: string): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
  } catch { return []; }
}
export function loadRecentFields(idx: string): string[] {
  const per = readArr(recentKeyOf(idx));
  if (per.length || !idx) return per;
  return readArr(RECENT_KEY);   // per-index 无记录回退全局（老记录不丢）
}
export function rememberRecentField(idx: string, field: string): void {
  const key = recentKeyOf(idx);
  const next = [field, ...readArr(key).filter(x => x !== field)].slice(0, RECENT_CAP);
  writeStoredRaw(localStorage, key, JSON.stringify(next));
}
/** 最近使用的一个字段（defaultLeaf 记忆用）；无记录 null */
export function lastRecentField(idx: string): string | null {
  const a = loadRecentFields(idx);
  return a.length ? a[0] : null;
}

/** defaultLeaf 的字段+兼容算子：优先最近使用的字段（本索引记忆），无记录回退 fields[0]；
 * 算子取该字段类型推荐首算子，无类型信息回落 term（既有现状）。
 * fields 为空返回 null，调用方落 match_all。 */
/* 1060：无最近使用时的默认字段——按业务角色挑「最像查询入口」的字段，
   不再取字母序第一个（产线常见 abs_change/amount 抢默认，新条件语义不明）。
   最近使用仍最优先；object/nested 容器不可直接查询，排除后无候选才回退全量。 */
const DEFAULT_FIELD_ROLE_ORDER: FieldRole[] = ['entity', 'text', 'category', 'identifier', 'date', 'metric'];
function smartDefaultField(fields: string[], types: Record<string, string>): string {
  const usable = fields.filter(f => types[f] !== 'object' && types[f] !== 'nested');
  const pool = usable.length ? usable : fields;
  for (const role of DEFAULT_FIELD_ROLE_ORDER) {
    const hit = pool.find(f => fieldRoleOf(f, types[f]) === role);
    if (hit) return hit;
  }
  return pool[0];
}

export function defaultLeafTarget(
  fields: string[], types: Record<string, string>, idx: string,
): { field: string; op: string } | null {
  if (!fields.length) return null;
  const recent = lastRecentField(idx);
  const field = recent && fields.includes(recent) ? recent : smartDefaultField(fields, types);
  const t = types[field];
  /* 1045：角色感知默认算子（metric→range 等）；未识别类型回落 opsForType 首档 */
  const op = t ? defaultOpForField(field, t) : 'term';
  const safe = t && opsForType(t).includes(op) ? op : (t ? opsForType(t)[0] : 'term');
  return { field, op: safe };
}

/* ═══ 件④：值位静态档表单源（TYPE_VALUE_HINTS）═══
 Lucene 值位形态全档合并（此前 LuceneInput 本地七表 / sqlCompletion VAL_FORMAT_HINTS 字面档
 / 本文件 valueHintsForType 三处平行表，逐批手工对齐漂移风险收口）。
 保锁口径（任务书偏差）：① LuceneInput 值位 if 链被 //
 三处旧 spec 逐字锁死——链不收，仅其七常量表本体改引本表（值逐字同形零漂移）；
 ② valueHintsForType 的 563 形态档被 suggestTiers563 锁死（date=now 族 / ip 空），不消费本表；
 ③ sqlCompletion 仅字面语义同构的四档（boolean/ip/version/geo_point）values 引本表，
 date/数值族/wildcard 是 SQL 语法形态（裸字面/pref%/数值示例），与 Lucene 形态分立是
 既有约定（dslValueTiers545 锁面），保留彼文件。 */
export const TYPE_VALUE_HINTS: Record<string, readonly string[]> = {
  date: ['now-1h/h', 'now-1d/d', '>=2026-08-01'],
  date_nanos: ['now-1h/h', 'now-1d/d', '>=2026-08-01'],
  date_range: ['now-1h/h', 'now-1d/d', '>=2026-08-01'],
  boolean: ['true', 'false'],
  ip: ['192.168.0.1', '192.168.0.0/24'],
  ip_range: ['192.168.0.1', '192.168.0.0/24'],
  wildcard: ['pref*'],
  flattened: ['pref*'],
  geo_point: ['40.71,-74.01'],
  version: ['1.0.0'],
};
/* 数值族（NUMERIC_VALUE_TYPES 十口径含 token_count——约定分词计数=数值语义）
 与四数值 range 族：区间形态档（[10 TO 20]），与 LuceneInput NUM_HINTS 既有值逐字同形 */
for (const t of [...NUMERIC_VALUE_TYPES, 'integer_range', 'long_range', 'float_range', 'double_range']) {
  TYPE_VALUE_HINTS[t] = ['>100', '[10 TO 20]'];
}

/* ═══ ：字段类型 → 值位输入建议档（智能提示精化·类型感知）═══
 任务书轨1「候选排序按字段类型优先匹配对应类型」：date 字段查询输入优先 date 函数/
 now 族与范围语法（range 是 date 首推算子，opsForType 同源），数值字段优先范围算子，
 boolean 出字面量对；keyword/text/ip 精确值语义无附加提示出空（ES terms 候选即权威，
 不生造）；token_count 与 opsForType 同口径排除（分词计数无 term/range 精确语义）。
 纯函数零请求——值位输入候选的消费面（LuceneInput/FieldSelect 值位）在黑名单查询面，
 锁本体+spec，消费侧接线下批（）。 */
export function valueHintsForType(type: string | undefined): string[] {
  if (!type) return [];
  if (type === 'date' || type === 'date_nanos') return ['now', 'now-1d', 'now-7d', 'now-30d', '>=', '<='];
  if (type !== 'token_count' && NUMERIC_VALUE_TYPES.includes(type)) return ['>=', '<=', '>', '<'];
  if (type === 'boolean') return ['true', 'false'];
  return [];
}

/** 词项候选按字段类型精化排序（纯函数，不改入参数组）。date 字段 ISO
 * 形态排前、epoch 纯数字串殿后（epoch 是 date 字段合法值但人不可读，殿后不打扰），
 * 其余居中保 ES 原序；数值字段数值形态排前；keyword/text 等 fallback 原样返回——
 * ES doc_count 权威序零扰动。Array.prototype.sort 稳定（V8 规范），同档保原序。
 * 消费面=useTermsSuggest 可选 types 工厂参（同步）展示层精化；缓存/stash 存 ES
 * 权威序，读出后再排（排序纯展示语义，不污染排序基准）。 */
export function rankTermsByType(values: string[], type: string | undefined): string[] {
  if (!values.length || !type) return values;
  const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/.test(v);
  const isEpoch = (v: string) => /^\d{10,}$/.test(v);
  const isNum = (v: string) => /^-?\d+(\.\d+)?$/.test(v);
  if (type === 'date' || type === 'date_nanos') {
    return [...values].sort((a, b) =>
      Number(isIsoDate(b)) - Number(isIsoDate(a)) || Number(isEpoch(a)) - Number(isEpoch(b)));
  }
  if (type !== 'token_count' && NUMERIC_VALUE_TYPES.includes(type)) {
    return [...values].sort((a, b) => Number(isNum(b)) - Number(isNum(a)));
  }
  return values;
}
