/* W2 批：SQL 智能补全单例（原 SqlBridgeView 内联 provider 抽出，SqlConsoleView 同享）。
 *
 * ES-SQL 的表名=索引名、列=字段，官方 sql 贡献（basic-languages）只有高亮 + 词表兜底，
 * 语义候选为零。此处按上下文注入三类候选（语言级注册，dispose 随最后一个使用方卸载；
 * 与 PainlessLabView params provider 同范式：闭包现读响应式最新值，triggerCharacters ['.']）。
 *
 * 单例契约：ensureSqlCompletion(monaco, getCtx) 返回 { dispose }——引用计数防重复注册：
 * SqlBridge/SqlConsole 先后挂载只注册一份 provider；每个使用方持有一个独立 { dispose }，
 * 只有最后一个 dispose 才真正注销（零间隙，中途进入的编辑器始终有候选）。
 *
 * 上下文规则（对光标前文本做尾匹配，优先级自上而下）：
 * ① FROM 表名位 /FROM\s+"?([\w.\-]*)$/i → 索引名候选：getCtx().indices() 全量清单（IndexCat.index），
 * rank 排序复用 fieldSearch.searchFields（精确>前缀>包含，cap 50）；
 * 修复：\w 不含 -/.——连字符索引（logs-2026）与点分索引在 FROM 位失配落错分支，
 * 字符集补 [\w.\-]（只放行索引名合法字符，不扩语义）；
 * ② 限定列位 /(\w+)\.\w*$/ → 字段候选：点前表名作为索引名走 useIndexFields——
 * A3：provider await ensure（返回 Promise），字段到位后同轮回填候选，首轮即出
 * （原 fire-and-forget 首轮必空、要等用户下次触发；④ keyword 档先例逐字平移）；
 * 接 CLAUSE_TYPE_PRIO 按子句语境语义置顶（同 ③ 口径，候选集不变仅提供序分档）。
 * ③ 其余词位（SELECT/WHERE 直接敲列名等）→ getCtx().curFields()（当前工作索引字段源，
 * 调用方接 useIndexFields），同一异步口径；无索引零候选不扰动。
 * R1：左扫最近子句键（SELECT/WHERE/GROUP BY/ORDER BY/LIMIT/HAVING）按词位给类型
 * 置顶序（fieldSearch typePriority 既有通道，候选集不变仅提供序分档）——ORDER BY 位
 * date+数值族置前（range 同表）、WHERE/GROUP BY/HAVING 位 keyword 置前（term 同表）。
 * ④ 值位 /=\s*'?(␣\w*)$/ → R2 扩为比较符族（= <> != >= <= > < IN( LIKE BETWEEN）：
 * 左扫最近列名查 curFields 类型分派——keyword 列走 useTermsSuggest（当前工作索引 terms agg
 * top 20； R3：suggestAsync promise 出口 + provideCompletionItems 返回 Promise，
 * 首轮即出不再等下次触发；context.token 取消则弃迟到回填；缓存命中防抖一拍内同步完成零网络）；
 * date/boolean/ip/数值族出静态格式候选（LuceneInput value 段同款语义）；
 * text/列未知零候选（值位不出字段名）。
 * IN 列表第 2+ 项值位（`col IN ('a', 'b␣`）——主正则要求操作符紧邻值，尾项
 * 带「, '」前缀必然失配零候选；拆尾项已敲前缀 + IN( opener 定位 + 已完成项剥净校验，
 * 归一成首项形态复用本通道（LHS 列名左扫口径不变）。
 *
 * detail 列写 ES 字段类型与来源说明；'!' 前缀 sortText 升权（PainlessLab 同款，压词表兜底）。
 * Monaco 词表兜底/其他补全源不受影响，多源合并天然并存，无需禁用任何内置 provider。 */
import { ref, type Ref } from 'vue';
import { useIndexFields, type FieldItem } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES } from './queryAstOps';
import { editDistance } from './editDistance';
import { suggestIndexNames } from './indexSuggest';
/* 件④：值位静态档单源 TYPE_VALUE_HINTS 落地 fieldSearch。本文件仅 version/geo_point
 两档 values 引单源（值逐字同形零漂移；两档无源码字面锁，dslValueTiers545/
 均为 toEqual 值锁保形）。boolean/ip 不可引： 对本文件源码含
 'true', 'false' / '192.168.0.1' 字面的松锚断言（自证基线）封死改写；date/数值族/wildcard
 是 SQL 语法形态（裸字面/pref%/数值示例），与 Lucene 形态分立是既有约定，保留本地。 */
import { searchFields, TYPE_VALUE_HINTS } from './fieldSearch';

type MonacoApi = typeof import('monaco-editor/esm/vs/editor/editor.api');

/** 调用方上下文（闭包现读响应式最新值，注册不随数据变化重挂） */
export interface SqlCompletionCtx {
  /** 集群索引全量清单（取 .index 作 FROM 表名候选） */
  indices(): Array<{ index?: string }>;
  /** 当前工作索引（③ detail 提示用；空=零扰动） */
  pickedIdx(): string;
  /** 当前索引字段源（调用方接 useIndexFields().fields.value） */
  curFields(): FieldItem[];
  /** 预载当前索引字段。 A3 起可返回 Promise（provider await 到位后回填，首轮即出）；
 * 同步 void 旧实现兼容（Promise.resolve 归一） */
  ensureCurFields(): void | Promise<void>;
}

/* ② 表名位字段源：模块级共享（provider 语言级唯一，「点前表名→字段」解析随之共享）。
 useIndexFields 内部依赖 pinia store——不能在模块顶层建，首次 ensure（组件挂载上下文内）再建。 */
const tblName: Ref<string> = ref('');
let tblCtx: ReturnType<typeof useIndexFields> | null = null;

/* ④ 值位候选源：模块级共享（与 tblCtx 同范式惰性建——useTermsSuggest 内部依赖 pinia store
 与 api，不能模块顶层建，首次 ensure（组件挂载上下文内）再建）。检索索引/列名每次命中
 ④ 时现写：索引取当前工作索引（④ 的列来自 curFields，同源），前缀取 = 后已敲字符。
 件②：补 useTermsSuggest 第二参 types（消费接线）——getCtx 在
 ensureSqlCompletion 运行参上，惰性建 valCtx 时经模块级 sqlCtxRef 现读（provider 闭包
 现读响应式最新值同范式）；curFields 归约成 path→type 表。零行为：keyword/未知字段
 rankTermsByType 原样返回，且本文件展示序走 suggestAsync 权威序自排（561 精确置顶），
 types 精化只作用 suggestions ref 程序消费面之外。 */
const valIndex: Ref<string> = ref('');
const valField: Ref<string> = ref('');
let sqlCtxRef: (() => SqlCompletionCtx) | null = null;
let valCtx: ReturnType<typeof useTermsSuggest> | null = null;

