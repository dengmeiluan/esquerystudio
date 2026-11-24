<template>
  <div class="li" ref="rootEl">
    <input
      ref="inputEl"
      class="li-inp mono"
      :value="modelValue"
      :placeholder="placeholder || ''"
      spellcheck="false"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="open && items[cursor] ? itemId(cursor) : undefined"
      @input="onInput"
      @keydown="onInputKey"
      @keyup="onKeyUp"
      @click="onCursorMove"
      @focus="onFocusSelectPlaceholder"
    />

    <!-- 语义高亮轮：轻量语法检查提示条（升级双档：硬伤 error 红档/软提示 warn 黄档，
 档色随最重档；渲染面与文案拼接口径不变）。此前段级解析的错误形态（未闭合引号→phrase
 段不出层、尾随 AND/OR/NOT→op 段只出运算符候选）都无显式纠错反馈，用户只能执行后才被 ES 拒。
 放输入框正下方而非补全弹层 hint 区：两种错误形态下弹层多半是关的，hint 区永远看不见。
 零阻塞：不关弹层、不改输入、不拦 Enter——执行与否仍归宿主 @enter 契约 -->
    <div v-if="syntaxIssues.length" class="li-syntax" :class="{ err: syntaxIssues.some(i => i.level === 'error') }" role="status">
      <AlertTriangle :size="11" />
      <span>语法检查：{{ syntaxIssues.map(i => i.msg).join('；') }}</span>
    </div>

    <Teleport :to="teleportTo" :disabled="inplace">
      <!-- 弹层默认 Teleport 在 body 下：mousedown 需 .prevent.stop——不抢输入焦点（契约⑦），
 且 document 层 onDocDown 不会先关面板导致 click 选项丢失；
 to="false" 时就地渲染在 .li 根内（通用约定 8 容器边界载体，同 FieldPicker） -->
      <transition name="pop">
        <div v-if="open" class="li-pop float-pop" :class="{ inplace }" :style="popStyle" @mousedown.prevent.stop>
        <div v-if="hint === 'no-index'" class="li-hint">先在上方选择索引，才能补全</div>
        <div v-else-if="hint === 'loading'" class="li-hint">正在加载 {{ index }} 的字段清单…</div>
        <div v-else-if="hint === 'err'" class="li-hint">字段清单加载失败：{{ loadErr }}（仍可手输）<button class="btn ghost sm" @click="reload">重试</button></div>
        <div v-else-if="hint === 'empty'" class="li-hint">该索引没有可选字段（仍可手输）</div>
        <div v-else-if="hint === 'no-match'" class="li-hint">没有匹配「{{ seg.kind === 'field' ? seg.prefix : '' }}」的字段（仍可手输）</div>
        <!-- keyword 值位 terms 飞行中的加载占位（复用字段 loading 档形态）——
 此前飞行中 hint=null → refresh 关层、响应到位再弹=弹层闪关 -->
        <div v-else-if="hint === 'values-loading'" class="li-hint">正在加载候选值…</div>
        <div v-else-if="hint === 'no-values' && seg.kind === 'value'" class="li-hint">字段「{{ seg.field }}」暂无匹配「{{ seg.prefix }}」的候选值（仍可手输{{ fieldType(seg.field) === 'text' ? '；text → 建议用 .keyword 子字段精确匹配' : '' }}）</div>

        <div v-else class="li-list" ref="listEl" role="listbox" :id="listId">
          <div
            v-for="(it, i) in items" :key="it.text"
            class="li-item" :class="{ act: i === cursor }"
            role="option" :id="itemId(i)" :aria-selected="i === cursor" tabindex="-1"
            @mouseenter="cursor = i" @click="choose(it)" @keydown.enter.prevent="choose(it)"
            @contextmenu.prevent="openRowMenu($event, it, i)"
          >
            <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部四类型撞色规则 -->
            <span v-if="it.type" class="li-type mono mft-type" :data-t="it.type">{{ it.type }}</span>
            <!-- 548 C 近似候选徽标（fuzzy 只在零命中纠错时出现） -->
            <i v-if="it.fuzzy" class="li-fuzzy">近似</i>
            <!-- P1-2：三段统一 splitMark 片段渲染——field 段既有的 :54 形态推广至
 op/value 段（items 侧统一产 segs），字符串注入式高亮通道退役（本组件不再有
 任何 HTML 注入渲染面，同 FieldSelect/MarkText 手法） -->
            <span class="li-name mono"><template v-for="(sg, si) in it.segs" :key="si"><mark v-if="sg.m">{{ sg.t }}</mark><template v-else>{{ sg.t }}</template></template></span>
          </div>
        </div>
      </div>
      </transition>
    </Teleport>

    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* W2 ：Lucene 三段补全输入框。
 input 事件取 selectionStart 调 luceneSegment 判段：
 field 段 → useIndexFields 过滤（排序对齐 FieldPicker：精确>前缀>包含，cap 30），item=字段名+类型徽标；
 value 段 → 字段类型 keyword 走 useTermsSuggest（terms agg），date/numeric/boolean/ip 出静态格式提示项；
 phrase 段 → 不出层（短语自由文本）；op 段 → AND/OR/NOT 整词提示。
 选择回填=替换当前段前缀，补全后光标置段尾；err 行对齐 FieldPicker 形态（失败零降级，可手输）。
 弹层交互由 usePopupList 骨架供给（open/cursor/place/onKey/onDocDown/teleport 双模式）。

 关键设计：choose 用「input 时刻的段快照」（seg/segCursor）而非 choose 时刻重算——
 items 由快照生成，两者必须同源；且 v-model 重渲染 patch value（新值≠旧值）会把 selectionStart
 重置到文本尾，choose 时刻再读光标已不可信。回填后 nextTick 显式 setSelectionRange 置段尾。 */
