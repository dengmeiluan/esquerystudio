<template>
  <div ref="hostRef" class="monaco-host" :style="{ height }"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
// -B1：按需引入——editor.api 只含核心，功能按 contrib 显式挂载（少一个 import 少一个能力，全列在此）
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';        // JSON 语言 + 校验 + 格式化
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding';   // 折叠（options.folding 用）
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController'; // Ctrl+F 查找
import 'monaco-editor/esm/vs/editor/contrib/format/browser/formatActions'; // formatDocument 动作
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController'; // 补全弹层
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution'; // glyph/内容 hover（ 徽标用）
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment';   // jsonc 注释切换
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { useAppStore } from '../stores/app';
import { dslContext, QUERY_SNIPPETS, querySnippetDetail, RANGE_OPS, AGG_SNIPPETS, RETRIEVER_SNIPPETS, SUGGESTER_SNIPPETS, aggBodyKeys, queryBodyKeys, clauseValueKeys, retrieverBodyKeys, suggesterBodyKeys, ROOT_KEYS, ROOT_KEY_SNIPPETS, commaAffixes, settingsKeyItems, mappingKeyItems, mappingFieldKeyItems, mappingFieldConfigAt, indexBodyKeyItems, indexBodyRegionAt, aliasKeyItems, aliasConfigAt, reindexBodyKeyItems, reindexBodyRegionAt, sqlBodyKeyItems, SQL_VALUE_SNIPPETS, SQL_KEYWORD_SNIPPETS, updateBodyKeyItems, scriptObjectKeyItems, updateBodyRegionAt, rolloverBodyKeyItems, rolloverConditionKeyItems, rolloverBodyRegionAt, dbqBodyKeyItems, ubqBodyKeyItems, queryWriteRegionAt, queryOnlyBodyKeyItems, templateSearchBodyKeyItems, rootOnlyRegionAt, mgetBodyKeyItems, mgetDocKeyItems, mgetRegionAt, storedScriptBodyKeyItems, storedScriptKeyItems, storedScriptRegionAt, sqlFilterRegionAt, eqlFilterRegionAt, eqlBodyKeyItems, EQL_VALUE_SNIPPETS, EQL_KEYWORD_SNIPPETS,
  clusterSettingsBodyKeyItems, clusterSettingsKeyItems, clusterSettingsRegionAt,
  rerouteBodyKeyItems, rerouteCommandKeyItems, rerouteCommandParamKeyItems, rerouteRegionAt, rerouteCommandNameAt,
  allocationExplainBodyKeyItems, snapshotRepoBodyKeyItems, snapshotCreateBodyKeyItems, snapshotRestoreBodyKeyItems,
  SNAPSHOT_REPO_TYPES, slmPolicyBodyKeyItems, slmConfigKeyItems, slmRetentionKeyItems, slmPolicyRegionAt,
  ilmPolicyBodyKeyItems, ilmPolicyKeyItems, ilmPhaseKeyItems, ilmPhaseConfigKeyItems, ilmActionKeyItems, ilmPolicyRegionAt,
  watchBodyKeyItems, watchTriggerKeyItems, watchScheduleKeyItems, watchInputKeyItems,
  watchConditionKeyItems, watchActionTypeKeyItems, watchRegionAt,
  securityRoleBodyKeyItems, securityRoleIndexKeyItems, securityRoleFieldSecurityKeyItems, securityRoleAppKeyItems, securityRoleRegionAt,
  securityUserBodyKeyItems, securityUserRegionAt, securityRoleTemplateKeyItems,
  securityRoleMappingBodyKeyItems, securityApiKeyBodyKeyItems,
  ingestPipelineBodyKeyItems, ingestProcessorKeyItems, ingestPipelineRegionAt,
  ingestSimulateBodyKeyItems, ingestSimulateDocKeyItems, ingestSimulateRegionAt,
  enrichPolicyBodyKeyItems, enrichMatchPolicyKeyItems, enrichRangePolicyKeyItems, enrichPolicyRegionAt,
  transformBodyKeyItems, transformSourceKeyItems, transformDestKeyItems, transformPivotKeyItems,
  transformTimeKeyItems, transformTimeConfigKeyItems, transformRegionAt,
  rollupJobBodyKeyItems, rollupGroupsKeyItems, rollupDateGroupKeyItems, rollupFieldGroupKeyItems,
  rollupMetricKeyItems, rollupRegionAt,
  mlDatafeedBodyKeyItems, mlDelayedCheckKeyItems, mlChunkingKeyItems, mlIndicesOptionsKeyItems, mlDatafeedRegionAt,
  mlJobBodyKeyItems, mlAnalysisConfigKeyItems, mlDetectorKeyItems, mlAnalysisLimitsKeyItems, mlDataDescriptionKeyItems, mlJobRegionAt,
  scriptExecuteBodyKeyItems, msearchHeaderKeyItems, msearchHeaderLineAt, msearchTemplateBodyKeyItems, bulkActionKeyItems, bulkActionMetaKeyItems, bulkLineKindAt, bulkActionMetaAt, fieldCapsBodyKeyItems, termsEnumBodyKeyItems, indexFilterRegionAt, rankEvalBodyKeyItems, rankEvalRequestKeyItems, rankEvalMetricKeyItems, rankEvalRegionAt, RUNTIME_FIELD_TYPES, runtimeFieldTypeAt, inRuntimeMappingsAt, aliasesBodyKeyItems, aliasActionKeyItems, aliasAddConfigKeyItems, aliasRemoveConfigKeyItems, aliasRemoveIndexConfigKeyItems, aliasesBodyRegionAt, scrollBodyKeyItems, clearScrollBodyKeyItems, termvectorsKeyItems, mtermvectorsBodyKeyItems, mtermvectorsDocKeyItems, STRUCTURED_VALUE_ENUMS, MAPPING_TYPES, templateKeyItems, templateRegionAt, ANALYZE_KEY_SNIPPETS, BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, lineIndentAt, reindentSnippet, commentEnd, isEscapedQuote, painlessFieldAt, orderFieldsByTypeForOp, dslValueFieldAt, dslArrayElemFieldAt, DSL_VALUE_TYPE_HINTS, DSL_ARRAY_ELEM_TYPE_HINTS, DSL_ARRAY_ELEM_CHAINS, mlFilterBodyKeyItems, mlCalendarBodyKeyItems, mlCalendarEventsBodyKeyItems, mlCalendarEventKeyItems, mlCalendarEventsRegionAt, graphExploreBodyKeyItems, graphVertexKeyItems, graphControlsKeyItems, graphSampleDiversityKeyItems, graphHopKeyItems, graphExploreRegionAt, ccrFollowBodyKeyItems, ccrAutoFollowBodyKeyItems, securityApiKeyGrantBodyKeyItems, securityApiKeyGrantKeyItems, securityApiKeyGrantRegionAt, securityApiKeyRegionAt, securityRoleMappingRuleKeyItems, securityRoleMappingRegionAt, licenseBodyKeyItems, licenseEntryKeyItems, licenseRegionAt, mlFilterUpdateBodyKeyItems, securityApiKeyQueryBodyKeyItems, securityApiKeyQueryRegionAt, securityApiKeyInvalidateBodyKeyItems, securityCrossClusterApiKeyBodyKeyItems, securityCrossClusterAccessKeyItems, securityCrossClusterAccessEntryKeyItems, securityCrossClusterApiKeyRegionAt, watchExecuteBodyKeyItems, securityPrivilegeBodyKeyItems, securityPrivilegeEntryKeyItems, securityPrivilegeRegionAt, ilmMoveBodyKeyItems, ilmMoveStepKeyItems, ilmMoveRegionAt, snapshotCloneBodyKeyItems, snapshotMountBodyKeyItems, watchInlineExecuteBodyKeyItems, watchInlineExecuteRegionAt, nodesReloadSecureSettingsBodyKeyItems, searchRootKeyItems, watchConditionParamsKeyItemsAt, watchActionParamsKeyItemsAt, watchHttpInputKeyItems, watchSearchInputKeyItems, watchSearchRequestKeyItems, httpRequestKeyItems, watchChainTriggerKeyItems, watchChainNestedTriggerKeyItems, watchChainInputKeyItems, watchEmailBodyKeyItems, watchSlackMessageKeyItems, watchJiraFieldsKeyItems, httpAuthBasicKeyItems, httpProxyKeyItems, watchPagerdutyContextKeyItems, watchSlackAttachmentKeyItems, watchSlackAttachmentFieldKeyItems, watchArrayCompareKeyItems, watchArrayCompareOpKeyItems, watchEmailAttachmentKeyItems, watchEmailHttpAttachmentKeyItems, watchEmailReportingAttachmentKeyItems, watchEmailDataAttachmentKeyItems } from '../utils/dslCompletionContext';
import { makeDslValueSuggestProvider } from '../utils/dslValueSuggest';
import type { AssistItem, BodyKind } from '../utils/dslCompletionContext';
import { ensureLanguages } from '../utils/monacoLanguages';
import { ensureJsonQuickFixes, ensureDslLintQuickFixes, recordDslLintMarkers, clearDslLintMarkers, type DslLintMarkerEntry } from '../utils/monacoJsonQuickFix';

(self as any).MonacoEnvironment = {
  getWorker: (_: any, label: string) => (label === 'json' ? new jsonWorker() : new editorWorker()),
};

/* 自定义主题（深/浅与 token 对齐，只注册一次） */
let themeReady = false;
function ensureTheme() {
  if (themeReady) return;
  monaco.editor.defineTheme('es-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '93c5fd' },
      { token: 'string.value.json', foreground: '86efac' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'keyword.json', foreground: 'f472b6' },
      { token: 'comment', foreground: '5b6472', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#101116',
      'editor.lineHighlightBackground': '#1a1c2255',
      'editorLineNumber.foreground': '#3d4048',
      'editorLineNumber.activeForeground': '#6b7280',
      'editorIndentGuide.background1': '#22242c',
      'editor.selectionBackground': '#14b8a640',
      'editorCursor.foreground': '#2dd4bf',
      'editorWidget.background': '#1a1c22',
      'editorWidget.border': '#33363f',
      'input.background': '#17181d',
    },
  });
  monaco.editor.defineTheme('es-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '0369a1' },
      { token: 'string.value.json', foreground: '15803d' },
      { token: 'number', foreground: 'b45309' },
      { token: 'keyword.json', foreground: 'be185d' },
      { token: 'comment', foreground: '8790a3', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.lineHighlightBackground': '#f2f4f7aa',
      'editorLineNumber.foreground': '#cbd0d9',
      'editorLineNumber.activeForeground': '#8790a3',
      'editorIndentGuide.background1': '#e4e7ec',
      'editor.selectionBackground': '#0d948826',
      'editorCursor.foreground': '#0d9488',
      'editorWidget.background': '#fbfbfd',
      'editorWidget.border': '#e4e7ec',
      'input.background': '#ffffff',
    },
  });
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    trailingCommas: 'ignore',
    comments: 'ignore',
  } as any);
  /* 2.6.0（spec ）：显式钉住行注释配置——Ctrl+/ 切换 // 注释可用。
 monaco 0.52 json contribution 自带同配置，此处幂等防回归（覆盖注册同值零差异）。 */
  monaco.languages.setLanguageConfiguration('json', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
  });
  themeReady = true;
}

/* W4-T13 键位/值位守卫（T12 评审裁定：provider 侧新增逻辑，不动 dslCompletionContext.ts）。
 返回 ok + 当前串起始 strStart（无串=光标位）+ inStr——I-1 的 range 计算复用同一次扫描结果，
 N-1/N-2 的「仅串内右扫」门即以 inStr 为准。
 光标在字符串内 → 看当前串起始引号左侧最近非空白字符：'{'/',' 为键位（出建议），
 其余（':' 值串、'[' 数组值串等）一律压住——值串内插字段名/根键/snippet 都产非法 DSL；
 光标不在串内（闭合引号后等形态）→ 压住左侧最近非空白为 ':' 的值位；
 M-2：串外且 {}[] 栈顶为 '[' → 数组裸元素位（"must": [⏎ / ["x", ⏎）压住——元素位塞键值对非法；
 元素对象已开（"must": [{⏎，栈顶 '{'）仍出——既有行为保留。
 转义口径与 dslContext 同源：紧邻反斜杠 run 长度为奇数才算转义引号。 */
/* 2.6.0：栈帧携带 lastKey（值位白名单判定用）——扫描期 curKey/lastKey 追踪口径与 dslContext 同源 */
type GuardFrame = { type: '{' | '['; lastKey: string | null };

/* 值位白名单（spec ）：仅此三键的值串位放行出档，其余值位一律压制（防误导优先）。
 +1：补 analyzer/search_analyzer/normalizer/tokenizer 四键——dslKeyGuard 侧
 只负责放行出 valueKey，消费侧分档收口（search 档仍一律压空，仅 mapping 档接 analyzers 通道）
 白名单外 ':' 值串位另设字段类型门（date/ip 静态档）——ok 仍 false、键链随行
 回传（valueKey/parentKey/grandKey），放行权在 computeSuggestions 值位类型档按类型收口 */
const VALUE_WHITELIST = new Set(['order', 'track_total_hits', 'field', 'analyzer', 'search_analyzer', 'normalizer', 'tokenizer']);
/* analyzers 通道消费键（mapping 值位）：与 VALUE_WHITELIST 的组件名键对齐 */
const ANALYZER_VALUE_KEYS = new Set(['analyzer', 'search_analyzer', 'normalizer', 'tokenizer']);