/** 换号清理：表名/值位候选源是上一账号在目标集群上的字段与词项（SQL 补全会在
 *  新账号输入时直接命中旧上下文）。清掉惰性实例，下次 ensure 按新 provider 重建。 */
export function resetSqlCompletion(): void {
  tblName.value = '';
  tblCtx = null;
  valIndex.value = '';
  valField.value = '';
  sqlCtxRef = null;
  valCtx = null;
}

function sortAt(i: number): string { return '!' + String(i).padStart(3, '0'); }

/* 1043：UnknownColumn 智能纠错——ES-SQL verification_exception 的「Unknown column
   [typo]」是 SQL 高频错误（列名敲错），此前只报错不给建议。解析列名后对当前索引
   字段清单算 editDistance，给 top-3 相近字段（错误面板 chips 一键替换）。
   无 UnknownColumn 字样返回 null（其他错误零扰动）；短列名（≤3 字符）距离阈值
   收紧到 2（548C fuzzy 同款口径：短词噪音大于价值）。 */
export function suggestColumnsFor(errText: string, fields: Array<{ path: string; type?: string }>): { col: string; suggestions: Array<{ path: string; score: number }> } | null {
  const m = errText.match(/Unknown column \[([^\]]+)\]/i);
  if (!m) return null;
  const col = m[1];
  if (!col) return null;
  const maxD = col.length <= 3 ? 2 : 3;
  const lc = col.toLowerCase();
  const suggestions = fields
    .map(f => ({ path: f.path, score: editDistance(lc, f.path.toLowerCase()) }))
    .filter(s => s.score > 0 && s.score <= maxD)
    .sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
    .slice(0, 3);
  return { col, suggestions };
}

/* 1043：聚合函数族（SELECT 词位补全）——研报/舆情统计查询高频
   （GROUP BY source + COUNT(*) 形态），此前聚合词只能盲打词表兜底。
   insertText 带左括号：选中直落列参数位（列补全由 ② ③ 既有通道接力）。 */
const AGG_FUNCS = [
  { name: 'COUNT', detail: 'COUNT(col) · 计数' },
  { name: 'AVG', detail: 'AVG(col) · 平均' },
  { name: 'SUM', detail: 'SUM(col) · 求和' },
  { name: 'MIN', detail: 'MIN(col) · 最小' },
  { name: 'MAX', detail: 'MAX(col) · 最大' },
  /* 1110：官方聚合函数面补齐（分布/百分位/方差）——统计类查询不再盲打 */
  { name: 'KURTOSIS', detail: 'KURTOSIS(col) · 峰度' },
  { name: 'MAD', detail: 'MAD(col) · 中位数绝对偏差' },
  { name: 'PERCENTILE', detail: 'PERCENTILE(col, p) · 百分位' },
  { name: 'PERCENTILE_RANK', detail: 'PERCENTILE_RANK(col, v) · 百分位排名' },
  { name: 'SKEWNESS', detail: 'SKEWNESS(col) · 偏度' },
  { name: 'STDDEV_POP', detail: 'STDDEV_POP(col) · 总体标准差' },
  { name: 'STDDEV_SAMP', detail: 'STDDEV_SAMP(col) · 样本标准差' },
  { name: 'SUM_OF_SQUARES', detail: 'SUM_OF_SQUARES(col) · 平方和' },
  { name: 'VAR_POP', detail: 'VAR_POP(col) · 总体方差' },
  { name: 'VAR_SAMP', detail: 'VAR_SAMP(col) · 样本方差' },
];

/* 1045：子句级 SQL 关键字补全——此前只有聚合函数与字段名，SELECT/WHERE/GROUP BY/
   ORDER BY/LIMIT 全靠手打。按光标所在子句给下一段最可能的关键字，输入前缀过滤。 */
/* 1143：CASE 表达式（ES-SQL 官方支持，且可作 GROUP BY 键做自定义分桶——
   官方文档明示「CASE can be used as a GROUP BY key … custom bucketing」）。
   多行骨架按 SQL 习惯排版；插入后光标停在第一个条件处。 */
const CASE_SNIPPET = {
  label: 'CASE WHEN',
  insert: "CASE\n  WHEN ${1:condition} THEN ${2:'value'}\n  ELSE ${3:'other'}\nEND",
  detail: '条件分支（可作 GROUP BY 分桶键）',
  isSnippet: true,
};

const CLAUSE_KEYWORDS: Record<string, Array<{ label: string; insert: string; detail: string; isSnippet?: boolean }>> = {
  '': [
    { label: 'SELECT', insert: 'SELECT ', detail: '查询语句起始' },
    { label: 'SHOW', insert: 'SHOW ', detail: 'SHOW TABLES / COLUMNS' },
  ],
  SELECT: [
    CASE_SNIPPET,
    { label: 'DISTINCT', insert: 'DISTINCT ', detail: '去重' },
    { label: 'AS', insert: ' AS ', detail: '列别名' },
    { label: 'FROM', insert: ' FROM ', detail: '指定表（索引）' },
  ],
  FROM: [
    { label: 'WHERE', insert: ' WHERE ', detail: '过滤条件' },
  ],
  WHERE: [
    CASE_SNIPPET,
    { label: 'AND', insert: ' AND ', detail: '与条件' },
    { label: 'OR', insert: ' OR ', detail: '或条件' },
    { label: 'NOT', insert: ' NOT ', detail: '取反' },
    { label: 'IN', insert: ' IN (', detail: '集合命中' },
    { label: 'LIKE', insert: " LIKE '", detail: '通配匹配' },
    { label: 'BETWEEN', insert: ' BETWEEN ', detail: '区间' },
    { label: 'IS NULL', insert: ' IS NULL', detail: '空值判断' },
    { label: 'GROUP BY', insert: ' GROUP BY ', detail: '分组' },
    { label: 'ORDER BY', insert: ' ORDER BY ', detail: '排序' },
    { label: 'LIMIT', insert: ' LIMIT ', detail: '限制行数' },
  ],
  'GROUP BY': [
    CASE_SNIPPET,
    { label: 'HAVING', insert: ' HAVING ', detail: '分组后过滤' },
    { label: 'ORDER BY', insert: ' ORDER BY ', detail: '排序' },
    { label: 'LIMIT', insert: ' LIMIT ', detail: '限制行数' },
  ],
  HAVING: [
    CASE_SNIPPET,
    { label: 'AND', insert: ' AND ', detail: '与条件' },
    { label: 'OR', insert: ' OR ', detail: '或条件' },
    { label: 'ORDER BY', insert: ' ORDER BY ', detail: '排序' },
    { label: 'LIMIT', insert: ' LIMIT ', detail: '限制行数' },
  ],
  'ORDER BY': [
    CASE_SNIPPET,
    { label: 'ASC', insert: ' ASC', detail: '升序（默认）' },
    { label: 'DESC', insert: ' DESC', detail: '降序' },
    { label: 'LIMIT', insert: ' LIMIT ', detail: '限制行数' },
  ],
  LIMIT: [],
};

