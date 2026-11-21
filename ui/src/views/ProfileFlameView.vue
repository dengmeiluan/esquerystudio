<template>
  <div class="pf-page">
    <div class="pf-hd">
      <PageHeader :icon="Flame" title="Profile 火焰图" subtitle="解析 _search?profile=true · 分片瓶颈 · 耗时排序 · 一键定位慢查询">
      <template #actions>
<button class="btn ghost sm" @click="loadSample" title="填示例查询">
  <FileText :size="12" /> 示例
</button>
      </template>
      </PageHeader>
      <LabNav current="/profile-flame" />
</div>

    <div class="pf-inputs">
      <IndexPicker v-model="index" placeholder="索引名（可含通配符）" allow-wildcard />
      <button class="btn primary sm" @click="run" :disabled="busy || !dsl.trim()">
        <Play :size="12" :class="{ spinning: busy }" /> {{ busy ? '分析中…' : '分析' }}
      </button>
      <!-- 编辑器高度四档钮（editorTiers 统一件，SearchTemplatesView st.editorH 同款范式） -->
      <div class="pf-eh" role="group" aria-label="编辑器高度档位" title="编辑器高度档位：S/M/L/满">
        <button v-for="eh in EDITOR_H_TIERS" :key="eh.k" type="button" class="pf-eh-btn"
          :class="{ on: editorH === eh.k }" :aria-pressed="editorH === eh.k"
          :title="'编辑器高度：' + eh.t" @click="editorH = eh.k">{{ eh.t }}</button>
      </div>
    </div>

    <!-- JsonArea 统一件（裸 textarea 合并）：合法性圆点/格式化/压缩/复制；
 定高 rows=10 退役换高度四档（usePref pf.editorH，S/M/L rows 定高、
 满档 wrap 42vh 弹性由 pf-body-wrap 接管）；@submit=Ctrl+Enter 执行（JsonArea 透传通道） -->
    <div class="pf-body-wrap" :class="{ 'pf-h-full': editorH === 'full' }">
      <JsonArea ref="pfJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="PF_ROWS[editorH]" :fill="editorH === 'full'" class="pf-body-ja" @submit="run" />
    </div>

    <div v-if="parsed" class="pf-result">
      <!-- 汇总四格数值并 meta-num 全局数值档（mono+tabular-nums，与 MetaStrip 值档/
 IndexOptimizer io-seg-stats 同语言；650 字重档不动） -->
      <div class="pf-summary">
        <div class="pf-sum-cell meta-num"><b>{{ parsed.totalShards }}</b><span>参与分片</span></div>
        <div class="pf-sum-cell meta-num"><b>{{ (parsed.totalTook / 1_000_000).toFixed(2) }}ms</b><span>总耗时</span></div>
        <div class="pf-sum-cell warn meta-num"><b>{{ (parsed.maxTook / 1_000_000).toFixed(2) }}ms</b><span>最慢分片</span></div>
        <div class="pf-sum-cell meta-num"><b>{{ parsed.hotOps.length }}</b><span>热操作</span></div>
      </div>

      <div class="pf-section">
        <!-- 字排三件挂全局 .sec-t 单源（pf-section-tt 锚只留分界线与行内排布） -->
        <div class="sec-t pf-section-tt">分片耗时热力条（越红越慢）</div>
        <div class="pf-heat">
          <div v-for="s in parsed.shardRows" :key="s.id" class="pf-heat-row" @click="focused = s" role="button" tabindex="0" @keydown.enter.prevent="focused = s" @keydown.space.prevent="focused = s">
            <div class="pf-heat-label">{{ s.id }}</div>
            <div class="pf-heat-bar" :style="{ width: barPct(s.took) + '%', background: heatColor(s.took) }">
              {{ (s.took / 1_000_000).toFixed(2) }}ms
            </div>
          </div>
        </div>
      </div>

      <div v-if="focused" class="pf-section">
        <!-- 字排三件挂全局 .sec-t 单源（pf-section-tt 锚只留分界线与行内排布） -->
        <div class="sec-t pf-section-tt">
          分片 <b>{{ focused.id }}</b> · 火焰图（按耗时占比）
          <button class="btn ghost xs" style="margin-left:auto" @click="focused = null">
            <X :size="10" /> 关闭
          </button>
        </div>
        <div class="pf-flame">
          <div v-for="(n, i) in focused.nodes" :key="i" class="pf-flame-row" tabindex="0"
            :style="{ paddingLeft: n.depth * 16 + 'px' }"
            @contextmenu.prevent="openFlameMenu($event, n, i)" @keydown="onFlameMenuKey($event, n, i)" data-row-nav @keydown.self="rowArrowNav">
            <div class="pf-flame-bar" :style="{ width: (n.took / focused.took * 100).toFixed(1) + '%', background: heatColor(n.took) }"
              :title="`${n.type} · ${n.description || ''} · ${(n.took / 1_000_000).toFixed(2)}ms`">
              <span class="pf-flame-type">{{ n.type }}</span>
              <span class="pf-flame-ms">{{ (n.took / 1_000_000).toFixed(2) }}ms</span>
            </div>
          </div>
        </div>
        <CellContextMenu v-if="flameMenu" :x="flameMenu.x" :y="flameMenu.y" :title="flameMenu.title"
          :items="flameMenuItems" @close="flameMenu = null" />
      </div>

      <div class="pf-section">
        <!-- 字排三件挂全局 .sec-t 单源（pf-section-tt 锚只留分界线与行内排布） -->
        <div class="sec-t pf-section-tt">最慢的 10 个操作
          <!-- tfoot Σ 挪标题行（小表接 QRT 后无自定义 tfoot；口径不变=前 10 行耗时和） -->
          <span class="pf-sum mono">Σ（前 10）{{ hotOpsSumMs }}ms</span>
          <!-- MD 复制钮（matrixText 统一内核，DiagView「Markdown 贴文档」同款入口形态） -->
          <button class="btn ghost xs" style="margin-left:auto" @click="copyHotOpsMd"
            title="最慢操作表复制为 Markdown（群聊/工单直贴）"><ClipboardCopy :size="11" /> Markdown</button>
        </div>
        <!-- 小表接 QRT rows 型（cols+二维行，耗时纳秒→ms 与原表同 3 位小数口径）——
 白得排序/列漏斗/单元格详情/复制矩阵/五格式导出；行内容为纯标量（描述全文进 title，
 显示截断由 QRT 内建），pf-op-tag 徽标/自定义 tfoot 随换表退役。
 补 sortable+storageKey('flame')+fieldTypes（耗时列 percent 型
 effType 标注——列头类型徽标白得；semOn 语义档通道随标注就位）。
 semOn 经形态核对不接——hotRows 耗时值是 ms 时长（took/1e6），非
 0..1/0..100 百分比；现 percent 标注一开 semOn 即把 0.42ms 渲成「42%」（semFormat
 percent 档 0..1 按 fraction 解释），属误伤。待后续批次把标注换 duration 族
 （如 'millis'）再开 semOn；只补 :loading + export-name。 -->
        <QueryResultTable class="pf-hot-qrt" :cols="hotCols" :rows="hotRows" sortable
          storage-key="flame" :field-types="{ '耗时(ms)': 'percent' }" export-name="profile-flame"
          max-height="420px" :loading="busy"
          empty-text="无操作数据" />
      </div>
    </div>

    <!-- 失败内联面板：错误现场留存 + 重试（原仅 toast，parsed=null 直接回落空态易误读）。
 私造红壳（border+err-soft+radius，样式 :pf-err 段）退役，合并全局
 err-bar 形态（role=alert 在场，theme.css :554 单源；557 IH ih-qerr 先例）——
 重试钮走既有 run 逻辑原样保留，文案逻辑零触 -->
    <div v-else-if="runErr" role="alert" class="err-bar pf-err">
      <AlertCircle :size="14" />
      <div class="pf-err-body">
        <!-- 首行走 friendlyEsError 一句人话，pre 保留全文回看（对齐 AnalyzeView 口径）；
 裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文）；
 双参改用——errMeta(runErrRaw) 出错误链 meta（非 ApiError 出空 meta，
 输出与单参逐字一致；runErr 压串全文回看语义不变） -->
        <div><b>分析失败</b> · {{ friendlyErr }}</div>
        <pre class="pf-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
        <div class="pf-err-acts">
          <button class="btn sm" @click="run" :disabled="busy || !dsl.trim()">重试</button>
        </div>
      </div>
    </div>

    <EmptyState v-else-if="!busy" :icon="Flame" class="pf-empty-fill"
      text="尚无 Profile 数据"
      hint="在上方填入 DSL 后点「分析」，火焰图会展示每个分片、每个查询组件的耗时占比" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Flame, FileText, Play, X, AlertCircle, ClipboardCopy } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useUrlState } from '../composables/urlState';
import { usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import IndexPicker from '../components/IndexPicker.vue';
import JsonArea from '../components/JsonArea.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import EmptyState from '../components/EmptyState.vue';
import { friendlyEsError } from '../utils/esError'; /* ：runErr 人话化 */
import { removeStoredRaw } from '../utils/safeJson';
/* errMeta 随双参改用接入（utils/errPre 帮手只读复用） */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核 */
import { matrixText } from '../utils/copyMatrix'; /* ：最慢操作表 MD 复制 */
/* 编辑器高度四档（SearchTemplatesView st.editorH 同款 editorTiers 统一件） */
import { EDITOR_H_TIERS, type EditorHKey } from '../utils/editorTiers';
import { copyText } from '../utils/format';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检（RankDebugView 同款接线） */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：lint 划线防抖统一件 */

const store = useAppStore();
/* 目标索引进 URL——刷新/分享链接可复原（可重入）。
 语义修正：本页索引可含通配符（IndexPicker allow-wildcard），此前
 useIdxState({follow:true}) 会把页内输入经 watch 上行 store.pick——输 `logs-*` 即污染
 全局工作索引（顶栏回显裸通配串、recentIdx 存脏值、跨页把通配符当工作索引携带）。
 改本地目标态：useUrlState 同键 ?idx= 读写（刷新/分享可复原不变、旧 ?idx= 深链兼容），
 不 follow、不上行；pickedIdx 仅在挂载时一次性单向回填初值（见 onMounted），
 此后页内输入与全局工作索引互不干扰 */
const index = useUrlState('idx');
/* DSL 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
 fields() 侧惰性 ensure：补全触发才拉 mapping（挂载零请求；本页索引可含通配符，
 mapping 拉取失败零降级仅无候选），cache 命中后直读 */
const { fields: assistFields, ensure: pfEnsureRaw } = useIndexFields(() => index.value);
/* 1125：挂载即拉 mapping 属当前目标的数据——身份未落地先拉会带上一账号的 target。
   门放行才发，未放行则记挂起，身份落地后补跑（useGatedBootRead 负责补跑时机）。 */
const pfAssistBoot = useGatedBootRead('profile-flame', () => { void pfEnsureRaw(); });
function ensureAssistFields() { pfAssistBoot.run(); }
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包，索引源与 fields 同源现调现读 */
const pfTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => { if (!assistFields.value.length) ensureAssistFields(); return assistFields.value; }, terms: (f: string, p: string) => pfTerms.suggestAsync(f, p) };
/* →草稿：DSL 草稿迁 useScopedDraft（按集群目标隔离）。索引可为通配符/跨索引，
 不进 key——以目标集群为准分家 */
