<template>
  <div class="md-page">
    <!-- 统一页头：PageHeader 组件（.ph 系列），本地 .md-hd/.md-hd-l/.md-hd-ic/.md-hd-tt/.md-hd-sub 已删
 （页头右组 flex 修饰规则亦随 死样式清理退役；.md-inp 随页内选择器退役删除） -->
    <PageHeader :icon="FolderTree" title="Mapping 设计器" subtitle="字段树可视化 · nested/object 分层 · multi-fields 展开 · 加字段向导">
        <template #actions>
<!-- 页内 IndexPicker 退役换只读 CurrentIdxChip——「选索引」唯一可写入口收敛
 顶栏（架构裁决）；useIdxState follow 下行跟随不变，watch(index) 自动加载字段树语义不变 -->
<CurrentIdxChip />
  <button class="btn ghost sm" @click="doLoad" :disabled="!index || busy">
    <RefreshCw :size="12" :class="{ spinning: busy }" /> 加载
  </button>
  <button v-if="canOps" class="btn primary sm" @click="showAdd = true" :disabled="!tree.length">
    <Plus :size="12" /> 加字段
  </button>
  <!-- 原始 IO 快查——本页最近一次 mapping-put 写入请求/响应原文（ioRecorder 记录环；
 GET mapping-detail 被 IndexHub/AnalyzerLab 污染，特征走写通道独占） -->
  <button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（Mapping 设计器）" title="最近一次 mapping 写入请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
    <Terminal :size="12" /> 原始 IO
  </button>
        </template>
      </PageHeader>

    <!-- 只读身份的前置说明：加字段钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="md-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：加字段不可用；需要集群 mapping 写权限。
    </div>

    <!-- 五格 md-stat 收敛 MetaStrip 统一件（值亮+标签暗+·分隔；nested 计数 tone:warn 承接原 .md-stat.warn） -->
    <MetaStrip v-if="stats.total" class="md-strip" :items="statItems" />

    <div class="md-grid">
      <div class="md-card">
        <div class="md-card-hd card-t">字段树</div>
        <div class="md-tree" role="tree" aria-label="字段树">
          <MappingNode v-for="n in tree" :key="n.name" :node="n" :prefix="''" @pick="pickField" @ctx="openFieldMenu" />
          <!-- 加载中/失败/未加载三态分明；loading 位走 SkeletonBox 骨架（不复用空态文案/类名）。
 md-empty 裸 div 换 EmptyState compact 统一件（分支顺序与文案语义原样保留，
 mappingEmptyState 契约同步更新） -->
          <div v-if="!tree.length && busy" class="md-loading">
            <SkeletonBox v-for="i in 6" :key="i" height="20px" round />
          </div>
          <EmptyState v-else-if="!tree.length && loadErr" compact :icon="ShieldAlert" :text="'加载失败：' + loadErr">
            <button class="btn ghost sm" @click="doLoad">重试</button>
          </EmptyState>
          <!-- 两处空态补 actionText 三件套（action 接现成 doLoad；失败档已有插槽重试钮不动） -->
          <EmptyState v-else-if="!tree.length && loaded" compact :icon="FolderTree"
            text="索引无字段或不存在 · 检查 index 名称后重新「加载」" action-text="重新加载" @action="doLoad" />
          <EmptyState v-else-if="!tree.length" compact :icon="RefreshCw" text="未加载 · 输入 index 并点击「加载」" action-text="立即加载" @action="doLoad" />
        </div>
      </div>

      <div class="md-card">
        <div class="md-card-hd card-t">
          <span>字段详情</span>
          <span v-if="picked" class="md-meta">{{ picked.name }}</span>
        </div>
        <!-- 详情空占位换 EmptyState compact 统一件 -->
        <EmptyState v-if="!picked" compact :icon="ChevronRight" text="选中字段查看详情" />
        <div v-else class="md-detail">
          <!-- 九行 md-kv 键值行合并 MetaStrip mini 档（550 sv-repo-meta 先例：
 值亮+标签暗+·分隔）——纯值对六段入 items（pickedMeta）；类型 mft-type 色卡 chip
 （theme.css .chip mono 全局单源消费豁免）、copy_to 高亮块、multi-fields chip 列
 三段富内容非纯值形态，走默认插槽承接（共享分隔节奏）；.md-kv 私造行样式同步更新删除 -->
          <MetaStrip class="md-kvs" :items="pickedMeta">
            <span class="ms-i"><span class="chip mono mft-type" :data-t="picked.type">{{ picked.type }}</span><i>类型</i></span>
            <span v-if="picked.copyTo" class="ms-i"><code class="md-code-block" v-html="copyToHtml"></code><i>copy_to</i></span>
            <span v-if="picked.multiFields" class="ms-i md-mf">
              <span v-for="mf in picked.multiFields" :key="mf.name" class="md-mf-i"><code>{{ mf.name }}</code>: <span class="chip mono mft-type" :data-t="mf.type">{{ mf.type }}</span></span>
              <i>multi-fields</i>
            </span>
          </MetaStrip>
        </div>
      </div>
    </div>

    <!-- 加字段弹窗 -->
    <div v-if="showAdd" class="md-modal" @click.self="showAdd = false">
      <div class="md-mo-b" ref="modalRef">
        <div class="md-mo-hd">
          <Plus :size="14" /> 新增字段
          <button class="btn ghost xs md-close" @click="showAdd = false">×</button>
        </div>
        <div class="md-mo-body">
          <div class="md-warn">
            <ShieldAlert :size="12" /> ES 硬性约束：只能<b>加</b>字段，不能改类型 / 删字段（需 reindex）。加错也不可撤销。
          </div>
          <label class="md-lb"><span>字段路径</span>
            <input v-model="newPath" class="md-ii" placeholder="user.address.city（嵌套用点分）" />
          </label>
          <label class="md-lb"><span>类型</span>
            <select v-model="newType" class="md-ii">
              <option v-for="t in TYPES" :key="t">{{ t }}</option>
            </select>
          </label>
          <label v-if="newType === 'text'" class="md-lb"><span>analyzer</span>
            <!-- 两 analyzer 位挂 datalist 候选（dslCompletionContext BUILTIN_ANALYZERS
 内置九项只读消费，AnalyzerLabView 同表先例；analyzer/search_analyzer 同候选域共享一张表） -->
            <input v-model="newAnalyzer" class="md-ii" placeholder="standard / ik_max_word / ik_smart" list="md-analyzer-opts" />
          </label>
          <label v-if="newType === 'text'" class="md-lb"><span>search_analyzer</span>
            <input v-model="newSearchAnalyzer" class="md-ii" placeholder="留空即同 analyzer" list="md-analyzer-opts" />
          </label>
          <datalist id="md-analyzer-opts"><option v-for="a in BUILTIN_ANALYZERS" :key="a" :value="a" /></datalist>
          <label v-if="newType === 'text'" class="md-lb"><span>加 .keyword 子字段</span>
            <input type="checkbox" v-model="newAddKeyword" />
          </label>
          <label class="md-lb"><span>额外 JSON（可选，覆盖）</span>
            <!-- 接 dsl-assist（字段定义片段非 search body，fields 空数组——补全按通用检查降级）；
 bodyKind 显式 'mapping'（MonacoEditor 缺省 ?? 'search' 冒充查询体——
 字段定义就是 mapping 语义，键位出 properties/dynamic/type 等 mapping 目录） -->
            <!-- P1-1：档路由静态 lint 划线挂点（lintMappingBody，见 script queueMdLintMarkers） -->
            <JsonArea ref="mdJaRef" v-model="newExtra" :dsl-assist="{ fields: () => [], bodyKind: () => 'mapping' }" :rows="3" placeholder="{&quot;index&quot;:true,&quot;null_value&quot;:&quot;N/A&quot;}" />
          </label>
          <div class="md-preview">
            <div class="md-preview-hd">最终 PUT body 预览</div>
            <!-- previewBody（已 pretty）走 highlightJson 高亮（转义安全 v-html） -->
            <pre class="json-view" v-html="highlightJson(previewBody)"></pre>
          </div>
        </div>
        <div class="md-mo-ft">
          <button class="btn ghost sm" @click="showAdd = false">取消</button>
          <button v-if="canOps" class="btn primary sm" @click="doAdd" :disabled="!newPath || busy">
            <Send :size="12" /> 提交
          </button>
        </div>
      </div>
    </div>
    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 mapping-put 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
  <!-- 1344：字段树行右键 -->
  <CellContextMenu v-if="fieldMenu" :x="fieldMenu.x" :y="fieldMenu.y" :title="'字段 · ' + fieldMenu.node.name"
    :items="fieldMenuItems" @close="fieldMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, h, defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import { fmtNum, copyText } from '../utils/format';
