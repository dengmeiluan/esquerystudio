<template>
  <div class="bt-page">
    <div class="bt-hd">
      <PageHeader :icon="SlidersHorizontal" title="Boost 调参沙盒" subtitle="拖字段权重 → 重跑对比 → 排名 ↑↓ 一眼定输赢 · 满意后导出 DSL">
      <template #actions>
<!-- 页内 IndexPicker 退役换 CurrentIdxChip（W1 只读件，选索引入口收敛顶栏） -->
<CurrentIdxChip />
<label class="bt-switch" :title="live ? '每次调整立即重跑（打真集群，小心生产）' : '手动点「重跑对比」（生产推荐）'">
  <input type="checkbox" class="tgl" v-model="live" />
  <span>{{ live ? '⚡ 即时模式' : '🛡 手动模式' }}</span>
</label>
      </template>
      </PageHeader>
      <LabNav current="/boost-tuner" />
</div>

    <!-- 接统一可调工作台（继 406/407 后第三视图）——参数栏可折叠+拖拽调宽+偏好记忆 -->
    <WorkbenchLayout :scope="btScope" :panes="BT_PANES" axis="vertical" mode="tuner">
      <template #pane-boosttuner-params>
      <div class="bt-left">
        <!-- 搜索词整卡并入字段权重卡作首行，共享一条卡头（独立小卡退役）。
 轨4：.bt-card 壳（border+radius）退役——pane 即容器内容直贴，
 分界由 bt-card-hd border-bottom 承接（刀③④） -->
        <div class="bt-sec">
          <div class="bt-card-hd">
            <Search :size="12" /> 搜索词 · 字段权重
            <!-- 计数徽标（qtp-cnt 形态，N>10 转 hot）+ 启停全部 -->
            <!-- 计数徽标改用 StatusPill 统一件（默认中性计数→n、N>10 原 hot warn 档→y；
 停用尾注并入 label，语义逐字不变；bt-cnt 锚类保留作 DOM 锚，
 xs 档对齐原 2xs，皮归 .pill 单源——bt-drop-chip 551 先例同谱系） -->
            <StatusPill class="bt-cnt xs" :tone="fields.length > 10 ? 'y' : 'n'" :label="`共 ${fields.length} 字段${offCount ? ' · 停用 ' + offCount : ''}`" />
            <button class="btn ghost xs" :disabled="!fields.length" :title="allOn ? '全部停用（停用行不参与打分与生成 DSL）' : '全部启用'" @click="toggleAllFields">{{ allOn ? '全部停用' : '全部启用' }}</button>
            <button class="btn ghost xs bt-add" @click="addField"><Plus :size="10" /> 加字段</button>
          </div>
          <!-- 548 F：搜索词值位候选——keyword input 挂 datalist（轻量形态，浏览器原生前缀
 过滤；候选源与 LuceneInput 值位 keyword 档同内核 useTermsSuggest） -->
          <input v-model="keyword" class="bt-kw" placeholder="输入要搜索的关键词" list="bt-kw-candidates" @keyup.enter="run(true)" @keydown.esc.prevent="keyword = ''" />
          <datalist id="bt-kw-candidates">
            <option v-for="v in kwCandidates" :key="v" :value="v" />
          </datalist>
          <!-- 字段名过滤（computed 真过滤行集——扁平数组用真过滤而非 DOM 扫描） -->
          <!-- 轨4：字段名过滤改用 SearchFilterBar 单源（sfbUnify650 锁）——
 Esc 清空转组件内建（原 @keydown.esc 行为等价），aria-label 由 placeholder 兼任 -->
          <SearchFilterBar v-if="fields.length" v-model="fieldKw" class="bt-fkw-wrap" input-class="bt-fkw" placeholder="过滤字段名…" />
          <!-- 真空态合并 EmptyState compact（文案逐字保留，pane 窄栏走 compact） -->
          <EmptyState v-if="!fields.length" compact :icon="Plus" text="点「加字段」，输入参与打分的字段名" />
          <div v-for="x in shownFields" :key="x.i" class="bt-field"
               @contextmenu.prevent="openRowMenu($event, x)"
               @keydown="onRowKey($event, x)">
            <!-- 行级停用位（checkbox；draft 旧形状无 disabled 字段按启用处理零迁移，
 builtQuery 同步滤除停用行） -->
            <input type="checkbox" class="bt-fen" :checked="x.f.disabled !== true"
                   :aria-label="(x.f.disabled !== true ? '停用' : '启用') + '字段 ' + (x.f.name || '未命名')"
                   title="停用后不参与打分与生成 DSL"
                   @change="x.f.disabled = !($event.target as HTMLInputElement).checked; onTune()" />
            <!-- 【W3b】text/keyword 置顶（multi_match 打分字段以文本类为主），候选集不变 -->
            <FieldPicker v-model="x.f.name" :index="index" placeholder="字段名" class="bt-fname" :type-priority="['text', 'keyword']" @picked="onTune" />
            <!-- 滑杆补动态权重提示（×N 随行值实时刷新；multi_match fields
 提权系数语义与 bt-boost hot/cold 色档同口径）。 G247：
 补动态 aria-label（字段名+权重倍数）——title 之外读屏第二通道，多行滑杆可区分 -->
            <input type="range" v-model.number="x.f.boost" min="0" max="10" step="0.1" class="bt-slider"
                   :aria-label="'字段 ' + (x.f.name || '未命名') + ' 权重倍数（multi_match 提权系数）'"
                   :title="'权重 ×' + fmtBoost(x.f.boost) + '：multi_match fields 提权系数，>1 加权 <1 降权'"
                   @change="onTune" />
            <span class="bt-boost" :class="{ hot: x.f.boost > 1, cold: x.f.boost < 1 }">×{{ fmtBoost(x.f.boost) }}</span>
            <button aria-label="删除调参字段" class="btn ghost xs" @click="fields.splice(x.i, 1); onTune()"><X :size="10" /></button>
          </div>
          <!-- 过滤空档合并 EmptyState compact（文案逐字保留——
 「无匹配字段」textContent 锚保真） -->
          <EmptyState v-if="fields.length && !shownFields.length" compact :icon="Search" text="无匹配字段——清空上方过滤词恢复全部行" />
        </div>

        <div class="bt-actions">
          <!-- G246：双钮在途三通道（Loader2/Anchor 双态+在途文案；768 G238/766 G234 族）。
 lastMode 门控=共享 busy 下只由本钮发起的执行亮在途文案，他钮仅 disabled+图标态 -->
          <button class="btn primary sm" @click="run(true)" :disabled="!canRun || busy">
            <Loader2 v-if="busy && lastMode" :size="12" class="spinning" /><Anchor v-else :size="12" /> {{ busy && lastMode ? '跑基准中…' : '跑基准' }}
          </button>
          <button class="btn sm" @click="run(false)" :disabled="!canRun || busy || !baseline.length">
            <RefreshCw :size="12" :class="{ spinning: busy }" /> {{ busy && !lastMode ? '重跑中…' : '重跑对比' }}
          </button>
          <button class="btn ghost sm" @click="toSandbox" :disabled="!canRun" title="把调参后的 DSL 送入搜索沙盒（可加聚合/profile 继续调优）">
            <Send :size="12" /> 送入沙盒
          </button>
          <button class="btn ghost sm" @click="exportDsl" :disabled="!canRun">
            <Download :size="12" /> 导出 DSL
          </button>
        </div>

        <div class="bt-card-q">
          <div class="bt-card-hd"><FileJson :size="12" /> 实时生成的 Query
            <!-- 原始 IO 快查——本页最近一次调参执行（search-raw）请求/响应原文
 （ioRecorder 记录环；MatchMatrix/QueryXray 卡头钮同位范式；与 ScoreExplain/
 MatchMatrix 同特征属页域各自取最近一条，跨页互见） -->
            <button class="btn ghost sm" style="margin-left:auto" data-test="raw-io" aria-label="查看原始 IO（调参执行）" title="最近一次调参执行请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
          </div>
          <!-- W-C 批：实时 Query 走 highlightJson 范式（转义安全 v-html） -->
          <pre class="bt-dsl json-view" v-html="builtQueryHtml"></pre>
        </div>
      </div>
      </template>
      <template #pane-boosttuner-result>
      <div class="bt-right">
        <!-- 三态契约：busy 骨架 → runErr 内联面板（重试）→ 空态 → 对比表 -->
        <div v-if="busy" class="bt-loading">
          <SkeletonBox v-for="i in 3" :key="i" height="42px" round style="margin-bottom:var(--sp-1h)" />
        </div>
        <!-- 私造红壳合并全局 err-bar 形态（role=alert 在场，theme.css :554 单源；
 557 IH ih-qerr 先例）——重试钮走既有 run(lastMode) 逻辑原样保留，文案逻辑零触 -->
        <div v-else-if="runErr" role="alert" class="err-bar bt-err">
          <AlertCircle :size="14" />
          <div class="bt-err-body">
            <!-- 首行走 friendlyEsError 一句人话，pre 保留全文回看（对齐 AnalyzeView 口径） -->
            <div><b>执行失败</b> · {{ friendlyErr }}</div>
            <!-- 裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文） -->
            <pre class="bt-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
            <div class="bt-err-acts">
              <button class="btn sm" @click="run(lastMode)" :disabled="!canRun || busy">重试</button>
            </div>
          </div>
        </div>
        <EmptyState v-else-if="!current.length" :icon="SlidersHorizontal"
                    text="尚无排名对比结果"
                    :hint="baseline.length ? '基准已拍好，但本次重跑 0 命中——放宽搜索词或调权重后重试' : '左侧填搜索词与字段权重，先点「跑基准」拍快照，再拖滑杆点「重跑对比」'" />
        <template v-else>
        <div style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-1)">
          <!-- 排名对比复制（Markdown 贴文档） -->
          <button class="btn sm ghost" @click="copyRankMd" title="排名对比表复制为 Markdown">复制 Markdown</button>
        </div>
        <!-- 排名对比裸表换 QRT rows 型（qrtRowsSwap529 先例，先列锚清单再动手）——
 排序/右键/导出归内核（useTableSort 宿主胶水退役， 锚同步更新）；
 新排名/变化/基准排名仍按真实排名语义（rankOf 回原始索引，契约不变）；
 行色档（row-up/row-down/row-new）走 rowClass 契约（527 W-D），得分列 fieldTypes
 double 白得 num-col 右对齐+类型徽标 -->
        <QueryResultTable
          :cols="RANK_COLS" :rows="rankRows" sortable
          storage-key="boost:rank"
          export-name="boost-rank"
          :field-types="{ 得分: 'double' }"
          :row-class="btRowClass"
        >
          <template #cell-新排名="{ value }"><span class="rk-rank">#{{ value }}</span></template>
          <template #cell-变化="{ value }">
            <span v-if="value === null" class="bt-new">新建</span>
            <span v-else-if="value > 0" class="bt-up"><ArrowUp :size="11" /> {{ value }}</span>
            <span v-else-if="value < 0" class="bt-down"><ArrowDown :size="11" /> {{ -value }}</span>
            <span v-else class="bt-flat">—</span>
          </template>
          <template #cell-_id="{ value }"><span class="mono ell" :title="value">{{ value }}</span></template>
          <template #cell-得分="{ value }"><span class="mono">{{ Number(value).toFixed(4) }}</span></template>
          <template #cell-基准排名="{ value }"><span class="mono dim">{{ value === null ? '-' : '#' + value }}</span></template>
        </QueryResultTable>
        </template>
        <!-- 掉出提示独立于数据分支：重跑 0 命中（全掉出）时也要可见。
 G247：role=status——掉出=异步结果到达的语义公告（G192/G224/G235 族） -->
        <div v-if="!busy && !runErr && dropped.length" class="bt-dropped" role="status">
          <TriangleAlert :size="11" /> 掉出前 {{ SIZE }}：<StatusPill v-for="d in dropped" :key="d" class="bt-drop-chip" tone="y" :label="d" />
          <!-- 掉出清单独立复制（回归通知/对比贴文档） -->
          <button class="btn ghost xs" style="margin-left:auto" @click="copyDropped"
            :aria-label="'复制 ' + dropped.length + ' 个掉出文档 ID'" title="复制掉出文档 ID 清单">