/* 标量/时间函数（研报、公告、舆情统计高频）：插左括号直接进入参数位 */
/* 1103：标量/时间函数族（SELECT/WHERE/GROUP BY/ORDER BY/HAVING 词位补全）。
   insert 可覆盖默认「函数名+(」——零参函数直接落完整调用（NOW() / CURRENT_DATE），
   避免用户还要补右括号。 */
export const SCALAR_FUNCS: Array<{ name: string; detail: string; insert?: string }> = [
  { name: 'DATE_TRUNC', detail: "DATE_TRUNC('day', ts) · 时间截断" },
  { name: 'DATE_FORMAT', detail: "DATE_FORMAT(ts, 'yyyy-MM-dd') · 时间格式化" },
  { name: 'DATE_ADD', detail: "DATE_ADD(ts, INTERVAL 1 DAY) · 时间加减" },
  { name: 'DATE_DIFF', detail: "DATE_DIFF('day', a, b) · 时间差" },
  { name: 'DATE_PART', detail: "DATE_PART('hour', ts) · 取时间部分" },
  { name: 'NOW', detail: 'NOW() · 当前时间', insert: 'NOW()' },
  { name: 'CURRENT_DATE', detail: 'CURRENT_DATE · 当前日期', insert: 'CURRENT_DATE' },
  { name: 'YEAR', detail: 'YEAR(ts) · 年' },
  { name: 'MONTH', detail: 'MONTH(ts) · 月' },
  { name: 'DAY_OF_MONTH', detail: 'DAY_OF_MONTH(ts) · 日' },
  { name: 'DAY_OF_WEEK', detail: 'DAY_OF_WEEK(ts) · 星期几' },
  { name: 'WEEK_OF_YEAR', detail: 'WEEK_OF_YEAR(ts) · 年内周次' },
  { name: 'HOUR', detail: 'HOUR(ts) · 小时' },
  { name: 'MINUTE', detail: 'MINUTE(ts) · 分钟' },
  { name: 'SECOND', detail: 'SECOND(ts) · 秒' },
  { name: 'HISTOGRAM', detail: 'HISTOGRAM(field, INTERVAL 1 DAY) · 直方图分桶' },
  { name: 'CAST', detail: 'CAST(x AS type) · 类型转换' },
  { name: 'SUBSTRING', detail: 'SUBSTRING(s, start, len) · 截取' },
  { name: 'LOWER', detail: 'LOWER(s) · 小写' },
  { name: 'UPPER', detail: 'UPPER(s) · 大写' },
  { name: 'COALESCE', detail: 'COALESCE(a, b) · 空值回退' },
  { name: 'ROUND', detail: 'ROUND(x, n) · 四舍五入' },
  { name: 'ABS', detail: 'ABS(x) · 绝对值' },
  /* 1110：官方标量函数面补齐（数学/字符串/日期/条件/转换）——此前 23 个高频档，
     冷门但合法的 SQL 函数只能盲打。名称/语义取自 ES SQL 官方函数表；零参函数直接
     落完整调用（不逼用户补括号），其余保持 `NAME(` 由已有参数位补全接力。 */
  { name: 'CBRT', detail: 'CBRT(x) · 立方根' },
  { name: 'CEIL', detail: 'CEIL(x) · 向上取整' },
  { name: 'E', detail: 'E() · 自然常数', insert: 'E()' },
  { name: 'EXP', detail: 'EXP(x) · e 的幂' },
  { name: 'EXPM1', detail: 'EXPM1(x) · e^x − 1' },
  { name: 'FLOOR', detail: 'FLOOR(x) · 向下取整' },
  { name: 'LOG', detail: 'LOG(x) · 自然对数' },
  { name: 'LOG10', detail: 'LOG10(x) · 常用对数' },
  { name: 'PI', detail: 'PI() · 圆周率', insert: 'PI()' },
  { name: 'POWER', detail: 'POWER(x, y) · 幂' },
  { name: 'RANDOM', detail: 'RANDOM() · 随机数', insert: 'RANDOM()' },
  { name: 'SIGN', detail: 'SIGN(x) · 符号' },
  { name: 'SQRT', detail: 'SQRT(x) · 平方根' },
  { name: 'TRUNCATE', detail: 'TRUNCATE(x, n) · 截断小数' },
  { name: 'ACOS', detail: 'ACOS(x) · 反余弦' },
  { name: 'ASIN', detail: 'ASIN(x) · 反正弦' },
  { name: 'ATAN', detail: 'ATAN(x) · 反正切' },
  { name: 'ATAN2', detail: 'ATAN2(y, x) · 两参数反正切' },
  { name: 'COS', detail: 'COS(x) · 余弦' },
  { name: 'COSH', detail: 'COSH(x) · 双曲余弦' },
  { name: 'COT', detail: 'COT(x) · 余切' },
  { name: 'DEGREES', detail: 'DEGREES(x) · 弧度转角度' },
  { name: 'RADIANS', detail: 'RADIANS(x) · 角度转弧度' },
  { name: 'SIN', detail: 'SIN(x) · 正弦' },
  { name: 'SINH', detail: 'SINH(x) · 双曲正弦' },
  { name: 'TAN', detail: 'TAN(x) · 正切' },
  { name: 'ASCII', detail: 'ASCII(s) · 首字符编码' },
  { name: 'BIT_LENGTH', detail: 'BIT_LENGTH(s) · 位长度' },
  { name: 'CHAR', detail: 'CHAR(n) · 编码转字符' },
  { name: 'CHAR_LENGTH', detail: 'CHAR_LENGTH(s) · 字符数' },
  { name: 'CONCAT', detail: 'CONCAT(a, b) · 拼接' },
  { name: 'INSERT', detail: 'INSERT(s, pos, len, new) · 插入替换' },
  { name: 'LCASE', detail: 'LCASE(s) · 转小写' },
  { name: 'LEFT', detail: 'LEFT(s, n) · 左截取' },
  { name: 'LENGTH', detail: 'LENGTH(s) · 字节长度' },
  { name: 'LOCATE', detail: 'LOCATE(sub, s) · 子串位置' },
  { name: 'LTRIM', detail: 'LTRIM(s) · 去左空白' },
  { name: 'OCTET_LENGTH', detail: 'OCTET_LENGTH(s) · 字节长度' },
  { name: 'POSITION', detail: 'POSITION(sub IN s) · 子串位置' },
  { name: 'REPEAT', detail: 'REPEAT(s, n) · 重复' },
  { name: 'REPLACE', detail: 'REPLACE(s, a, b) · 替换' },
  { name: 'RIGHT', detail: 'RIGHT(s, n) · 右截取' },
  { name: 'RTRIM', detail: 'RTRIM(s) · 去右空白' },
  { name: 'SPACE', detail: 'SPACE(n) · n 个空格' },
  { name: 'TRIM', detail: 'TRIM(s) · 去两端空白' },
  { name: 'UCASE', detail: 'UCASE(s) · 转大写' },
  { name: 'CURRENT_TIME', detail: 'CURRENT_TIME · 当前时间', insert: 'CURRENT_TIME' },
  { name: 'CURRENT_TIMESTAMP', detail: 'CURRENT_TIMESTAMP · 当前时间戳', insert: 'CURRENT_TIMESTAMP' },
  { name: 'DATE_PARSE', detail: 'DATE_PARSE(s, fmt) · 字符串转日期' },
  { name: 'DATETIME_FORMAT', detail: 'DATETIME_FORMAT(ts, fmt) · 日期时间格式化' },
  { name: 'DATETIME_PARSE', detail: 'DATETIME_PARSE(s, fmt) · 字符串转日期时间' },
  { name: 'FORMAT', detail: 'FORMAT(ts, fmt) · 日期格式化' },
  { name: 'DAY_OF_YEAR', detail: 'DAY_OF_YEAR(ts) · 年内第几天' },
  { name: 'DAY_NAME', detail: 'DAY_NAME(ts) · 星期名' },
  { name: 'EXTRACT', detail: 'EXTRACT(part FROM ts) · 取时间部分' },
  { name: 'HOUR_OF_DAY', detail: 'HOUR_OF_DAY(ts) · 一天内小时' },
  { name: 'ISO_DAY_OF_WEEK', detail: 'ISO_DAY_OF_WEEK(ts) · ISO 星期' },
  { name: 'ISO_WEEK_OF_YEAR', detail: 'ISO_WEEK_OF_YEAR(ts) · ISO 周次' },
  { name: 'MINUTE_OF_DAY', detail: 'MINUTE_OF_DAY(ts) · 一天内分钟' },
  { name: 'MINUTE_OF_HOUR', detail: 'MINUTE_OF_HOUR(ts) · 一小时内分钟' },
  { name: 'MONTH_OF_YEAR', detail: 'MONTH_OF_YEAR(ts) · 年内月份' },
  { name: 'MONTH_NAME', detail: 'MONTH_NAME(ts) · 月份名' },
  { name: 'SECOND_OF_MINUTE', detail: 'SECOND_OF_MINUTE(ts) · 分钟内秒' },
  { name: 'QUARTER', detail: 'QUARTER(ts) · 季度' },
  { name: 'TIME_PARSE', detail: 'TIME_PARSE(s, fmt) · 字符串转时间' },
  { name: 'TO_CHAR', detail: 'TO_CHAR(v, fmt) · 转字符串' },
  { name: 'TODAY', detail: 'TODAY · 今天', insert: 'TODAY' },
  { name: 'GREATEST', detail: 'GREATEST(a, b) · 最大值' },
  { name: 'IFNULL', detail: 'IFNULL(a, b) · 空值回退' },
  { name: 'IIF', detail: 'IIF(cond, a, b) · 条件选择' },
  { name: 'ISNULL', detail: 'ISNULL(a, b) · 空值回退' },
  { name: 'LEAST', detail: 'LEAST(a, b) · 最小值' },
  { name: 'NULLIF', detail: 'NULLIF(a, b) · 相等取空' },
  { name: 'NVL', detail: 'NVL(a, b) · 空值回退' },
  { name: 'CONVERT', detail: 'CONVERT(x, type) · 类型转换' },
];

