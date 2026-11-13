<template>
  <div class="av">
    <!-- 补页头统一件（邻页 IndexSettingsView 范式）——此前本页无标题，
 顶栏工具卡直接贴页面顶，与其他页头页跳转时观感断裂 -->
    <PageHeader :icon="FlaskConical" title="分词验证（Analyze）" subtitle="_analyze 请求调试 · analyzer / tokenizer / filter 组合验证" />
    <!-- 顶栏：索引选择器 + 快速插入常见分词器预设。：card 壳退役（约定③，
 552 is-bar/ss-bar/tp-bar 同族漏网收口）——裸行直贴页面流，border-bottom 分界 -->
    <div class="av-bar">
      <div class="av-bar-row">
        <label class="av-lbl">目标索引：</label>
        <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（W1 建件，曾由
 裸 n-select 合并而来；选索引入口收敛 TopBar 唯一处，别名/健康度 meta 都在顶栏）。
 useIdxState follow 语义零改——仍上行 store.pick 全站就位； buildIndexOptions
 的分组/健康度语义由 IndexOptionRow/TopBar 承担（注释历史字样保留）。
 「走全局」开关只决定本次请求是否携带 index，不再联动选择器展示态 -->
        <CurrentIdxChip />
        <!-- 索引选择跟全局（useIdxState 上行/跟随，不再与顶栏各持一份）；
 本页特有「走全局 /_analyze」语义改为显式开关——勾选即不带 index 请求 -->
        <n-checkbox v-model:checked="globalAnalyze" size="small">不限定索引（走 ES 内置 analyzer）</n-checkbox>
        <span class="av-hint">
          <Info :size="12" />
          选定索引可使用其自定义 analyzer；勾选「不限定索引」走 ES 内置 analyzer。
        </span>
      </div>
      <div class="av-bar-row">
        <span class="av-lbl">分词器预设：</span>
        <!-- G164：预设组补容器语义+chips 动态 pressed（G142/G154/G158 族三行刀） -->
        <div class="av-presets" role="group" aria-label="分词器预设">
          <button
            v-for="p in presets"
            :key="p.name"
            class="chip"
            :class="{ on: p.name === activePreset }"
            :aria-pressed="p.name === activePreset"
            @click="applyPreset(p)"
            :title="p.desc"
          >
{{ p.label }}
</button>
        </div>
      </div>
    </div>

    <!-- 接统一可调工作台（第五视图）——输入/结果双栏可调+预设+记忆 -->
    <WorkbenchLayout :scope="avScope" :panes="AV_PANES" axis="vertical" mode="analyze">
      <template #pane-analyze-input>
      <!-- 左：输入 body（轨4：.card 壳退役——pane 即容器内容直贴，
 卡头 fs-head 语言承接分界，title 已于 置空只欠去壳） -->
      <div class="av-left">
        <div class="card-t">
          <FlaskConical :size="13" /> _analyze 请求 body
          <!-- 路径 hint 修正（index 空时实际请求就是全局 /_analyze，原拼接显示
 「/_analyze/_analyze」误导）+ 窄 pane 溢出治理（flex-wrap + hint 可收缩省略） -->
          <span class="av-body-hint mono" :title="'POST ' + (index ? '/' + index + '/_analyze' : '/_analyze')">POST {{ index ? '/' + index + '/_analyze' : '/_analyze' }}</span>
          <!-- G162：原始 IO 快查入口（铁律 F·RankDebug 三件套同构）——
 运行后请求体/响应 tokens 原文直达；无记录不开空弹窗（toast 引导） -->
          <button class="btn sm ghost" style="margin-left:auto" @click="openRawIo" title="最近一次 _analyze 请求/响应原文（复制/curl 回放）">
            <Terminal :size="11" /> 原始 IO
          </button>
          <!-- G161：运行钮 Play 在途窗补 spinning（737 G132/743 G153 族；disabled 既有） -->
          <button class="btn primary sm" @click="run" :disabled="running">
            <Play :size="11" :class="{ spinning: running }" /> 运行 <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span>
          </button>
        </div>
        <!-- body 接 dsl-assist（avBodyAssist setup 常量，防模板内联对象换引用
 反复重注册 provider；'analyze' BodyKind 档由并行批落地，此处视图侧先接线） -->
        <MonacoEditor
          v-model="body"
          language="json"
          :height="bodyJsonErr ? 'calc(100% - 62px)' : 'calc(100% - 40px)'"
          :dsl-assist="avBodyAssist"
          @keydown="onEditorKey"
        />
        <!-- +1：body 前置 JSON 校验红字（不合法直接拦在本地，不再把残缺 body
 打到 ES 吃解析报错；ReindexPreview 同语义——那边由 JsonArea 圆点承担，本页裸
 Monaco 补即时红字，红在场时编辑器让高 22px 不溢出卡片） -->
        <div v-if="bodyJsonErr" role="alert" class="av-json-err">{{ bodyJsonErr }}</div>
      </div>
      </template>
      <template #pane-analyze-result>
      <!-- 右：结果（轨4：.card 壳退役，同 av-left 口径） -->
      <div class="av-right">
        <div class="card-t">
          <ScanText :size="13" /> 分词结果 <span v-if="tokens.length" class="mono av-tk-c">{{ tokens.length }} tokens</span>
          <!-- Markdown 表复制（分词评估贴文档/群，比 JSON 可读） -->
          <button
            v-if="tokens.length"
            class="btn sm ghost"
            style="margin-left:auto"
            @click="copyResultMd"
            title="复制为 Markdown 表（文档/群聊直贴）"
          >
            <ClipboardList :size="11" /> Markdown
          </button>
          <button
            v-if="tokens.length"
            class="btn sm ghost"
            @click="copyResult"
            :title="'复制 tokens 为 JSON'"
          >
            <Copy :size="11" /> 复制
          </button>
        </div>
        <!-- .av-err 私造红壳退役合并 err-bar 形态（role=alert 在场，theme.css :554
 单源；558b pf-err 先例）——border/err-soft/radius 三件套归单源，.av-err 只留落位锚 -->
        <div v-if="err" role="alert" class="err-bar av-err">
          <AlertTriangle :size="13" />
          <div>
            <div class="av-err-h">分词请求失败</div>
            <!-- 裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文）；
 err 已是 friendlyEsError 人话串（+1 catch 处并轨），此处仅渲染收口 -->
            <pre class="mono av-err-body" v-html="errPreHtml(err, errMeta(errRaw))"></pre>
          </div>
        </div>
        <!-- running 分支先于空态：执行中给骨架，不再落入只剩标题的空结果区 -->
        <div v-else-if="running" class="av-tokens" style="display:flex;flex-direction:column;gap:var(--sp-2h)">
          <SkeletonBox height="64px" round />
          <SkeletonBox height="220px" round />
        </div>
        <!-- G165：hint 与实现对齐——body 是 Monaco 手写 JSON、analyzer 组合在
 body 内定义或由上方预设 chips 填入（原「左侧选 analyzer 与文本」与手写实现表述张力） -->
        <EmptyState v-else-if="!tokens.length" :icon="SearchCode" text="运行请求后显示 token 列表" hint="左侧手写请求 body（或点上方预设填入），点「运行」" />
        <div v-else class="av-tokens">
          <!-- 原文高亮：把 tokens 覆在原文上 -->
          <!-- 原文块高度可调（avSplitH>0 定高内滚，0=auto 自然高跟随内容） -->
          <div v-if="body && lastText" class="av-original" :style="avSplitH > 0 ? { flex: '0 0 auto', height: avSplitH + 'px' } : undefined">
            <div class="av-block-t">原文（高亮 tokens 覆盖）</div>
            <div class="av-orig-wrap mono">
              <template v-for="(seg, i) in highlightedSegs" :key="i">
                <span v-if="seg.tk" class="av-hl" :style="{ background: colorFor(seg.tk.token) }" :title="posZh(seg.tk.type) + ' · 序位=' + seg.tk.position">{{ seg.text }}</span>
                <span v-else class="av-plain">{{ seg.text }}</span>
              </template>
            </div>
          </div>
          <!-- 原文/Token 表纵缝拖拽（SplitHandle 复用件，PainlessLabView src/params
 纵缝同款）——此前两块硬堆叠不可调，ik_max_word 长原文把 Token 表顶出首屏 -->
          <SplitHandle
            v-if="body && lastText"
            axis="horizontal"
            :size="avSplitH > 0 ? avSplitH : 120"
            :min="60"
            :max="2400"
            label="原文/Token 表高度分配"
            @resize-end="(s: number) => avSplitH = clampAvSplitH(s)"
            @reset="avSplitH = 0"
          />

          <!-- 表格 -->
          <div class="av-tk-tbl-wrap">
            <div class="av-block-t av-tk-bar">
              Token 详情
              <!-- kw 过滤（token/词性中文释义/原码子串命中），词元与词性列
 MarkText 命中高亮（splitMark 全站手法）；序号保原数组位，与 offset 对照不串位。
 kw 过滤留视图（rows 输入端 + MarkText 命中源），命中计数不变 -->
              <!-- 轨4：自造过滤框改用 SearchFilterBar 单源（sfbUnify650 锁）——
 胶囊壳三件套+Search 图标归组件，Esc 清空内建承接（原裸 input 无 Esc 语义=补课）；
 落位类 av-tk-kw-wrap（宽高内衬父 scoped 照常命中），input-class 保运行时锚 -->
              <SearchFilterBar v-model="tkKw" class="av-tk-kw-wrap" input-class="av-tk-kw" placeholder="过滤 token / 词性…" />
              <span v-if="tkKw.trim()" class="av-tk-hit">命中 {{ shownTokens.length }} / {{ tokens.length }}</span>
            </div>
            <!-- token 裸表换 QRT rows 型——点击列头排序/列漏斗/右键/行导航/
 导出 CSV·MD·XLSX·PNG/列宽列选（analyze:tokens 维度记忆）全归内核；
 列名用中文键（词元/序位/字符区间/词性/长度，与 中文主名一致）；
 数值三列走 fieldTypes 显式 double（QRT num-col 右对齐 + 双层列头徽标）；
 kw+MarkText 命中高亮与 ES 原始字段名 title 经 #cell-<列名> 作用域槽保真；
 序号列保原数组位 i+1（kw 过滤后不串位），内核左侧 # 序号列是渲染序、两者并存 -->
            <QueryResultTable
              :cols="AV_TOKEN_COLS" :rows="tokenMatrix" sortable
              storage-key="analyze:tokens"
              export-name="analyze-tokens"
              :field-types="AV_TOKEN_TYPES"
              :empty-text="tkKw.trim() ? '无匹配 token（过滤词：' + tkKw + '）' : '无数据'"
              max-height="none"
            >
              <template #cell-词元="{ value }"><span class="mono av-tk-hl" :style="{ background: colorFor(value) }"><MarkText :text="value" :kw="tkKw" /></span></template>
              <!-- 数值列 title 原值（展示缩写/区间的列悬停可查证 ES 原始字段名与取值） -->
              <template #cell-序位="{ value }"><span class="mono" :title="'position=' + value">{{ value }}</span></template>
              <template #cell-字符区间="{ value }"><span class="mono" :title="'start_offset=' + String(value).split('-')[0] + ' · end_offset=' + String(value).split('-')[1]">{{ value }}</span></template>
              <template #cell-词性="{ value }"><span class="mono av-tk-type" :title="posTip(value)"><MarkText :text="posZh(value)" :kw="tkKw" /></span></template>
              <template #cell-长度="{ value }"><span class="mono" :title="'length=' + value">{{ value }}</span></template>
            </QueryResultTable>
          </div>
        </div>
      </div>
      </template>
    </WorkbenchLayout>
    <!-- G162：原始 IO 弹窗（RankDebug 三件套同构，rec 由 ioRecorder 记录环喂） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { NCheckbox } from 'naive-ui';