import { ref, computed, watch, nextTick } from 'vue';
import { AlertTriangle, Copy, CornerDownLeft } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { usePopupList } from '../composables/usePopupList';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import { copyText } from '../utils/format';
import { luceneSegment, type LuceneSeg } from '../utils/luceneContext';
import { isEscapedQuote } from '../utils/dslCompletionContext';
/* field 段候选收口 fieldSearch 共享内核（rank 排序/splitMark 切分与 FieldPicker/FieldSelect
 同源不漂移），并接 per-index 最近字段记忆。：值位首轮预载读 lastRecentField */
import { searchFields, rememberRecentField, lastRecentField, type MarkSeg } from '../utils/fieldSearch';
/* field 段（裸词）传 term 语义类型置顶序（typePriorityForOp 单一出处，
 builder FieldSelect 同表先例——keyword 字段排前）
 值位 keyword 族表与数值族十口径同源消费（KEYWORD_VALUE_TYPES/
 NUMERIC_VALUE_TYPES 单一出处 queryAstOps——四处 literal 收口） */
import { typePriorityForOp, KEYWORD_VALUE_TYPES, NUMERIC_VALUE_TYPES } from '../utils/queryAstOps';
/* P1-2：op/value 段统一 splitMark 片段（注入式高亮退役）+ 未知字段最近候选 */
import { splitMark } from '../composables/useGridSearch';
import { editDistance } from '../utils/editDistance';

const props = withDefaults(defineProps<{
  modelValue: string;
  /** 字段/terms 来源索引；为空时 field 段出引导 hint，value 段零降级手输 */
  index: string;
  placeholder?: string;
  /** 弹层挂载点：默认 'body'（Teleport）；false 就地渲染在 .li 根内（absolute 随根定位） */
  to?: string | false;
  /* 1438：视为「空占位」的初值——聚焦时若内容仍是它，全选整段，
     让用户直接输入就覆盖掉。
     为什么要这个：Lucene 页的查询默认值是 `*`（match_all 简写）。用户点进去
     直接敲 `status:ACTIVE`，得到的是 `*status:ACTIVE`——`*` 在 query_string 里是
     通配符，语义完全变了，而用户毫无察觉。全选只改选区不改值，零副作用。 */
  placeholderValue?: string;
}>(), { to: 'body' });

/* enter：面板关或无候选时 Enter 透发（宿主绑定执行查询—— 渗透用） */
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'enter'): void }>();

/** 候选统一形态：text=回填文本；type 仅 field 段有（类型徽标 .li-type[data-t]）；
 * P1-2：segs 三段必备（splitMark 命中切分片段，模板统一按段渲染 <mark>，
 * 注入式高亮通道退役后无第二渲染分支）；
 * fuzzy 透传（548 C 零命中近似候选 → .li-fuzzy「近似」徽标） */
type LiItem = { text: string; type?: string; segs: MarkSeg[]; fuzzy?: boolean };