/* 1390：全文检索谓词（官方 sql-functions-search）。此前补全词表里完全没有它们——
   用户在 WHERE 里想做全文检索只能想到 LIKE，而 LIKE 在 text 字段上跑不了
   （官方原文：「will not be able to run the query」）。这三条是把「想搜正文」
   引到正确语法上的入口，也是 lint 规则⑧建议里的落点。
   MATCH/QUERY 是谓词而非标量函数，单独一张表（不进 SCALAR_FUNCS 的 SELECT 位）。 */
export const SEARCH_PREDICATES: Array<{ name: string; detail: string; insert?: string }> = [
  { name: 'MATCH', detail: "MATCH(field, 'text') · 全文检索（等价 match query）" },
  { name: 'QUERY', detail: "QUERY('field:value') · 直接走 query_string 语法" },
  { name: 'SCORE', detail: 'SCORE() · 命中相关性得分（double）', insert: 'SCORE()' },
];

/** 1045：按子句 + 已敲前缀过滤关键字候选（纯函数，供 provider 与测试共用） */
export function completionKeywordItems(clause: string, word: string) {
  const wp = String(word || '').toLowerCase();
  return (CLAUSE_KEYWORDS[clause] || []).filter(k => !wp || k.label.toLowerCase().startsWith(wp));
}

/* 1145：SUM(x) AS total / x AS d 这类输出列名，在 GROUP BY / ORDER BY / HAVING 位
   是合法引用（ES-SQL 官方文档：GROUP BY 可写「column name, alias or ordinal」，
   ORDER BY 可写「input column / output column / ordinal」，HAVING 示例即用别名），
   但此前补全只给字段 —— 聚合结果想按别名过滤/排序只能靠记忆手打。
   这里从光标前的 SELECT 段解析别名：显式 AS 与隐式（`ts d`）两种写法都收，
   括号/引号内的逗号不切分；隐式别名剔除 SQL 关键字（`... END`、`... DESC` 不是别名）。 */
const ALIAS_STOP_WORDS = new Set([
  'END', 'THEN', 'ELSE', 'WHEN', 'CASE', 'NULL', 'TRUE', 'FALSE',
  'AND', 'OR', 'NOT', 'ASC', 'DESC', 'DAY', 'MONTH', 'YEAR', 'HOUR', 'MINUTE', 'SECOND',
]);

function splitTopLevel(text: string): string[] {
  const out: string[] = [];
  let depth = 0, quote = '', cur = '';
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** 从 SQL 文本（光标前）提取 SELECT 输出列别名（按出现序去重）。无 FROM / 无别名 → [] */
export function selectAliasNames(sql: string): string[] {
  const sel = /\bSELECT\b/i.exec(sql);
  if (!sel) return [];
  const rest = sql.slice(sel.index + sel[0].length);
  const from = /\bFROM\b/i.exec(rest);
  if (!from) return [];
  const list = rest.slice(0, from.index);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of splitTopLevel(list)) {
    const item = raw.trim();
    if (!item) continue;
    const explicit = item.match(/\s+AS\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*))\s*$/i);
    let name = explicit ? (explicit[1] ?? explicit[2] ?? explicit[3]) : '';
    if (!name) {
      /* 隐式别名：末词前必须有空白，且末词不是关键字/纯数字（`ts d` 是别名，
         `... END`、`INTERVAL 1 DAY` 不是） */
      const implicit = item.match(/\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][\w$]*))\s*$/);
      const cand = implicit ? (implicit[1] ?? implicit[2] ?? implicit[3]) : '';
      if (cand && !ALIAS_STOP_WORDS.has(cand.toUpperCase())) name = cand;
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** 别名候选只在「可写别名的子句」出现（WHERE 是行过滤，写别名 ES-SQL 直接报错） */
export function aliasClauseOk(clause: string): boolean {
  return clause === 'GROUP BY' || clause === 'ORDER BY' || clause === 'HAVING';
}

