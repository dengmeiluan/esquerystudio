/* Monaco DSL 值位动态候选（第六通道 provider 工厂）：
 builder 侧 useTermsSuggest 同源机制的 Monaco 补全面接线，
 util 层 import monaco editor.api（monacoJsonQuickFix.ts 同范式先例）。

 【三条结构性约束】：
 1. 纯增量通道——既有 spec 全部无 terms 通道 → 注册前缺席=零注册=行为逐字节现状；
 2. 同位零重叠——白名单位/静态档位（date·ip·姊妹档）/可聚合值位三区互斥由窄守卫单点保证；
 3. MonacoEditor.vue 侧改动最小化——接线期只动注册与注入位，主链路零触碰。

 【边界】纯 util+spec（dslValueSuggest656），运行时消费面由 MonacoEditor 接线期补
 （契约扩 terms+注册+DqlQueryView 注入）。接线前必核：dslValueTiers540 的
 suggest() 助手按 triggerCharacters===['"'] 过滤——本工厂对象永不含该键，天然不入过滤器；
 若给注册描述符补 triggerCharacters 或调注册序=静默变该助手选取目标，动前必核。

 【镜像函数约定】dslSortText/dslFilterText/scanStringEnd/ACCEPT_FORMAT_COMMAND 四件是
 MonacoEditor.vue 组件内私有（冻结面），此处同形镜像（字面逐字节同体），
 parity 由 dslValueSuggest656.spec C 段源锚看守；不强行合并（合并=组件侧 diff 扩大，
 违背最小 diff 原则）。 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  commentEnd, isEscapedQuote,
  dslArrayElemFieldAt, dslValueFieldAt,
  type BodyKind,
} from './dslCompletionContext';
/* 类型感知精化排序单源（展示层消费；缓存/请求语义仍走 ES 权威序） */
import { rankTermsByType } from './fieldSearch';

type FieldInfo = { path: string; type: string };

/* ═══ 可聚合类型册（判据=ES terms agg 可聚合，防请求打水漂）═══
 ✅ keyword 三员（keyword/constant_keyword/wildcard——queryAstOps KEYWORD_VALUE_TYPES 同族口径）
 ✅ 数值九口径（long/integer/short/byte/double/float/half_float/scaled_float/unsigned_long）
 ✅ boolean / ip
 ❌ date/date_nanos（可聚合但 date-math 场景静态提示更对路， D3 定案）
 ❌ text/annotated_text（terms agg 需 fielddata 必错形）
 ❌ object/nested/flattened/geo_point/alias（非标量或聚合语义异形） */
export const SUGGESTABLE_VALUE_TYPES: ReadonlySet<string> = new Set([
  'keyword', 'constant_keyword', 'wildcard',
  'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long',
  'boolean', 'ip',
]);

/* ═══ 第 4 步 白名单避让镜像 ═══
 与 MonacoEditor.vue VALUE_WHITELIST 字面 parity（dslValueSuggest656 C 段源锚 readFileSync 看守）。
 这七键的值位由主 provider 白名单档/analyzers 通道供候选，动态层显式避让防同位双出；
 含「"field": 挂 terms 下」边角——pk='terms' ∈ FIELD_CLAUSES 会解析成功，必须显式排。 */
export const DYNAMIC_EXCLUDE_VALUE_KEYS: ReadonlySet<string> = new Set([
  'order', 'track_total_hits', 'field', 'analyzer', 'search_analyzer', 'normalizer', 'tokenizer',
]);

type DynFrame = { type: '{' | '['; lastKey: string | null };

/* 窄守卫位判定裸出口（纯结构，不查 fields）：
 仅识别两类「动态可出候选」的值位，其余位一律 null——
 ① 直挂值位（串左邻 ':'，valueKey=栈顶键/parentKey/grandKey 键链随行）；
 ② terms 值数组续元素位（串左邻 ',' 且栈顶 '['，valueKey=字段键、parentKey=子句键，arrayElem 标记）。
 不识别：首元素位（'[' 左邻——540 契约钉死）、键位（'{'/'，+栈顶 {）、串外、注释内（扫描跳过）。
 扫描逻辑与 MonacoEditor dslKeyGuard 同形（isEscapedQuote/commentEnd 共享单源，不复制口径），
 组件内函数未导出故此处镜像结构——行为面由 spec A 段+源锚双看守。 */