复制
</button>
        </div>
      </div>
      </template>
    </WorkbenchLayout>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 /cluster/search-raw 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { SlidersHorizontal, Search, Plus, X, Anchor, RefreshCw, Download, FileJson,
  ArrowUp, ArrowDown, TriangleAlert, AlertCircle, Terminal, Send, Loader2, Copy, Power, Trash2 } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import FieldPicker from '../components/FieldPicker.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 轨4：字段名过滤胞改用统一件（sfbUnify650 锁） */
import StatusPill from '../components/StatusPill.vue'; /* ：掉出徽标改用统一件 */
/* 548 F：搜索词值位候选内核（LuceneInput 值位 keyword 档同源） */
import { useTermsSuggest } from '../composables/useTermsSuggest';
/* 件②：字段类型源（useTermsSuggest types 工厂参的读取表，字段元数据共享缓存） */
import { useIndexFields } from '../composables/useIndexFields';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import QueryResultTable from '../components/QueryResultTable.vue'; /* ：排名表换壳 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError'; /* ：runErr 人话化 */
import { highlightDslJson } from '../utils/jsonc'; /* ：DSL 语义键 j-clause 着色（highlightJson 语法遍同内核） */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；534 收口波：双参改用（errMeta 旁路） */
import { useIdxState } from '../composables/urlState';
/* 裸 sessionStorage 接收换 useLinkCarry 统一件（530 W-D 遗留清单合并，
 键 esquerystudio.link.boost 与 payload {index,keyword} 逐字保持，发送方 MatchMatrix 零改） */
