<template>
  <div class="df-page">
    <div class="df-hd">
      <PageHeader :icon="FileCode2" title="文档 Diff+Patch 编辑器" subtitle="加载 · 双列 diff · Painless 脚本预览 · PUT 覆盖 / _update partial 二选一">
      <template #actions>
<!-- 原始 IO 快查——本页最近一次文档读（GET /cluster/doc）与写回（putDoc/
 _update）请求/响应原文（ioRecorder 记录环；RemoteClusters 557 铺装面同款；getDoc/putDoc
 同前缀 /cluster/doc，对比面读写一并覆盖） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（文档读写）" title="最近一次文档读取/写回请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
<button v-if="!isCompare" class="btn ghost sm" @click="doFetch" :disabled="!index.trim() || !id.trim() || busy">
  <Download :size="12" :class="{ spinning: busy }" /> {{ busy ? '加载中…' : '加载文档' }}
</button>
<button class="btn ghost sm" @click="doFav" :disabled="!original">
  <Star :size="12" /> 收藏
</button>
      </template>
      </PageHeader>
</div>

    <div class="df-topbar">
      <div class="df-topbar-l">
        <div class="df-field">
          <!-- 主选页内 IndexPicker 退役换只读 CurrentIdxChip——「选索引」唯一
 可写入口收敛顶栏（架构裁决）；useIdxState follow 下行跟随不变。
 对比位 idxB 的 IndexPicker 原样保留（对比目标非「当前工作索引」语义） -->
          <label>index</label>
          <CurrentIdxChip />
        </div>
        <div class="df-field">
          <label>_id</label>
          <!-- G103（铁律 B 高频两跳）：Enter 直达加载/对比，免「填完再去点按钮」第二跳 -->
          <input v-model="id" class="inp" placeholder="文档 ID" @keyup.enter="onIdEnter" /><!-- ：placeholder 中文化 -->
        </div>
        <div class="df-field">
          <label>refresh</label>
          <select v-model="refresh" class="inp">
            <option value="">默认</option>
            <option value="true">true</option>
            <option value="wait_for">wait_for</option>
          </select>
        </div>
      </div>
      <!-- compare 模式：对比索引选择与按钮并入本行（PageHeader + topbar 两行内解决，不再第三条横条） -->
      <div class="df-topbar-r">
        <template v-if="isCompare">
          <label class="df-cmp-lb">对比索引</label>
          <IndexPicker v-model="idxB" placeholder="另一个索引（同 ID）" />
          <button class="btn primary sm" :disabled="!index.trim() || !idxB.trim() || !id.trim() || cmpBusy" @click="fetchCompare">
            <Play :size="12" :class="{ spinning: cmpBusy }" /> {{ cmpBusy ? '对比中…' : '对比' }}
          </button>
          <span class="df-cmp-ro">只读模式 · 不会写回集群</span>
        </template>
        <!-- 手写 df-meta 串改用 MetaStrip 统一件（值亮+标签暗+·分隔） -->
        <MetaStrip v-if="original" :items="dfMetaItems" />
      </div>
    </div>

    <!-- G5-B3：加载失败 err-bar 独立顶置（互斥链外，G2/ 教训）——
 不再仅 toast 后落回「尚未加载文档」伪装空态；doPush 后重取失败时与 df-grid 旧编辑现场并存 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="doFetch" :disabled="busy || !index.trim() || !id.trim()">重试</button>
    </div>

    <!-- W2-3：compare 只读态整块跳过 patch UI（含模式切换与提交按钮），写回入口不进 DOM -->
    <div v-if="isCompare" class="df-card df-cmp">
      <div v-if="cmpErr" role="alert" class="err-bar">
        对比失败：{{ cmpErr }}
        <button class="btn sm ghost" @click="fetchCompare">重试</button>
      </div>
      <template v-else-if="fieldDiffs.length">
        <div class="df-cmp-sum">
          共 <b>{{ fieldDiffs.length }}</b> 个字段 ·
          <span class="df-k-changed">改 {{ cmpSummary.changed }}</span> ·
          <span class="df-k-added">仅 B 有 {{ cmpSummary.added }}</span> ·
          <span class="df-k-removed">仅 A 有 {{ cmpSummary.removed }}</span> ·
          相同 {{ cmpSummary.same }}
        </div>
        <div v-for="d in fieldDiffs" :key="d.path" class="df-cmp-row" :class="'k-' + d.kind">
          <span class="mono df-cmp-path">{{ d.path }}</span>
          <span class="mono df-cmp-l">{{ d.kind === 'added' ? '—' : formatJson(d.left) }}</span>
          <span class="mono df-cmp-r">{{ d.kind === 'removed' ? '—' : formatJson(d.right) }}</span>
        </div>
      </template>
      <EmptyState v-else-if="!cmpBusy" :icon="GitCompareArrows"
                  text="尚未对比"
                  hint="填入两个索引与同一个文档 ID，点「对比」看字段级差异" />
    </div>

    <!-- G5-C4：URL 带齐自动拉取（期间给加载中文案，不闪「尚未加载文档」引导空态（与进行中的事实不符） -->
    <div v-else-if="busy && !original" class="df-loading">正在加载文档…</div>

    <EmptyState v-else-if="!original && !loadErr" :icon="FileCode2"
                text="尚未加载文档"
                hint="填入 index + id，点「加载文档」从 _doc 端点拉取原始版本" />

    <div v-else-if="original" class="df-grid" :style="dfLeftW > 0 ? { '--df-left-w': dfLeftW + 'px' } : undefined">
      <div class="df-card">
        <div class="df-card-hd">
          <span>原始（只读）</span>
          <div style="display:flex;gap:var(--sp-1);align-items:center">
            <!-- 原始栏复制（报障贴原文） -->
            <button aria-label="复制原始 JSON" class="btn ghost xs" @click="copyOriginal" title="复制原始 JSON"><Copy :size="11" /></button>
            <button class="btn ghost xs" @click="revertEdit"><RotateCcw :size="11" /> 还原</button>
          </div>
        </div>
        <!-- 裸 pre → highlightJson 高亮（输出已转义，v-html 安全）；
 resize:vertical 拖完即丢 → qx.taH 范式落盘 df.edH（style min-height
 回灌；原始 pre 自带 resize 柄是双卡唯一拖拽入口，右卡经 grid 同行 stretch 跟随） -->
        <pre class="df-ta ro json-view" :style="{ minHeight: edH }" @pointerup="saveEdH" v-html="originalHtml"></pre>
      </div>
      <!-- W2 批：左右比例可调——中缝 SplitHandle 拖拽（dfLeftW 落 usePref；0=自动等分 1fr），不迁 WorkbenchLayout -->
      <SplitHandle axis="vertical" :size="dfLeftW > 0 ? dfLeftW : 480" :min="220" :max="2000"
        label="原始/编辑后 分栏" class="df-split"
        @resize-end="(s: number) => dfLeftW = clampDfW(s)" @reset="dfLeftW = 0" />
      <div class="df-card">
        <div class="df-card-hd">
          <span>编辑后</span>
          <div class="df-card-hd-r">
            <!-- 编辑稿一键复制（报障/贴工单/带走评审） -->
            <button aria-label="复制编辑后 JSON" class="btn ghost xs" @click="copyEdited" title="复制编辑后 JSON">
              <Copy :size="11" />
            </button>
            <button aria-label="格式化" class="btn ghost xs" @click="prettifyEdit" title="格式化"><AlignLeft :size="11" /></button>
            <span class="df-modif" v-if="isModified">已修改</span>
          </div>
        </div>
        <!-- JsonArea 统一件（裸 textarea 合并）：合法性圆点/格式化/压缩/复制，fill 吃满卡片与左栏等高；
 接字段补全（fields+bodyKind 显式，见 dfEditedAssist 注释）；
 min-height 同 df.edH 键回灌（重进页两卡基线一致；⚠df-ta 系 textarea/
 pre 自渲染面，禁加 height:100%——会锁死 resize 语义） -->
        <JsonArea v-model="editedText" fill class="df-ta-ja" :style="{ minHeight: edH }" :dsl-assist="dfEditedAssist" />
      </div>

      <div class="df-card wide">
        <div class="df-card-hd">
          <span>Diff · <b>{{ diffCount }}</b> 处变更</span>
          <!-- G102（铁律 C 形态枚举一律分段控件）：写回三模式钮由三枚 ghost
 小钮平铺合并 .seg 分段（QRT qrt-view-seg 单源范式），
 role=group+aria-pressed 键盘/读屏可达 -->
          <div class="seg df-mode-seg" role="group" aria-label="写回模式">
            <button type="button" :class="{ on: mode === 'put' }" :aria-pressed="mode === 'put'" @click="mode = 'put'">
              PUT 覆盖
            </button>
            <button type="button" :class="{ on: mode === 'update' }" :aria-pressed="mode === 'update'" @click="mode = 'update'">
              _update partial
            </button>
            <button type="button" :class="{ on: mode === 'script' }" :aria-pressed="mode === 'script'" @click="mode = 'script'">
              Painless script
            </button>
          </div>
        </div>
        <div class="df-diff">
          <div v-for="(l, i) in diffLines" :key="i" class="df-diff-line" :class="l.op" tabindex="0"
               @contextmenu.prevent="openLineMenu($event, l, i)" @keydown="onLineMenuKey($event, l, i)" data-row-nav @keydown.self="rowArrowNav">
            <span class="df-diff-op">{{ l.op === 'add' ? '+' : l.op === 'del' ? '-' : ' ' }}</span>
            <span class="df-diff-tx">{{ l.tx }}</span>
          </div>
          <!-- 无差异占位合并 EmptyState compact（文案逐字保留，容器形态归组件） -->
          <EmptyState v-if="diffLines.length === 0" compact :icon="GitCompareArrows" text="无差异" />
        </div>
        <CellContextMenu v-if="lineMenu" :x="lineMenu.x" :y="lineMenu.y" :title="lineMenu.title"
          :items="lineMenuItems" @close="lineMenu = null" />

        <div class="df-patch">
          <div class="df-patch-hd">