import { FlaskConical, ScanText, SearchCode, Play, Copy, ClipboardList, AlertTriangle, Info, Terminal } from 'lucide-vue-next';
import { useRoute } from 'vue-router';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；534 收口波：双参改用（errMeta 旁路） */
import { askConfirm } from '../composables/confirm';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIdxState, usePref } from '../composables/urlState';
import { useIndexFields } from '../composables/useIndexFields';
import PageHeader from '../components/PageHeader.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import MarkText from '../components/MarkText.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 轨4：token 详情过滤胞改用统一件（sfbUnify650 锁） */
import MonacoEditor from '../components/MonacoEditor.vue';
import SplitHandle from '../components/SplitHandle.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
/* token 表换 QRT rows 型——排序/漏斗/导出/右键/行导航归内核（PluginsView 525 W5 同判据） */
import QueryResultTable from '../components/QueryResultTable.vue';
/* G162：原始 IO 快查弹窗（请求体/响应 tokens 原文直达+复制/curl） */
import RawIoModal from '../components/RawIoModal.vue';

const store = useAppStore();

/* 输入+结果可调工作台声明（输入栏可折叠，拖拽/预设/记忆由 WorkbenchLayout 统一负责）
 竖排标题轨退役（实报双标题）——卡片 card-t 头部已承担标题，title 置空后
 ResizablePane v-if="title" 不再渲染 34px 竖排轨；输入栏 defaultSize 380→420 再平衡编辑比例 */