const dsl = useScopedDraft('dsl', {
  route: 'profile-flame',}, '{\n  "query": { "match_all": {} },\n  "size": 5\n}').text;

/* lintDsl 静态体检（RankDebugView 最简接线同款）——JSON 解析失败静默不阻塞。
 lint ctx 字段表与 dsl-assist 同源；挂载即 ensure（UpdateByQueryView immediate 范式，
 只读 mapping 请求、失败零降级），fields 空=类型系规则自动跳过，零 ctx 规则始终生效 */
/* 1125：挂载即拉 mapping 属当前目标的数据——身份未落地先拉会带旧 target；
   未放行则挂起，身份/索引变化后补跑。 */
watch(index, () => { void ensureAssistFields(); }, { immediate: true });
const pfLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: assistFields.value }); }
  catch { return []; }
});
/* lint findings 注入编辑器划线（RankDebug 范式：debounce 250ms 防每敲一键
 全量 findMatches；info 降级 hint——marker 档只收 warning/hint/error）。本页 body 是
 JsonArea 统一件，setMarkers 走其 透传出口 */
const pfJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queuePfLintMarkers = useDebounceFn(() => {
  pfJaRef.value?.setMarkers?.(pfLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queuePfLintMarkers(); }, { immediate: true });
const busy = ref(false);
const parsed = ref<any>(null);
const focused = ref<any>(null);

/* ═══ 火焰图行右键（此前只能靠悬浮 title 看全文，取不到也复制不了）═══
 一级 = 2 高频 + 1 分组父项（项目右键约定）。火焰行是只读分析数据，
 菜单刻意不含任何 danger / 配置写入动作。 */
const flameMenu = ref<{ x: number; y: number; title: string; n: any } | null>(null);
const msOf = (ns: number) => (Number(ns || 0) / 1e6).toFixed(2) + 'ms';
function onFlameMenuKey(e: KeyboardEvent, n: any, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  flameMenu.value = { ...menuKeyAnchor(e), title: n.type + ' · ' + msOf(n.took) + ' · 第 ' + (i + 1) + ' 行', n };
}
function openFlameMenu(e: MouseEvent, n: any, i: number) {
  flameMenu.value = { x: e.clientX, y: e.clientY, title: n.type + ' · ' + msOf(n.took) + ' · 第 ' + (i + 1) + ' 行', n };
}
const flameMenuItems = computed<CcmItem[]>(() => {
  const m = flameMenu.value;
  if (!m) return [];
  const n = m.n;
  const desc = String(n.description || '');
  const pct = focused.value?.took ? ((n.took / focused.value.took) * 100).toFixed(1) + '%' : '';
  return [
    { key: 'copyDesc', label: '复制描述', run: () => { void copyText(desc || n.type || ''); } },
    { key: 'copyMs', label: '复制耗时（' + msOf(n.took) + '）', run: () => { void copyText(msOf(n.took)); } },
    {
      key: 'more', label: '更多…', children: [
        { key: 'copyType', label: '复制类型（' + (n.type || '-') + '）', run: () => { void copyText(String(n.type || '')); } },
        { key: 'copyNode', label: '复制节点 JSON', run: () => { void copyText(JSON.stringify(n, null, 2)); } },
        ...(pct ? [{ key: 'copyPct', label: '复制占比（' + pct + '）', run: () => { void copyText(pct); } }] : []),
      ],
    },
  ];
});
const runErr = ref(''); // 分析失败全文，供内联面板回看
/* 原始错误对象旁路留存——runErr 仍压串（全文回看语义逐字保留），
 ApiError 实例经 errMeta 出 code/endpoint 错误链（errPreHtml 双参喂入） */
const runErrRaw = ref<unknown>(null);
/* 编辑器高度四档记忆（usePref pf.editorH；S/M/L 走 JsonArea rows 定高——
 JsonArea 无 height prop，以 19px/行+16px 换算：10/18/29 行 ≈ 206/358/567px，贴 editorTiers
 三档 200/360/560；满档 fill 弹性交 wrap 42vh 接管） */
const editorH = usePref<EditorHKey>('pf.editorH', 's');
const PF_ROWS: Record<EditorHKey, number> = { s: 10, m: 18, l: 29, full: 10 };
/* 错误面板首行人话；runErr 全文保留进 pre 回看 */
const friendlyErr = computed(() => (runErr.value ? friendlyEsError(runErr.value) : ''));

function loadSample() {
  dsl.value = JSON.stringify({
    query: {
      bool: {
        must: [{ match: { title: 'sample' } }],
        filter: [{ range: { createdAt: { gte: 'now-7d' } } }]
      }
    },
    aggs: { by_status: { terms: { field: 'status.keyword', size: 10 } } },
    size: 5
  }, null, 2);
}

async function run() {
  busy.value = true; parsed.value = null; focused.value = null; runErr.value = ''; runErrRaw.value = null;
  try {
    const body = JSON.parse(dsl.value);
    body.profile = true;
    const r = await api.searchDsl(index.value || undefined, JSON.stringify(body), { profile: true });
    parsed.value = parseProfile(r);
    if (parsed.value.shardRows.length === 1) focused.value = parsed.value.shardRows[0];
  } catch (e: any) {
    runErr.value = String(e?.message || e);
    runErrRaw.value = e;
    store.notify('error', '分析失败：' + (e?.message || e));
  } finally { busy.value = false; }
}

interface FlameNode { type: string; description?: string; took: number; depth: number; }
function walkFlame(n: any, depth: number, out: FlameNode[]) {
  const took = n.time_in_nanos ?? n.time ?? 0;
  out.push({ type: n.type || n.query_type || 'node', description: n.description || n.name, took, depth });
  const children = n.children || n.breakdown ? n.children : [];
  if (children) for (const c of children) walkFlame(c, depth + 1, out);
}

function parseProfile(resp: any) {
  const shardRows: any[] = [];
  const hotOps: any[] = [];
  const shards = resp?.profile?.shards || [];
  let totalTook = 0, maxTook = 0;
  for (const sh of shards) {
    const nodes: FlameNode[] = [];
    let shardTotal = 0;
    for (const s of sh.searches || []) {
      for (const q of s.query || []) walkFlame(q, 0, nodes);
      for (const c of s.collector || []) walkFlame(c, 0, nodes);
    }
    for (const agg of sh.aggregations || []) walkFlame(agg, 0, nodes);
    for (const n of nodes) { shardTotal += n.depth === 0 ? n.took : 0; hotOps.push({ ...n, shard: sh.id }); }
    shardRows.push({ id: sh.id, took: shardTotal, nodes });
    totalTook += shardTotal;
    if (shardTotal > maxTook) maxTook = shardTotal;
  }
  shardRows.sort((a, b) => b.took - a.took);
  hotOps.sort((a, b) => b.took - a.took);
  return { totalShards: shards.length, totalTook, maxTook, shardRows, hotOps };
}

function barPct(t: number) { const m = parsed.value?.maxTook || 1; return Math.max(2, (t / m * 100)).toFixed(1); }

/* ══ ：最慢 10 操作表配套——MD 复制 + Σms；：小表接 QRT rows 型 ══
 Σ 口径：与表中展示一致取 hotOps 前 10 行（表外全量见分片热力条/汇总卡） */
const hotOpsSumMs = computed(() =>
  (parsed.value?.hotOps.slice(0, 10) ?? []).reduce((s: number, h: any) => s + (h.took / 1_000_000), 0).toFixed(3));

/* QRT rows 型数据源——耗时纳秒→ms（3 位小数与原表同口径）、描述全文
 （显示截断/title 由 QRT 内建承担，不再手切 80）；全部落标量（QRT rows 契约） */
const hotCols = ['类型', '描述', '耗时(ms)', '分片'];
const hotRows = computed<(string | number)[][]>(() =>
  (parsed.value?.hotOps.slice(0, 10) ?? []).map((h: any) => [
    String(h.type ?? ''),
    String(h.description || ''),
    Number((h.took / 1_000_000).toFixed(3)),
    String(h.shard ?? ''),
  ]));

async function copyHotOpsMd() {
  const rows = parsed.value?.hotOps.slice(0, 10) ?? [];
  if (!rows.length) return;
  const ok = await copyText(matrixText({
    rows,
    cols: ['类型', '描述', '耗时(ms)', '分片'],
    getVal: (h: any, c: string) =>
      c === '耗时(ms)' ? (h.took / 1_000_000).toFixed(3) : String(h[c === '描述' ? 'description' : c] ?? ''),
  }, 'md'));
  store.notify(ok ? 'success' : 'error', ok ? '最慢操作 Markdown 已复制' : '复制失败');
}
function heatColor(t: number) {
  const m = parsed.value?.maxTook || 1;
  const p = t / m;
  if (p > 0.75) return 'var(--err)';
  if (p > 0.5) return 'var(--warn)';
  if (p > 0.25) return 'var(--dv-yellow)';
  return 'var(--ok)';
}

onMounted(() => {
  /* 命令面板「把当前 DSL 送去火焰图分析」的一次性载荷：读后即清（防刷新重复覆盖
     用户后续手改的草稿）；profile:true 由 run() 自行注入，这里只回填原始 body。 */
  const carried = sessionStorage.getItem('esquerystudio.flame.body');
  if (carried && carried.trim()) {
    dsl.value = carried;
    removeStoredRaw(sessionStorage, 'esquerystudio.flame.body');
    const carriedIdx = sessionStorage.getItem('esquerystudio.flame.index');
    if (carriedIdx) { index.value = carriedIdx; removeStoredRaw(sessionStorage, 'esquerystudio.flame.index'); }
    return;
  }
  if (!index.value) index.value = store.pickedIdx || '';
});
</script>

<style scoped>
/* min-height:100% + flex 纵向：让页面吃满 .page 可滚区，
 原来只有内容高，下方空出 561px 纯死白而编辑框仅 120px。 */
/* 根元素不再自加 padding：全局 .page 已带 var(--sp-4) var(--sp-5) var(--sp-6)，
 自加 8px 10px 与其叠加且数值与全站多数视图（.alv/.tv2 根均无 padding）不齐 */
.pf-page { min-height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
/* flex:1 吃掉编辑器下方的剩余高度：实测空态原本停在 y=514，下方 486px 是死白。 */
.pf-empty-fill { flex: 1; margin: auto; }
/* .pf-err 私造红壳（border+err-soft+radius+err 色）退役 → 全局 .err-bar 形态
 （role=alert，theme.css :554 单源；557 IH .ih-qerr 先例）。本组只留多行面板顶对齐
 （icon+body 富内容不随 err-bar 居中）与落位节奏（pf-page 无 gap，抵掉 err-bar 自带 margin-bottom） */
.pf-err { align-items: flex-start; margin-bottom: 0; }
.pf-err-body { flex: 1; min-width: 0; }
.pf-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
.pf-err-acts { margin-top: var(--sp-2); }
.pf-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-2); }
/* 删页头标题/副题死规则（页头已由 PageHeader 接管，模板 0 引用）；
 ：同族漏删的页头左组/图标色两条+IndexPicker 合并后手写输入框孤儿一条
 一并清（模板 0 引用；713 G53/727 同族）——注记转述不留符号字面量（*/