function dslKeyGuard(doc: string, offset: number): { ok: boolean; strStart: number; inStr: boolean; valueKey?: string; parentKey?: string | null; grandKey?: string | null; arrayElem?: boolean } {
  const cursor = Math.max(0, Math.min(offset, doc.length));
  const text = doc.slice(0, cursor);
  let inStr = false; let strStart = -1; let curKey = '';
  const stack: GuardFrame[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '"') {
        if (!isEscapedQuote(text, i)) {
          inStr = false;
          /* 闭串后跳空白遇 ':' → 该串是键，记入栈顶 lastKey（与 dslContext 同口径） */
          let m = i + 1;
          while (m < text.length && /\s/.test(text[m])) m++;
          if (text[m] === ':' && stack.length) stack[stack.length - 1].lastKey = curKey;
        }
      } else curKey += ch;
      continue;
    }
    const cEnd = commentEnd(text, i);
    if (cEnd !== -1) { i = cEnd - 1; continue; }  // for 的 i++ 会让下次从 cEnd 开始
    if (ch === '"') { inStr = true; strStart = i; curKey = ''; continue; }
    if (ch === '{' || ch === '[') stack.push({ type: ch, lastKey: null });
    else if (ch === '}' || ch === ']') stack.pop();
  }
  const topKey = stack.length ? stack[stack.length - 1].lastKey : null;
  let j = (inStr ? strStart : text.length) - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  if (j < 0) return { ok: false, strStart: inStr ? strStart : cursor, inStr };
  if (inStr) {
    const left = text[j];
    /* 数组续元素串位（',' 左邻且栈顶 '['）回传键链——arrayElem 标记元素位，
 valueKey=数组属主键（terms 值对象内的字段键）、parentKey=再上层键，供消费侧
 dslArrayElemFieldAt 解析字段→值位类型档出静态候选；该位现状错档（query-type 的
 QUERY_SNIPPETS 落进值数组），归位。须置于下方 '{'/',' 键位口之前——',' 左邻
 原本直落键位放行，元素位口径在此分流；首元素位（'[' 左邻）维持既有无键链压制不动
 （540 契约 spec 既有断言钉死）。 */
    if (left === ',' && stack[stack.length - 1] && stack[stack.length - 1].type === '[') {
      const elemKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const ownerKey = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      return { ok: false, strStart, inStr, valueKey: elemKey ?? undefined, parentKey: ownerKey, arrayElem: true };
    }
    /* 数组键链白名单位首元素位（'[' 左邻且栈顶 '['）——'[' 左邻此前一律无键链
 直落压制（540 契约钉 terms 值数组首元素位、544 复钉）；1439 起回传属主键 valueKey
 但 ok 仍 false：消费侧只有白名单链（DSL_ARRAY_ELEM_CHAINS）与 analyze 组件位
 （filter/char_filter 数组首元素）会消费，白名单外维持原样零增量。 */
    if (left === '[' && stack[stack.length - 1] && stack[stack.length - 1].type === '[') {
      const firstKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      if (firstKey) {
        return { ok: false, strStart, inStr, valueKey: firstKey, parentKey: undefined, arrayElem: true };
      }
    }
    if (left === '{' || left === ',') return { ok: true, strStart, inStr };
    /* 2.6.0 值位白名单口：串左邻 ':' 且栈顶 lastKey ∈ 白名单 → 放行（valueKey 回传供 provider 分派） */
    if (left === ':' && topKey && VALUE_WHITELIST.has(topKey)) {
      return { ok: true, strStart, inStr, valueKey: topKey };
    }
    /* 非白名单 ':' 值串位回传键链（valueKey=当前键/parentKey=上层键/grandKey=上上层键）
 供值位类型档分派（dslValueFieldAt 解析字段→DSL_VALUE_TYPE_HINTS 按类型出静态候选）。
 ok 仍 false——「其余值位一律压制」的既有语义不变，放行权在消费侧按字段类型收口；
 数组元素串（'[' 左邻首元素位）不回传键链，维持压制（540 契约 spec 既有断言钉死）。 */
    if (left === ':') {
      const parentKey = stack.length >= 2 ? stack[stack.length - 2].lastKey : null;
      const grandKey = stack.length >= 3 ? stack[stack.length - 3].lastKey : null;
      return { ok: false, strStart, inStr, valueKey: topKey ?? undefined, parentKey, grandKey };
    }
    return { ok: false, strStart, inStr };
  }
  /* 1439：裸值位（`"boolKey": ␣`）也回传当前键——布尔枚举（true/false）不需要引号，
     此前只有串内值位能命中 STRUCTURED_VALUE_ENUMS，裸值位永远不出档。 */
  if (text[j] === ':') return { ok: false, strStart: cursor, inStr, valueKey: topKey ?? undefined };
  if (stack[stack.length - 1] && stack[stack.length - 1].type === '[') return { ok: false, strStart: cursor, inStr };
  return { ok: true, strStart: cursor, inStr };
}

/* W5-1 真机复扫修复（观察项①）：敲 " 触发补全时，首焦必须是 dsl 组首项而非 JSON LS 内建 $schema。
 真机机理实锤（monaco 0.52.2 源码实查 + filters.js 离线复算 + r111 真机对拍），两道关都要过：
 ① 过滤关（filterText）：dslAssist 的 range 覆盖起始引号（I-1 形态）→ overwriteBefore=1
 → 过滤 pattern='"'——无 filterText 时拿 label 匹配，'"' 不在 label 中 → fuzzyScore 返回 undefined
 → 整档被过滤出列表（真机列表只剩 $schema + 旧 registerCompletion 项的根因；sortText 再优也轮不到比）。
 故三档统一 filterText='"'+label（与 insertText 同形态，LSP JSON 键补全标准手法）：
 pattern '"' 前缀强匹配得 [2,...] > FuzzyScore.Default(-100)（$schema/旧项空 pattern 同分 -100），
 dsl 组整体浮到列表顶；续打 '"q' 仍前缀匹配（[9,...]）。
 ② 排序关（sortText）：同分回退 idx=初始 sortText 序（completionModel._compareCompletionItems：
 score→distance→idx；suggest.js 对无 sortText 项回填 label，defaultComparator 首比 sortTextLow 字典序）。
 '!'=33 是可打印 ASCII 最小字符，稳压 '$'=36（'0'=48 压不过）；'!' + 三位零填序号 + label
 序号定宽同长，组内字典序即提供序（root=ROOT_KEYS 序 / snippet=QUERY_SNIPPETS 目录序 /
 field=类型感知置顶序，无算子倾向时=fields() 序）。
 前提：单档条数 <1000（序号 3 位定宽才同长）；console 字段量级远在界内。 */
function dslSortText(idx: number, label: string): string {
  return '!' + String(idx).padStart(3, '0') + label;
}

/* field 档类型感知排序已收口 dslCompletionContext.orderFieldsByTypeForOp
 （原样平移：与 orderFieldsByClauseOp 语义有差——原始序不做亲和族展开，
 语义分界与平移沿革见该函数注释；dslFieldPrio538 锁定族展开版零触碰）。 */

/* W5-1 过滤关：让敲 " 后的过滤 pattern（含已敲引号）能匹配上——见 dslSortText 上注释①。 */
function dslFilterText(label: string): string {
  return '"' + label;
}

/* 值位插入「含引号文本」时的 JSON 字符串字面量（EQL 串里常有 "cmd.exe"）——
   JSON.stringify 一次产出正确转义，接受即仍是合法 JSON。 */
function jsonStringLiteral(text: string): string {
  return JSON.stringify(String(text));
}

/* 2.6.0 snippet 统一包装：逗号自适应（affix）+ 缩进叠加（reindentSnippet）。
 落点只做基本放置——规整由「接受即 formatDocument」归一（2.6.2 起每档挂 command，
 幂等：任何触发文档形态 → 同一格式化产物；手工推算换行的 lineBreakAffixes 路线已废弃——
 单行紧凑文档下基线脱钩，不幂等）。单行文本 reindent 为 no-op 自然直通。 */
function wrapSnippet(doc: string, start: number, end: number, indent: string, text: string, affix: { prefix: string; suffix: string }): string {
  return affix.prefix + reindentSnippet(text, indent) + affix.suffix;
}

/* 右扫闭合串（模块内共享纯函数）：从 start（已 clamp 的光标位/串起始）向右扫描第一个非转义引号，
 遇 \n 即停（JSON 串不跨行），返回闭合串结束位置（含闭合引号的 i+1）；未闭合则返回 start 原地。
 转义口径与 dslContext/dslKeyGuard 同源：紧邻反斜杠 run 长度为奇数才算转义引号。
 抽取自 settings/mapping/template 档与 search 主路径两处逐字节等价的内联右扫循环。 */
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

/* 2.6.2 接受即格式化（幂等归一）：任何触发文档形态 → formatDocument 统一规整——
 落位乱不乱不再依赖触发排版（用户真机痛点「拉胯」的正解）。
 非法中间态文档 JSON LS format 罢工静默降级（reindent 落点兜底），无副作用；
 snippet 占位符会话：落点已规整时 format 零编辑会话无损，落点歪时以规整优先（默认值已落文本）。 */
const ACCEPT_FORMAT_COMMAND = { id: 'editor.action.formatDocument', title: '接受后格式化' };

const props = withDefaults(defineProps<{
  modelValue: string;
  language?: string;
  height?: string;
  readonly?: boolean;
  fontSize?: number;
  /* W4-T13：可选 DSL 智能补全——传则注册 JSON completion provider（未传=现状零影响）
 W6：契约扩展 bodyKind——按 body 语义分档（search 三档/settings 设置键/mapping 骨架/none 空）
 契约再扩 doc——文档体档（键位零候选，仅 field 值位白名单出字段候选）；并扩语言面：
 dslAssist 存在时 painless 语言同挂四骨架补全 + doc['f']/ctx['f'] 字段 hover（挂载计数见 spec 524）
 +1：契约再扩 analyzers——mapping 值位 analyzer/normalizer/tokenizer 四键
 出自定义组件名候选（MappingView 弹层注入 analysisSettings 实名），缺席=该通道关
 analyze 档复用同一 analyzers() 闭包通道——analyzer/search_analyzer/
 normalizer/tokenizer 值位出「内置清单 ∪ 实名组件」（缺席=纯内置，语义不关档）
 契约再扩 terms——search 档可聚合字段值位出 top20 真实值动态候选
 （655 设计 P2，独立第六通道 provider；缺席=零注册行为零变，524+1 先例） */
  dslAssist?: {
    fields: () => { path: string; type: string }[];
    bodyKind?: () => BodyKind;
    /** 1439：分析组件实名通道按类别分列（缺省回退 analyzers()，旧视图零破坏） */
    analyzers?: () => string[];
    tokenizers?: () => string[];
    normalizers?: () => string[];
    filters?: () => string[];
    charFilters?: () => string[];
    /** 1439：当前目标集群的索引名（_msearch 头行 index / _bulk 动作 _index 值位） */
    indices?: () => string[];
    terms?: (field: string, prefix: string) => Promise<string[]>;
  };
}>(), {
  language: 'json',
  height: '320px',
  readonly: false,
  fontSize: 12.5,
});

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'execute'): void;
  /* 1128：选区态上报（行数/字符数）——SQL 控制台据此把「执行」改显「执行选段」，
     操作者按下快捷键前就知道只会跑选中的那段，而不是整篇。 */
  (e: 'selection', p: { lines: number; chars: number; start: number; end: number } | null): void;
  /* 1129：光标偏移（无选区也上报）——SQL 控制台据此判定「光标所在语句」 */
  (e: 'cursor', offset: number): void;
}>();

const hostRef = ref<HTMLElement>();
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
/* dslAssist provider 逐语言一份（json+ndjson），dispose 全量随组件卸载；
 W3 起数组同时承载补全与字段 hover 两类注册（dispose 对称同路） */
let dslAssistDisposables: monaco.IDisposable[] = [];
let hostRORef: ResizeObserver | null = null;
const appStore = useAppStore();
const themeName = () => (appStore.effectiveTheme === 'light' ? 'es-light' : 'es-dark');

