<template>
  <div class="mm-page">
    <div class="mm-hd">
      <PageHeader :icon="Grid3x3" title="子句命中矩阵" subtitle="named queries（_name）· 每个文档到底命中了哪些子句 · 没起作用的子句当场现形">
      <template #actions>
<CurrentIdxChip />
<button class="btn ghost sm" @click="autoName" title="给没有 _name 的叶子子句自动补名字">
  <Wand2 :size="12" /> 自动命名
</button>
<button class="btn ghost sm" @click="gotoBoost" title="带关键词去「Boost 调参沙盒」拖权重调排名">
  <SlidersHorizontal :size="12" /> 去调参
</button>
<button class="btn primary sm" @click="run" :disabled="!index || busy">
  <Loader2 v-if="busy" :size="12" class="spinning" /><Play v-else :size="12" /> {{ busy ? '查询中…' : '跑矩阵' }}
</button>
      </template>
      </PageHeader>
      <LabNav current="/match-matrix" />
</div>

    <!-- 编辑卡高度 usePref('mm.taH') 持久化（qx.taH 范式）——CSS resize 原生拖拽结束
 （pointerup）把实高落盘，下次进页恢复；默认 200px 对齐原 min-height 固定档 -->
    <div class="mm-card" :style="{ height: taH }" @pointerup="saveTaH">
      <div class="mm-card-hd"><FileJson :size="12" /> Query（bool 组合 + 各子句 "_name"）
        <!-- 原始 IO 快查——本页最近一次矩阵执行（search-raw）请求/响应原文（ioRecorder 记录环；
 QueryXray 卡头钮同位范式；与 548 ScoreExplain 同特征属页域各自取最近一条，跨页互见） -->
        <button class="btn ghost sm" style="margin-left:auto" data-test="raw-io" aria-label="查看原始 IO（矩阵执行）" title="最近一次矩阵执行请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
      </div>
      <!-- P0-1：编辑器划线通道挂点（banner 保留双通道，见 script queueMmLintMarkers） -->
      <JsonArea ref="mmJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="6" fill />
      <!-- lintDsl 静态体检提示条（SearchSandboxView join 串形态同款，随输入实时重估，
 零阻塞不拦执行）——error 红条单列（结构必错 ES 直接拒绝），warning/hint 黄条并列；
 JSON 非法静默（JsonArea 圆点已报） -->
      <!-- lint 条改用 theme.css .lint-bar 单源（纯类名替换，DOM 保形） -->
      <div v-if="mmLintErrors.length" role="alert" class="lint-bar lint-bar-err">
        <span>DSL 检查（错误）：{{ mmLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
      <div v-else-if="mmLintWarns.length" role="status" class="lint-bar lint-bar-warn">
        <span>DSL 检查：{{ mmLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
    </div>

    <!-- 失败内联面板：错误现场留存 + 重试（原仅 toast，一闪而过）。
 私造红壳（border+err-soft+radius，样式 :mm-err 段）退役，合并全局
 err-bar 形态（role=alert 在场，theme.css :554 单源；557 IH ih-qerr 先例）——
 重试钮走既有 run 逻辑原样保留，文案逻辑零触 -->
    <div v-if="runErr" role="alert" class="err-bar mm-err">
      <AlertCircle :size="14" />
      <div class="mm-err-body">
        <!-- 首行走 friendlyEsError 一句人话，pre 保留全文回看（对齐 AnalyzeView 口径） -->
        <div><b>矩阵执行失败</b> · {{ friendlyErr }}</div>
        <!-- 裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文） -->
        <pre class="mm-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
        <div class="mm-err-acts">
          <button class="btn sm" @click="run" :disabled="!index || busy"><Loader2 v-if="busy" :size="12" class="spinning" />{{ busy ? '查询中…' : '重试' }}</button>
        </div>
      </div>
    </div>

    <!-- busy 期间行内 spinner：原空档期统计/表格/空态全不渲染，页面裸白 -->
    <div v-else-if="busy" class="mm-busy"><Loader2 :size="13" class="spinning" /> 查询中…</div>

    <div v-if="clauseNames.length" class="mm-stats" role="group" aria-label="子句命中统计">
      <div v-for="c in clauseStats" :key="c.name" class="mm-stat" :class="{ dead: c.count === 0 }">
        <span class="mm-stat-nm" :title="c.name">{{ c.name }}</span>
        <span class="mm-stat-bar-wrap"><span class="mm-stat-bar" :style="{ width: c.pct + '%' }" /></span>
        <b>{{ c.count }}/{{ hits.length }}</b>
        <!-- mm-dead-tag err 色私造标签改用 StatusPill 统一件（err→r 档；
 告警三角图标随统一件无图标位退役，550 BookText 同判） -->
        <StatusPill v-if="c.count === 0" tone="r" label="没起作用" />
      </div>
    </div>

    <!-- 手写 mm-tbl 命中矩阵换壳 QRT rows 型——useTableSort 表头/sticky 左两列/
 手写 CSV 导出全退役，排序/列筛选/冻结/列管理/导出五格式/复制矩阵归内核
 （storage-key="mm" 记忆启用；「冻结左两列」= 内核冻结能力，首访缺省冻结前 2 列
 对齐旧 sticky #/_id 行为，见 setup 冻结记忆播种；max-height 沿用 --vh-offset 口径迁 prop）。
 子句 ✔/· 走 #cell- 动态槽保色档；_id 列补查询 X 光下钻芯片（useLinkCarry('xray') 现成键）；
 得分列 #cell- 槽保 3 位小数显示（title/复制/导出恒 raw 全精度，内核契约）。 -->
    <QueryResultTable v-if="hits.length" :cols="mmCols" :rows="mmRows" sortable
      :row-action-group="mmRowAction"
      storage-key="mm" :field-types="{ 得分: 'double' }"
      max-height="calc(100vh - var(--vh-offset) - 210px)"
      export-name="match-matrix" empty-text="无命中文档">
      <template #cell-_id="{ value }">
        <span class="mono ell" :title="value">{{ value }}</span>
        <button class="mm-id-go" :aria-label="'去查询 X 光分析：' + value" title="去查询 X 光分析该文档" @click.stop="gotoXray(value)"><ExternalLink :size="11" /></button>
      </template>
      <template #cell-得分="{ value }">{{ Number(value).toFixed(3) }}</template>
      <template v-for="c in clauseNames" :key="c" #[`cell-`+c]="{ value }">
        <span class="mm-cl" :class="value === '✔' ? 'hit' : 'miss'">{{ value }}</span>
      </template>
    </QueryResultTable>
    <EmptyState v-else-if="!busy && !runErr" :icon="Grid3x3"
      text="写一个 bool 查询，给 should/must/filter 各子句加 &quot;_name&quot;"
      hint="也可直接点「自动命名」帮你补，然后「跑矩阵」——立刻看清每条结果是哪些子句送进来的" />

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 /cluster/search-raw 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Grid3x3, Wand2, Play, FileJson, SlidersHorizontal, AlertCircle, ExternalLink, Loader2, Terminal, Copy, Braces } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useIdxState, usePref } from '../composables/urlState';
import { friendlyEsError } from '../utils/esError'; /* ：runErr 人话化 */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；534 收口波：双参改用（errMeta 旁路） */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useLinkCarry } from '../composables/useLinkCarry'; /* ：跨页一次性值携带统一件 */
import type { CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import JsonArea from '../components/JsonArea.vue';
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-1：划线防抖统一件 */
import QueryResultTable from '../components/QueryResultTable.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：死子句警示徽标统一件 */ /* ：矩阵表换壳 */
import EmptyState from '../components/EmptyState.vue';
import { writeStoredRaw } from '../utils/safeJson';

const router = useRouter();
const store = useAppStore();
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
/* 编辑卡高度记忆（usePref('mm.taH')，qx.taH 同款）——卡片 resize:vertical 原生拖拽
 结束时读实高落盘（内容变化不改容器高，Monaco 内滚，故只需 pointerup 一个时机） */
const taH = usePref<string>('mm.taH', '200px');
function saveTaH(e: PointerEvent) {
  const h = Math.round((e.currentTarget as HTMLElement).getBoundingClientRect().height);
  if (h > 0) taH.value = h + 'px';
}
/* Query 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
 fields() 侧惰性 ensure：补全触发才拉 mapping（挂载零请求），cache 命中后直读；
 不 await 零降级，失败仅无候选 */
const { fields: assistFields, ensure: mmEnsureRaw } = useIndexFields(() => index.value);
/* 1125：挂载即拉 mapping 属当前目标的数据——身份未落地先拉会带上一账号的 target。
   门放行才发，未放行则记挂起，身份落地后补跑（useGatedBootRead 负责补跑时机）。 */
const mmAssistBoot = useGatedBootRead('match-matrix', () => { void mmEnsureRaw(); });
function ensureAssistFields() { mmAssistBoot.run(); }
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包，索引源与 fields 同源现调现读 */
const mmTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => { if (!assistFields.value.length) ensureAssistFields(); return assistFields.value; }, terms: (f: string, p: string) => mmTerms.suggestAsync(f, p) };
/* lint ctx 字段表与 dsl-assist 同源——挂载即 ensure（UpdateByQueryView immediate
 范式，只读 mapping 请求、失败零降级），fields 空=类型系规则自动跳过，零 ctx 规则始终生效 */
/* 1125：挂载即拉 mapping 属当前目标的数据——身份未落地先拉会带旧 target；
   未放行则挂起，身份/索引变化后补跑。 */
watch(index, () => { void ensureAssistFields(); }, { immediate: true });
/* lintDsl 静态体检（UpdateByQueryView 最简接线同款）——JSON 解析失败静默不阻塞 */
const mmLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: assistFields.value }); }
  catch { return []; }
});
const mmLintErrors = computed(() => mmLint.value.filter(f => f.severity === 'error'));
const mmLintWarns = computed(() => mmLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
const busy = ref(false);
const hits = ref<any[]>([]);
const runErr = ref(''); // 执行失败全文，供内联面板回看
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const runErrRaw = ref<unknown>(null);
/* 错误面板首行人话；runErr 全文保留进 pre 回看 */
const friendlyErr = computed(() => (runErr.value ? friendlyEsError(runErr.value) : ''));

const DEFAULT_DSL = JSON.stringify({
  size: 20,
  query: {
    bool: {
      should: [
        { match: { title: { query: '关键词', _name: 'title-match' } } },
        { match: { content: { query: '关键词', _name: 'content-match' } } },
      ],
      filter: [
        { range: { publish_date: { gte: 'now-1y', _name: 'recent-1y' } } },
      ],
    },
  },
}, null, 2);
/* →草稿：DSL 草稿迁 useScopedDraft（按 集群/索引 隔离），行为不变 */
const dsl = useScopedDraft('dsl', {
  route: 'match-matrix',

  index: () => index.value,
}, DEFAULT_DSL).text;

/* P0-1：banner→划线双通道（既有 banner 提示条保留）——SearchSandboxView 
 范式逐字：useDebounceFn 250ms + info 降级 hint；mmLint 非法 JSON 静默返 []，setMarkers([])
 即清旧划线。（置于 dsl 声明之后：watch 源同体，TDZ 顺序与 SearchSandboxView 一致） */
const mmJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueMmLintMarkers = useDebounceFn(() => {
  mmJaRef.value?.setMarkers?.(mmLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queueMmLintMarkers(); }, { immediate: true });

/** 叶子查询类型：支持注入 _name 的常见子句 */
const LEAF_TYPES = ['match', 'match_phrase', 'match_phrase_prefix', 'term', 'terms', 'range',
  'wildcard', 'prefix', 'fuzzy', 'exists', 'regexp', 'query_string', 'simple_query_string', 'match_bool_prefix'];

/** 递归给没有 _name 的叶子子句补名：q1-match-title 这种 */
function autoName() {
  let body: any;
  try { body = JSON.parse(dsl.value); }
  catch (e: any) { store.notify('error', 'JSON 解析失败：' + e.message); return; }
  let seq = 0;
  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const k of Object.keys(node)) {
      if (LEAF_TYPES.includes(k) && node[k] && typeof node[k] === 'object') {
        const inner = node[k];
        if (k === 'exists') {
          if (!inner._name) inner._name = `q${++seq}-exists-${inner.field || ''}`;
          continue;
        }
        const fieldKeys = Object.keys(inner).filter(x => x !== '_name');
        const field = fieldKeys[0];
        if (field && inner[field] !== null) {
          if (typeof inner[field] !== 'object') {
            // 简写形式 {match:{title:"x"}} → 展开成对象好塞 _name
            inner[field] = { query: inner[field] };
          }
          if (!inner[field]._name) inner[field]._name = `q${++seq}-${k}-${field}`;
        }
      } else {
        walk(node[k]);
      }
    }
  };
  walk(body.query || body);
  dsl.value = JSON.stringify(body, null, 2);
  store.notify('success', seq ? `已自动补 ${seq} 个 _name` : '所有叶子子句都已有 _name');
}