const avScope = { target: store.target || 'host', route: '/analyze', mode: 'analyze', profile: 'standard' as const };
const AV_PANES: WorkbenchPaneSpec[] = [
  { id: 'analyze.input', role: 'request', title: '', minSize: 280, defaultSize: 420, collapsible: true },
  { id: 'analyze.result', role: 'response', title: '', minSize: 320, defaultSize: 'flex' },
];
const route = useRoute();

/* 索引选择跟全局（ 单一真相）——useIdxState 上行 store.pick + follow:true
 跟随顶栏，页内切换即全站就位，不再与顶栏各持一份本地索引（实报「重复」）。
 followed 是 URL/store 同步的真身；index 是「本次请求实际用的索引」：
 勾选「不限定索引」时强制空串（走全局 /_analyze），沿用 index 命名保住 POST 路径
 hint 契约（防 /_analyze/_analyze 误拼）与 run 的口径不散改 */
const followed = useIdxState({ follow: true });
const globalAnalyze = ref(false);
const index = computed<string>(() => (globalAnalyze.value ? '' : followed.value));
/* IndexPicker 显示值 computed 随 改用退役——CurrentIdxChip 只读
 store 自显，页内不再回写选择器；落值通道只剩 followed（深链/顶栏），语义不散 */
/* 请求体草稿——切页/刷新不丢测试文本 */
const body = useScopedDraft('body', { route: 'analyze' }, '{\n  "analyzer": "standard",\n  "text": "The quick brown fox jumps over the lazy dog"\n}').text;
const activePreset = ref<string>('standard');

/* body Monaco dsl-assist 接线——fields 走 useIndexFields 惰性通道
 （QueryXrayView 同范式：补全触发才拉 mapping，挂载零请求，失败仅无候选）；
 analyzers 惰性通道照 MappingView「添加字段」弹层范式：api.analysisSettings 按索引
 记忆一次（失败静默空=值位通道关闭），触发时机并到 fields() 首次补全，不另开请求入口。
 'analyze' BodyKind 档由并行批落地 dslCompletionContext/MonacoEditor，此处 as any 过渡 */