import { useLinkCarry } from '../composables/useLinkCarry';
import { writeStoredRaw } from '../utils/safeJson';

const SIZE = 20;
const store = useAppStore();

/* 参数+结果可调工作台声明（参数栏可折叠，拖拽/预设/记忆由 WorkbenchLayout 统一负责）。
 轨4：竖排标题轨退役（v 刀①）——参数侧 bt-card-hd「搜索词 · 字段权重」
 横排承接，排名对比侧 QRT 列头自描述 */
const btScope = { target: store.target || 'host', route: '/boost-tuner', mode: 'tuner', profile: 'standard' as const };
const BT_PANES: WorkbenchPaneSpec[] = [
  { id: 'boosttuner.params', role: 'request', title: '', minSize: 300, defaultSize: 360, collapsible: true },
  { id: 'boosttuner.result', role: 'response', title: '', minSize: 340, defaultSize: 'flex' },
];
const router = useRouter();
/* 目标索引进 URL，调参现场链接可分享 */
const index = useIdxState({ follow: true });
/* 草稿治理补全(w24):调权关键词草稿 */
const keyword = useScopedDraft('keyword', { route: 'boost-tuner',}).text;
const live = ref(false); // 默认手动模式：不打爆生产
const busy = ref(false);
/* 调参字段表进草稿——手工逐条加的 boost 配置切页/刷新不丢。
 恢复值经 JSON.parse 不受类型约束（旧数据/手改存储可为 string），
 展示前归一：非法值回落默认权重 1（normal-multiplier 语义），防 .toFixed 抛 TypeError 炸整页 */
