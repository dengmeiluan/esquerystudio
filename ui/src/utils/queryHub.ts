/* 查询工作台——六个查询通道（DSL/SQL/Lucene/沙盒/PIT/语法桥）收敛为一个
 多模式工作台（#/search?mode=）。本文件是纯逻辑层：模式元数据 + 旧路由重定向，
 视图壳（QueryHubView）与侧边栏/命令面板都从这里取单一真相。 */
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { FieldItem } from '../composables/useIndexFields';
import { fieldRoleOf, hasEntityStem } from './fieldRole';

interface QueryMode {
  /** URL ?mode= 值，稳定不可改（深链契约） */
  k: string;
  /** 模式名 */
  t: string;
  /** 一句话本质——帮用户 1 秒选对通道（产品文案，不是技术描述） */
  essence: string;
  /** lucide 图标名（QueryHubView 里映射为组件） */
  icon: string;
  /** 需要的最低 ES 版本（沿用 NavItem.minVer 语义：预警不禁止） */
  minVer?: string;
  /** 收敛前的独立路由（做 redirect 与文案兜底） */
  legacyPath: string;
}

export const QUERY_MODES: readonly QueryMode[] = [
  { k: 'dsl', t: 'DSL', essence: '全能主力 · 模板/变量/聚合图', icon: 'TerminalSquare', legacyPath: '/query' },
  { k: 'sql', t: 'ES-SQL', essence: '表格思维 · 会 SQL 就会查', icon: 'Database', minVer: '6.3', legacyPath: '/sql' },
  { k: 'lucene', t: 'Lucene', essence: '一行搜遍 · 数组/nested 全友好', icon: 'SearchCode', legacyPath: '/lucene' },
  { k: 'sandbox', t: '沙盒', essence: '全集群试错 · explain/profile', icon: 'Beaker', legacyPath: '/sandbox' },
  { k: 'pit', t: 'PIT 分页', essence: '深分页导出 · 破 10000 上限', icon: 'Layers', minVer: '7.10', legacyPath: '/pit-scroll' },
  { k: 'bridge', t: '语法桥', essence: 'SQL⇄DSL⇄Lucene 三态互转', icon: 'ArrowLeftRight', minVer: '6.3', legacyPath: '/sql-bridge' },
];

export const DEFAULT_MODE = 'dsl';

/** mode 值合法化：未知值回落默认（手改 URL/旧书签容错） */
export function normalizeMode(v: string | null | undefined): string {
  return QUERY_MODES.some(m => m.k === v) ? (v as string) : DEFAULT_MODE;
}

/** 旧路由 → 模式（入口收敛后 6 条旧路径 redirect 到 /search，深链/收藏/goto 键零死链） */
export const LEGACY_QUERY_PATHS: Readonly<Record<string, string>> = Object.freeze(
  QUERY_MODES.reduce<Record<string, string>>((acc, m) => { acc[m.legacyPath] = m.k; return acc; }, {})
);

/** 构造 redirect 目标：保留原 query 全部参数（?idx=&dsl= 等现场），叠加 mode */
export function legacyRedirect(path: string, query: LocationQuery): { path: string; query: LocationQueryRaw } {
  return { path: '/search', query: { ...query, mode: LEGACY_QUERY_PATHS[path] || DEFAULT_MODE } };
}

/* ==== ：开发场景直达层 ====
 开发者不是带着「我要写 DSL」来的，而是带着任务来的：数据写进去没有？按 ID 捞一条看看？
 字段回填漏了多少？场景任务把这些日常动作一键翻译成 DSL 预填进编辑器——
 既是快捷方式，也是活的 DSL 教材（用户看到生成的语句即学会）。 */

export type QuickTaskRole = 'date' | 'entity' | 'category' | 'text';

export interface QuickTask {
  k: string;
  t: string;
  /** 场景描述（开发者的原话，不是 ES 术语） */
  scene: string;
  /** 场景分组标签（首个带 head 的任务前渲染一条分隔说明） */
  head?: string;
  /** 需要用户补充的输入（如文档 ID / 字段名）；无则一键直达。
 W1 ：kind='field' 标记字段名语义——视图层换 FieldPicker（mapping 补全），其余保持纯手输；
 typeFilter 透传 FieldPicker 类型过滤（如 recent 只出 date 字段），无该标记的任务传 undefined */
  input?: { placeholder: string; kind?: 'field'; typeFilter?: string };
  /** 1069 续：第二输入（主体+关键词这类组合场景）；视图层渲染第二行输入，二者都填才生成 */
  input2?: { placeholder: string };
  /** 1062：生产场景按 mapping 角色自动绑定字段（视图层解析后传入 build 第二参） */
  autoRole?: QuickTaskRole;
  /** 1068：组合场景需要多个角色（如主体 + 时间窗）；优先于 autoRole */
  autoRoles?: QuickTaskRole[];
  /** 生成 DSL（input 为用户输入，field 为首个解析字段，fields 为全部角色字段，input2 为第二输入） */
  build: (input: string, field?: string, fields?: Partial<Record<QuickTaskRole, string>>, input2?: string) => string;
}