const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);
/* 1439：实名组件按类别分列——analyzer/normalizer/tokenizer/filter/char_filter 各归其位，
   不再合并进 analyzers() 让 tokenizer 值位出 analyzer 名 */
const analyzerCandidates = ref<string[]>([]);
const normalizerCandidates = ref<string[]>([]);
const tokenizerCandidates = ref<string[]>([]);
const filterCandidates = ref<string[]>([]);
const charFilterCandidates = ref<string[]>([]);
let analyzersLoadedFor = '';
/* 2.1.6：切索引竞态守卫——旧索引的 analyzer 清单晚到不得覆盖新索引（会给出错误候选）；
 成功与失败支都按世代+当前索引双判。 */
let analyzerSeq = 0;
async function loadAnalyzerNames() {
  const idx = index.value.trim();
  if (!idx || analyzersLoadedFor === idx) return;
  analyzersLoadedFor = idx;
  const seq = ++analyzerSeq;
  try {
    const r: any = await api.analysisSettings(idx);
    if (seq !== analyzerSeq || idx !== index.value.trim()) return;
    const a = r?.analysis || {};
    analyzerCandidates.value = Object.keys(a.analyzer || {});
    normalizerCandidates.value = Object.keys(a.normalizer || {});
    tokenizerCandidates.value = Object.keys(a.tokenizer || {});
    filterCandidates.value = Object.keys(a.filter || {});
    charFilterCandidates.value = Object.keys(a.char_filter || {});
  } catch {
    if (seq !== analyzerSeq || idx !== index.value.trim()) return;
    analyzerCandidates.value = [];
    normalizerCandidates.value = [];
    tokenizerCandidates.value = [];
    filterCandidates.value = [];
    charFilterCandidates.value = [];
  }
}
const avBodyAssist = {
  fields: () => {
    if (index.value.trim()) { void ensureAssistFields(); void loadAnalyzerNames(); }
    return assistFields.value;
  },
  bodyKind: () => 'analyze' as any,
  /* 1439：组件值位不读 fields()——通道自身触发惰性拉取，否则自定义组件永远到不了候选 */
  analyzers: () => { if (index.value.trim()) void loadAnalyzerNames(); return analyzerCandidates.value; },
  normalizers: () => { if (index.value.trim()) void loadAnalyzerNames(); return normalizerCandidates.value; },
  tokenizers: () => { if (index.value.trim()) void loadAnalyzerNames(); return tokenizerCandidates.value; },
  filters: () => { if (index.value.trim()) void loadAnalyzerNames(); return filterCandidates.value; },
  charFilters: () => { if (index.value.trim()) void loadAnalyzerNames(); return charFilterCandidates.value; },
};

interface Token { token: string; start_offset: number; end_offset: number; position: number; type: string; }
const tokens = ref<Token[]>([]);
const running = ref(false);
const err = ref('');
/* 534 收口波双参改用：原始错误对象旁路留存（err 是 friendlyEsError 人话串、原始对象
 的 code/endpoint 会丢，喂 errMeta 用；正文串仍保 friendly 原样零改动） */
const errRaw = ref<unknown>(null);
const lastText = ref('');

/* 原文/Token 表纵缝拖拽记忆（PainlessLabView painless.srcH 同款 px 定高口径，
 resize-end 落盘/双击或 R 重置回 0=auto；偏好键沿用清单指定的 av.splitPct，值语义=原文块
 定高 px——SplitHandle 契约是 px 增量，存 pct 需容器实高换算得不偿失，键名历史沿用） */
const avSplitH = usePref('av.splitPct', 0);
function clampAvSplitH(s: number) { return Math.round(Math.min(2400, Math.max(60, s))); }

/* Token 详情表 kw 过滤——token/词性（中文释义+原码）子串匹配；
 输出保原数组位 i（序号列与原文 offset 对照不串位），词元/词性列 MarkText 高亮 */
const tkKw = ref('');
const shownTokens = computed(() => {
  const k = tkKw.value.trim().toLowerCase();
  const all = tokens.value.map((t, i) => ({ t, i }));
  if (!k) return all;
  return all.filter(({ t }) =>
    String(t.token || '').toLowerCase().includes(k)
    || String(t.type || '').toLowerCase().includes(k)
    || posZh(t.type).toLowerCase().includes(k));
});

/* ═══ ：token 表 QRT rows 型数据映射 ═══
 列=中文键（列头中文主名保真；内核 # 序号列之外另存原数组位序号列 '#'——
 kw 过滤后序号不串位，与 offset 对照语义不变）；矩阵值标量化：词性列存原码
 （漏斗/右键复制/导出 raw 可查证），中文释义经 #cell-词性 槽 posZh 还原；
 数值三列显式 double（QRT num-col 右对齐 + 双层列头徽标， .num 右对齐随壳并轨）。 */