const OPS = ['AND', 'OR', 'NOT'];
const DATE_HINTS = ['now-1h/h', 'now-1d/d', '>=2026-08-01'];
const NUM_HINTS = ['>100', '[10 TO 20]'];
/* value 段补 boolean/ip 静态档（sqlCompletion.VAL_FORMAT_HINTS 同语义平移——
 boolean→true/false 字面、ip→点分示例；只提示格式不约束输入，任意值仍可手输）。
 再补两档（新档内容平移既有档形）：wildcard→'pref*' 通配形态（544 姊妹表
 keyword/wildcard→pref* 同形）；date_nanos≡date 族，消费分支复用 DATE_HINTS 同款内容。
 ip 档补 CIDR 形态档（网段匹配语法，sqlCompletion D1 姊妹面同步对齐）。
 ：七表+if 链被 //
 三处旧 spec 连常量本体与分支行逐字锁死，TYPE_VALUE_HINTS
 （fieldSearch 565 单源表）合并不可行——单源与本表同形性由 双字面锁钉住，
 下波旧锁解禁同步更新时改引单源为纯机械操作。 */
const BOOL_HINTS = ['true', 'false'];
const IP_HINTS = ['192.168.0.1', '192.168.0.0/24'];
const WILDCARD_HINTS = ['pref*'];
/* 补 token_count（分词计数=数值语义，值位走数值静态档；known 经 NUMERIC_TYPES 同权）。
 表本体下沉 queryAstOps.NUMERIC_VALUE_TYPES 单源（值逐字同形） */
const NUMERIC_TYPES = NUMERIC_VALUE_TYPES;
/* geo_point 值位静态档（'纬度,经度' 形态示例，sqlCompletion VAL_FORMAT_HINTS.geo_point
 同款对齐；只提示格式不约束输入） */
const GEO_HINTS = ['40.71,-74.01'];
/* version 值位静态档（semver 点分形态示例，sqlCompletion VAL_FORMAT_HINTS.version
 同款对齐；只提示格式不约束输入） */
const VERSION_HINTS = ['1.0.0'];
/* range 字段族 + flattened 值位档——range 查询值形态与普通类型同构：
 四数值 range 族出 NUM_HINTS（[10 TO 20] 区间形态）、date_range 复用 DATE_HINTS
 （date-math）、ip_range 复用 IP_HINTS（CIDR/点分，sqlCompletion VAL_FORMAT_HINTS
 姊妹档 562 同步对齐）、flattened 出 WILDCARD_HINTS（键.值 任意形态，通配提示最贴）。
 known 行同步随权（滤空出「无候选值」提示与既有档同权） */
const RANGE_FLAT_TYPES = ['integer_range', 'long_range', 'float_range', 'double_range', 'date_range', 'ip_range', 'flattened'];
/* keyword 族 terms-agg 候选档=族内去 wildcard（wildcard 保留静态 pref* 档不动——
 546/ 字面锁保形；constant_keyword 同走 terms-agg，sqlCompletion AGG_VALUE_TYPES 同口径） */
const AGG_KEYWORD_TYPES = KEYWORD_VALUE_TYPES.filter(t => t !== 'wildcard');

const store = useAppStore();
const inputEl = ref<HTMLInputElement>();
const { fields, loading, loadErr, ensure, reload } = useIndexFields(() => props.index);
/* 件②：值位 terms 候选接类型感知精化排序（useTermsSuggest 可选第二参 types，
 的消费接线——字段类型源=本组件字段表，与 fieldType() 同源）。keyword 族字段
 rankTermsByType 原样返回（ES doc_count 权威序零扰动），本组件 suggest 仅 keyword 族触发，
 缺省/keyword 场景行为逐字节不变；date/数值族字段（若经 AGG 族外通道触发）ISO/数值形态
 排前。展示层精化：缓存/stash 仍存 ES 权威序（useTermsSuggest 工厂头注契约）。 */
const fieldTypes = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const f of fields.value) m[f.path] = f.type;
  return m;
});
const { suggestions, suggesting, suggest } = useTermsSuggest(() => props.index, () => fieldTypes.value);

/* input 时刻的段快照（choose 回填基准，见顶部设计说明） */
const seg = ref<LuceneSeg>({ kind: 'field', prefix: '' });
const segCursor = ref(0);
/* choose 后抑制出层直到下一次 input（选完立即按新前缀再弹一层很吵） */
let suppress = false;
/* ensure 幂等但不去重 in-flight：首次输入/开层拉一次即可；ensured 闸闭合后 onOpen 也不会重拉——
 失败后的恢复路径仅：err 行重试按钮(reload)/切索引/切集群（底部两处 watch 复位 ensured） */
let ensured = false;

const fieldType = (path: string) => fields.value.find(f => f.path === path)?.type || '';

