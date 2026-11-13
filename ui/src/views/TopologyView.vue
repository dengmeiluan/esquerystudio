<template>
  <div class="tp">
    <PageHeader :icon="Network" title="分布式拓扑" subtitle="节点 × 索引分片分布" />
    <!-- 顶栏：索引过滤 + 刷新 + 图例。：card 壳退役（约定③）——裸 lr-bar 行
 直贴页面流，border-bottom 分界；tp-canvas/tp-palette 547 豁免不在本次范围 -->
    <div class="tp-bar lr-bar freeze">
      <div class="tp-bar-l lr-bar-l">
        <input
          v-model="indexPattern"
          class="tp-input"
          placeholder="索引通配符（如 order-*，留空全集群）"
          @keydown.enter="load"
        />
        <button class="btn sm" @click="load" :disabled="loading">
          <RefreshCw :size="12" :class="{ spinning: loading }" /> 加载
        </button>
        <!-- 节点清单 Markdown 复制（带出体系——分片分布盘点贴群） -->
        <button class="btn sm" :disabled="loading || !layout.length" @click="copyNodeList" title="复制节点分片分布为 Markdown（群聊/工单直贴）">
          <ClipboardCopy :size="12" /> 节点清单
        </button>
        <label class="tp-chk">
          <input type="checkbox" v-model="autoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 固定 10s 档换 AutoRefreshSelect 统一件（原固定 10s 语义保留为默认档，
 频率 usePref 记忆；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="autoRefresh" v-model:ms="tpIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
      </div>
      <div class="tp-bar-r lr-bar-r">
        <!-- 色样 hsl(210,70%,55%) 硬编码退役：主/副分片实际渲染是「索引哈希块色 + 描边/半透明」，
 蓝色样与图不符属误导，改语义说明文字；未分配/relocating 状态色样保留 -->
        <span class="tp-legend tp-legend-note">色块 = 按索引名哈希取色 · 描边 = 主分片 · 半透明 = 副本</span>
        <span class="tp-legend"><span class="tp-swatch un"></span> 未分配</span>
        <span class="tp-legend"><span class="tp-swatch reloc"></span> relocating</span>
      </div>
    </div>

    <!-- 主区：SVG 拓扑。：画布 .card 壳退役（约定④，552 顶栏同页续刀）——
 border-top 分节 hairline，本类 padding 原样自持 -->
    <!-- （/）：画布鼠标移动空回调死绑定清除——tip 锚定设计
 本就「进入格时定格不跟随」（cellEnter），移除由 @mouseleave 承接 -->
    <div ref="canvasHost" class="tp-canvas" @mouseleave="tip = null">
      <!-- KPI 大卡墙退役后 inline 串改用 MetaStrip 统一件：未分配异常→err、relocating>0→warn
 走组件 tone 档；括号副文案（主/副拆分、常态、当前视图）并入 label 暗色，
 全量语义（承载者说明/异常判别/迁移中）走 :title 兜底不变 -->
      <MetaStrip class="top-meta" :items="tpMeta" :title="'节点 ' + nodeStats.length + '（已分配分片承载者） · 分片总数 ' + filtered.length + '（主 ' + primaryCount + ' · 副 ' + replicaCount + '） · 未分配 ' + unassignedCount + '（' + (unassignedCount && !uaAbnormal ? '单节点副本，常态' : 'state=UNASSIGNED') + (uaAbnormal ? ' · 异常' : '') + '） · relocating ' + relocatingCount + '（正在迁移） · 索引 ' + viewIndexCount + '（当前视图）'" />

      <!-- G2-B4：失败不再仅 toast 后清空回落「暂无分片数据」伪装空态（ 同源）——
 err-bar 全文+重试常驻，与 EmptyState 互斥；刷新失败保留旧图不清空 -->
      <div v-if="loadErr" role="alert" class="err-bar rise-in">
        拓扑数据拉取失败：{{ loadErr }}
        <button class="btn sm" @click="load" :disabled="loading">重试</button>
      </div>
      <div v-if="loading && !shards.length" class="tp-loading">
        <SkeletonBox v-for="i in 4" :key="i" height="120px" round />
      </div>
      <svg v-else-if="shards.length" :viewBox="`0 0 ${W} ${H}`" class="tp-svg" :style="{ minWidth: svgMinW + 'px' }" preserveAspectRatio="xMidYMin meet">
        <!-- 节点组 -->
        <g v-for="(g, gi) in layout" :key="g.node" :transform="`translate(${g.x}, ${g.y})`" @contextmenu.prevent="openNodeMenu($event, g)">
          <!-- 节点框 -->
          <rect class="tp-node" :width="NODE_W" :height="g.h" rx="8" :class="{ 'tp-node-un': g.node === '__UNASSIGNED__' && uaAbnormal }" />
          <!-- 节点名（单节点副本未分配是拓扑常态，分组标签不打 ⚠） -->
          <text :x="12" :y="18" class="tp-node-name" tabindex="0" role="button" :aria-label="'节点 ' + g.node" @keydown="onNodeKey($event, g)">
            <template v-if="g.node === '__UNASSIGNED__'">{{ uaAbnormal ? '⚠ 未分配' : '未分配（常态）' }}</template>
            <template v-else>{{ g.nameFit }}<title>{{ g.node }}</title></template>
          </text>
          <!-- （/ 留存）：角色徽标（名字行右端对齐；master 走品牌青
 高亮档，roles.includes('master')=选主候选口径；ES 角色术语英文保留 口径） -->
          <text v-if="g.isMaster || g.roleTxt" :x="NODE_W - 12" :y="18" text-anchor="end" class="tp-node-role">
            <tspan v-if="g.isMaster" class="tp-role-master">master</tspan><tspan v-if="g.isMaster && g.roleTxt"> · </tspan><tspan v-if="g.roleTxt">{{ g.roleTxt }}</tspan>
            <title>角色（ES 原生术语）：master = 选主候选（单节点集群即当选主节点） · data = 数据节点 · ingest = 写入预处理</title>
          </text>
          <text :x="12" :y="34" class="tp-node-sub">
            <template v-if="g.node !== '__UNASSIGNED__'">{{ g.ip || '' }} · {{ g.shards.length }} 分片 · {{ fmtB(g.storeBytes) }}</template>
            <template v-else>{{ g.shards.length }} {{ uaAbnormal ? '待分配分片' : '副本分片 · 单节点无处放置' }}</template>
          </text>
          <!-- ：磁盘水位行+条——色档走 metricThresholds 单源（disk warn 80 / bad 90，
 禁视图层自造阈值）；百分比口径与 liveMonitor diskUsedPct 同式 (total-free)/total；
 缺数据（端点失败/未匹配）整组不渲染，节点头回落无磁盘形态 -->
          <g v-if="g.diskPct != null" class="tp-disk" role="progressbar"
             :aria-label="'节点 ' + g.node + ' 磁盘使用率'" :aria-valuenow="g.diskPct" aria-valuemin="0" aria-valuemax="100">
            <text :x="12" :y="52" class="tp-node-sub">磁盘 {{ g.diskPct }}% · {{ fmtB(g.diskUsedBytes) }} / {{ fmtB(g.diskTotalBytes) }}<title>磁盘水位 {{ g.diskPct }}%：警示档 ≥80% / 严重档 ≥90%（全站统一阈值单源）；ES watermark 参考 low 85% 停新分片分配 / flood 95% 索引只读</title></text>
            <rect :x="12" :y="56" :width="NODE_W - 24" height="4" rx="2" class="tp-disk-track" />
            <rect :x="12" :y="56" :width="diskBarW(g)" height="4" rx="2" class="tp-disk-bar" :fill="metricColor('disk', g.diskPct)" />
          </g>

          <!-- 分片矩阵（ 后矩阵起点随节点头高度让位：有磁盘行 68 / 无 44） -->
          <g v-for="(s, si) in g.shards" :key="si"
             role="button" tabindex="0" :aria-label="'分片 ' + s.shard + '（点击查看定位）'" :data-shard-idx="si"
             :transform="`translate(${12 + (si % COLS) * (CELL + GAP)}, ${g.headH + Math.floor(si / COLS) * (CELL + GAP)})`"
             @mouseenter="cellEnter($event, s)"
             @focus="cellFocus($event, s)" @blur="cellBlur(s)"
             @contextmenu.prevent.stop="openShardMenu($event, s)" @keydown="onShardKey($event, g, s, si)"
             @click="gotoShard(s)" @keydown.enter.prevent="gotoShard(s)" @keydown.space.prevent="gotoShard(s)">
            <rect
              class="tp-cell"
              :width="CELL" :height="CELL" rx="2"
              :fill="shardFill(s)"
              :stroke="shardStroke(s)"
              :stroke-width="shardStrokeWidth(s)"
              :opacity="shardOpacity(s)"
            />
          </g>
        </g>
      </svg>
      <EmptyState
        v-else-if="!loadErr"
        :icon="Network"
        text="暂无分片数据"
        hint="请调整索引通配符后重新加载"
      />
      <!-- 1381：分片格右键——格子上此前只有「点击跳转定位」。排查分片异常时真正要的
       是「这个分片的索引/分片号/主副/节点」快速带走：贴进 issue、拼进 exclude/_reroute、
       或去问运维。一级两项直达 + 一个分组（其余动作收进去），与表格右键同约定。 -->
      <CellContextMenu v-if="shardMenu" :x="shardMenu.x" :y="shardMenu.y"
        :title="`${shardMenu.s.index} #${shardMenu.s.shard}`"
        :items="shardMenuItems" @close="shardMenu = null" />
      <CellContextMenu v-if="nodeMenu" :x="nodeMenu.x" :y="nodeMenu.y"
        :title="'节点 · ' + (nodeMenu.g.nameFit || nodeMenu.g.node)"
        :items="nodeMenuItems" @close="nodeMenu = null" />

      <!-- Tooltip -->
      <div v-if="tip" class="tp-tip" :style="{ left: (tip.x + 14) + 'px', top: (tip.y - 8) + 'px' }">
        <div><b class="mono">{{ tip.s.index }}</b></div>
        <div class="mono">shard #{{ tip.s.shard }} · <span :style="{ color: tip.s.prirep === 'p' ? 'var(--info)' : 'var(--tx1)' }">{{ tip.s.prirep === 'p' ? '主' : '副本' }}</span></div>
        <!-- shard 状态手滚英文+内联三色硬判退役 → esEnumZh shardStateZh/shardStateTone
 收口（StatusPill en 档：中文主体+弱化英文小字；未知枚举回落原文不丢信息） -->
        <div><StatusPill :tone="shardStateTone(tip.s.state)" :label="shardStateZh(tip.s.state) || tip.s.state" :en="tip.s.state" /></div>
        <div class="mono" style="color:var(--tx2)">docs {{ tip.s.docs ?? '-' }} · {{ fmtB(tip.s.storeBytes) }}</div>
        <div v-if="tip.s.node" class="mono" style="color:var(--tx2)">on {{ tip.s.node }}</div>
      </div>
    </div>

    <!-- 索引调色板（点击过滤）。：同上款 .card 壳退役 → border-top 分节
 （/）：搜索 + 收纳——超 PAL_COLLAPSE_AT 折叠「+N 更多」（展开态
 usePref 记忆），搜索前缀/通配客户端匹配（搜索态不收纳：主动收窄优先）；
 全量计数标题 / 点击过滤 / on·dim 契约零触 -->
    <div v-if="indexPalette.size" class="tp-palette">
      <div class="tp-pal-head">
        <div class="card-t"><Palette :size="12" /> 索引调色板（{{ indexPalette.size }}）· 点击 chip 过滤</div>
        <input
          v-model="palQuery"
          class="tp-pal-search"
          type="text"
          placeholder="搜索索引（前缀 / 通配 *）"
          aria-label="搜索索引调色板"
        />
      </div>
      <div class="tp-chips">
        <button
          v-for="[idx, color] in palEntries"
          :key="idx"
          class="tp-chip mono"
          :class="{ dim: filterIndex && filterIndex !== idx, on: filterIndex === idx }"
          @click="filterIndex = filterIndex === idx ? null : idx"
        >
          <span class="tp-chip-swatch" :style="{ background: color }"></span>
          {{ idx }}
          <span class="tp-chip-cnt">{{ indexShardCount.get(idx) || 0 }}</span>
        </button>
        <button v-if="palHiddenCount > 0" class="tp-chip tp-chip-more" @click="palExpanded = true">
          +{{ palHiddenCount }} 更多
        </button>
        <button v-else-if="palShowCollapse" class="tp-chip tp-chip-more" @click="palExpanded = false">收起</button>
        <span v-if="palQuery.trim() && !palEntries.length" class="tp-pal-none">无匹配索引</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Network, RefreshCw, Palette, ClipboardCopy, Braces, ExternalLink } from 'lucide-vue-next';