type DslDynamicValueGuard = {
  inStr: true; strStart: number;
  valueKey: string; parentKey: string | null; grandKey: string | null; arrayElem: boolean;
};

export function dslDynamicValueGuard(doc: string, offset: number): DslDynamicValueGuard | null {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  const text = doc.slice(0, cursor);
  let inStr = false; let strStart = -1; let curKey = '';
  const stack: DynFrame[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"') {
        if (!isEscapedQuote(text, i)) {
          inStr = false;
          /* 闭串后跳空白遇 ':' → 该串是键，记入栈顶 lastKey（与 dslKeyGuard/dslContext 同口径） */
          let m = i + 1;
          while (m < text.length && /\s/.test(text[m])) m++;
          if (text[m] === ':' && stack.length) stack[stack.length - 1].lastKey = curKey;
        }
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }
    if (ch === '"') { inStr = true; strStart = i; curKey = ''; continue; }
    if (ch === '{' || ch === '[') stack.push({ type: ch, lastKey: null });
    else if (ch === '}' || ch === ']') stack.pop();
  }
  /* 值候选只认串内；strStart<0 防御残缺态 */
  if (!inStr || strStart < 0) return null;
  let j = strStart - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 0) return null;
  const left = text[j];
  const top = stack[stack.length - 1];
  if (left === ':') {
    return {
      inStr: true, strStart,
      valueKey: top?.lastKey ?? '',
      parentKey: stack.length >= 2 ? stack[stack.length - 2].lastKey : null,
      grandKey: stack.length >= 3 ? stack[stack.length - 3].lastKey : null,
      arrayElem: false,
    };
  }
  if (left === ',' && top && top.type === '[') {
    return {
      inStr: true, strStart,
      valueKey: stack.length >= 2 ? stack[stack.length - 2].lastKey ?? '' : '',
      parentKey: stack.length >= 3 ? stack[stack.length - 3].lastKey : null,
      grandKey: null,
      arrayElem: true,
    };
  }
  return null;
}

/* ═══ 六步判定链（窄守卫本体）═══
 ① bodyKind 缺省 'search'，非 search 一律 null（其余档键位值语义各异，524/面不动）；
 ② 位判定（dslDynamicValueGuard）；
 ③ 白名单避让：仅直挂值位适用（vk 是结构键）；数组续元素位 vk 是字段名，不适用
 （主 provider arrayElem 通道同口径——字段名合法性由 fields() 查表把关）；
 ④ 字段解析：dslValueFieldAt（直挂/操作符两形态）或 dslArrayElemFieldAt（续元素位），
 解析层只出「形态上的字段名」，null 即压制；
 ⑤ fields() 精确查表命中（aggs 撞名键自然出局，540 既有把关哲学原样）；
 ⑥ 类型 ∈ SUGGESTABLE_VALUE_TYPES → 命中；否则 null。 */
export function dslDynamicValueAt(
  doc: string,
  offset: number,
  fields: readonly FieldInfo[],
  bodyKind?: () => BodyKind,
): { field: string; type: string } | null {
  if ((bodyKind?.() ?? 'search') !== 'search') return null;
  const g = dslDynamicValueGuard(doc, offset);
  if (!g) return null;
  if (!g.arrayElem && DYNAMIC_EXCLUDE_VALUE_KEYS.has(g.valueKey)) return null;
  const field = g.arrayElem
    ? dslArrayElemFieldAt(g.valueKey, g.parentKey)
    : dslValueFieldAt(g.valueKey, g.parentKey, g.grandKey);
  if (!field) return null;
  const fld = fields.find(f => f.path === field);
  if (!fld || !SUGGESTABLE_VALUE_TYPES.has(fld.type)) return null;
  return { field, type: fld.type };
}

/* ═══ 四镜像（MonacoEditor.vue 私有函数同形移植，parity 源锚看守——见文件头约定）═══ */

