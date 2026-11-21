<template>
  <div class="qx-page">
    <div class="qx-hd">
      <PageHeader :icon="ScanSearch" title="查询 X 光" subtitle="_validate 改写透视（你写的 DSL 实际被 Lucene 改写成什么）+ _termvectors 词频取证">
      <template #actions>
<!-- 页内 IndexPicker 退役换 CurrentIdxChip（W1 只读件，选索引入口收敛顶栏） -->
<CurrentIdxChip />
<!-- G192：tab 组容器语义+双钮动态 pressed（749 G158/743 G154 族同款） -->
<div class="qx-tabs" role="group" aria-label="X 光模式">
  <button class="qx-tab" :class="{ act: tab === 'rewrite' }" :aria-pressed="tab === 'rewrite'" @click="tab = 'rewrite'">
    <Regex :size="12" /> 改写透视
  </button>
  <button class="qx-tab" :class="{ act: tab === 'tv' }" :aria-pressed="tab === 'tv'" @click="tab = 'tv'">
    <BarChart3 :size="12" /> 词频取证
  </button>
        </div>
      </template>
      </PageHeader>
      <LabNav current="/query-xray" />
    </div>

    <!-- 改写透视 -->
    <template v-if="tab === 'rewrite'">
      <!-- 编辑器卡片高度 usePref('qx.taH') 持久化——CSS resize 原生拖拽结束
 （pointerup）把实高落盘，下次进页恢复；默认 260px 保持历史视觉 -->
      <div class="qx-card qx-card-ed" :style="{ height: taH }" @pointerup="saveTaH">
        <div class="qx-card-hd">