import { FolderTree, RefreshCw, Plus, Send, Shield, ShieldAlert, ChevronRight, ChevronDown, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { trapTabKey } from '../utils/focusTrap';
import { MAPPING_TYPES } from '../utils/dslCompletionContext';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* ：权限写门真源（令直接补刀） */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIdxState } from '../composables/urlState';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import JsonArea from '../components/JsonArea.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { lintMappingBody } from '../utils/dslLint'; /* P1-1：档路由静态 lint */
import { BUILTIN_ANALYZERS } from '../utils/dslCompletionContext'; /* ：加字段弹窗 analyzer 族 datalist 候选源（共享表只读消费） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P1-1：划线防抖统一件 */
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue'; /* ：md-empty 裸空态统一件 */
/* 五格统计合并 MetaStrip 统一件 + highlightJson 高亮 + loadErr 友好化 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import { highlightJson } from '../utils/jsonc';
import { friendlyEsError } from '../utils/esError';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';

const store = useAppStore();
const auth = useAuthStore();
/* 添加字段走 POST /cluster/mapping-put（rank3 写端点）——VIEWER 不显示写入口 */
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/mapping-put', store.target)); /* ：端点级连接感知 */
/* 原始 IO 快查（546 六页同款三件套）——/cluster/mapping-put 写通道独占；
 判空 rec=null（本页还没提交过加字段）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/mapping-put');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
/* 目标索引进 URL——刷新/分享链接可复原（可重入）。
 follow 下行跟随顶栏切换（同 BoostTunerView）；onMounted 时若已有索引（深链 ?idx= 或顶栏已选）
 自动加载字段树，兑现「可复原」承诺——此前深链进来只回填选择器、不拉数据 */
