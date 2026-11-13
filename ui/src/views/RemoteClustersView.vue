<template>
  <div class="rc-page">
    <div class="rc-hd">
      <PageHeader :icon="Network" title="远程集群（CCS/CCR）" subtitle="跨集群搜索/复制 · 连接状态 · 一键跳查询">
      <template #actions>
<button class="btn ghost sm" @click="load" :disabled="loading">
  <RefreshCcw :size="12" :class="{ spinning: loading }" /> 刷新
</button>
<!-- 原始 IO 快查——本页最近一次 remote-clusters 连通性拉取请求/响应原文
 （ioRecorder 记录环；连接状态列表即该接口响应的快查姊妹入口） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（远程集群）" title="最近一次远程集群状态拉取请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
      </template>
      </PageHeader>
</div>

    <div class="rc-self">
      <Server :size="14" />
      <div>
        <div>本集群 <b>{{ raw?.localClusterName || '—' }}</b></div>
        <div class="rc-self-sub">版本 {{ raw?.localVersion?.number || '—' }} · 远程 <b>{{ raw?.count || 0 }}</b> 个</div>
      </div>
    </div>

    <!-- G1-B3：拉取期间（raw 未回）骨架先行——加载中不得闪「未配置」空态；手动刷新（raw 已有）保留旧数据不闪骨架 -->
    <div v-if="loading && !raw" class="rc-loading">
      <SkeletonBox v-for="i in 3" :key="i" height="88px" round />
    </div>
    <template v-else>
    <div v-if="reason" class="rc-alert">
      <AlertTriangle :size="14" />
      <div>
        <div class="rc-alert-tt">远程集群 API 异常</div>
        <div class="rc-alert-sub">{{ reason }}</div>
      </div>
      <!-- -A2：失败态就地重试 -->
      <button class="btn sm" style="margin-left:auto" @click="load" :disabled="loading">重试</button>
    </div>

    <!-- -A2：API 异常时不再叠显「未配置」空态，失败≠空（ 同款教训） -->
    <EmptyState v-if="rows.length === 0 && !reason" :icon="Network"
      text="未配置任何远程集群"
      hint="使用 PUT /_cluster/settings 添加：">
      <!-- 可复制的多行 JSON 样例：换行 / 等宽 / 左对齐塞不进单行 hint，故走插槽。
 容器留白仍由 EmptyState 决定，本 pre 只管自己的代码块样式 -->
      <!-- W-C 批：空态样例走 highlightJson（转义安全 v-html；&lt;name&gt; 由转义通道还原为字面 <name>） -->
      <pre class="rc-empty-pre json-view" v-html="remoteSampleHtml"></pre>
    </EmptyState>

    <div v-else class="rc-list">
      <div v-for="r in rows" :key="r.name" class="rc-card" :class="{ off: !r.connected }" tabindex="0"
        @contextmenu.prevent="openRcMenu($event, r)" @keydown="onRcMenuKey($event, r)" data-row-nav @keydown.self="rowArrowNav">
        <div class="rc-card-l">
          <div class="rc-card-tt">
            <Network :size="12" /> {{ r.name }}
            <span class="rc-mode">{{ r.mode || 'sniff' }}</span>
          </div>
          <div class="rc-card-sub">
            <!-- 连接状态纯文本+rc-dot 色点合并 StatusPill 统一件（530 W-D 范式）——
 tone g/r 直挂全局 .pill 语义档，en 档带英文小字，色点冗余色标随 pill 底色退役 -->
            <StatusPill :tone="r.connected ? 'g' : 'r'" :label="r.connected ? '已连接' : '未连接'"
              :en="r.connected ? 'connected' : 'disconnected'" />
            <template v-if="r.connected"> · 连接 {{ r.num_nodes_connected || r.connected_nodes || 0 }} 节点</template>
            <template v-if="r.max_connections_per_cluster"> / 最大 {{ r.max_connections_per_cluster }}</template>
          </div>
          <!-- 手写四段 kv（seeds/proxy/skip_unavailable/initial_timeout）合并
 MetaStrip 统一件（值亮+标签暗+·分隔）；skip_unavailable=true 段 tone warn +
 既有降级解释文案随 tip，四段 v-if 条件逐段保留（metaOf） -->
          <MetaStrip class="rc-card-meta" :items="metaOf(r)" />
        </div>
        <div class="rc-card-r">
          <button class="btn pri sm" @click="ccsQuery(r.name)">
            <ArrowRightLeft :size="12" /> 跨集群查询
          </button>
          <button class="btn ghost sm" @click="copyBody(r)"><Copy :size="12" /> 复制</button>
        </div>
      </div>
    </div>
    </template>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 remote-clusters 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
    <!-- 远程集群卡右键（1145）：卡右只留「跨集群查询/复制」，其余动作（复制名/种子、
    到 Dev Tools 看 cluster.settings、只看本卡配置）收进右键——与索引/收藏/策略卡同一件。 -->
    <CellContextMenu v-if="rcMenu" :x="rcMenu.x" :y="rcMenu.y" :title="'远程集群 · ' + rcMenu.r.name"
      :items="rcMenuItems" @close="rcMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Network, Server, RefreshCcw, AlertTriangle, ArrowRightLeft, Copy, Terminal, ExternalLink } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
