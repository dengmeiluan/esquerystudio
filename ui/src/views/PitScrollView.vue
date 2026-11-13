<template>
  <div class="pt-page">
    <!-- 执行中局部进度条（ind-bar 全站范式） -->
    <div class="pg-progress ind-bar" :class="{ on: busy }"></div>
    <PageHeader :icon="Layers" title="PIT 深度分页" subtitle="Point-in-Time + search_after · 突破 10000 上限 · 数组/nested 全通吃 · 流式导出">
    <template #actions>
<!-- 自绘 pill 徽标换 StatusPill 统一件（tone=n + pt-badge 锚类保留在外层 class，
 原 .pt-badge 语义色/--ok 文本色与 .off 弱化档由既有局部规则继续承担；Radio 呼吸图标随
 统一件化退役——StatusPill 无插槽面，图标位不保留） -->
<StatusPill v-if="pitId" tone="n" class="pt-badge" :label="'PIT 已开 · keepAlive ' + keepAlive" />
<StatusPill v-else tone="n" class="pt-badge off" label="PIT 未开" />
<!-- 开/关 PIT 在途可感知（同图标 spinning 化+文案切换，713 家族；
 G161「disabled 既有=半合规」升格——803 池①横切小刀批） -->
<button v-if="!pitId" class="btn primary sm" @click="doOpen" :disabled="!index || busy">
    <PlayCircle :size="12" :class="{ spinning: busy }" /> {{ busy ? '开启中…' : '开 PIT' }}
</button>
<button v-else class="btn ghost sm" @click="doClose" :disabled="busy">
    <XCircle :size="12" :class="{ spinning: busy }" /> {{ busy ? '关闭中…' : '关 PIT' }}
</button>
<!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 数据源=api.ts ioRecorder 记录环，路径子串 '/cluster/pit'=本页 open/search/close 三通道） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（PIT 读写）" title="最近一次 PIT 开启/拉取/关闭请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
    </template>
    </PageHeader>
</div>
    <div class="pt-grid">
    <!-- pt-card 整卡壳退役（bg+border+radius 整块消除，v 约定①）——pt-sec 只留
 border-top 分节；pt-card-hd 卡头 已并轨行首横排档（fs-sm/650/border-bottom，无底色块）
 原样承接，PitBufferGuard 等挂载锁查询面零变动 -->
    <div class="pt-sec">
      <!-- 头行去 span 裸文本（uq-card-hd 先例模板形态；样式并档见 scoped） -->
      <div class="pt-card-hd">参数</div>
      <div class="pt-form">
          <label class="pt-lb"><span>index</span>
            <!-- 页内 IndexPicker + inert 锁定补丁（ b 方案）整段退役换
 CurrentIdxChip 只读件——useIdxState follow () => !pitId 与顶栏同源
 （PIT 会话进行中目标已与 pit_id 绑定、中途切顶栏不跟随），页内选择器纯重复；
 未选索引时 chip 不渲染（根 v-if），开 PIT 钮 :disabled="!index" 兜底 -->
            <CurrentIdxChip />
          </label>
          <label class="pt-lb"><span>keepAlive</span>
            <input v-model="keepAlive" class="pt-ii" placeholder="5m / 1h" @blur="keepAliveCheck(keepAlive)" />
            <div v-if="keepAliveHint" class="il-hint" :class="'il-' + keepAliveLevel">{{ keepAliveHint }}</div>
          </label>
          <label class="pt-lb"><span>batchSize</span>
            <input v-model.number="batchSize.v" type="number" min="10" max="10000" class="pt-ii" />
          </label>
          <label class="pt-lb"><span>sort field</span>
            <!-- W1 ：sort 字段接 FieldPicker；_shard_doc 伪字段无候选时手输保留（Enter 收面板不覆盖）。
 type-filter 可排序类型——sort 传 text 会被 ES 400（fielddata），候选集只留可排序档，
 契约测试 fieldPickerPenetration 已随更新为过滤后口径。
 排序场景 date/long 提前（LuceneQueryView sort 行同款） -->
            <FieldPicker v-model="sortField" :index="index" :type-filter="SORTABLE_TYPES" :type-priority="['date','long']" placeholder="_shard_doc（默认排序，最快）" width="100%" class="pt-sort-fp" />
          </label>
          <label class="pt-lb"><span>sort order</span>
            <select v-model="sortOrder.v" class="pt-ii" :disabled="shardDoc"
              :title="shardDoc ? '_shard_doc 仅支持 asc（desc 会被 ES 400）' : ''">
              <option value="asc">asc</option>
              <option value="desc">desc</option>
            </select>
          </label>
          <label class="pt-lb"><span>filter DSL （可选）</span>
            <JsonArea ref="ptJaRef" v-model="filterDsl" :dsl-assist="dslAssist" :rows="4" placeholder="{&quot;term&quot;:{&quot;status&quot;:&quot;ACTIVE&quot;}}   留空即 match_all" />
          </label>
        </div>
      </div>

      <div class="pt-sec">
        <div class="pt-card-hd">进度</div>
        <div class="pt-progress">
          <div class="pt-num">
{{ fetched }}<span class="pt-num-u"> / {{ totalGte ? '+' : '' }}{{ total || '?' }}</span>
            <span v-if="totalGte" class="pt-num-gte" title="track_total_hits 截断：总数为下界而非精确值">（命中数为下界）</span>
