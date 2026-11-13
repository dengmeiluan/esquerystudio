<template>
  <div class="rp">
    <PageHeader :icon="Calculator" title="Reindex 预估" subtitle="重建前只读预估：数量/耗时/冲突">
      <!-- 页内历史入口（四视图统一范式，SqlConsoleView 同款）——预估成功一直在
 push('reindex-preview') 历史（补），此前页内零出口只写不显 -->
      <template #actions>
        <button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
      </template>
    </PageHeader>
    <div class="rp-bar">
      <!-- 页内 IndexPicker 退役换只读 CurrentIdxChip——「选索引」唯一可写入口
 收敛顶栏（架构裁决）；useIdxState follow 下行跟随不变，顶栏切源即跟随 -->
      <CurrentIdxChip />
      <!-- 运行读秒+瞬时取消（useQueryRun 统一件，SqlBridge 535 T4 同款）——
 静息文案保持「运行预估」（histPanel535 textBtn 锚不破）；取消以 AbortError 落 run 的 catch -->
      <button class="btn sm" :disabled="!source || busy" @click="run">{{ qr.running.value ? '预估中 ' + (qr.elapsedMs.value / 1000).toFixed(1) + 's' : '运行预估' }}</button>
      <button v-if="qr.running.value" class="btn sm ghost" @click="qr.cancel()"><X :size="12" /> 取消</button>
      <button class="btn sm ghost" :disabled="busy" @click="reset">清空</button>
      <span class="rp-hint">仅调用 _count + _stats，不写入任何数据</span>
    </div>

    <!-- 同族：左右双栏接统一可调工作台（拖拽/折叠/预设/记忆/窄屏堆叠由 WorkbenchLayout
 统一负责，原 1fr 1.4fr 固定 grid 与 1100px 断点退役；target 死控件删除——原控件从不写入） -->
    <WorkbenchLayout :scope="rpScope" :panes="RP_PANES" axis="vertical" mode="reindexPreview">
      <template #pane-rp-query>
        <div class="rp-left">
          <!-- .rp-hd 自造分节类 → 全局 .card-t.sm 分节档（本地规则删，间距随全局档） -->
          <div class="card-t sm">查询过滤器（可选）</div>
          <!-- JsonArea 统一件（裸 Monaco 合并）：合法性圆点/格式化/压缩/复制承担原自建校验红字。
 加 fill 随 pane 弹性（rows=11 仅留作非弹性回退档） -->
          <JsonArea v-model="queryBody" ref="rpJaRef" :rows="11" fill :dsl-assist="rpAssist" @submit="run" /><!-- P0-F③：ref 供 lint 划线（字面锚 `<JsonArea v-model="queryBody"` 保序不破）。：尾追 @submit 接 Ctrl+Enter（JsonArea 既有透传口，@submit 只增不重排） -->
          <div class="rp-snips">
            <button class="btn xxs" @click="setQ('match_all')">全部</button>
            <button class="btn xxs" @click="setQ('range_7d')">近 7 天</button>
            <button class="btn xxs" @click="setQ('range_30d')">近 30 天</button>
            <button class="btn xxs" @click="setQ('exists_field')">exists field</button>
          </div>
        </div>
      </template>

      <template #pane-rp-result>
        <div class="rp-right">
          <!-- rp.result 竖排标题「预估结果」退役（title:''，补账）——
 语义落行首 card-t sm；带现场跳转钮随行右对齐（ 锁 .rp-adv
 display:block+margin-left:auto 前缀不变）。同步：.panel 死类名 ×3 清理（全仓无定义） -->
          <div class="rp-hd">
            <div class="card-t sm">预估结果</div>
            <!-- 带现场去高级 Reindex：源索引 + 当前过滤器经 sessionStorage carry 契约（ReindexAdvancedView 消费即注入）。
 .rp-adv 空壳 div 退役（仅包单钮出 margin）——类直接挂钮，右对齐/间距归钮自身 -->
            <button class="btn sm ghost rp-adv" :disabled="!source" :title="'将源索引与当前过滤器带入高级 Reindex 配置页（不立即执行）'" @click="goAdvanced">
              <Wand2 :size="12" /> 带过滤条件去高级 Reindex
            </button>
            <!-- 原始 IO 快查——最近一次 /cluster/reindex-preview 请求/响应原文（ioRecorder 记录环） -->
            <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（Reindex 预估）" title="最近一次预估请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
          </div>
        <!-- G3-B5：失败面板独立于数据分支放容器顶部（ 审查教训形态）——
 有旧预估时重跑失败仍有渲染出口，且旧预估保留 -->
        <div v-if="runErr" role="alert" class="err-bar rise-in">
          {{ runErr }}
          <button class="btn sm" @click="run"><RefreshCw :size="12" /> 重试</button>
        </div>
        <!-- 运行中占位合并 EmptyState compact（文案逐字保留，容器形态归组件） -->
        <EmptyState v-if="busy && !result" compact :icon="RefreshCw" text="运行中…" />
        <!-- G3-C8：引导空态归位 EmptyState 组件（S6）——失败伪装引导态已被 runErr 互斥。
 hint 补 Ctrl+Enter 快捷键提示（编辑器内即可运行，不必移鼠点钮） -->
        <EmptyState v-else-if="!result && !runErr" :icon="Calculator" text="选择源索引后点击「运行预估」" hint="编辑器内 Ctrl+Enter 亦可运行" />
        <template v-else-if="result">
          <div v-if="busy" class="rp-refreshing">更新中…</div>
          <!-- G3-C6：0 命中醒目分档——不再只是建议区一条 li -->
          <div v-if="result.docs === 0" class="rp-zero">⚠ 过滤后 0 命中——Reindex 无意义：调整查询过滤器或换源索引再估</div>
          <!-- rp-meta 逐像素手写复刻合并 MetaStrip 统一件（IndexHub/Overview 同范式）：
 docs/源 bytes/avg-doc/目标预估四段走 items，两处 hi 强调走 info 档，:title 兜底全文 -->
          <MetaStrip class="rp-meta-pos" :items="rpMeta" :title="rpMetaTip" />

          <div class="rp-bar2">
            <div class="card-t sm">相对源占比可视化</div>
            <div class="rp-bar2-track">
              <div class="rp-bar2-fill" :style="{ width: rangeCss }"></div>
            </div>
            <div class="rp-bar2-lb">
              <span>0</span>
              <span class="mono">{{ pct }}%</span>
              <span>100%</span>
            </div>
          </div>

          <div class="rp-suggest">
            <div class="card-t sm">Reindex 建议</div>
            <!-- ：建议区值内嵌井号注释字面清理——slices 值归 auto，注释语义并入括号；
 slices/batch size 英文参数名补中文备注（铁律 F，715 G55/717 G60/721 同族） -->
            <ul>
              <li>建议 slices（并行分片数）：<span class="mono">{{ suggestSlices }}</span>（源分片数 × 1 或 auto；ES 7.x+ 的 auto 自动按分片切）</li>
              <li>建议 batch size（每批文档数）：<span class="mono">{{ suggestBatch }}</span>（保守值，可调）</li>
              <li>预估耗时（≈{{ estMBps }} MB/s）：<b class="rp-em mono">{{ estTime }}</b></li>
              <li v-if="result.estimatedTargetBytes > 50 * 1024 * 1024 * 1024"><b class="warn">⚠ 目标体积超 50GB，建议目标索引先增大 primary shards 数量</b></li>
            </ul>
          </div>
        </template>
        </div>
      </template>
    </WorkbenchLayout>

    <!-- 页内查询历史（mode=reindex-preview 单档过滤，SqlConsoleView 弹窗范式）。
 play/fill 同语义=回填 queryBody 草稿（预估页回放即「把历史过滤器带回编辑器」，不自动跑）；
 导入/清空入口关闭（同 SqlConsole 沙盒口径）；took 为端到端实测，tookTip 换本页口径防提示失真 -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（Reindex 预估）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="运行预估成功后自动记录（上限 100 条），可一键回填重跑"
        took-tip="端到端实测耗时（performance.now 计时，含网络往返；非 ES took 字段口径）"
        @play="replayHistRow" @fill="replayHistRow" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 /cluster/reindex-preview 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Calculator, RefreshCw, Wand2, History, X, Terminal } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { fmtNum } from '../utils/format';