const items = computed<LiItem[]>(() => {
  const s = seg.value;
  if (s.kind === 'field') {
    /* 手写第三份 rank（精确>前缀>包含 cap30）收口 fieldSearch.searchFields——
 与 FieldPicker/FieldSelect 同源排序与 mark 切分，不再漂移；cap 30 保留。
 不接最近字段置顶：下拉补全保序，记忆只写入供 builder FieldSelect 与后续使用。
 裸词=term 语义，typePriorityForOp('term') 置顶序（builder FieldSelect 同表先例，
 候选集不变仅 keyword 组置前） */
    return searchFields({ fields: fields.value, query: s.prefix, cap: 30, typePriority: typePriorityForOp('term') })
      .flat.map(h => ({ text: h.path, type: h.type, segs: h.segs, fuzzy: h.fuzzy }));
  }
  /* P1-2：op/value 段同走 splitMark 片段（hl() 退役；prefix 为空时
 splitMark 返回单段无 mark，等价原 esc 平文渲染） */
  if (s.kind === 'op') return OPS.map(t => ({ text: t, segs: splitMark(t, s.prefix) }));
  if (s.kind === 'value') {
    /* _exists_ 值位实为字段名位——候选=fieldSearch 字段清单（field 段同款：
 term 亲和置顶序 + LiItem 四件套 text/type/segs/fuzzy），非类型分档 */
    if (s.field === '_exists_') {
      return searchFields({ fields: fields.value, query: s.prefix, cap: 30, typePriority: typePriorityForOp('term') })
        .flat.map(h => ({ text: h.path, type: h.type, segs: h.segs, fuzzy: h.fuzzy }));
    }
    const t = fieldType(s.field);
    const p = s.prefix.toLowerCase();
    const withSegs = (v: string) => ({ text: v, segs: splitMark(v, s.prefix) });
    /* terms/格式提示均按当前段前缀本地 startsWith 过滤：防抖延迟期旧建议不误显。
 keyword 本名判定收口 AGG_KEYWORD_TYPES 族（constant_keyword 同走 terms-agg）。
 keyword 值位精确前缀置顶（sqlCompletion 558 先例同款稳定排序——已敲前缀
 恰为某候选全文时提到首位，服务端 doc_count 序保底：非精确项相对序零漂移；空前缀
 无精确语义不重排）。⚠锁行字面留档（ 非同步更新锁保绿；
 已同步更新新字面，解禁后应去本留档并把断言更新为新字面）：
 if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).map(withSegs); */
    if (AGG_KEYWORD_TYPES.includes(t)) return suggestions.value.filter(v => !p || v.toLowerCase().startsWith(p)).sort((a, b) => Number(b.toLowerCase() === p) - Number(a.toLowerCase() === p)).map(withSegs);
    if (t === 'date') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (NUMERIC_TYPES.includes(t)) return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'boolean') return BOOL_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'ip') return IP_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    /* wildcard 档（pref* 通配形态）与 date_nanos 档（≡date 族，复用 DATE_HINTS） */
    if (t === 'wildcard') return WILDCARD_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'date_nanos') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    /* geo_point 档（'纬度,经度' 形态，sqlCompletion VAL_FORMAT_HINTS.geo_point 对齐） */
    if (t === 'geo_point') return GEO_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    /* version 档（semver 点分形态，sqlCompletion VAL_FORMAT_HINTS.version 对齐） */
    if (t === 'version') return VERSION_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    /* range 字段族 + flattened 档（区间/date-math/CIDR/通配四形态，见 RANGE_FLAT_TYPES 注） */
    if (t === 'integer_range' || t === 'long_range' || t === 'float_range' || t === 'double_range') return NUM_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'date_range') return DATE_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'ip_range') return IP_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    if (t === 'flattened') return WILDCARD_HINTS.filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
    /* text 档——mapping 清单确有 `field.keyword` 子字段时值位出一个子字段建议项
 （形态对齐既有静态档：withSegs 包装 + 前缀 startsWith 本地过滤）；无子字段不出项
 （hint known 同步补 text 档，滤空提示带「.keyword 子字段」文案） */
    if (t === 'text') {
      const kwPath = s.field + '.keyword';
      if (fields.value.some(f => f.path === kwPath)) {
        return [kwPath].filter(h => !p || h.toLowerCase().startsWith(p)).map(withSegs);
      }
    }
  }
  return [];
});