</div>
          <div class="pt-bar-wrap">
            <div class="pt-bar" :style="{ width: total ? Math.min(100, fetched / total * 100) + '%' : (fetched > 0 ? '4%' : '0%') }"></div>
          </div>
          <div class="pt-stat">
            <span>批次 <b>{{ batches }}</b></span>
            <span>速率 <b>{{ rate }}</b> 条/秒</span>
            <span>耗时 <b>{{ elapsed }}s</b></span>
          </div>
          <div class="pt-actions">
            <button class="btn primary sm" @click="doStart" :disabled="!pitId || running">
              <Play :size="12" /> {{ searchAfter ? '继续拉取' : '开始拉取' }}
            </button>
            <button class="btn ghost sm" @click="pause = true" :disabled="!running">
              <PauseCircle :size="12" /> 暂停
            </button>
            <button class="btn ghost sm" @click="reset" :disabled="running">
              <RotateCcw :size="12" /> 重置
            </button>
            <button class="btn ghost sm" @click="exportJsonl" :disabled="!buffer.length">
              <FileDown :size="12" /> 导出 JSONL（{{ buffer.length }}）
            </button>
            <!-- CSV 导出（全量 buffer，列=_id+_source 键并集，与 JSONL 同数据源） -->
            <button class="btn ghost sm" @click="exportCsv" :disabled="!buffer.length" title="导出全部已拉取条目为 CSV（Excel 可直开）">
              <FileDown :size="12" /> CSV
            </button>
          </div>
        </div>
      </div>

      <div class="pt-sec wide">
        <!-- 1439：条件改了但没重置——已拉取条目来自本次滚动开始时的条件（裸文本头 + 条件芯片） -->
        <div class="pt-card-hd">预览（最近 100 条）
          <span v-if="pitFilterChanged" class="pill warn stale-chip" role="status"
            title="筛选条件/排序已修改——下方已拉取条目来自本次滚动开始时的条件；点「重置」后重新开始才会生效">条件已修改</span>
        </div>
        <!-- 预览表聚焦放大（423 同款推广） -->
        <FocusableSurface pane-id="pit.preview" title="预览表" :enabled="focusPaneId === 'pit.preview'"
          @update:enabled="v => (focusPaneId = v ? 'pit.preview' : null)">
          <!-- 聚焦态补全量导出钮（buffer 全量导出在聚焦面外不可达；QRT 内置导出仅表格已渲数据） -->
          <div v-if="focusPaneId === 'pit.preview'" class="focus-tools">
            <button class="btn ghost sm" @click="exportJsonl" :disabled="!buffer.length">
              <FileDown :size="12" /> 导出 JSONL（{{ buffer.length }}）
            </button>
            <button class="btn ghost sm" @click="exportCsv" :disabled="!buffer.length" title="导出全部已拉取条目为 CSV（Excel 可直开）">
              <FileDown :size="12" /> CSV
            </button>
            <!-- 暂停/重置在聚焦态可达 -->
            <button class="btn ghost sm" @click="pause = true" :disabled="!running">
              <PauseCircle :size="12" /> 暂停
            </button>
            <button class="btn ghost sm" @click="reset" :disabled="running">
              <RotateCcw :size="12" /> 重置
            </button>
          </div>
          <!-- 聚焦态全屏高对齐 LuceneQueryView 423 收敛口径——--vh-offset（theme.css :root=210px，
 全站页头+页边距预留）为准；聚焦面无页头、面内仅工具行+表格工具行（~80px），回加 80px
 （与旧裸 130px 等价：210-80=130，视觉零变化，口径归 token 防两处漂移） -->
          <!-- loading（busy 骨架，QRT 既有 prop 默认 false）+ row-drawer 行详情开
 （hit 型行右键「行详情」， W-B 侧拉） -->
          <QueryResultTable :hits="preview" :total="total" :total-gte="totalGte" :loading="busy" row-drawer sortable :max-height="focusPaneId === 'pit.preview' ? 'calc(100vh - var(--vh-offset) + 80px)' : '40vh'" empty-text="开启滚动后这里显示预览（最近 100 条）" :storage-key="index ? 'pit:' + index : undefined" :focusable="false" :field-types="fieldTypes" export-name="pit-preview" />
        </FocusableSurface>
      </div>

      <div v-if="logs.length" class="pt-sec wide pt-logs">
        <div class="pt-card-hd">日志（最近 20 条）</div>
        <div class="pt-log-body">
          <div v-for="(l, i) in logs" :key="i" :class="['pt-log', 'lv-' + l.level]">
            <span class="pt-time">{{ l.time }}</span>
            <span class="pt-msg">{{ l.msg }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/pit 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Layers, PlayCircle, XCircle, Play, PauseCircle, RotateCcw, FileDown, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：自绘徽标统一件 */
import { useAppStore } from '../stores/app';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useIdxState } from '../composables/urlState';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import { useResultStale } from '../composables/useResultStale';
import { exportStamp, fmtTime, downloadText, fmtCell, csvText } from '../utils/format';
import { friendlyEsError } from '../utils/esError'; /* ：三处裸 err 合并单源翻译 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import FieldPicker from '../components/FieldPicker.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import FocusableSurface from '../components/FocusableSurface.vue';
import { useInputLint, patternRule, TIME_RE } from '../composables/useInputLint';
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：防抖统一件（卸载自动清 timer） */
import { useIndexFieldTypes } from '../composables/useIndexFieldTypes';
import { resolveSortField } from '../utils/sortField';
import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import JsonArea from '../components/JsonArea.vue';
/* filter DSL 前置闸 + lintDsl 划线（SearchSandboxView 用法同款） */
import { lintDsl } from '../utils/dslLint';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
/* 目标索引进 URL——刷新/分享链接可复原（可重入）；
 顶栏切换跟随，但 PIT 会话进行中不跟（目标已与 pit_id 绑定，中途换索引会错配） */