/* 右扫闭合串：从 start（光标位）向右扫描第一个非转义引号，遇 \n 即停（JSON 串不跨行），
 返回闭合串结束位置（含闭合引号的 i+1）；未闭合则返回 start 原地。 */
function scanStringEnd(doc: string, start: number): number {
  let end = start;
  for (let i = end; i < doc.length; i++) {
    const ch = doc[i];
    if (ch === '\n') break;
    if (ch !== '"') continue;
    if (!isEscapedQuote(doc, i)) { end = i + 1; break; }
  }
  return end;
}

/* W5-1 排序关同形：'!'+三位零填序号+label（'!'=33 稳压 '$'=36 的 JSON LS $schema） */
function dslSortText(idx: number, label: string): string {
  return '!' + String(idx).padStart(3, '0') + label;
}

/* W5-1 过滤关同形：pattern '"'（含已敲引号）前缀强匹配成立 */
function dslFilterText(label: string): string {
  return '"' + label;
}

/* 2.6.2 接受即格式化（幂等归一）同形 */
const ACCEPT_FORMAT_COMMAND = { id: 'editor.action.formatDocument', title: '接受后格式化' };

/* ═══ provider 工厂（方案 A 第六通道）═══
 deps={ fields, terms, bodyKind? }——fields/索引语境与 terms 请求通道由视图持有
 （P2 注入形态：useTermsSuggest 实例 suggestAsync 直挂，防抖/缓存/stash 全套白得）；
 provideCompletionItems 异步返回 Promise；无 triggerCharacters（ 先例安全位）。
 候选组装：prefix=串起始引号后至光标已敲内容 → terms(field, prefix)（ES 权威序）→
 rankTermsByType 展示精化 → item 与主 provider 值位档逐字段同构
 （kind=Value/insertText 带引号/range 整串 I-1/filterText/sortText/command/detail 中文）。 */
export type DslValueSuggestDeps = {
  fields: () => FieldInfo[];
  terms: (field: string, prefix: string) => Promise<string[]>;
  bodyKind?: () => BodyKind;
};

export function makeDslValueSuggestProvider(deps: DslValueSuggestDeps) {
  return {
    provideCompletionItems(model: any, position: any, _context?: unknown, token?: { isCancellationRequested?: boolean }): Promise<{ suggestions: any[] }> {
      const doc: string = typeof model?.getValue === 'function' ? model.getValue() : '';
      const offset: number = typeof model?.getOffsetAt === 'function' ? model.getOffsetAt(position) : 0;
      const cursor = Math.max(0, Math.min(offset, doc.length));
      const hit = dslDynamicValueAt(doc, cursor, deps.fields(), deps.bodyKind);
      /* 未命中/未选索引（fields 空）/非 search 档：零请求零候选，天然降级 */
      if (!hit) return Promise.resolve({ suggestions: [] });
      const g = dslDynamicValueGuard(doc, cursor)!;
      const prefix = doc.slice(g.strStart + 1, Math.max(g.strStart + 1, cursor));
      const vEnd = scanStringEnd(doc, cursor);
      /* 通道异常兜底：terms 恒 resolve（535 契约）之外再防同步 throw，异常路径一律 [] 不 reject */
      return Promise.resolve()
        .then(() => deps.terms(hit.field, prefix))
        .then(values => {
          if (token?.isCancellationRequested) return { suggestions: [] };
          if (!values || !values.length) return { suggestions: [] };
          const ranked = rankTermsByType(values, hit.type);
          const sp = model.getPositionAt(g.strStart);
          const ep = model.getPositionAt(vEnd);
          const range = {
            startLineNumber: sp.lineNumber, startColumn: sp.column,
            endLineNumber: ep.lineNumber, endColumn: ep.column,
          };
          return {
            suggestions: ranked.map((v, i) => ({
              label: v,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + v + '"',
              range,
              command: ACCEPT_FORMAT_COMMAND,
              detail: '字段值 · ' + hit.type + ' · top20',
              filterText: dslFilterText(v),
              sortText: dslSortText(i, v),
            })),
          };
        })
        .catch(() => ({ suggestions: [] }));
    },
  };
}