onMounted(() => {
  ensureTheme();
  ensureLanguages(); /* ux2：sql 官方包 + 4 自研 monarch（幂等，全实例共享一次注册） */
  ensureJsonQuickFixes(); /* ux2 ：JSON quick fix 语言级注册（模块级幂等） */
  ensureDslLintQuickFixes(); /* P0-2：es-dsl-lint quick fix 注册（独立幂等，既有 json 四码链路零触碰） */
  // w70:Ctrl+Shift+F 全站格式化(注册在 create 后)
  editor = monaco.editor.create(hostRef.value!, {
    value: props.modelValue,
    language: props.language,
    theme: themeName(),
    readOnly: props.readonly,
    fontSize: props.fontSize,
    fontFamily: '"JetBrains Mono", Consolas, monospace',
    minimap: { enabled: false },
    lineNumbersMinChars: 3,
    folding: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    /* P0：suggest/hover/quickfix 弹层默认渲染在 editor DOM 内部，会被任何
 overflow:auto/hidden 祖先裁切（使用反馈：DevTools「纠错弹窗被覆盖无法显示详情」，
 .dt-out overflow:auto 为裁切源之一）。fixedOverflowWidgets 让弹层 fixed 定位挂
 body 逃逸裁切——一处配置全站编辑器受益。 */
    fixedOverflowWidgets: true,
    tabSize: 2,
    renderLineHighlight: 'all',
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    stickyScroll: { enabled: false },
    /* ux2 智能编辑六件套 + 串内自动弹补全（quickSuggestions.strings 是关键解锁——
 默认 false 时 dslAssist 只靠敲 " 触发；值位/数组位噪音由 dslKeyGuard 压住） */
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoSurround: 'languageDefined',
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: true,
    bracketPairColorization: { enabled: true },
    quickSuggestions: { other: true, strings: true, comments: false },
  });
  registerFormatKeybind(editor);
  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor!.getValue());
  });
  /* 1128/1129：选区变化即上报；纯空白选区按「未选中」处理（与控制台 selectionScope 同口径），
     光标偏移单独上报——多语句稿按光标所在语句执行。 */
  editor.onDidChangeCursorSelection?.(() => {
    if (!editor) return;
    const model = editor.getModel();
    const sel = editor.getSelection();
    if (!model || !sel) { emit('selection', null); return; }
    emit('cursor', model.getOffsetAt(sel.getPosition()));
    const text = model.getValueInRange(sel).trim();
    emit('selection', text ? {
      lines: sel.endLineNumber - sel.startLineNumber + 1,
      chars: text.length,
      start: model.getOffsetAt(sel.getStartPosition()),
      end: model.getOffsetAt(sel.getEndPosition()),
    } : null);
  });
  /* 布局补偿（→V3 强化）：WorkbenchLayout pane 内 create 时容器可能处于 0 尺寸过渡态
 （pane 高度异步分配），monaco 的 initial layout 读到 0 后渲染层停在 0×0——
 model 有值、view-lines 0 行，视觉全空且不可编辑（托管重建 settings/mapping「无法编辑」真凶）。
 实测单次 RO/双 rAF 补偿在部分页仍会漏（渲染恢复有数秒级随机延迟），升级为多拍补偿：
 双 rAF + 100ms~3s 五连发 setTimeout，覆盖 pane 分配/字体/KeepAlive 恢复等全部时序
 （layout 幂等，多跑无副作用，对全站 Monaco 一致生效）。 */
  const layoutKick = () => { try { editor?.layout(); } catch { /* dispose 竞态静默 */ } };
  requestAnimationFrame(() => requestAnimationFrame(layoutKick));
  [100, 300, 800, 1500, 3000].forEach(ms => setTimeout(layoutKick, ms));
  const hostRO = new ResizeObserver(() => layoutKick());
  hostRO.observe(hostRef.value!);
  hostRORef = hostRO;
  // Ctrl+Enter 执行
  editor.addAction({
    id: 'es-execute',
    label: '执行',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
    run: () => emit('execute'),
  });
  /* W4-T13：dslAssist 存在才注册 DSL 补全 provider（缺席=零注册零影响）。
 上下文判定复用 T12 dslContext；键位/值位守卫先行（公共入口），值位默认空层——
 2.6.0 起 order/track_total_hits/field 三键值串位白名单放行（spec ，见下方值位档）。 */
  if (props.dslAssist) {
    /* provider 抽工厂逐语言注册（json + ndjson）。为什么：BulkEditor body 是
 ndjson 语言（monacoLanguages 自研 monarch），只注册 json 时 dslAssist 挂在 ndjson
 实例上补全静默失效。provider 内部只读 model 文本/光标（getValue/getOffsetAt/
 getPositionAt），对 language 零假设——同一工厂直接复用；memo 是闭包内状态，
 每语言一份实例各自独立（互不串缓存）。 */
    function makeDslAssistProvider() {
      /* 2.6.0 memo（spec ）：同 doc（字符串 === 按值）+同 offset+同 bk 命中同引用返回——防 quickSuggestions 同位重扫；
 敲键触发必先改 doc 内容，天然失效。
 bk 入 key：bodyKind 是外部可变闭包（RestView 换端点 doc 不变），二元 key 会返陈旧分档（既有测试实证）。
 已知窗口（评审留档）：fields() 未入 key——RestView 切索引 body 不重置 + Ctrl+Space 同位触发会返上一索引
 字段建议；方向安全（建议退化非错误），敲 " 触发必先改 doc 即失效，故不入 key（入 key 需每次深比字段清单，得不偿失） */
      let lastDoc: string | null = null;
      let lastOffset = -1;
      let lastBk: BodyKind | null = null;
      let lastRes: { suggestions: any[] } | null = null;
      return {
        triggerCharacters: ['"'],
        provideCompletionItems(model: any, position: any) {
          const doc: string = model.getValue();
          const offset: number = model.getOffsetAt(position);
          /* bodyKind 纳入 key：闭包现调现读（廉价枚举取值），端点随选随换不缓存首值（W6 既有测试钉）——
 computeSuggestions 内部仍会重取一次（纯函数零副作用，口径不变）。 */
          const bk: BodyKind = props.dslAssist!.bodyKind?.() ?? 'search';
          if (lastRes && doc === lastDoc && offset === lastOffset && bk === lastBk) return lastRes;
          const res = computeSuggestions(model, position);
          lastDoc = doc; lastOffset = offset; lastBk = bk; lastRes = res;
          return res;
        },
      };
    }
    dslAssistDisposables = ['json', 'ndjson'].map(lang =>
      monaco.languages.registerCompletionItemProvider(lang, makeDslAssistProvider()));

    /* 值位动态候选第六通道（655 设计 P2 落地，D1~D4 裁决取推荐值）——
 terms 在场才注册（缺席=零注册=行为逐字节现状，524+1 先例）；json+ndjson 逐语言一份，
 无 triggerCharacters（不串 dslRegs ['"'] 计数契约= 先例安全位）；dispose 入
 dslAssistDisposables 随卸载全量释放（既有 dispose 链路白得）。540/543 静态档仅 doc 档
 消费、动态通道仅 search 档出档=同位零重叠（D2 动态独占架构级成立，主 provider 零触碰）。 */
    if (props.dslAssist?.terms) {
      const vaTerms = props.dslAssist.terms; /* 可选链窄化不越函数边界：map 回调内 props 重取 terms=undefined 可达，先捕获 */
      dslAssistDisposables.push(...['json', 'ndjson'].map(lang =>
        monaco.languages.registerCompletionItemProvider(lang, makeDslValueSuggestProvider({
          fields: props.dslAssist!.fields, terms: vaTerms, bodyKind: props.dslAssist!.bodyKind,
        }))));
    }

    /* painless 语言补全——四骨架 snippet 档（脚本编辑不写 JSON，dslKeyGuard/dslContext
 的 JSON 栈扫描全不适用，独立工厂走词位 range 纯插入）。triggerCharacters ['[', '.']：
 doc['/ctx[' 敲 [ 即弹、params. 与 PainlessLab 既有 params 键候选并列；签名 ≠ 恰 ['"']，
 不串 json/ndjson 的 dslRegs 计数（monacoDslAssist.spec 契约）。 */
    function makePainlessAssistProvider() {
      return {
        triggerCharacters: ['[', '.'],
        provideCompletionItems(model: any, position: any) {
          const word = model.getWordUntilPosition?.(position);
          const col = word?.startColumn ?? position.column;
          const endCol = word?.endColumn ?? position.column;
          const range = {
            startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
            startColumn: col, endColumn: endCol,
          };
          /* 四骨架：更新/取值/params 引用/emit 一次落位。字段占位交用户手填——fields() 动态注入
 choice 需要 fields 非空语境且 painless 面多挂无索引页（PainlessLab），防误导优先 */
          const sk = (label: string, detail: string, text: string, i: number) => ({
            label, kind: monaco.languages.CompletionItemKind.Snippet,
            detail,
            insertText: text,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: dslSortText(i, label),
            range,
          });
          return { suggestions: [
            sk("ctx['字段']='值'", '更新脚本：改 _source 字段', "ctx['${1:field}'] = '${2:value}'", 0),
            sk("doc['字段'].value", '查询/过滤脚本：读 doc value（只读）', "doc['${1:field}'].value", 1),
            sk('params.x', '引用执行参数', 'params.${2:name}', 2),
            sk('emit(值)', 'ingest processor：产出字段值', 'emit(${1:value})', 3),
          ] };
        },
      };
    }
    dslAssistDisposables.push(monaco.languages.registerCompletionItemProvider('painless', makePainlessAssistProvider()));

    /* W3：字段名 hover provider——word 命中 fields() 时出「type · 字段名」markdown（mapping 字段类型
 即扫即读，不用翻 mapping 树）；无 fields / 未命中一律静默（null，不产出空弹层）。
 与 dsl-assist 工厂同注册契约：json+ndjson 逐语言一份，dispose 随组件卸载全量释放（同一数组）。 */
    function makeDslFieldHoverProvider() {
      return {
        provideHover(model: any, position: any) {
          const word: { word: string } | undefined = model.getWordAtPosition?.(position);
          const w = word?.word;
          if (!w) return null;
          const fields = props.dslAssist!.fields();
          if (!fields?.length) return null;
          const hit = fields.find(f => f.path === w);
          if (!hit) return null;
          return { contents: [{ value: hit.type + ' · ' + hit.path }] };
        },
      };
    }
    dslAssistDisposables.push(...['json', 'ndjson'].map(lang =>
      monaco.languages.registerHoverProvider(lang, makeDslFieldHoverProvider())));

    /* painless 字段 hover——光标落 doc['f'] / ctx['f'] 的 f 串内时出「type · path」。
 fields() 闭包内现调（惰性，519 教训：注册期/挂载期绝不预载，防污染 fieldPickerPenetration
 计数契约）；提取逻辑走 painlessFieldAt 纯函数（dslCompletionContext 单一出处，可脱离 Monaco 断言）。 */
    function makePainlessFieldHoverProvider() {
      return {
        provideHover(model: any, position: any) {
          const f = painlessFieldAt(String(model.getValue()), model.getOffsetAt(position));
          if (!f) return null;
          const fields = props.dslAssist!.fields();
          const hit = fields?.find(x => x.path === f);
          if (!hit) return null;
          return { contents: [{ value: hit.type + ' · ' + hit.path }] };
        },
      };
    }
    dslAssistDisposables.push(monaco.languages.registerHoverProvider('painless', makePainlessFieldHoverProvider()));

    /* 原 provideCompletionItems 全体逻辑原样平移（签名不变）；内部 doc/offset 与壳层重复获取保留——纯函数零副作用。
 声明位于工厂之后：块级函数声明提升，工厂返回闭包在调用期取到。 */
    function computeSuggestions(model: any, position: any): { suggestions: any[] } {
        const doc: string = model.getValue();
        const offset: number = model.getOffsetAt(position);
        /* W6：bodyKind 分派先行（闭包现调现读，端点随选随换）。none 恒空（_bulk NDJSON 体不扰动）；
 settings/mapping/template 仅串内键位出档（值位/串外压住——设置值枚举形态各异，出档易误导）；
 doc 仅 field 值位白名单出字段候选（文档体键位零候选——_source 字段名自由，出 root 查询键骨架是误导）；
 缺省（含显式 undefined）回退 search，走下方 W4 三档现状逻辑（一行不动）。 */
        const bk: BodyKind = props.dslAssist!.bodyKind?.() ?? 'search';
        if (bk === 'none') return { suggestions: [] };
        /* doc 档（文档体 /idx/_doc/1 等）——键位一律零候选；仅值位白名单 field 键的
 值串位放行出 fields() 字段候选（与 search 值位档同形态：range 覆盖整串，insertText 自带引号；
 kind=Value 同口径）。其余值位/串外/键位落下方兜底 []。
 文档体无算子上下文（typePriorityForOp 无从取 op），字段候选维持 fields() 序。 */
        if (bk === 'doc') {
          const g = dslKeyGuard(doc, offset);
          /* arrayElem 一并压住——doc 档「仅 field 键 ':' 值串位放行」语义原样，
 "field": [ 元素位不是值串位（元素位没有 ':' 左邻） */
          if (!g.ok || !g.inStr || g.valueKey !== 'field' || g.arrayElem) return { suggestions: [] };
          const dEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const dsp = model.getPositionAt(g.strStart);
          const dep = model.getPositionAt(dEnd);
          const vals = props.dslAssist!.fields().map(f => f.path);
          return { suggestions: vals.map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"',
            range: { startLineNumber: dsp.lineNumber, startColumn: dsp.column, endLineNumber: dep.lineNumber, endColumn: dep.column },
            command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v),
            sortText: dslSortText(i, v),
          })) };
        }
        /* analyze 档（_analyze body）——键位（串内）出八键骨架；值位分派：
 analyzer/search_analyzer/normalizer/tokenizer 出「内置清单 ∪ analyzers() 实名组件」
 （视图侧惰性拉 analysisSettings 注入，缺席=纯内置不关档）；field 出 fields()；
 text 等其余值位压住（text 不在 VALUE_WHITELIST，dslKeyGuard 不放行同归此处）；
 串外压住（W6 三档同口径）。 */
        if (bk === 'analyze') {
          const g = dslKeyGuard(doc, offset);
          /* 1439：串内一律进入分派（filter/char_filter 不在值白名单，ok=false 也要出组件档）；
             串外维持原有压制（analyze 不出裸词位）。 */
          if (!g.inStr) return { suggestions: [] };
          const azEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const azSp = model.getPositionAt(g.strStart);
          const azEp = model.getPositionAt(azEnd);
          const azRange = {
            startLineNumber: azSp.lineNumber, startColumn: azSp.column,
            endLineNumber: azEp.lineNumber, endColumn: azEp.column,
          };
          if (g.valueKey) {
            /* 1439：四类组件各归其位——tokenizer/filter/char_filter 用各自内置表，
               normalizer 无内置（只出视图侧实名组件）；实名通道按类别取，
               旧视图只给 analyzers() 时回退到它（零破坏）。 */
            const legacy = props.dslAssist!.analyzers?.() ?? [];
            const customFor = (chan?: () => string[]) => (chan ? chan() : legacy);
            const componentVals = g.valueKey === 'analyzer' || g.valueKey === 'search_analyzer'
              ? [...BUILTIN_ANALYZERS, ...customFor(props.dslAssist!.analyzers)]
              : g.valueKey === 'tokenizer' ? [...BUILTIN_TOKENIZERS, ...customFor(props.dslAssist!.tokenizers)]
              : g.valueKey === 'filter' ? [...BUILTIN_TOKEN_FILTERS, ...customFor(props.dslAssist!.filters)]
              : g.valueKey === 'char_filter' ? [...BUILTIN_CHAR_FILTERS, ...customFor(props.dslAssist!.charFilters)]
              : g.valueKey === 'normalizer' ? customFor(props.dslAssist!.normalizers)
              : null;
            if (componentVals) {
              const uniq = [...new Set(componentVals)];
              if (!uniq.length) return { suggestions: [] };
              return { suggestions: uniq.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: azRange, command: ACCEPT_FORMAT_COMMAND,
                filterText: dslFilterText(v), sortText: dslSortText(i, v),
              })) };
            }
            if (g.valueKey === 'field') {
              const vals = props.dslAssist!.fields().map(f => f.path);
              return { suggestions: vals.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: azRange, command: ACCEPT_FORMAT_COMMAND,
                filterText: dslFilterText(v), sortText: dslSortText(i, v),
              })) };
            }
            return { suggestions: [] }; /* text 等其余白名单外值位压住 */
          }
          const azIndent = lineIndentAt(doc, g.strStart);
          const azAffix = commaAffixes(doc, g.strStart, azEnd);
          return { suggestions: Object.entries(ANALYZE_KEY_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, g.strStart, azEnd, azIndent, snip.text, azAffix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: azRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), sortText: dslSortText(i, k),
          })) };
        }
        /* 1439：runtime_mappings 字段配置的 "type" 值位给 runtime 类型目录
           （search 与 SQL 体同源；不在表内的类型写进去 ES 会拒）。 */
        if (runtimeFieldTypeAt(doc, offset)) {
          const grt = dslKeyGuard(doc, offset);
          if (grt.inStr && grt.valueKey === 'type') {
            const rtEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const rtsp = model.getPositionAt(grt.strStart);
            const rtep = model.getPositionAt(rtEnd);
            const rtRange = {
              startLineNumber: rtsp.lineNumber, startColumn: rtsp.column,
              endLineNumber: rtep.lineNumber, endColumn: rtep.column,
            };
            return { suggestions: RUNTIME_FIELD_TYPES.map((t, i) => ({
              label: t.label, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + t.label + '"', range: rtRange, command: ACCEPT_FORMAT_COMMAND,
              detail: t.detail,
              filterText: dslFilterText(t.label), sortText: dslSortText(i, t.label),
            })) };
          }
        }
        /* 1439：_msearch 头行给请求头键（index/search_type/routing…）；
           查询体行不拦截，回落下方 search 三档（体行本身就是一个完整查询）。 */
        if ((bk === 'msearch-body' || bk === 'msearch-template-body') && msearchHeaderLineAt(doc, offset)) {
          const gm = dslKeyGuard(doc, offset);
          if (!gm.inStr) return { suggestions: [] };
          if (gm.valueKey) {
            /* 1439：头行 "index" 值位给当前集群索引名 */
            if (gm.valueKey === 'index') {
              const names = props.dslAssist!.indices?.() ?? [];
              if (names.length) {
                const iEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
                const isp = model.getPositionAt(gm.strStart);
                const iep = model.getPositionAt(iEnd);
                const iRange = {
                  startLineNumber: isp.lineNumber, startColumn: isp.column,
                  endLineNumber: iep.lineNumber, endColumn: iep.column,
                };
                return { suggestions: names.map((v, i) => ({
                  label: v, kind: monaco.languages.CompletionItemKind.Value,
                  insertText: '"' + v + '"', range: iRange, command: ACCEPT_FORMAT_COMMAND,
                  detail: '索引',
                  filterText: dslFilterText(v), sortText: dslSortText(i, v),
                })) };
              }
            }
            return { suggestions: [] };
          }
          const mEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const msp = model.getPositionAt(gm.strStart);
          const mep = model.getPositionAt(mEnd);
          const mRange = {
            startLineNumber: msp.lineNumber, startColumn: msp.column,
            endLineNumber: mep.lineNumber, endColumn: mep.column,
          };
          const mAffix = commaAffixes(doc, gm.strStart, mEnd);
          return { suggestions: msearchHeaderKeyItems().map((it, i) => ({
            label: it.label, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: it.detail,
            insertText: wrapSnippet(doc, gm.strStart, mEnd, lineIndentAt(doc, gm.strStart), it.insertText, mAffix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: mRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.label), sortText: dslSortText(i, it.label),
          })) };
        }
        /* 1439：_msearch/template 体行给模板执行键（id/source/params） */
        if (bk === 'msearch-template-body' && !msearchHeaderLineAt(doc, offset)) {
          const gtm = dslKeyGuard(doc, offset);
          if (!gtm.inStr || gtm.valueKey) return { suggestions: [] };
          const tmEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const tmsp = model.getPositionAt(gtm.strStart);
          const tmepp = model.getPositionAt(tmEnd);
          const tmRange = {
            startLineNumber: tmsp.lineNumber, startColumn: tmsp.column,
            endLineNumber: tmepp.lineNumber, endColumn: tmepp.column,
          };
          const tmAffix = commaAffixes(doc, gtm.strStart, tmEnd);
          return { suggestions: msearchTemplateBodyKeyItems().map((it, i) => ({
            label: it.label, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: it.detail,
            insertText: wrapSnippet(doc, gtm.strStart, tmEnd, lineIndentAt(doc, gtm.strStart), it.insertText, tmAffix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: tmRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.label), sortText: dslSortText(i, it.label),
          })) };
        }
        /* 1439：_bulk 动作行给动作键、动作内层给元数据键（update 多 retry_on_conflict）；
           文档行是裸文档不出键。 */
        if (bk === 'bulk-body') {
          const gb = dslKeyGuard(doc, offset);
          if (!gb.inStr) return { suggestions: [] };
          if (bulkLineKindAt(doc, offset) === 'doc') return { suggestions: [] };
          if (gb.valueKey) {
            /* 1439：动作元数据 "_index" 值位给当前集群索引名 */
            if (gb.valueKey === '_index') {
              const names = props.dslAssist!.indices?.() ?? [];
              if (names.length) {
                const biEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
                const bisp = model.getPositionAt(gb.strStart);
                const biep = model.getPositionAt(biEnd);
                const biRange = {
                  startLineNumber: bisp.lineNumber, startColumn: bisp.column,
                  endLineNumber: biep.lineNumber, endColumn: biep.column,
                };
                return { suggestions: names.map((v, i) => ({
                  label: v, kind: monaco.languages.CompletionItemKind.Value,
                  insertText: '"' + v + '"', range: biRange, command: ACCEPT_FORMAT_COMMAND,
                  detail: '索引',
                  filterText: dslFilterText(v), sortText: dslSortText(i, v),
                })) };
              }
            }
            return { suggestions: [] };
          }
          const metaOp = bulkActionMetaAt(doc, offset);
          const bItems = metaOp ? bulkActionMetaKeyItems(metaOp) : bulkActionKeyItems();
          const bEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const bsp = model.getPositionAt(gb.strStart);
          const bep = model.getPositionAt(bEnd);
          const bRange = {
            startLineNumber: bsp.lineNumber, startColumn: bsp.column,
            endLineNumber: bep.lineNumber, endColumn: bep.column,
          };
          const bAffix = commaAffixes(doc, gb.strStart, bEnd);
          return { suggestions: bItems.map((it, i) => ({
            label: it.label, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: it.detail,
            insertText: wrapSnippet(doc, gb.strStart, bEnd, lineIndentAt(doc, gb.strStart), it.insertText, bAffix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: bRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.label), sortText: dslSortText(i, it.label),
          })) };
        }
        /* +1：mapping 值位 analyzers 通道——组件名四键的值串位出
 analyzers() 实名候选（range 覆盖整串 I-1 同形态）；候选空/非 mapping 档
 落到下方既有压制口，零增量。
 1439：建索引体（PUT /<索引>）与索引模板的 mappings 区同样算 mapping 语境——
 此前只有 mapping 档生效，create-index 流程里 analyzer 实名一条都不出。 */
        const mappingValueCtx = bk === 'mapping'
          || (bk === 'index-body' && indexBodyRegionAt(doc, offset) === 'mapping')
          || (bk === 'template' && templateRegionAt(doc, offset) === 'mapping');
        if (mappingValueCtx) {
          const g0 = dslKeyGuard(doc, offset);
          if (g0.ok && g0.inStr && g0.valueKey && ANALYZER_VALUE_KEYS.has(g0.valueKey)) {
            /* 1439：按类别取实名（tokenizer→tokenizers，normalizer→normalizers），
               旧视图只有 analyzers() 时回退到它（零破坏）。 */
            const legacy = props.dslAssist!.analyzers?.() ?? [];
            const names = g0.valueKey === 'tokenizer' ? (props.dslAssist!.tokenizers?.() ?? legacy)
              : g0.valueKey === 'normalizer' ? (props.dslAssist!.normalizers?.() ?? legacy)
              : legacy;
            if (names.length) {
              const aEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const asp = model.getPositionAt(g0.strStart);
              const aep = model.getPositionAt(aEnd);
              return { suggestions: names.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', filterText: dslFilterText(v), sortText: dslSortText(i, v),
                command: ACCEPT_FORMAT_COMMAND,
                range: { startLineNumber: asp.lineNumber, startColumn: asp.column, endLineNumber: aep.lineNumber, endColumn: aep.column },
              })) };
            }
          }
        }
        /* 1439：_terms_enum 的 "field" 值位给查询字段名 */
        if (bk === 'terms-enum-body') {
          const gf = dslKeyGuard(doc, offset);
          if (gf.inStr && gf.valueKey === 'field') {
            const teEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const tesp = model.getPositionAt(gf.strStart);
            const teep = model.getPositionAt(teEnd);
            const teRange = {
              startLineNumber: tesp.lineNumber, startColumn: tesp.column,
              endLineNumber: teep.lineNumber, endColumn: teep.column,
            };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + f.path + '"', range: teRange, command: ACCEPT_FORMAT_COMMAND,
              detail: f.type,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
        }
        /* 1439：mapping 语境 type 值位出字段类型目录——type 是 mapping 里唯一值域封闭的键
           （analyzer 走上面的实名通道），其余值位仍维持「值位不出档」口径。
           建索引体/模板的 mappings 区同口径（见上 mappingValueCtx）。 */
        if (mappingValueCtx) {
          const gt = dslKeyGuard(doc, offset);
          if (!gt.ok && gt.inStr && gt.valueKey === 'type' && !gt.arrayElem) {
            const tEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const tsp = model.getPositionAt(gt.strStart);
            const tep = model.getPositionAt(tEnd);
            const tRange = { startLineNumber: tsp.lineNumber, startColumn: tsp.column, endLineNumber: tep.lineNumber, endColumn: tep.column };
            return { suggestions: MAPPING_TYPES.map((t, i) => ({
              label: t, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + t + '"', range: tRange, command: ACCEPT_FORMAT_COMMAND,
              detail: '字段类型',
              filterText: dslFilterText(t), sortText: dslSortText(i, t),
            })) };
          }
        }
        /* 1439：按查询删/改体与 query-only 体——query 内要回落到 search 三档（整棵查询补全），
           所以 query 区域不进 W6；根层/script/模板根层才走键位档。 */
        const qwRegion = (bk === 'dbq-body' || bk === 'ubq-body' || bk === 'query-body')
          ? queryWriteRegionAt(doc, offset) : null;
        const roRegion = bk === 'template-search-body' ? rootOnlyRegionAt(doc, offset) : null;
        const mRegion = (bk === 'mget-body' || bk === 'mtermvectors-body') ? mgetRegionAt(doc, offset) : null;
        const tvRegion = bk === 'termvectors-body' ? rootOnlyRegionAt(doc, offset) : null;
        /* 1439：SQL 体的 filter 是 Query DSL——区域为 query 时回落整棵查询补全，不进 W6 */
        const sfRegion = bk === 'sql-body' ? sqlFilterRegionAt(doc, offset) : null;
        /* 1439：EQL 体的 filter 也是 Query DSL——区域为 query 时回落整棵查询补全 */
        const eqRegion = bk === 'eql-body' ? eqlFilterRegionAt(doc, offset) : null;
        /* 1439：集群设置体按根层/持久层·临时层/深层分派 */
        const csRegion = bk === 'cluster-settings-body' ? clusterSettingsRegionAt(doc, offset) : null;
        /* 1439：重路由体按根层/命令对象/命令参数对象分派；分配诊断体只有根层 */
        const rrRegion = bk === 'reroute-body' ? rerouteRegionAt(doc, offset) : null;
        const aeRegion = bk === 'allocation-explain-body' ? rootOnlyRegionAt(doc, offset) : null;
        /* 1439：SLM 策略体按根层/config/retention 分派 */
        const slmRegion = bk === 'slm-policy-body' ? slmPolicyRegionAt(doc, offset) : null;
        /* 1439：ILM 策略体按根层/policy/phases/阶段/actions 五段分派 */
        const ilmRegion = bk === 'ilm-policy-body' ? ilmPolicyRegionAt(doc, offset) : null;
        /* 1439：Watcher 体按根/触发器/调度/输入/条件/动作类型分派 */
        const wRegion = bk === 'watch-body' ? watchRegionAt(doc, offset) : null;
        /* 1439：安全角色按根/indices 元素/field_security/applications 元素分派；
           安全用户按根/role_templates 元素分派 */
        const sRoleRegion = bk === 'security-role-body' ? securityRoleRegionAt(doc, offset) : null;
        const sUserRegion = bk === 'security-user-body' ? securityUserRegionAt(doc, offset) : null;
        const rmRegion = bk === 'security-role-mapping-body' ? securityRoleMappingRegionAt(doc, offset) : null;
        /* 1439：Ingest 体按根层 / processors[]·on_failure 处理器对象分派 */
        const ingestRegion = bk === 'ingest-pipeline-body' ? ingestPipelineRegionAt(doc, offset) : null;
        /* 1439：管道试跑体按根 / pipeline / pipeline.processors / docs 元素分派 */
        const simRegion = bk === 'ingest-simulate-body' ? ingestSimulateRegionAt(doc, offset) : null;
        /* 1439：Enrich 体按根/match·geo_match/range 分派；query 内回落整棵查询补全 */
        const enrichRegion = bk === 'enrich-policy-body' ? enrichPolicyRegionAt(doc, offset) : null;
        /* 1439：Transform 体按根/source/dest/pivot/sync(.time)/retention(.time) 分派 */
        const trRegion = bk === 'transform-body' ? transformRegionAt(doc, offset) : null;
        /* 1439：Rollup 体按根/groups/分组类型/metrics 元素分派 */
        const ruRegion = bk === 'rollup-job-body' ? rollupRegionAt(doc, offset) : null;
        /* 1439：ML 数据馈送体按根/query/延迟检查/分块/索引选项分派 */
        const mlRegion = bk === 'ml-datafeed-body' ? mlDatafeedRegionAt(doc, offset) : null;
        /* 1439：ML 作业体按根/analysis_config/detectors/analysis_limits/data_description 分派 */
        const mlJobRegion = bk === 'ml-job-body' ? mlJobRegionAt(doc, offset) : null;
        /* 1439：ML 过滤器/日历、CCR 跟随体是平铺根键——只在根层出档 */
        const flatRootRegion = (bk === 'ml-filter-body' || bk === 'ml-filter-update-body' || bk === 'ml-calendar-body'
          || bk === 'ccr-follow-body' || bk === 'ccr-auto-follow-body'
          || bk === 'security-api-key-invalidate-body' || bk === 'watch-execute-body'
          || bk === 'security-privilege-body' || bk === 'snapshot-clone-body'
          || bk === 'snapshot-mount-body' || bk === 'nodes-reload-secure-settings-body') ? rootOnlyRegionAt(doc, offset) : null;
        /* 1439：ILM 手动推进体按根 / current_step·next_step 分派 */
        const ilmMoveRegion = bk === 'ilm-move-body' ? ilmMoveRegionAt(doc, offset) : null;
        /* 1439：应用权限体两层动态键——只在根与权限条目出档 */
        const privRegion = bk === 'security-privilege-body' ? securityPrivilegeRegionAt(doc, offset) : null;
        /* 1439：API Key 检索体的 query 内回落整棵查询补全 */
        const akqRegion = bk === 'security-api-key-query-body' ? securityApiKeyQueryRegionAt(doc, offset) : null;
        /* 1439：跨集群 Key 体按根 / access / access 元素分派 */
        const cckRegion = bk === 'security-cross-cluster-api-key-body'
          ? securityCrossClusterApiKeyRegionAt(doc, offset) : null;
        /* 1439：内联试跑 Watch 体按根 / watch 定义及其子区分派 */
        const wieRegion = bk === 'watch-inline-execute-body' ? watchInlineExecuteRegionAt(doc, offset) : null;
        /* 1439：日历事件体按根 / events 元素分派 */
        const mlCalEvRegion = bk === 'ml-calendar-events-body' ? mlCalendarEventsRegionAt(doc, offset) : null;
        /* 1439：Graph 体按 query/顶点/controls/采样多样性/hop 分派；query 内回落整棵查询补全 */
        const gphRegion = bk === 'graph-explore-body' ? graphExploreRegionAt(doc, offset) : null;
        /* 1439：API Key 体在 role_descriptors 内按角色体给键；代授/许可证同样分派 */
        const akRegion = bk === 'security-api-key-body' ? securityApiKeyRegionAt(doc, offset) : null;
        const grantRegion = bk === 'security-api-key-grant-body' ? securityApiKeyGrantRegionAt(doc, offset) : null;
        const licRegion = bk === 'license-body' ? licenseRegionAt(doc, offset) : null;
        const ssRegion = (bk === 'stored-script-body' || bk === 'script-execute-body') ? storedScriptRegionAt(doc, offset) : null;
        const alRegion = bk === 'aliases-body' ? aliasesBodyRegionAt(doc, offset) : null;
        const scRegion = (bk === 'scroll-body' || bk === 'clear-scroll-body') ? rootOnlyRegionAt(doc, offset) : null;
        /* 1439：_reindex 的 source.query 同样是 Query DSL——区域为 query 时回落查询补全 */
        const rIdxRegion = bk === 'reindex-body' ? reindexBodyRegionAt(doc, offset) : 'root';
        /* 1439：SQL 体的 runtime_mappings 字段配置走通用 runtime 键/值档（W6 会把它压成 []） */
        const rtCtx = (bk === 'sql-body' || bk === 'eql-body') && inRuntimeMappingsAt(doc, offset);
        /* 1439：field-caps / terms-enum 的 index_filter 是 Query DSL——区域为 query 时回落 */
        const fcRegion = (bk === 'field-caps-body' || bk === 'terms-enum-body') ? indexFilterRegionAt(doc, offset) : null;
        /* 1439：_rank_eval 按根/评估项/metric 区域分派 */
        const rankRegion = bk === 'rank-eval-body' ? rankEvalRegionAt(doc, offset) : null;
        if (!rtCtx && fcRegion !== 'query' && gphRegion !== 'query' && akqRegion !== 'query' && sRoleRegion !== 'query' && cckRegion !== 'query' && wRegion !== 'search-query' && wieRegion !== 'watch-search-query' && qwRegion !== 'query' && sfRegion !== 'query' && eqRegion !== 'query' && enrichRegion !== 'query' && trRegion !== 'source-query' && mlRegion !== 'query' && rIdxRegion !== 'query' && (bk === 'settings' || bk === 'mapping' || bk === 'template' || bk === 'index-body' || bk === 'alias-body' || bk === 'aliases-body' || bk === 'reindex-body' || bk === 'sql-body' || bk === 'update-body' || bk === 'rollover-body' || bk === 'dbq-body' || bk === 'ubq-body' || bk === 'query-body' || bk === 'template-search-body' || bk === 'mget-body' || bk === 'stored-script-body' || bk === 'script-execute-body' || bk === 'scroll-body' || bk === 'clear-scroll-body' || bk === 'termvectors-body' || bk === 'mtermvectors-body' || bk === 'field-caps-body' || bk === 'terms-enum-body' || bk === 'rank-eval-body' || bk === 'eql-body' || bk === 'cluster-settings-body'
          || bk === 'reroute-body' || bk === 'allocation-explain-body'
          || bk === 'snapshot-repo-body' || bk === 'snapshot-create-body' || bk === 'snapshot-restore-body'
          || bk === 'slm-policy-body' || bk === 'ilm-policy-body' || bk === 'watch-body'
          || bk === 'security-role-body' || bk === 'security-user-body'
          || bk === 'security-role-mapping-body' || bk === 'security-api-key-body'
          || bk === 'ingest-pipeline-body' || bk === 'ingest-simulate-body'
          || bk === 'enrich-policy-body' || bk === 'transform-body'
          || bk === 'rollup-job-body' || bk === 'ml-datafeed-body' || bk === 'ml-job-body'
          || bk === 'ml-filter-body' || bk === 'ml-calendar-body' || bk === 'ml-calendar-events-body'
          || bk === 'graph-explore-body' || bk === 'ccr-follow-body' || bk === 'ccr-auto-follow-body'
          || bk === 'security-api-key-grant-body' || bk === 'license-body'
          || bk === 'security-api-key-query-body' || bk === 'security-api-key-invalidate-body'
          || bk === 'ml-filter-update-body'
          || bk === 'security-cross-cluster-api-key-body' || bk === 'watch-execute-body'
          || bk === 'security-privilege-body' || bk === 'ilm-move-body' || bk === 'snapshot-clone-body'
          || bk === 'watch-inline-execute-body' || bk === 'snapshot-mount-body'
          || bk === 'nodes-reload-secure-settings-body')) {
          const g = dslKeyGuard(doc, offset);
          /* 1439：_reindex 的 source.sort / source._source 数组元素是字段名位 */
          if (g.inStr && g.arrayElem && (rIdxRegion === 'sort' || rIdxRegion === 'source-fields')) {
            const rfEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const rfsp = model.getPositionAt(g.strStart);
            const rfep = model.getPositionAt(rfEnd);
            const rfRange = {
              startLineNumber: rfsp.lineNumber, startColumn: rfsp.column,
              endLineNumber: rfep.lineNumber, endColumn: rfep.column,
            };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + f.path + '"', range: rfRange, command: ACCEPT_FORMAT_COMMAND,
              detail: f.type,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
          /* 1439：SQL 体的 "query": 值位——空串给 SELECT 骨架；串内已有内容改为在光标处插关键字，
             绝不整串替换（此前中途 Ctrl+Space 会把已输入的 SQL 整个换成骨架）。
             必须放在下面「值位一律不出档」的压制之前，否则永远到不了。 */
          if (bk === 'sql-body' && g.inStr && g.valueKey === 'query') {
            if (offset > g.strStart + 1) {
              const cp = model.getPositionAt(Math.max(0, Math.min(offset, doc.length)));
              const cRange = {
                startLineNumber: cp.lineNumber, startColumn: cp.column,
                endLineNumber: cp.lineNumber, endColumn: cp.column,
              };
              return { suggestions: SQL_KEYWORD_SNIPPETS.map((k, i) => ({
                label: k.label, kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: k.text, range: cRange, detail: k.detail,
                filterText: dslFilterText(k.label), sortText: dslSortText(i, k.label),
              })) };
            }
            const vEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const vsp = model.getPositionAt(g.strStart);
            const vep = model.getPositionAt(vEnd);
            const vRange = {
              startLineNumber: vsp.lineNumber, startColumn: vsp.column,
              endLineNumber: vep.lineNumber, endColumn: vep.column,
            };
            return { suggestions: SQL_VALUE_SNIPPETS.map((s2, i) => ({
              label: s2.label, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + s2.text + '"', range: vRange, command: ACCEPT_FORMAT_COMMAND,
              detail: s2.detail,
              filterText: dslFilterText(s2.label), sortText: dslSortText(i, s2.label),
            })) };
          }
          /* 1439：EQL 的 "query" 值位——空串给 EQL 起步骨架；串内已有内容在光标处插关键字，
             不整串替换（同 SQL 值位口径）。含引号的骨架按 JSON 串转义后插入。 */
          if (bk === 'eql-body' && g.inStr && g.valueKey === 'query') {
            if (offset > g.strStart + 1) {
              const cp = model.getPositionAt(Math.max(0, Math.min(offset, doc.length)));
              const cRange = {
                startLineNumber: cp.lineNumber, startColumn: cp.column,
                endLineNumber: cp.lineNumber, endColumn: cp.column,
              };
              return { suggestions: EQL_KEYWORD_SNIPPETS.map((k, i) => ({
                label: k.label, kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: k.text, range: cRange, detail: k.detail,
                filterText: dslFilterText(k.label), sortText: dslSortText(i, k.label),
              })) };
            }
            const eEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const esp = model.getPositionAt(g.strStart);
            const eep = model.getPositionAt(eEnd);
            const eRange = {
              startLineNumber: esp.lineNumber, startColumn: esp.column,
              endLineNumber: eep.lineNumber, endColumn: eep.column,
            };
            return { suggestions: EQL_VALUE_SNIPPETS.map((s2, i) => ({
              label: s2.label, kind: monaco.languages.CompletionItemKind.Value,
              insertText: jsonStringLiteral(s2.text), range: eRange, command: ACCEPT_FORMAT_COMMAND,
              detail: s2.detail,
              filterText: dslFilterText(s2.label), sortText: dslSortText(i, s2.label),
            })) };
          }
          /* 1439：EQL 的事件类别/时间戳/去重字段值位给查询字段名 */
          if (g.inStr && g.valueKey && bk === 'eql-body'
              && (g.valueKey === 'event_category_field' || g.valueKey === 'timestamp_field' || g.valueKey === 'tiebreaker_field')) {
            const efEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const efsp = model.getPositionAt(g.strStart);
            const efep = model.getPositionAt(efEnd);
            const efRange = {
              startLineNumber: efsp.lineNumber, startColumn: efsp.column,
              endLineNumber: efep.lineNumber, endColumn: efep.column,
            };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: jsonStringLiteral(f.path), range: efRange, command: ACCEPT_FORMAT_COMMAND,
              detail: f.type,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
          /* 1439：词项向量的 "fields" 值位给查询字段名（字段数组元素串位）；
             EQL 的 fields 同语义（随结果返回的字段清单） */
          if (g.inStr && g.valueKey === 'fields' && (bk === 'termvectors-body' || bk === 'mtermvectors-body' || bk === 'eql-body')) {
            const fEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const fsp = model.getPositionAt(g.strStart);
            const fep = model.getPositionAt(fEnd);
            const fRange = {
              startLineNumber: fsp.lineNumber, startColumn: fsp.column,
              endLineNumber: fep.lineNumber, endColumn: fep.column,
            };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + f.path + '"', range: fRange, command: ACCEPT_FORMAT_COMMAND,
              detail: f.type,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
          /* 1439：快照仓库 type 值位给仓库类型（fs/url/s3/gcs/azure/hdfs）——
             串内覆盖整串，裸值位光标处插入，均带引号。 */
          if (bk === 'snapshot-repo-body' && g.valueKey === 'type') {
            let trRange;
            if (g.inStr) {
              const tEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const tsp = model.getPositionAt(g.strStart);
              const tep = model.getPositionAt(tEnd);
              trRange = {
                startLineNumber: tsp.lineNumber, startColumn: tsp.column,
                endLineNumber: tep.lineNumber, endColumn: tep.column,
              };
            } else {
              const cp = model.getPositionAt(Math.max(0, Math.min(offset, doc.length)));
              trRange = {
                startLineNumber: cp.lineNumber, startColumn: cp.column,
                endLineNumber: cp.lineNumber, endColumn: cp.column,
              };
            }
            return { suggestions: SNAPSHOT_REPO_TYPES.map((t, i) => ({
              label: t.label, kind: monaco.languages.CompletionItemKind.Value,
              insertText: jsonStringLiteral(t.label), range: trRange, command: ACCEPT_FORMAT_COMMAND,
              detail: t.detail,
              filterText: dslFilterText(t.label), sortText: dslSortText(i, t.label),
            })) };
          }
          /* 1439：结构化体值域封闭的键在值位给枚举（version_type/布尔开关/slices:auto）——
             布尔值插裸 true/false，串枚举带引号；range 覆盖整串，接受即合法。 */
          const enumHint = g.valueKey ? STRUCTURED_VALUE_ENUMS[g.valueKey] : undefined;
          if (enumHint) {
            /* 串内：覆盖整串（接受即替换）；裸值位：只在光标处插入（true/false 不包引号） */
            let eRange;
            if (g.inStr) {
              const eEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const esp = model.getPositionAt(g.strStart);
              const eep = model.getPositionAt(eEnd);
              eRange = {
                startLineNumber: esp.lineNumber, startColumn: esp.column,
                endLineNumber: eep.lineNumber, endColumn: eep.column,
              };
            } else {
              const cp = model.getPositionAt(Math.max(0, Math.min(offset, doc.length)));
              eRange = {
                startLineNumber: cp.lineNumber, startColumn: cp.column,
                endLineNumber: cp.lineNumber, endColumn: cp.column,
              };
            }
            return { suggestions: enumHint.values.map((v, i) => ({
              label: v, kind: monaco.languages.CompletionItemKind.Value,
              insertText: enumHint.quoted ? '"' + v + '"' : v, range: eRange, command: ACCEPT_FORMAT_COMMAND,
              detail: enumHint.detail,
              filterText: dslFilterText(v), sortText: dslSortText(i, v),
            })) };
          }
          /* g.valueKey 一并压住：W6 三档语义是「值位一律不出档」，2.6.0 白名单口仅限 search 路径 */
          if (!g.ok || !g.inStr || g.valueKey) return { suggestions: [] };
          /* range 与 W4 I-1/N-1 同形态：起=串起始，右扫闭合引号遇 \n 即停（本分支已锁 inStr，
 串内右扫前提成立）——接受后整串干净替换，不留 "" 残壳。 */
          const end = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const sp = model.getPositionAt(g.strStart);
          const ep = model.getPositionAt(end);
          const range = {
            startLineNumber: sp.lineNumber, startColumn: sp.column,
            endLineNumber: ep.lineNumber, endColumn: ep.column,
          };
          /* 1439：template 档按体内区域分派——template.settings/mappings 给设置/映射键；
             template.aliases 的别名配置对象给别名键（别名命名位不出键档） */
          const tplRegion = bk === 'template' ? templateRegionAt(doc, offset) : 'template';
          /* 1439：创建索引体（PUT /<索引名>）按 settings/mappings/aliases 区域分派 */
          const idxRegion = bk === 'index-body' ? indexBodyRegionAt(doc, offset) : 'root';
          const aliasItems = (): AssistItem[] => (aliasConfigAt(doc, offset) ? aliasKeyItems() : []);
          /* 1439：更新体/滚动体按区域分派——doc/upsert 内是裸文档、conditions 只给 max_* */
          const uRegion = bk === 'update-body' ? updateBodyRegionAt(doc, offset) : 'root';
          const rRegion = bk === 'rollover-body' ? rolloverBodyRegionAt(doc, offset) : 'root';
          const items: AssistItem[] = bk === 'settings' ? settingsKeyItems()
            : bk === 'sql-body' ? (sfRegion === 'root' ? sqlBodyKeyItems() : [])
            : bk === 'eql-body' ? (eqRegion === 'root' ? eqlBodyKeyItems() : [])
            : bk === 'cluster-settings-body'
              ? (csRegion === 'root' ? clusterSettingsBodyKeyItems()
                : csRegion === 'settings' ? clusterSettingsKeyItems()
                : [])
            : bk === 'reroute-body'
              ? (rrRegion === 'root' ? rerouteBodyKeyItems()
                : rrRegion === 'command' ? rerouteCommandKeyItems()
                : rrRegion === 'params' ? rerouteCommandParamKeyItems(rerouteCommandNameAt(doc, offset))
                : [])
            : bk === 'allocation-explain-body'
              ? (aeRegion === 'root' ? allocationExplainBodyKeyItems() : [])
            : bk === 'snapshot-repo-body' ? snapshotRepoBodyKeyItems()
            : bk === 'snapshot-create-body' ? snapshotCreateBodyKeyItems()
            : bk === 'snapshot-restore-body' ? snapshotRestoreBodyKeyItems()
            : bk === 'slm-policy-body'
              ? (slmRegion === 'root' ? slmPolicyBodyKeyItems()
                : slmRegion === 'config' ? slmConfigKeyItems()
                : slmRegion === 'retention' ? slmRetentionKeyItems()
                : [])
            : bk === 'ilm-policy-body'
              ? (ilmRegion === 'root' ? ilmPolicyBodyKeyItems()
                : ilmRegion === 'policy' ? ilmPolicyKeyItems()
                : ilmRegion === 'phases' ? ilmPhaseKeyItems()
                : ilmRegion === 'phase' ? ilmPhaseConfigKeyItems()
                : ilmRegion === 'actions' ? ilmActionKeyItems()
                : [])
            : bk === 'watch-body'
              ? (wRegion === 'root' ? watchBodyKeyItems()
                : wRegion === 'trigger' ? watchTriggerKeyItems()
                : wRegion === 'schedule' ? watchScheduleKeyItems()
                : wRegion === 'chain-trigger' ? watchChainTriggerKeyItems()
                : wRegion === 'chain-trigger-container' ? watchChainNestedTriggerKeyItems()
                : wRegion === 'input' ? watchInputKeyItems()
                : wRegion === 'search-input' ? watchSearchInputKeyItems()
                : wRegion === 'search-request' ? watchSearchRequestKeyItems()
                : wRegion === 'http-input' ? watchHttpInputKeyItems()
                : wRegion === 'http-request' ? httpRequestKeyItems()
                : wRegion === 'chain-input-container' ? watchChainInputKeyItems()
                : wRegion === 'chain-input' ? watchInputKeyItems()
                : wRegion === 'search-body' ? searchRootKeyItems()
                : wRegion === 'condition' ? watchConditionKeyItems()
                : wRegion === 'condition-params' ? watchConditionParamsKeyItemsAt(doc, offset)
                : wRegion === 'array-compare-body' ? watchArrayCompareKeyItems()
                : wRegion === 'array-compare-op' ? watchArrayCompareOpKeyItems()
                : wRegion === 'action' ? watchActionTypeKeyItems()
                : wRegion === 'action-params' ? watchActionParamsKeyItemsAt(doc, offset)
                : wRegion === 'action-email-body' ? watchEmailBodyKeyItems()
                : wRegion === 'action-slack-message' ? watchSlackMessageKeyItems()
                : wRegion === 'action-jira-fields' ? watchJiraFieldsKeyItems()
                : wRegion === 'email-attachment' ? watchEmailAttachmentKeyItems()
                : wRegion === 'email-att-http' ? watchEmailHttpAttachmentKeyItems()
                : wRegion === 'email-att-reporting' ? watchEmailReportingAttachmentKeyItems()
                : wRegion === 'email-att-data' ? watchEmailDataAttachmentKeyItems()
                : wRegion === 'http-auth-basic' ? httpAuthBasicKeyItems()
                : wRegion === 'http-proxy' ? httpProxyKeyItems()
                : wRegion === 'pagerduty-context' ? watchPagerdutyContextKeyItems()
                : wRegion === 'slack-attachment' ? watchSlackAttachmentKeyItems()
                : wRegion === 'slack-attachment-field' ? watchSlackAttachmentFieldKeyItems()
                : [])
            : bk === 'security-role-body'
              ? (sRoleRegion === 'root' ? securityRoleBodyKeyItems()
                : sRoleRegion === 'index' ? securityRoleIndexKeyItems()
                : sRoleRegion === 'field-security' ? securityRoleFieldSecurityKeyItems()
                : sRoleRegion === 'app' ? securityRoleAppKeyItems()
                : [])
            : bk === 'security-user-body'
              ? (sUserRegion === 'root' ? securityUserBodyKeyItems()
                : sUserRegion === 'role-template' ? securityRoleTemplateKeyItems()
                : sUserRegion === 'template-script' ? scriptObjectKeyItems()
                : [])
            : bk === 'security-role-mapping-body'
              ? (rmRegion === 'root' ? securityRoleMappingBodyKeyItems()
                : rmRegion === 'rules' || rmRegion === 'rule' ? securityRoleMappingRuleKeyItems()
                : rmRegion === 'role-template' ? securityRoleTemplateKeyItems()
                : rmRegion === 'template-script' ? scriptObjectKeyItems()
                : [])
            : bk === 'security-api-key-body'
              ? (akRegion === 'root' ? securityApiKeyBodyKeyItems()
                : akRegion === 'role' ? securityRoleBodyKeyItems()
                : [])
            : bk === 'ingest-pipeline-body'
              ? (ingestRegion === 'root' ? ingestPipelineBodyKeyItems()
                : ingestRegion === 'processor' ? ingestProcessorKeyItems()
                : [])
            : bk === 'ingest-simulate-body'
              ? (simRegion === 'root' ? ingestSimulateBodyKeyItems()
                : simRegion === 'pipeline' ? ingestPipelineBodyKeyItems()
                : simRegion === 'pipeline-processor' ? ingestProcessorKeyItems()
                : simRegion === 'doc' ? ingestSimulateDocKeyItems()
                : [])
            : bk === 'enrich-policy-body'
              ? (enrichRegion === 'root' ? enrichPolicyBodyKeyItems()
                : enrichRegion === 'match' ? enrichMatchPolicyKeyItems()
                : enrichRegion === 'range' ? enrichRangePolicyKeyItems()
                : [])
            : bk === 'transform-body'
              ? (trRegion === 'root' ? transformBodyKeyItems()
                : trRegion === 'source' ? transformSourceKeyItems()
                : trRegion === 'dest' ? transformDestKeyItems()
                : trRegion === 'pivot' ? transformPivotKeyItems()
                : trRegion === 'sync' ? transformTimeKeyItems('sync')
                : trRegion === 'sync-time' ? transformTimeConfigKeyItems('sync')
                : trRegion === 'retention' ? transformTimeKeyItems('retention')
                : trRegion === 'retention-time' ? transformTimeConfigKeyItems('retention')
                : [])
            : bk === 'rollup-job-body'
              ? (ruRegion === 'root' ? rollupJobBodyKeyItems()
                : ruRegion === 'groups' ? rollupGroupsKeyItems()
                : ruRegion === 'date-group' ? rollupDateGroupKeyItems()
                : ruRegion === 'terms-group' ? rollupFieldGroupKeyItems('terms')
                : ruRegion === 'histogram-group' ? rollupFieldGroupKeyItems('histogram')
                : ruRegion === 'metric' ? rollupMetricKeyItems()
                : [])
            : bk === 'ml-datafeed-body'
              ? (mlRegion === 'root' ? mlDatafeedBodyKeyItems()
                : mlRegion === 'delayed' ? mlDelayedCheckKeyItems()
                : mlRegion === 'chunking' ? mlChunkingKeyItems()
                : mlRegion === 'indices' ? mlIndicesOptionsKeyItems()
                : [])
            : bk === 'ml-job-body'
              ? (mlJobRegion === 'root' ? mlJobBodyKeyItems()
                : mlJobRegion === 'analysis-config' ? mlAnalysisConfigKeyItems()
                : mlJobRegion === 'detector' ? mlDetectorKeyItems()
                : mlJobRegion === 'analysis-limits' ? mlAnalysisLimitsKeyItems()
                : mlJobRegion === 'data-description' ? mlDataDescriptionKeyItems()
                : [])
            : bk === 'ml-filter-body' ? (flatRootRegion === 'root' ? mlFilterBodyKeyItems() : [])
            : bk === 'ml-filter-update-body' ? (flatRootRegion === 'root' ? mlFilterUpdateBodyKeyItems() : [])
            : bk === 'ml-calendar-body' ? (flatRootRegion === 'root' ? mlCalendarBodyKeyItems() : [])
            : bk === 'ml-calendar-events-body'
              ? (mlCalEvRegion === 'root' ? mlCalendarEventsBodyKeyItems()
                : mlCalEvRegion === 'event' ? mlCalendarEventKeyItems()
                : [])
            : bk === 'graph-explore-body'
              ? (gphRegion === 'root' ? graphExploreBodyKeyItems()
                : gphRegion === 'vertex' ? graphVertexKeyItems()
                : gphRegion === 'controls' ? graphControlsKeyItems()
                : gphRegion === 'sample-diversity' ? graphSampleDiversityKeyItems()
                : gphRegion === 'hop' ? graphHopKeyItems()
                : [])
            : bk === 'ccr-follow-body' ? (flatRootRegion === 'root' ? ccrFollowBodyKeyItems() : [])
            : bk === 'ccr-auto-follow-body' ? (flatRootRegion === 'root' ? ccrAutoFollowBodyKeyItems() : [])
            : bk === 'security-api-key-grant-body'
              ? (grantRegion === 'root' ? securityApiKeyGrantBodyKeyItems()
                : grantRegion === 'api-key' ? securityApiKeyGrantKeyItems()
                : grantRegion === 'role' ? securityRoleBodyKeyItems()
                : [])
            : bk === 'security-api-key-query-body' ? (akqRegion === 'root' ? securityApiKeyQueryBodyKeyItems() : [])
            : bk === 'security-api-key-invalidate-body'
              ? (flatRootRegion === 'root' ? securityApiKeyInvalidateBodyKeyItems() : [])
            : bk === 'security-cross-cluster-api-key-body'
              ? (cckRegion === 'root' ? securityCrossClusterApiKeyBodyKeyItems()
                : cckRegion === 'access' ? securityCrossClusterAccessKeyItems()
                : cckRegion === 'entry' ? securityCrossClusterAccessEntryKeyItems()
                : [])
            : bk === 'watch-execute-body'
              ? (flatRootRegion === 'root' ? watchExecuteBodyKeyItems() : [])
            : bk === 'watch-inline-execute-body'
              ? (wieRegion === 'root' ? watchInlineExecuteBodyKeyItems()
                : wieRegion === 'watch' ? watchBodyKeyItems()
                : wieRegion === 'watch-trigger' ? watchTriggerKeyItems()
                : wieRegion === 'watch-schedule' ? watchScheduleKeyItems()
                : wieRegion === 'chain-trigger' ? watchChainTriggerKeyItems()
                : wieRegion === 'chain-trigger-container' ? watchChainNestedTriggerKeyItems()
                : wieRegion === 'watch-input' ? watchInputKeyItems()
                : wieRegion === 'search-input' ? watchSearchInputKeyItems()
                : wieRegion === 'search-request' ? watchSearchRequestKeyItems()
                : wieRegion === 'http-input' ? watchHttpInputKeyItems()
                : wieRegion === 'http-request' ? httpRequestKeyItems()
                : wieRegion === 'chain-input-container' ? watchChainInputKeyItems()
                : wieRegion === 'chain-input' ? watchInputKeyItems()
                : wieRegion === 'watch-search-body' ? searchRootKeyItems()
                : wieRegion === 'watch-condition' ? watchConditionKeyItems()
                : wieRegion === 'condition-params' ? watchConditionParamsKeyItemsAt(doc, offset)
                : wieRegion === 'array-compare-body' ? watchArrayCompareKeyItems()
                : wieRegion === 'array-compare-op' ? watchArrayCompareOpKeyItems()
                : wieRegion === 'watch-action' ? watchActionTypeKeyItems()
                : wieRegion === 'action-params' ? watchActionParamsKeyItemsAt(doc, offset)
                : wieRegion === 'action-email-body' ? watchEmailBodyKeyItems()
                : wieRegion === 'action-slack-message' ? watchSlackMessageKeyItems()
                : wieRegion === 'action-jira-fields' ? watchJiraFieldsKeyItems()
                : wieRegion === 'email-attachment' ? watchEmailAttachmentKeyItems()
                : wieRegion === 'email-att-http' ? watchEmailHttpAttachmentKeyItems()
                : wieRegion === 'email-att-reporting' ? watchEmailReportingAttachmentKeyItems()
                : wieRegion === 'email-att-data' ? watchEmailDataAttachmentKeyItems()
                : wieRegion === 'http-auth-basic' ? httpAuthBasicKeyItems()
                : wieRegion === 'http-proxy' ? httpProxyKeyItems()
                : wieRegion === 'pagerduty-context' ? watchPagerdutyContextKeyItems()
                : wieRegion === 'slack-attachment' ? watchSlackAttachmentKeyItems()
                : wieRegion === 'slack-attachment-field' ? watchSlackAttachmentFieldKeyItems()
                : [])
            : bk === 'security-privilege-body'
              ? (privRegion === 'root' ? securityPrivilegeBodyKeyItems()
                : privRegion === 'privilege' ? securityPrivilegeEntryKeyItems()
                : [])
            : bk === 'ilm-move-body'
              ? (ilmMoveRegion === 'root' ? ilmMoveBodyKeyItems()
                : ilmMoveRegion === 'step' ? ilmMoveStepKeyItems()
                : [])
            : bk === 'snapshot-clone-body'
              ? (flatRootRegion === 'root' ? snapshotCloneBodyKeyItems() : [])
            : bk === 'snapshot-mount-body'
              ? (flatRootRegion === 'root' ? snapshotMountBodyKeyItems() : [])
            : bk === 'nodes-reload-secure-settings-body'
              ? (flatRootRegion === 'root' ? nodesReloadSecureSettingsBodyKeyItems() : [])
            : bk === 'license-body'
              ? (licRegion === 'root' ? licenseBodyKeyItems()
                : licRegion === 'entry' ? licenseEntryKeyItems()
                : [])
            : bk === 'stored-script-body'
              ? (ssRegion === 'root' ? storedScriptBodyKeyItems()
                : ssRegion === 'script' ? storedScriptKeyItems()
                : [])
            : bk === 'script-execute-body'
              ? (ssRegion === 'root' ? scriptExecuteBodyKeyItems()
                : ssRegion === 'script' ? scriptObjectKeyItems()
                : [])
            : bk === 'update-body'
              ? (uRegion === 'root' ? updateBodyKeyItems()
                : uRegion === 'script' ? scriptObjectKeyItems()
                : [])
            : bk === 'rollover-body'
              ? (rRegion === 'root' ? rolloverBodyKeyItems()
                : rRegion === 'conditions' ? rolloverConditionKeyItems()
                : rRegion === 'settings' ? settingsKeyItems()
                : rRegion === 'mapping' ? (mappingFieldConfigAt(doc, offset) ? mappingFieldKeyItems() : mappingKeyItems())
                : rRegion === 'aliases' ? aliasItems()
                : [])
            : bk === 'dbq-body' ? (qwRegion === 'root' ? dbqBodyKeyItems() : [])
            : bk === 'ubq-body'
              ? (qwRegion === 'root' ? ubqBodyKeyItems()
                : qwRegion === 'script' ? scriptObjectKeyItems()
                : [])
            : bk === 'query-body' ? (qwRegion === 'root' ? queryOnlyBodyKeyItems() : [])
            : bk === 'template-search-body' ? (roRegion === 'root' ? templateSearchBodyKeyItems() : [])
            : bk === 'mget-body'
              ? (mRegion === 'root' ? mgetBodyKeyItems()
                : mRegion === 'doc' ? mgetDocKeyItems()
                : [])
            : bk === 'aliases-body'
              ? (alRegion === 'root' ? aliasesBodyKeyItems()
                : alRegion === 'action' ? aliasActionKeyItems()
                : alRegion === 'config-add' ? aliasAddConfigKeyItems()
                : alRegion === 'config-remove' ? aliasRemoveConfigKeyItems()
                : alRegion === 'config-remove-index' ? aliasRemoveIndexConfigKeyItems()
                : [])
            : bk === 'scroll-body' ? (scRegion === 'root' ? scrollBodyKeyItems() : [])
            : bk === 'clear-scroll-body' ? (scRegion === 'root' ? clearScrollBodyKeyItems() : [])
            : bk === 'termvectors-body' ? (tvRegion === 'root' ? termvectorsKeyItems() : [])
            : bk === 'mtermvectors-body'
              ? (mRegion === 'root' ? mtermvectorsBodyKeyItems()
                : mRegion === 'doc' ? mtermvectorsDocKeyItems()
                : [])
            : bk === 'field-caps-body' ? (fcRegion === 'root' ? fieldCapsBodyKeyItems() : [])
            : bk === 'terms-enum-body' ? (fcRegion === 'root' ? termsEnumBodyKeyItems() : [])
            : bk === 'rank-eval-body'
              ? (rankRegion === 'root' ? rankEvalBodyKeyItems()
                : rankRegion === 'request-item' ? rankEvalRequestKeyItems()
                : rankRegion === 'metric' ? rankEvalMetricKeyItems()
                : [])
            : bk === 'reindex-body' ? reindexBodyKeyItems(rIdxRegion)
            : bk === 'alias-body' ? aliasKeyItems()
            : bk === 'mapping' ? (mappingFieldConfigAt(doc, offset) ? mappingFieldKeyItems() : mappingKeyItems())
            : bk === 'index-body'
              ? (idxRegion === 'settings' ? settingsKeyItems()
                : idxRegion === 'mapping' ? (mappingFieldConfigAt(doc, offset) ? mappingFieldKeyItems() : mappingKeyItems())
                : idxRegion === 'aliases' ? aliasItems()
                : indexBodyKeyItems())
            : tplRegion === 'settings' ? settingsKeyItems()
            : tplRegion === 'mapping' ? mappingKeyItems()
            : tplRegion === 'aliases' ? aliasItems()
            : templateKeyItems();
          const w6Affix = commaAffixes(doc, g.strStart, end); /* 2.6.0：三档统一逗号自适应——逗号为 snippet 外字面量，tab 流程不受影响 */
          return {
            suggestions: items.map((it, i) => ({
              label: it.label,
              kind: it.snippet ? monaco.languages.CompletionItemKind.Snippet
                               : monaco.languages.CompletionItemKind.Property,
              insertText: wrapSnippet(doc, g.strStart, end, lineIndentAt(doc, g.strStart), it.insertText, w6Affix),
              ...(it.snippet ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet } : {}),
              detail: it.detail,
              range, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(it.label), /* W5-1 过滤关：pattern '"' 可匹配 */
              sortText: dslSortText(i, it.label), /* W5-1 排序关：'!' 前缀升权，组内保目录序 */
            })),
          };
        }
        /* 2.6.0 顺序重排：dslKeyGuard 先行、ctx none 闸下沉到值位档之后——
 sort/track_total_hits 值位的 dslContext 是 none（非 query 深层）/root（根键值位），
 提前拦会把值位白名单档拦死；纯函数换位对既有三档零行为差（guard 压制位依旧 []）。 */
        const guard = dslKeyGuard(doc, offset);
        /* 1439：排序元素的简写方向值（{"sort":[{"title":"|"}]}）——字段键不在值白名单，
           guard.ok 为假会落进下面的压制分支，所以必须在早退之前按上下文判定。 */
        if (guard.inStr && dslContext(doc, offset).kind === 'sort-order') {
          const cEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const csp = model.getPositionAt(guard.strStart);
          const cep = model.getPositionAt(cEnd);
          const cRange = { startLineNumber: csp.lineNumber, startColumn: csp.column, endLineNumber: cep.lineNumber, endColumn: cep.column };
          return { suggestions: ['asc', 'desc'].map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"', range: cRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v), sortText: dslSortText(i, v),
          })) };
        }
        /* 1439：terms/multi_terms 的 order 方向值（{"order":{"_count":"|"}}）——
           与 sort-order 同形态，guard 早退前按上下文判定 */
        if (guard.inStr && dslContext(doc, offset).kind === 'agg-order-dir') {
          const dEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
          const dsp = model.getPositionAt(guard.strStart);
          const dep = model.getPositionAt(dEnd);
          const dRange = { startLineNumber: dsp.lineNumber, startColumn: dsp.column, endLineNumber: dep.lineNumber, endColumn: dep.column };
          return { suggestions: ['asc', 'desc'].map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"', range: dRange, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v), sortText: dslSortText(i, v),
          })) };
        }
        if (!guard.ok) {
          /* 数组键链白名单位（_source 元素串位）——数组元素即字段名本尊（非某字段
 的值），与 dslArrayElemFieldAt 的「值位字段解析」不同轨（dslValueTiers544 把
 ('_source', null)→null 钉死，不共函数）。首元素位经 guard 白名单口、续元素位经既有
 arrayElem 口，同归此分派出 fields() 全字段候选（Value 档，range 覆盖整串 I-1 同形态）。 */
          if (guard.inStr && guard.arrayElem && guard.valueKey && DSL_ARRAY_ELEM_CHAINS.has(guard.valueKey)) {
            const cEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
            const csp = model.getPositionAt(guard.strStart);
            const cep = model.getPositionAt(cEnd);
            const cRange = { startLineNumber: csp.lineNumber, startColumn: csp.column, endLineNumber: cep.lineNumber, endColumn: cep.column };
            return { suggestions: props.dslAssist!.fields().map((f, i) => ({
              label: f.path, kind: monaco.languages.CompletionItemKind.Value,
              insertText: '"' + f.path + '"', range: cRange, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(f.path), sortText: dslSortText(i, f.path),
            })) };
          }
          /* 值位类型档（date-math/ip）——非白名单 ':' 值串位按字段类型放行静态候选。
 dslValueFieldAt 解析字段（叶子子句直挂值 / range 操作符值两形态）→ fields() 精确查表
 （aggs 撞名键查无此字段自然压制）→ DSL_VALUE_TYPE_HINTS 按类型出档；
 表外类型维持既有压制——候选只增不改。
 数组续元素位分派（arrayElem，值数组的元素串位没有「当前键」）走姊妹
 解析 dslArrayElemFieldAt（字段=数组属主键），查表先共享表再姊妹表（keyword/数值/
 boolean 形态档仅此链路消费，':' 值位 regime 540 冻结不动）；既有 ':' 值串位走
 dslValueFieldAt + 共享表原路逐字节不变。 */
          if (guard.inStr && guard.valueKey) {
            const fieldPath = guard.arrayElem
              ? dslArrayElemFieldAt(guard.valueKey, guard.parentKey ?? null)
              : dslValueFieldAt(guard.valueKey, guard.parentKey ?? null, guard.grandKey ?? null);
            const fld = fieldPath ? props.dslAssist!.fields().find(f => f.path === fieldPath) : undefined;
            const hint = fld ? (guard.arrayElem
              ? (DSL_VALUE_TYPE_HINTS[fld.type] ?? DSL_ARRAY_ELEM_TYPE_HINTS[fld.type])
              : DSL_VALUE_TYPE_HINTS[fld.type]) : undefined;
            if (hint) {
              const vEnd = scanStringEnd(doc, Math.max(0, Math.min(offset, doc.length)));
              const vsp = model.getPositionAt(guard.strStart);
              const vep = model.getPositionAt(vEnd);
              const vRange = {
                startLineNumber: vsp.lineNumber, startColumn: vsp.column,
                endLineNumber: vep.lineNumber, endColumn: vep.column,
              };
              return { suggestions: hint.values.map((v, i) => ({
                label: v, kind: monaco.languages.CompletionItemKind.Value,
                insertText: '"' + v + '"', range: vRange, command: ACCEPT_FORMAT_COMMAND,
                detail: hint.detail,
                filterText: dslFilterText(v), /* W5-1 同手法：pattern '"' 可匹配 */
                sortText: dslSortText(i, v),
              })) };
            }
          }
          /* 1439：mapping 档的 type 值位出字段类型目录（此前 Ctrl+Space 恒空）；
             search 档同名键是 7.x type 查询的文档类型名，不套字段类型表 */
          return { suggestions: [] };
        }
        /* I-1：range 覆盖闭合串——起=当前串起始（无串=光标位）。三档 insertText 均自带引号，
 接受后整串干净替换，不留 "" 残壳。
 N-1/N-2 有界右扫：仅串内（guard.inStr）才右扫闭合引号——串外裸键位（Ctrl+Space）
 无已敲引号，end=光标纯插入即合法，右扫会吞后文结构字符（}, " 等）；
 串内右扫遇 \n 即停（JSON 串不跨行）——未闭合串跨行扫到下一个引号会整行吞噬。 */
        let end = Math.max(0, Math.min(offset, doc.length));
        if (guard.inStr) {
          end = scanStringEnd(doc, end);
        }
        /* ux2 裸词左扩：串外裸词位 range 左扩到词首（敲 que 出 "query"，接受整词替换不产 que"query" 残壳——
 用户痛点②「识别不到」的另一半根因：triggerCharacters 只靠 "，裸词位 range 起点=光标位）。
 自扫 [\w.]（不依赖 monaco wordPattern——点分隔字段路径 user.na 也整段覆盖）；
 串内形态不变（strStart=串起始引号）；空词（Ctrl+Space 空位）左扩 0——N-1/N-2 回归不变。
 （串外 strStart===光标位是 dslKeyGuard L118-122 的既有语义。） */
        let startOff = guard.strStart;
        if (!guard.inStr) {
          while (startOff > 0 && /[\w.]/.test(doc[startOff - 1])) startOff--;
        }
        const sp = model.getPositionAt(startOff);
        const ep = model.getPositionAt(end);
        const range = {
          startLineNumber: sp.lineNumber, startColumn: sp.column,
          endLineNumber: ep.lineNumber, endColumn: ep.column,
        };
        /* 2.6.0 值位白名单档（spec ）：order → asc/desc，track_total_hits → true/false，
 field → fields() 真实字段名（search/agg 通吃，exists 顺带受益）。
 insertText 自带引号（range 覆盖串壳，I-1 同形态）——裸值换串壳会产 "order": desc 非法 JSON；
 不接 commaAffixes（值是叶节点，无兄弟键逗号场景）。 */
        if (guard.valueKey) {
          const vk = guard.valueKey;
          const vals: string[] = vk === 'order' ? ['asc', 'desc']
            : vk === 'track_total_hits' ? ['true', 'false']
            : vk === 'field' ? props.dslAssist!.fields().map(f => f.path) : []; /* 524+1：组件名键钉空——search 档 "analyzer": 值位不出字段候选 */
          return { suggestions: vals.map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"', range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v), /* W5-1 同手法：pattern '"' 可匹配 */
            sortText: dslSortText(i, v),
          })) };
        }
        const ctx = dslContext(doc, offset);
        if (ctx.kind === 'none') return { suggestions: [] };
        if (ctx.kind === 'agg-name') {
          /* 2.6.0：aggs 容器键位——实例名+聚合类型一步骨架（choice 占位直选类型，spec ） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: [{
            label: 'my_agg', kind: monaco.languages.CompletionItemKind.Snippet,
            detail: '聚合实例（命名 + 类型一步落位）',
            insertText: wrapSnippet(doc, startOff, end, indent, '"${1:my_agg}": {\n  "${2|terms,avg,sum,min,max,stats,cardinality,date_histogram,date_range,top_hits|}": {\n    ${0}\n  }\n}', affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText('my_agg'),
            sortText: dslSortText(0, 'my_agg'),
          }] };
        }
        if (ctx.kind === 'agg-type') {
          /* 2.6.0：实例值对象键位——聚合类型骨架目录 + aggs 嵌套键 + 逗号自适应 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(AGG_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, snip.text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          })) };
        }
        if (ctx.kind === 'sort-order') {
          /* 1439：sort 简写方向值——只给 asc/desc，不掺文档词 */
          const dirs = ['asc', 'desc'];
          return { suggestions: dirs.map((v, i) => ({
            label: v, kind: monaco.languages.CompletionItemKind.Value,
            insertText: '"' + v + '"', range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(v), sortText: dslSortText(i, v),
          })) };
        }
        if (ctx.kind === 'sort-opt-key') {
          /* 1439：sort 字段配置键（order/mode/missing/unmapped_type/nested） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          const opts: Array<{ key: string; insert: string; detail: string }> = [
            { key: 'order', insert: '"order": "${1|asc,desc|}"', detail: '方向' },
            { key: 'mode', insert: '"mode": "${1|min,max,sum,avg,median|}"', detail: '多值字段取哪个值排序' },
            { key: 'missing', insert: '"missing": "${1:_last}"', detail: '缺值放最前/最后' },
            { key: 'unmapped_type', insert: '"unmapped_type": "${1:keyword}"', detail: '未映射字段按此类型忽略' },
            { key: 'nested', insert: '"nested": { "path": "${1:path}" }', detail: '按嵌套路径排序' },
            /* 1439：官方 sort 字段参数补两员（日期显示格式 / 数值类型声明） */
            { key: 'format', insert: '"format": "${1:yyyy-MM-dd}"', detail: '日期显示格式' },
            { key: 'numeric_type', insert: '"numeric_type": "${1|long,double,date_nanos|}"', detail: '按此数值类型排序' },
          ];
          return { suggestions: opts.map((o, i) => ({
            label: o.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: o.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, o.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(o.key), sortText: dslSortText(i, o.key),
          })) };
        }
        if (ctx.kind === 'field-key') {
          /* 1439：字段名作键（highlight.fields）——字段来自 mapping，键值给空配置对象 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          const fields = props.dslAssist?.fields?.() ?? [];
          return { suggestions: fields.map((f, i) => ({
            label: f.path, kind: monaco.languages.CompletionItemKind.Property,
            detail: f.type || '字段',
            insertText: wrapSnippet(doc, startOff, end, indent, '"' + f.path + '": {}', affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(f.path),
            sortText: dslSortText(i, f.path),
          })) };
        }
        if (ctx.kind === 'query-body-key') {
          /* 1439：子句体内的键位——结构键（must/path/query…）+ 参数表并集（与构建器同源） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: queryBodyKeys(ctx.op).map((it, i) => ({
            label: it.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: it.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, it.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.key),
            sortText: dslSortText(i, it.key),
          })) };
        }
        if (ctx.kind === 'clause-field-key') {
          /* 1439：字段配置对象（match.<field>.{query/operator}、fuzzy.<field>.{value/…}） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: clauseValueKeys(ctx.op).map((it, i) => ({
            label: it.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: it.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, it.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.key),
            sortText: dslSortText(i, it.key),
          })) };
        }
        if (ctx.kind === 'retriever-body-key') {
          /* 1439：检索器变体体键位（standard.query / knn.field+query_vector / rrf.retrievers…） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: retrieverBodyKeys(ctx.op).map((it, i) => ({
            label: it.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: it.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, it.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.key),
            sortText: dslSortText(i, it.key),
          })) };
        }
        if (ctx.kind === 'suggester-body-key') {
          /* 1439：建议器体键位（term/phrase/completion 的 field/text/前缀/上下文…） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: suggesterBodyKeys(ctx.op).map((it, i) => ({
            label: it.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: it.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, it.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.key),
            sortText: dslSortText(i, it.key),
          })) };
        }
        if (ctx.kind === 'agg-order-key') {
          /* 1439：terms/multi_terms 的 order 对象键位——三个内置排序依据（键+方向一步落位）；
             terms 另有同实例下的单值数值子聚合名（ES 允许按子聚合排序） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          const opts: Array<{ key: string; insert: string; detail: string }> = [
            ...ctx.subAggs.map(a => ({
              key: a.name,
              insert: JSON.stringify(a.name) + ': "${1|desc,asc|}"',
              detail: '按子聚合 ' + a.type + ' 排序',
            })),
            { key: '_count', insert: '"_count": "${1|desc,asc|}"', detail: '按桶内文档数' },
            { key: '_key', insert: '"_key": "${1|asc,desc|}"', detail: '按键值' },
            { key: '_key_as_string', insert: '"_key_as_string": "${1|asc,desc|}"', detail: '按键的字符串形式' },
          ];
          return { suggestions: opts.map((o, i) => ({
            label: o.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: o.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, o.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(o.key), sortText: dslSortText(i, o.key),
          })) };
        }
        if (ctx.kind === 'agg-body-key') {
          /* 1439：聚合体内部键位——字段键/参数键/嵌套 aggs（与构建器、GenericParams 同源） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: aggBodyKeys(ctx.op).map((it, i) => ({
            label: it.key, kind: monaco.languages.CompletionItemKind.Property,
            detail: it.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, it.insert, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(it.key),
            sortText: dslSortText(i, it.key),
          })) };
        }
        if (ctx.kind === 'suggester-type') {
          /* 1439：suggest.<名> {} 内——3 种建议器类型骨架 + 与类型同层的 text/prefix
             （官方把输入文本放在类型键旁边；只给类型会让人以为 text 在类型体里） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          const items: any[] = Object.entries(SUGGESTER_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, snip.text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          }));
          const shared = [
            { key: 'text', insert: '"text": "${1:query}"', detail: '输入文本（与类型键同层）' },
            { key: 'prefix', insert: '"prefix": "${1:prefix}"', detail: '前缀输入（优先于 text）' },
          ];
          for (const s of shared) {
            items.push({
              label: s.key, kind: monaco.languages.CompletionItemKind.Property,
              detail: s.detail,
              insertText: wrapSnippet(doc, startOff, end, indent, s.insert, affix),
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(s.key),
              sortText: dslSortText(Object.keys(SUGGESTER_SNIPPETS).length + shared.indexOf(s), s.key),
            });
          }
          return { suggestions: items };
        }
        if (ctx.kind === 'retriever-type') {
          /* 1439：retriever 体内——9 种检索器变体骨架（此前只有根键骨架里写死的 standard） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(RETRIEVER_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snip.detail,
            insertText: wrapSnippet(doc, startOff, end, indent, snip.text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          })) };
        }
        if (ctx.kind === 'root') {
          /* 2.6.0：八键全 snippet 骨架（spec ）+ commaAffixes 逗号自适应（。
 逗号拼在 snippet 文本外（字面量），tab 占位流程不受影响。 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: ROOT_KEYS.map((k, i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wrapSnippet(doc, startOff, end, indent, ROOT_KEY_SNIPPETS[k].text, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: ROOT_KEY_SNIPPETS[k].detail, range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), /* W5-1 过滤关：pattern '"' 可匹配 */
            sortText: dslSortText(i, k), /* W5-1 排序关：组内保 ROOT_KEYS 序 */
          })) };
        }
        if (ctx.kind === 'query-type') {
          /* 缩进适配：snippet 后续行叠加当前行前导空白（深层嵌套位不再塌缩）；
 2.6.0：commaAffixes 逗号自适应（spec ）——逗号为 snippet 外字面量，tab 流程同 root 档 */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(QUERY_SNIPPETS).map(([k, snip], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: wrapSnippet(doc, startOff, end, indent, snip, affix),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: querySnippetDetail(k), /* 1133：63 条英文键旁给中文语义，列表可扫读 */
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k), /* W5-1 过滤关：同上 */
            sortText: dslSortText(i, k), /* W5-1 排序关：同上，组内保 QUERY_SNIPPETS 目录序 */
          })) };
        }
        if (ctx.kind === 'range-op') {
          /* 2.6.0：range 操作符位（spec ）——gte/gt/lt/lte 带日期占位 + 逗号自适应。
 字符串拼接占位符（不用模板串，避 TS 模板里 ${ 转义事故） */
          const indent = lineIndentAt(doc, startOff);
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: Object.entries(RANGE_OPS).map(([k, ph], i) => ({
            label: k, kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: affix.prefix + reindentSnippet('"' + k + '": "${1:' + ph + '}"', indent) + affix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(k),
            sortText: dslSortText(i, k),
          })) };
        }
        if (ctx.kind === 'exists-key') {
          /* 2.6.0：exists 键位钉死 "field" 单候选（语义纠错） */
          const affix = commaAffixes(doc, startOff, end);
          return { suggestions: [{
            label: 'field', kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: affix.prefix + '"field": "${1:fieldname}"' + affix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText('field'),
            sortText: dslSortText(0, 'field'),
          }] };
        }
        /* 2.6.0：字段名带值骨架（spec ）+ commaAffixes 逗号自适应——逗号为 snippet 外字面量，tab 流程同 root 档。
 值形态统一字符串占位：terms 数组/range 对象需用户手改——子句值形态各异，按 clause 全定制收益低，防误导优先。
 esc：f.path 是首个进 snippet 语法的动态数据，$ / } / \ 会被解析器变形，转义闭环（mapping 字段名罕见但防御零成本）
 类型感知排序——ctx.clause 即该子句值位同级 op 键，命中类型的
 字段排前（range→date/数值族、term→keyword、match→text/keyword…），候选集不变仅 sortText 分档；
 doc 档 field 值位无算子上下文，维持 fields() 序（orderFieldsByTypeForOp 空 prio 零增量同口径）。 */
        const fieldAffix = commaAffixes(doc, startOff, end);
        const escSnippet = (s: string) => s.replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/}/g, '\\}');
        /* 数组元素对象键位（键链白名单=sort，dslContext array-elem-key 档）——
 排序字段位出字段候选，插入形态对齐 ROOT_KEY_SNIPPETS.sort 骨架（字段键 + order 值骨架）；
 逗号自适应与 root 档同手法。白名单外数组（must/filter 元素对象键位）不进本档，
 既有 query-type 出档零变化。 */
        if (ctx.kind === 'array-elem-key') {
          /* 1439：根层 fields 数组的元素对象是 {field, format}，不是 sort 的「字段+order」 */
          if (ctx.owner === 'fields') {
            const indent = lineIndentAt(doc, startOff);
            const elemKeys = [
              { key: 'field', insert: '"field": "${1:field}"', detail: '字段名' },
              { key: 'format', insert: '"format": "${1:0.0}"', detail: '值格式（数值/日期）' },
            ];
            return { suggestions: elemKeys.map((k, i) => ({
              label: k.key, kind: monaco.languages.CompletionItemKind.Property,
              detail: k.detail,
              insertText: wrapSnippet(doc, startOff, end, indent, k.insert, fieldAffix),
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range, command: ACCEPT_FORMAT_COMMAND,
              filterText: dslFilterText(k.key),
              sortText: dslSortText(i, k.key),
            })) };
          }
          return { suggestions: props.dslAssist!.fields().map((f, i) => ({
            label: f.path, kind: monaco.languages.CompletionItemKind.Snippet,
            detail: f.type,
            insertText: fieldAffix.prefix + '"' + escSnippet(f.path) + '": { "order": "${1|desc,asc|}" }' + fieldAffix.suffix,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range, command: ACCEPT_FORMAT_COMMAND,
            filterText: dslFilterText(f.path), /* W5-1 过滤关：pattern '"' 可匹配 */
            sortText: dslSortText(i, f.path),
          })) };
        }
        /* 收口消费共享 orderFieldsByTypeForOp（本地 orderFieldsByType 原样平移，
 行为逐字节等值——原始序不做亲和族展开，与 orderFieldsByClauseOp 的语义分界见共享侧注释）。
 其余上下文档（agg-order-dir 等）必须已在上方各自返回——这里只兜字段档。 */
        if (ctx.kind !== 'field') return { suggestions: [] };
        const opFields = orderFieldsByTypeForOp(props.dslAssist!.fields(), ctx.clause);
        return { suggestions: opFields.map((f, i) => ({
          label: f.path, kind: monaco.languages.CompletionItemKind.Snippet,
          detail: f.type,
          insertText: fieldAffix.prefix + '"' + escSnippet(f.path) + '": "${1:value}"' + fieldAffix.suffix,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range, command: ACCEPT_FORMAT_COMMAND,
          filterText: dslFilterText(f.path), /* W5-1 过滤关：同上 */
          sortText: dslSortText(i, f.path), /* W5-1 排序关：'!' 升权组内单调；组内序=类型感知置顶序（无倾向=fields() 序） */
        })) };
    }
  }
});