const index = useIdxState({ follow: true });
onMounted(() => { if (index.value) doLoad(); });
watch(index, v => { if (v) doLoad(); }); // 顶栏 follow 切换时同步重载字段树，防树是 A、写入 B
const tree = ref<any[]>([]);
const stats = ref<any>({});
const picked = ref<any>(null);
const busy = ref(false);
const loadErr = ref('');
/* 区分「从未加载」与「加载成功但索引无字段」——后者再显「未加载」会误导用户 */
const loaded = ref(false);
const showAdd = ref(false);
const modalRef = ref<HTMLElement | null>(null);
/* -A3：键盘契约——Escape 关 + Tab 焦点陷阱（ConfirmModal 同款范式） */
function onModalKey(e: KeyboardEvent) {
  if (!showAdd.value) return;
  if (e.key === 'Escape') { showAdd.value = false; return; }
  if (modalRef.value) trapTabKey(modalRef.value, e);
}
window.addEventListener('keydown', onModalKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onModalKey));
const newPath = ref('');
const newType = ref('keyword');
const newAnalyzer = ref('');
const newSearchAnalyzer = ref('');
const newAddKeyword = ref(true);
/* 草稿：新增字段参数草稿（按 集群/索引 隔离——写类视图） */
const newExtra = useScopedDraft('new-extra', {
  route: 'mapping-designer',

  index: () => index.value,
}).text;

/* P1-1：档路由静态 lint（划线通道）——lintMappingBody 直接 import 纯函数消费
 （DevTools dtLint 档路由同源）；非法 JSON 静默返 []，setMarkers([]) 即清旧划线
 （DevTools 同契约）。零请求、零阻塞（apply 门仍是既有链路）。 */
const mdJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueMdLintMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintMappingBody> = [];
  try { findings = lintMappingBody(JSON.parse(newExtra.value || '')); } catch { findings = []; }
  mdJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(newExtra, () => { queueMdLintMarkers(); }, { immediate: true });

/* 类型下拉吃 dslCompletionContext.MAPPING_TYPES 单源（与补全/lint 同一目录）——
   此前本页另抄 24 项，还包含并不存在的裸 `range`（选了就产 ES 400 的非法 mapping）。 */
const TYPES = MAPPING_TYPES;