.pf-inputs { display: flex; gap: var(--sp-1h); margin-bottom: var(--sp-1h); align-items: center; padding-bottom: var(--sp-1h); border-bottom: 1px solid var(--border); } /* ：编辑器外框退役后本行即工具条承接线（全局 .card-t 无 border 补线先例，纯视觉） */
/* 编辑器高度档位钮组（SearchTemplatesView st-eh 同款视觉） */
.pf-eh { display: flex; gap: var(--sp-0); flex-shrink: 0; margin-left: auto; }
.pf-eh-btn { border: 1px solid var(--line); background: var(--bg1); color: var(--tx2); font-size: var(--fs-xs); line-height: 1; padding: var(--sp-1) var(--sp-2); cursor: pointer; border-radius: 3px; }
.pf-eh-btn:hover { color: var(--tx1); border-color: var(--ac-line); }
.pf-eh-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* 主输入高度四档——S/M/L JsonArea rows 定高；满档 wrap 拉弹性（JsonArea fill
 吃满 wrap，42vh 视口档与 SearchTemplatesView st-h-full 同款），下间距随 wrap 承担 */
.pf-body-wrap { display: flex; flex-direction: column; margin-bottom: var(--sp-2); }
/* .ja 编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——分界由 .pf-inputs 承接线承接（补齐）；组件本体零触，高度链零变动 */
.pf-body-wrap :deep(.ja) { border: none; border-radius: 0; }
.pf-body-wrap .pf-body-ja { margin-bottom: 0; }
.pf-body-wrap.pf-h-full { min-height: max(168px, 42vh); }
.pf-body-wrap.pf-h-full .pf-body-ja { flex: 1 1 auto; }