watch(() => props.modelValue, (v) => {
  if (editor && editor.getValue() !== v) editor.setValue(v ?? '');
});
watch(() => props.readonly, (v) => editor?.updateOptions({ readOnly: v }));
/* 字号响应缺角修复——字号档约定时只建了挂载初值通道，prop 变更
 后 Monaco 实例无感知（档位点击渲染字号不变，探针当年只断言 seg UI 在场）。
 readOnly watch 同款范式补一行：档位点击即刻生效，偏好还原路径（挂载初值）不受影响。 */
watch(() => props.fontSize, (v) => editor?.updateOptions({ fontSize: v }));
/* P0-2a：language prop 运行时跟随——DevTools body 在 _bulk 档切 ndjson
 （多根 NDJSON 不再被 json worker 全线误报语法红线，高亮保留、校验移除）。
 同 model 换语言（setModelLanguage），不重建编辑器：value/undo/滚动/布局全保留。 */
watch(() => props.language, (v) => {
  const model = editor?.getModel();
  if (model && v) monaco.editor.setModelLanguage(model, v);
});
/* 跟随全局深/浅主题切换（setTheme 是全局级，所有实例一起切） */
watch(() => appStore.effectiveTheme, () => monaco.editor.setTheme(themeName()));

/* w70:全站统一 Ctrl+Shift+F 格式化 —— 不逐页加按钮,一次注册所有 Monaco 生效 */
function registerFormatKeybind(ed: typeof editor) {
  if (!ed || typeof ed.addCommand !== 'function') return; // happy-dom mock 无 addCommand
  ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
    ed.getAction('editor.action.formatDocument')?.run();
  });
}

