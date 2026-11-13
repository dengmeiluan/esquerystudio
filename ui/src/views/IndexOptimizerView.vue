<template>
  <div class="io-page">
    <div class="io-hd">
      <PageHeader :icon="Wand2" title="索引一键优化向导" subtitle="扫描热参数并给出可执行建议 · 每条建议独立勾选与应用 · 危险变更前二次确认">
        <template #actions>
          <div class="io-idx-sel">
            <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（「选索引」唯一入口收敛顶栏）；
 「目标索引」标签与页内「当前设置 /idx」卡语义重复，随瘦身退役。写类向导不开 useIdxState
 follow（ 口径，防 A 的建议下发到 B）——「用当前索引」回填钮保留（AdhocRebuildView
 写类页范式：chip 与 target 的显式桥），扫描仍由用户显式触发（回填不自动探测） -->
            <CurrentIdxChip />
            <!-- 内联钮合并 PickCurrentIdxBtn 统一件（图标/样式/data-test/title
 随件内聚，本页只接 @pick 显式覆盖口； 不 follow 口径不变，扫描仍显式触发） -->
            <PickCurrentIdxBtn @pick="target = store.pickedIdx" />
          </div>
          <button class="btn pri sm" :disabled="!target || loading" @click="scan">
            <RefreshCcw :size="12" :class="{ 'spin': loading }" /> {{ loading ? '扫描中…' : '扫描' }}
          </button>
          <!-- 原始 IO 快查——本页最近一次扫描（GET index-settings）或下发
 （POST index-settings/update）请求/响应原文（ioRecorder 记录环；两通道同族公共前缀
 last 取最近一条，plan/preview 双语义；页头恒渲染位，预览卡头有勾选门控不落钮） -->
          <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（优化向导）" title="最近一次扫描/下发（index-settings 读写）请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
        </template>
      </PageHeader>
    </div>

    <!-- 只读身份前置说明（1124）：应用建议/段合并在无权限时隐藏，给原因而不是留空工具栏 -->
    <div v-if="auth.probed && !canApply && !canOps" class="io-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份只读：扫描与建议可照常查看；应用优化项、段合并需要该连接的索引设置/优化页写权限。
    </div>

    <!-- G6-B8：扫描失败 err-bar 独立顶置（ 同构修复）——不再 toast + snap=null 伪装「尚未扫描」；
 有旧 snap 重扫失败时旧数据保留并存 -->
    <div v-if="scanErr" role="alert" class="err-bar rise-in">
      {{ scanErr }}
      <button class="btn sm" @click="scan" :disabled="loading || !target"><RefreshCcw :size="12" /> 重试</button>
    </div>

    <EmptyState v-if="!snap && !loading && !scanErr" :icon="Wand2"
                text="尚未扫描任何索引"
                hint="在右上角选择目标索引并点「扫描」，向导会检测 refresh_interval / replicas / max_result_window / codec 等调优点" />

    <!-- 扫描中骨架屏，避免空白等待 -->
    <div v-if="loading && !snap" class="io-loading">
      <SkeletonBox height="120px" round />
      <SkeletonBox v-for="i in 3" :key="i" height="56px" round />
    </div>

    <div v-if="snap" class="io-body">
      <div class="io-cur">
        <div class="io-cur-hd sec-t">当前设置 <span class="io-cur-sub">/{{ snapIdx }}</span></div>
        <div class="io-cur-grid">
          <div v-for="[k, v] in currentEntries" :key="k" class="io-cur-row">
            <!-- G183：裸英文键根治——悬停出目录中文释义+示例（英文键留检索） -->
            <span class="io-k" :title="ioHint(k)">{{ k }}</span>
            <span class="io-v">{{ v ?? '—' }}</span>
          </div>
        </div>
      </div>

      <div class="io-recs">
        <div class="io-recs-hd">
          <!-- 计数徽标改用 StatusPill n 档（中性计数；io-recs-cnt 锚类保留，
 皮归 .pill 单源——io-rec-sv 531 先例同谱系） -->
          <span>优化建议 <StatusPill class="io-recs-cnt" tone="n" :label="String(recs.length)" /></span>
          <span class="io-recs-r">
            <!-- 建议导出 JSON（存档/带出走变更评审） -->
            <button class="btn sm ghost" :disabled="!recs.length" title="导出全部建议为 JSON（存档/带出评审）" @click="exportRecs">
              <FileDown :size="12" /> 导出
            </button>
            <label class="io-check-all"><input type="checkbox" :checked="allChecked" @change="toggleAll" />全选</label>
            <button v-if="canApply" class="btn sm pri" :disabled="!hasChecked || applying" @click="applyChecked">
              <Play :size="12" /> {{ applying ? '下发中…' : `应用勾选（${checkedCount}）` }}
            </button>
          </span>
        </div>

        <!-- .io-good 手写空态退役合并 EmptyState compact（约定④ 空态不留整块色框；
 Workspace/Plugins 先例，留白/图标档归组件单源） -->
        <EmptyState v-if="recs.length === 0" compact :icon="CheckCircle2" text="索引参数已符合推荐配置，无需调整" />
        <div v-else class="io-rec-list">
          <div v-for="r in recs" :key="r.id" class="io-rec" :class="'sv-' + r.severity" tabindex="0"
            @contextmenu.prevent="openRecMenu($event, r)" @keydown="onRecMenuKey($event, r)" data-row-nav @keydown.self="rowArrowNav">
            <label class="io-rec-l">
              <input type="checkbox" v-model="checked[r.id]" />
              <span class="io-rec-tt sec-t">{{ r.title }}</span>
              <!-- severity 徽标改用 StatusPill（档位走 sevPill 五主档：critical→r/
 warn→y/info→b，原 sv-critical/sv-warn/sv-info 手写文字色档随改用退役）；
 io-rec-sv 锚类保留在外层（pillSingleTrack MERGED 看守） -->
              <StatusPill class="io-rec-sv" :tone="ioSevPill(r.severity)" :label="svLabel(r.severity)" />
            </label>
            <div class="io-rec-desc">{{ r.desc }}</div>
            <div class="io-rec-diff">
              <span class="io-diff-l"><b>{{ r.key }}</b> :</span>
              <span class="io-diff-old">{{ r.current ?? '未设' }}</span>
              <ArrowRight :size="12" />
              <span class="io-diff-new">{{ r.suggest }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 段碎片体检：独立于上面的「勾选→PUT _settings」流水线。
 force_merge 是 POST _forcemerge 动作，不能混进 PUT body。 -->
      <div v-if="segAdvice" class="io-seg" :class="{ 'io-seg-ok': !segAdvice.flagged }">
        <div class="io-seg-hd">
          <Layers :size="14" />
          <span class="io-seg-tt">段碎片体检</span>
          <!-- 段体检两枚徽标同步改用 StatusPill（io-rec-sv 锚类保留） -->
          <StatusPill v-if="segAdvice.flagged" tone="y" :label="svLabel(segAdvice.severity)" class="io-rec-sv" />
          <StatusPill v-else tone="b" label="正常" class="io-rec-sv" />
        </div>
        <!-- 统计值并 meta-num 全局数值档（.io-seg-stats b 既有 mono/600 之上补 tabular-nums，
 三页统一数值档；下方警示 b 为合法语义强调保留不动） -->
        <div class="io-seg-stats meta-num">
          <span>段总数 <b>{{ segStats.segmentsCount }}</b></span>
          <span>主分片 <b>{{ segStats.priShards }}</b> / 副本 <b>{{ segStats.replicas }}</b></span>
          <span>每主分片均段数 <b>{{ segAdvice.segmentsPerShard }}</b>（阈值 {{ SEGMENTS_PER_SHARD_THRESHOLD }}）</span>
          <span>docs.deleted <b>{{ segStats.docsDeleted }}</b></span>
        </div>
        <div class="io-seg-desc">{{ segAdvice.reason }}</div>
        <template v-if="segAdvice.flagged">
          <div class="io-seg-warn">
            <AlertTriangle :size="13" />
            <div>
              <b>force_merge 是重操作</b>：会重写段文件、占用大量磁盘 IO，执行期间该索引搜索延迟升高，大索引可能持续很久。
              <br />ES 官方明确警告：<b>不要对仍在写入的索引执行 force_merge</b>；<b>合并产生的大于 5GB 的单段永远不会再被后续 merge 回收</b>，
              即使其中的文档后来被全部删除，磁盘也拿不回来 —— 所以大索引不应盲目合并到 1 段。
              <br /><b>请仅对不再写入的索引（历史/冷数据、已切走的旧索引）执行。</b>
              <br />docs.deleted 表示已标记删除但仍占磁盘的文档数，force_merge 会真正回收这部分空间；此处为
              {{ segStats.docsDeleted }}{{ segStats.docsDeleted === 0 ? '，说明没有可回收的删除文档，本次合并只减少段数、不省磁盘' : '' }}。
            </div>
          </div>
          <div class="io-seg-act">
            <span class="io-seg-mx">
              目标段数 maxSegments
              <!-- G184：span 兄弟文本非 label 关联，input 补 aria-label 自带可读名 -->
              <input type="number" min="1" v-model.number="segMaxSegments" class="io-seg-in" aria-label="目标段数 maxSegments" />
              <span class="io-seg-hint">建议 {{ segAdvice.suggestedMaxSegments }}</span>
            </span>
            <button v-if="canOps" class="btn sm warn" :disabled="segMerging" @click="runForceMerge">
              <!-- G185：在途窗图标补全局旋转类（「合并中…」文案切换既有=半合规补全，747 G161 族） -->
              <Layers :size="12" :class="{ spinning: segMerging }" /> {{ segMerging ? '合并中…' : '执行 force_merge' }}
            </button>
          </div>
        </template>
      </div>

      <div v-if="hasChecked" class="io-preview">
        <div class="io-preview-hd sec-t">Body 预览（PUT /{{ target }}/_settings）</div>
        <!-- D：裸 JSON 换 highlightJson（previewBody 已是 pretty 串，着色 + json-view 全局范式） -->
        <pre class="io-preview-code json-view" v-html="highlightJson(previewBody)"></pre>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 index-settings 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1368：建议条目右键菜单（项目统一 CellContextMenu）。
     一级按右键约定：勾选此条（最高频）+ 复制建议配置（下一步直接粘进 PUT body）+ 分组父行。 -->
    <CellContextMenu
      v-if="recMenu"
      :x="recMenu.x" :y="recMenu.y" :title="recMenu.title"
      :items="recMenuItems"
      @close="recMenu = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { Wand2, RefreshCcw, Play, CheckCircle2, ArrowRight, Layers, AlertTriangle, FileDown, Terminal, ShieldAlert, Copy, Braces, ChevronsUpDown } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { exportStamp, downloadText, copyText } from '../utils/format';
import { useIdxState } from '../composables/urlState';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件 */
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：severity 徽标统一件 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1368：建议条目右键菜单 */
import { askConfirm } from '../composables/confirm';
/* W4：建议严重度中文标签收口 utils/esEnumZh 的 sevZh（别名保模板
 svLabel 字面量；critical→严重 / warn→警告 / 其余→建议，逐字同旧 svLabel）。
 pill 色档补接 sevPill（别名 ioSevPill，critical→r/warn→y/info→b 五主档单源） */
import { sevZh as svLabel, sevPill as ioSevPill } from '../utils/esEnumZh';
import { friendlyEsError } from '../utils/esError';
import { highlightJson } from '../utils/jsonc';
/* G183：当前设置键中文释义接共享索引设置目录（集群目录同款单源消费面） */
import { SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import {
  evaluateSegments, parseStoreSize, parseCatNumber,
  SEGMENTS_PER_SHARD_THRESHOLD, type SegmentAdvice,
} from '../composables/segmentAdvice';

const store = useAppStore();
/* 权限写门——下发优化项/force_merge 均为写操作，VIEWER 不显示入口 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/force-merge', store.target));
/* 「应用勾选」实调 PUT /cluster/index-settings/update（属 index-settings 页）——
   与 force_merge 分属两端点，conn 模型下各自判门（门错位=有权限却看不到/点了 403） */
const canApply = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/index-settings/update', store.target));
const router = useRouter();
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const target = useIdxState();
const loading = ref(false);
const snap = ref<any>(null);
/* G6-B8：扫描失败 err-bar 状态位——与「尚未扫描」引导空态互斥 */
const scanErr = ref('');
/* 集群数据节点数——副本建议的拓扑判据（拉不到时为 0，按保守口径出建议） */
const dataNodes = ref(0);
const checked = reactive<Record<string, boolean>>({});
/* ：应用勾选防重入（教训 7：写操作 pending 位 + in-flight 文案，组内口径一致） */
const applying = ref(false);

/* 段碎片体检状态：_cat/indices 的 segments.count / docs.deleted 是唯一段数来源
 （_settings 里没有任何段信息，这是向导原先的盲区）。 */
const segRow = ref<any>(null);
const segMaxSegments = ref(1);
const segMerging = ref(false);

const segStats = computed(() => {
  const r = segRow.value;
  return {
    segmentsCount: r ? parseCatNumber(r['segments.count']) : 0,
    docsDeleted: r ? parseCatNumber(r['docs.deleted']) : 0,
    priShards: r ? parseCatNumber(r.pri) : 0,
    replicas: r ? parseCatNumber(r.rep) : 0,
  };
});

/* 关闭的索引 segments.count 可能为空 —— 拿不到段数就不出这块，不瞎报 */
const segAdvice = computed<SegmentAdvice | null>(() => {
  const r = segRow.value;
  if (!r) return null;
  const s = segStats.value;
  if (s.segmentsCount <= 0) return null;
  return evaluateSegments({
    segmentsCount: s.segmentsCount,
    priShards: s.priShards,
    replicas: s.replicas,
    sizeBytes: parseStoreSize(r['store.size']),
    docsDeleted: s.docsDeleted,
  });
});

interface Rec { id: string; key: string; title: string; desc: string; current: any; suggest: any; severity: 'critical' | 'warn' | 'info'; path: string; }

/* ═══ 1368：建议条目右键菜单 ═══
 用户要求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」——
 优化建议列表此前右键是浏览器默认菜单。一级按右键约定：勾选此条 + 复制建议配置
 （运营拿到建议后的下一步就是把它贴进 PUT _settings body）+ 分组父行。 */
const recMenu = ref<{ x: number; y: number; rec: Rec; title: string } | null>(null);
function openRecMenu(e: MouseEvent, r: Rec) {
  recMenu.value = { x: e.clientX, y: e.clientY, rec: r, title: `${svLabel(r.severity)} · ${r.key}` };
}
function onRecMenuKey(e: KeyboardEvent, r: Rec) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  recMenu.value = { ...menuKeyAnchor(e), rec: r, title: `${svLabel(r.severity)} · ${r.key}` };
}
/* 建议配置片段：与页面下方「Body 预览」同一形状（{ index: {…} } 根层 + dot-path 展开）。
   注意 rec.path 是**相对 index. 的路径**（如 'refresh_interval'、'blocks.read_only_allow_delete'），
   漏掉 index 根层会得到 {"refresh_interval":"30s"} —— PUT _settings 会被 ES 拒绝。 */
function recBody(r: Rec): string {
  const parts = (r.path || r.key).split('.').filter(Boolean);
  const body: any = { index: {} };
  let node: any = body.index;
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]!] = node[parts[i]!] || {};
    node = node[parts[i]!];
  }
  node[parts[parts.length - 1]!] = r.suggest;
  return JSON.stringify(body, null, 2);
}
async function recCopy(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const recMenuItems = computed<CcmItem[]>(() => {
  const m = recMenu.value;
  if (!m) return [];
  const on = !!checked[m.rec.id];
  return [
    { key: 'rec-toggle', label: on ? '取消勾选此条' : '勾选此条', icon: CheckCircle2, run: () => { checked[m.rec.id] = !on; } },
    { key: 'rec-copy-body', label: '复制建议配置（可直粘 PUT body）', icon: Braces, run: () => void recCopy(recBody(m.rec), `已复制「${m.rec.key}」建议配置`) },
    {
      key: 'rec-more', label: '更多…', icon: ChevronsUpDown, sep: true, children: [
        { key: 'rec-copy-key', label: '复制键名', icon: Copy, run: () => void recCopy(m.rec.key, `已复制 ${m.rec.key}`) },
        { key: 'rec-copy-cur', label: '复制当前值', icon: Copy, run: () => void recCopy(m.rec.current == null ? '(未设)' : String(m.rec.current), '已复制当前值') },
        { key: 'rec-only', label: '只勾选此条', icon: CheckCircle2, run: () => { for (const k of Object.keys(checked)) checked[k] = false; checked[m.rec.id] = true; } },
      ],
    },
  ];
});

function pickCurrent(s: any, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), s);
}

