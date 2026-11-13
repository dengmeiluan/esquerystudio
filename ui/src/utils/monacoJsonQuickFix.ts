/**
 * ux2 ：JSON 语言级 quick fix（全仓首个 CodeActionProvider，用户痛点③「No quick fixes available」根治）。
 *
 * 只处理 JSON LS 自产 marker（getModelMarkers { owner:'json' } 过滤——es-dsl-lint owner 天然隔开，
 * 其行内建议通道不动）：
 * - 528 Property keys must be doublequoted →「键加双引号」（幂等剥壳：range 已含半个引号时先剥再裹，
 * 不产 "" 双引号；isPreferred 浮到 quick fix 列表首。2.6.0 剥壳扩单引号 'match → "match"——
 * 仅键位；值位单引号不做：json LS 报 "Value expected"，marker range 不覆盖串本体，无法安全转换）
 * - 519 Trailing comma →「删除尾逗号」
 * - 2.6.0 514 Expected comma →「补逗号」（错误码出处：vscode-json-languageservice ErrorCode 枚举——
 * CommaExpected=514；513=PropertyExpected 是前导逗号/双逗号场景，绝不可误配补逗号 action；
 * 不设 isPreferred，与 519 同口径防误顶首选）
 * - 513 PropertyExpected →「双逗号删一」（只处理 marker 行含字面 ',,' 的安全子集——
 * 有 ',,' 证据才出 action；前导逗号等其余 513 场景零 action，「不得误配补逗号」裁定不越界）
 * - 513 补前导逗号删除分支（marker 所在行 trimStart 以 ',' 开头 → 删该逗号——
 * 删除不是补逗号，与 519 同属删除通道，旧裁定不越界；两证据都不在仍零 action）
 * code 联合类型归一（string | { value }）；code 缺席时 message 兜底（跨 monaco 版本 code 漂移防御）。
 * 行相交过滤：provideCodeActions 的 range=当前选区/光标行，不相交的 marker 不出 action。
 *
 * 幂等：模块级 flag——MonacoEditor onMounted 每实例都会调，注册仅一次（provider 是语言级，非实例级）。
 *
 * P0-2：es-dsl-lint（DSL 静态体检）quick fix 通道，与既有 owner='json' 四码链路
 * 并存零触碰（独立注册函数 ensureDslLintQuickFixes——既有 spec 的「json 恰注册一次」计数契约
 * 不破；MonacoEditor onMounted 两函数各调各的，幂等同款）：
 * - MonacoEditor.setMarkers 落 es-dsl-lint marker 时补 code:{value:'es-dsl-lint:'+规则名}，
 * 并随写模块级注册表（Map<modelUri, 定位→finding>，本文件承载——MonacoEditor 组件多实例、
 * provider 是语言级单例，注册表必须活在与 provider 同生命周期的地方）；
 * - setMarkers 每次全量替换该 uri 的注册表条目（重复 lint 不叠加），实例卸载 clearDslLintMarkers；
 * - provideCodeActions 按 marker 行列查注册表反查 finding，规则→fix 白名单九条：
 * script-inline（旧键 "inline" → "source"）/ sort-order-typo·range-op-typo（坏值/坏操作符
 * 按消息内「最接近：」改名）/ bool-key-typo·root-key-typo·settings-key·mapping-key（marker
 * 即坏键本体，整段改名）/ terms-scalar（标量 → [标量]）/ body-value-type·settings-value
 * （剥引号成数——仅值串内是合法数字才出，防越修越坏）；
 * 再补四条：unknown-field·sort-unknown-field（marker 即坏字段本体，证据闸校验后
 * 按「最接近：」改名）/ agg-text-field（坏字段追加 .keyword）/ mapping-type（锚点 'type'
 * 键，坏类型值锚后右扫改名）；
 * agg-interval-key（日历 vs 固定二义）与 match-all / deep-paging 等建议类零 action。
 * - 再补三条：text-sort（消息拆坏字段+证据闸，整段改名加 .keyword）/
 * text-term（消息不含字段名，反向证据闸=marker 覆盖带引号串且非 .keyword 结尾）/
 * multi-match-fields（fields 锚后右扫 + 标量包数组，terms-scalar 同款）。
 * - 再补三条（残面清零）：agg-size-default（terms 体收尾 '}' 前插 "size": 20——
 * 字符串感知配平扫描定位收尾，空体不带前导逗号）/ collapse-structure（消息拆坏值+
 * 值位证据闸，标量子集包对象 {"v": {}}；数组形态零 action）/ highlight-fields（fields
 * 标量子集包数组，multi-match-fields 同款；「缺 fields」分支无修复价值零 action）。
 * - 再补三条：root-bare-clause（裸子句逐键包 query 外壳——「整 body 重写不可修」
 * 旧裁定修订为逐键 wrap 已可修：子句键前零宽插 "query": { + 复用 balancedCloseOf/
 * objectInsertBeforeClose 在子句值收尾补 }；证据闸双条=marker 覆盖消息内子句键本体
 * + root 无 "query" 键（首层键扫，防产出重复 query 键）；值非对象零 action）/
 * text-range（range 打 text 字段追加 .keyword，text-term 同款反向证据闸）/
 * agg-interval-key（calendar_interval/fixed_interval 双键互斥分支出删键双 action
 * 二选一，删值含尾随逗号或回吞前导逗号——「日历 vs 固定二义不越界」旧裁定收窄为
 * 仅互斥分支可修，废弃 interval / 双缺分支维持零 action）。
 * - 再补两处：agg-interval-key 废弃 interval 分支（「不越界」裁定对废弃单键场景
 * 的残留修订， root-bare-clause 修订同款先例——消息拆废弃键名「使用已废弃的
 * "x" 键」右扫整段改名 calendar_interval，script-inline 同款形态；键名拆不出/字面
 * 不在场零 action）/ 513 前导逗号删除（见上头注，头注：删除不是补逗号）。
 * - 再补两处：json 通道白名单新增「Comments are not allowed in JSON」→「删除注释」
 * （JSONC 手写高频；只删除不改写——行内注释删 marker 区间本体、该行除注释外只剩空白时
 * 连同整行与行尾换行一并删（末行无换行删到行尾）、跨行块注释只删区间本体）/
 * agg-type-typo 接键改名 action（bool-key-typo 同形态并入同分支，marker 即坏类型键
 * 本体，nearestOf 消息拆「最接近：」候选整段改名）。
 * - 件①：上一条 561 comments quickfix 复活——MonacoEditor
 * setDiagnosticsOptions({ allowComments:true, comments:'ignore' }) 下 JSON worker 永不产
 * 注释 marker，该分支实为死代码（无 lint 源）。json provider 末尾追加了
 * appendSelfScanCommentActions：对当前模型自扫注释范围（jsonc.findCommentRanges 字符串
 * 感知扫描单源）出「删除注释」，不强依赖 diagnostics；561 marker 分支保留原样（真有
 * marker 时同区间去重不重复出），既有四码与 DSL 白名单逻辑零扰动。
 * - 再补一处：should-in-filter（dslLint 规则③ 的 quickfix 兜底）——
 * should 同层 bool 体收尾零宽插 "minimum_should_match": 1（agg-size-default 定位件
 * 形态平移、方向相反：锚="should" 键本体，其值是数组，收尾定位向左扫 bool 体开口；
 * 收尾配平与空体判定抽出共用件 insertBeforeObjectClose）。
 * 不可自动修（规则→fix 评估结论）：prefix-wildcard（坏值藏在字段值两层形态下，
 * 修复点不可靠）/ range-type·date-range（坏值无法成数成日期，越修越坏）/
 * keyword-range（换字段类型类建议；text-range 557 起追加 .keyword 已可修）/
 * deep-paging·huge-size·match-all·missing-filter·search-after-no-sort（改查询意图
 * 类建议）/ query-structure（query 值标量/数组无键可锚；root-bare-clause 557 起
 * 逐键 wrap 已可修，从本移出）/ nested-path（path 值需 mapping ctx）/
 * ndjson-pair（NDJSON 行级告警非 JSON body）/ agg-interval-key 双缺分支（日历 vs
 * 固定二义；互斥分支 557 起删键双 action、废弃 interval 分支 558 起改名可修，
 * 均从本移出）。
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
/* 件①：字符串感知注释扫描单源（jsonc 同源抽出）——json provider 自扫当前
 模型注释范围出「删除注释」quickfix。 */