/* GROUP BY / ORDER BY 的 text 字段必须走 .keyword 子字段（否则 ES-SQL 直接报
   "cannot use field in group by/sort"）。命中候选里把 text 基字段替换为同名字段
   真实存在的 .keyword；没有子字段则保留原字段（错误信息即教育）。 */
export function preferKeywordField(hits: ReturnType<typeof searchFields>['flat'], fields: FieldItem[], clause: string) {
  if (clause !== 'GROUP BY' && clause !== 'ORDER BY') return hits;
  const paths = new Set(fields.map(f => f.path));
  const out: typeof hits = [];
  const seen = new Set<string>();
  for (const h of hits) {
    let path = h.path;
    let type = h.type;
    if (h.type === 'text' && paths.has(h.path + '.keyword')) { path = h.path + '.keyword'; type = 'keyword'; }
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path === h.path ? h : { ...h, path, type, detail: '精确分组/排序子字段' } as any);
  }
  return out;
}

/** 1045：Unknown index / no such index 纠错——与列名纠错同口径（editDistance top-3）。 */
export function suggestIndicesFor(errText: string, indices: Array<{ index?: string }>): { index: string; suggestions: Array<{ path: string; score: number }> } | null {
  /* 1097：索引名纠错抽到通用工具（DSL 错误面板共用） */
  return suggestIndexNames(errText, indices.map(i => String(i.index || '')));
}

/* 1110：未知函数纠错——ES SQL 报 `Unknown function [FOO]` / `Scalar function [FOO]`，
 与列名/索引名同口径（editDistance top-3，短名收紧阈值防噪音）。候选池 = 标量 + 聚合
 官方函数表；只认方括号形态，宁缺勿错。 */
export const SQL_FUNC_NAMES: string[] = [...new Set([
  ...SCALAR_FUNCS.map(f => f.name),
  ...AGG_FUNCS.map(f => f.name),
  /* 1390：搜索谓词也参与「未知函数」纠错——敲错 MATCHH 时应该能找到 MATCH */
  ...SEARCH_PREDICATES.map(f => f.name),
])];

export function suggestFunctionsFor(errText: string): { fn: string; suggestions: Array<{ name: string; score: number }> } | null {
  const m = String(errText || '').match(/(?:Unknown function|Scalar function) \[([^\]]+)\]/i);
  if (!m) return null;
  const fn = m[1].trim();
  if (!fn || !/^[A-Za-z_][\w$]*$/.test(fn)) return null;
  const maxD = fn.length <= 4 ? 2 : 3;
  const lc = fn.toLowerCase();
  const suggestions = SQL_FUNC_NAMES
    .map(name => ({ name, score: editDistance(lc, name.toLowerCase()) }))
    .filter(s => s.score > 0 && s.score <= maxD)
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, 3);
  return { fn, suggestions };
}

/* keyword 族值语义类型单一出处（dslCompletionContext.AFFINITY_FAMILIES.keyword 同表
 先例；导出供 builder FieldSelect 预载 / ClauseNode datalist 聚合门槛同源消费）。
 表本体下沉 queryAstOps.KEYWORD_VALUE_TYPES（零依赖单源），此处 re-export——
 既有消费方（FieldSelect/ClauseNode/spec）import 路径与值引用均不变。
 wildcard 在族内但 SQL 值位保留 LIKE % 静态格式档（545 表锁）——terms-agg 候选档为族内去 wildcard */
export { KEYWORD_VALUE_TYPES };
const AGG_VALUE_TYPES = KEYWORD_VALUE_TYPES.filter(t => t !== 'wildcard');

/* R1：词位 → 类型置顶序（typePriorityForOp 单一出处，候选集不变仅提供序分档——
 fieldSearch typePriority 既有通道）。ORDER BY 排序位 date+数值族置前（range 同表）；
 WHERE/GROUP BY/HAVING 过滤/分组精确语义 keyword 置前（term 同表）；
 SELECT/LIMIT/FROM 及无键零倾向 = 原 rank 序（typePriority 缺省不传，零扰动）。 */
const CLAUSE_TYPE_PRIO: Record<string, string[]> = { 'ORDER BY': typePriorityForOp('range') };
for (const c of ['WHERE', 'GROUP BY', 'HAVING']) CLAUSE_TYPE_PRIO[c] = typePriorityForOp('term');
/* 左扫最近子句键：多键并存取离光标最近的（最后命中），GROUP/ORDER 折叠中间空格 */
function clauseOf(before: string): string {
  const re = /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/gi;
  let last = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(before)) !== null) last = m[0].toUpperCase().replace(/\s+/g, ' ');
  return last;
}

/* R2：值位静态格式候选（LuceneInput value 段 DATE_HINTS/NUM_HINTS 同款语义，SQL 口径
 改写——比较符右侧是裸字面量，Lucene 的 >100/[10 TO 20] 形态不适用）。只提示格式不约束输入；
 text 与未知类型不在表内 → 零候选。
 导出本表供 spec 表锁（dslValueTiers545，dslCompletionContext 两姊妹表同范式）；
 补 wildcard 档——通配形态随 SQL 语法取 %（LIKE），不平移 DSL 姊妹表的 'pref*'（Lucene 语法；
 证据：SqlBridgeView 对照表「⚠ LIKE % ↔ wildcard/fuzzy DSL」；姊妹表 DSL_ARRAY_ELEM_TYPE_HINTS
 .wildcard 543 先例证 wildcard 字段类型档成立）。keyword 不入静态表=terms agg 动态候选专用。 */