const index = useIdxState({ follow: () => !pitId.value });
/* 字段类型映射——QRT 双层列头类型徽标 */
const fieldTypes = useIndexFieldTypes(index);
/* filter DSL 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
 fields() 侧惰性 ensure：补全触发才拉 mapping（挂载零请求，不扰动 FieldPicker 渗透
 spec 的计数契约），cache 命中后直读；不 await 零降级，失败仅无候选 */
const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包，索引源与 fields 同源现调现读 */
const ptTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => { if (!assistFields.value.length) ensureAssistFields(); return assistFields.value; }, terms: (f: string, p: string) => ptTerms.suggestAsync(f, p) };
/* 检索参数进草稿——本页在 KeepAlive 白名单切页不丢，但刷新会丢；
 PIT 会话本身(pitId)是服务端态刷新必失，参数现场至少可复原重开 */
const keepAlive = useScopedDraft('keep-alive', { route: 'pit-scroll', index: () => store.pickedIdx || '' }, '5m').text;
/* ux2 ：keepAlive 时间格式失焦校验 + 输入即清（防旧 hint 滞留误导） */
const { hint: keepAliveHint, level: keepAliveLevel, check: keepAliveCheck, clear: keepAliveClear } = useInputLint([
  patternRule(TIME_RE, 'keepAlive 格式：数字+单位（ms/s/m/h/d），如 5m / 1h'),
]);
watch(keepAlive, () => keepAliveClear());
/* useScopedDraftState 只收 object（JSON 草稿契约），标量走对象包装 */
const batchSize = useScopedDraftState<{ v: number }>('batch-size', { route: 'pit-scroll', index: () => store.pickedIdx || '' }, { v: 500 }).state;
const sortField = useScopedDraft('sort-field', { route: 'pit-scroll', index: () => store.pickedIdx || '' }, '_shard_doc').text;
/* sort 候选只出可排序类型（与 LuceneQueryView 同口径单一语义；text 排序会被 ES 400 fielddata） */
/* 可排序类型单源（queryAstOps）——此前漏 unsigned_long、date_nanos */
const SORTABLE_TYPES = SORTABLE_FIELD_TYPES.join(',');
const sortOrder = useScopedDraftState<{ v: 'asc' | 'desc' }>('sort-order', { route: 'pit-scroll', index: () => store.pickedIdx || '' }, { v: 'asc' }).state;
/* _shard_doc 是 PIT 默认快排但只认 asc —— desc 会被 ES 直接 400。
 选中（或留空兜底等同）_shard_doc 时锁死 asc 并禁用 desc 控件，防误触 */