/* 状态徽标/元信息串统一件合并（StatusPill tone g/r；MetaStrip items 见 metaOf） */
import StatusPill from '../components/StatusPill.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import { friendlyEsError } from '../utils/esError';
import { highlightJson } from '../utils/jsonc';
import { copyText } from '../utils/format';
import { writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useAuthStore } from '../stores/auth'; /* DevTools 入口能力门（1124） */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1145：远程集群卡右键 */

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();
/* DevTools 入口能力：与 Snapshots/Ilm/Watcher 同源（admin 档 = DevTools/REST 页写键或 ADMIN）。
   本页无写路径，但这格右键会带 run:true 跳到 DevTools，只读身份进去只会「填入不执行」。 */
const canDevtools = computed(() => auth.canEndpoint('admin', 'POST',
  '/internal/es/index/cluster/devtools/execute', store.target));
/* review minor：初值 true——首帧即 loading（对齐 ClusterSettingsView 范式），
 不依赖 onMounted 同步置位才不闪空态；load() 入口恒置 true，无其他读取路径依赖初值 false */
const loading = ref(true);
const raw = ref<any>(null);
const reason = ref('');

/* W-C 批：空态样例常量（highlightJson 输出已转义，静态串只需算一次） */
const remoteSampleHtml = highlightJson('{ "persistent": { "cluster": { "remote": { "<name>": { "seeds": ["host:9300"] } } } } }');

const rows = computed(() => {
  const remotes = raw.value?.remotes || {};
  const arr: any[] = [];
  Object.keys(remotes).forEach(k => {
    arr.push({ name: k, ...(remotes[k] || {}) });
  });
  return arr;
});

/* rc-card-meta 四段 kv → MetaStrip items（原手写 v-if 条件逐段同步更新）。
 （ 铁律 F）：四段英文 label 全部补中文 tip（seeds=种子节点地址/proxy=
 代理地址/skip_unavailable=远端不可达时是否跳过/initial_timeout=初始连接超时）；
 skip_unavailable=true 段 tone warn+容忍断连既有文案保持，false 段无 warn 色
 （与 true 段色差即语义差） */