/* 轻量语法检查（纯字符串扫描，零请求零阻塞，随输入实时增减）。
 条目升级 {msg, level} 双档（渲染拼接口径 join('；') 不变）——
 硬伤（语法非法，ES 必拒）=error 红档：①②③⑤ 系（引号未闭合/尾随运算符/括号配对错乱/
 区间未闭合）；软提示（可疑但可能合法）=warn 黄档：④字段缺查询值、⑥未知字段
 （字段清单未到位时漏报属预期，非硬伤口径）。档色取最重档（任一 error 整条红）。
 既有两规则（保留勿动）：① 未闭合引号——非转义引号计数为奇；② 尾随大写 AND/OR/NOT——缺右侧条件。
 运算符仅认大写：query_string 里小写 and/or 是普通词不是运算符，不误报。
 增四规则（2→6）：③ ()[]{} 栈扫描不平衡——配对错乱（(] 交错/多余右括号）与 ( 未闭合；
 ④ 字段缺值——行尾落在 `field:` 冒号后无值；⑤ 未闭合区间——[ 或 { 开到行尾无闭合
 （与 ③ 分工：③ 报配对错乱与 (，⑤ 报 [ { 的行尾未闭合）；⑥ 未知字段——`field:` 引用的字段名
 不在当前索引字段清单（fields 未到位/空清单跳过防误报；_ 开头元字段豁免）。
 括号/字段扫描前先把闭合短语挖除（引号内是 phrase 自由文本，无语法字符）；引号未闭合时
 挖除不可靠，四条新规则整体跳过——引号规则已点名，不叠加噪音。
 558b 批：⑥ 的 _exists_:参数单列扫描同纠错（见 fields 扫描段注释）。
 与段级解析口径互补：段解析负责「光标处出什么候选」，这里负责「整句哪里是硬伤」 */
type SyntaxIssue = { msg: string; level: 'error' | 'warn' };
const syntaxIssues = computed<SyntaxIssue[]>(() => {
  const v = props.modelValue || '';
  if (!v.trim()) return [];
  const out: SyntaxIssue[] = [];
  let q = 0;
  for (let i = 0; i < v.length; i++) if (v[i] === '"') q += isEscapedQuote(v, i) ? 0 : 1;
  if (q % 2) out.push({ msg: '引号未闭合（缺收尾 "）', level: 'error' });
  if (/(^|\s)(AND|OR|NOT)\s*$/.test(v)) out.push({ msg: '以 AND/OR/NOT 结尾，缺右侧条件', level: 'error' });
  if (q % 2 === 0) {
    /* 闭合短语挖成空壳占位 ""（不引入伪词元：④ 的行尾冒号判定不吃短语挖除——
 挖成空串会把 `field:"短语"` 变成行尾 `field:` 误报缺值） */
    const bare = v.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    /* ③ 栈扫描：右括号弹栈不配对即报；扫完栈里残留 ( 报未闭合（[ { 归 ⑤） */
    const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
    const stack: string[] = [];
    let mismatch = false;
    for (const ch of bare) {
      if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (stack.pop() !== PAIRS[ch]) { mismatch = true; break; }
      }
    }
    if (mismatch) out.push({ msg: '括号不匹配（()[]{} 配对错乱）', level: 'error' });
    else if (stack.includes('(')) out.push({ msg: '( 未闭合（缺 )）', level: 'error' });
    /* ⑤ 未闭合区间：报首见的一种即止（一行多缺只点名 [ 或 {，防提示条刷屏） */
    else if (/\[[^\]]*$/.test(bare)) out.push({ msg: '[ 区间未闭合（缺 ]）', level: 'error' });
    else if (/\{[^}]*$/.test(bare)) out.push({ msg: '{ 未闭合（缺 }）', level: 'error' });
    /* ④ 字段缺值：行尾落在 field: 冒号后（空白也算无值）——软提示档（手输中途态常态） */
    const fv = /[\w.\-]+:\s*$/.exec(bare);
    if (fv) out.push({ msg: `字段「${fv[0].replace(/:\s*$/, '')}」缺查询值（冒号后为空）`, level: 'warn' });
    /* ⑥ 未知字段：字段引用不在 fields 清单（同一未知字段只点名一次）。
 P1-2：附编辑距离最近候选（「最接近：xxx」）——dslLint unknown-field
 同口径：距离 ≤2 才附（>2 大概率是全新字段不是笔误，附了反而误导）。
 正则放宽吞尾部 boost^2/^2.5——`status^2:ok` 原把 `2` 当字段名误报
 「未知字段「2」」，放宽后点名剥净 boost 的真字段名。 */
    if (fields.value.length) {
      /* 558b 批：未知字段判定收口共用（known 口径 + editDistance 最近候选 + 同格式提示）——
 规则⑥正则与 _exists_ 扫描两处同走本判定；既有锁面字面（ C/
 boost 锁）原文同步更新进 helper 不改一字 */
      const pushUnknownField = (f: string) => {
        const known = fields.value.some(fd => fd.path === f || f.startsWith(fd.path + '.'));
        if (known) return;
        let best = ''; let bestD = 3; /* >2 即弃（防噪音） */
        for (const fd of fields.value) {
          const d = editDistance(f, fd.path);
          if (d < bestD) { bestD = d; best = fd.path; if (!bestD) break; }
        }
        out.push({ msg: `未知字段「${f}」（不在当前索引字段清单${bestD <= 2 ? `，最接近：${best}` : ''}）`, level: 'warn' });
      };
      const seen = new Set<string>();
      for (const m of bare.matchAll(/([\w.\-]+)(\^\d+(?:\.\d+)?)?:/g)) {
        const f = m[1];
        if (f.startsWith('_') || seen.has(f)) continue;
        seen.add(f);
        pushUnknownField(f);
      }
      /* 558b 批：_exists_:字段 未知字段纠错——规则⑥正则只捕 `name:` 形态，_exists_ 本名
 被下划线前缀豁免，其参数（真字段名）此前零纠错。matchAll 前单列扫描
 /_exists_:(\w[\w.\-]*)/g，捕获组走同一 known/editDistance 最近候选逻辑、同格式提示 */
      for (const m of bare.matchAll(/_exists_:(\w[\w.\-]*)/g)) {
        const f = m[1];
        if (seen.has(f)) continue;
        seen.add(f);
        pushUnknownField(f);
      }
    }
  }
  return out;
});