const shardDoc = computed(() => (sortField.value.trim() || '_shard_doc') === '_shard_doc');
watch(shardDoc, (v) => { if (v) sortOrder.value.v = 'asc'; });
const filterDsl = useScopedDraft('filter-dsl', { route: 'pit-scroll', index: () => store.pickedIdx || '' }, '').text;

/* filter DSL 合法性与 lint 前置化。此前 JSON.parse 在拉取循环体内——
 非法 JSON 首批即抛进通用 catch，用户看到的是含 JSON 堆栈的「拉取失败」，指不出是 filter 输入错。
 parsedFilter 合法对象口径与 SearchSandboxView 同款；lintDsl（ctx 传 mapping fields）随输入
 实时重估注入 filter 编辑器划线（JsonArea.setMarkers 透传，info→hint 降级，debounce 250ms
 防每敲一键全量 findMatches；非法 JSON 不 lint——JsonArea 圆点已报）。fields 用 assistFields
 现值（补全触发才惰性 ensure，lint 不主动拉请求，字段未到位时类型规则自然缺席）。 */
const parsedFilter = computed<Record<string, unknown> | null>(() => {
  const t = filterDsl.value.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
});
const ptJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* 手写 ptLintTimer 防抖换 useDebounceFn 统一件（250ms 同口径、尾值语义不变；
 卸载自动清 timer——原手写版无卸载清理，统一件补上） */