const clauseNames = computed(() => {
  const s = new Set<string>();
  for (const h of hits.value) for (const m of h.matched_queries || []) s.add(m);
  return Array.from(s).sort();
});

/* ═══ ：矩阵表换壳 QRT rows 型 ═══
 列=序号（内核内建）+_id+得分+子句名（与旧表头同源）；rows 携原始值：
 _id 字符串、得分全精度 number（显示 3 位小数走 #cell- 槽，title/复制/导出恒 raw）、
 子列 ✔/· 字符串（#cell- 动态槽只管色档显示，导出/复制值与旧表格字符一致）。 */
const mmCols = computed(() => ['_id', '得分', ...clauseNames.value]);
const mmRows = computed<(string | number)[][]>(() =>
  hits.value.map(h => {
    const mq: string[] = h.matched_queries || [];
    return [
      String(h._id),
      Number(h._score ?? 0),
      ...clauseNames.value.map(c => (mq.includes(c) ? '✔' : '·')),
    ];
  }));

/* 「冻结左两列」对齐旧 sticky #/_id 行为：内核冻结走 es_tbl_freeze_n:mm 记忆（prefsOn 门控，
 列头菜单「冻结到此列/取消冻结」读写），首访无记忆时播种 2 列；用户显式取消（写入 '0'）
 后不再代劳。setup 先于子组件 QRT 的 useTablePrefs 读档执行，首挂即生效。 */