.pf-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-2); }
.pf-sum-cell { padding: var(--sp-2); background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-xs); text-align: center; }
/* 汇总数字 700→650（大数字降档） */
.pf-sum-cell b { display: block; font-size: var(--fs-xl); font-weight: 650; }
.pf-sum-cell span { font-size: var(--fs-xs); color: var(--muted); }
.pf-sum-cell.warn b { color: var(--warn); }

/* .pf-section 外框退役（v 刀④）——border+radius 壳退役内容直贴，
 容器与 margin 分节间距保留（分节堆叠语义不变） */
.pf-section { margin-bottom: var(--sp-3); }
/* panel-2 底头条退役→行首横排档（v 约定「分界归 fs-head border-bottom」
 ——分界线保留，退的是底色块；字号升 sec-t 档 fs-sm/600/tx1）。
 字排三件（fs-sm/600/tx1）挂全局 .sec-t 单源，锚只留分界线与行内排布 */
.pf-section-tt { padding: var(--sp-1h) 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: var(--sp-1h); }

.pf-heat { padding: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1); max-height: 240px; overflow-y: auto; }
.pf-heat-row { display: flex; align-items: center; gap: var(--sp-2); cursor: pointer; }
.pf-heat-row:hover .pf-heat-label { color: var(--accent); }
.pf-heat-label { width: 140px; font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); }
.pf-heat-bar { height: 20px; color: var(--tx-on-strong); font-size: var(--fs-xs); padding: 3px var(--sp-1h); border-radius: 2px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 500px 定高改 42vh 弹性档（ScoreExplain se-card 42vh 同款）——矮窗口不再局促、高窗口多看几层。
 评估：火焰图 panel-2 底保留（内容面非容器壳，.br-err-pre 保底色同先例）；
 外框已随 .pf-section 退役——本规则只退框不退底，布局职责（max-height/overflow/flex/gap）零变动 */
.pf-flame { padding: var(--sp-2); max-height: 42vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-0); background: var(--panel-2); }
.pf-flame-row { display: flex; }
.pf-flame-bar { height: 22px; color: var(--tx-on-strong); font-size: var(--fs-xs); padding: 3px var(--sp-2); border-radius: 2px; font-weight: 600; white-space: nowrap; overflow: hidden; display: flex; gap: var(--sp-1h); min-width: 60px; }
.pf-flame-type { font-family: var(--mono); }
.pf-flame-ms { margin-left: auto; }

/* 手写 .pf-tbl 表（th/td/op-tag/op-desc/tfoot Σ）随换 QRT 退役删除，
 Σ 挪标题行弱化展示 */
.pf-sum { margin-left: var(--sp-2h); color: var(--muted); font-weight: 400; }

/* 1100 档四列降两列（全站 1100 断点语言对齐，宿主 iframe 中宽不再挤压；
 900 档既有两列不冲突） */
@media (max-width: 1100px) {
  .pf-summary { grid-template-columns: repeat(2, 1fr); }
}

/* 宿主 iframe 最窄 ~866px：摘要卡四列挤压，降两列 */
@media (max-width: 900px) {
  .pf-summary { grid-template-columns: repeat(2, 1fr); }
}
</style>