将发送的请求
          <!-- patch 请求体复制（工单/复审） -->
          <button aria-label="复制请求体" class="btn ghost xs" style="margin-left:auto" @click="copyPatch" title="复制请求体"><Copy :size="11" /></button>
        </div>
          <!-- 裸 pre → highlightJson 高亮（首行请求行非 JSON 自然不着色，转义安全） -->
          <pre class="df-code json-view" v-html="patchHtml"></pre>
          <div class="df-patch-btns">
            <button v-if="canWrite" class="btn primary sm" @click="doPush" :disabled="!isModified || pushing">
              <Send :size="12" :class="{ spinning: pushing }" /> {{ pushing ? '提交中…' : (mode === 'put' ? 'PUT 覆盖' : mode === 'update' ? '_update 合并' : '_update 脚本') }}
            </button>
            <span v-else class="dim" style="font-size: var(--fs-xs)">写入需 OPERATOR 及以上角色</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 /cluster/doc 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { FileCode2, Download, Star, RotateCcw, AlignLeft, Send, Play, GitCompareArrows, Copy, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useUrlState, useIdxState, usePref } from '../composables/urlState';
import { askConfirm } from '../composables/confirm';
/* 「编辑后」JsonArea 字段补全字段源（useIndexFields 全站字段源标准） */
import { useIndexFields } from '../composables/useIndexFields';
import { copyText } from '../utils/format';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { lcsDiffLines } from '../utils/lcsDiff'; /* ：LCS 行对齐 diff（下标硬对齐错位放大根治） */
import IndexPicker from '../components/IndexPicker.vue'; /* ：仅对比位 idxB 保留（主选换 CurrentIdxChip） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：主选换只读 chip */
import EmptyState from '../components/EmptyState.vue';
import JsonArea from '../components/JsonArea.vue';
import SplitHandle from '../components/SplitHandle.vue'; /* W2 批：左右分栏拖拽 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：元信息串统一件 */
import { highlightJson } from '../utils/jsonc'; /* ：原始文档/patch 预览高亮 */
import { diffDocFields, diffSummary, type FieldDiff } from '../utils/docDiff';
import { fmtTime } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
import { removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
/* 权限门禁——PUT 覆盖/_update=/cluster/doc(/update)=普通写档（OPERATOR+，文档编辑属角色定义低危写）；
 diff 对比/预览全角色可用 */
const auth = useAuthStore();
const canWrite = computed(() => auth.canEndpoint('write', 'POST', '/internal/es/index/cluster/doc/update', store.target));
/* 目标索引进 URL——刷新/分享链接可复原（可重入）；
 follow 下行跟随顶栏切换（只读对照场景，切索引即跟随不丢现场） */
const index = useIdxState({ follow: true });
/* 文档 id 进 URL（?id=）——收藏重放/分享链接可直达具体文档（可重入） */
const id = useUrlState('id');
const refresh = ref('');
const busy = ref(false);
const pushing = ref(false);
/* G5-B3：加载失败全文（err-bar 独立顶置）——与「尚未加载文档」空态互斥，旧编辑现场保留 */
const loadErr = ref('');
const original = ref<any>(null);
const originalSource = ref<any>({});
/* 草稿治理补全(w24):编辑中稿不丢 */
const editedText = useScopedDraft('edited', { route: 'doc-diff', index: () => index.value }).text;
/* 「编辑后」JsonArea 接字段补全（UpdateByQueryView 三行同款：setup 作用域常量防
 渲染换引用反复重注册 provider；索引含 pattern 时 mappingDetail 失败零降级）。
 文档体非 search 五档，起 bodyKind 显式声明 'doc' 档（此前 'search' 冒充查询体）：
 键位零候选（_source 字段名自由），仅 field 值位白名单出真字段候选 */
const { fields: dfIdxFields, ensure: ensureDfIdxFields } = useIndexFields(() => index.value);
const dfEditedAssist = { fields: () => dfIdxFields.value, bodyKind: () => 'doc' as const };
watch(index, () => { void ensureDfIdxFields(); }, { immediate: true });
const mode = ref<'put' | 'update' | 'script'>('update');

/* W2 批：原始/编辑后左右比例可调（docdiff.leftW，0=自动等分 1fr；usePref 跨会话记忆，
 中缝 SplitHandle 拖拽不迁 WorkbenchLayout） */
const dfLeftW = usePref('docdiff.leftW', 0);
function clampDfW(s: number) { return Math.round(Math.min(2000, Math.max(220, s))); }

/* 双编辑面高度落盘（qx.taH / as.rawH 同范式）——.df-ta/.df-ta-ja 原本固定
 min-height:300px、拖完刷新即丢（全站唯一「可调不落盘」）。pointerup 读实高落盘 usePref
 df.edH，同键回灌两卡 :style min-height（拖拽入口=原始 pre 的 resize:vertical 柄，右卡经
 grid 同行 stretch 跟随；默认空串交回 CSS 300px 兜底，AnalysisSettings as.rawH 同语义） */
const edH = usePref<string>('df.edH', '');
function saveEdH(e: PointerEvent) {
  const h = Math.round((e.currentTarget as HTMLElement).getBoundingClientRect().height);
  if (h > 0) edH.value = h + 'px';
}

/* W2-3：只读对比模式。与可写的 patch 模式互斥——?mode=compare 进入时不渲染任何写回按钮，
 杜绝「本想看差异结果误点了写回」。patch 模式与既有 diffLines 保持原样不动。 */
const viewMode = useUrlState('mode');                  // '' = patch（现状），'compare' = 只读对比
const isCompare = computed(() => viewMode.value === 'compare');
const idxB = useUrlState('b');                          // 对比目标索引
const docB = ref<any>(null);
const cmpBusy = ref(false);
const cmpErr = ref('');

const fieldDiffs = computed<FieldDiff[]>(() =>
  isCompare.value && original.value && docB.value
    ? diffDocFields(originalSource.value, docB.value._source || {})
    : []);
const cmpSummary = computed(() => diffSummary(fieldDiffs.value));

async function fetchCompare() {
  if (!index.value.trim() || !idxB.value.trim() || !id.value.trim()) return;
  /* 切参竞态守卫：Enter 通道无 busy 拦截（高频两跳），发请求前拍三参快照，
   回包落时任一参数已漂移（改 _id 再按 Enter）则整包丢弃——成功/catch/finally
   三支同口径，慢包后到不得把对比结果回跳到旧参数，过期支也不提前熄 spinner */
  const snap = { idx: index.value, b: idxB.value, id: id.value };
  const stale = () => snap.idx !== index.value || snap.b !== idxB.value || snap.id !== id.value;
  cmpBusy.value = true; cmpErr.value = '';
  try {
    const [a, b] = await Promise.all([
      api.getDoc(snap.idx, snap.id),
      api.getDoc(snap.b, snap.id),
    ]);
    if (stale()) return;
    original.value = a; originalSource.value = a._source || {};
    docB.value = b;
  } catch (e: any) {
    if (stale()) return;
    /* 失败要给原因 + 可重试，不要伪装成「无差异」。：并轨 friendlyEsError */
    cmpErr.value = friendlyEsError(String(e?.message ?? e));
    docB.value = null;
  } finally { if (!stale()) cmpBusy.value = false; }
}

async function doFetch() {
  busy.value = true;
  loadErr.value = '';
  try {
    const r = await api.getDoc(index.value, id.value);
    original.value = r;
    originalSource.value = r._source || {};
    editedText.value = JSON.stringify(originalSource.value, null, 2);
    store.notify('success', '文档已加载');
  } catch (e: any) {
    /* G5-B3：失败进独立顶置 err-bar（读链路 friendlyEsError 收敛，对齐 SlmView B2）——
 不再仅 toast 后落回「尚未加载文档」伪装空态（ 同源） */
    loadErr.value = '文档加载失败：' + friendlyEsError(String(e?.message ?? e));
    /* toast 同源并轨 friendlyEsError（与上行 loadErr 同口径） */
    store.notify('error', '加载失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

/* G103（铁律 B）：_id 输入 Enter 直达——与加载/对比按钮同守卫口径
 （条件不满足静默让路，不发无效请求；compare 分支走 fetchCompare 双拉） */
function onIdEnter() {
  if (isCompare.value) { void fetchCompare(); return; }
  if (index.value.trim() && id.value.trim() && !busy.value) void doFetch();
}

function formatJson(v: any): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
function revertEdit() { editedText.value = formatJson(originalSource.value); }
function prettifyEdit() {
  try { editedText.value = JSON.stringify(JSON.parse(editedText.value), null, 2); }
  catch (e: any) { store.notify('error', 'JSON 错误：' + e.message); }
}

/* 编辑稿一键复制（报障/贴工单/带走评审） */
/* 原始栏/patch 请求体复制（诚实口径）。
 z5 轮修复：originalSource 是 ref，script 中无模板自动解包——原样传入 formatJson
 复制到的是对象内部结构垃圾（实测剪贴板为 [object Object] 一类），必须 .value */
async function copyOriginal() {
  const ok = await copyText(formatJson(originalSource.value));
  store.notify(ok ? 'success' : 'error', ok ? '原始 JSON 已复制' : '复制失败');
}
function copyPatch() {
  copyText(patchPreview.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '请求体已复制' : '复制失败'));
}
async function copyEdited() {
  const ok = await copyText(editedText.value || '');
  store.notify(ok ? 'success' : 'error', ok ? '编辑后 JSON 已复制' : '复制失败');
}

const editedSource = computed<any>(() => {
  try { return JSON.parse(editedText.value); } catch { return null; }
});
const isModified = computed(() => editedSource.value !== null && JSON.stringify(editedSource.value) !== JSON.stringify(originalSource.value));

/* ·实报「只改一个字段变更超多」：原按下标逐行硬对齐在任意位置插入/删除
 一行后全部下标错位，一行真实变更放大成整篇 -/+（实报 24 处变更）。改 LCS 行对齐：
 内容相同的行跨位置对齐为 eq，只有真实增删出 del/add（lcsDiff.ts 单源纯函数）。 */
const diffLines = computed<Array<{ op: 'add' | 'del' | 'eq'; tx: string }>>(() => {
  if (!editedSource.value) return [];
  return lcsDiffLines(formatJson(originalSource.value).split('\n'), formatJson(editedSource.value).split('\n'));
});
/* G100：头计数只计真实增删行—— LCS 化后 diffLines 语义为全行
 （eq 混入），沿用其 length 会把未编辑文档显示成「9 处变更」（语义失真， 实锚） */
const diffCount = computed(() => diffLines.value.filter(l => l.op !== 'eq').length);

/* ═══ 差分行右键（此前整块只能靠"复制请求体"，单行无从取用）═══
 一级 = 2 个高频 + 1 个分组父项（项目右键约定）；写操作（提交/覆盖）**刻意不进右键**——
 那是页面上带确认语义的主按钮，不该藏在右键里被误触。 */
const lineMenu = ref<{ x: number; y: number; title: string; line: { op: 'add' | 'del' | 'eq'; tx: string }; idx: number } | null>(null);
function onLineMenuKey(e: KeyboardEvent, l: { op: 'add' | 'del' | 'eq'; tx: string }, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  const opZh = l.op === 'add' ? '新增' : l.op === 'del' ? '删除' : '未变';
  lineMenu.value = { ...menuKeyAnchor(e), title: opZh + ' · 第 ' + (i + 1) + ' 行', line: l, idx: i };
}
function openLineMenu(e: MouseEvent, l: { op: 'add' | 'del' | 'eq'; tx: string }, i: number) {
  const opZh = l.op === 'add' ? '新增' : l.op === 'del' ? '删除' : '未变';
  lineMenu.value = { x: e.clientX, y: e.clientY, title: opZh + ' · 第 ' + (i + 1) + ' 行', line: l, idx: i };
}
const lineMenuItems = computed<CcmItem[]>(() => {
  const m = lineMenu.value;
  if (!m) return [];
  const changed = diffLines.value.filter(l => l.op !== 'eq');
  return [
    { key: 'copyLine', label: '复制此行文本', run: () => { void copyText(m.line.tx); } },
    {
      key: 'more', label: '更多…', children: [
        { key: 'copyWithOp', label: '复制带 +/- 前缀', run: () => { void copyText((m.line.op === 'add' ? '+ ' : m.line.op === 'del' ? '- ' : '  ') + m.line.tx); } },
        { key: 'copyAllChanged', label: '复制全部变更行（' + changed.length + '）', run: () => { void copyText(changed.map(l => (l.op === 'add' ? '+ ' : '- ') + l.tx).join('\n')); } },
        { key: 'copyEdited', label: '复制整份修改后 JSON', run: () => { void copyText(editedText.value || ''); } },
      ],
    },
  ];
});

function diffToScript(): string {
  if (!editedSource.value) return '';
  const diffs: string[] = [];
  const orig = originalSource.value || {};
  const upd = editedSource.value;
  for (const k of Object.keys(upd)) {
    if (JSON.stringify(orig[k]) !== JSON.stringify(upd[k])) {
      diffs.push(`ctx._source['${k}'] = params['${k}'];`);
    }
  }
  for (const k of Object.keys(orig)) {
    if (!(k in upd)) diffs.push(`ctx._source.remove('${k}');`);
  }
  return diffs.join('\n');
}

/* URL 带齐 idx+id（收藏重放/分享直达）时自动拉取，免一次手动点击。
   1125：与 DslQuery autoRunAllowed 同口径——宿主换 token 的窗口里 probed 未落地，
   旧 target 的文档会先拉回来（403 噪声 + 结果串到新账号界面）；不放行就挂起，身份落地补跑。 */
const docReadAllowed = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('doc-diff', store.target));
let mountReadPending = false;
function mountAutoRead() {
  const carry = sessionStorage.getItem('esquerystudio.doc-diff.carry.source');
  removeStoredRaw(sessionStorage, 'esquerystudio.doc-diff.carry.source');
  if (!docReadAllowed()) { mountReadPending = true; return; }
  mountReadPending = false;
  if (isCompare.value) { fetchCompare(); return; }   // 只读对比走独立拉取，不碰 patch 的编辑稿恢复
  if (index.value.trim() && id.value.trim()) {
    doFetch().then(() => {
      if (carry) {
        editedText.value = carry;
        store.notify('success', '已恢复收藏时的编辑稿，下方可对比与线上最新版的差异');
      }
    });
  }
}
onMounted(mountAutoRead);
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (mountReadPending && docReadAllowed()) mountAutoRead();
});