const AV_TOKEN_COLS = ['#', '词元', '序位', '字符区间', '词性', '长度'];
const AV_TOKEN_TYPES: Record<string, string> = { 序位: 'double', 字符区间: 'double', 长度: 'double' };
const tokenMatrix = computed<any[][]>(() => shownTokens.value.map(({ t, i }) => [
  i + 1, t.token, t.position, `${t.start_offset}-${t.end_offset}`, t.type, t.end_offset - t.start_offset,
]));

interface Preset { name: string; label: string; desc: string; body: string }
const presets: Preset[] = [
  {
    name: 'standard', label: 'standard', desc: 'ES 内置标准分词器：按 Unicode 边界切词 + 小写',
    body: '{\n  "analyzer": "standard",\n  "text": "The quick brown fox jumps over the lazy dog"\n}',
  },
  {
    name: 'ik_smart', label: 'ik_smart', desc: 'IK 分词器·智能模式（中文粗粒度）',
    body: '{\n  "analyzer": "ik_smart",\n  "text": "中华人民共和国国务院发展研究中心"\n}',
  },
  {
    name: 'ik_max_word', label: 'ik_max_word', desc: 'IK 分词器·细粒度（穷举所有可能）',
    body: '{\n  "analyzer": "ik_max_word",\n  "text": "中华人民共和国国务院发展研究中心"\n}',
  },
  {
    name: 'keyword', label: 'keyword', desc: '不分词（整个文本作为单 token）',
    body: '{\n  "analyzer": "keyword",\n  "text": "keep-me-as-one-token"\n}',
  },
  {
    name: 'whitespace', label: 'whitespace', desc: '仅按空白切分，不小写',
    body: '{\n  "analyzer": "whitespace",\n  "text": "Foo BAR baz"\n}',
  },
  {
    name: 'custom_ngram', label: '自定义 ngram', desc: 'tokenizer + filter 自定义组合',
    body: '{\n  "tokenizer": "ngram",\n  "filter": ["lowercase"],\n  "text": "abcdef"\n}',
  },
  {
    name: 'edge_ngram', label: 'edge_ngram', desc: '前缀 ngram（常用于搜索自动补全）',
    body: '{\n  "tokenizer": "edge_ngram",\n  "filter": ["lowercase"],\n  "text": "elasticsearch"\n}',
  },
  {
    name: 'pinyin', label: 'pinyin', desc: '拼音分词器（需插件 elasticsearch-analysis-pinyin）',
    body: '{\n  "analyzer": "pinyin",\n  "text": "中华人民共和国"\n}',
  },
];

/* +1：body 前置 JSON 校验——红字即时跟手（computed），不合法时 run 拦在本地 */
const bodyJsonErr = computed(() => {
  if (!body.value.trim()) return '';
  try { JSON.parse(body.value); return ''; } catch (e: any) {
    return 'body 不是合法 JSON：' + String(e?.message || e).slice(0, 80);
  }
});

async function applyPreset(p: Preset) {
  /* +1：preset 防覆写——body 已手改（非空且与任一 preset 产物都不一致）
 时先确认，拒选则原输入原封不动；preset 间原样切换零打扰。手改后 activePreset
 熄灭（下方 watch 对不齐即清，chip 不撒谎） */
  const pristine = !body.value.trim() || presets.some(pp => pp.body === body.value);
  if (!pristine) {
    if (!await askConfirm({
      level: 'info',
      title: '应用预设「' + p.label + '」',
      message: '当前输入已被手改，应用预设将覆盖当前输入。',
      okText: '覆盖并应用',
    })) return;
  }
  activePreset.value = p.name;
  body.value = p.body;
}
/* 手改（深链预填/编辑等任何改道）后 preset 高亮熄灭——body 与点亮 preset 的产物不一致即清 */
watch(body, v => {
  const lit = presets.find(p => p.name === activePreset.value);
  if (lit && v !== lit.body) activePreset.value = '';
});

async function run() {
  err.value = '';
  errRaw.value = null;
  if (bodyJsonErr.value) { store.notify('warning', 'body 不是合法 JSON，先修好再执行'); return; }
  running.value = true;
  try {
    /* 从 body 提取 text 保存给"原文高亮"用 */
    try {
      const parsed = JSON.parse(body.value);
      lastText.value = String(parsed.text || '');
    } catch { lastText.value = ''; }

    const resp: any = await api.analyze(index.value || undefined, body.value);
    tokens.value = Array.isArray(resp.tokens) ? resp.tokens : [];
    if (!tokens.value.length && resp.detail) {
      /* explain=true 才有 detail 结构；这里简单展示 tokenfilters 最终结果 */
      const filters = resp.detail?.analyzer?.tokens || [];
      tokens.value = filters;
    }
  } catch (e: any) {
    /* +1：错误人话化并轨全站 friendlyEsError 口径（网络层错误不再裸抛英文堆栈串） */
    err.value = friendlyEsError(String(e?.message || e));
    errRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint） */
    tokens.value = [];
  } finally {
    running.value = false;
  }
}

function onEditorKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
}

/* G162：原始 IO 快查（RankDebug 三件套同构）——按本页端点取记录环
 最近一条；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/analyze');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页点一次「运行」（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

async function copyResult() {
  const ok = await copyText(JSON.stringify(tokens.value, null, 2));
  store.notify(ok ? 'success' : 'error', ok ? '已复制 tokens JSON' : '复制失败');
}

/* 分词结果 Markdown 表——# token pos offset type 五列（评估报告直贴）。
 表头/词性中文化（与页面表格同口径），贴群后非 ES 读者也能读 */