if (localStorage.getItem('es_tbl_freeze_n:mm') == null) {
  writeStoredRaw(localStorage, 'es_tbl_freeze_n:mm', '2');
}

/* _id 列下钻接「查询 X 光」（useLinkCarry('xray') 现成键——{index,id} 与
 DslQueryView/ScoreExplain 发送侧同键同构；QueryXrayView 接收后自动切词频取证并开查，
 不造新页） */
const xrayCarry = useLinkCarry<{ index: string; id: string }>('xray');
function gotoXray(id?: string) {
  if (!id) return;
  xrayCarry.send({ index: index.value, id });
  router.push('/query-xray');
}
/* 矩阵行宿主组：行是 [ _id, 得分, ...子句✔/· ] 数组——复制 _id/整行或带去 X 光，
   与单元格菜单共用内核；键盘聚焦行后菜单键同源可达。 */
function mmCopy(text: string, okMsg: string) {
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败'));
}
function mmRowAction(row: any[]): CcmItem | null {
  const id = String(row?.[0] ?? '');
  if (!id) return null;
  return {
    key: 'mm-doc',
    label: '文档…',
    icon: FileJson,
    children: [
      { key: 'mm-copy-id', label: '复制 _id', icon: Copy, run: () => mmCopy(id, '已复制 _id') },
      { key: 'mm-copy-row', label: '复制整行（含子句命中）', icon: Braces, run: () => mmCopy(JSON.stringify(row), '已复制整行') },
      { key: 'mm-xray', label: '在查询 X 光中分析', icon: ExternalLink, sep: true, run: () => gotoXray(id) },
    ],
  };
}