/* 复审 M1：标题与 snap 同源（显数据实际所属索引）——换 target 后重扫失败时，旧快照不顶新 target 名 */
const snapIdx = computed(() => (snap.value ? Object.keys(snap.value)[0] : ''));

const cur = computed<any>(() => {
  if (!snap.value) return null;
  const first = Object.values(snap.value)[0] as any;
  return first?.settings?.index || {};
});

const currentEntries = computed(() => {
  if (!cur.value) return [];
  const keys = ['refresh_interval', 'number_of_shards', 'number_of_replicas', 'codec', 'max_result_window', 'translog.durability', 'translog.sync_interval', 'unassigned.node_left.delayed_timeout', 'blocks.read_only_allow_delete'];
  return keys.map(k => [k, pickCurrent(cur.value, k)]);
});

/* G183：键悬停中文释义+示例（含 dot-path 键目录精确命中；目录外键回落空串零扰动） */
function ioHint(k: string): string {
  const s = SETTINGS_CATALOG.find(e => e.key === k);
  return s ? `${s.desc}｜示例：${s.example}` : '';
}

const recs = computed<Rec[]>(() => {
  if (!cur.value) return [];
  const c = cur.value;
  const list: Rec[] = [];
  const ri = c.refresh_interval;
  if (!ri || ri === '1s' || (typeof ri === 'string' && ri.endsWith('s') && parseInt(ri) < 5)) {
    list.push({ id: 'refresh', key: 'refresh_interval', path: 'refresh_interval',
      title: '调低 refresh 频率提高写入吞吐', desc: '默认 1s 会频繁生成 segment；批量写入或历史索引可放宽到 30s，读延迟略高',
      current: ri || '1s', suggest: '30s', severity: 'warn' });
  }
  /* 信噪比：副本建议按集群拓扑判定——单数据节点上 rep=0 是正确配置（rep>=1 副本
 永不可分配、索引恒 YELLOW），一律判「严重」属误报；多节点上 rep=0 才是高可用缺口。 */
  const rep = Number(c.number_of_replicas);
  if (rep === 0 && dataNodes.value > 1) {
    list.push({ id: 'replicas', key: 'number_of_replicas', path: 'number_of_replicas',
      title: '副本数为 0，无高可用', desc: '多节点集群建议至少 1 副本，防节点故障丢数据 / 服务不可用',
      current: 0, suggest: 1, severity: 'critical' });
  } else if (rep === 0) {
    list.push({ id: 'replicas', key: 'number_of_replicas', path: 'number_of_replicas',
      title: '副本数 0（单数据节点常态）', desc: '当前集群仅 1 个数据节点，副本无处分配，rep=0 是正确配置；扩容多节点后再改为 1',
      current: 0, suggest: 1, severity: 'info' });
  } else if (rep >= 1 && dataNodes.value === 1) {
    list.push({ id: 'replicas', key: 'number_of_replicas', path: 'number_of_replicas',
      title: '单数据节点却配置了副本', desc: `副本分片永不可分配，导致索引恒 YELLOW；建议调为 0，扩容后再恢复`,
      current: rep, suggest: 0, severity: 'warn' });
  }
  const mrw = Number(c.max_result_window);
  if (mrw && mrw > 20000) {
    list.push({ id: 'mrw', key: 'max_result_window', path: 'max_result_window',
      title: 'max_result_window 过大', desc: '大于 20000 时深度分页可能 OOM，建议改用 search_after',
      current: mrw, suggest: 10000, severity: 'warn' });
  }
  if (!c.codec || c.codec === 'default') {
    list.push({ id: 'codec', key: 'codec', path: 'codec',
      title: '未启用高压缩 codec', desc: '冷/历史索引可开 best_compression 节省 25% 磁盘（写入略慢）',
      current: c.codec || 'default', suggest: 'best_compression', severity: 'info' });
  }
  const dt = pickCurrent(c, 'unassigned.node_left.delayed_timeout');
  if (!dt) {
    list.push({ id: 'delayed', key: 'unassigned.node_left.delayed_timeout', path: 'unassigned.node_left.delayed_timeout',
      title: '未设置分片重分配延时', desc: '节点短暂重启也会触发大规模重分配；建议延时 5m 让节点自愈',
      current: '默认(1m)', suggest: '5m', severity: 'info' });
  }
  const ro = pickCurrent(c, 'blocks.read_only_allow_delete');
  if (ro === 'true' || ro === true) {
    list.push({ id: 'readonly', key: 'blocks.read_only_allow_delete', path: 'blocks.read_only_allow_delete',
      title: '索引处于只读保护', desc: '通常由磁盘水位触发；解决磁盘后需手动置 null 解除',
      current: 'true', suggest: null, severity: 'critical' });
  }
  const td = pickCurrent(c, 'translog.durability');
  if (td === 'request') {
    list.push({ id: 'translog', key: 'translog.durability', path: 'translog.durability',
      title: '事务日志按请求同步（较慢）', desc: '批量导入/历史索引可改为 async 提升写入速度（有丢失最近数据风险）',
      current: 'request', suggest: 'async', severity: 'info' });
  }
  return list;
});