function format() {
  editor?.getAction('editor.action.formatDocument')?.run();
}
function insertSnippet(text: string) {
  if (!editor) return;
  const sel = editor.getSelection();
  if (sel) editor.executeEdits('snippet', [{ range: sel, text }]);
  editor.focus();
}

/* 行内判定徽标通道——glyph margin 三色小点 + hover 人话（deltaDecorations 增量替换） */
let chipDecorations: string[] = [];
function setGutterChips(chips: { line: number; kind: string; hover: string }[]) {
  if (!editor) return;
  editor.updateOptions({ glyphMargin: chips.length > 0 });
  chipDecorations = editor.deltaDecorations(chipDecorations, chips.map(c => ({
    range: new monaco.Range(c.line, 1, c.line, 1),
    options: {
      glyphMarginClassName: 'insight-chip insight-chip-' + String(c.kind).toLowerCase(),
      glyphMarginHoverMessage: { value: c.hover },
    },
  })));
}

/* W2-2：反模式提示 → monaco marker（黄线 + hover 建议）。
 owner 必须与 JSON 语法诊断区分开：本组件已配 jsonDefaults.setDiagnosticsOptions
 ({ validate: true })，语法 marker 的 owner 是 'json'，共用 owner 会把语法报错整片清掉。
 定位策略：用 finding.anchor 的带引号键名在文本里 findMatches，取第 nth 个命中。
 定位不到就不产 marker 并回报给调用方，由调用方降级为行内提示条——不静默丢弃。
 入参用泛型而非写死的结构体：本组件只需要 message/suggestion/severity/anchor/nth 这几个字段，
 但 unplaced 要原样退还给调用方（DslQueryView 存的是完整 Finding[]），
 写死结构体会让返回值退化成子集类型、赋不回 ref<Finding[]>。
 severity 档：warning→黄线、hint→灰点、error→红线（dslLint terms-scalar 结构错等必错形态）——
 DslQueryView 的 info→hint 降级映射喂进来仍是合法档位。 */