const patchPreview = computed(() => {
  if (!editedSource.value) return '<invalid JSON>';
  if (mode.value === 'put') {
    return `POST /cluster/doc?index=${index.value}&id=${id.value}${refresh.value ? '&refresh=' + refresh.value : ''}\n\n` + formatJson(editedSource.value);
  } else if (mode.value === 'update') {
    return `POST /cluster/doc/update?index=${index.value}&id=${id.value}${refresh.value ? '&refresh=' + refresh.value : ''}\n\n` + formatJson({ doc: editedSource.value });
  } else {
    return `POST /cluster/doc/update?index=${index.value}&id=${id.value}${refresh.value ? '&refresh=' + refresh.value : ''}\n\n` + formatJson({
      script: { lang: 'painless', source: diffToScript(), params: editedSource.value },
    });
  }
});

/* 原始文档 / patch 请求体裸 pre → highlightJson 高亮（输出已转义，v-html 安全） */
const originalHtml = computed(() => highlightJson(formatJson(originalSource.value)));
const patchHtml = computed(() => highlightJson(patchPreview.value));
/* 手写 df-meta 串 → MetaStrip items（version/seq_no/pt 三段全保留）；
 G101（铁律 F）：三段补段级中文 tip（裸英文 label 用户不可解，
 G55/G60/G74/G79/ 同族；tip 走 :title 悬停通道+help 档，不进可见文本） */