/* 递归子组件：字段节点 */
const MappingNode: any = defineComponent({
  name: 'MappingNode',
  props: { node: { type: Object, required: true }, prefix: { type: String, default: '' } },
  emits: ['pick', 'ctx'],
  setup(props, { emit }) {
    const open = ref(true);
    /* 字段行键盘：菜单键/Shift+F10 开同一菜单，Enter/Space 等价点选，
       方向键在整棵字段树的可见行间移动（嵌套树按扁平 DOM 序）。 */
    const onNodeKey = (e: KeyboardEvent, n: any, full: string, hasChild: boolean) => {
      if (isMenuKey(e)) {
        e.preventDefault();
        const at = menuKeyAnchor(e);
        emit('ctx', { ev: { clientX: at.x, clientY: at.y } as MouseEvent, node: { ...n, name: full } });
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        emit('pick', { ...n, name: full });
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && hasChild) {
        e.preventDefault(); e.stopPropagation();
        open.value = e.key === 'ArrowRight';
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const host = (e.currentTarget as HTMLElement).closest('.md-tree');
      if (!host) return;
      const rows = [...host.querySelectorAll<HTMLElement>('.md-node')];
      const cur = rows.indexOf(e.currentTarget as HTMLElement);
      if (cur < 0) return;
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      e.preventDefault();
      rows[next]?.focus();
    };
    return () => {
      const n: any = props.node;
      const full = props.prefix ? props.prefix + '.' + n.name : n.name;
      const hasChild = !!(n.children && n.children.length);
      const cls = 'md-node t-' + n.type;
      return h('div', { class: 'md-branch' }, [
        /* 1344：字段行右键——字段**全路径**（含嵌套前缀）是这页最常被拿走的东西：
           贴进 DSL/查询、贴进 PUT mapping、发给同事。点选只喂「新建字段」表单，拿不到路径。 */
        h('div', { class: cls, onClick: () => emit('pick', { ...n, name: full }),
          tabindex: '0', role: 'treeitem', 'aria-level': String(full.split('.').length),
          ...(hasChild ? { 'aria-expanded': String(open.value) } : {}),
          'aria-label': '字段 ' + full,
          onKeydown: (e: KeyboardEvent) => onNodeKey(e, n, full, hasChild),
          onContextmenu: (e: any) => { e.preventDefault(); e.stopPropagation(); emit('ctx', { ev: e, node: { ...n, name: full } }); } }, [
          hasChild ? h('span', { class: 'md-caret', onClick: (e: any) => { e.stopPropagation(); open.value = !open.value; } },
            [h(open.value ? ChevronDown : ChevronRight, { size: 11 })]) : h('span', { class: 'md-caret-pl' }),
          h('span', { class: 'md-nm' }, n.name),
          h('span', { class: 'md-tp' }, n.type || 'unknown'),
          n.isNested ? h('span', { class: 'md-badge nested' }, 'nested') : null,
          n.multiFields ? h('span', { class: 'md-badge mf' }, n.multiFields.length + ' mf') : null,
          n.analyzer ? h('span', { class: 'md-badge an' }, n.analyzer) : null,
        ]),
        hasChild && open.value
          ? h('div', { class: 'md-children', role: 'group' }, n.children.map((c: any) =>
              h(MappingNode, { node: c, prefix: full, onPick: (v: any) => emit('pick', v), onCtx: (v: any) => emit('ctx', v) })))
          : null,
      ]);
    };
  },
});

/* 1344：字段树行右键。全站右键普查里本页的字段树是「一个字段一行」，
   而字段的**全路径**（含嵌套前缀，如 publisher.org_name）正是这页最常被拿走的东西：
   贴进 DSL 查询、贴进 PUT mapping、发给同事。点选只把字段名喂给「新建字段」表单，拿不到全路径。
   一级 ≤2 个频繁动作 + 分组父项（项目右键约定）。 */
const fieldMenu = ref<{ x: number; y: number; node: any } | null>(null);
function openFieldMenu(p: { ev: MouseEvent; node: any }) {
  fieldMenu.value = { x: p.ev.clientX, y: p.ev.clientY, node: p.node };
}
const fieldMenuItems = computed<CcmItem[]>(() => {
  const m = fieldMenu.value;
  if (!m) return [];
  const n = m.node;
  const copy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    store.notify(ok ? 'success' : 'error', ok ? msg : '复制失败');
  };
  return [
    { key: 'md-copy-path', label: '复制字段全路径', run: () => void copy(String(n.name), `已复制「${n.name}」`) },
    {
      key: 'md-more', label: '更多…', sep: true, children: [
        { key: 'md-copy-leaf', label: '复制末段字段名', run: () => void copy(String(n.name).split('.').pop() || String(n.name), '已复制末段名') },
        { key: 'md-copy-exists', label: '复制 exists 查询片段', run: () => void copy(
          JSON.stringify({ exists: { field: n.name } }, null, 2), '已复制 exists 片段') },
        { key: 'md-copy-type', label: `复制「路径 类型」（${n.type || 'unknown'}）`, run: () => void copy(
          `${n.name}\t${n.type || 'unknown'}`, '已复制路径与类型') },
      ],
    },
  ];
});