import { findCommentRanges } from './jsonc';

let registered = false;

export function ensureJsonQuickFixes(): void {
  if (registered) return;
  registered = true;
  monaco.languages.registerCodeActionProvider('json', {
    provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range): monaco.languages.CodeActionList {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri, owner: 'json' });
      const actions: monaco.languages.CodeAction[] = [];
      for (const m of markers) {
        if (!intersects(m, range)) continue;
        const code = markerCode(m);
        if (code === '528' || /doublequoted/i.test(m.message)) {
          /* 脱壳后必须转义内部的双引号再包——`{'a"b': 1}` 直接拼会得到 `"a"b"`
            （非法 JSON，修复反而把稿子改坏）。反斜杠也要转义，否则 `\"` 变 `\\"`。 */
          const raw = model.getValueInRange(m).replace(/^["']+|["']+$/g, '');
          if (!raw) continue;
          const quoted = '"' + raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
          actions.push({
            title: '键加双引号',
            kind: 'quickfix',
            isPreferred: true,
            diagnostics: [m],
            edit: {
              edits: [{
                resource: model.uri,
                versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                textEdit: { range: m, text: quoted },
              }],
            },
          });
        } else if (code === '519' || /trailing comma/i.test(m.message)) {
          actions.push({
            title: '删除尾逗号',
            kind: 'quickfix',
            diagnostics: [m],
            edit: {
              edits: [{
                resource: model.uri,
                versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                textEdit: { range: m, text: '' },
              }],
            },
          });
        } else if (code === '514' || /expected comma/i.test(m.message)) {
          /* 2.6.0 缺逗号修复：marker 标在「下一个键」处，修复点=上一非空行行尾零宽插 ','。
 不设 isPreferred（与 519 同口径，防误顶首选）。 */
          const fixLine = prevNonBlankLine(model, m.startLineNumber);
          if (fixLine < 1) continue;
          const prevText = model.getLineContent(fixLine);
          /* 1432：上一行已经以逗号结尾时不能补——否则补出 ',,',
             把本来只是「marker 未刷新」的合法 JSON 改成语法错误。
             这是真实退化路径：用户刚补完逗号、marker 还没重建时再点一次。 */
          if (/,\s*$/.test(prevText)) continue;
          const col = prevText.length + 1;
          actions.push({
            title: '补逗号',
            kind: 'quickfix',
            diagnostics: [m],
            edit: {
              edits: [{
                resource: model.uri,
                versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                textEdit: {
                  range: { startLineNumber: fixLine, startColumn: col, endLineNumber: fixLine, endColumn: col },
                  text: ',',
                },
              }],
            },
          });
        } else if (code === '513' || /property expected/i.test(m.message)) {
          /* 513 只处理「,, 双逗号」安全子集——marker 行文本含字面 ',,' 才出
 「双逗号删一」（把 ',,' 换成 ','）。
 补前导逗号删除分支：marker 所在行 trimStart() 以 ',' 开头 → 删该前导
 逗号。头注：这是删除不是补逗号（与 519 同属删除通道），「513 不得误配
 补逗号」旧裁定不越界；',,' 在场仍走双逗号子集（既有优先级零漂移），两证据
 都不在（其余 513 场景无可靠修复点）维持零 action。 */
          const line = model.getLineContent(m.startLineNumber);
          /* 1432：此前是 line.indexOf(',,')——两个真坑：
             ① 命中字符串字面量内部的 ',,'
                （`{"a":"x,,y",,}`），把逗号删进字符串里，**改坏用户数据**；
             ② 行内有多处 ',,` 时取第一处，而 marker 指的是出错的第二处。
             改为：只认**字符串外**的 ',,', 并取距 marker 列最近的那个。 */
          const cc = nearestDoubleCommaOutsideString(line, m.startColumn);
          const leadWs = line.length - line.trimStart().length;
          if (cc >= 0) {
            actions.push({
              title: '双逗号删一',
              kind: 'quickfix',
              diagnostics: [m],
              edit: {
                edits: [{
                  resource: model.uri,
                  versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                  textEdit: {
                    range: { startLineNumber: m.startLineNumber, startColumn: cc + 1, endLineNumber: m.startLineNumber, endColumn: cc + 3 },
                    text: ',',
                  },
                }],
              },
            });
          } else if (line.trimStart().startsWith(',')) {
            /* 修复点=行首首个非空白字符（该前导逗号本身），整字符删除 */
            actions.push({
              title: '删除前导逗号',
              kind: 'quickfix',
              diagnostics: [m],
              edit: {
                edits: [{
                  resource: model.uri,
                  versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                  textEdit: {
                    range: { startLineNumber: m.startLineNumber, startColumn: leadWs + 1, endLineNumber: m.startLineNumber, endColumn: leadWs + 2 },
                    text: '',
                  },
                }],
              },
            });
          }
        } else if (/comments are not allowed/i.test(m.message)) {
          /* JSONC 手写高频（注释在严格 JSON 非法）。安全修复只删除不改写：
 行内注释删 marker 区间本体；该行除注释外只剩空白时连同整行与行尾换行一并删
 （末行无换行只删到行尾，不留可吞换行）；跨行块注释区间跨行，仅删区间本体。 */
          const isMulti = m.endLineNumber > m.startLineNumber;
          const cLine = model.getLineContent(m.startLineNumber);
          const blankAround = !isMulti && !cLine.slice(0, m.startColumn - 1).trim() && !cLine.slice(m.endColumn - 1).trim();
          const lastLine = typeof model.getLineCount === 'function' ? model.getLineCount() : m.startLineNumber;
          const range: monaco.IRange = blankAround
            ? (m.startLineNumber < lastLine
                ? { startLineNumber: m.startLineNumber, startColumn: 1, endLineNumber: m.startLineNumber + 1, endColumn: 1 }
                : { startLineNumber: m.startLineNumber, startColumn: 1, endLineNumber: m.startLineNumber, endColumn: cLine.length + 1 })
            : { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn };
          actions.push({
            title: '删除注释',
            kind: 'quickfix',
            diagnostics: [m],
            edit: {
              edits: [{
                resource: model.uri,
                versionId: undefined, /* 不校验模型版本（monaco 0.52 IWorkspaceTextEdit 必设字段） */
                textEdit: { range, text: '' },
              }],
            },
          });
        }
      }
      /* 件①：注释 quickfix 复活——自扫当前模型注释范围出「删除注释」。
 背景：MonacoEditor setDiagnosticsOptions({ allowComments:true, comments:'ignore' })
 下 JSON worker 永不产注释 marker，上方 561 分支无 lint 源是死代码；自扫通道不依赖
 diagnostics，allowComments 手写注释（JSONC 调试常态）也有修复可点。
 行相交过滤与 marker 同口径（选区/光标行不相交不出）；与 561 分支同区间去重；
 既有四码+DSL 白名单逻辑零扰动。 */
      appendSelfScanCommentActions(model, range, markers, actions);
      return { actions, dispose: () => {} };
    },
  });
}