const fields = useScopedDraftState<{ name: string; boost: number; disabled?: boolean }[]>('fields', { route: 'boost-tuner' }, []).state;
const fmtBoost = (v: unknown) => { const n = Number(v); return (Number.isFinite(n) ? n : 1).toFixed(1); };
const baseline = ref<any[]>([]); // 基准快照
const current = ref<any[]>([]);
const runErr = ref(''); // 执行失败全文，供内联面板回看（三态契约错误位）
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const runErrRaw = ref<unknown>(null);
/* 错误面板首行人话；runErr 全文保留进 pre 回看 */
const friendlyErr = computed(() => (runErr.value ? friendlyEsError(runErr.value) : ''));
const lastMode = ref(true); // 上次执行模式（true=跑基准 / false=重跑对比），重试按原路重发

const canRun = computed(() => !!index.value && !!keyword.value && fields.value.some(f => f.name.trim()));

/* ═══ 548 F：搜索词值位候选 ═══
 与 LuceneInput 值位 keyword 档同内核（useTermsSuggest：防抖/序号守卫/TTL 缓存/失败静默）：
 取首个启用且已命名的打分字段做 terms agg top20；候选按当前关键词前缀计算前置过滤
 （datalist 浏览器原生过滤双保险）。无字段可聚合时走 suggest 空字段早退（不发请求且清旧候选）。
 件②：接 useTermsSuggest 可选第二参 types（消费接线）——字段类型源
 =本页 useIndexFields 实例（下方 fieldTypes），索引变化即 ensure（useIndexFields 模块级
 缓存按 target|index 共享，FieldPicker 已拉过的索引零网络白得；冷缓存首拉一次 mapping，
 ）。keyword/text 字段 rankTermsByType 原样返回（ES 权威序零扰动），date/数值字段的
 terms 候选 ISO/数值形态排前——打分字段选了 date 字段时候选从「epoch 串噪音」变「可读日期」。 */