const QUICK_KW = new Set(['keyword', 'constant_keyword', 'wildcard', 'ip', 'version']);
const isMultiField = (path: string) => path.endsWith('.keyword');

/** 1062：按业务角色从当前 mapping 选真实字段（够用即可，宁缺勿假）：
    date/text 取对应类型；entity 优先 keyword 名称字段，退化到 text 名称字段的 .keyword 子域；
    category 只要非多字段的 keyword 族分类字段。 */
export function resolveQuickTaskField(fields: FieldItem[], role: QuickTaskRole): string | null {
  if (role === 'date') return fields.find(f => f.type === 'date' || f.type === 'date_nanos')?.path ?? null;
  if (role === 'text') {
    /* 1069 续：优先真正的正文（fieldRole=text）；标题/摘要类 text 是 entity，只有没有正文时才退用 */
    const body = fields.find(f => (f.type === 'text' || f.type === 'match_only_text')
      && fieldRoleOf(f.path, f.type) === 'text');
    return body?.path ?? fields.find(f => f.type === 'text' || f.type === 'match_only_text')?.path ?? null;
  }
  if (role === 'category') {
    const cats = fields.filter(f => QUICK_KW.has(f.type) && !isMultiField(f.path) && fieldRoleOf(f.path, f.type) === 'category');
    /* 主体属性（issuer_type/company_industry）在「某主体的分类构成」里过滤后是常量：
       优先选文档级分类（评级/公告类型/来源），没有才退回主体属性。 */
    return (cats.find(f => !hasEntityStem(f.path)) ?? cats[0])?.path ?? null;
  }
  const kwEntity = fields.find(f => QUICK_KW.has(f.type) && !isMultiField(f.path) && fieldRoleOf(f.path, f.type) === 'entity');
  if (kwEntity) return kwEntity.path;
  for (const f of fields) {
    if (f.type === 'text' && fieldRoleOf(f.path, f.type) === 'entity'
      && fields.some(x => x.path === f.path + '.keyword')) return f.path + '.keyword';
  }
  return null;
}

export const QUICK_ROLE_LABEL: Record<QuickTaskRole, string> = {
  date: 'date 字段', entity: '主体/名称字段', category: '分类字段', text: 'text 字段',
};

export interface QuickTaskAvailability {
  available: boolean;
  missing: string;
  roles: Partial<Record<QuickTaskRole, string>>;
}

/** 1069 续：按当前 mapping 自动判断场景任务是否可用（开源通用：只看字段角色，不认业务字段名）。
 * 无角色任务恒可用；角色任务的缺失项直接给出人话，供 UI 预禁用与 tooltip 使用。 */
export function quickTaskAvailability(t: QuickTask, fields: FieldItem[]): QuickTaskAvailability {
  const roles = t.autoRoles?.length ? t.autoRoles : t.autoRole ? [t.autoRole] : [];
  if (!roles.length) return { available: true, missing: '', roles: {} };
  const resolved: Partial<Record<QuickTaskRole, string>> = {};
  const missing: string[] = [];
  for (const role of roles) {
    const f = resolveQuickTaskField(fields, role);
    if (f) resolved[role] = f;
    else missing.push(QUICK_ROLE_LABEL[role]);
  }
  return { available: missing.length === 0, missing: missing.join('、'), roles: resolved };
}

export interface QuickTaskRecommendation {
  task: QuickTask;
  availability: QuickTaskAvailability;
  roleCount: number;
}

/** 1069 续：按当前 mapping 自动推荐「可直接执行」的场景（无输入、角色全可解析）。
 * 角色覆盖多者优先（更具体），同覆盖保持目录原序；不让推荐改变完整目录的教学顺序。
 * 开源通用：只依据字段角色解析结果，不认业务索引/字段名。 */
export function recommendQuickTasks(fields: FieldItem[], limit = 3): QuickTaskRecommendation[] {
  return QUICK_TASKS
    .filter(t => (t.autoRole || t.autoRoles?.length) && !t.input)
    .map(t => ({
      task: t,
      availability: quickTaskAvailability(t, fields),
      roleCount: t.autoRoles?.length || 1,
    }))
    .filter(r => r.availability.available)
    .sort((a, b) => b.roleCount - a.roleCount)
    .slice(0, Math.max(0, limit));
}