function metaOf(r: any): MetaStripItem[] {
  return [
    ...(r.seeds ? [{ value: (r.seeds || []).join(', '), label: 'seeds', tip: '种子节点地址' }] : []),
    ...(r.proxy_address ? [{ value: r.proxy_address, label: 'proxy', tip: '代理地址' }] : []),
    ...(typeof r.skip_unavailable !== 'undefined' ? [{
      value: String(r.skip_unavailable),
      label: 'skip_unavailable',
      ...(r.skip_unavailable === true
        ? { tone: 'warn' as const, tip: '容忍断连：远端集群不可达时查询可降级继续' }
        : { tip: '远端不可达时是否跳过（当前 false：不可达即报错）' }),
    }] : []),
    ...(r.initial_connect_timeout ? [{ value: String(r.initial_connect_timeout), label: 'initial_timeout', tip: '初始连接超时' }] : []),
  ];
}

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const r = await api.remoteClusters();
    if (seq !== loadSeq) return;
    raw.value = r || {};
    reason.value = r?.reason || '';
  } catch (e: any) {
    if (seq !== loadSeq) return;
    reason.value = friendlyEsError(String(e?.message ?? e));
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function ccsQuery(name: string) {
  const body = {
    query: { match_all: {} },
    size: 10,
  };
  const payload = {
    index: `${name}:*`,
    body: JSON.stringify(body, null, 2),
  };
  writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.body', payload.body);
  writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.index', payload.index);
  store.notify('info', `已生成 CCS 跨集群查询：index=${name}:*`);
  router.push({ path: '/search', query: { mode: 'sandbox' } });
}

function copyBody(r: any) {
  copyText(JSON.stringify(r, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '远程集群配置已复制' : '复制失败')); /* */
}

/* ═══ 1145：远程集群卡右键 ═══
 卡片右簇保留「跨集群查询/复制」两高频动作；右键补「只拿这个名字/种子地址」
 「去 Dev Tools 看活配置」这类跳出去找的动作。本页无写路径（PUT cluster.settings
 仍是唯一写入口，在 Dev Tools），右键只做读取与跳转。 */
const rcMenu = ref<{ x: number; y: number; r: any } | null>(null);
function openRcMenu(e: MouseEvent, r: any) {
  rcMenu.value = { x: e.clientX, y: e.clientY, r };
}
function onRcMenuKey(e: KeyboardEvent, r: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rcMenu.value = { ...menuKeyAnchor(e), r };
}
const rcMenuItems = computed<CcmItem[]>(() => {
  const m = rcMenu.value; if (!m) return [];
  const r = m.r;
  const seeds = (r.seeds || []).join(', ');
  const goDevtools = () => {
    /* 入口前置判定（1124）：只读身份跳过去只会看到「已填入未执行」，在来源页说清楚 */
    if (!canDevtools.value) {
      store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN');
      return;
    }
    writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
      title: 'cluster.settings（remote）', method: 'GET',
      path: '/_cluster/settings?include_defaults=true&flat_settings=true', run: true,
    }));
    router.push('/devtools');
  };
  return [
    { key: 'ccs', label: `跨集群查询（${r.name}:*）`, icon: ArrowRightLeft, run: () => ccsQuery(r.name) },
    {
      key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'copy-name', label: '复制集群别名', icon: Copy, run: async () => {
          const ok = await copyText(r.name);
          store.notify(ok ? 'success' : 'error', ok ? '已复制集群别名：' + r.name : '复制失败');
        } },
        ...(seeds ? [{ key: 'copy-seeds', label: '复制种子地址', icon: Copy, run: async () => {
          const ok = await copyText(seeds);
          store.notify(ok ? 'success' : 'error', ok ? '已复制种子地址' : '复制失败');
        } }] : []),
        { key: 'copy-body', label: '复制整卡配置 JSON', icon: Copy, run: () => copyBody(r) },
      ],
    },
    {
      key: 'goto-group', label: '去查看…', icon: ExternalLink, sep: true, children: [
        { key: 'dev-settings', label: '在 Dev Tools 看 cluster.settings', icon: ExternalLink, run: goDevtools },
        { key: 'go-ccs', label: '查询工作台 · 沙盒', icon: ArrowRightLeft, run: () => router.push({ path: '/search', query: { mode: 'sandbox' } }) },
      ],
    },
  ];
});