const { fields: idxFields, ensure: idxEnsure } = useIndexFields(() => index.value);
const fieldTypes = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  for (const f of idxFields.value) m[f.path] = f.type;
  return m;
});
/* 1125：字段/类型清单挂载即拉，身份未落地先拉会带旧 target */
const boostBoot = useGatedBootRead('boost-tuner', () => idxEnsure());
watch(index, () => { void boostBoot.run(); }, { immediate: true });
const { suggestions: kwSugList, suggest: kwSuggest } = useTermsSuggest(() => index.value, () => fieldTypes.value);
const kwField = computed(() => fields.value.find(f => f.disabled !== true && f.name.trim())?.name.trim() || '');
watch([keyword, kwField], ([kw, f]) => { kwSuggest(f, kw); });
/* kwField 变化再加一次空前缀预载（kwField 非空时；同步两 watch 按注册序执行，
 后发者持防抖定时器——空前缀 top20 进 TTL 缓存，候选展示走 kwCandidates 本地前缀滤 +
 548 A2 宽前缀回填双白得）。 */
watch(kwField, f => { if (f) kwSuggest(f, ''); });
const kwCandidates = computed(() => {
  const p = keyword.value.trim().toLowerCase();
  /* 已敲前缀恰为候选全文时置顶（sqlCompletion 558 / LuceneInput 561 先例
 同款稳定排序——服务端 doc_count 序保底，非精确项相对序零漂移；空前缀无精确语义不重排） */
  return kwSugList.value.filter(v => !p || v.toLowerCase().startsWith(p)).sort((a, b) => Number(b.toLowerCase() === p) - Number(a.toLowerCase() === p));
});

/* W-C 批：Query 高亮（输出已转义）；：换 highlightDslJson——DSL 语义键出 j-clause，
 span 只换类名不改 textContent（ textContent 锚零扰动） */
const builtQueryHtml = computed(() => highlightDslJson(JSON.stringify(builtQuery.value, null, 2)));
const builtQuery = computed(() => ({
  size: SIZE,
  _source: false,
  query: {
    multi_match: {
      query: keyword.value || '…',
      /* 同步滤除停用行（disabled===true 不参与打分） */
      fields: fields.value.filter(f => f.disabled !== true && f.name.trim()).map(f => `${f.name.trim()}^${f.boost}`),
    },
  },
}));

/* ═══ ：排名对比表 QRT rows 型数据映射 ═══
 行序=current 原始序（内核排序只动视图）；新排名/变化/基准排名按真实排名语义
 （rankOf 回原始索引，契约不变）；变化列落原始 delta 数值（null=新面孔），
 #cell-变化 槽还原 ↑↓/新建/— 三态。 */
const RANK_COLS = ['新排名', '变化', '_id', '得分', '基准排名'];
const rankRows = computed<any[][]>(() => current.value.map((h: any) => {
  const i = rankOf(h._id);
  const b = baseRank(h._id);
  return [i + 1, delta(h._id, i), h._id, Number(h._score) || 0, b === null ? null : b + 1];
}));
/* 行色档走 rowClass 契约（527 W-D）：tr 挂 row-up/row-down/row-new（deep 样式接管） */
function btRowClass(row: any[]): string | undefined {
  return deltaClass(row[2], row[0] - 1) || undefined;
}
function rankOf(id: string): number {
  return current.value.findIndex(h => h._id === id);
}

function addField() {
  fields.value.push({ name: '', boost: 1.0 });
}

/* ═══ ：权重行列表管理 ═══
 ① 名字过滤（computed 真过滤——行源过滤而非 DOM 扫描，扁平数组更对）；
 ② 行级 disabled 位：draft 旧形状无 disabled 字段按启用处理零迁移（判定恒 === true），
 builtQuery 同步滤除停用行；③ 卡头计数徽标（N>10 转 hot）+ 启停全部。 */
const fieldKw = ref('');
const shownFields = computed(() => {
  const k = fieldKw.value.trim().toLowerCase();
  return fields.value.map((f, i) => ({ f, i })).filter(x => !k || x.f.name.toLowerCase().includes(k));
});
const allOn = computed(() => fields.value.every(f => f.disabled !== true));
const offCount = computed(() => fields.value.filter(f => f.disabled === true).length);
function toggleAllFields() {
  const on = allOn.value;
  fields.value.forEach(f => { f.disabled = on; });
  onTune();
}