/* W4：svLabel 本地三元退役（critical→严重 / warn→警告 / 其余→建议），
 改 import 共享 sevZh（上），文案逐字不变 */
const allChecked = computed(() => recs.value.length > 0 && recs.value.every(r => checked[r.id]));
const hasChecked = computed(() => recs.value.some(r => checked[r.id]));
const checkedCount = computed(() => recs.value.filter(r => checked[r.id]).length);

function toggleAll() {
  const v = !allChecked.value;
  recs.value.forEach(r => { checked[r.id] = v; });
}

/* 生成 PUT body：把 dot-path 还原成嵌套结构 */
const previewBody = computed(() => {
  const body: any = { index: {} };
  recs.value.forEach(r => {
    if (!checked[r.id]) return;
    const parts = r.path.split('.');
    let node: any = body.index;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = r.suggest;
  });
  return JSON.stringify(body, null, 2);
});

async function scan() {
  if (!target.value) return;
  loading.value = true;
  scanErr.value = '';
  try {
    const [s, h] = await Promise.all([
      api.indexSettings(target.value),
      api.clusterHealth().catch(() => null),
    ]);
    snap.value = s;
    dataNodes.value = Number((h as any)?.number_of_data_nodes || 0);
    /* 段数只能从 _cat/indices 拿。用 _settings 返回的物理名去匹配（target 可能是别名）；
 拉不到清单不影响 settings 建议，静默降级。 */
    try {
      const physical = Object.keys(s || {})[0] || target.value;
      const rows = await api.clusterIndices();
      const list = Array.isArray(rows) ? rows : [];
      segRow.value = list.find((r: any) => r?.index === physical)
        || list.find((r: any) => r?.index === target.value) || null;
    } catch { segRow.value = null; }
    if (segAdvice.value) segMaxSegments.value = segAdvice.value.suggestedMaxSegments;
    Object.keys(checked).forEach(k => delete checked[k]);
    recs.value.forEach(r => { checked[r.id] = r.severity !== 'info'; });
    store.notify('success', `扫描完成：${recs.value.length} 条建议`);
  } catch (e: any) {
    /* G6-B8：失败进顶置 err-bar（读链路收敛），不再 snap=null 伪装「尚未扫描」空态（；
 有旧快照时旧数据保留，与 err-bar 并存 */
    scanErr.value = '扫描失败：' + friendlyEsError(String(e?.message ?? e));
    /* A：toast 同步 friendly 口径（err-bar 同源文案） */
    store.notify('error', '扫描失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { loading.value = false; }
}

/* 建议导出 JSON（存档/带出走变更评审）——含当前值/建议值/严重级，可直接贴工单 */
function exportRecs() {
  if (!recs.value.length) return;
  downloadText(
    `index-optimizer-${target.value || 'index'}-${exportStamp()}.json`,
    JSON.stringify({
      index: target.value,
      /* 导出元数据时间戳：exportStamp 本地时（与文件名同源），不用 toISOString 的 UTC */
      exportedAt: exportStamp(),
      suggestions: recs.value.map(r => ({
        id: r.id, key: r.key, title: r.title, desc: r.desc,
        current: r.current, suggest: r.suggest, severity: r.severity,
      })),
    }, null, 2),
    'application/json;charset=utf-8',
  );
  store.notify('success', `已导出 ${recs.value.length} 条优化建议`);
}

async function applyChecked() {
  if (!canApply.value) { store.notify('warning', '应用优化项需索引设置权限'); return; }
  if (!hasChecked.value || applying.value) return;  if (!await askConfirm({
    title: '下发索引优化项',
    message: `将向 /${target.value}/_settings 下发 ${checkedCount.value} 项优化（真实修改线上索引配置，可在热 Setting 页回改）：\n${previewBody.value}`,
    okText: `下发 ${checkedCount.value} 项`,
  })) return;
  /* ：pending 位 + finally 复位——确认后双击/回车重入被拦，in-flight 文案「下发中…」（教训 7 组内口径） */
  applying.value = true;
  try {
    await api.updateIndexSettings(target.value, previewBody.value);
    /* 成功反馈带「去热 Setting 验证」动作（写类视图验证去處收口） */
    store.notify('success', `已应用 ${checkedCount.value} 项优化到 ${target.value}`, {
      duration: 8000,
      action: { label: '去热 Setting 验证', onClick: () => { router.push({ path: '/index-settings', query: { idx: target.value } }); } },
    });
    await scan();
  } catch (e: any) {
    /* A：ES 错误友好化（应用失败原因可读化） */
    store.notify('error', '应用失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { applying.value = false; }
}

/* force_merge：重操作 + 不可逆（5GB 以上的合并结果无法再拆），强制二次确认。
 走 cluster/force-merge（接受任意索引），受管索引专用的 api.forceMerge 不动。 */
async function runForceMerge() {
  if (!canOps.value) { store.notify('warning', 'ForceMerge 需专项角色'); return; }
  const adv = segAdvice.value;
  if (!adv || segMerging.value) return;
  const n = Math.max(1, Math.floor(segMaxSegments.value || 1));
  const gb = (adv.shardSizeBytes / 1024 ** 3).toFixed(1);
  if (!await askConfirm({
    title: '执行 force_merge（重操作，部分不可逆）',
    level: 'critical',
    guardText: target.value,
    okText: `合并到 ${n} 段`,
    message: `将对 /${target.value} 执行 POST _forcemerge?max_num_segments=${n}\n\n`
      + `当前：段总数 ${segStats.value.segmentsCount}，每主分片约 ${adv.segmentsPerShard} 段，每主分片约 ${gb}GB，docs.deleted=${segStats.value.docsDeleted}\n\n`
      + `代价与风险：\n`
      + `· 重写段文件，占用大量磁盘 IO，执行期间该索引搜索延迟升高，大索引可能持续很久且无法中途撤销\n`
      + `· 不可逆：合并产生的大于 5GB 的单段永远不会再被后续 merge 回收，即使其中文档全部被删除也拿不回磁盘\n`
      + `· ES 官方警告：不要对仍在写入的索引执行；请确认该索引已停止写入\n\n`
      + `建议目标段数为 ${adv.suggestedMaxSegments}（按每分片不超过 5GB 推算）。`,
  })) return;
  segMerging.value = true;
  try {
    const r: any = await api.clusterForceMerge(target.value, n);
    /* r.error 分支裸拼后端原文合并 friendlyEsError（同函数 :440 catch 同口径；
 ES 原始 JSON 大块不再直出，单源 utils/esError 提取 reason + 人话映射） */
    if (r?.error) { store.notify('error', 'force_merge 失败：' + friendlyEsError(String(r.message ?? r))); return; }
    /* 纯文本「去任务页看进度」升格 notify action「看任务」（AdhocRebuildView
 confirmSwitch 范式）——一键跳任务页看进度，文本与 action 去重不再双写。
 action 升格 taskId 深链（/tasks?taskId=...）——TasksView 既有
 route.query.taskId 消费（tv-hit 命中行高亮），异步任务树里一眼定位本条，零新契约 */
    store.notify('success', `force_merge 任务已提交：${target.value} → ${n} 段（taskId=${r?.taskId}）`, {
      duration: 12000,
      action: { label: '查看任务树', onClick: () => { router.push({ path: '/tasks', query: { taskId: r?.taskId } }); } },
    });
    await scan();
  } catch (e: any) {
    /* A：ES 错误友好化（force_merge 失败原因可读化） */
    store.notify('error', 'force_merge 失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { segMerging.value = false; }
}

/* 1125：挂载即扫描要过身份门——宿主换 token 的窗口里 probed 未落地，
   旧 target 的索引设置/健康面会先拉回来（结果串到新账号界面）。不放行则挂起补跑。 */
const scanReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('optimizer', store.target));
let scanPending = false;
function bootScan() {
  if (!target.value) return;
  if (!scanReady()) { scanPending = true; return; }
  scanPending = false;
  void scan();
}
onMounted(bootScan);
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target, target.value], () => {
  if (scanPending && scanReady()) bootScan();
});

/* 原始 IO 快查（546/548 同款三件套）——特征 /cluster/index-settings（GET 扫描与
 PUT 下发 update 同族公共前缀，last 取最近一条=「plan/preview」双语义；：同前缀的
 index-settings-defaults（Index Settings 页）记录会互见，记录环近 30 条内本页操作通常最近）；
 判空 rec=null（本页还没扫描/下发过）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/index-settings');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
/* G6-S1：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 亚阶梯(≤3px) / 行级密排不动 */
.io-page { display: flex; flex-direction: column; gap: var(--sp-4); }
/* 只读身份说明条（RestView .rt-perm-note 同款形态；io-page 是 flex gap 布局，下距归零） */
.io-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
.io-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); }
/* W-F：.io-hd-l/.io-hd-ic/.io-hd-tt/.io-hd-sub/.io-hd-r 死规则删除（页头已迁 PageHeader）。
 .io-idx-sel span（「目标索引」标签）与 input（IndexPicker 内框）两条规则随选择器退役清零。
 io-idx-sel 容器框退役（bg+border+radius+框 padding 整块消除，v 约定①）——
 页头动作区本有布局 gap，chip+回填钮条栏直贴；类名保留作模板锚 */
.io-idx-sel { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); }