const previewBody = computed(() => {
  if (!newPath.value) return '';
  const parts = newPath.value.split('.');
  const leaf: any = { type: newType.value };
  if (newType.value === 'text') {
    if (newAnalyzer.value.trim()) leaf.analyzer = newAnalyzer.value.trim();
    if (newSearchAnalyzer.value.trim()) leaf.search_analyzer = newSearchAnalyzer.value.trim();
    if (newAddKeyword.value) leaf.fields = { keyword: { type: 'keyword', ignore_above: 256 } };
  }
  if (newExtra.value.trim()) {
    try { Object.assign(leaf, JSON.parse(newExtra.value.trim())); } catch { /* ignore */ }
  }
  /* 用点分层嵌进 properties */
  let cur: any = leaf;
  for (let i = parts.length - 1; i > 0; i--) {
    cur = { properties: { [parts[i]]: cur } };
  }
  const root: any = { properties: { [parts[0]]: cur } };
  return JSON.stringify(root, null, 2);
});

/* 五格统计 MetaStrip items——数据与原五卡等价；nested 恒 warn 语气（原 .md-stat.warn 恒色） */
const statItems = computed<MetaStripItem[]>(() => [
  { value: fmtNum(stats.value.total), label: '总字段' },
  { value: fmtNum(stats.value.text), label: 'text' },
  { value: fmtNum(stats.value.keyword), label: 'keyword' },
  { value: fmtNum(stats.value.object), label: 'object' },
  { value: fmtNum(stats.value.nested), label: 'nested', tone: 'warn' },
]);
/* copy_to 数组 pretty 后走 highlightJson（原裸 stringify 退役） */
const copyToHtml = computed(() =>
  picked.value?.copyTo ? highlightJson(JSON.stringify(picked.value.copyTo, null, 2)) : '');

/* 字段详情 md-kv 值对段 MetaStrip items（原九行键值行的纯值对六段；
 类型/copy_to/multi-fields 三段富内容走插槽，见模板注）。
 ：三段英文参数 label 补中文 tip（铁律 F「任何英文参数必须有中文备注」，
 悬停可达； RemoteClusters 同款） */
const pickedMeta = computed<MetaStripItem[]>(() => {
  const p = picked.value;
  if (!p) return [];
  return [
    { value: p.name, label: '名称' },
    ...(p.analyzer ? [{ value: p.analyzer, label: 'analyzer', tip: '写入分词器' }] : []),
    ...(p.searchAnalyzer ? [{ value: p.searchAnalyzer, label: 'search_analyzer', tip: '搜索分词器' }] : []),
    ...(p.format ? [{ value: p.format, label: 'format', tip: '字段存储格式' }] : []),
    { value: p.isNested ? '✅ yes' : 'no', label: '是否 nested' },
    { value: p.isObject ? '✅ yes' : 'no', label: '是否 object' },
  ];
});

async function doLoad() {
  if (!index.value.trim()) return;
  busy.value = true;
  loadErr.value = '';
  try {
    const r: any = await api.mappingDetail(index.value.trim());
    tree.value = r.tree || [];
    stats.value = r.stats || {};
    picked.value = null;
    loaded.value = true;
    if (!tree.value.length) store.notify('warning', '索引无字段或不存在');
  } catch (e: any) {
    /* 裸错误串改 friendlyEsError */
    loadErr.value = friendlyEsError(e?.message || String(e));
    tree.value = [];
    store.notify('error', '加载失败：' + loadErr.value);
  }
  finally { busy.value = false; }
}