import { api } from '../api';
import PageHeader from '../components/PageHeader.vue';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { copyText } from '../utils/format';
import { usePref, useUrlState } from '../composables/urlState';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue'; /* ：频率下拉统一件 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 拓扑统计串统一件 */
import StatusPill from '../components/StatusPill.vue'; /* ：shard 状态徽标统一件 */
import { friendlyEsError } from '../utils/esError';
import { shardStateZh, shardStateTone } from '../utils/esEnumZh'; /* ：shard 状态收口 */
import { semFormat } from '../composables/useSemFormat'; /* ：fmtB 手写档退役换 semFormat bytes */
import { metricColor } from '../utils/metricThresholds'; /* ：磁盘水位色档全站单源（disk warn 80/bad 90，视图层不自造阈值） */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { gridNext } from '../utils/gridNav';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
const store = useAppStore();
const router = useRouter();
/* 分片格可点：UNASSIGNED → 诊断未分配原因；已分配 → 该索引的分片 tab */
function gotoShard(s: any) {
  if (s.state === 'UNASSIGNED') router.push('/diag');
  else router.push({ path: '/indices', query: { idx: s.index, tab: 'shards' } });
}

interface Shard {
  index: string; shard: number; prirep: string; state: string;
  docs?: number | null; storeBytes?: number | null;
  node?: string | null; ip?: string | null;
}