function onTune() {
  if (live.value && canRun.value && baseline.value.length) run(false);
}

/* 调参字段行右键/菜单键：复制字段名、停用/启用、删除——只改本地调参草稿，
   执行仍由 run() 走查询门；共享 CellContextMenu 统一层序与键盘焦点。 */
type TuneField = { name: string; boost: number; disabled?: boolean };
type TuneRow = { f: TuneField; i: number };
const rowMenu = ref<{ x: number; y: number; f: TuneField; i: number } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  if (!m) return '';
  return `调参字段 · ${m.f.name || '未命名'} · ×${fmtBoost(m.f.boost)}${m.f.disabled === true ? ' · 已停用' : ''}`;
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const items: CcmItem[] = [];
  if (m.f.name) {
    items.push({ key: 'bt-copy', label: '复制字段名', icon: Copy, run: () => copyFieldName(m.f.name) });
  }
  items.push({
    key: 'bt-toggle',
    label: m.f.disabled === true ? '启用此字段' : '停用此字段',
    icon: Power,
    run: () => { m.f.disabled = m.f.disabled !== true; onTune(); },
  });
  items.push({
    key: 'bt-del',
    label: '删除调参字段',
    icon: Trash2,
    danger: true,
    sep: true,
    run: () => { fields.value.splice(m.i, 1); onTune(); },
  });
  return items;
});
function copyFieldName(name: string) {
  void copyText(name).then(ok => store.notify(ok ? 'success' : 'error',
    ok ? '已复制字段名：' + name : '复制失败：浏览器拦截了剪贴板'));
}
function openRowMenu(e: MouseEvent, x: TuneRow) {
  rowMenu.value = { x: e.clientX, y: e.clientY, f: x.f, i: x.i };
}
function onRowKey(e: KeyboardEvent, x: TuneRow) {
  if (e.defaultPrevented) return; /* FieldPicker 候选菜单已消费 */
  if (e.key !== 'ContextMenu' && !(e.key === 'F10' && e.shiftKey)) return;
  e.preventDefault();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  rowMenu.value = { x: r.left + 12, y: r.bottom, f: x.f, i: x.i };
}

const baseRankMap = computed(() => {
  const m = new Map<string, number>();
  baseline.value.forEach((h, i) => m.set(h._id, i));
  return m;
});

function baseRank(id: string): number | null {
  return baseRankMap.value.has(id) ? baseRankMap.value.get(id)! : null;
}
/** 正 = 上升；负 = 下降；null = 基准中没有（新面孔） */
function delta(id: string, newIdx: number): number | null {
  const b = baseRank(id);
  return b === null ? null : b - newIdx;
}
function deltaClass(id: string, i: number) {
  const d = delta(id, i);
  if (d === null) return 'row-new';
  if (d > 0) return 'row-up';
  if (d < 0) return 'row-down';
  return '';
}

const dropped = computed(() => {
  const cur = new Set(current.value.map(h => h._id));
  return baseline.value.filter(h => !cur.has(h._id)).map(h => h._id);
});