<FileJson :size="12" /> Query DSL
<!-- G190：透视钮在途窗三通道（spinning 全局类+「透视中…」文案+disabled 既有；
 751 G185/747 G161 族同款） -->
          <button class="btn primary sm qx-run" @click="runValidate" :disabled="!index || busy"><Play :size="12" :class="{ spinning: busy }" /> {{ busy ? '透视中…' : '透视' }}</button>
          <!-- 原始 IO 快查——本页最近一次 validate-query 请求/响应原文（ioRecorder 记录环） -->
          <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（透视校验）" title="最近一次透视校验请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoValidate"><Terminal :size="12" /> 原始 IO</button>
        </div>
        <JsonArea ref="qxJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="6" fill />
        <!-- 行内 lint 兜底条（此前本页 lint 只有 setMarkers 编辑器划线单通道——
 定位失败进不了 marker 的 finding（unplaced）用户看不见；行内条渲染 qxLint 全量
 findings 兜底，RankDebug/SearchSandbox banner 同款）。error 红条单列（结构必错
 ES 直接拒绝）role=alert，warning/hint 黄条并列 role=status；theme.css lint-bar
 单源直用类名，本页零私造 CSS -->
        <div v-if="qxLintErrors.length" role="alert" class="lint-bar lint-bar-err">
          <span>DSL 检查（错误）：{{ qxLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
        <div v-else-if="qxLintWarns.length" role="status" class="lint-bar lint-bar-warn">
          <span>DSL 检查：{{ qxLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
      </div>
      <!-- 透视失败内联面板：与词频取证的 tvErr 同 .bad 风格，错误现场留存 + 重试。
 裸插值换双轨——标题行走 friendlyEsError 人话 + pre 走 errPreHtml v-html
 全文（对齐 SearchSandbox 口径；errPreHtml 本文件已 import）。
 role=alert 在场（红壳合并波；.qx-verdict.bad verdict 族与 err-bar 同
 token 三件套，保守保形不挂类——同族 ok/bad 结论档共用此壳） -->
      <div v-if="vrErr" role="alert" class="qx-verdict bad qx-err-panel">
        <XCircle :size="15" />
        <div class="qx-err-body">
          <div class="qx-err-h">透视失败 · {{ friendlyVrErr }}</div>
          <pre class="qx-err-pre" v-html="errPreHtml(vrErr, errMeta(vrErrRaw))"></pre>
        </div>
        <button class="btn sm" style="margin-left:auto" @click="runValidate" :disabled="!index || busy">重试</button>
      </div>
      <div v-if="vr" class="qx-verdict" :class="vr.valid ? 'ok' : 'bad'">
        <component :is="vr.valid ? CheckCircle2 : XCircle" :size="15" />
        <b>{{ vr.valid ? '查询合法' : '查询非法' }}</b>
        <!-- 裸 ES 串换 friendlyEsError 显示（title 保原文可悬停回看；
 vrErr 标题行 已是此口径，结论档漏网补齐） -->
        <span v-if="vr.error" class="qx-verr" :title="vr.error">{{ friendlyEsError(vr.error) }}</span>
      </div>
      <div v-for="(ex, i) in vr?.explanations || []" :key="i" class="qx-card" tabindex="0"
        @contextmenu.prevent="openExMenu($event, ex)" @keydown="onExMenuKey($event, ex)" data-row-nav @keydown.self="rowArrowNav">
        <div class="qx-card-hd">
          <Regex :size="12" /> Lucene 实际执行（{{ ex.index }}）
          <button class="btn ghost xs qx-run" @click="copyText(ex.explanation).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制解释全文' : '复制失败'))"><Copy :size="10" /> 复制</button>
        </div>
        <!-- 【W3b】错误分支 err 档（IlmView .ilm-ex-step pre.err 手法）：该索引改写失败时
 输出不再是「解释文本」而是错误现场，视觉上要与正常解释区分。
 error 分支换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文，
 与 DslQueryView 等五处错误面板同内核）；explanation 是纯文本 explain，保持插值 pre 不走 v-html -->
        <pre v-if="ex.explanation" class="qx-lucene">{{ ex.explanation }}</pre>
        <!-- errPreHtml 双参改用（errMeta(ex) 旁路解释对象读 code/endpoint，xm-err 549
 范式；ex 无 code/endpoint 时空 meta 输出与单参逐字一致，errPre524 锚）。
 ⚠qxXrayErrW3b:107 单参锚非同步更新锁留档（解禁后应去本留档并把断言更新为新字面）：
 <pre v-else class="qx-lucene err" v-html="errPreHtml(ex.error || '-')"></pre> -->
        <pre v-else class="qx-lucene err" v-html="errPreHtml(ex.error || '-', errMeta(ex))"></pre>
        <div class="qx-tip">
          <Lightbulb :size="10" />
          读法：<code>field:term</code> 是最终查的词（已过分词器）；<code>~n</code> 是模糊/slop；<code>()^boost</code> 是加权；
          看到 <code>MatchNoDocsQuery</code> = 这条子句永远查不到东西
        </div>
      </div>
      <!-- rewrite 是默认标签页，原先只有 term-vectors 分支有空态：
 一进页面就是「编辑框 + 426px 纯空白」（实测卡片底 534、可用区底 960）。
 空态占满剩余高度，既消除死白又告诉用户下一步做什么。 -->
      <EmptyState v-if="!vr && !vrErr && !busy" :icon="Regex" class="qx-empty-fill"
                  text="尚未改写查询"
                  hint="上方写 DSL 后点「改写」，这里会显示 ES 内部真正执行的 Lucene 查询" />
    </template>

    <!-- 词频取证 -->
    <template v-else>
      <div class="qx-row">
<!-- G191：tv 输入行 label 悬停中文释义（英文键留检索=745 G156 双语同款） -->
        <label class="qx-inp grow"><span title="要取证的文档 _id">doc _id</span>
          <!-- placeholder 补来源引导（_explain 404 档 esError 文案同方向：
 不存在的 id 先去数据浏览页找一个真实的） -->
          <input v-model="tvId" class="qx-ii wide" placeholder="要取证的文档 _id（可在数据浏览页复制）" @keyup.enter="runTv" />
        </label>
        <label class="qx-inp grow"><span title="要取词频的字段列表，逗号分隔；空 = 全部 text 字段">fields</span>
          <!-- 【W3b】text 置顶（typePriority 只重排候选分组，「空 = 全部 text 字段」语义下 text 是主战场），候选集不变 -->
          <FieldPicker v-model="tvFields" :index="index" multi placeholder="逗号分隔，空 = 全部 text 字段" width="100%" class="qx-ii wide" :type-priority="['text']" />
        </label>
        <!-- G190：取证钮在途窗三通道（同透视钮）+G191：统计行悬停中文释义 -->
        <button class="btn primary sm" @click="runTv" :disabled="!index || !tvId || busy"><Play :size="12" :class="{ spinning: busy }" /> {{ busy ? '取证中…' : '取证' }}</button>
        <!-- 原始 IO 快查——本页最近一次 term-vectors 请求/响应原文（ioRecorder 记录环；
 词频结果卡头在 v-for 内，钮落取证操作行防每字段卡重复） -->
        <button class="btn ghost sm" data-test="raw-io-tv" aria-label="查看原始 IO（词频取证）" title="最近一次词频取证请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoTv"><Terminal :size="12" /> 原始 IO</button>
      </div>
      <!-- tvErr 错误条补 role=alert（vrErr 面板 同款，失败反馈可被读屏播报） -->
      <div v-if="tvErr" role="alert" class="qx-verdict bad"><XCircle :size="15" /> {{ tvErr }}</div>
      <div v-for="(fv, fname) in tvData" :key="fname" class="qx-card">
        <div class="qx-card-hd">
          <BarChart3 :size="12" /> {{ fname }}
          <span class="qx-fstat" title="字段全局统计：doc_count=该字段的文档总数，sum_ttf=该字段的词频总和">
            字段全局：doc_count={{ fmtNum(fv.field_statistics?.doc_count) }} ·
            sum_ttf={{ fmtNum(fv.field_statistics?.sum_ttf) }}
          </span>
        </div>
        <!-- 每卡工具行——term kw 过滤（行数 >20 才出，ReconcileReportDrawer 先例）
 + doc_freq min/max 区间（Number 比较，空=不设限）+ 表复制 TSV/MD（matrixText 内核）；
 行集=termRows 产出后经 tvViewMap 过滤（所见即所复制） -->
        <div class="qx-tv-tools">
          <!-- 轨4：term kw 过滤改用 SearchFilterBar 单源（sfbUnify650 锁）——
 model-value 定向 setTvTool 形态保留，num 区间双输入异形不收 -->
          <SearchFilterBar v-if="(tvViewMap[fname]?.total ?? 0) > 20" class="qx-tv-kw" :model-value="tvTools[fname]?.kw ?? ''" input-class="qx-tv-inp" placeholder="过滤 term…" @update:model-value="setTvTool(fname, 'kw', $event)" />
          <label class="qx-tv-range">doc_freq
            <input class="qx-tv-inp num" :value="tvTools[fname]?.min ?? ''" placeholder="min 不限" aria-label="doc_freq 最小值"
                   @input="setTvTool(fname, 'min', ($event.target as HTMLInputElement).value)" />
            ≤
            <input class="qx-tv-inp num" :value="tvTools[fname]?.max ?? ''" placeholder="max 不限" aria-label="doc_freq 最大值"
                   @input="setTvTool(fname, 'max', ($event.target as HTMLInputElement).value)" />
          </label>
          <span class="qx-tv-n mono">{{ tvViewMap[fname]?.rows.length ?? 0 }}/{{ tvViewMap[fname]?.total ?? 0 }}</span>
          <button class="btn xs ghost" :disabled="!tvViewMap[fname]?.rows.length" @click="copyTv(fname, 'tsv')" title="词频表复制为 TSV（Excel/飞书直贴）">TSV</button>
          <button class="btn xs ghost" :disabled="!tvViewMap[fname]?.rows.length" @click="copyTv(fname, 'md')" title="词频表复制为 Markdown（文档/群聊直贴）">MD</button>
        </div>
        <!-- term 统计裸表换 QRT rows 型（qrtRowsSwap529 先例，先列锚清单再动手）——
 排序/列漏斗/右键/导出归内核；每卡工具行（kw/区间/TSV·MD 复制）留视图
 （tvTools/tvViewMap 语义零改，QRT 行集=过滤后视图行）；term 列 MarkText/gotoAnalyzer、
 稀有度徽标经 #cell- 槽保真；空匹配走内核空态（文案逐字保留） -->
        <QueryResultTable
          :cols="['term', 'tf', 'doc_freq', 'ttf', '稀有度']"
          :rows="tvQRows(fname)" sortable
          storage-key="xray:tv"
          :field-types="{ tf: 'long', doc_freq: 'long', ttf: 'long' }"
          export-name="xray-termvectors"
          empty-text="无匹配 term"
          max-height="42vh"
        >
          <template #cell-term="{ value }">
            <MarkText :text="value" :kw="tvTools[fname]?.kw ?? ''" />
            <button aria-label="把这个词送去「分词实验室」看各 analyzer 怎么切" class="qx-term-link" @click="gotoAnalyzer(String(value))" title="把这个词送去「分词实验室」看各 analyzer 怎么切"><FlaskConical :size="10" /></button>
          </template>
          <template #cell-稀有度="{ value }"><span class="qx-rare" :class="rareClsOf(String(value))">{{ value }}</span></template>
        </QueryResultTable>
      </div>
      <EmptyState v-if="!Object.keys(tvData).length && !tvErr && !busy" :icon="BarChart3" class="qx-empty-fill"
        text="尚无词向量数据"
        hint="输入文档 _id 点「取证」——看它每个词的 tf / doc_freq / ttf；稀有词（doc_freq 小）= idf 高 = 打分里的黄金词" />
    </template>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取透视/词频各自最近一条记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1179：Lucene 实际执行卡片右键（排障时要「只抄索引名」「只抄某段」而不是整段） -->
    <CellContextMenu v-if="exMenu" :x="exMenu.x" :y="exMenu.y"
      :title="'实际执行 · ' + exMenu.ex.index" :items="exMenuItems" @close="exMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ScanSearch, Regex, BarChart3, FileJson, Play, CheckCircle2, XCircle, Copy, Lightbulb, FlaskConical, Terminal, Braces, Info } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { useAppStore } from '../stores/app';
import { useIdxState, usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（660 范式） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：lint 划线防抖统一件 */
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检（此前 dsl-assist 已接但零纠错）； type Finding 随闭包变量退役 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import FieldPicker from '../components/FieldPicker.vue';
import MarkText from '../components/MarkText.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 轨4：term kw 过滤胞改用统一件（sfbUnify650 锁） */
import { copyText as clipboardCopy, fmtNum } from '../utils/format';
import { matrixText } from '../utils/copyMatrix';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；534 收口波：双参改用（errMeta 旁路） */
import { friendlyEsError } from '../utils/esError'; /* ：错误标题行人话 */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
/* 裸 sessionStorage 收发换 useLinkCarry 统一件（530 W-D 遗留清单合并，
 键与 payload 逐字保持：analyzer {index,text} / xray {index,id}） */
import { useLinkCarry } from '../composables/useLinkCarry';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import JsonArea from '../components/JsonArea.vue';
import EmptyState from '../components/EmptyState.vue';
import QueryResultTable from '../components/QueryResultTable.vue'; /* ：term 表换壳 */

const router = useRouter();
const store = useAppStore();

/* 1179：Lucene 实际执行卡片右键。排障时常见诉求是「只抄索引名去建任务」
 「只抄 MatchNoDocsQuery 那几行」「把这条解释存进工单」——全段复制再手删太慢。
 一级只留最高频两项，其余收进「更多…」二级（全站右键同一规矩）；只读安全。 */
const exMenu = ref<{ x: number; y: number; ex: any } | null>(null);
function openExMenu(e: MouseEvent, ex: any) {
  exMenu.value = { x: e.clientX, y: e.clientY, ex };
}
function onExMenuKey(e: KeyboardEvent, ex: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  exMenu.value = { ...menuKeyAnchor(e), ex };
}
async function copyEx(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const exMenuItems = computed<CcmItem[]>(() => {
  const m = exMenu.value; if (!m) return [];
  const ex = m.ex;
  const full = String(ex.explanation ?? ex.error ?? '');
  /* 「永远查不到东西」的子句是排障第一现场：摘出来单独能给 */
  const noDocs = full.split(/\r?\n/).filter((l: string) => /MatchNoDocsQuery|MatchAllDocsQuery/.test(l)).join('\n');
  return [
    { key: 'ex-copy-all', label: '复制解释全文', icon: Copy, run: () => copyEx(full, '已复制解释全文') },
    { key: 'ex-copy-index', label: '只复制索引名', icon: Info, run: () => copyEx(String(ex.index ?? ''), '已复制索引名：' + ex.index) },
    {
      key: 'ex-more', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'ex-copy-nodocs', label: '只复制「永远查不到」的子句', icon: Braces,
          run: () => (noDocs ? copyEx(noDocs, '已复制 MatchNoDocsQuery 子句') : store.notify('info', '这条解释里没有 MatchNoDocsQuery')) },
        { key: 'ex-copy-json', label: '复制整条解释 JSON', icon: Braces, run: () => copyEx(JSON.stringify(ex, null, 2), '已复制解释 JSON') },
      ],
    },
  ];
});
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
/* Query DSL 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
 fields() 侧惰性 ensure 改挂载即 ensure（SearchSandboxView watch immediate 范式，
 只读 mapping 请求、失败零降级）——补全首轮不再承担首拉，fields() 退役为纯读；
 索引切换跟随重拉 */
const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);
watch(index, () => { void ensureAssistFields(); }, { immediate: true });
/* terms 闭包接线——索引源=index 与 fields 同源现调现读（suggestAsync 防抖/TTL/stash 单源内建） */
const qxTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => assistFields.value, terms: (f: string, p: string) => qxTerms.suggestAsync(f, p) };
const tab = ref<'rewrite' | 'tv'>('rewrite');
const busy = ref(false);
/* 编辑器卡片高度记忆（usePref 偏好键 qx.taH）——卡片 resize:vertical 原生拖拽
 结束时读实高落盘（内容变化不改容器高，Monaco 内滚，故只需 pointerup 一个时机） */
const taH = usePref<string>('qx.taH', '260px');
function saveTaH(e: PointerEvent) {
  const h = Math.round((e.currentTarget as HTMLElement).getBoundingClientRect().height);
  if (h > 0) taH.value = h + 'px';
}

/* DSL 进 sessionStorage 草稿——刷新不丢稿（可重入） */
/* 草稿：DSL 草稿迁 useScopedDraft（按 集群/索引 隔离），行为不变 */
const dsl = useScopedDraft('dsl', {
  route: 'query-xray',

  index: () => index.value,
}, JSON.stringify({ query: { match: { your_field: '关键词' } } }, null, 2)).text;

/* lint findings 注入编辑器划线（SearchSandboxView 范式：debounce 250ms 防每敲一键
 全量 findMatches；info 降级 hint——MonacoEditor marker 档只收 warning/hint/error）。
 本页此前 dsl-assist 已接但零纠错，补 lintDsl 一路；JSON 非法时静默清 markers
 （JsonArea 圆点已报，执行时后端会给出真实错误）。 */
const qxJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* lintDsl 提 computed 单源（RankDebug rdLint 同范式）——行内兜底条实时重估，
 setMarkers 防抖通道消费同一 findings；unplaced 兜底=行内条显示全量 findings。
 JSON 非法时静默清 markers（JsonArea 圆点已报，执行时后端会给出真实错误）。 */
const qxLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: assistFields.value }); }
  catch { return []; }
});
const qxLintErrors = computed(() => qxLint.value.filter(f => f.severity === 'error'));
const qxLintWarns = computed(() => qxLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
const queueLintMarkers = useDebounceFn(() => {
  qxJaRef.value?.setMarkers?.(qxLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queueLintMarkers(); }, { immediate: true });
const vr = ref<any>(null);
const vrErr = ref(''); // 透视失败全文，内联 .bad 面板留存（与 tvErr 同模式）
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const vrErrRaw = ref<unknown>(null);
/* 错误标题行人话（pre 保留全文，双轨范式） */
const friendlyVrErr = computed(() => friendlyEsError(vrErr.value));

const tvId = ref('');
const tvFields = ref('');
const tvData = ref<Record<string, any>>({});
const tvErr = ref('');

async function runValidate() {
  let body: any;
  try { body = JSON.parse(dsl.value); }
  catch (e: any) { store.notify('error', 'JSON 解析失败：' + e.message); return; }
  busy.value = true;
  vr.value = null;
  vrErr.value = '';
  vrErrRaw.value = null;
  try {
    const r: any = await api.validateQuery(index.value, JSON.stringify({ query: body.query || body }));
    if (r?.error && r.message) throw new Error(r.message);
    vr.value = r;
  } catch (e: any) {
    vrErr.value = String(e?.message || e);
    vrErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    store.notify('error', '透视失败：' + friendlyEsError(String(e?.message ?? e))); /* ：toast 裸串并轨（vrErr 面板标题行 同口径） */
  } finally { busy.value = false; }
}

async function runTv() {
  busy.value = true;
  tvErr.value = '';
  tvData.value = {};
  /* 新查询清上一轮工具态（字段集可能不同，残留 kw/区间会静默滤掉新词） */
  Object.keys(tvTools).forEach(k => delete tvTools[k]);
  try {
    const r: any = await api.termVectors(index.value, tvId.value.trim(), tvFields.value.trim() || undefined);
    if (r?.error && r.message) throw new Error(r.message);
    if (r?.found === false) { tvErr.value = `文档 ${tvId.value} 不存在`; return; }
    tvData.value = r?.term_vectors || {};
    if (!Object.keys(tvData.value).length) {
      tvErr.value = '无词向量返回：字段可能不是 text 类型，或需要指定 fields';
    }
  } catch (e: any) {
    /* catch 补 tvErr 内联（错误条 :96 现成，vrErr 面板同模式）——
 此前取证异常只一闪 toast、内联条恒空；found===false/空词向量两分支既有赋值零动 */
    tvErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '取证失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

/* 原始 IO 快查（546 六页同款三件套；545 Adhoc 双钮先例）——透视/词频两通道
 各取各的记录（validate-query / term-vectors 前缀互不混淆）；判空 rec=null 时 notify 引导，
 不开空弹窗。共用同一弹窗宿主 rawIoShow/rawIoRec，先后点开互不残留 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIoValidate() {
  const rec = ioRecorder.last('/cluster/validate-query');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
function openRawIoTv() {
  const rec = ioRecorder.last('/cluster/term-vectors');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

function termRows(fv: any) {
  const docCount = Number(fv?.field_statistics?.doc_count) || 0;
  const terms = fv?.terms || {};
  const rows = Object.keys(terms).map(term => {
    const t = terms[term];
    const docFreq = Number(t.doc_freq) || 0;
    const ratio = docCount ? docFreq / docCount : 0;
    let rareLabel = '普通', rareCls = 'mid';
    if (ratio > 0 && ratio <= 0.01) { rareLabel = '★★★ 极稀有'; rareCls = 'hi'; }
    else if (ratio <= 0.1) { rareLabel = '★★ 稀有'; rareCls = 'hi2'; }
    else if (ratio >= 0.5) { rareLabel = '烂大街'; rareCls = 'lo'; }
    return { term, tf: t.term_freq ?? '-', docFreq: t.doc_freq ?? '-', ttf: t.ttf ?? '-', ratio, rareLabel, rareCls };
  });
  rows.sort((a, b) => a.ratio - b.ratio); // 稀有的排前面
  return rows;
}

/* ═══ ：词频表每卡工具行（kw + doc_freq 区间 + TSV/MD 复制）═══
 工具态按字段名挂 reactive Map；tvViewMap 在 termRows 产出后套 computed
 （单文档词表量小，全字段一次算齐）。kw 口径=term 子串小写包含；
 doc_freq min/max 为 Number 区间比较（空串=该端不设限，非数字输入视同空）。 */
interface TvTool { kw: string; min: string; max: string }
const tvTools = reactive<Record<string, TvTool>>({});
function setTvTool(fname: string, side: 'kw' | 'min' | 'max', v: string) {
  if (!tvTools[fname]) tvTools[fname] = { kw: '', min: '', max: '' };
  tvTools[fname]![side] = v;
}
const tvViewMap = computed(() => {
  const out: Record<string, { rows: any[]; total: number }> = {};
  for (const fname of Object.keys(tvData.value)) {
    const all = termRows(tvData.value[fname]);
    const t = tvTools[fname];
    const k = (t?.kw ?? '').trim().toLowerCase();
    const min = t?.min?.trim() ? Number(t.min) : null;
    const max = t?.max?.trim() ? Number(t.max) : null;
    const rows = !k && min === null && max === null ? all : all.filter(r => {
      if (k && !r.term.toLowerCase().includes(k)) return false;
      const df = Number(r.docFreq);
      if (min !== null && Number.isFinite(min) && !(Number.isFinite(df) && df >= min)) return false;
      if (max !== null && Number.isFinite(max) && !(Number.isFinite(df) && df <= max)) return false;
      return true;
    });
    out[fname] = { rows, total: all.length };
  }
  return out;
});
/* 表复制：过滤后行集（所见即所复制），列=表格五列 */
function copyTv(fname: string, ext: 'tsv' | 'md') {
  const rows = tvViewMap.value[fname]?.rows ?? [];
  if (!rows.length) return;
  const pick: Record<string, (r: any) => any> = {
    term: r => r.term, tf: r => r.tf, doc_freq: r => r.docFreq, ttf: r => r.ttf, 稀有度: r => r.rareLabel,
  };
  const text = matrixText({ rows, cols: ['term', 'tf', 'doc_freq', 'ttf', '稀有度'], getVal: (r, c) => pick[c]?.(r) }, ext);
  copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制 ${fname} 词频表 ${rows.length} 行（${ext.toUpperCase()}）` : '复制失败'));
}

/* ═══ ：term 统计表 QRT rows 型数据映射 ═══
 行=termRows 产出后经 tvViewMap 过滤的视图行（所见即所排）；termRows 的 rareCls 仍为
 稀有度色档单一真源，矩阵只落 rareLabel 标量、#cell-稀有度 槽经 rareClsOf 反查还原色档。 */
function rareClsOf(label: string): string {
  return label === '★★★ 极稀有' ? 'hi'
    : label === '★★ 稀有' ? 'hi2'
    : label === '烂大街' ? 'lo'
    : 'mid';
}
function tvQRows(fname: string): any[][] {
  return (tvViewMap.value[fname]?.rows ?? []).map(t => [t.term, t.tf, t.docFreq, t.ttf, t.rareLabel]);
}

/* 透传布尔结果（此前吞掉 clipboardCopy 结果永远报成功） */
function copyText(s: string) {
  return clipboardCopy(s || '');
}

/* ==================== ：实验室联动 ==================== */
/* 接收「打分解剖」送来的文档 —— 自动切到词频取证并开查。
 接收侧换 useLinkCarry 统一件（键 esquerystudio.link.xray 与 payload
 {index,id} 逐字保持，发送方 ScoreExplain 零改；receive 取后即焚语义同旧三行）。 */
const xrayCarry = useLinkCarry<{ index?: string; id?: string }>('xray');
/* 1125：联动 id 可能来自上一账号的现场——身份未落地就开查会把旧 target 的词频/文档
   拉进新会话。payload 取后先暂存，门放行才消费；未放行则等身份落地补跑一次。 */
let xrayPendingCarry: { index?: string; id?: string } | null = null;
function applyXrayCarry(p: { index?: string; id?: string }) {
  if (p.index) index.value = p.index;
  if (p.id) { tab.value = 'tv'; tvId.value = p.id; if (index.value) runTv(); }
}
const xrayBootGate = useGatedBootRead('query-xray', () => {
  const p = xrayPendingCarry;
  if (!p) return;
  xrayPendingCarry = null;
  applyXrayCarry(p);
});
onMounted(() => {
  const p = xrayCarry.receive();
  if (!p) return;
  if (!xrayBootGate.allowed()) { xrayPendingCarry = p; xrayBootGate.run(); return; }
  applyXrayCarry(p);
});
/* term 一键送去分词实验室——：发送侧换 useLinkCarry（键
 esquerystudio.link.analyzer 与 payload {index,text} 逐字保持，消费方 AnalyzerLab 零改） */
const analyzerCarry = useLinkCarry<{ index: string; text: string }>('analyzer');
function gotoAnalyzer(term: string) {
  analyzerCarry.send({ index: index.value, text: term });
  router.push('/analyzer-lab');
}
</script>

<style scoped>
/* height:100% 让页面吃满 .page 可滚区（默认只有内容高，实测下方空出 695px 纯死白）。
 min-height 而非 height：结果多时仍要能撑高滚动，不被截断。 */
.qx-page { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
.qx-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* Lead 收尾：.qx-hd-l/ic/tt/sub/r 五类子规则删除——标题区已 PageHeader 化，模板零引用死 CSS */
/* qx-tabs 容器框退役（约定④，dq-sw 先例：去 bg2+border+radius 容器条框，
 内容直贴）；tab 本身控件语义/act 态保留 */
.qx-tabs { display: flex; gap: var(--sp-1); }
.qx-tab { display: inline-flex; align-items: center; gap: 5px; border: none; background: transparent; color: var(--tx1); font-size: var(--fs-xs); padding: 5px var(--sp-3); border-radius: var(--r-s); cursor: pointer; transition: all var(--tr); font-family: var(--font); }
.qx-tab:hover { color: var(--tx0); }
.qx-tab.act { background: var(--bg3); color: var(--tx0); font-weight: 600; box-shadow: var(--shadow-s); }
.qx-inp { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); }
.qx-inp.grow { flex: 1; min-width: 200px; }
.qx-ii { width: min(170px, 100%); padding: var(--sp-1) var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-s); background: transparent; color: inherit; font-size: var(--fs-sm); } /* ：断点钳 min()（529 ④ BrowserView/AnalyzeView 同款范式）——基样式宽在极窄容器不撑破父级 */
.qx-ii.wide { flex: 1; width: auto; }
.qx-row { display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; }
/* 三消费面（编辑器卡/执行解释卡/词频取证卡）带框壳退役（约定③编辑器外框+
 约定④；SearchTemplatesView st-card 同语言）——内容直贴，分界由 qx-card-hd
 border-bottom 承接；overflow:hidden 保留（.qx-card-ed 的 CSS resize 手柄生效条件，
 无 radius 后无视觉差） */
.qx-card { border: 0; border-radius: 0; overflow: hidden; }
/* 编辑器卡片吃掉页面剩余高度：结果区（透视结论 / Lucene 输出）按内容高，
 剩下的都归编辑框——原来编辑框只有 123px，下方 695px 全是死白。
 min-height:220px 保证结果很长把页面撑高时编辑框不被压到不可用。 */
/* 复盘：只写 flex:1 会让编辑器吃掉整屏富余高度 —— 实测 780px，
 内容仅 7 行、框内 16% 是空白。DSL 通常十几行，420px 足够；
 上限之外的高度回流给下方结果区，这才是「编辑框够用 + 页面不留死白」的平衡。 */
/* 编辑器高度跟随内容、不固定撑高：flex:none + min-height 保底 + max-height 封顶。
 实测 flex:1 会把它钉在上限（354px）而 DSL 只有 7 行，框内约 200px 是空白——
 那是把「框太小」换成了「框内虚高」。余量交给下方结果区/空态。 */
/* 定高改 usePref 接管（默认 260px 同旧值）+ resize:vertical 原生拖拽——
 拖拽结束经 pointerup 落盘 qx.taH，刷新/回页不丢；（.qx-card 自带 overflow:hidden，
 满足 CSS resize 生效条件，手柄出在卡片右下角） */
.qx-card-ed { display: flex; flex-direction: column; flex: none; resize: vertical; }
/* JsonArea 自身已是 flex 纵向容器；只在本视图内接线让它随卡片长高，不改共享组件 */
.qx-card-ed :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.qx-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
.qx-run { margin-left: auto; }
.qx-verdict { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2h) 14px; border-radius: var(--r-m); font-size: var(--fs-sm); }
.qx-verdict.ok { background: var(--ok-soft); color: var(--ok); border: 1px solid var(--ok-line); }
/* bad 档 err-bar 同源 token （var(--err)/var(--err-soft)/var(--err-line)
 三件套与 theme.css .err-bar 逐一同名——头注「保守保形不挂类」的 token 面即此，
 防漂移只认这三个变量，禁手写色值） */
.qx-verdict.bad { background: var(--err-soft); color: var(--err); border: 1px solid var(--err-line); }
/* 双轨错误面板（friendly 标题行 + errPreHtml 全文 pre），多行内容顶对齐 */
.qx-err-panel { align-items: flex-start; }
.qx-err-body { flex: 1; min-width: 0; }
.qx-err-h { font-weight: 600; }
.qx-err-pre { margin: var(--sp-1) 0 0; font-family: var(--mono, monospace); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
.qx-verr { font-size: var(--fs-xs); font-family: var(--mono, monospace); opacity: .9; }
/* 词频取证页没有编辑器吃 flex 余量，空态用 margin:auto 在整片余量里居中。
 不用父级 justify-content:center——那在可滚容器里会裁掉溢出内容顶部且滚不回去。 */
/* flex:1 吃掉编辑器下方的剩余高度（margin:auto 只负责在其中居中）——
 只写 margin:auto 时空态仍是内容高，下方留一大片死白（实测 426px）。 */
.qx-empty-fill { flex: 1; margin: auto; }
.qx-lucene { margin: 0; padding: var(--sp-3); font-size: var(--fs-sm); font-family: var(--mono, monospace); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; background: color-mix(in srgb, var(--dv-pink) 4%, transparent); }
/* 【W3b】改写失败现场的 err 档（同 IlmView pre.err：soft 底 + err 字色 + 左描边） */
.qx-lucene.err { background: var(--err-soft); color: var(--err); border-left: 3px solid var(--err); }
.qx-tip { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; padding: var(--sp-1h) var(--sp-2h); font-size: var(--fs-xs); opacity: .65; border-top: 1px dashed var(--border); }
.qx-tip code { background: var(--bg2); padding: 0 var(--sp-1); border-radius: 3px; }
.qx-fstat { margin-left: auto; font-size: var(--fs-xs); color: var(--tx2); font-weight: 400; font-family: var(--mono, monospace); }
/* 旧 term 裸表样式全家（表高封顶/粘顶表头/行语言，含 末行双线修复）
 随换 QRT 壳退役（归内核单一出处；空匹配语义由内核空态 empty-text 承接） */
/* 每卡工具行（kw/doc_freq 区间/计数/TSV·MD 复制） */
.qx-tv-tools { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-1h) var(--sp-2h); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); color: var(--tx2); }
.qx-tv-inp { padding: 3px var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-s); background: transparent; color: inherit; font-size: var(--fs-xs); }
.qx-tv-inp.num { width: 88px; }
/* 轨4：term kw 胞改用 SFB 落位类（input-class qx-tv-inp 仅运行时锚，scoped 样式不再命中内层 input） */
.qx-tv-kw { width: 150px; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-xs); flex-shrink: 0; }
.qx-tv-range { display: inline-flex; align-items: center; gap: var(--sp-1); }
.qx-tv-n { color: var(--tx2); }
.qx-rare { font-size: var(--fs-xs); padding: 1px var(--sp-1h); border-radius: 3px; }
.qx-rare.hi { color: var(--warn); background: var(--warn-soft); font-weight: 650; }
.qx-rare.hi2 { color: var(--dv-violet); background: color-mix(in srgb, var(--dv-violet) 10%, transparent); }
.qx-rare.mid { opacity: .5; }
.qx-rare.lo { color: var(--dv-slate); background: color-mix(in srgb, var(--dv-slate) 12%, transparent); }
.qx-term-link { border: none; background: transparent; color: inherit; cursor: pointer; opacity: 0; padding: 0 var(--sp-0); vertical-align: middle; }
tr:hover .qx-term-link { opacity: .55; }
.qx-term-link:hover { opacity: 1 !important; color: var(--ac); }

/* 宿主 iframe 最窄 ~866px 档（ProfileFlame 524 同口径）——取证输入行纵向
 堆叠；档内禁 ≥300px 裸 width（仓规），全文禁 901px+ 倒挂 min-width 档 */
@media (max-width: 900px) {
  .qx-row { flex-direction: column; align-items: stretch; }
  .qx-tv-inp.num { width: 72px; }
}
</style>