/* ═══ 1381：分片格右键 ═══
   取数场景：分片异常排查要把「索引 / 分片号 / 主副 / 所在节点」贴进 issue 或
   拼进 `_cluster/reroute` 的 exclude 段；此前只能看着 tooltip 手抄。
   一级两项直达（复制分片标识 / 复制诊断用 JSON），其余进「更多…」分组。 */
const shardMenu = ref<{ x: number; y: number; s: Shard } | null>(null);
/* 单一 keydown 入口：菜单键开菜单，方向键走矩阵导航（SFC 不允许重复 @keydown 属性） */
function onShardKey(e: KeyboardEvent, g: any, s: Shard, si: number) {
  onShardMenuKey(e, s);
  onShardNav(e, g, si);
}
/* 分片矩阵方向键：←/→ 同行、↑/↓ 按 COLS 跨行，Home/End 首末；边界不拦截滚动 */
function onShardNav(e: KeyboardEvent, g: any, si: number) {
  const next = gridNext(e.key, si, COLS, g.shards?.length ?? 0);
  if (next === null) return;
  e.preventDefault();
  const cells = (e.currentTarget as SVGGElement).parentElement
    ?.querySelectorAll<SVGGElement>('[data-shard-idx]');
  cells?.[next]?.focus();
}
function onShardMenuKey(e: KeyboardEvent, s: Shard) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  shardMenu.value = { ...menuKeyAnchor(e), s };
}
function openShardMenu(e: MouseEvent, s: Shard) {
  shardMenu.value = { x: e.clientX, y: e.clientY, s };
}
const shardMenuItems = computed<CcmItem[]>(() => {
  const m = shardMenu.value;
  if (!m) return [];
  const s = m.s;
  const label = `${s.index}[${s.shard}]${s.prirep === 'p' ? 'p' : 'r'}`;
  const detail = {
    index: s.index, shard: s.shard, primary: s.prirep === 'p',
    state: s.state, node: s.node ?? null,
    docs: s.docs ?? null, store: s.storeBytes ?? null,
  };
  const copy = (text: string, okMsg: string) => {
    void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败'));
  };
  return [
    { key: 'copy-label', label: `复制分片标识（${label}）`, icon: ClipboardCopy, run: () => copy(label, '已复制分片标识') },
    { key: 'copy-json', label: '复制分片详情 JSON', icon: Braces, run: () => copy(JSON.stringify(detail, null, 2), '已复制分片详情') },
    { key: 'more-group', label: '更多…', icon: ClipboardCopy, sep: true, children: [
      { key: 'copy-index', label: '只复制索引名', icon: ClipboardCopy, run: () => copy(s.index, '已复制索引名') },
      { key: 'copy-node', label: '只复制节点名', icon: ClipboardCopy, run: () => copy(s.node || '', s.node ? '已复制节点名' : '该分片未分配节点') },
      { key: 'copy-reroute', label: '复制 reroute exclude 片段', icon: ClipboardCopy, run: () => copy(JSON.stringify({ index: s.index, shard: s.shard, primary: s.prirep === 'p' }, null, 2), '已复制 reroute 片段') },
    ] },
  ];
});