const LINT_OWNER = 'es-dsl-lint';
/* P0-2：泛型约束补可选 rule——dslLint Finding 全量在场，零 rule 的旧调用方
 （analyze525 stub 形态）零破坏；code 后缀与注册表 finding.rule 供 es-dsl-lint quick fix 分派。 */
function setMarkers<T extends {
  message: string; suggestion: string; severity: 'warning' | 'hint' | 'error'; anchor: string; nth: number; rule?: string;
}>(findings: T[]) {
  const model = editor?.getModel();
  if (!model) return { placed: 0, unplaced: findings.slice() };
  const markers: monaco.editor.IMarkerData[] = [];
  const unplaced: T[] = [];
  /* P0-2：定位→finding 注册表随 setMarkers 全量替换（重复 lint 不叠加），
 es-dsl-lint quick fix provider 按 marker 行列反查（monacoJsonQuickFix 承载）。 */
  const registry: DslLintMarkerEntry[] = [];
  for (const f of findings) {
    const hits = model.findMatches('"' + f.anchor + '"', false, false, true, null, false);
    const hit = hits[f.nth] ?? hits[0];
    if (!hit) { unplaced.push(f); continue; }
    markers.push({
      severity: f.severity === 'hint' ? monaco.MarkerSeverity.Hint
        : f.severity === 'error' ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
      message: f.message + '\n建议：' + f.suggestion,
      startLineNumber: hit.range.startLineNumber,
      startColumn: hit.range.startColumn,
      endLineNumber: hit.range.endLineNumber,
      endColumn: hit.range.endColumn,
      code: { value: LINT_OWNER + ':' + (f.rule ?? ''), target: model.uri },
    });
    registry.push({
      startLineNumber: hit.range.startLineNumber,
      startColumn: hit.range.startColumn,
      endLineNumber: hit.range.endLineNumber,
      endColumn: hit.range.endColumn,
      finding: f,
    });
  }
  monaco.editor.setModelMarkers(model, LINT_OWNER, markers);
  recordDslLintMarkers(model.uri?.toString?.() ?? '', registry);
  return { placed: markers.length, unplaced };
}