export const VAL_FORMAT_HINTS: Record<string, { detail: string; values: string[] }> = {
  date: { detail: 'date-math 格式提示 · date', values: ['now-1d/d', 'now-1h/h'] },
  /* date_nanos 档（LuceneInput 值位 7 档已含，SQL 侧对齐收口）——detail 形同 date 档，
 values 复用同形 date-math（epoch_nanos 精度不影响格式提示语义） */
  date_nanos: { detail: 'date-math 格式提示 · date_nanos', values: ['now-1d/d', 'now-1h/h'] },
  /* ：boolean/ip 两档 values 保留本地字面—— 对本文件
 源码含 'true', 'false' / '192.168.0.1' 的松锚断言封死改写；单源同形性由
 值级断言钉住（VAL_FORMAT_HINTS.boolean.values = TYPE_VALUE_HINTS.boolean）。 */
  boolean: { detail: '字面提示 · boolean', values: ['true', 'false'] },
  /* D1：ip 档补 CIDR 形态档（192.168.0.0/24 网段匹配语法——LuceneInput IP_HINTS
 姊妹面同步对齐；只提示格式不约束输入）。 */
  ip: { detail: '字面提示 · ip', values: ['192.168.0.1', '192.168.0.0/24'] },
  /* version 档（ES version 字段类型存 semver 点分形态——只提示格式不约束输入；
 不入 KEYWORD/NUMERIC 两族，terms agg 分支天然不沾，静态档专属）。565 件④：values 合并单源 */
  version: { detail: '字面提示 · version', values: [...TYPE_VALUE_HINTS.version] },
  /* geo_point 档——'纬度,经度' 形态示例（只提示格式不约束输入）。565 件④：values 合并单源 */
  geo_point: { detail: '字面提示 · geo_point', values: [...TYPE_VALUE_HINTS.geo_point] },
  /* range 字段族值位两档——date_range 复用 date 档 date-math values 通道、
 ip_range 复用 ip 档 CIDR values 通道（detail 类型名随档，values 与姊妹档逐字同源）；
 LuceneInput RANGE_FLAT_TYPES 值位档姊妹面同步对齐。只提示格式不约束输入 */
  date_range: { detail: 'date-math 格式提示 · date_range', values: ['now-1d/d', 'now-1h/h'] },
  ip_range: { detail: '字面提示 · ip_range', values: ['192.168.0.1', '192.168.0.0/24'] },
  wildcard: { detail: 'LIKE 通配格式提示 · wildcard', values: ['pref%'] },
};
/* 数值族十口径单一出处（ D2 抽出九口径；补 token_count——分词计数=数值语义，
 值位按数值族出静态档/BETWEEN 区间形态。：改吃 queryAstOps.NUMERIC_VALUE_TYPES 单源） */
const NUMERIC_HINT_TYPES = NUMERIC_VALUE_TYPES;
for (const t of NUMERIC_HINT_TYPES) {
  VAL_FORMAT_HINTS[t] = { detail: '数值示例 · ' + t, values: ['100'] };
}

let refs = 0;
let provider: { dispose(): void } | null = null;
/* snippet 插入规则枚举：provider 每次 provide 前由注册入参 monaco 补写（测试桩可能不提供，
   缺失时退化为字面插入——骨架文本仍可插入，只是不做占位符跳转，不抛错）。 */
let SNIPPET_RULE: number | null = null;