/** 1069 续：自动绑定的可读证据（角色→真实字段）；缺角色返回「缺：…」。
 * 开源通用：角色来自字段类型/词根推断，不认业务索引名。 */
export function quickTaskBindingLabel(t: QuickTask, fields: FieldItem[]): string {
  const av = quickTaskAvailability(t, fields);
  if (!av.available) return av.missing ? `缺：${av.missing}` : '';
  const roles = Object.entries(av.roles) as Array<[QuickTaskRole, string]>;
  if (!roles.length) return '';
  return roles.map(([r, f]) => `${QUICK_ROLE_LABEL[r]}→${f}`).join(' · ');
}

/** 任务 → DSL（autoRole/autoRoles 任务先解析字段；缺角色时返回 missing，不生成注定查空的 DSL） */
export function quickTaskDsl(
  t: QuickTask, input: string, fields: FieldItem[], input2 = '',
): { dsl?: string; field?: string; missing?: string } {
  const roles = t.autoRoles?.length ? t.autoRoles : t.autoRole ? [t.autoRole] : [];
  if (!roles.length) return { dsl: t.build(input, undefined, undefined, input2) };
  const av = quickTaskAvailability(t, fields);
  if (!av.available) return { missing: av.missing };
  return { dsl: t.build(input, av.roles[roles[0]], av.roles, input2), field: roles.map(r => av.roles[r]).join(' · ') };
}