const dfMetaItems = computed<MetaStripItem[]>(() => original.value ? [
  { value: original.value._version ?? '-', label: 'version', tip: '版本号' },
  { value: original.value._seq_no ?? '-', label: 'seq_no', tip: '乐观锁序号' },
  { value: original.value._primary_term ?? '-', label: 'pt', tip: '主分片任期' },
] : []);

async function doPush() {
  /* 权限执行体首行门（按钮已有 v-if，此处覆盖键盘/程序化通道） */
  if (!canWrite.value) { store.notify('warning', '提交文档变更需 OPERATOR 及以上角色'); return; }
  /* 2.1.6：执行体防重 */
  if (pushing.value) return;
  if (!editedSource.value) return;
  if (!await askConfirm({
    title: '提交文档变更',
    message: `将对「${index.value}」/「${id.value}」提交 ${mode.value} 变更，直接覆盖线上文档内容，旧值不会保留副本。`,
    okText: '提交变更',
  })) return;
  pushing.value = true;
  try {
    if (mode.value === 'put') {
      await api.putDoc(index.value, id.value, JSON.stringify(editedSource.value), refresh.value || undefined);
    } else if (mode.value === 'update') {
      await api.updateDoc(index.value, id.value, JSON.stringify({ doc: editedSource.value }), refresh.value || undefined);
    } else {
      await api.updateDoc(index.value, id.value, JSON.stringify({
        script: { lang: 'painless', source: diffToScript(), params: editedSource.value },
      }), refresh.value || undefined);
    }
    store.notify('success', '已提交，正在重取…');
    await doFetch();
  } catch (e: any) {
    /* 裸错误串并轨 friendlyEsError */
    store.notify('error', '提交失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { pushing.value = false; }
}

function doFav() {
  store.addFavorite({
    kind: 'rest', title: `Doc ${index.value}/${id.value}`,
    subtitle: `edit @ ${fmtTime(Date.now())}`,
    payload: { index: index.value, id: id.value, source: editedText.value }, tags: ['doc'],
  });
  store.notify('success', '已收藏');
}

/* 原始 IO 快查（546/548 同款三件套）——特征 /cluster/doc（getDoc 读取与
 putDoc/updateDoc 写回同前缀，对比面读写一并覆盖；getDoc 亦为 DslQueryView 等共用出口，
 跨页互见）；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/doc');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

watch(() => store.pickedIdx, (v) => { if (v && !index.value) index.value = v; });
</script>

<style scoped>
/* 页面转 flex 纵向并吃满可滚区——Diff/code 区由此获得「剩余视口」弹性；
 内容主导（不满视口）时各块仍按内容高，滚动职责不变 */
.df-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); display: flex; flex-direction: column; min-height: 100%; }
.df-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* .df-hd-l/-ic/-tt/-sub/-r 死规则退役（页头早已由 PageHeader 接管，模板 grep 0 引用） */
/* 轨4：df-topbar 工具条壳三件套（bg+border+radius+padding）退役（538 cv-import
 同语言：flex 布局三件与 gap/margin 间距载体原样，内容直贴，与 df-card 540 直贴形态对齐） */