function pickField(n: any) { picked.value = n; }

async function doAdd() {
  /* 执行体收口：弹窗提交钮已 v-if，深链/键盘等旁路仍同汇入本函数 */
  if (!canOps.value) { store.notify('warning', '加字段需专项角色'); return; }
  /* 2.1.6：执行体防重 */
  if (busy.value) return;
  if (!newPath.value.trim() || !previewBody.value) return;
  busy.value = true;
  try {
    const r: any = await api.mappingPut(index.value.trim(), previewBody.value);
    if (r?.acknowledged) {
      store.notify('success', `字段 ${newPath.value} 已添加`);
      showAdd.value = false;
      newPath.value = ''; newExtra.value = '';
      await doLoad();
    } else {
      store.notify('error', `集群未确认 mapping 变更（acknowledged=false），字段 ${newPath.value} 可能未生效，建议重新加载确认`);
    }
  } catch (e: any) { store.notify('error', '添加失败：' + (e?.message || e)); }
  finally { busy.value = false; }
}
</script>

<style scoped>
/* 页面转 flex 纵向吃满可滚区——md-grid 由此拿到「页面余高」弹性 */
.md-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); display: flex; flex-direction: column; min-height: 100%; }
/* 只读身份说明条（RestView .rt-perm-note 同款形态；md-page 无 flex gap 自补下距） */
.md-perm-note { display: flex; align-items: center; gap: var(--sp-2); margin: 0 0 var(--sp-3); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
/* 页头已收敛 PageHeader 组件，本地 .md-hd/.md-hd-l/.md-hd-ic/.md-hd-tt/.md-hd-sub 删除 */
/* .md-inp 随页内 IndexPicker 退役删除（选择入口收敛顶栏 CurrentIdxChip） */
/* ：页头右组 flex 修饰与输入框 sm 后缀窄档两条死规则删（模板 0 元素实证，
 PageHeader 合并后遗留——713 G53/715 同族； 通杀扫描定案） */
.md-ii { background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); min-width: 200px; font-family: var(--mono); font-size: var(--fs-sm); }
/* 五格统计改挂 MetaStrip（原 .md-stat-row/.md-stat 规则随组件退役；落位间距等价保留） */
.md-strip { margin-bottom: var(--sp-3); }
/* grid 吃页面余高（单行两列，align-content stretch 拉伸行高）；min-height:0 传递 */
.md-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); gap: var(--sp-3); flex: 1 1 auto; min-height: 0; }
/* 卡转 flex 纵向——字段树/详情随行高弹性。
 轨4：md-card 壳 chrome 退役（540 df/rd/sy 同语言）——内容直贴，分界由
 md-card-hd 既有 border-bottom 承接；overflow+flex+min-height 骨架逐字保留（收缩防撑破
 是结构语义非 chrome） */
.md-card { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
/* 卡头档归位——.md-card-hd 自造形态（fs-sm/400）换挂全局 .card-t（fs-md/650），
 本类只留壳差异（内边距/发丝线/space-between；卡头带边框不吃 .card-t 的 margin-bottom） */
.md-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); justify-content: space-between; margin-bottom: 0; }
.md-meta { color: var(--muted); font-size: var(--fs-xs); font-family: var(--mono); }
/* 60vh 钉死封顶改 flex 弹性——字段树吃卡片余高（卡随页面余高拉伸），
 min-height:0+overflow 内滚兜底 */