export const QUICK_TASKS: readonly QuickTask[] = [
  {
    k: 'by-id', t: '按 ID 捞文档', scene: '刚写入一条数据，按 _id 验证它真的进去了',
    input: { placeholder: '文档 _id，多个用逗号分隔' },
    build: (input: string) => JSON.stringify({
      query: { ids: { values: input.split(',').map(s => s.trim()).filter(Boolean) } },
    }, null, 2),
  },
  {
    k: 'sample', t: '抽样看 10 条', scene: '新接手一个索引，先看看数据长什么样',
    build: () => JSON.stringify({ query: { match_all: {} }, size: 10 }, null, 2),
  },
  {
    k: 'count', t: '只数总数', scene: '灌数/迁移后核对条数对不对',
    build: () => JSON.stringify({ query: { match_all: {} }, size: 0, track_total_hits: true }, null, 2),
  },
  {
    k: 'missing', t: '查字段缺失', scene: '上线新字段后，找出还没回填的文档',
    input: { placeholder: '字段名，如 update_time', kind: 'field' },
    build: (input: string) => JSON.stringify({
      query: { bool: { must_not: [{ exists: { field: input.trim() } }] } }, size: 10,
      track_total_hits: true,
    }, null, 2),
  },
  {
    k: 'recent', t: '看最新写入', scene: '按时间字段倒序，确认最近的数据进来了',
    input: { placeholder: '时间字段名，如 create_time', kind: 'field', typeFilter: 'date' },
    build: (input: string) => JSON.stringify({
      query: { match_all: {} }, size: 10,
      sort: [{ [input.trim()]: { order: 'desc' } }],
    }, null, 2),
  },
  /* 1062：生产检索场景——字段不靠手填，按当前 mapping 的业务角色自动绑定；
     缺角色时视图层明确拒绝生成，避免产出注定查空的 DSL。 */
  {
    k: 'recent-window', t: '最近 7 天', head: '生产场景（按 mapping 自动绑定字段）',
    scene: '公告/研报/舆情按时间窗取最新（自动绑定 date 字段）', autoRole: 'date',
    build: (_input: string, field?: string) => JSON.stringify({
      query: { bool: { filter: [{ range: { [field as string]: { gte: 'now-7d/d', lte: 'now' } } }] } },
      sort: [{ [field as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  {
    k: 'entity-top', t: '主体 Top 20', scene: '主体/企业名称分布（自动绑定名称字段）', autoRole: 'entity',
    build: (_input: string, field?: string) => JSON.stringify({
      size: 0, track_total_hits: true,
      aggs: { top_entities: { terms: { field, size: 20 } } },
    }, null, 2),
  },
  {
    k: 'category-top', t: '分类分布', scene: '按分类/状态/行业看构成（自动绑定分类字段）', autoRole: 'category',
    build: (_input: string, field?: string) => JSON.stringify({
      size: 0, track_total_hits: true,
      aggs: { top_categories: { terms: { field, size: 20 } } },
    }, null, 2),
  },
  {
    k: 'text-search', t: '正文关键词', scene: '在正文/标题里搜关键词（自动绑定 text 字段）',
    input: { placeholder: '关键词，如 违约' }, autoRole: 'text',
    build: (input: string, field?: string) => JSON.stringify({
      query: { match: { [field as string]: input.trim() } },
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  /* 1068：组合场景——一次绑定两个角色（输入值 + 自动时间窗），覆盖“某主体最近的公告/舆情”高频问法 */
  {
    k: 'entity-recent', t: '主体近 7 天', scene: '某主体最近的公告/研报/舆情（主体值 + 时间窗，自动绑定字段）',
    input: { placeholder: '主体名称或代码，如 示例公司' }, autoRoles: ['entity', 'date'],
    build: (input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>) => JSON.stringify({
      query: { bool: { must: [
        { term: { [fields?.entity as string]: input.trim() } },
        { range: { [fields?.date as string]: { gte: 'now-7d/d', lte: 'now' } } },
      ] } },
      sort: [{ [fields?.date as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  {
    k: 'text-recent', t: '关键词近 7 天', scene: '标题/正文包含关键词且最近 7 天（关键词 + 时间窗，自动绑定字段）',
    input: { placeholder: '关键词，如 违约' }, autoRoles: ['text', 'date'],
    build: (input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>) => JSON.stringify({
      query: { bool: { must: [
        { match: { [fields?.text as string]: input.trim() } },
        { range: { [fields?.date as string]: { gte: 'now-7d/d', lte: 'now' } } },
      ] } },
      sort: [{ [fields?.date as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  /* 1069 续：研报/公告/舆情「每主体只看最近一条」——collapse 去重是生产高频问法；
     近 90 天窗口避免对全量文档做折叠（代价高且结果不稳定）。 */
  {
    k: 'entity-latest', t: '每主体最新一篇',
    scene: '研报/公告/舆情按主体去重，只看每个主体最近一条（主体 + 时间窗，自动绑定字段）',
    autoRoles: ['entity', 'date'],
    build: (_input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>) => JSON.stringify({
      query: { bool: { filter: [
        { range: { [fields?.date as string]: { gte: 'now-90d/d', lte: 'now' } } },
      ] } },
      collapse: { field: fields?.entity },
      sort: [{ [fields?.date as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  /* 某主体的分类构成（媒体来源/公告类型/研报类别）——一次输入主体，分类字段自动绑定 */
  {
    k: 'entity-category-top', t: '主体分类构成',
    scene: '看某主体的公告类型/研报类别/媒体来源分布（主体 + 分类字段，自动绑定）',
    input: { placeholder: '主体名称或代码，如 示例公司' }, autoRoles: ['entity', 'category'],
    build: (input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>) => JSON.stringify({
      size: 0, track_total_hits: true,
      query: { term: { [fields?.entity as string]: input.trim() } },
      aggs: { by_category: { terms: { field: fields?.category, size: 20 } } },
    }, null, 2),
  },
  /* 风险监测高频：关键词相关的每个主体只看最近一条（关键词 + 去重 + 时间窗） */
  {
    k: 'text-entity-latest', t: '关键词每主体最新',
    scene: '关键词相关的每个主体只看最近一条公告/舆情（去重 + 近 90 天，自动绑定正文/主体/时间字段）',
    input: { placeholder: '关键词，如 违约' }, autoRoles: ['text', 'date', 'entity'],
    build: (input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>) => JSON.stringify({
      query: { bool: { must: [
        { match: { [fields?.text as string]: input.trim() } },
        { range: { [fields?.date as string]: { gte: 'now-90d/d', lte: 'now' } } },
      ] } },
      collapse: { field: fields?.entity },
      sort: [{ [fields?.date as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
  /* 双输入组合：主体 + 关键词 + 时间窗（风险监测高频） */
  {
    k: 'entity-text-recent', t: '主体+关键词近 7 天',
    scene: '风险监测：某主体包含关键词的最近公告/舆情（主体 + 关键词 + 时间窗，自动绑定字段）',
    input: { placeholder: '主体名称或代码，如 示例公司' },
    input2: { placeholder: '关键词，如 违约' },
    autoRoles: ['entity', 'text', 'date'],
    build: (input: string, _field?: string, fields?: Partial<Record<QuickTaskRole, string>>, input2?: string) => JSON.stringify({
      query: { bool: { must: [
        { term: { [fields?.entity as string]: input.trim() } },
        { match: { [fields?.text as string]: String(input2 || '').trim() } },
        { range: { [fields?.date as string]: { gte: 'now-7d/d', lte: 'now' } } },
      ] } },
      sort: [{ [fields?.date as string]: { order: 'desc' } }],
      size: 20, track_total_hits: true,
    }, null, 2),
  },
];

/** DSL → ?dsl= 深链参数（与 DslQueryView 的 atob 解码契约一致） */
export function encodeDslParam(dsl: string): string {
  return btoa(unescape(encodeURIComponent(dsl)));
}