.df-topbar { display: flex; justify-content: space-between; align-items: end; gap: var(--sp-2) var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.df-topbar-l { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
.df-topbar-r { display: flex; gap: var(--sp-2) var(--sp-3); align-items: center; flex-wrap: wrap; justify-content: flex-end; min-width: 0; }
.df-field { display: flex; flex-direction: column; gap: 3px; }
/* 同行控件高度统一（实报「大小不一致高度」）：IndexPicker 的 ixp-box 自带 padding 略矮于全局 .inp，
 对齐到同一高度基线；label 行高归一。 */
.df-field :deep(.ixp-box) { min-height: 31px; box-sizing: border-box; }
.df-field > label { line-height: 17px; }
.df-field label { font-size: var(--fs-xs); color: var(--muted); }
.inp { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-xs); padding: 5px var(--sp-2); font-size: var(--fs-sm); color: var(--fg); }
/* .df-meta 随元信息串 MetaStrip 化退役（MetaStrip 自带 mono/字号/分隔） */
/* grid 行改 auto+minmax(0,1fr)——第二行 wide 卡吃页面余高，首行两卡仍按内容；
 min-height:0 传递防 1fr 行被内容撑破。
 W2 批：左右比例可调——中缝 11px SplitHandle 占位列，左宽走 --df-left-w（默认 1fr 等分） */
.df-grid { display: grid; grid-template-columns: var(--df-left-w, 1fr) 11px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: var(--sp-3); flex: 1 1 auto; min-height: 0; }
/* 双栏等高：卡片 flex 纵向，编辑区 flex:1 吃满——grid 同行取最高者，两卡片永远对称（实报「与左侧大小不一致」）。
 工作台分节壳（bg+border+radius）退役（四刀约定③④）——内容直贴，分界由 .df-card-hd
 既有 border-bottom 承接（SqlBridge 535 先例）；flex column/overflow 布局骨架逐字保留（等高双栏
 与收缩防撑破是结构语义非 chrome），代码内容面 code-bg 按 .br-err-pre 先例保留 */
.df-card { overflow: hidden; display: flex; flex-direction: column; }
.df-card.wide { grid-column: 1 / -1; min-height: 0; }
.df-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; flex: none; }
.df-card-hd-r { display: flex; gap: var(--sp-1); align-items: center; }
.df-modif { font-size: var(--fs-xs); padding: 1px var(--sp-1h); background: var(--warn-soft); color: var(--warn); border-radius: 3px; }
.df-ta { width: 100%; flex: 1 1 auto; padding: var(--sp-2h) var(--sp-3); font-family: var(--mono); font-size: var(--fs-sm); line-height: 1.5; background: var(--code-bg); color: var(--fg); border: 0; resize: vertical; box-sizing: border-box; outline: none; min-height: 300px; margin: 0; }
/* JsonArea 统一件落位：fill 吃满卡片剩余高（对齐原 textarea flex 拉伸），保底高同原 .df-ta。
 .ja 编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——分界由 df-card-hd 既有 border-bottom 承接（约定）；组件本体零触。
 ⚠df-ta-ja 类挂在 JsonArea 根（与 .ja 同元素），故选容器 .df-card 选面 */