async function run(asBaseline: boolean) {
  if (!canRun.value) return;
  busy.value = true;
  runErr.value = '';
  runErrRaw.value = null;
  lastMode.value = asBaseline;
  try {
    const r: any = await api.searchRaw(index.value, JSON.stringify(builtQuery.value));
    if (r?.error) throw new Error(r.message);
    const hs = r.hits?.hits || [];
    current.value = hs;
    if (asBaseline) {
      baseline.value = hs;
      store.notify('success', `基准已拍快照：${hs.length} 条`);
    } else {
      store.notify('info', `重跑完成，对比基准看 ↑↓`);
    }
    if (!hs.length) store.notify('warning', '无命中');
  } catch (e: any) {
    runErr.value = String(e?.message || e); /* 原文留 pre 全文回看；人话由 friendlyErr 派生 */
    runErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    /* toast 裸串并轨 friendlyEsError */
    store.notify('error', '执行失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

async function exportDsl() {
  /* 按真实结果通知 */
  const ok = await copyText(JSON.stringify(builtQuery.value, null, 2));
  store.notify(ok ? 'success' : 'error', ok ? '最终 DSL 已复制到剪贴板' : '复制失败：浏览器拦截了剪贴板');
}

/* 前继/：送入搜索沙盒——sessionStorage 契约（esquerystudio.sandbox.body），
 沙盒四通道回放兜底已消费该键（w78）；与 TemplateGallery toSandbox 同范式 */
function toSandbox() {
  if (!canRun.value) return;
  writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.body', JSON.stringify(builtQuery.value, null, 2));
  router.push({ path: '/search', query: { mode: 'sandbox' } });
  store.notify('info', '调参 DSL 已送入搜索沙盒');
}

/* 排名对比 Markdown（新排名/变化/_id/得分/基准排名 五列） */
/* 掉出清单独立复制（逗号分隔 ID，工单/对比直达） */
async function copyDropped() {
  const ok = await copyText(dropped.value.join(', '));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${dropped.value.length} 个掉出文档 ID` : '复制失败');
}

async function copyRankMd() {
  if (!current.value.length) return;
  const lines = ['| 新排名 | 变化 | _id | 得分 | 基准排名 |', '| --- | --- | --- | --- | --- |'];
  current.value.forEach((h: any, i: number) => {
    const d = delta(h._id, i);
    const chg = d === null ? '新建' : d > 0 ? `↑${d}` : d < 0 ? `↓${-d!}` : '—';
    const base = baseRank(h._id) === null ? '-' : '#' + (baseRank(h._id)! + 1);
    lines.push(`| #${i + 1} | ${chg} | ${h._id} | ${Number(h._score).toFixed(4)} | ${base} |`);
  });
  if (dropped.value.length) lines.push('', '掉出前 ' + SIZE + '：' + dropped.value.join('、'));
  const ok = await copyText(lines.join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? '排名对比 Markdown 已复制' : '复制失败');
}

/* 原始 IO 快查（546/548 同款三件套）——特征 /cluster/search-raw（本页唯一出口
 searchRaw，run 请求+排名响应同条记录）；与 ScoreExplain/MatchMatrix 同特征属页域各自取
 最近一条，跨页互见；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/search-raw');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 接收「命中矩阵」送来的索引+关键词 —— 填好就等你加字段跑基准。
 接收侧换 useLinkCarry（键 esquerystudio.link.boost 与 payload
 {index,keyword} 逐字保持；receive 取后即焚语义同旧三行）。 */
const boostCarry = useLinkCarry<{ index?: string; keyword?: string }>('boost');
onMounted(() => {
  const p = boostCarry.receive();
  if (!p) return;
  if (p.index) index.value = p.index;
  if (p.keyword) keyword.value = p.keyword;
  if (!fields.value.length) addField();
  store.notify('info', '已带入索引与关键词，填好字段后点「跑基准」');
});
</script>

<style scoped>
/* min-height:100% 拉起高度链——WorkbenchLayout 的 flex pane 由此拿到确定高，
 pane 内 .bt-dsl/.bt-err-pre 才能 flex 吃满（无此链 flex:1 永远按内容高，改了等于没改） */
.bt-page { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
.bt-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* G245：页头四伴与 IndexPicker 退役伴五死规则整删（PageHeader 合并漏删族） */
.bt-switch { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); cursor: pointer; user-select: none; padding: var(--sp-1) var(--sp-2h); border: 1px solid var(--border); border-radius: var(--r-s); }
/* 固定 minmax grid 退役——双栏交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠） */
/* 双栏吃满 pane 高——.bt-left/.bt-right 高 100%（stacked 堆叠态 pane 高 auto 时自然回退内容高），
 Query 卡与错误面板 flex 弹性去 200px 封顶（min-height:0 传递，内滚兜底） */
.bt-left { display: flex; flex-direction: column; gap: var(--sp-2h); height: 100%; min-height: 0; }
/* 轨4：.bt-card 壳规则（border+radius+overflow）退役——pane 即容器，内容直贴；
 分界由 bt-card-hd border-bottom 承接（v 刀③④），bt-card-q 弹性链零变动 */
.bt-card-q { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.bt-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
.bt-add { margin-left: auto; }
.bt-kw { width: 100%; border: none; outline: none; background: transparent; color: inherit; font-size: var(--fs-md); padding: var(--sp-2h); box-sizing: border-box; border-bottom: 1px solid var(--border); }
.bt-field { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1h) var(--sp-2h); }
/* 删死 fallback（ .bt-fname/.bt-boost/.bt-dsl/.bt-err-pre/.bt-drop-chip 共 5 处 mono 同族清理，--mono 已在 theme.css 定义） */
.bt-fname { width: min(140px, 100%); padding: 3px var(--sp-2); border: 1px solid var(--border); border-radius: 5px; background: transparent; color: inherit; font-size: var(--fs-xs); font-family: var(--mono); } /* ：140px → min() 极窄钳制（行内 flex 收缩防撑破） */
.bt-slider { flex: 1; }
.bt-boost { flex: none; min-width: 42px; font-family: var(--mono); font-weight: 650; font-size: var(--fs-xs); text-align: right; }
.bt-boost.hot { color: var(--warn); }
.bt-boost.cold { color: var(--dv-slate); }
.bt-actions { display: flex; gap: var(--sp-2); }
/* 去 200px 封顶——卡 flex 拉伸吃满 pane 余高（min-height:0+overflow 内滚兜底） */
.bt-dsl { margin: 0; padding: var(--sp-2h); font-size: var(--fs-xs); flex: 1 1 auto; min-height: 0; overflow: auto; font-family: var(--mono); }
/* .bt-empty-sub 裸占位 ×2 随两处空态合并 EmptyState compact 退役，留白归组件 */
.bt-right { min-width: 0; height: 100%; min-height: 0; display: flex; flex-direction: column; }
.bt-loading { display: flex; flex-direction: column; }
/* .bt-err 私造红壳（border+err-soft+radius+err 色）退役 → 全局 .err-bar 形态
 （role=alert，theme.css :554 单源；557 IH .ih-qerr 先例）。本组只留多行面板顶对齐、
 pane 余高弹性链（ min-height:0 语义零触）与落位节奏（bt-right 无 gap，
 抵掉 err-bar 自带 margin-bottom） */
.bt-err { flex: 1 1 auto; min-height: 0; align-items: flex-start; margin-bottom: 0; }
.bt-err-body { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
/* 去 200px 封顶——错误面板吃满 pane 余高，全文回看不再半截截断 */
.bt-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; flex: 1 1 auto; min-height: 0; overflow: auto; }
.bt-err-acts { margin-top: var(--sp-2); }
/* 旧排名裸表样式全家（th/td/c/r/b/sortable + 末行双线修复）随换 QRT
 壳退役（表头/行语言归内核单一出处）；.rk-rank 接原表 .b 字重档 */
.rk-rank { font-weight: 650; }
/* G245：.ell/.dim 原双份重复规则去重——保 QRT cell 段一份（_id 截断/基准排名列消费位） */
.ell { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim { opacity: .5; }
/* 行色档随 rowClass 契约挂内核 tr（deep 穿透子组件；原 .row-* 裸选择器随壳退役） */
.bt-right :deep(tr.row-up td) { background: var(--ok-soft); }
.bt-right :deep(tr.row-down td) { background: var(--err-soft); }
.bt-right :deep(tr.row-new td) { background: color-mix(in srgb, var(--dv-violet) 7%, transparent); }
/* .bt-cnt 私造皮（bg3 底 2xs 胶囊 + .hot warn 手配色）随改用 StatusPill 退役——
 默认档 n、热档 y 归 .pill 单源，尺寸走全局 .pill.xs；类名保留作 DOM 锚（ 在查） */
.bt-fkw-wrap { width: 100%; height: 30px; padding: 0 var(--sp-2h); font-size: var(--fs-xs); }
.bt-field .bt-fen { flex: none; margin: 0 0 0 var(--sp-0); }
.bt-up { color: var(--ok); display: inline-flex; align-items: center; gap: var(--sp-0); font-weight: 650; }
.bt-down { color: var(--err); display: inline-flex; align-items: center; gap: var(--sp-0); font-weight: 650; }
.bt-flat { opacity: .35; }
.bt-new { color: var(--dv-violet); font-weight: 650; font-size: var(--fs-xs); }
.bt-dropped { margin-top: var(--sp-2); display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--warn); }
/* .bt-drop-chip 手写 warn-soft 色档退役——掉出徽标改用 StatusPill tone="y"
 （色/胶囊形态/字号归 .pill 单源；类名保留作锚， is-kind 改用先例） */

/* 宿主 iframe 最窄 ~866px 档（ProfileFlame 524 同口径）——操作钮组换行；
 档内禁 ≥300px 裸 width（仓规），全文禁 901px+ 倒挂 min-width 档 */
@media (max-width: 900px) {
  .bt-actions { flex-wrap: wrap; }
}
</style>