async function copyResultMd() {
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '| # | 词元 | 序位 | 字符区间 | 词性 |',
    '| --- | --- | --- | --- | --- |',
    ...tokens.value.map((t: any, i: number) =>
      `| ${i + 1} | ${esc(t.token)} | ${t.position} | ${t.start_offset}-${t.end_offset} | ${esc(posZh(t.type))} |`),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${tokens.value.length} tokens（Markdown）` : '复制失败');
}

/* ═══ ：词性代码中文化（专业词可读性）═══
 两套来源：①IK/中文分词器的词性标注（北大 PKU tagset：nx/nt/nz…）；
 ②ES 内置 type（尖括号：<ALPHANUM>/<NUM>/<CJK>…）。
 显示为「中文 原代码」双写——中文保证可读，原代码保留可查证；
 未知代码原样展示（不猜不编）。w 系细类（wn/wd/wj…）统一归「标点」。 */
const POS_ZH: Record<string, string> = {
  n: '名词', nr: '人名', ns: '地名', nt: '机构团体', nz: '专有名词', nx: '外文词',
  nf: '音译地名', ng: '名词语素', nh: '医药术语', gi: '企业专名', gm: '数学名词', gp: '语法名次',
  v: '动词', vd: '副动词', vn: '名动词', vg: '动词语素',
  a: '形容词', ad: '副形词', ag: '形词语素', an: '名形词',
  b: '区别词', c: '连词', d: '副词', e: '叹词', eng: '英文单词',
  f: '方位词', g: '学术词汇', h: '前缀', i: '成语', j: '简称', k: '后缀', l: '习用语',
  m: '数词', mq: '数量词', mg: '数词语素',
  o: '拟声词', p: '介词', q: '量词', r: '代词', rg: '代词语素', rr: '人称代词',
  s: '处所词', t: '时间词', tg: '时间语素',
  u: '助词', ud: '结构助词「得」', uj: '结构助词「及」', ul: '动态助词「了」', uv: '结构助词「于」', uz: '动态助词「着」',
  x: '非语素字符串', y: '语气词', z: '状态词',
};
const ES_TYPE_ZH: Record<string, string> = {
  '<ALPHANUM>': '字母数字', '<NUM>': '数字', '<LETTER>': '纯字母', '<CJK>': '中日韩文字',
  '<KATAKANA>': '片假名', '<HIRAGANA>': '平假名', '<HANGUL>': '韩文', '<GREEK>': '希腊字母',
  '<CYRILLIC>': '西里尔字母', '<EMOJI>': '表情符号', '<ARABIC>': '阿拉伯文', '<HEBREW>': '希伯来文',
  '<THAI>': '泰文', '<BARMIC>': '缅甸文',
};
function posZh(type: string): string {
  const t = String(type ?? '');
  if (POS_ZH[t]) return `${POS_ZH[t]} ${t}`;
  if (ES_TYPE_ZH[t]) return `${ES_TYPE_ZH[t]} ${t}`;
  if (t.startsWith('w')) return `标点 ${t}`; /* w 系细类（wn/wd/wj…）统一标点 */
  return t;
}
function posTip(type: string): string {
  const t = String(type ?? '');
  const zh = posZh(t);
  return zh === t ? `词性标注：${t}` : `词性：${zh}（分词器输出的原始标注代码）`;
}

/* 稳定 token 色（同 token 复现同一颜色）。
 8 色合并到 --dv-* 数据可视化分类色板，用 color-mix 保持约 13% 透明度并随双主题切换。
 映射：violet/sky/lime/yellow/pink/orange/cyan/purple ← 原 #a78bfa/#38bdf8/#4ade80/#fbbf24/#f472b6/#fb923c/#22d3ee/#c084fc。
 取舍：#4ade80 是纯绿但 --dv-* 无 green token，取最接近的 --dv-lime（黄绿）；
 #fbbf24 与 --warn 暗色值相同，但此处是 token 类型分类色，归入 --dv-yellow 同族。 */
const palette = [
  'color-mix(in srgb, var(--dv-violet) 13%, transparent)',
  'color-mix(in srgb, var(--dv-sky) 13%, transparent)',
  'color-mix(in srgb, var(--dv-lime) 13%, transparent)',
  'color-mix(in srgb, var(--dv-yellow) 13%, transparent)',
  'color-mix(in srgb, var(--dv-pink) 13%, transparent)',
  'color-mix(in srgb, var(--dv-orange) 13%, transparent)',
  'color-mix(in srgb, var(--dv-cyan) 13%, transparent)',
  'color-mix(in srgb, var(--dv-purple) 13%, transparent)',
];
const colorMap = new Map<string, string>();
function colorFor(tk: string): string {
  if (!colorMap.has(tk)) colorMap.set(tk, palette[colorMap.size % palette.length]);
  return colorMap.get(tk)!;
}

/* 原文覆盖：按 tokens 的 start_offset/end_offset 切原文 */
interface Seg { text: string; tk?: Token }
const highlightedSegs = computed<Seg[]>(() => {
  const text = lastText.value;
  if (!text || !tokens.value.length) return text ? [{ text }] : [];
  const sorted = [...tokens.value].sort((a, b) => a.start_offset - b.start_offset);
  const out: Seg[] = [];
  let cur = 0;
  for (const t of sorted) {
    if (t.start_offset > cur) out.push({ text: text.slice(cur, t.start_offset) });
    /* 同起点覆盖只取一个，防重叠导致 cur 回退 */
    if (t.end_offset > cur) {
      out.push({ text: text.slice(t.start_offset, t.end_offset), tk: t });
      cur = t.end_offset;
    }
  }
  if (cur < text.length) out.push({ text: text.slice(cur) });
  return out;
});

/* 1125：深链自动执行也要过身份门——宿主换 token 的窗口里 run() 会带着旧 target
   发 _analyze（结果串到新账号界面）。未放行则挂起，身份落地后补跑一次。 */
const analyzeBoot = useGatedBootRead('analyze', () => consumeDeepLink());

onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  analyzeBoot.run();
});

/* ═══ ：联动深链消费（mapping/settings → 一键验证）═══
 契约：/analyze?idx=<索引>&kind=<analyzer|tokenizer|filter|char_filter|normalizer>&name=<组件名>
 来源：SettingsGrid（analysis 定义/引用行）、MappingFieldTree（字段 attrs 分析器名）。
 预填索引与请求体并自动执行——用户点链接就是要看结果，不再多一步「点执行」。 */
const CUSTOM_COMPONENT_KINDS = ['analyzer', 'tokenizer', 'filter', 'char_filter', 'normalizer'];
function consumeDeepLink() {
  const q = route.query as Record<string, string>;
  const kind = q.kind?.trim();
  const name = q.name?.trim();
  if (!kind || !name || !CUSTOM_COMPONENT_KINDS.includes(kind)) return;
  /* 深链 idx 经 followed 写入——useIdxState 内部 watch 上行 store.pick，
 分享链接打开即全站就位（顶栏同步选中），随后由跟随态带入本页并自动执行 */
  if (q.idx) followed.value = q.idx;
  const text = 'The quick brown fox jumps over the lazy dog. 中华人民共和国国务院发展研究中心';
  const bodies: Record<string, any> = {
    analyzer: { analyzer: name, text },
    tokenizer: { tokenizer: name, text },
    normalizer: { normalizer: name, text },
    filter: { filter: [name], text },
    char_filter: { char_filter: [name], tokenizer: 'standard', text },
  };
  body.value = JSON.stringify(bodies[kind], null, 2);
  run();
}
</script>

<style scoped>
.av { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
/* card 壳退役（552 is-bar/ss-bar/tp-bar 同族漏网收口）——裸行只留竖距与
 border-bottom 分界，横距归页面流 */
.av-bar { padding: var(--sp-2h) 0; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-2); }
.av-bar-row { display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; }
.av-lbl { font-size: var(--fs-sm); color: var(--tx1); font-weight: 400; }
.av-hint { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx2); }
.av-presets { display: flex; flex-wrap: wrap; gap: var(--sp-1h); }
/* .av-th-en（列头英文小字）随 QRT 换壳退役——QRT 列头由列名键渲染，
 英文原文档保序：中文列名键 + Markdown 复制表头（copyResultMd）双语口径不变 */
.chip { cursor: pointer; transition: all var(--tr); }
.chip.on { background: var(--ac-soft); color: var(--ac-hi); border-color: var(--ac-line); font-weight: 400; }

/* 固定等分 grid 退役——双栏交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠）。
 轨4：.card 全局壳随模板类退役（四刀约定③④）——卡头转 fs-head 语言
 （DevTools .dt-pane-tt 同款）：行首横排 + border-bottom 承接分界，内容直贴 pane；
 card-t 全局档无 padding/border，本地补齐。高度链四条规则零变动 */
.av-left, .av-right { display: flex; flex-direction: column; min-height: 400px; }
.av-left > .card-t, .av-right > .card-t { padding: var(--sp-2) var(--sp-3); margin-bottom: 0; border-bottom: 1px solid var(--border); flex-shrink: 0; font-size: var(--fs-sm); }
.av-body-hint { font-size: var(--fs-xs); color: var(--tx2); margin-left: var(--sp-2); }
/* 窄 pane（拖窄/小屏）头部防溢出——此前 card-t 不换行，路径 hint+运行钮被
 右缘裁掉（用户截图运行钮只剩半截「Ctrl」）；标题行可换行 + hint 收缩省略。 */
.av-left .card-t { flex-wrap: wrap; row-gap: var(--sp-1); }
.av-left .av-body-hint { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* pane 填满后卡片跟随撑满（否则 Monaco 下方留 pane 内空白）；394 行 400px 保底保留 */
.av :deep(.rp-content) { display: flex; flex-direction: column; }
.av-left, .av-right { flex: 1 1 auto; }
/* 窄屏 stacked 坍缩修复（BulkEditorView .be-card-editor 同款兜底）——
 .wl.stacked :deep(.resizable-pane){flex:0 0 auto} 使 pane 高回落 auto，.av-left height
 跟着落空，Monaco host 内联 height:calc(100% - 40px) 的百分比解析不到定高祖先=编辑器
 0 高坍缩；flex:1 1 0 让 host 吸收卡内剩余高（body JSON 红字在场时的让高语义由 flex
 自然挤压替代），min-height:260px 兜底保证 stacked 档编辑器不再归零 */
.av-left { height: 100%; }
.av-left > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }
/* (b)：编辑器外框退役（约定③， ST 面 .st-ed-wrap 同语言）——卡头 card-t
 既有 border-bottom 承接分界；原 flex 行被 analyzeLayout525W4b:35 逐字锁钉死，
 剥壳以同选择器独立规则追加（CSS 声明合并语义等价并入），组件本体零触 */
.av-left > :deep(.monaco-host) { border: none; border-radius: 0; }

/* .av-err 私造红壳（padding+err 色+err-soft 底+radius）退役 → 全局 .err-bar 形态
 （theme.css :554 单源，558b pf-err 同语言）——只留多行富内容顶对齐（icon+body 不随 err-bar
 居中）与上间距（err-bar 自带 margin-bottom，顶距补 --sp-2 维持原落位节奏） */
.av-err { align-items: flex-start; margin-top: var(--sp-2); }
.av-err-h { font-weight: 400; font-size: var(--fs-sm); margin-bottom: var(--sp-1); }
.av-err-body { font-size: var(--fs-xs); margin: 0; white-space: pre-wrap; word-break: break-word; }
/* +1：body JSON 前置校验红字（err 档，即时跟手） */
.av-json-err { padding: 0 var(--sp-1) var(--sp-1h); font-size: var(--fs-xs); color: var(--err); word-break: normal; overflow-wrap: anywhere; }

/* 结果区纵缝可调配套——.av-tokens 列向 flex（原文块/表区两段），拖过
 （avSplitH>0）原文定高内滚、表区吃剩余；未拖时原文 flex:0 0 auto 自然高、长文仍由
 .av-tokens overflow 兜底滚动，视觉与原硬堆叠一致 */
.av-tokens { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }
/* 轨4：av-block-t 约定②弱化档（tx2+uppercase+.05em）转正 650/tx1/.02em 行首档
 （540 uq-script-hd 同语言；margin/padding 原值不动） */
.av-block-t { font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; margin: var(--sp-2h) 0 var(--sp-1h); padding: 0 var(--sp-1); }
.av-original { flex: 0 0 auto; overflow: auto; padding-bottom: var(--sp-1h); border-bottom: 1px dashed var(--line); margin-bottom: var(--sp-1h); }
.av-orig-wrap { padding: var(--sp-2h); background: var(--bg2); border-radius: var(--r-s); line-height: 1.8; font-size: var(--fs-sm); }
.av-hl { padding: 1px var(--sp-0); border-radius: 3px; margin: 0 1px; }
.av-plain { color: var(--tx2); }
.av-tk-c { font-size: var(--fs-xs); color: var(--tx2); margin-left: var(--sp-2); }

/* 表区吃纵缝剩余高（原文块拖高时不再被顶出首屏），120px 保底。
 .av-tk-tbl 表体样式（th.num 右对齐/tr.hover/.av-tk-none 无匹配行）随换
 QRT 壳退役——右对齐走内核 num-col（fieldTypes double）、行 hover 内建、无匹配走
 QRT EmptyState（empty-text 动态带过滤词） */
.av-tk-tbl-wrap { flex: 1 1 0; min-height: 120px; padding: 0 var(--sp-1) var(--sp-1); }
.av-tk-hl { padding: 1px var(--sp-1); border-radius: 3px; font-weight: 400; }
.av-tk-type { color: var(--tx2); font-size: var(--fs-xs); }
/* Token 详情过滤行（kw 输入 + 命中计数）；无匹配占位随换壳走 QRT EmptyState */
.av-tk-bar { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
/* width:180px → min(180px,100%) 极窄溢出钳制（XmigrateView .xm-jobs-kw 同款范式，
 .av-tk-bar 已 flex-wrap） */
.av-tk-kw-wrap { width: min(180px, 100%); height: 22px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
.av-tk-hit { text-transform: none; letter-spacing: 0; color: var(--tx2); }
/* .av-ixp 壳层随 IndexPicker 退役删除（CurrentIdxChip 自带胶囊观感） */

/* 窄屏塌单栏：断点值复用 IlmView/TemplatesView 既有的 1000px；
 .av 放开定高让内容撑高，由 .page 承担滚动 */
/* 1100px 自制断点退役——窄屏堆叠由 WorkbenchLayout stacked 档自动处理。 */

/* 900 紧凑微调档（Workbench 五视图之二）——顶栏竖距收一档；
 .av-bar-row 基础态已 flex-wrap:wrap，索引 chip/开关/hint/预设 chips 窄容器自动换行，不再重复。
 原「顶栏侧距 14px 收 --sp-3」档随 card 壳退役删除——裸行横距归页面流 */
@media (max-width: 900px) {
  .av-bar { padding: var(--sp-2) 0; }
}
</style>