.df-ta-ja { min-height: 300px; }
.df-card :deep(.ja) { border: none; border-radius: 0; }
.df-ta.ro { color: var(--muted); overflow: auto; /* 复审 M4：只读 pre 长行 JSON 无滚动策略会被 .df-card overflow:hidden 裁断不可达 */ }
/* diff 区去 250px 封顶——flex 吃 wide 卡余高（收缩时 min-height:0+overflow 内滚）；
 窄屏断点（高度链不成立）回退原封顶，见文件尾媒体查询 */
.df-diff { padding: var(--sp-3); font-family: var(--mono); font-size: var(--fs-xs); flex: 1 1 auto; min-height: 0; overflow: auto; }
.df-diff-line { padding: 1px var(--sp-1); white-space: pre; }
.df-diff-line.add { background: var(--ok-soft); color: var(--ok); }
.df-diff-line.del { background: var(--err-soft); color: var(--err); }
.df-diff-op { display: inline-block; width: 12px; opacity: .6; }
/* .df-diff-empty 裸空态随「无差异」合并 EmptyState compact 退役，留白归组件 */
/* patch 区转 flex 纵向——df-code 由「200px 封顶」改吃 patch 区余高 */
.df-patch { padding: var(--sp-3); border-top: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.df-patch-hd { font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--sp-2); }
.df-code { font-size: var(--fs-xs); padding: var(--sp-3); background: var(--code-bg); border-radius: var(--r-xs); margin: 0; flex: 1 1 auto; min-height: 0; overflow: auto; }
.df-patch-btns { text-align: right; margin-top: var(--sp-3); }
/* G102：写回三模式钮的旧选中态规则随 seg 分段合并退役——
 模板 0 引用（选中态由 .seg button.on 全局基类承接） */