.io-loading { display: flex; flex-direction: column; gap: var(--sp-2); }

.io-body { display: flex; flex-direction: column; gap: var(--sp-3); }
/* io-cur/io-recs/io-seg 三块大容器框退役（bg+border+radius 整块消除，v 约定①）
 → border-top 分节降层（分界线归 --line，与文件既有 token 同源）；分节间距由 .io-body 的
 flex gap 承接，类名全部保留作模板锚。io-seg 的 border-left accent 语义档保留（只此一条例外） */
.io-cur { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
/* W-F：弱分节标题挂全局 .sec-t，本地排版本地声明退役（口径 B） */
.io-cur-hd { margin-bottom: var(--sp-2); }
.io-cur-sub { font-family: var(--mono); font-weight: 400; color: var(--tx2); }
.io-cur-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--sp-1) var(--sp-3); font-size: var(--fs-xs); }
.io-cur-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed var(--line); }
.io-k { font-family: var(--mono); color: var(--tx2); }
.io-v { font-family: var(--mono); color: var(--tx0); }

.io-recs { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
/* W-F：区块头 600 失序归位 650（口径 B 卡头档） */
.io-recs-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-3); font-size: var(--fs-md); font-weight: 650; }
/* .io-recs-cnt 私造皮（fs-xs+bg2 底胶囊）随改用 StatusPill n 档退役——形态与
 .pill 默认档同形，色板归单源；类名保留作锚 */