/** 注册 SQL 补全 provider（幂等单例）；返回独立句柄，最后一个 dispose 才注销 */
export function ensureSqlCompletion(monaco: MonacoApi, getCtx: () => SqlCompletionCtx): { dispose(): void } {
  refs++;
  sqlCtxRef = getCtx; /* 565 件②：types 工厂现读通道（valCtx 惰性建早于首调 getCtx） */
  /* snippet 规则按注册入参补写（测试桩缺该枚举时保持 null → 退化为字面插入） */
  SNIPPET_RULE = (monaco as any)?.languages?.CompletionItemInsertTextRule?.InsertAsSnippet ?? null;
  if (!tblCtx) tblCtx = useIndexFields(() => tblName.value);
  if (!valCtx) valCtx = useTermsSuggest(() => valIndex.value, () => {
    const m: Record<string, string> = {};
    for (const f of (sqlCtxRef?.().curFields() ?? [])) m[f.path] = f.type;
    return m;
  });
  if (!provider) {
    provider = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.'],
      provideCompletionItems(model: any, position: any, _context: any, token: any) {
        const ctx = getCtx();
        const before: string = model.getValue().slice(0, model.getOffsetAt(position));
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
          startColumn: word.startColumn, endColumn: word.endColumn,
        };
        /* ① FROM 表名位 → 索引名候选（字符集补 -/.，连字符/点分索引名不再失配） */
        const fromM = before.match(/FROM\s+"?([\w.\-]*)$/i);
        if (fromM) {
          const hits = searchFields({
            fields: ctx.indices().map(i => ({ path: String(i.index || ''), type: 'index' })),
            query: fromM[1],
            cap: 50,
          });
          return { suggestions: hits.flat.map((h, i) => ({
            label: h.path, kind: monaco.languages.CompletionItemKind.Field,
            insertText: h.path, detail: '索引（ES-SQL 表名）', sortText: sortAt(i), range,
          })) };
        }
        /* ② 限定列位 tbl.col → 该表名（=索引）的字段候选。
 按左扫最近子句键接 CLAUSE_TYPE_PRIO 语义置顶（535 R1 三词位同款形态——
 该位此前按原始 mapping 序出列、无类型亲和）；候选集不变仅提供序分档。
 顺手清：正则第二捕获组（点后已敲前缀）从未消费，改非捕获，消除死捕获。
 A3：ensure 改 Promise 链（④ keyword 档先例）——await 字段到位后再
 searchFields，首轮即出候选（原 fire-and-forget 首轮必空、要等下次触发）；
 token 取消弃迟到回填。ensure 失败静默 resolve（useIndexFields 零降级），
 回填口自然出空候选。 */
        const colM = before.match(/(\w+)\.(\w*)$/);
        if (colM) {
          tblName.value = colM[1];
          /* 1207：点后已敲的前缀要参与排序——此前写死 `query: ''`，段感知与 rank 全变 0，
             用户敲 `t.pub` 时 publish_date 与 publisher.org_name 仍按字母序并列。
             与 ① FROM 表名位同口径（那里传的是 fromM[1]）：searchFields 的 query
             同时承担「rank 档 + 段感知档 + 过滤」，Monaco 侧本来也会按前缀收窄候选，
             所以这里传前缀不会让候选消失，只是把「真的想找的那个字段」顶上来。
             colPrefix 只取点后的词字符（引号/空格形态已由正则排除），空串回退全量。 */
          const colPrefix = colM[2] || '';
          return tblCtx!.ensure().then(() => {
            if (token?.isCancellationRequested) return { suggestions: [] };
            const clause = clauseOf(before);
            const hits = searchFields({
              fields: tblCtx!.fields.value, query: colPrefix, cap: 50,
              typePriority: CLAUSE_TYPE_PRIO[clause],
            });
            return { suggestions: preferKeywordField(hits.flat, tblCtx!.fields.value, clause).map((h, i) => ({
              label: h.path, kind: monaco.languages.CompletionItemKind.Property,
              insertText: h.path, detail: h.type + ' · 来自 ' + colM[1], sortText: sortAt(i), range,
            })) };
          });
        }
        /* ④ 值位 比较符族 → 值候选（ R2 扩容 + R3 异步化；扩档）。
 左扫最近列名（剥引号/取点分末段）查 curFields 类型分派：
 keyword/constant_keyword（KEYWORD_VALUE_TYPES 族去 wildcard）→ useTermsSuggest terms agg
 top 20（R3：suggestAsync promise 出口，provideCompletionItems 返回 Promise 首轮即出，
 不再等下次触发；await 后消费 context.token，取消则弃迟到回填；缓存命中在零延时
 防抖一拍内同步完成零网络）；date/boolean/ip/wildcard/geo_point/数值族（含 token_count）
 → 静态格式候选（同步快返零请求）；
 值位但列未知/text：不出候选也不落 ③——值位出字段名候选是错位噪音。 */
        /* 主值位正则拆双形态 `(?:'([^']*)|(\w*))$`——旧 `'?(?:\w*)$` 对引号内
 非词字符（date '2026-、CIDR '192.168.）整体失配零候选；引号形态改收任意非引号
 字符（对齐 557 IN 尾项支路同款双形态），vPrefix 取 m1??m2；裸词形态 (\w*) 逐字
 不动（行为零漂移）。「未知列/text 零候选」压制在值位分支内层按列类型判定，
 不因引号形态绕开（宁缺勿错不变）。 */
        /* 1140：NOT 前缀谓词（col NOT IN / NOT LIKE / NOT BETWEEN）——旧正则把 NOT
 当列名左扫，候选全空。主正则前置可选 `NOT\s+` 一并吃掉，LHS/前缀口径与正向逐字
 一致；IN 列表尾项支路把 NOT 留在 vLhs（head 截到 IN 前），下方统一剥尾。 */
        const eqM = before.match(/(?:\bNOT\s+)?(?:=|<>|!=|>=|<=|>|<|IN\s*\(|LIKE\s|BETWEEN\s)\s*(?:'([^']*)|(\w*))$/i);
        /* IN 列表第 2+ 项值位（`col IN ('a', 'b␣`）——主正则要求操作符紧邻值，
 「, '」前缀的尾项必然失配零候选。拆尾项已敲前缀（, 'xx$，xx 不含收引号——date
 形态 '2026- 的连字符等照收）→ 取最后一个 IN( opener（\b 词界，防字段名内 in
 子串误配）→ opener 之后须恰为已完成项序列（剥不净如子查询/未闭合首项不进支路）
 → 归一成首项形态复用既有通道：LHS 列名左扫口径不变（取 IN ( 前最近词）、
 BETWEEN 区间档天然不沾（op 非 BETWEEN）。
 尾项放宽裸字面量形态（数值列 `IN (1, 2␣` 此前引号形态限定必失配零候选）
 ——引号/裸字两种形态二选一；已完成项剥净校验同步扩认裸数字字面（子查询/普通
 裸词仍挡在外，宁缺勿错不变）。 */
        let vLhs = eqM ? before.slice(0, eqM.index ?? 0) : '';
        let vPrefix = eqM?.[1] ?? eqM?.[2] ?? '';
        let vOp = eqM?.[0] ?? '';
        if (!eqM) {
          const inItem = before.match(/,\s*(?:'([^']*)|([\w.\-]*))$/i);
          if (inItem && inItem.index != null) {
            const head = before.slice(0, inItem.index);
            let last: RegExpExecArray | null = null;
            const open = /\bIN\s*\(/gi;
            let om: RegExpExecArray | null;
            while ((om = open.exec(head)) !== null) last = om;
            if (last && last.index != null
                && /^\s*(?:(?:'[^']*'|-?\d+(?:\.\d+)?)\s*,\s*)*(?:'[^']*'|-?\d+(?:\.\d+)?)?\s*$/.test(head.slice(last.index + last[0].length))) {
              vLhs = head.slice(0, last.index);
              vPrefix = inItem[1] ?? inItem[2] ?? '';
              vOp = 'IN (';
            }
          }
        }
        /* 1140：NOT 前缀谓词把 NOT 留在 LHS 尾（主正则整体吃 / IN 尾项支路截到 opener
 前），此处统一剥尾——否则左扫最近词取到 "NOT" 当列名，类型分派必落空。
 \b 词界护 `cannot` 一类列名尾串；NOT 是 SQL 保留字，裸列名形态不成立。 */
        vLhs = vLhs.replace(/\bNOT\s*$/i, '');
        if (vOp) {
          /* 值位分派收口 dispatchValue 单函数（keyword terms / 静态格式 / text 子字段
 三支逐字平移，行为零漂移）——冷缓存根治：此前分派直接 curFields().find 零预载，
 fields 冷缓存首轮 find 落空 → 全类型零候选，要等用户再触发一次。现冷缓存
 （curFields 空）走 Promise.resolve(ctx.ensureCurFields()).then 再分派（③分支
 A3 同款：契约 void|Promise 归一、token 取消弃迟到回填）；暖缓存维持
 同步快返（静态档「同步快返零请求」既有契约保形——sqlValPos535/547 同步断言
 兼容锚，ensure 不重复触发）。 */
          const dispatchValue = (): any => {
          const colM2 = vLhs.replace(/[\s"]+$/, '').match(/([\w.\-]+)$/);
          const colName = (colM2 ? colM2[1] : '').split('.').pop() || '';
          const fld = colName ? ctx.curFields().find(f => f.path === colName) : undefined;
          if (fld?.type && AGG_VALUE_TYPES.includes(fld.type)) {
            valIndex.value = ctx.pickedIdx();
            valField.value = colName;
            const pending = valCtx!.suggestAsync(colName, vPrefix, 0);
            return pending.then(values => {
              if (token?.isCancellationRequested) return { suggestions: [] };
              /* 精确前缀命中置顶——已敲前缀恰为某候选全文时提到首位（服务端
 doc_count 序保底：稳定排序，非精确项相对序零漂移；空前缀无精确语义不重排） */
              const lk = vPrefix.toLowerCase();
              const ordered = lk
                ? values.slice().sort((a, b) => Number(b.toLowerCase() === lk) - Number(a.toLowerCase() === lk))
                : values;
              return { suggestions: ordered.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: v, detail: '值候选 · ' + colName + '（' + fld.type + '）', sortText: sortAt(i), range,
              })) };
            });
          }
          const hint = fld ? VAL_FORMAT_HINTS[fld.type] : undefined;
          if (hint) {
            /* D2：BETWEEN 语境数值族出区间形态 '10 AND 20'（LuceneInput NUM_HINTS
 '[10 TO 20]' 同语义——SQL 侧 BETWEEN 两端是裸字面量、AND 是语法必需）；
 其余语境/类型静态档原样。
 ⚠：BETWEEN 特化扩 date/date_nanos 族（绝对日期区间形态）一面
 回退——「非数值族 BETWEEN 不变形：date 列仍 date-math」
 是非同步更新语义锁（toEqual 候选锁），解禁同步更新后本表本分支再约定。 */
            const values = /^(?:NOT\s+)?BETWEEN/i.test(vOp) && fld && NUMERIC_HINT_TYPES.includes(fld.type) ? ['10 AND 20'] : hint.values;
            return { suggestions: values.map((v, i) => ({
              label: v, kind: monaco.languages.CompletionItemKind.Value,
              insertText: v, detail: hint.detail, sortText: sortAt(i), range,
            })) };
          }
          /* text 列子字段档——mapping 含 col.keyword 时出一条精确匹配候选
 （LuceneInput 值位 550 text 档同语义：ES-SQL 对 text 列等值比较走的是分词
 match，精确匹配须写 .keyword 子字段）；无子字段维持零候选。 */
          if (fld?.type === 'text') {
            const kwPath = fld.path + '.keyword';
            if (ctx.curFields().some(f => f.path === kwPath)) {
              return { suggestions: [{
                label: kwPath, kind: monaco.languages.CompletionItemKind.Value,
                insertText: kwPath, detail: 'text 精确匹配走 .keyword 子字段 · ' + kwPath,
                sortText: sortAt(0), range,
              }] };
            }
          }
          return { suggestions: [] };
          };
          if (ctx.curFields().length) return dispatchValue();
          return Promise.resolve(ctx.ensureCurFields()).then(() => {
            if (token?.isCancellationRequested) return { suggestions: [] };
            return dispatchValue();
          });
        }
        /* ③ 其余词位 → 当前索引字段候选（直接敲列名场景）。
 R1：按左扫最近子句键给类型置顶序（候选集不变仅提供序分档，无键零扰动）。
 A3：ensureCurFields 改 Promise 链（② 同步）——调用方异步预载到位后再
 searchFields；契约放宽为 void | Promise<void>（同步 void 旧实现 Promise.resolve
 归一，微任务一拍即过）；token 取消弃回填。
 1043：SELECT 词位前置聚合函数候选（空前缀全出五员、已敲前缀按前缀过滤；
 候选插文本带左括号，选中直落列参数位）。 */
        return Promise.resolve(ctx.ensureCurFields()).then(() => {
          if (token?.isCancellationRequested) return { suggestions: [] };
          const clause = clauseOf(before);
          const prio = CLAUSE_TYPE_PRIO[clause];
          const hits = searchFields({ fields: ctx.curFields(), query: word.word || '', cap: 50, typePriority: prio });
          const fieldSuggestions = preferKeywordField(hits.flat, ctx.curFields(), clause).map((h, i) => ({
            label: h.path, kind: monaco.languages.CompletionItemKind.Property,
            insertText: h.path,
            detail: h.type + (ctx.pickedIdx() ? ' · 当前索引 ' + ctx.pickedIdx() : ''),
            sortText: sortAt(i), range,
          }));
          const inSelect = clause === 'SELECT';
          const wp = (word.word || '').toLowerCase();
          const aggSuggestions = inSelect
            ? AGG_FUNCS.filter(f => f.name.toLowerCase().startsWith(wp)).map((f, i) => ({
                label: f.name + '(', kind: monaco.languages.CompletionItemKind.Function,
                insertText: f.name + '(', detail: f.detail,
                sortText: '!0' + String(i).padStart(2, '0'), range,
              }))
            : [];
          /* 1045：子句关键字 + 标量/时间函数（按光标所在子句，前缀过滤）。
             空前缀不倾倒关键字/函数——该位先给字段，用户敲下首字母后才进入语法补全。 */
          /* 空前缀不出关键字（该位先给字段）；但「CASE」是结构骨架、不是普通关键字——
             已敲 c / ca 时按前缀自然命中，空前缀仍留给字段。 */
          const kwItems = wp ? completionKeywordItems(clause, word.word || '') : [];
          const kwSuggestions = kwItems.map((k, i) => ({
            label: k.label, kind: k.isSnippet
              ? monaco.languages.CompletionItemKind.Snippet
              : monaco.languages.CompletionItemKind.Keyword,
            insertText: k.insert, detail: k.detail,
            /* 骨架（CASE WHEN）需要占位符跳转；纯关键字照旧按字面插入 */
            ...(k.isSnippet && SNIPPET_RULE != null ? { insertTextRules: SNIPPET_RULE } : {}),
            sortText: '!!' + String(i).padStart(2, '0'), range,
          }));
          /* 1110：函数目录扩容后加一道「字段优先」护栏——已敲前缀命中任何字段前缀时
             不再并列倾泻函数候选（列名场景字段必须排第一屏；没有字段前缀才进语法补全，
             如 DATE_TR 找不到 date* 字段时函数照常出现）。
             1145：别名前缀同享这条护栏——GROUP BY c 指的是输出列 c，不该被 CTAN/CBRT
             等一大屏函数盖住。 */
          const hasFieldPrefix = !!wp && ctx.curFields().some(f => String(f.path).toLowerCase().startsWith(wp));
          const aliasSuggestions = aliasClauseOk(clause)
            ? selectAliasNames(before)
                .filter(a => !wp || a.toLowerCase().startsWith(wp))
                .filter(a => !ctx.curFields().some(f => f.path === a))
                .map((a, i) => ({
                  label: a, kind: monaco.languages.CompletionItemKind.Reference,
                  insertText: a, detail: 'SELECT 别名（' + clause + ' 可用）',
                  /* 已敲前缀时别名（用户刚命名的输出列）压到最前；空前缀时沉到最后
                     ——该位仍是字段的主场，别名不该挤掉首屏字段。 */
                  sortText: (wp ? ' ' : '~') + String(i).padStart(3, '0'), range,
                }))
            : [];
          const hasAliasPrefix = aliasSuggestions.length > 0;
          const fnPool = wp && !hasFieldPrefix && !hasAliasPrefix && (inSelect || clause === 'WHERE' || clause === 'GROUP BY' || clause === 'ORDER BY' || clause === 'HAVING')
            ? SCALAR_FUNCS : [];
          const fnSuggestions = fnPool
            .filter(f => f.name.toLowerCase().startsWith(wp))
            .map((f, i) => {
              const insert = f.insert ?? f.name + '(';
              return {
                label: insert, kind: monaco.languages.CompletionItemKind.Function,
                insertText: insert, detail: f.detail,
                sortText: '!1' + String(i).padStart(2, '0'), range,
              };
            });
          /* 1390：全文检索谓词优先在 WHERE（也是 SELECT 里 SCORE() 的位置）。
             与标量函数走同一道前缀过滤与「字段优先」护栏——敲 ma 想找 match 时，
             若恰好有 match_* 字段，字段仍排第一屏（同 1110 收口口径）。 */
          const searchPool = wp && !hasFieldPrefix && !hasAliasPrefix
            && (clause === 'WHERE' || inSelect) ? SEARCH_PREDICATES : [];
          const searchSuggestions = searchPool
            .filter(f => f.name.toLowerCase().startsWith(wp))
            .map((f, i) => {
              const insert = f.insert ?? f.name + '(';
              return {
                label: insert, kind: monaco.languages.CompletionItemKind.Function,
                insertText: insert, detail: f.detail,
                /* 比标量函数更靠前：WHERE 位想做全文检索时，MATCH 才是正解 */
                sortText: '!0' + String(i).padStart(2, '0'), range,
              };
            });
          return { suggestions: [...kwSuggestions, ...aggSuggestions, ...aliasSuggestions, ...searchSuggestions, ...fnSuggestions, ...fieldSuggestions] };
        });
      },
    });
  }
  return {
    dispose() {
      refs = Math.max(0, refs - 1);
      if (refs === 0 && provider) { provider.dispose(); provider = null; }
    },
  };
}