/* 节点区右键/键盘：复制节点名与承载信息、跳节点诊断（未分配分组无诊断） */
const nodeMenu = ref<{ x: number; y: number; g: any } | null>(null);
function openNodeMenu(e: MouseEvent, g: any) {
  nodeMenu.value = { x: e.clientX, y: e.clientY, g };
}
function gotoNodeDiag(g: any) {
  if (!g?.node || g.node === '__UNASSIGNED__') return;
  router.push({ path: '/diag', query: { node: g.node } });
}
function onNodeKey(e: KeyboardEvent, g: any) {
  if (isMenuKey(e)) {
    e.preventDefault();
    nodeMenu.value = { ...menuKeyAnchor(e), g };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    gotoNodeDiag(g);
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const names = [...document.querySelectorAll<SVGTextElement>('.tp-node-name')];
  if (names.length < 2) return;
  const cur = names.indexOf(e.currentTarget as SVGTextElement);
  if (cur < 0) return;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? names.length - 1
    : Math.max(0, Math.min(names.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
  e.preventDefault(); e.stopPropagation();
  names[next]?.focus();
}
const nodeMenuItems = computed<CcmItem[]>(() => {
  const g = nodeMenu.value?.g;
  if (!g) return [];
  const copy = (text: string, okMsg: string) => {
    void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败'));
  };
  const info = `${g.node} · ${g.ip || '-'} · ${g.shards?.length ?? 0} 分片 · ${fmtB(g.storeBytes)}`;
  const items: CcmItem[] = [
    { key: 'node-copy-name', label: '复制节点名', icon: ClipboardCopy, run: () => copy(String(g.node), '已复制节点名') },
    { key: 'node-copy-info', label: '复制节点承载信息', icon: Braces, run: () => copy(info, '已复制节点信息') },
  ];
  if (g.node !== '__UNASSIGNED__') {
    items.push({ key: 'node-diag', label: '打开节点诊断', icon: ExternalLink, sep: true, run: () => gotoNodeDiag(g) });
  }
  return items;
});

const shards = ref<Shard[]>([]);
const clusterHealth = ref<any>(null); /* ：未分配异常判定的拓扑判据 */
/* （/ 留存）：nodes-stats-brief 节点维（磁盘/角色）——端点失败
 catch 兜 []，拓扑主数据不受扰（与 clusterHealth 同款容错位） */
const nodesBrief = ref<any[]>([]);
/* 通配符过滤进 URL 可分享（?pattern=，IndexHub sort 同款 useUrlState 写法；
 空值按默认值口径自动从 URL 移除保持干净），自动刷新是个人偏好 */
const indexPattern = useUrlState('pattern');
const filterIndex = ref<string | null>(null);
const loading = ref(false);
/* G2-B4：失败状态位——err-bar 常驻（全文+重试），与空态互斥；成功自动消隐 */
const loadErr = ref('');
const autoRefresh = usePref('shards.autoRefresh', false);
const tip = ref<{ s: Shard; x: number; y: number } | null>(null);


let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  loadErr.value = '';
  try {
    const [s, h, nb] = await Promise.all([
      api.shards(indexPattern.value || undefined),
      api.clusterHealth().catch(() => null),
      api.nodesStatsBrief().catch(() => []),
    ]);
    if (seq !== loadSeq) return;
    shards.value = Array.isArray(s) ? s : [];
    clusterHealth.value = h;
    nodesBrief.value = Array.isArray(nb) ? nb : [];
  } catch (e: any) {
    if (seq !== loadSeq) return;
    /* G2-B4：失败保留旧图不清空（对齐 DiagView 保留旧值），err-bar 常驻明示刷新失败 */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'shards: ' + loadErr.value);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

/* 轮询合并 useAutoRefresh——KeepAlive/页面隐藏/卸载全链
 停续+tick 再验 loading（此前裸 setInterval 在后台标签页照跑）。
 固定 10s 档换 AutoRefreshSelect 频率档（默认 10s 同原固定档，usePref 记忆），
 开关/频率变更 restart 重排（ms getter 重估，关=0 停表） */
const tpIntervalMs = usePref('shards.intervalMs', 10000);
const refresher = useAutoRefresh(load, {
  ms: () => (autoRefresh.value ? tpIntervalMs.value : 0),
  guard: () => !loading.value,
});
refresher.setOn(true); // usePref 恢复为 true 时开局即启动（原 immediate watch 语义）
watch([autoRefresh, tpIntervalMs], () => refresher.restart());

/* 1125：拓扑首载 + 10s 轮询都要过身份门（轮询见 useAutoRefresh 的 guard 侧） */
const topoBoot = useGatedBootRead('topology', load);
onMounted(() => topoBoot.run());

/* 布局参数。（/ 留存）：CELL 14→16 / GAP 3→4——SVG 单位格加大后
 viewBox W=844 恒定（NODE_W/网格参数零触），配 svgMinW 渲染宽保底全档 ≥24px
 （WCAG 2.5.8 最小目标尺寸；703 盘点 900/1280/1600 档实测 12.8/16.5/21.8px 全未达） */
const NODE_W = 260;
const CELL = 16;
const GAP = 4;
const COLS = Math.floor((NODE_W - 24 + GAP) / (CELL + GAP)); // 每行分片格数
const NODE_MARGIN = 16;

/* 节点名×角色标签同行避撞：SVG 文本无自动省略，长主机名与右锚角色串
 y=18 同行相向绘制中段必撞——估宽截断名字：--fs-sm mono 600 ≈7.4/字符、
 --fs-xs mono ≈6.6/字符（viewBox 单位与渲染缩放无关），全名进 <title> 悬浮兜底 */
const TP_NAME_CHAR_W = 7.4;
const TP_ROLE_CHAR_W = 6.6;
function fitNodeName(name: string, roleTxt: string, isMaster: boolean): string {
  const roleChars = (isMaster ? 'master' : '') + (isMaster && roleTxt ? ' · ' : '') + roleTxt;
  const roleW = roleChars.length * TP_ROLE_CHAR_W;
  const maxChars = Math.max(4, Math.floor((NODE_W - 24 - roleW) / TP_NAME_CHAR_W));
  if (name.length <= maxChars) return name;
  return name.slice(0, maxChars - 1) + '…';
}

/* 过滤后分片 */
const filtered = computed<Shard[]>(() => {
  if (!filterIndex.value) return shards.value;
  return shards.value.filter(s => s.index === filterIndex.value);
});

/* 按节点分组 */
interface NodeGroup {
  node: string; ip?: string | null; shards: Shard[]; storeBytes: number;
  x: number; y: number; h: number;
  /* ：磁盘水位+角色维（nodes-stats-brief 按 name merge；diskPct null=无数据回落） */
  diskPct?: number | null; diskUsedBytes?: number; diskTotalBytes?: number;
  isMaster?: boolean; roleTxt?: string;
  /* 估宽截断后的展示名（全名= node，<title> 兜底） */
  nameFit?: string;
  /* 节点头高：有磁盘行 68 / 无 44（分片矩阵起点与组高随让位） */
  headH: number;
}
const layout = computed<NodeGroup[]>(() => {
  const byNode = new Map<string, NodeGroup>();
  /* ：brief 按节点名对齐（shards API 的 node 字段与 nodes stats 的 name 同源） */
  const briefMap = new Map(nodesBrief.value.map((n: any) => [String(n?.name ?? ''), n]));
  for (const s of filtered.value) {
    const key = s.state === 'UNASSIGNED' ? '__UNASSIGNED__' : (s.node || '__UNASSIGNED__');
    let g = byNode.get(key);
    if (!g) {
      g = { node: key, ip: s.ip, shards: [], storeBytes: 0, x: 0, y: 0, h: 0, headH: 44, diskPct: null, nameFit: key };
      const nb = briefMap.get(key);
      if (nb && key !== '__UNASSIGNED__') {
        const total = Number(nb.diskTotal || 0), free = Number(nb.diskFree || 0);
        if (total > 0) {
          g.diskPct = Math.round((total - free) / total * 100);
          g.diskUsedBytes = total - free;
          g.diskTotalBytes = total;
        }
        const roles: string[] = Array.isArray(nb.roles) ? nb.roles.map(String) : [];
        g.isMaster = roles.includes('master');
        g.roleTxt = roles.filter(r => r !== 'master').slice(0, 2).join(' · ');
        g.nameFit = fitNodeName(g.node, g.roleTxt ?? '', !!g.isMaster);
      }
      byNode.set(key, g);
    }
    g.shards.push(s);
    if (s.storeBytes) g.storeBytes += s.storeBytes;
  }
  // 排序：未分配放最后
  const arr = Array.from(byNode.values()).sort((a, b) => {
    if (a.node === '__UNASSIGNED__') return 1;
    if (b.node === '__UNASSIGNED__') return -1;
    return b.shards.length - a.shards.length;
  });
  // 每节点内分片排序：主 > 副 > un；同类型按 index+shard
  for (const g of arr) {
    g.shards.sort((a, b) => {
      const pa = a.prirep === 'p' ? 0 : 1;
      const pb = b.prirep === 'p' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ci = a.index.localeCompare(b.index);
      return ci !== 0 ? ci : a.shard - b.shard;
    });
    g.headH = g.diskPct != null ? 68 : 44;
    const rows = Math.ceil(g.shards.length / COLS);
    g.h = g.headH + rows * (CELL + GAP) + 8;
  }
  // 网格布局：横向 3 列，纵向堆叠
  const gridCols = 3;
  arr.forEach((g, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    g.x = col * (NODE_W + NODE_MARGIN) + NODE_MARGIN;
    // y 需累加同列高度，用简单跨列独立累加
    g.y = 0;
  });
  // 逐列独立堆叠
  const colHeights = new Array(gridCols).fill(NODE_MARGIN);
  arr.forEach((g, i) => {
    const col = i % gridCols;
    g.y = colHeights[col];
    colHeights[col] += g.h + NODE_MARGIN;
  });
  return arr;
});

const W = computed(() => 3 * (NODE_W + NODE_MARGIN) + NODE_MARGIN);
/* ：SVG 渲染宽保底——viewBox 拉伸到容器不足 24px/格 时钳到该宽（CELL 渲染恒
 ≥24px WCAG 2.5.8），画布 overflow:auto 受控横滚承接（Cerebro 同语言：格子优先于缩放） */
const svgMinW = computed(() => Math.ceil((W.value / CELL) * 24));
const H = computed(() => {
  const cols = 3;
  const heights = new Array(cols).fill(NODE_MARGIN);
  layout.value.forEach((g, i) => { heights[i % cols] += g.h + NODE_MARGIN; });
  return Math.max(200, Math.max(...heights));
});

/* KPI */
const primaryCount = computed(() => filtered.value.filter(s => s.prirep === 'p').length);
const replicaCount = computed(() => filtered.value.filter(s => s.prirep === 'r').length);
const unassignedCount = computed(() => filtered.value.filter(s => s.state === 'UNASSIGNED').length);
/* 信噪比：未分配是否异常——red 恒异常；否则仅多数据节点异常（单节点副本无处放置为常态） */
const uaAbnormal = computed(() => {
  if (!unassignedCount.value) return false;
  const ch: any = clusterHealth.value;
  if (!ch) return true; /* 健康信息拿不到时保守按异常展示 */
  return ch.status === 'red' || (ch.number_of_data_nodes ?? 0) > 1;
});
const relocatingCount = computed(() => filtered.value.filter(s => s.state === 'RELOCATING').length);

/* （/）：统计串统一「当前视图（filtered）」口径——此前分片 value 用全量
 shards.length 而主/副拆分用 filtered、索引项用全量 indexPalette.size 却标「当前视图」，
 过滤态四口径混编（「2 节点·106 分片（主 2·副 2）」）；全量对照改走分片项 tip 分项标明，
 palette 区标题的全量索引数（indexPalette.size）不受影响 */
const viewIndexCount = computed(() => new Set(filtered.value.map(s => s.index)).size);

/* 拓扑卡头统计串 MetaStrip items——未分配异常（ 判据）走 err、relocating>0 走 warn；
 常态未分配原为 --tx2 弱显，改用后统一中性亮色（常态）副文案保留在 label 内说明） */
const tpMeta = computed<MetaStripItem[]>(() => [
  { value: nodeStats.value.length, label: '节点' },
  {
    value: filtered.value.length,
    label: '分片（主 ' + primaryCount.value + ' · 副 ' + replicaCount.value + '）',
    tip: filterIndex.value ? '全量 ' + shards.value.length + ' 分片 · 当前过滤：' + filterIndex.value : undefined,
  },
  {
    value: unassignedCount.value,
    label: unassignedCount.value && !uaAbnormal.value ? '未分配（常态）' : '未分配',
    tone: uaAbnormal.value ? 'err' : undefined,
  },
  { value: relocatingCount.value, label: 'relocating', tone: relocatingCount.value ? 'warn' : undefined },
  { value: viewIndexCount.value, label: '索引（当前视图）' },
]);

/* nodeStats 派生 */
const nodeStats = computed(() => {
  const s = new Set<string>();
  for (const sh of filtered.value) if (sh.node && sh.state !== 'UNASSIGNED') s.add(sh.node);
  return Array.from(s);
});

/* 索引调色板：按 hash 稳定分配 HSL */
const indexPalette = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const s of shards.value) seen.add(s.index);
  const sorted = Array.from(seen).sort();
  sorted.forEach((idx, i) => {
    // hash 稳定色：hue 基于 idx 内容 + 少量偏移
    let hash = 0;
    for (let j = 0; j < idx.length; j++) hash = (hash * 31 + idx.charCodeAt(j)) & 0xffffffff;
    const hue = Math.abs(hash) % 360;
    map.set(idx, `hsl(${hue}, 70%, 55%)`);
  });
  return map;
});