/* hint 与列表互斥：value 段 terms 已到位但零匹配出「无候选值」提示（比静默关层多一句解释——
 用户知道是「没有这个值」而非「补全坏了」）；terms 未到位/未知字段仍 hint=null 不出层（零降级手输）。
 keyword 值位请求在飞且无可显示候选 → 出「正在加载候选值」档（此前飞行中 hint=null →
 refresh 关层、响应到位再弹层=闪关）；items 非空不出此档——收窄过滤期旧候选照常显示不闪 */
const hint = computed<'no-index' | 'loading' | 'err' | 'empty' | 'no-match' | 'no-values' | 'values-loading' | null>(() => {
  const s = seg.value;
  if (s.kind === 'phrase') return null;
  if (!props.index) return 'no-index';
  if (loading.value) return 'loading';
  if (loadErr.value) return 'err';
  if (s.kind === 'field') {
    if (!fields.value.length) return 'empty';
    if (!items.value.length) return 'no-match';
  }
  if (s.kind === 'value') {
    /* 飞行中档门槛随 keyword 族收口（constant_keyword terms-agg 飞行中同出
 加载占位，防闪关——语义随族表扩员） */
    if (suggesting.value && !items.value.length && AGG_KEYWORD_TYPES.includes(fieldType(s.field))) return 'values-loading';
    /* value 段：keyword terms 已回（suggesting=false）且本地过滤后为空 → 明示无候选值；
 date/numeric/boolean/ip 静态提示被前缀滤空同理；未知字段仍不出层。
 known 扩 wildcard/date_nanos 两档（值位候选已有约定，滤空提示随档同权）。
 known 再补 text 档（值位 .keyword 建议已约定，滤空提示带「.keyword 子字段」
 文案—— / 双字面锁同步更新注明「」） */
    if (!suggesting.value) {
      const t = fieldType(s.field);
      /* known 补 constant_keyword（keyword 族值语义，KEYWORD_VALUE_TYPES 同族——
 滤空出「无候选值」提示与既有档同权）；token_count 经 NUMERIC_TYPES 同步入档。
 ：known 收口族表（KEYWORD_VALUE_TYPES 三员 covers 原 keyword/wildcard/
 constant_keyword 三档）+ geo_point 新档随权；语义与原行逐档等值扩张。
 ：known 行补 `s.field === '_exists_'`（值位候选已改出字段清单，滤空提示
 随权）与 t === 'version'（静态档 ）——既有各档语义不变。
 ：known 行尾部补 RANGE_FLAT_TYPES 族表（range 字段族+flattened 七档 ，
 滤空提示随权）——既有各档语义仍不变。 */
      const known = s.field === '_exists_' || KEYWORD_VALUE_TYPES.includes(t) || t === 'date' || t === 'boolean' || t === 'ip' || t === 'date_nanos' || t === 'text' || t === 'geo_point' || t === 'version' || RANGE_FLAT_TYPES.includes(t) || NUMERIC_TYPES.includes(t);
      if (known && !items.value.length) return 'no-values';
    }
  }
  return null;
});