/* 原始 IO 快查（546/548 同款三件套）——特征 /cluster/remote-clusters（连通性拉取
 响应=本页唯一 IO）；判空 rec=null（还没拉取过/页未回）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/remote-clusters');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

onMounted(load);
</script>

<style scoped>
/* G1-C12：区块级间距落梯 --sp token（亚阶梯微调不动；双轨变量收口属独立批次，不动） */
.rc-page { padding: var(--sp-4) var(--sp-4) var(--sp-5); }
.rc-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
/* （G56）：页头子元素四类死样式删（-l/-ic/-tt/-sub 后缀族）——页头已
 合并 PageHeader 无对应元素（ .pl-hd 同族先例）；.rc-hd 本体是 PageHeader
 外距/分隔锚保留 */
/* rc-self 本集群信息条壳退役（约定④）——同页 rc-card 列表项 551 已 border-top 行，
 全框信息条构成同页双标（MappingView 554「同页双标根治」先例）；border-subtle 对齐 rc-card 语言 */
.rc-self { display: flex; gap: var(--sp-3); align-items: center; padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border-subtle); margin-bottom: var(--sp-3); font-size: var(--fs-sm); }
.rc-self-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
.rc-alert { display: flex; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m); margin-bottom: var(--sp-3); color: var(--warn); }
.rc-alert-tt { font-weight: 600; font-size: var(--fs-md); }
.rc-alert-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: var(--sp-0); }
/* 插槽里的 JSON 样例：只保留代码块自身观感（等宽/左对齐/可复制），
 外层留白已归 EmptyState 的 34px 16px，故不再有 .rc-empty 的 40px 容器 */
/* ：rc-empty-pre 的 code-bg 底是代码内容面（EmptyState 插槽内的 JSON 样例块），
 约定④「语义内容面保留」豁免（540 df-ta / 546 al-card 同判），只不退役 */
.rc-empty-pre { background: var(--code-bg); padding: var(--sp-2) var(--sp-3); border-radius: 5px; text-align: left; display: inline-block; margin: 0; font-size: var(--fs-xs); white-space: pre-wrap; overflow-wrap: anywhere; }
/* G1-B3：首载骨架与列表同节奏（纵向堆叠） */
.rc-loading { display: flex; flex-direction: column; gap: var(--sp-3); }
.rc-list { display: flex; flex-direction: column; gap: var(--sp-3); }
/* rc-card 行卡壳退役（约定④：panel 底+border-subtle 全框+radius:10px 整块消除
 → border-top 分节流，xm-res 语言）；悬停反馈由顶部 hairline 变色承接；
 rc-card-sub/rc-card-meta 布局锚保留（/ 锚随行） */
.rc-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }
.rc-card.off { opacity: 0.75; }
.rc-card:hover { border-color: var(--brand); }
.rc-card-l { flex: 1; min-width: 0; }
.rc-card-tt { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-md); font-weight: 600; }
.rc-mode { margin-left: auto; padding: 1px var(--sp-1h); background: var(--ac-soft); color: var(--ac-hi); border-radius: 3px; font-size: var(--fs-xs); font-weight: 400; }
.rc-card-sub { display: flex; align-items: center; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--text-muted); margin-top: 3px; }
/* MetaStrip 合并后本类只留布局锚外距（flex/wrap/mono/字号归 .ms 单一出处，
 AnalysisSettingsView .meta-strip 同款只留外距范式）；rc-dot/rc-warn-t/code 底色随合并退役 */
.rc-card-meta { margin-top: var(--sp-2); }
.rc-card-r { display: flex; gap: var(--sp-2); }

/* 1100 堆叠档（零结构动）——卡行左信息/右操作双栏在中窄视口互相挤压，
 塌纵向堆叠（信息在上、按钮换行到下），与 TasksView 1100 档同口径 */
@media (max-width: 1100px) {
  .rc-self { flex-wrap: wrap; }
  .rc-card { flex-direction: column; }
  .rc-card-r { justify-content: flex-end; }
}

/* 900 紧凑微调档——卡列表本就纵向单列（rc-list flex column，无网格可塌，
 1100 堆叠档已收卡内双栏），此处只收页侧距与卡内 padding（AnalysisSettings 同款节奏；
 卡壳随分节流退役后纵内衬收一档） */
@media (max-width: 900px) {
  .rc-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .rc-card { padding: var(--sp-2) 0; }
}
</style>