const indexShardCount = computed(() => {
  const m = new Map<string, number>();
  for (const s of shards.value) m.set(s.index, (m.get(s.index) || 0) + 1);
  return m;
});

/* （/）：调色板搜索 + 收纳——26 chips 平铺在 900 档占视口 22%、
 生产 100+ 索引 20+ 行爆炸（铁律 B 可检索缺位）。搜索=前缀 / 通配（* ?）客户端
 匹配（与顶栏索引通配符同语言）；收纳=超 PAL_COLLAPSE_AT 折叠「+N 更多」，
 展开态 usePref 记忆；搜索态不收纳（搜索已是主动收窄）；清空搜索词回落
 usePref 记忆的展开/折叠态 */
const PAL_COLLAPSE_AT = 24;
const palQuery = ref('');
const palExpanded = usePref('shards.paletteExpanded', false);

function palMatch(idx: string, q: string): boolean {
  if (/[*?]/.test(q)) {
    const re = new RegExp('^' + q.split('').map(ch => {
      if (ch === '*') return '.*';
      if (ch === '?') return '.';
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }).join('') + '$', 'i');
    return re.test(idx);
  }
  return idx.toLowerCase().startsWith(q.toLowerCase());
}

const palEntries = computed(() => {
  const all = Array.from(indexPalette.value);
  const q = palQuery.value.trim();
  if (q) return all.filter(([idx]) => palMatch(idx, q));
  return palExpanded.value || all.length <= PAL_COLLAPSE_AT ? all : all.slice(0, PAL_COLLAPSE_AT);
});
const palHiddenCount = computed(() => {
  if (palQuery.value.trim()) return 0;
  const total = indexPalette.value.size;
  return palExpanded.value || total <= PAL_COLLAPSE_AT ? 0 : total - PAL_COLLAPSE_AT;
});
/* 收起钮只在「展开态且超阈值且非搜索」显示（与折叠态「+N 更多」互斥） */
const palShowCollapse = computed(() =>
  !palQuery.value.trim() && palExpanded.value && indexPalette.value.size > PAL_COLLAPSE_AT);