.md-tree { padding: var(--sp-2); flex: 1 1 auto; min-height: 0; overflow: auto; }
/* .md-empty 裸空态规则随 EmptyState compact 合并删除（.md-loading 进行态保留） */
/* 字段树 loading 骨架容器（进行态与空态视觉可分，不复用 .md-empty 命名） */
.md-loading { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
/* MappingNode 是 render 函数内联组件，元素拿不到本 SFC 的 scope 属性——
 树节点样式必须走 :deep()（同 DslQueryView 的 pf-* / ConfigDriftView 的 cd-* 范式），
 否则整棵字段树裸奔成纯文本（名字+类型黏连）。 */
:deep(.md-branch) { margin: 1px 0; }
:deep(.md-node) { display: flex; align-items: center; gap: var(--sp-2); padding: 3px var(--sp-2); border-radius: var(--r-xs); cursor: pointer; font-size: var(--fs-sm); font-family: var(--mono); }
:deep(.md-node:hover) { background: var(--bg2); }
:deep(.md-node:focus-visible) { outline: 2px solid var(--ac); outline-offset: -2px; }
:deep(.md-caret), :deep(.md-caret-pl) { width: 14px; display: inline-flex; align-items: center; justify-content: center; }
:deep(.md-nm) { color: var(--fg); }
:deep(.md-tp) { color: var(--brand); font-size: var(--fs-xs); }
:deep(.md-badge) { font-size: var(--fs-xs); padding: 1px var(--sp-2); border-radius: 3px; background: var(--bg2); color: var(--muted); }
:deep(.md-badge.nested) { background: var(--warn-soft); color: var(--warn); }
/* 非法 CSS `var(--dv-violet)-soft` 修正为已定义的 --dv-violet-soft（原写法 background 整条失效） */
:deep(.md-badge.mf) { background: var(--dv-violet-soft); color: var(--dv-violet); }
:deep(.md-badge.an) { background: var(--ok-soft); color: var(--ok); }
:deep(.md-children) { padding-left: var(--sp-4); border-left: 1px dashed var(--border); margin-left: var(--sp-2); }
.md-detail { padding: var(--sp-3); }
/* md-kv 私造键值行样式随 MetaStrip 合并退役（形态归 .ms 单源，类名 md-kvs 在场） */
/* copy_to pretty 多行展示（code 默认 white-space 会把换行塌成空格） */
.md-code-block { white-space: pre-wrap; word-break: break-all; }
.md-mf { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.md-mf-i { font-size: var(--fs-xs); padding: var(--sp-0) var(--sp-2); background: var(--bg2); border-radius: 3px; }
.md-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--mask); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-view); }
.md-mo-b { width: 520px; max-width: 94vw; max-height: 82vh; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); display: flex; flex-direction: column; }
.md-mo-hd { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); font-size: var(--fs-md); font-weight: 650; display: flex; align-items: center; gap: var(--sp-2); }
.md-close { margin-left: auto; }
/* 弹窗体转 flex——md-mo-body 吃弹窗（max-height:82vh）余高，preview 随之弹性 */
.md-mo-body { padding: var(--sp-3) var(--sp-4); overflow-y: auto; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* (b)：加字段弹窗 extra JsonArea 外框退役（ ilm 弹窗同语言）——
 md-mo-hd 既有 border-bottom + ja-bar 工具条自承分界；组件本体零触，纯视觉 */
.md-mo-body :deep(.ja) { border: none; border-radius: 0; }
.md-mo-ft { padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); display: flex; gap: var(--sp-2); justify-content: flex-end; }
.md-warn { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); color: var(--warn); padding: var(--sp-2) var(--sp-3); background: var(--warn-soft); border-radius: var(--r-xs); margin-bottom: var(--sp-3); }
.md-lb { display: block; margin-bottom: var(--sp-2); font-size: var(--fs-sm); }
.md-lb > span { display: block; color: var(--muted); margin-bottom: var(--sp-1); }
.md-lb .md-ii { min-width: 100%; box-sizing: border-box; }
/* .md-ta 死规则随编辑器外框退役删除（额外 JSON 编辑器早已 JsonArea 化，
 模板 grep 0 引用实证——bg2+border+radius 外框形态不回流，① 源码锁） */
/* preview 转 flex 吃弹窗体余高，pre 去 180px 封顶（min-height:0 内滚兜底） */
.md-preview { margin-top: var(--sp-3); flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.md-preview-hd { font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--sp-1); }
.md-preview pre { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--r-xs); padding: var(--sp-2); font-size: var(--fs-xs); font-family: var(--mono); flex: 1 1 auto; min-height: 0; overflow: auto; margin: 0; }

/* 实测 iframe 可用宽 ~866px，固定栏宽在此崩塌。
 断点归一 标准值 1100（堆叠语义）。 */
@media (max-width: 1100px) {
  .md-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——编辑器/详情堆叠已由
 1100 档合并，此处收页侧距，详情键值行与弹窗底栏允许换行（长 copy_to/字段名不再硬挤） */
@media (max-width: 900px) {
  .md-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .md-mo-ft { flex-wrap: wrap; }
}
</style>