import { semFormat } from '../composables/useSemFormat'; /* ：bytes 档单源 */
import PageHeader from '../components/PageHeader.vue';
import { useAppStore } from '../stores/app';
import { friendlyEsError } from '../utils/esError';
import { tryParse } from '../utils/jsonc';
import { useIdxState } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import EmptyState from '../components/EmptyState.vue';
import JsonArea from '../components/JsonArea.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：rp-meta 合并统一件 */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue'; /* ：页内历史面板合并共享件（SqlConsoleView 范式） */
import { useQueryHistoryStore } from '../stores/queryHistory';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import type { BodyKind } from '../utils/dslCompletionContext';
/* P0-F③：search body lintDsl 划线（只消费既有出口）+ 防抖统一件 */
import { lintDsl } from '../utils/dslLint';
import { useDebounceFn } from '../composables/useDebounceFn';
/* 运行读秒+可取消统一件（ 范式，SqlBridge 535 T4 同款接线） */
import { useQueryRun } from '../composables/useQueryRun';
import { writeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
const router = useRouter();
/* /：源索引并轨 useIdxState——只读预估页属跟随白名单（口径）。
 深链键从 ?src= 归并为全站统一的 ?idx=（useIdxState 同「索引」语义键，上下行顶栏；
 无存量 ?src= 契约锁），顶栏切索引即跟随改源。 */
const source = useIdxState({ follow: true });
/* 查询体进 sessionStorage 草稿——刷新不丢稿（可重入） */
/* 草稿治理输: 查询体草稿迁 useScopedDraft（按集群目标隔离） */
const queryBody = useScopedDraft('query', {
  route: 'reindex-preview',}, '{\n  "query": { "match_all": {} }\n}').text;
const result = ref<any>(null);
const busy = ref(false);
const runErr = ref(''); // G3-B5：预估失败内联面板状态位——不再仅 toast 回落引导空态（ 同源）

/* 统一可调工作台声明（同族）：过滤器 pane 可折叠，结果区 flex 吸收剩余宽。
 rp.query 自带 .rp-hd 头部——title 置空退役竖排轨（ResizablePane v-if=title 不渲染，
 折叠钮随轨退役）；rp.result 无自带头部，保留竖排轨不动。
 rp.result 竖排标题「预估结果」退役（title:''，补账）——语义落 pane 内
 行首 card-t sm（模板 .rp-hd 行），pane spec 形态与 rp.query 对齐 */
const rpScope = { target: store.target || 'host', route: '/reindex-preview', mode: 'reindexPreview', profile: 'standard' as const };
const RP_PANES: WorkbenchPaneSpec[] = [
  { id: 'rp.query', role: 'request', title: '', minSize: 300, defaultSize: 420, collapsible: true },
  { id: 'rp.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex' },
];

/* 带过滤条件去高级 Reindex：sessionStorage carry 契约（favReplay/模板 gallery 同 key，
 ReindexAdvancedView onMounted 消费即清并注入 rawBody）；query 原样随 body 带过去，
 JSON 非法时不带 query（JsonArea 圆点已在编辑器提示，不在跳转口二次拦截） */
function goAdvanced() {
  if (!source.value) return;
  const body: any = { source: { index: source.value } };
  const q = tryParse(queryBody.value);
  if (q != null) body.source.query = q;
  writeStoredRaw(sessionStorage, 'esquerystudio.reindex-advanced.body', JSON.stringify(body, null, 2));
  router.push('/reindex-advanced');
}

/* ux2 ：查询过滤器挂 dslAssist search 档——字段档吃 useIndexFields（源索引优先，回退侧栏
 选中）；ensure 幂等 + 竞态守卫内置 + 空索引早退零网络（useIndexFields L33-58）。
 闭包常量 setup 作用域纪律同 DslQueryView L568-570（模板内联对象字面量会被 _ctx 代理 unwrap）。 */
const { fields: rpFields, ensure: ensureRpFields } = useIndexFields(() => source.value || store.pickedIdx || '');
watch(source, () => { ensureRpFields(); }, { immediate: true });
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包，索引源与 fields 同源现调现读 */
const rpTerms = useTermsSuggest(() => source.value || store.pickedIdx || '');
const rpAssist = { fields: () => rpFields.value, bodyKind: (): BodyKind => 'search', terms: (f: string, p: string) => rpTerms.suggestAsync(f, p) };

const SNIPS: Record<string, string> = {
  match_all: '{\n  "query": { "match_all": {} }\n}',
  range_7d: '{\n  "query": {\n    "range": {\n      "@timestamp": { "gte": "now-7d/d" }\n    }\n  }\n}',
  range_30d: '{\n  "query": {\n    "range": {\n      "@timestamp": { "gte": "now-30d/d" }\n    }\n  }\n}',
  exists_field: '{\n  "query": {\n    "exists": { "field": "your_field" }\n  }\n}',
};
function setQ(k: string) { queryBody.value = SNIPS[k]; }

/* ═══ P0-F③：search body lintDsl 划线接线（SearchSandboxView 范式逐字）═══
 useDebounceFn 250ms + JsonArea setMarkers 透传口 + info→hint 降级；非法 JSON 不 lint
 （JsonArea 合法性圆点已报）；fields 用 rpFields 现值，不主动拉请求 */
const rpJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const parsedRpBody = computed<Record<string, unknown> | null>(() => {
  const t = queryBody.value.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
});
const queueRpLint = useDebounceFn(() => {
  const findings = parsedRpBody.value ? lintDsl(parsedRpBody.value, { fields: rpFields.value }) : [];
  rpJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(queryBody, () => queueRpLint(), { immediate: true });

/* 数值单源退役——fmtN 本地 K/M/B 缩写退役改 fmtNum 千分位（数值单一语言），
 fmtSize 本地字节三元退役改 semFormat bytes 单源（1024 进制档位制；空值回落 '—'）；
 展示微差可接受（'12.3K' → '12,345'、'117.7 MB' 口径一致），档位以单源为准 */
const fmtN = (n?: number | null): string => (n == null ? '—' : fmtNum(n));
const fmtSize = (bytes?: number | null): string => semFormat(bytes, 'bytes')?.text ?? '—';
/* rp-meta 手写串 → MetaStrip items（ihMeta 同构）；hi 强调走 info 档。
 ：四段英文裸词补段级中文 tip（铁律 F；容器 :title 兜底全文保留，
 715 G55/717 G60/721 同族） */
const rpMeta = computed<MetaStripItem[]>(() => {
  const r = result.value;
  if (!r) return [];
  return [
    { value: fmtN(r.docs), label: '符合过滤 doc（占源 ' + ratio.value + '）', tone: 'info', tip: '符合过滤条件的文档数（占源索引比例）' },
    { value: fmtSize(r.sourcePrimaryBytes), label: '源 primary bytes（' + fmtN(r.sourceTotalDocs) + ' docs）', tip: '源索引主分片存储体积（全部源文档）' },
    { value: fmtSize(Math.round(r.avgDocBytes)), label: 'avg/doc', tip: '平均单文档体积（primary bytes ÷ 源 docs）' },
    { value: fmtSize(r.estimatedTargetBytes), label: '目标预估 bytes（docs × avg）', tone: 'info', tip: '目标索引预估体积（符合过滤 doc × 平均单文档体积）' },
  ];
});
/* title 兜底全文（原 .rp-meta 手写 title 同文案） */
const rpMetaTip = computed(() => {
  const r = result.value;
  if (!r) return '';
  return '符合过滤的 doc ' + fmtN(r.docs) + '，占源 ' + ratio.value
    + ' · 源 primary bytes ' + fmtSize(r.sourcePrimaryBytes) + '（' + fmtN(r.sourceTotalDocs) + ' docs）'
    + ' · avg/doc ' + fmtSize(Math.round(r.avgDocBytes)) + '（平均文档体积）'
    + ' · 目标预估 bytes ' + fmtSize(r.estimatedTargetBytes) + '（docs × avg）';
});

const ratio = computed(() => {
  const r = result.value;
  if (!r || !r.sourceTotalDocs) return '—';
  return ((r.docs / r.sourceTotalDocs) * 100).toFixed(1) + '%';
});
const pct = computed(() => {
  const r = result.value;
  if (!r || !r.sourceTotalDocs) return 0;
  return Math.min(100, Math.round((r.docs / r.sourceTotalDocs) * 100));
});
const rangeCss = computed(() => pct.value + '%');

/* reindex 建议（基于常见经验）。 ：slices 值归 auto——
 原值内嵌井号注释字面（与括号解释语义重复），注释语义并入模板括号 */
const suggestSlices = computed(() => {
  const r = result.value;
  if (!r) return '—';
  return 'auto';
});
const suggestBatch = computed(() => {
  const r = result.value;
  if (!r || !r.avgDocBytes) return '1000';
  const bytes = r.avgDocBytes;
  if (bytes > 100 * 1024) return '200';
  if (bytes > 10 * 1024) return '500';
  return '1000';
});
const estMBps = 30;   // 保守估计单节点 reindex 写入 30 MB/s
const estTime = computed(() => {
  const r = result.value;
  if (!r || !r.estimatedTargetBytes) return '—';
  const secs = r.estimatedTargetBytes / (estMBps * 1024 * 1024);
  if (secs < 60) return secs.toFixed(0) + 's';
  if (secs < 3600) return (secs / 60).toFixed(1) + ' 分钟';
  return (secs / 3600).toFixed(1) + ' 小时';
});

/* 读秒/取消/signal 三件（SqlBridge 535 T4 同款）——running 驱动取消钮显隐与
 「预估中 X.Xs」读秒文案；begin() 返回 signal 传 api.reindexPreview 既有第三形参 */
const qr = useQueryRun();

async function run() {
  /* busy 补位守卫——Ctrl+Enter 在途重复触发会把上一轮控制器 abort 掉
 （begin 即作废语义），页内连敲不再自我打断 */
  if (!source.value || busy.value) return;
  /* G3-B5：入口不再清 result——重跑失败保留旧预估（ 保留旧数据裁定）；
 try/finally 保证 busy 复位 */
  busy.value = true; runErr.value = '';
  /* 端到端实测计时——点击/快捷键到响应返回的全程（含网络往返），
 非 ES took 字段口径；面板 tookTip 已同步换「端到端实测」文案 */
  const t0 = performance.now();
  const signal = qr.begin(); /* 取消以 AbortError 落此 */
  try {
    const r = await api.reindexPreview(source.value, queryBody.value, signal);
    result.value = r;
    /* 成功才入史（失败有 runErr 红条可重试，不占历史位）——
 mode=reindex-preview 非 QUERY_MODES 键，面板 showMode 关闭不渲染徽标（modeLabel 回落原文键先例同 528 'template'） */
    useQueryHistoryStore().push('reindex-preview', queryBody.value, source.value, Math.round(performance.now() - t0), true);
  } catch (e: any) {
    /* 用户主动取消不算错误（ 同语义，SqlBridge 535 T4 同款）：AbortError/signal.aborted
 静默丢弃——不进 runErr 红条、不占史位、不弹 error toast，旧预估原样保留 */
    if (e?.name === 'AbortError' || signal.aborted) { store.notify('info', '已取消预估'); return; }
    runErr.value = '预估失败：' + friendlyEsError(String(e?.message ?? e));
    store.notify('error', runErr.value);
  } finally {
    busy.value = false;
    qr.finish();
  }
}
function reset() { result.value = null; runErr.value = ''; queryBody.value = SNIPS.match_all; }

/* ═══ ：页内查询历史（u 遗留后半）——push 自起有页内出口 ═══
 play/fill 同语义回填草稿（u 裁决：回放=回填 queryBody 草稿，不自动跑）；
 草稿通道=useScopedDraft query（与手工编辑/snips 同一条写入路径），随填随 lint 划线 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'reindex-preview'));
function replayHistRow(row: { query: string }) {
  queryBody.value = row.query;
  histOpen.value = false;
}

/* 原始 IO 快查（545 四页同款）——特征 /cluster/reindex-preview；判空 rec=null
 （本页还没跑过预估）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/reindex-preview');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
.rp { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
.rp-bar { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); flex-wrap: wrap; }
/* G3-C9：.rp-sel/.rp-in 死样式已删（源/目标均为 IndexPicker，模板无对应元素） */
.rp-hint { color: var(--tx2); font-size: var(--fs-xs); }
/* 双栏交给 WorkbenchLayout（pane 内卡片只保留内边距）；带现场跳转按钮行贴结果区顶 */
.rp-left, .rp-right { padding: var(--sp-3) var(--sp-4); }
/* rp-left 补高度链（AdhocRebuildView .ed-col 同款）——JsonArea fill 吃满 pane 剩余高 */
.rp-left { height: 100%; display: flex; flex-direction: column; min-height: 0; }
/* .ja 编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——分界由查询过滤器卡头承接线承担（全局 .card-t 无 border，补齐，纯视觉）；
 组件本体零触，flex/高度链零变动 */
.rp-left > .card-t { border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2); }
.rp-left :deep(.ja) { border: none; border-radius: 0; }
/* 壳 div 退役——.rp-adv 直接挂钮：块级化让 margin-left:auto 右对齐生效，间距归钮。
 rp-adv 随 rp-hd 行右对齐，margin-bottom 归行（ 锁前缀不变） */
.rp-adv { display: block; margin-left: auto; margin-bottom: 0; }
/* rp-hd 行——「预估结果」语义落行首 card-t sm（rp.result 竖排标题退役）；
 ⚠与 退役的 .rp-hd 自造分节类同名不同物：彼时是 fs-xs 分节标题档，此时是 flex 行容器，
 行内 card-t 间距归零（全局 .card-t.sm 的 margin 由本行接管） */
.rp-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.rp-hd .card-t { margin: 0; }
/* .rp-hd/.rp-bar2-hd 自造分节类随 .card-t.sm 合并退役（模板三处挂载点同迁；
 分节档间距 12/8 由全局承担，原 fs-xs+margin-bottom 8 本地档不再保留） */
.rp-snips { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); flex-wrap: wrap; }
/* .rp-empty 裸占位随「运行中…」合并 EmptyState compact 退役，留白归组件 */
.rp-refreshing { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-2); }
/* G3-C6：0 命中醒目分档（warn 语义） */
.rp-zero { padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-3); font-size: var(--fs-sm); color: var(--wn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-s); }
/* .rp-meta 手写复刻五条样式随合并退役（MetaStrip 自带 mono/值亮/标签暗/sep）——只留落位间距 */
.rp-meta-pos { margin-bottom: var(--sp-3); }
.rp-bar2 { margin: var(--sp-4) 0; }
.rp-bar2-track { position: relative; height: 12px; background: var(--bg2); border: 1px solid var(--bd); border-radius: var(--r-s); overflow: hidden; }
.rp-bar2-fill { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, var(--ac), color-mix(in oklab, var(--ac) 50%, var(--ok))); transition: width .4s; }
.rp-bar2-lb { display: flex; justify-content: space-between; color: var(--tx2); font-size: var(--fs-xs); margin-top: var(--sp-1); }
.rp-suggest { border-top: 1px dashed var(--bd); padding-top: var(--sp-3); margin-top: var(--sp-2); }
.rp-suggest ul { margin: 0; padding-left: 18px; color: var(--tx1); font-size: var(--fs-sm); line-height: 1.9; }
.rp-suggest .warn { color: var(--wn); }
/* 建议区关键值（预估耗时）键暗值亮强调；queryBody JSON 合法性提示已由 JsonArea 圆点统一承担 */
.rp-em { color: var(--tx0); font-weight: 600; font-variant-numeric: tabular-nums; }

/* 响应式顺带（responsive900Sweep529 口径：只加 CSS 零结构动）——双栏堆叠已由
 WorkbenchLayout 统一承担（视图侧不重复造 1100 堆叠档）；900 紧凑档只收工具条
 与 pane 侧距 */
@media (max-width: 900px) {
  .rp-bar { padding: var(--sp-2) var(--sp-3); }
  .rp-left, .rp-right { padding: var(--sp-2) var(--sp-3); }
}
</style>