function indexColor(idx: string): string {
  return indexPalette.value.get(idx) || 'hsl(210, 20%, 50%)';
}

/* 分片格状态色语义化：STARTED 用索引色（主分片深描边、副本半透明），
 RELOCATING 用 --warn、UNASSIGNED 用 --err——状态不再只靠透明度弱差分 */
function shardFill(s: Shard): string {
  if (s.state === 'UNASSIGNED') return 'var(--err)';
  if (s.state === 'RELOCATING') return 'var(--warn)';
  return indexColor(s.index);
}
function shardStroke(s: Shard): string {
  return s.prirep === 'p' && s.state === 'STARTED' ? 'var(--tx0)' : 'transparent';
}
function shardStrokeWidth(s: Shard): number {
  return s.prirep === 'p' && s.state === 'STARTED' ? 1.5 : 0;
}
function shardOpacity(s: Shard): number {
  if (s.state === 'RELOCATING' || s.state === 'UNASSIGNED') return 1;
  return s.prirep === 'r' ? 0.68 : 1;
}

/* ：水位条前景宽（0% 留 2px 可见底，防零宽条消失） */
function diskBarW(g: NodeGroup): number {
  return Math.max(2, (NODE_W - 24) * Math.min(100, g.diskPct ?? 0) / 100);
}