/* 行号直射 Warning marker——synonyms 规则行这类「行号已知」的 lint 源，
 findMatches('"anchor"') 锚点定位反而是错位源（规则行非 JSON、无锚点键名）。行号直射：
 marker 覆盖整行（起 1 列、止=行尾列），severity 恒 Warning。owner 由调用方给
 （'es-syn-lint' 等，多 lint 源同编辑器互不清，且与 JSON 语法诊断 owner 'json' 分离）；
 owners 记账随组件卸载清空（model 已随 editor.dispose 退役，显式清一遍防同 model 复用残留）。 */
const lineMarkerOwners = new Set<string>();
function setLineMarkers(
  markers: { line: number; message: string }[], owner: string,
  severity: 'warning' | 'error' = 'warning',
) {
  const model = editor?.getModel();
  if (!model) return;
  lineMarkerOwners.add(owner);
  /* 1178：行号必须先钳到模型范围——marker 的行号是**远端**给的（ES 报错里的
     `line 4:9`、或 lint 期间刚被删掉的那一行），越过 getLineCount() 时 Monaco
     直接抛 `Illegal value for lineNumber`，异常冒到 Vue 渲染层 → 整页白屏
     「页面渲染异常」。revealPosition 早就钳了，这里漏了。
     取不到行数（精简/桩 model）时不钳，避免把合法行号压成 1。 */
  const maxLine = typeof model.getLineCount === 'function' ? model.getLineCount() : 0;
  monaco.editor.setModelMarkers(model, owner, markers.map(m => {
    const raw = Math.trunc(m.line) || 1;
    const ln = maxLine > 0 ? Math.max(1, Math.min(raw, maxLine)) : Math.max(1, raw);
    return {
      severity: severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: m.message,
      startLineNumber: ln,
      startColumn: 1,
      endLineNumber: ln,
      endColumn: typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(ln) : 1,
    };
  }));
}