/* ═══ 件①：注释自扫 quickfix（复活 561 死代码通道）═══ */

/** 注释区间的删除编辑区（与 561 marker 分支同一套安全删除语义，本处对自扫区间独立实现
 * 不回流改既有分支）：独占整行的行内注释连同整行与行尾换行一并删（末行无换行删到行尾，
 * 不留可吞换行）；其余（行内尾注释/跨行块注释）只删区间本体。 */
function commentDeleteRange(model: monaco.editor.ITextModel, r: monaco.IRange): monaco.IRange {
  const isMulti = r.endLineNumber > r.startLineNumber;
  const cLine = model.getLineContent(r.startLineNumber);
  const blankAround = !isMulti && !cLine.slice(0, r.startColumn - 1).trim() && !cLine.slice(r.endColumn - 1).trim();
  const lastLine = typeof model.getLineCount === 'function' ? model.getLineCount() : r.startLineNumber;
  return blankAround
    ? (r.startLineNumber < lastLine
        ? { startLineNumber: r.startLineNumber, startColumn: 1, endLineNumber: r.startLineNumber + 1, endColumn: 1 }
        : { startLineNumber: r.startLineNumber, startColumn: 1, endLineNumber: r.startLineNumber, endColumn: cLine.length + 1 })
    : r;
}

/** 自扫注释出「删除注释」：全文文本→findCommentRanges→逐区间（① 与光标行相交才出；
 * ② 已有 comments marker 与该注释区间相交即 561 分支在场，去重不重复出——worker 的
 * comments marker 定位可能与注释真起点差一列，起点相等判定过脆，相交才稳；
 * ③ 编辑区走 commentDeleteRange 安全删除语义）。modelFullText 三件套缺席（既有单行
 * fake/极简形态）静默零 action（宁缺勿错）。 */
function appendSelfScanCommentActions(model: monaco.editor.ITextModel, range: monaco.Range, markers: monaco.editor.IMarker[], actions: monaco.languages.CodeAction[]): void {
  const full = modelFullText(model);
  if (full == null) return;
  const commentRanges = findCommentRanges(full);
  for (const cr of commentRanges) {
    const sp = offsetToPos(full, cr.start);
    const ep = offsetToPos(full, cr.end);
    const ir: monaco.IRange = { startLineNumber: sp.line, startColumn: sp.col, endLineNumber: ep.line, endColumn: ep.col };
    if (ir.startLineNumber > range.endLineNumber || ir.endLineNumber < range.startLineNumber) continue;
    const covered = markers.some(m =>
      /comments are not allowed/i.test(m.message) && rangesOverlap(m, ir));
    if (covered) continue;
    actions.push({
      title: '删除注释',
      kind: 'quickfix',
      edit: {
        edits: [{
          resource: model.uri,
          versionId: undefined, /* 不校验模型版本（既有 json 四码同口径） */
          textEdit: { range: commentDeleteRange(model, ir), text: '' },
        }],
      },
    });
  }
}