const clauseStats = computed(() => clauseNames.value.map(name => {
  const count = hits.value.filter(h => (h.matched_queries || []).includes(name)).length;
  return { name, count, pct: hits.value.length ? (count / hits.value.length) * 100 : 0 };
}));

async function run() {
  let body: any;
  try { body = JSON.parse(dsl.value); }
  catch (e: any) { store.notify('error', 'JSON 解析失败：' + e.message); return; }
  if (!body.size) body.size = 20;
  body._source = false;
  busy.value = true;
  runErr.value = '';
  runErrRaw.value = null;
  try {
    const r: any = await api.searchRaw(index.value, JSON.stringify(body));
    if (r?.error) throw new Error(r.message);
    hits.value = r.hits?.hits || [];
    if (!hits.value.length) store.notify('warning', '无命中');
    else if (!clauseNames.value.length) store.notify('warning', '命中了但没有 matched_queries —— 子句缺 _name，点「自动命名」');
  } catch (e: any) {
    hits.value = [];
    runErr.value = String(e?.message || e);
    runErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    store.notify('error', '矩阵执行失败：' + (e?.message || e));
  } finally { busy.value = false; }
}

/* ==================== ：实验室联动 —— 子句没起作用？去沙盒拖权重 ==================== */
/** 从当前 DSL 里掏第一个字符串型 query 值当关键词 */
function firstKeyword(): string {
  try {
    let kw = '';
    const walk = (n: any) => {
      if (kw || !n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      for (const k of Object.keys(n)) {
        if (k === 'query' && typeof n[k] === 'string') { kw = n[k]; return; }
        walk(n[k]);
      }
    };
    walk(JSON.parse(dsl.value));
    return kw;
  } catch { return ''; }
}
/* 手写 sessionStorage.setItem 换 useLinkCarry 统一件——键名与 payload 结构逐字保持
 （esquerystudio.link.boost={index,keyword}），消费端零感 */
const boostCarry = useLinkCarry<{ index: string; keyword: string }>('boost');
function gotoBoost() {
  boostCarry.send({ index: index.value, keyword: firstKeyword() });
  router.push('/boost-tuner');
}

/* 原始 IO 快查（546/548 同款三件套）——特征 /cluster/search-raw（本页唯一出口
 searchRaw，run 请求+matrix 响应同条记录）；判空 rec=null（本页还没跑过矩阵）时 notify 引导，
 不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/search-raw');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
/* min-height:100% 让页面吃满 .page 可滚区（默认只有内容高，实测下方空出 540px 纯死白） */
.mm-page { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
/* 页头私有标题/操作类随 PageHeader 合并分批退役（-tt/-sub ；残余三伴
 G232 补删——模板 0 引用纯删零连锁；史志不复述死类全名防源码锁自伤 ） */
.mm-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* G232：IndexPicker 退役伴漏删的选择器规则补删（换 CurrentIdxChip 只读件） */
/* 编辑器卡片高度：原 flex:1 吃满剩余 + min-height:200px 固定 → 改可调档
 （height 由 :style mm.taH 承接，resize:vertical 原生拖拽 + pointerup 落盘记忆）；
 min-height 保留作拖拽下限。flex:none 后卡片不再吃满剩余高，结果表格随内容上移。 */
.mm-card { overflow: hidden; display: flex; flex-direction: column; flex: none; min-height: 200px; resize: vertical; } /* ：编辑器外框退役（约定③）——border+radius 壳退掉，分界归 mm-card-hd border-bottom；布局/拖拽语义（flex:none/resize/min-height）与脚本段零触 */
/* JsonArea 自身已是 flex 纵向容器；只在本视图内接线让它随卡片长高，不改共享组件 */
.mm-card :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.mm-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
/* lint 体检提示条私有形态（display/gap/padding/radius/字号/行高 + warn/err 底色）
 退役 → theme.css .lint-bar 单源（模板纯类名改用，DOM 保形） */
/* 删 .mm-ta 死定高规则（模板已用 JsonArea，0 引用） */
/* .mm-err 私造红壳（border+err-soft+radius+err 色）退役 → 全局 .err-bar 形态
 （role=alert，theme.css :554 单源；557 IH .ih-qerr 先例）。本组只留多行面板顶对齐
 （icon+body 富内容不随 err-bar 居中）与落位节奏（mm-page gap 已担间距，抵掉 err-bar 自带
 margin-bottom）；/544/545/551 字面锁行随合并退役，其 spec 同步更新 */
.mm-err { align-items: flex-start; margin-bottom: 0; }
.mm-err-body { flex: 1; min-width: 0; }
.mm-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow: auto; } /* ：删死 fallback */
.mm-err-acts { margin-top: var(--sp-2); }
.mm-busy { display: flex; align-items: center; justify-content: center; gap: var(--sp-1h); padding: 14px var(--sp-4); font-size: var(--fs-xs); color: var(--muted); } /* ：6px→--sp-1h、16px→--sp-4 合并（14px 无档位刻值保字面；/544/551 锚同步更新） */
.mm-stats { display: flex; flex-direction: column; gap: var(--sp-1); }
.mm-stat { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); }
.mm-stat.dead { opacity: .85; }
.mm-stat-nm { flex: none; width: 200px; font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } /* ：删死 fallback */
.mm-stat-bar-wrap { flex: 1; max-width: 300px; height: 7px; border-radius: var(--r-xs); background: var(--bg2); overflow: hidden; }
.mm-stat-bar { display: block; height: 100%; background: var(--ok); border-radius: var(--r-xs); }
/* .mm-dead-tag 私造样式随 StatusPill r 改用退役（色档归 .pill 单源）；⚠/544/545 字面锁行（.mm-err/.mm-busy）原样未触 */
/* mm-tbl 全家随换壳退役（排序/sticky/导出归内核）；max-height 口径迁
 QRT max-height prop（仍 calc(100vh - var(--vh-offset,210px) - 210px)，裸 420px 不回潮） */
.ell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 子句命中格色档（#cell- 槽承接）：✔ 实色 600 / · 弱化，格内居中对齐旧 .c */
.mm-cl { display: block; text-align: center; }
.hit { color: var(--ok); font-weight: 600; } /* ：控件强调 600 */
.miss { opacity: .25; }
/* _id 列下钻芯片（XmigrateView .xm-idx-go 同语言） */
.mm-id-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.mm-id-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* 900 紧凑微调档（iframe 宿主 ~866px 口径）——单列纵 flex 页 + .mm-hd 本就
 flex-wrap，只需把页头 gap 收一档（PageHeader actions 自行换行，无需结构动）。
 .mm-stat-nm 裸 200px 在 900 档降档 140px（ellipsis 基线兜底不动，
 485/375 极窄档不再挤掉统计条/进度列）；宽度降档不属 height 链，与换壳锁无涉 */
@media (max-width: 900px) {
  .mm-hd { gap: var(--sp-2); }
  .mm-stat-nm { width: 140px; }
}
</style>