/* W2-3：只读跨索引对比（控件并入 df-topbar 同行，见模板） */
.df-cmp-lb { font-size: var(--fs-xs); color: var(--muted); }
.df-cmp-ro { font-size: var(--fs-xs); color: var(--muted); }
.df-cmp { padding: var(--sp-3); }
.df-cmp-sum { font-size: var(--fs-sm); color: var(--muted); padding-bottom: var(--sp-2); margin-bottom: var(--sp-2); border-bottom: 1px solid var(--border); }
.df-k-changed { color: var(--warn); }
.df-k-added { color: var(--ok); }
.df-k-removed { color: var(--err); }
.df-cmp-row { display: grid; grid-template-columns: minmax(140px, 1fr) 2fr 2fr; gap: var(--sp-2); padding: 3px var(--sp-1h); font-size: var(--fs-xs); border-radius: 3px; align-items: start; }
.df-cmp-row .mono { font-family: var(--mono); white-space: pre-wrap; word-break: break-all; }
.df-cmp-path { color: var(--fg); }
.df-cmp-l, .df-cmp-r { color: var(--muted); }
.df-cmp-row.k-changed { background: var(--warn-soft); }
.df-cmp-row.k-added { background: var(--ok-soft); }
.df-cmp-row.k-removed { background: var(--err-soft); }
/* G5-C3：本地 scoped .err-bar 删除——统一走 theme.css 全局 .err-bar（ 同类交互同类形态） */