/* fmtB 手写 1024 档退役 → semFormat bytes 统一件（530 W-B 共享件单一出处，
 1.2 GB 档位制形态）；'-'/0 空语义保留（分片零存储与无数据同示 '-'），解析失败回落 '-' */
function fmtB(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return '-';
  return semFormat(bytes, 'bytes')?.text ?? '-';
}

/* 节点清单 Markdown 复制（带出体系——分片分布盘点贴群；
 未分配桶不进清单，它是异常态展示不是承载节点） */
async function copyNodeList() {
  const rows = layout.value.filter(g => g.node !== '__UNASSIGNED__');
  if (!rows.length) return;
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '| 节点 | IP | 分片数 | 存储 |',
    '| --- | --- | --- | --- |',
    ...rows.map(g => `| ${esc(g.node)} | ${esc(g.ip || '-')} | ${g.shards.length} | ${fmtB(g.storeBytes)} |`),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 个节点（Markdown）` : '复制失败');
}

/* Tooltip 定位锚：.tp-canvas 相对坐标（鼠标事件 clientX/Y - 画布原点）。
 不能用 SVG viewBox 单位：.tp-svg width:100% 会把 viewBox(844 宽) 拉伸适配容器，
 SVG 单位 ≠ CSS px（1920 宽屏下约 2.2 倍），按 SVG 坐标摆 tip 会飘到悬停格左上远处。
 靠右缘时收进画布（tip min-width 160px），避免撑出横向滚动。 */
const canvasHost = ref<HTMLElement | null>(null);
function cellEnter(e: MouseEvent, s: Shard) {
  const host = canvasHost.value;
  if (!host) { tip.value = { s, x: 0, y: 0 }; return; }
  const r = host.getBoundingClientRect();
  tip.value = {
    s,
    x: Math.min(e.clientX - r.left, Math.max(0, host.clientWidth - 190)),
    /* 877 对称对齐：absolute tip 锚 padding-box 而量测是 border-box——border-top 计入
 原点=恒定 1px 下坠，clientTop 修正（cellFocus 同律） */
    y: e.clientY - r.top - host.clientTop,
  };
}

/* （/）：键盘聚焦 tip 联动——focus 无鼠标坐标，以聚焦格自身包围盒
 中心为锚换算画布相对坐标（x 右缘收进同 cellEnter 口径）；blur 只撤自己驱动的
 tip（引用等值判别，鼠标悬停他格不受扰）。视觉焦点环见 :focus-visible 档 */
function cellFocus(e: FocusEvent, s: Shard) {
  const host = canvasHost.value;
  const el = e.currentTarget as SVGGraphicsElement | null;
  if (!host || !el) { tip.value = { s, x: 0, y: 0 }; return; }
  const r = el.getBoundingClientRect();
  const hr = host.getBoundingClientRect();
  tip.value = {
    s,
    x: Math.min(r.left - hr.left + r.width / 2, Math.max(0, host.clientWidth - 190)),
    y: r.top - hr.top - host.clientTop + r.height / 2,
  };
}
function cellBlur(s: Shard) {
  if (tip.value && tip.value.s === s) tip.value = null;
}
</script>

<style scoped>
/* G2-C7：区块级间距落梯 --sp token（亚阶梯微调、控件内 padding、尺寸值不动） */
.tp { display: flex; flex-direction: column; gap: var(--sp-3); }
/* W-F：.tp-title 死规则删除（模板零引用，统计串已换 MetaStrip 统一件）。
 card 壳退役——裸行只留竖距与分界线，横距归页面流 */
.tp-bar { padding: var(--sp-3) 0; border-bottom: 1px solid var(--line); }
.tp-input { width: 260px; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); font-family: var(--font-mono, monospace); }
.tp-input:focus { border-color: var(--ac); outline: 0; }
.tp-chk { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; }

.tp-legend { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--tx2); }
.tp-swatch { width: 10px; height: 10px; border-radius: 2px; }
.tp-swatch.un { background: var(--err); }
.tp-swatch.reloc { background: var(--warn); }
.tp-legend-note { color: var(--tx2); }

/* KPI 大卡墙退役：拓扑卡头 inline 统计串改用 MetaStrip 统一件——
 基础形态（flex/b/i/sep/mono/tone 色档）全由组件承担，本页只留落位 */
.top-meta { margin-bottom: var(--sp-3); }

/* .card 壳退役 → border-top 分节 hairline（552 tp-bar 同页续刀）；本类
 padding 原样自持零触（900 档侧距收窄照旧） */
.tp-canvas { padding: var(--sp-4); min-height: 300px; position: relative; overflow: auto; border-top: 1px solid var(--border); }
/* G2-C7：骨架间距由容器 gap 接管（原 SkeletonBox 内联 margin-bottom:10px 已删） */
.tp-loading { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-2); }
.tp-svg { width: 100%; height: auto; display: block; }
.tp-node { fill: var(--bg1); stroke: var(--line); stroke-width: 1; transition: stroke var(--tr); }
.tp-node:hover { stroke: var(--ac); }
.tp-node-un { fill: var(--err-line); stroke: var(--err-line); }
.tp-node-name { fill: var(--tx0); font-size: var(--fs-sm); font-weight: 600; font-family: var(--font-mono, monospace); }
.tp-node-sub { fill: var(--tx2); font-size: var(--fs-xs); font-family: var(--font-mono, monospace); }
/* （角色徽标（名字行右端；master 品牌青高亮档，余角色弱显） */
.tp-node-role { fill: var(--tx2); font-size: var(--fs-xs); font-family: var(--font-mono, monospace); }
.tp-role-master { fill: var(--ac); font-weight: 600; }
/* ：磁盘水位条（track 弱底；bar 前景 fill 由 metricColor 单源绑定，CSS 不设色） */
.tp-disk-track { fill: var(--bg2); }
.tp-disk-bar { transition: width var(--tr); }
.tp-node-name:focus-visible { outline: none; text-decoration: underline; text-decoration-color: var(--ac); text-decoration-thickness: 2px; }
.tp-cell { cursor: pointer; transition: opacity 120ms; }
.tp-cell:hover { opacity: 1 !important; }
/* （/）：键盘聚焦视觉档——g 聚焦时 rect 描边统一 --ac 焦点环
 （CSS 覆盖 presentation attribute 描边，副本半透明底仍在）；:focus-visible 只在
 键盘导航态匹配，鼠标点击聚焦不加双重视觉 */
g:focus-visible > .tp-cell { stroke: var(--ac); stroke-width: 2; }

.tp-tip { position: absolute; padding: var(--sp-1h) var(--sp-2); background: var(--bg0); border: 1px solid var(--line); border-radius: var(--r-xs); box-shadow: var(--shadow-pop); font-size: var(--fs-xs); pointer-events: none; z-index: 10; min-width: 160px; }
.tp-tip > div { padding: 1px 0; }


.tp-palette { padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); }
/* （/）：标题行两端布局——标题左、搜索框右（flex-wrap 承接窄档换行） */
.tp-pal-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
.tp-pal-search { width: 190px; height: 24px; padding: 0 var(--sp-2); font-size: var(--fs-xs); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); font-family: var(--font-mono, monospace); }
.tp-pal-search:focus { border-color: var(--ac); outline: 0; }
.tp-chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); align-items: center; }
.tp-chip { display: inline-flex; align-items: center; gap: var(--sp-1h); padding: 3px var(--sp-2); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-l); cursor: pointer; font-size: var(--fs-xs); color: var(--tx1); transition: all var(--tr); }
.tp-chip:hover { border-color: var(--ac); color: var(--tx0); }
.tp-chip.dim { opacity: .35; }
/* 命中（当前过滤）chip 强化——ac 描边+底色加亮，与 dim 非命中对比分明 */
.tp-chip.on { border-color: var(--ac); background: var(--ac-soft); color: var(--ac-hi); box-shadow: 0 0 0 1px var(--ac-line); }
.tp-chip-swatch { width: 8px; height: 8px; border-radius: 50%; }
.tp-chip-cnt { color: var(--tx2); font-family: var(--font-mono, monospace); font-size: var(--fs-xs); }
/* ：收纳钮（+N 更多 / 收起）走 chip 同族视觉，虚线弱态与索引 chip 区分 */
.tp-chip-more { border-style: dashed; color: var(--tx2); background: transparent; }
.tp-chip-more:hover { border-color: var(--ac); color: var(--tx0); }
.tp-pal-none { font-size: var(--fs-xs); color: var(--tx2); padding: 3px 0; }

/* 1100 堆叠档（ 双档范式，Tasks/Overview 同口径，零结构动）——
 过滤输入定宽 260px 在中窄视口把工具行挤出横向滚动，收成随容器铺满；
 拓扑主区是 SVG viewBox 自适应，无需塌列 */
@media (max-width: 1100px) {
  .tp-input { width: 100%; }
  /* ：同款口径——中窄档搜索框随容器铺满（pal-head flex-wrap 换行承接） */
  .tp-pal-search { width: 100%; }
}

/* 900 紧凑微调档——画布侧距收一档兜密度（图例 chip 换行由全局
 .lr-bar flex-wrap 承担，无需视图侧补）。：.tp-bar 900 侧距收窄档随
 card 壳退役删除——裸行横距归页面流 */
@media (max-width: 900px) {
  .tp-canvas { padding: var(--sp-3); }
}
</style>