.io-recs-r { display: flex; gap: var(--sp-3); align-items: center; }
.io-check-all { font-size: var(--fs-xs); color: var(--tx2); display: flex; gap: var(--sp-1); align-items: center; cursor: pointer; }

/* .io-good 手写空态样式随 EmptyState compact 合并退役（留白归组件单源） */

.io-rec-list { display: flex; flex-direction: column; gap: var(--sp-2); }
.io-rec { padding: var(--sp-3); border-radius: var(--r-s); background: var(--bg2); border-left: 3px solid var(--tx2); }
.io-rec.sv-critical { border-left-color: var(--err); background: var(--err-soft); }
.io-rec.sv-warn { border-left-color: var(--warn); background: var(--warn-soft); }
.io-rec-l { display: flex; align-items: center; gap: var(--sp-2); cursor: pointer; }
/* W-F：.io-rec-tt 原 400 比正文还轻（bug 级）——建议条目标题挂全局 .sec-t（fs-sm/600/tx1）
 归位弱分节档，本地排版退役（口径 B known 项）；仅保留布局 flex */
.io-rec-tt { flex: 1; }
/* W-F：.io-rec-sv 空规则删除（known 项；sv-* 语义子档保留）。
 改用 StatusPill 后 .io-rec-sv 仅作落位锚（pillSingleTrack MERGED 看守），
 原 sv-critical/sv-warn/sv-info 手写文字色档退役——色档归组件 tone 单源（critical→r/warn→y/info→b） */