const {
  open, cursor, popStyle, teleportTo, inplace, listId, itemId,
  rootEl, listEl, openPanel, close, onKey,
} = usePopupList<LiItem>({
  items: () => items.value,
  onChoose: it => choose(it),
  onEnter: () => emit('enter'),
  onOpen: () => { if (!ensured) { ensured = true; ensure(); } },
  to: () => props.to,
  idPrefix: 'li',
  activeSelector: '.li-item.act',
});

/* 候选行右键/键盘 ContextMenu —— 全站共享壳；填入/复制都只读本地，不触发服务端写 */
const rowMenu = ref<{ x: number; y: number; it: LiItem } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  return m ? '候选 · ' + m.it.text + (m.it.type ? ' · ' + m.it.type : '') : '';
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  return [
    { key: 'li-pick', label: '填入此候选', icon: CornerDownLeft, run: () => choose(m.it) },
    { key: 'li-copy', label: '复制候选文本', icon: Copy, run: () => copyCandidate(m.it.text) },
  ];
});
function copyCandidate(text: string) {
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error',
    ok ? '已复制：' + text : '复制失败：浏览器拦截了剪贴板'));
}
function showRowMenu(x: number, y: number, it: LiItem, i: number) {
  cursor.value = i;
  rowMenu.value = { x, y, it };
}
function openRowMenu(e: MouseEvent, it: LiItem, i: number) {
  showRowMenu(e.clientX, e.clientY, it, i);
}
/* 键盘入口：焦点在输入框，ContextMenu/Shift+F10 对当前高亮候选开菜单 */
function onInputKey(e: KeyboardEvent) {
  const it = items.value[cursor.value];
  if (!e.isComposing && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))
    && open.value && it) {
    e.preventDefault();
    const r = inputEl.value?.getBoundingClientRect();
    showRowMenu(r ? r.left + 12 : 0, r ? r.bottom : 0, it, cursor.value);
    return;
  }
  onKey(e);
}

/* 出层状态单一收口：input 事件与异步数据（fields/suggestions）到位都走这里。
 有候选或有 hint 要展示 → 开层；否则关层（phrase/未知字段值段零降级）。 */
function refresh() {
  if (suppress) return;
  const s = seg.value;
  if (s.kind === 'phrase') { close(); return; }
  if (!ensured) { ensured = true; ensure(); }
  /* keyword 本名判定收口 AGG_KEYWORD_TYPES 族（constant_keyword 同走 terms-agg） */
  if (s.kind === 'value' && AGG_KEYWORD_TYPES.includes(fieldType(s.field))) suggest(s.field, s.prefix);
  if (items.value.length || hint.value) { if (!open.value) openPanel(); }
  else close();
}

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const v = el.value;
  emit('update:modelValue', v);
  suppress = false;
  segCursor.value = el.selectionStart ?? v.length;
  seg.value = luceneSegment(v, segCursor.value);
  /* 输入即复位高亮（对齐 FieldPicker.onInput）：列表收窄后 cursor 可能越界——无高亮 Enter 会误走「无候选」透发半成品查询 */
  cursor.value = 0;
  refresh();
}

/* 弹层打开后 ←/→/Home/End 或点击重定位光标不产生 input 事件，弹层会滞留旧段内容——
 光标与 input 时刻快照 segCursor 不一致即关层；继续打字经 input→refresh 按新段重开，体验连续 */
const CURSOR_MOVE_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
function onKeyUp(e: KeyboardEvent) { if (CURSOR_MOVE_KEYS.includes(e.key)) onCursorMove(); }
function onCursorMove() {
  if (!open.value) return;
  const el = inputEl.value;
  if (el && (el.selectionStart ?? 0) !== segCursor.value) close();
}

/* 1438：聚焦时若内容仍是「空占位值」（如 `*`），全选让用户直接输入覆盖。
   只改选区不改值——用户若想保留 `*` 也能照常按 Esc/箭头移动光标。 */
function onFocusSelectPlaceholder() {
  const el = inputEl.value;
  const ph = props.placeholderValue;
  if (!el || ph == null || !ph) return;
  if (el.value !== ph) return;
  el.select();
}