/** 两区间（1 基行列）是否相交：跨行重叠必相交；同行重叠处列区间须相接
 * （endColumn 排他语义，a 前 ⇔ a 末 ≤ b 首）。 */
function rangesOverlap(a: monaco.IRange, b: monaco.IRange): boolean {
  const aBefore = a.endLineNumber < b.startLineNumber
    || (a.endLineNumber === b.startLineNumber && a.endColumn <= b.startColumn);
  const bBefore = b.endLineNumber < a.startLineNumber
    || (b.endLineNumber === a.startLineNumber && b.endColumn <= a.startColumn);
  return !aBefore && !bBefore;
}

/** IMarker.code 联合类型归一：string | { value: string } | undefined → string */
function markerCode(m: monaco.editor.IMarker): string {
  const c = m.code;
  if (c == null) return '';
  return typeof c === 'string' ? c : c.value;
}

/** 行相交过滤（provideCodeActions range=当前选区/光标行） */
function intersects(m: monaco.editor.IMarker, r: monaco.IRange): boolean {
  return m.startLineNumber <= r.endLineNumber && m.endLineNumber >= r.startLineNumber;
}

/** 上一非空行号（1 基；全空白以上 → 0） */
function prevNonBlankLine(model: monaco.editor.ITextModel, fromLine: number): number {
  for (let ln = fromLine - 1; ln >= 1; ln--) {
    if (model.getLineContent(ln).trim()) return ln;
  }
  return 0;
}

/**
 * 1432：找一行里「字符串外部」的 `,,` 中**离 marker 列最近**的那个，返回其 0 基下标（找不到 -1）。
 *
 * 为什么不能直接 line.indexOf(',,')：
 *  · `{"a":"x,,y",,}` —— 第一个 `,,` 在字符串里，删了会**改坏数据**；
 *  · 同一行出现两处真语法错误时，marker 指向的那一处才是用户看到的错误点。
 *
 * 扫引号状态时按 JSON 规则处理 `\"` 转义（连续反斜杠需成对判断）。
 */
export function nearestDoubleCommaOutsideString(line: string, markerCol: number): number {
  const hits: number[] = [];
  let inStr = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === '\\' && inStr) { i++; continue; }   /* 跳过被转义的字符 */
    if (ch === '"') { inStr = !inStr; continue; }
    if (!inStr && ch === ',' && line[i + 1] === ',') hits.push(i);
  }
  if (!hits.length) return -1;
  /* markerCol 是 1 基列号；取距离最近的一处（并列时取靠前的） */
  const target = Math.max(0, markerCol - 1);
  let best = hits[0]; let bestD = Math.abs(hits[0] - target);
  for (const h of hits) {
    const d = Math.abs(h - target);
    if (d < bestD) { best = h; bestD = d; }
  }
  return best;
}

/* ═════════ P0-2：es-dsl-lint 注册表 + quick fix ═════════ */

/** 注册表条目：marker 定位（1 基行列）+ 产该 marker 的 finding（rule 驱动 fix 分派，
 * message 供「最接近：」候选拆取）。 */
export interface DslLintMarkerEntry {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  finding: { rule?: string; message: string; suggestion: string; anchor: string; nth?: number; severity?: string };
}

/** 模块级注册表：modelUri → 该 model 当前 es-dsl-lint marker 的定位→finding 清单。
 * MonacoEditor.setMarkers 全量替换（重复 lint 不叠加），实例卸载删除。 */
const dslLintRegistry = new Map<string, DslLintMarkerEntry[]>();

/** setMarkers 随写：整 uri 条目全量替换（空 findings = 清空该 uri 条目）。 */
export function recordDslLintMarkers(uriKey: string, entries: DslLintMarkerEntry[]): void {
  dslLintRegistry.set(uriKey, entries);
}

/** 实例卸载清理。 */
export function clearDslLintMarkers(uriKey: string): void {
  dslLintRegistry.delete(uriKey);
}

/** 按 marker 起始行列反查 finding（无条目/未命中 → null）。 */
function findDslLintEntry(uriKey: string, sl: number, sc: number): DslLintMarkerEntry | null {
  const list = dslLintRegistry.get(uriKey);
  if (!list) return null;
  return list.find(e => e.startLineNumber === sl && e.startColumn === sc) ?? null;
}

/** marker.code 后缀兜底（注册表缺席时仍能拿到规则名）：'es-dsl-lint:rule' → 'rule' */
function markerRuleSuffix(m: monaco.editor.IMarker): string {
  const c = m.code;
  const s = c == null ? '' : typeof c === 'string' ? c : c.value;
  return s.startsWith('es-dsl-lint:') ? s.slice('es-dsl-lint:'.length) : '';
}

/** 消息内「最接近：xxx）」候选拆取（bool/root/settings/mapping 键改名、sort 方向、
 * range 操作符五类改名 fix 的纠正值单一来源——dslLint 文案契约）。 */
function nearestOf(message: string): string | null {
  const m = /最接近：(.+?)）/.exec(message);
  return m ? m[1] : null;
}

let dslLintRegistered = false;

/** es-dsl-lint quick fix 注册（模块级幂等，MonacoEditor onMounted 调）。 */
export function ensureDslLintQuickFixes(): void {
  if (dslLintRegistered) return;
  dslLintRegistered = true;
  monaco.languages.registerCodeActionProvider('json', {
    provideCodeActions(model: monaco.editor.ITextModel, range: monaco.Range): monaco.languages.CodeActionList {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri, owner: 'es-dsl-lint' });
      const actions: monaco.languages.CodeAction[] = [];
      for (const m of markers) {
        if (!intersects(m, range)) continue;
        const entry = findDslLintEntry(model.uri.toString(), m.startLineNumber, m.startColumn);
        const rule = entry?.finding.rule ?? markerRuleSuffix(m);
        /* 返回值放宽为单/多 action（agg-interval-key 互斥分支出删键双 action） */
        const r = dslLintAction(model, m, rule, entry?.finding.message ?? m.message);
        if (r) for (const a of Array.isArray(r) ? r : [r]) actions.push(a);
      }
      return { actions, dispose: () => {} };
    },
  });
}