.io-rec-sv { flex-shrink: 0; }
.io-rec-desc { font-size: var(--fs-xs); color: var(--tx2); margin: var(--sp-1) 0 var(--sp-2) var(--sp-5); }
.io-rec-diff { display: flex; align-items: center; gap: var(--sp-2); margin-left: var(--sp-5); font-family: var(--mono); font-size: var(--fs-xs); }
.io-diff-l b { color: var(--ac-hi); font-weight: 400; }
.io-diff-old { color: var(--tx3); text-decoration: line-through; }
.io-diff-new { color: var(--ok); font-weight: 400; }

.io-seg { border-top: 1px solid var(--line); padding-top: var(--sp-2); border-left: 3px solid var(--warn); }
.io-seg.io-seg-ok { border-left-color: var(--ok); }
.io-seg-hd { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); font-weight: 650; color: var(--tx0); }
.io-seg-tt { flex: 0 0 auto; }
.io-seg-stats { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-4); margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }
.io-seg-stats b { font-family: var(--mono); color: var(--tx0); font-weight: 600; }
.io-seg-desc { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-2); }
.io-seg-warn { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-s); background: var(--warn-soft); color: var(--tx1); font-size: var(--fs-xs); line-height: 1.6; }
.io-seg-warn b { color: var(--warn); }
.io-seg-act { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-top: var(--sp-3); flex-wrap: wrap; }
.io-seg-mx { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); color: var(--tx2); }
.io-seg-in { width: 72px; padding: 3px var(--sp-1h); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); font-family: var(--mono); font-size: var(--fs-xs); }
.io-seg-hint { color: var(--tx3); }

/* 大容器框（bg+border+radius）退役 → io-cur/io-recs 538 同款 border-top 分节；
 io-preview-hd sec-t 行首保，io-preview-code 内容面 bg2 + 240 恒高随 538 锁原样不动 */
.io-preview { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
/* W-F：弱分节标题挂全局 .sec-t（原 tx2 无字重比正文还弱），本地排版退役（口径 B） */
.io-preview-hd { margin-bottom: var(--sp-2); }
.io-preview-code { background: var(--bg2); padding: var(--sp-3); border-radius: var(--r-xs); font-family: var(--mono); font-size: var(--fs-xs); margin: 0; max-height: 240px; overflow-y: auto; color: var(--tx1); }

/* 响应式顺带（responsive900Sweep529 口径：只加 CSS 零结构动、档内非空）——
 本页 .io-page 为单列 flex 无分栏堆叠诉求（1100 档无落点，不造空壳档），900 紧凑档收
 建议行缩进与区块侧距 */
@media (max-width: 900px) {
  .io-rec-desc, .io-rec-diff { margin-left: 0; }
  .io-cur, .io-recs, .io-seg, .io-preview { padding: var(--sp-2) var(--sp-3); }
}
</style>