/* G5-C4：自动拉取加载中——留白节奏对齐 EmptyState（手动工作台从简，不造骨架） */
.df-loading { padding: 34px var(--sp-4); text-align: center; color: var(--muted); font-size: var(--fs-sm); }

/* G5-B4： 实测 iframe 可用宽 ~866px，双栏在此挤压（Bulk 批 12b 同款硬伤）。
 断点归一 标准值 1100（堆叠语义）；对比条同宽换行防横向溢出。
 注：本页双栏为 pre/textarea 自渲染 diff（非 Monaco），无需 AnalyzeView 的编辑器定高修法 */
@media (max-width: 1100px) {
  .df-grid { grid-template-columns: minmax(0, 1fr); }
  /* W2 批：堆叠态拖拽柄隐藏 */
  .df-split { display: none; }
  /* 堆叠态高度链不成立（各卡按内容排布）——diff/code 回退原封顶值兜底，
 防长 diff/patch 在无余高可吃的堆叠布局里无限撑高页面 */
  .df-grid { grid-template-rows: auto; }
  .df-diff { max-height: 250px; flex: none; }
  .df-code { max-height: 200px; flex: none; }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——双编辑器堆叠已由
 1100 档合并，此处收页侧距 + 只读对比条三列改纵排（140px 键列下限在窄视口挤爆值列） */
@media (max-width: 900px) {
  .df-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); } /* ：10px → var(--sp-2h) 精确等值收口 */
  .df-cmp-row { grid-template-columns: minmax(0, 1fr); }
}
</style>