/** marker 起点之后首条字面命中（改名类 fix 的修复点定位：坏操作符/坏方向值/旧键
 * 都在锚点 key 之后出现，右界=文档尾；找不到=无证据不出 action）。 */
function firstMatchAfter(model: monaco.editor.ITextModel, m: monaco.editor.IMarker, needle: string): monaco.IRange | null {
  if (typeof model.findMatches !== 'function') return null;
  const lastLine = typeof model.getLineCount === 'function' ? model.getLineCount() : m.startLineNumber;
  const scope: monaco.IRange = {
    startLineNumber: m.startLineNumber, startColumn: m.startColumn,
    endLineNumber: lastLine,
    endColumn: typeof model.getLineMaxColumn === 'function' ? model.getLineMaxColumn(lastLine) : 1,
  };
  const hits = model.findMatches(needle, scope, false, true, null, false, 1);
  return hits[0]?.range ?? null;
}

/** marker 之后的「键值冒号 + 标量」提取（同行为主：terms-scalar 包数组 / 剥引号成数
 * 只处理值与键同行的主流排版，跨行值无证据不出 action）。 */
function valueAfterMarker(model: monaco.editor.ITextModel, m: monaco.IRange): { text: string; range: monaco.IRange } | null {
  if (typeof model.getLineContent !== 'function') return null;
  const rest = model.getLineContent(m.endLineNumber).slice(m.endColumn - 1);
  const vm = /^(\s*:\s*)("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(rest);
  if (!vm) return null;
  const startCol = m.endColumn + vm[1].length;
  return {
    text: vm[2],
    range: { startLineNumber: m.endLineNumber, startColumn: startCol, endLineNumber: m.endLineNumber, endColumn: startCol + vm[2].length },
  };
}

/* ═══ ：对象体收尾定位（agg-size-default 补 size 的修复点）═══ */

/** 全文文本拼装（逐行 getLineContent，getLineMaxColumn=行长+1 → 行内容长度）。 */
function modelFullText(model: monaco.editor.ITextModel): string | null {
  if (typeof model.getLineContent !== 'function' || typeof model.getLineCount !== 'function'
      || typeof model.getLineMaxColumn !== 'function') return null;
  const last = model.getLineCount();
  const lines: string[] = [];
  for (let ln = 1; ln <= last; ln++) lines.push(model.getLineContent(ln));
  return lines.join('\n');
}

/** 1 基行列 → 全文 offset（与 modelFullText 的 join('\n') 同一换算）。 */
function posToOffset(full: string, line: number, col: number): number {
  let off = 0;
  for (let ln = 1; ln < line; ln++) {
    const nl = full.indexOf('\n', off);
    if (nl < 0) break;
    off = nl + 1;
  }
  return off + col - 1;
}

/** 全文 offset → 1 基行列（同上换算）。 */
function offsetToPos(full: string, offset: number): { line: number; col: number } {
  let line = 1, off = 0;
  for (;;) {
    const nl = full.indexOf('\n', off);
    if (nl < 0 || nl >= offset) break;
    line++; off = nl + 1;
  }
  return { line, col: offset - off + 1 };
}

/** 从 openIdx（'{'）起字符串感知配平扫描，返回收尾 '}' 的 offset（无收尾 -1）。
 * 混合栈简化：'{'/'[' 同深 '}'/']' 同浅——畸形文本（'[' 配 '}'）JSON.parse 就拦在 lint 管线外，不进此处。 */
function balancedCloseOf(full: string, openIdx: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = openIdx; i < full.length; i++) {
    const ch = full[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** marker 锚（如 "terms"）之后对象体的收尾 '}' 零宽插入位。规则判定域保证锚值是对象；
 * 锚后无 '{' / 配平不闭合 → null（宁缺勿错）。
 * 收尾配平与空体判定抽出共用件 insertBeforeObjectClose——agg-size-default
 * （锚后右找 '{'）与 should-in-filter（锚前左找 '{'）各管开口定位，形态对称。 */
function insertBeforeObjectClose(full: string, openIdx: number): { line: number; col: number; bodyEmpty: boolean } | null {
  const close = balancedCloseOf(full, openIdx);
  if (close < 0) return null;
  const p = offsetToPos(full, close);
  return { line: p.line, col: p.col, bodyEmpty: /^\s*$/.test(full.slice(openIdx + 1, close)) };
}

function objectInsertBeforeClose(model: monaco.editor.ITextModel, m: monaco.IRange): { insert: monaco.IRange; bodyEmpty: boolean } | null {
  const full = modelFullText(model);
  if (full == null) return null;
  const open = full.indexOf('{', posToOffset(full, m.endLineNumber, m.endColumn));
  if (open < 0) return null;
  const tail = insertBeforeObjectClose(full, open);
  if (!tail) return null;
  return {
    insert: { startLineNumber: tail.line, startColumn: tail.col, endLineNumber: tail.line, endColumn: tail.col },
    bodyEmpty: tail.bodyEmpty,
  };
}

/* ═══ ：root-bare-clause 包壳 / agg-interval-key 删键的文本扫描件 ═══ */

/** 从开引号位扫到收引号后一位（转义感知；未闭合 -1）。 */
function skipString(full: string, openIdx: number): number {
  let esc = false;
  for (let i = openIdx + 1; i < full.length; i++) {
    const ch = full[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') return i + 1;
  }
  return -1;
}

/** 标量键值对的删除区间：从 key 开引号位扫过 "key": scalar（串/数/布尔/null——
 * interval 值恒串），尾随逗号并入；对象内最后一对（尾无逗号）回吞前导逗号（其间只容
 * 空白）；解析不动 → null（宁缺勿错）。agg-interval-key 删键用。 */
function scalarPairDeleteRange(full: string, keyStart: number): { start: number; end: number } | null {
  if (full[keyStart] !== '"') return null;
  const afterKey = skipString(full, keyStart);
  if (afterKey < 0) return null;
  let i = afterKey;
  while (i < full.length && /\s/.test(full[i]!)) i++;
  if (full[i] !== ':') return null;
  i++;
  while (i < full.length && /\s/.test(full[i]!)) i++;
  let end: number;
  if (full[i] === '"') {
    end = skipString(full, i);
    if (end < 0) return null;
  } else {
    const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(full.slice(i));
    if (!m) return null;
    end = i + m[0].length;
  }
  let start = keyStart;
  let j = end;
  while (j < full.length && /\s/.test(full[j]!)) j++;
  if (full[j] === ',') {
    /* 尾随逗号并入，逗号后的空白/换行缩进一并吞（pretty 排版删后不留悬挂缩进） */
    end = j + 1;
    while (end < full.length && /\s/.test(full[end]!)) end++;
  } else {
    /* 尾无逗号（对象最后一对）：回吞前导逗号；单键对象无前导逗号不吞 */
    let b = keyStart - 1;
    while (b >= 0 && /\s/.test(full[b]!)) b--;
    if (b >= 0 && full[b] === ',') start = b;
  }
  return { start, end };
}

/** 全文首层键名清单（首个 '{' 的 depth-1 键，字符串感知配平；无首 '{' → 空清单）。
 * root-bare-clause 证据闸「root 无 query」用——root 已有 query 键时 wrap 会产出
 * 重复 query 键（ES 取后者丢前者），必须零 action。畸形文本 JSON.parse 已拦在 lint
 * 管线外，不设防。 */
function rootKeysOf(full: string): string[] {
  const open = full.indexOf('{');
  if (open < 0) return [];
  const keys: string[] = [];
  let depth = 0, inStr = false, esc = false, keyStart = -1;
  for (let i = open; i < full.length; i++) {
    const ch = full[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') {
        inStr = false;
        if (depth === 1 && keyStart >= 0) {
          /* 键 vs 值：串后首个非空白是 ':' 才是键 */
          let j = i + 1;
          while (j < full.length && /\s/.test(full[j]!)) j++;
          if (full[j] === ':') keys.push(full.slice(keyStart + 1, i));
          keyStart = -1;
        }
      }
      continue;
    }
    if (ch === '"') { inStr = true; if (depth === 1) keyStart = i; continue; }
    if (ch === '{' || ch === '[') { depth++; if (depth === 1) keyStart = -1; continue; }
    if (ch === '}' || ch === ']') { depth--; if (depth === 0) break; continue; }
  }
  return keys;
}

/** 规则→fix 白名单分派。白名单外（match-all / deep-paging 等建议类）恒 null=零
 * action；改名类候选拆不出「最接近：」同样不出（宁缺勿错）。
 * 返回值放宽为单/多 action（agg-interval-key 互斥分支出删键双 action）。 */
function dslLintAction(model: monaco.editor.ITextModel, m: monaco.editor.IMarker, rule: string, message: string): monaco.languages.CodeAction | monaco.languages.CodeAction[] | null {
  const mk = (r: monaco.IRange, text: string, title: string): monaco.languages.CodeAction => ({
    title,
    kind: 'quickfix',
    diagnostics: [m],
    edit: {
      edits: [{
        resource: model.uri,
        versionId: undefined, /* 不校验模型版本（既有 json 四码同口径） */
        textEdit: { range: r, text },
      }],
    },
  });
  if (rule === 'script-inline') {
    /* script 旧键改名：坏键 "inline" 在锚点 "script" 之后（JSON 对象文本序），右扫首条命中 */
    const hit = firstMatchAfter(model, m, '"inline"');
    if (!hit) return null;
    return mk(hit, '"source"', 'inline 改为 source');
  }
  if (rule === 'terms-scalar') {
    const v = valueAfterMarker(model, m);
    if (!v) return null;
    return mk(v.range, '[' + v.text + ']', '标量包成数组 [' + v.text + ']');
  }
  if (rule === 'body-value-type' || rule === 'settings-value') {
    /* 剥引号成数：仅值是引号串且串内是合法数字才出（"abc"/布尔等无法成数，零 action 防越修越坏） */
    const v = valueAfterMarker(model, m);
    if (!v || !v.text.startsWith('"') || !v.text.endsWith('"')) return null;
    const inner = v.text.slice(1, -1).trim();
    if (inner === '' || !Number.isFinite(Number(inner))) return null;
    return mk(v.range, inner, '剥引号改为数字 ' + inner);
  }
  if (rule === 'sort-order-typo') {
    const near = nearestOf(message);
    const bad = /方向「(.+?)」/.exec(message)?.[1];
    if (!near || !bad) return null;
    const hit = firstMatchAfter(model, m, '"' + bad + '"');
    if (!hit) return null;
    return mk(hit, '"' + near + '"', '方向改为「' + near + '」');
  }
  if (rule === 'range-op-typo') {
    const near = nearestOf(message);
    const op = /操作符「(.+?)」/.exec(message)?.[1];
    if (!near || !op) return null;
    const hit = firstMatchAfter(model, m, '"' + op + '"');
    if (!hit) return null;
    return mk(hit, '"' + near + '"', '操作符改为「' + near + '」');
  }
  if (rule === 'bool-key-typo' || rule === 'root-key-typo' || rule === 'settings-key' || rule === 'mapping-key'
      || rule === 'agg-type-typo' || rule === 'body-key-typo' || rule === 'agg-field-key-typo') {
    /* marker 覆盖的就是坏键本体（anchor=拼错键），整段改名。
 并入 agg-type-typo（bool-key-typo 同消息形态，nearestOf 拆「最接近：」候选） */
    const near = nearestOf(message);
    if (!near) return null;
    return mk(m, '"' + near + '"', '键改为「' + near + '」');
  }
  if (rule === 'unknown-field' || rule === 'sort-unknown-field') {
    /* 坏字段改名。marker 覆盖的就是坏字段本体（anchor=字段名，setMarkers 带引号定位），
 消息拆坏字段名做证据闸 + 「最接近：」候选整段改名（bool-key-typo 同款形态）。
 证据闸防误配：marker 文本 ≠ "坏字段" 即零 action（注册表缺席/构造错位宁缺勿错） */
    const bad = /字段「(.+?)」不在当前索引/.exec(message)?.[1];
    const near = nearestOf(message);
    if (!bad || !near) return null;
    if (model.getValueInRange(m) !== '"' + bad + '"') return null;
    return mk(m, '"' + near + '"', '字段改为「' + near + '」');
  }
  if (rule === 'agg-text-field') {
    /* text 字段聚合改 .keyword 子字段（消息建议文案同源）。marker 覆盖坏字段本体，
 整段替换为 "字段.keyword"；坏字段名拆不出（消息形态漂移）或 marker 错位即零 action */
    const bad = /text 字段 (\S+?)：/.exec(message)?.[1];
    if (!bad) return null;
    if (model.getValueInRange(m) !== '"' + bad + '"') return null;
    return mk(m, '"' + bad + '.keyword"', '字段改为「' + bad + '.keyword」');
  }
  if (rule === 'mapping-type') {
    /* 坏类型值改名。anchor 钉 'type' 键名，坏值在其后（JSON 文本序），右扫首条命中
 （sort-order-typo 同款形态）；候选拆不出 / 文档无坏值即零 action */
    const near = nearestOf(message);
    const bad = /类型「(.+?)」疑似/.exec(message)?.[1];
    if (!near || !bad) return null;
    const hit = firstMatchAfter(model, m, '"' + bad + '"');
    if (!hit) return null;
    return mk(hit, '"' + near + '"', '类型改为「' + near + '」');
  }
  if (rule === 'text-sort') {
    /* sort 打 text 字段 → 排序字段追加 .keyword 子字段（消息拆坏字段做证据闸 +
 整段改名，agg-text-field 同款形态）。marker 文本 ≠ "坏字段" 即零 action（宁缺勿错） */
    const bad = /sort 打在 text 字段 (\S+?)：/.exec(message)?.[1];
    if (!bad) return null;
    if (model.getValueInRange(m) !== '"' + bad + '"') return null;
    return mk(m, '"' + bad + '.keyword"', '字段改为「' + bad + '.keyword」');
  }
  if (rule === 'text-term') {
    /* text 字段 term/terms/wildcard → 字段追加 .keyword 子字段。消息不含字段名，
 反向证据闸：marker 覆盖文本本身须是带引号字符串字面量且不以 .keyword 结尾——
 弱闸宁缺勿错（非串 / 已带 .keyword 零 action，quickFixTextTiers547 B 段钉死） */
    const inner = /^"([^"]+)"$/.exec(model.getValueInRange(m))?.[1];
    if (!inner || inner.endsWith('.keyword')) return null;
    return mk(m, '"' + inner + '.keyword"', '字段改为「' + inner + '.keyword」');
  }
  if (rule === 'multi-match-fields') {
    /* multi_match fields 标量包数组（terms-scalar 同款）。anchor=multi_match 键本体，
 fields 键在其后（JSON 文本序）右扫定位，再按「键值冒号+标量」提取（valueAfterMarker
 同形态）；fields 键不在场（缺 fields 分支）/值非标量（数组、对象形态）→ 零 action */
    const fKey = firstMatchAfter(model, m, '"fields"');
    if (!fKey) return null;
    const v = valueAfterMarker(model, fKey);
    if (!v) return null;
    return mk(v.range, '[' + v.text + ']', '标量包成数组 [' + v.text + ']');
  }
  if (rule === 'should-in-filter') {
    /* filter/must_not 语境纯 should 补 "minimum_should_match": 1（should
 成为硬性匹配条件，dslLint 规则 ③ 的 quickfix 兜底面）。
 修复点=should 所在 bool 体收尾 '}' 前零宽插入（agg-size-default 定位件形态平移，
 方向相反：锚是 "should" 键本体、其值是数组，锚后首个 '{' 是数组元素对象——须向左
 找 bool 体开口。判定域=bool 仅含 should 单键（dslLint bk.every(x => x === 'should')），
 故 marker 起点左扫首个非空白必是 bool 体 '{'）。marker 非 "should" 本体（534 B 段
 {"anchor": {}} 负向形态）/ 左扫不达 '{' / 配平不闭合 → 零 action（宁缺勿错）。
 空体 {} 不带前导逗号（agg-size-default 同款双分支，形态对称）。 */
    if (model.getValueInRange(m) !== '"should"') return null;
    const full = modelFullText(model);
    if (full == null) return null;
    let open = posToOffset(full, m.startLineNumber, m.startColumn) - 1;
    while (open >= 0 && /\s/.test(full[open]!)) open--;
    if (open < 0 || full[open] !== '{') return null;
    const tail = insertBeforeObjectClose(full, open);
    if (!tail) return null;
    const text = tail.bodyEmpty ? '"minimum_should_match": 1' : ', "minimum_should_match": 1';
    return mk(
      { startLineNumber: tail.line, startColumn: tail.col, endLineNumber: tail.line, endColumn: tail.col },
      text,
      '补 "minimum_should_match": 1（filter 语境 should 硬性生效）',
    );
  }
  if (rule === 'agg-size-default') {
    /* terms 桶补 "size": 20（dslLint 判定域=terms 体是对象且 size 缺失）。
 修复点=terms 体收尾 '}' 前零宽插入（字符串感知配平扫描定位）；marker 非 "terms"
 本体（534 B 段 {"anchor": {}} 负向形态）/体不闭合 → 零 action（宁缺勿错）。
 空体 {} 不带前导逗号。20 与构建器/值建议链路的 terms size 同档。 */
    if (model.getValueInRange(m) !== '"terms"') return null;
    const tail = objectInsertBeforeClose(model, m);
    if (!tail) return null;
    const text = tail.bodyEmpty ? '"size": 20' : ', "size": 20';
    return mk(tail.insert, text, '补 "size": 20（默认 10 桶截断）');
  }
  if (rule === 'collapse-structure') {
    /* collapse 标量子集包对象（"v" → {"v": {}}）。消息拆坏值做证据闸 +
 valueAfterMarker 值位校验（collapse 键后标量串与消息一致才出）；数组形态
 （消息=「收到数组」）/对象形态不进判定域 → 零 action */
    const bad = /收到标量「(.+?)」/.exec(message)?.[1];
    if (!bad) return null;
    const v = valueAfterMarker(model, m);
    if (!v || v.text !== '"' + bad + '"') return null;
    return mk(v.range, '{"' + bad + '": {}}', '改为对象 {"' + bad + '": {}}');
  }
  if (rule === 'highlight-fields') {
    /* highlight fields 标量子集包数组（multi-match-fields 同款形态）。
 「缺 fields」分支（534 B 段负向锁形态）无修复价值（补空 fields=零高亮）零 action；
 标量分支按 fields 键右扫 + 值位标量提取。 */
    if (!/收到标量「.+?」/.test(message)) return null;
    const fKey = firstMatchAfter(model, m, '"fields"');
    if (!fKey) return null;
    const v = valueAfterMarker(model, fKey);
    if (!v) return null;
    return mk(v.range, '[' + v.text + ']', '标量包成数组 [' + v.text + ']');
  }
  if (rule === 'root-bare-clause') {
    /* 裸子句逐键包 query 外壳（「整 body 重写不可修」旧裁定修订——wrap 只动
 两处零宽点，body 原文零重写）。证据闸：① 消息拆子句键名 + marker 文本 === "键"
 （注册表错位宁缺勿错，534 B 段 {"anchor": {}} 形态拦在①）；② root 无 "query"
 键（rootKeysOf 首层键扫——已有 query 再 wrap 必产重复 query 键）；③ 锚后紧邻
 `: {`（子句值对象形态，objectInsertBeforeClose 从锚后找首个 '{'，跨过非值文本
 会错收尾）。修复=两笔编辑：键前零宽插 '"query": {' + 子句值收尾补 '}'。 */
    const key = /子句「(.+?)」裸在根层/.exec(message)?.[1];
    if (!key) return null;
    if (model.getValueInRange(m) !== '"' + key + '"') return null;
    const full = modelFullText(model);
    if (full == null) return null;
    if (rootKeysOf(full).includes('query')) return null;
    if (!/^\s*:\s*\{/.test(full.slice(posToOffset(full, m.endLineNumber, m.endColumn)))) return null;
    const tail = objectInsertBeforeClose(model, m);
    if (!tail) return null;
    return {
      title: '包 query 外壳 {"query": {…}}',
      kind: 'quickfix',
      diagnostics: [m],
      edit: {
        edits: [
          {
            resource: model.uri,
            versionId: undefined,
            textEdit: { range: { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.startLineNumber, endColumn: m.startColumn }, text: '"query": {' },
          },
          {
            resource: model.uri,
            versionId: undefined,
            textEdit: { range: tail.insert, text: '}' },
          },
        ],
      },
    };
  }
  if (rule === 'text-range') {
    /* range 打 text 字段 → 字段追加 .keyword 子字段（.keyword 后 range 在
 词项级精确值上做字典序比较，语义至少自洽）。消息不含可锚字段名，text-term 同款
 反向证据闸：marker 覆盖文本须是带引号字符串字面量且不以 .keyword 结尾——弱闸
 宁缺勿错（非串 / 已带 .keyword 零 action）。 */
    const inner = /^"([^"]+)"$/.exec(model.getValueInRange(m))?.[1];
    if (!inner || inner.endsWith('.keyword')) return null;
    return mk(m, '"' + inner + '.keyword"', '字段改为「' + inner + '.keyword」');
  }
  if (rule === 'agg-interval-key') {
    /* 双键互斥分支出删键双 action（日历/固定语义二选一，删哪个由用户定）。
 证据闸：① marker 覆盖 "date_histogram" 本体（534 B 段 {"anchor": {}} 形态拦在①）；
 ② 消息含「互斥」；③ 两键在锚后都在场且各自能扫出标量对删除区间（含尾随逗号或回吞
 前导逗号——删后 JSON 必须仍合法）。 */
    if (model.getValueInRange(m) !== '"date_histogram"') return null;
    if (/互斥/.test(message)) {
      const full = modelFullText(model);
      if (full == null) return null;
      const fromOff = posToOffset(full, m.endLineNumber, m.endColumn);
      const out: monaco.languages.CodeAction[] = [];
      for (const key of ['calendar_interval', 'fixed_interval'] as const) {
        const at = full.indexOf('"' + key + '"', fromOff);
        if (at < 0) return null;
        const span = scalarPairDeleteRange(full, at);
        if (!span) return null;
        const sp = offsetToPos(full, span.start);
        const ep = offsetToPos(full, span.end);
        const keep = key === 'calendar_interval' ? 'fixed_interval' : 'calendar_interval';
        out.push(mk(
          { startLineNumber: sp.line, startColumn: sp.col, endLineNumber: ep.line, endColumn: ep.col },
          '',
          '删 "' + key + '"（保留 ' + keep + '）',
        ));
      }
      return out;
    }
    /* 废弃 interval 分支修订出改名 action（ root-bare-clause「不可修」
 修订同款先例）。lint 消息拆废弃键名（「使用已废弃的 "x" 键」文案契约）做证据闸，
 右扫 '"x"' 字面整段改名 calendar_interval——日历语义是 suggestion 文案的首选侧，
 单键改名比双键二选一的互斥分支更保守（script-inline 同款形态）。键名拆不出
 （消息形态漂移）或字面不在场（注册表/文档错位）→ 零 action 宁缺勿错；
 双缺分支拆不出键名，维持零 action（收窄面不再扩）。 */
    const badKey = /使用已废弃的 "([^"]+)" 键/.exec(message)?.[1];
    if (!badKey) return null;
    const hit = firstMatchAfter(model, m, '"' + badKey + '"');
    if (!hit) return null;
    return mk(hit, '"calendar_interval"', badKey + ' 改为 calendar_interval');
  }
  return null;
}