const queuePtLint = useDebounceFn(() => {
  const o = parsedFilter.value;
  if (!o) { ptJaRef.value?.setMarkers?.([]); return; }
  const findings = lintDsl(o, { fields: assistFields.value });
  ptJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(filterDsl, () => queuePtLint(), { immediate: true });

/* 回放预填消费（QueryHubView.replay 的 pit 分支写入，读走即删）——
 esquerystudio.pit.filter=历史条目 filter 原文；esquerystudio.pit.prefill=执行时 carry 快照（sort/order）。
 仅回放路径有键，普通进入/重挂载零影响；坏快照静默忽略（sort/order 保持草稿值） */
onMounted(() => {
  const pf = sessionStorage.getItem('esquerystudio.pit.filter');
  if (pf !== null) { filterDsl.value = pf; removeStoredRaw(sessionStorage, 'esquerystudio.pit.filter'); }
  const carry = sessionStorage.getItem('esquerystudio.pit.prefill');
  if (carry) {
    removeStoredRaw(sessionStorage, 'esquerystudio.pit.prefill');
    try {
      const c = JSON.parse(carry);
      if (typeof c.sort === 'string') sortField.value = c.sort;
      if (c.order === 'asc' || c.order === 'desc') sortOrder.value.v = c.order;
    } catch { /* 坏快照忽略 */ }
  }
});

const pitId = ref('');
const busy = ref(false);
const running = ref(false);
const pause = ref(false);

const buffer = ref<any[]>([]);
/* 拉取缓冲上限（约 100-200MB 内存峰值；超限自动暂停,导出后可继续） */
const BUFFER_MAX = 200_000;
const preview = ref<any[]>([]);
const fetched = ref(0);
const total = ref(0);
/* total 下界标注（relation=gte 时 track_total_hits 截断，展示 +/≥ 提示） */
const totalGte = ref(false);
/* 预览表聚焦态 */
const focusPaneId = ref<string | null>(null);
const batches = ref(0);
const startTs = ref(0);
/* w79：上一批末位 sort 游标。此前是 doStart 的局部变量，暂停后重启被 reset 连坐清零，
 提为 ref 才能跨「暂停→继续」存活；null = 尚未开始或已重新开始 */
const searchAfter = ref<any>(null);
const elapsed = ref(0);
/* 1439：滚动会话的条件快照——开拉时取一次，整个会话（含暂停继续）都用它。
   此前循环每批重读 filterDsl/sortField/sortOrder：暂停期间改条件再点「继续拉取」，
   会带着旧 search_after 用新查询接着拉，同一缓冲区混两套条件的数据。
   条件改了但没重置时，预览头挂「条件已修改」（共享 useResultStale 判据）。 */
const pitRunSig = computed(() => JSON.stringify([filterDsl.value, sortField.value.trim(), sortOrder.value.v]));
const { stale: pitFilterChanged, markRun: markPitRun } = useResultStale(() => pitRunSig.value, () => fetched.value > 0);
const sessionFilter = ref('');
const sessionSortField = ref('_shard_doc');
const sessionSortOrder = ref<'asc' | 'desc'>('asc');
const rate = computed(() => elapsed.value > 0 ? Math.round(fetched.value / elapsed.value) : 0);

interface LogRow { time: string; level: 'info' | 'ok' | 'warn' | 'err'; msg: string }
const logs = ref<LogRow[]>([]);
function log(level: LogRow['level'], msg: string) {
  logs.value.unshift({ time: fmtTime(Date.now()), level, msg });
  if (logs.value.length > 20) logs.value.pop();
}

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/pit');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

async function doOpen() {
  if (!index.value.trim()) return;
  if (busy.value) return; /* 2.1.6：防重——双击会开出第二个 PIT 泄漏 */
  busy.value = true;
  try {
    const r: any = await api.pitOpen(index.value.trim(), keepAlive.value.trim() || '5m');
    if (r?.available === false) { store.notify('error', 'PIT 不可用：' + (r.reason || '') + ' — 需 ES 7.10+,请在查询工作台用 SQL 或 DSL 深分页', { duration: 12000 }); return; }
    pitId.value = r.id || r.pit_id || '';
    if (!pitId.value) { store.notify('error', 'PIT 响应未包含 id'); return; }
    log('ok', 'PIT 已开');
    store.notify('success', 'PIT 已开');
    /* PIT 的「查询」定义为 filter DSL（留空=match_all）；sort/keepAlive 不落历史 */
    useQueryHistoryStore().push('pit', filterDsl.value, index.value.trim() || undefined);
    /* filter/sort 快照写 sessionStorage（esquerystudio.pit.carry）——历史条目形状扩展
 （store 文件）不在文件清单，回放的 sort/order 降级走 sessionStorage 直传：
 QueryHubView.replay(pit) 把快照转运为 esquerystudio.pit.prefill，PitScrollView onMounted
 读走即删；普通进入/重挂载不消费，同会话内回放即对应最近一次执行的现场 */
    try {
      writeStoredRaw(sessionStorage, 'esquerystudio.pit.carry', JSON.stringify({
        filter: filterDsl.value, sort: sortField.value.trim(), order: sortOrder.value.v,
      }));
    } catch { /* 存储满/隐私模式：回放退化为只带索引（现状），不影响执行 */ }
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（log 留痕原文不动） */
    store.notify('error', 'PIT 开启失败：' + friendlyEsError(String(e?.message ?? e)));
    log('err', 'open 失败：' + (e?.message || e));
  } finally { busy.value = false; }
}

async function doClose() {
  if (!pitId.value) return;
  if (busy.value) return; /* 2.1.6：防重 */
  busy.value = true;
  try {
    await api.pitClose(pitId.value);
    log('ok', 'PIT 已关');
    store.notify('success', 'PIT 已关闭');
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError */
    store.notify('error', '关闭失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    pitId.value = '';
    busy.value = false;
    running.value = false;
  }
}

function reset() {
  /* 重置时退出预览表聚焦——避免全屏空表困住用户 */
  focusPaneId.value = null;
  buffer.value = [];
  preview.value = [];
  fetched.value = 0; total.value = 0; batches.value = 0; elapsed.value = 0;
  searchAfter.value = null; startTs.value = 0;
  logs.value = [];
  /* 会话条件快照随缓冲一起归零（芯片随 fetched=0 自然消失） */
  sessionFilter.value = ''; sessionSortField.value = '_shard_doc'; sessionSortOrder.value = 'asc';
}

async function doStart() {
  if (!pitId.value || running.value) return;
  /* JSON 合法性前置闸——此前 JSON.parse 在拉取循环体内，非法 JSON 首批即抛
 进通用 catch 出笼统「拉取失败」；现在开拉前先闸，失败指名 filter 输入、不进拉取态 */
  if (filterDsl.value.trim()) {
    try { JSON.parse(filterDsl.value.trim()); }
    catch {
      store.notify('error', '「filter DSL（可选）」不是合法 JSON：请修正后再开始拉取（留空即 match_all）');
      return;
    }
  }
  running.value = true; pause.value = false;
  /* 1439：本次是「继续」还是新会话——必须在下面的分支（reset 会清 search_after）之前判定 */
  const continuing = !!searchAfter.value;
  /* w79：拆分「暂停→继续」与「重新开始」——暂停时 pitId 与 search_after 都还活着，
 续拉不清缓冲区/计数/日志，从断点游标接着走；只有「重置」（或自然跑完清游标）才归零 */
  if (searchAfter.value) {
    /* 暂停期间计时器已停：把起点回拨到与已累计秒数对齐，耗时/速率分母保持连续 */
    startTs.value = Date.now() - elapsed.value * 1000;
    log('info', '继续拉取');
  } else {
    reset();
    startTs.value = Date.now();
    log('info', '开始拉取');
  }

  const timer = setInterval(() => { elapsed.value = Math.round((Date.now() - startTs.value) / 1000); }, 1000);

  try {
    /* 1169：PIT 排序字段只认 asc/desc 与可排序类型——FieldPicker 下拉过滤挡不住手输/URL，
       直接把 text 列送进来会 400「Fielddata is disabled」。开跑前解析一次：能解析就换成
       .keyword 子域，解析不了就明确拒绝（不静默改用户选择，也不发注定失败的请求）。 */
    const sfRaw = sortField.value.trim();
    if (sfRaw && sfRaw !== '_shard_doc') {
      const res = resolveSortField(sfRaw, fieldTypes.value);
      if (!res.ok) {
        log('err', res.reason || `「${sfRaw}」不支持排序，请换成 keyword/date/数值字段`);
        return; /* finally 负责 clearInterval / running=false */
      }
      if (res.field !== sfRaw) {
        sortField.value = res.field;
        log('info', `排序字段已改用 ${res.field}（text 字段靠 .keyword 子域排序，原字段无法排序）`);
      }
    }
    /* 1439：新会话在排序归一之后取一次条件快照；续拉沿用同一份，绝不半路换条件 */
    if (!continuing) {
      sessionFilter.value = filterDsl.value.trim();
      sessionSortField.value = sortField.value.trim();
      sessionSortOrder.value = sortOrder.value.v;
      markPitRun();
    } else if (pitFilterChanged.value) {
      log('warn', '筛选/排序条件与本次滚动开始时不同——「继续拉取」仍按开始时的条件；要按新条件请先「重置」');
    }
    while (running.value && !pause.value) {
      /* 缓冲上限保护——buffer 全量驻内存，深分页无限拉取会 OOM 浏览器。
 达到上限自动暂停（不 reset），导出清空后可再继续拉取 */
      if (buffer.value.length >= BUFFER_MAX) {
        pause.value = true;
        log('warn', `缓冲已达上限 ${BUFFER_MAX} 条，已自动暂停——请先导出（JSONL/CSV），再点「继续」拉取余量`);
        break;
      }
      /* 会话快照，不是当前稿——改条件必须在「重置」后重开才生效 */
      const query = sessionFilter.value
        ? JSON.parse(sessionFilter.value)
        : { match_all: {} };

      const body: any = {
        size: batchSize.value.v,
        query,
        pit: { id: pitId.value, keep_alive: keepAlive.value.trim() || '5m' },
        /* sort 恒显式（空档回退 _shard_doc=canonical；省略会让 hits 丢排序值、
         search_after 断链原地重拉），部分版本对显式 _shard_doc 400 时走 catch 指引 */
        sort: [{ [sessionSortField.value || '_shard_doc']: { order: sessionSortOrder.value } }],
        track_total_hits: fetched.value === 0,
      };
      if (searchAfter.value) body.search_after = searchAfter.value;

      const r: any = await api.pitSearch(JSON.stringify(body));
      const hits = r.hits?.hits || [];
      if (!hits.length) { searchAfter.value = null; log('ok', '已到末尾'); break; }

      if (fetched.value === 0) {
        const t = r.hits?.total;
        if (t && typeof t === 'object') { total.value = t.value || 0; totalGte.value = t.relation === 'gte'; }
        else { total.value = Number(t) || 0; totalGte.value = false; }
        log('info', `total ≈ ${total.value}`);
      }

      /* 批次大小手输可超输入框上限，PIT 深分页单批可数万条：spread 直推有
       引擎参数上限（RangeError）风险，分块进栈；块间让出主线程——单拍数万条
       push 同步执行会冻结 UI（进度/日志/计时器全停），多块批次片间交出渲染帧 */
      for (let i = 0; i < hits.length; i += 8192) {
        buffer.value.push(...hits.slice(i, i + 8192));
        if (i + 8192 < hits.length) await new Promise(res => setTimeout(res, 0));
      }
      preview.value = buffer.value.slice(-100);
      fetched.value += hits.length;
      batches.value += 1;

      const last = hits[hits.length - 1];
      searchAfter.value = last.sort;

      if (r.pit_id) pitId.value = r.pit_id;

      /* 让 UI 有喘息，兼免打爆内存 */
      if (buffer.value.length >= 100000) {
        log('warn', '缓冲区已达 10 万，建议先导出再继续');
        pause.value = true;
        break;
      }
      await new Promise(res => setTimeout(res, 0));
    }
    log('ok', pause.value ? '已暂停' : '拉取完成');
  } catch (e: any) {
    const msg = String(e?.message || e);
    /* 部分 ES 版本（如 7.10.0/7.10.1）对 body pit 的显式 _shard_doc 排序返回
 400 No mapping found——非 console 问题，给出可行动指引而非裸错误 */
    if (msg.includes('_shard_doc') && msg.includes('No mapping found')) {
      const tip = '当前 ES 版本不支持 _shard_doc 排序：在「sort field」选一个可排序字段（date/keyword 等）后重新拉取（深分页需稳定排序键，不影响导出完整性）';
      log('err', '拉取失败：' + msg);
      log('warn', tip);
      store.notify('warning', tip);
    } else {
      log('err', '拉取失败：' + msg);
      /* 裸错误串 → friendlyEsError（_shard_doc 可行动指引 warning 臂不在此域） */
      store.notify('error', '拉取失败：' + friendlyEsError(msg));
    }
  } finally {
    clearInterval(timer);
    running.value = false;
  }
}

function exportJsonl() {
  if (!buffer.value.length) return;
  const lines = buffer.value.map(h => JSON.stringify({ _id: h._id, ...h._source }));
  downloadText(`pit-${index.value}-${exportStamp()}.jsonl`, lines.join('\n'), 'application/x-ndjson');
  store.notify('success', `已导出 ${buffer.value.length} 条 JSONL`);
}

/* CSV 导出——与 JSONL 同数据源（全量 buffer），列=_id+_source 键并集（稀疏文档不丢列）；
 csvText 单源组装（表头/单元格转义+BOM 统一，Browser/MatchMatrix/Security/Snapshots 同源） */
function exportCsv() {
  if (!buffer.value.length) return;
  const colsSet = new Set<string>(['_id']);
  for (const h of buffer.value) for (const k of Object.keys(h._source ?? {})) colsSet.add(k);
  const cols = [...colsSet];
  /* 单元格语义保真：fmtCell 先行（空值 ∅/对象 JSON 序列化），csvText 内部只做引号转义 */
  const rows = buffer.value.map(h => cols.map(c => fmtCell(c === '_id' ? h._id ?? null : (h._source ?? {})[c] ?? null)));
  downloadText(`pit-${index.value}-${exportStamp()}.csv`, csvText(cols, rows), 'text/csv;charset=utf-8');
  store.notify('success', `已导出 ${buffer.value.length} 条 CSV`);
}

onBeforeUnmount(() => {
  /* 卸载先停拉取循环——PIT 随卸载即关，running/pause 双置位让 while 循环
 在 in-flight 请求返回后退出，否则循环还拿已关的 pit_id 继续发 pitSearch（失败日志噪音） */
  running.value = false;
  pause.value = true;
  if (pitId.value) { api.pitClose(pitId.value).catch(() => {}); }
});
</script>

<style scoped>
.pt-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); position: relative; }
/* 执行进度条贴页顶 */
/* .pt-hd-l/-ic/-tt/-sub/-r 死规则退役（页头早已由 PageHeader 接管，模板 grep 0 引用） */
.pt-badge { color: var(--ok); display: inline-flex; align-items: center; gap: var(--sp-1); }
.pt-badge.off {color: var(--muted);}
/* .pt-radio/@keyframes pt-blink 随 Radio 图标退役（StatusPill 统一件无图标位） */
.pt-grid { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: var(--sp-3); }
/* pt-card 整卡壳退役（bg+border+radius+overflow 整块消除）→ pt-sec 只留
 border-top 分节（v 约定①，dt-hist 同款）；wide 网格占位与 pt-logs 滚动钳制原样同步更新 */
.pt-sec { border-top: 1px solid var(--border); padding-top: var(--sp-1h); }
.pt-sec.wide { grid-column: 1 / -1; }
/* 卡头字重 400→650 对齐标题四档（.lc-card-hd 同步同修）。
 卡头并 fs-head 行首横排档（uq-card-hd 538 已改先例同语言：fs-xs/650/tx1/.02em +
 5px--sp-2 行距，border-bottom 分界保留； 旧 fs-sm 档字面锁同步更新） */
.pt-card-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }
.pt-form { padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
/* (b)：filter DSL JsonArea 外框退役（ ss-editor 同语言）——pt-card-hd
 既有 border-bottom 承接分界，ja-bar 工具条在场；组件本体零触，纯视觉 */
.pt-form :deep(.ja) { border: none; border-radius: 0; }
.pt-lb { display: flex; flex-direction: column; gap: 3px; font-size: var(--fs-xs); color: var(--muted); }
.pt-ii { border: 1px solid var(--border); border-radius: 3px; padding: 5px var(--sp-2); font-size: var(--fs-sm); background: var(--card-bg); color: var(--fg); font-family: var(--mono); }
/* .pt-ta 死规则随编辑器外框退役删除（filter 编辑器早已 JsonArea 化，
 模板 grep 0 引用实证——border+radius 外框形态不回流，① 源码锁） */
.pt-progress { padding: var(--sp-4); }
.pt-num-gte { font-size: var(--fs-sm); font-weight: 400; color: var(--tx2); margin-left: var(--sp-1h); }
/* 28px 字面量合并 --fs-num-l（注册三档 28px 同值，视觉零变化）+ tabular-nums
 （翻页计数跳动不再抖宽；mono 家族已在场） */
.pt-num { font-size: var(--fs-num-l); font-weight: 650; color: var(--brand); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.pt-num-u { font-size: var(--fs-lg); color: var(--muted); font-weight: 400; }
/* .pt-idx-cell 锁定包裹层三层规则随 IndexPicker+inert 补丁退役清零（chip 自带胶囊观感） */
.pt-bar-wrap { height: 10px; background: var(--code-bg); border-radius: 5px; overflow: hidden; margin: var(--sp-2) 0; }
.pt-bar { height: 100%; background: linear-gradient(90deg, var(--brand), var(--ok-line)); transition: width 300ms; }
.pt-stat { display: flex; justify-content: space-between; font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--sp-3); }
.pt-stat b { color: var(--fg); font-weight: 600; }
.pt-actions { display: flex; gap: var(--sp-1h); flex-wrap: wrap; }
.pt-logs { max-height: 200px; overflow: auto; }
.pt-log-body { padding: var(--sp-2) var(--sp-3); }
.pt-log { font-size: var(--fs-xs); padding: var(--sp-0) 0; font-family: var(--mono); display: flex; gap: var(--sp-2); }
.pt-time { color: var(--muted); min-width: 126px; flex-shrink: 0; white-space: nowrap; }
.lv-info .pt-msg { color: var(--fg); }
.lv-ok .pt-msg { color: var(--ok); }
.lv-warn .pt-msg { color: var(--warn); }
.lv-err .pt-msg { color: var(--err); }

/* 窄容器塌单栏，断点同 theme.css:584 的 （iframe 可用宽 ~866px） */
@media (max-width: 1100px) {
  .pt-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——表单/进度堆叠已由
 1100 档合并，此处收页与进度区侧距（进度表格横滚兜底在全局 .tbl-wrap，不在此重复造） */
@media (max-width: 900px) {
  .pt-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .pt-progress { padding: var(--sp-3); }
}
</style>