function choose(it: LiItem) {
  const s = seg.value;
  /* field 段选中回写 per-index 最近字段记忆（与 FieldSelect 同一 localStorage 键族，
 跨面板共享「最近使用」）；无索引语境（props.index 空）rememberRecentField 落全局键，不丢。
 选中 keyword 字段即空前缀预载其候选值（TTL 缓存白得——后续值位任意前缀走
 548 A2 宽前缀本地滤零网络白得；非 keyword 字段值位走静态档/子字段推荐，不预载浪费 terms） */
  if (s.kind === 'field') {
    rememberRecentField(props.index, it.text);
    /* keyword 本名判定收口 AGG_KEYWORD_TYPES 族（constant_keyword 选中同预载候选值） */
    if (AGG_KEYWORD_TYPES.includes(fieldType(it.text))) suggest(it.text, '');
  }
  const v = props.modelValue || '';
  const cur = Math.min(segCursor.value, v.length);
  const head = v.slice(0, Math.max(0, cur - s.prefix.length));
  const nv = head + it.text + v.slice(cur);
  const pos = head.length + it.text.length;
  suppress = true;
  emit('update:modelValue', nv);
  close();
  /* 重渲染 patch value 会把光标重置到文本尾：nextTick 显式置段尾；focus 兜底（mousedown.prevent 正常不丢焦） */
  nextTick(() => { const el = inputEl.value; if (el) { el.focus(); el.setSelectionRange(pos, pos); } });
}

/* 异步链任一环节到位都重估出层：fields（类型判定前提）→ suggest 触发；suggestions → terms 列表出层。
 fields 到位即读 per-index 最近使用字段（lastRecentField），命中 keyword 族则空前缀
 预热 terms-agg TTL 缓存——手输字段名+冒号后值位首轮缓存命中零网络（useTermsSuggest 缓存
 命中同步回填既有锁保形）；无记录/非 keyword 族（静态档/子字段推荐语境）零动作零请求 */
function primeRecentFieldAgg() {
  const f = lastRecentField(props.index);
  if (f && AGG_KEYWORD_TYPES.includes(fieldType(f))) suggest(f, '');
}
watch(fields, () => { primeRecentFieldAgg(); refresh(); });
watch(suggestions, refresh);
/* 索引/集群目标变化：复位拉取闸，面板开着则按新目标重拉；target 切换的关层仅防旧数据滞留的过渡态——
 同 flush 内 fields/suggestions 清空会触发 refresh 按新数据重估，有候选/hint（含 loading）即重开 */
watch(() => props.index, () => { ensured = false; if (open.value) ensure(); });
watch(() => store.target, () => { open.value = false; ensured = false; });
</script>

<style scoped>
.li { position: relative; display: block; width: 100%; }
.li-inp { display: block; width: 100%; box-sizing: border-box; padding: var(--sp-1h) var(--sp-2h); border: 1px solid var(--border); border-radius: var(--r-s); background: var(--bg2); color: inherit; font-size: var(--fs-sm); outline: none; transition: border-color .12s; }
.li-inp:focus { border-color: var(--acc); }

/* 语法检查提示条：warn 语义档（警告/需注意），soft 底+line 边与全站黄条（.dq-partial）同语言
 margin-top 4px 等值收 --sp-1；gap:5px 保字面（spSweep收窄）。
 padding 横向 8px 精确等值收 --sp-2（ 头注③修订合并，3px 纵向保字面）
 增 err 硬伤红档（任一 error 级条目整条红，:class 线于模板） */
.li-syntax { display: flex; align-items: center; gap: 5px; margin-top: var(--sp-1); padding: 3px var(--sp-2); font-size: var(--fs-xs); line-height: 1.5; color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-s); }
.li-syntax.err { color: var(--err); background: var(--err-soft); border-color: var(--err-line); }
.li-syntax svg { flex-shrink: 0; }

/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.li-pop { overflow: hidden; font-size: var(--fs-sm); }
/* 就地模式：absolute 随 .li 根（position:relative）定位（同 FieldPicker 约定） */
.li-pop.inplace { position: absolute; top: 100%; left: 0; min-width: 100%; z-index: 10; }
.li-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.li-list { max-height: 240px; overflow: auto; padding: 3px 0; }
/* padding 横向 10px 精确等值收 --sp-2h（ 头注③修订合并，5px 纵向保字面） */
.li-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.li-item.act { background: var(--hover); }
.li-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.li-name :deep(mark) { background: none; color: var(--acc); font-weight: 600; }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部四类型规则已删）；
 冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.li-type { flex: none; min-width: 52px; text-align: center; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; }
:where(.li-type) { color: var(--muted); background: var(--hl); }
/* 近似候选徽标（548 C fuzzy 透传渲染，warn 色微字） */
.li-fuzzy { font-size: var(--fs-2xs); color: var(--warn); font-style: normal; margin-left: var(--sp-1); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