/* 1109：行列直射定位（SQL 执行错误/静态 lint 行号跳转）——钳到模型合法范围，
 滚到视口中心并落光标，聚焦后可直接改。行号可能来自报错文本与当前稿不一致的
 场景（执行期间改稿/删行），钳位保证不抛错。 */
function revealPosition(line: number, column: number) {
  const model = editor?.getModel();
  if (!editor || !model) return;
  const ln = Math.max(1, Math.min(Math.trunc(line) || 1, model.getLineCount()));
  const col = Math.max(1, Math.min(Math.trunc(column) || 1, model.getLineMaxColumn(ln)));
  editor.revealPositionInCenter({ lineNumber: ln, column: col });
  editor.setPosition({ lineNumber: ln, column: col });
  editor.focus();
}

onBeforeUnmount(() => {
  hostRORef?.disconnect();
  /* 逐语言 provider 全量 dispose（json+ndjson 注册面随组件卸载退役） */
  for (const d of dslAssistDisposables) d.dispose();
  dslAssistDisposables = [];
  /* setLineMarkers 各 owner 随卸载清空（setModelMarkers 全局注册面，不随 dispose 自动撤） */
  const m = editor?.getModel?.() ?? null;
  if (m) for (const o of lineMarkerOwners) monaco.editor.setModelMarkers(m, o, []);
  lineMarkerOwners.clear();
  /* P0-2：es-dsl-lint 注册表随卸载清理（marker 面随 model dispose 退役，
 注册表是模块级 Map 必须显式删；setModelMarkers 清 marker 属 524 既有契约——es-dsl-lint
 不在卸载清空列，本件只清注册表不动 marker 调用面） */
  if (m) clearDslLintMarkers(m.uri?.toString?.() ?? '');
  editor?.dispose();
});

defineExpose({ format, insertSnippet, setGutterChips, setMarkers, setLineMarkers, revealPosition, getEditor: () => editor });
</script>

<style scoped>
.monaco-host { width: 100%; border: 1px solid var(--line); border-radius: var(--r-m); overflow: hidden; }
</style>

<style>
/* 徽标三色（全局：monaco 装饰在组件 scope 外渲染） */
.insight-chip { border-radius: 50%; width: 8px !important; height: 8px !important; margin: var(--sp-1h) 0 0 var(--sp-1h); }
.insight-chip-dynamic { background: var(--ok); }
.insight-chip-static { background: var(--warn); }
.insight-chip-illegal { background: var(--err); }
</style>
