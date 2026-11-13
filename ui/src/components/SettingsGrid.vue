<template>
  <div class="sg" ref="rootEl">
    <div v-if="filterable" class="sg-bar">
      <input
        v-model.trim="kw" class="ipt mono sg-filter" :placeholder="filterPlaceholder"
        @keydown.enter.prevent="onHitKey"
      />
      <span v-if="kw" class="sg-count mono">{{ shown.length }}/{{ rows.length }}</span>
      <!-- 搜索定位：命中计数 + 上/下一个（复用上面的过滤框，Enter/Shift+Enter 接线） -->
      <HitNav :count="shown.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
    </div>
    <div class="scroll-y" :style="maxHeight ? { maxHeight } : undefined">
      <div
        v-for="(r, i) in shown" :key="r.k" class="sg-row" :class="{ 'sg-def': r.def }" tabindex="0"
        :data-hit-idx="i + 1" @contextmenu.prevent="openRowMenu($event, r)" @keydown="onRowMenuKey($event, r)" data-row-nav @keydown.self="rowArrowNav"
      >
        <span class="sg-k">
          <DotKey :k="displayKey(r.k)" :full="r.k" />
          <!-- +1：静态键徽标——只可随重建修改的 index 静态 settings。
 手滚胶囊改用 StatusPill（静态档 tone r=热改会被拒需重建 /
 默认档 tone n），色档归 .pill 单源（pillSingleTrack MERGED 同步更新登记），
 sg-badge/sg-static 只留 DOM 锚 -->
          <StatusPill v-if="isStaticKey(r.k)" class="sg-badge sg-static" tone="r" label="静态" title="需重建索引方可修改" />
          <!-- analysis.* 定义行「试」钮——一键跳分词工具验证该组件（预填+自动执行） -->
          <button v-if="defTarget(r)" class="sg-try" :aria-label="'验证 ' + defTarget(r)!.name + ' 的分词效果'" :title="'验证「' + defTarget(r)!.name + '」的分词效果'" @click="goAnalyze(defTarget(r)!)">
            <FlaskConical :size="11" />
          </button>
          <StatusPill v-if="r.def" class="sg-badge" tone="n" label="默认" title="集群默认值（未显式设置）" />
        </span>
        <span class="sg-v mono" :title="'点击复制：' + (r.v || '（空）')" tabindex="0" role="button" @keydown.enter.prevent="copyRow(r)" @keydown.space.prevent="copyRow(r)" @click="copyRow(r)">
          <!-- 引用行（键尾 .analyzer/.tokenizer/.filter/.char_filter/.normalizer）的值
 按逗号拆成可点名字——点名字=跳分词工具验证该组件；名字外区域仍是点击复制 -->
          <template v-if="analyzeRefs(r)"><template v-for="(t, ti) in analyzeRefs(r)" :key="ti"><!--
            --><a class="sg-analyze" :title="'验证「' + t.name + '」的分词效果'" href="javascript:void 0" @keydown.enter.prevent.stop="goAnalyze(t)" @click.stop="goAnalyze(t)">{{ t.name }}</a><!--
            --><span v-if="ti < analyzeRefs(r)!.length - 1">, </span></template></template>
          <template v-else>{{ r.v === '' ? '—' : r.v }}</template>
        </span>
      </div>
      <!-- 裸 .empty 迁 EmptyState compact（settings 卡内嵌窄容器） -->
      <EmptyState v-if="!shown.length" compact :icon="SlidersHorizontal" :text="kw ? '无匹配 setting' : emptyText" />
    </div>
    <!-- 1380：行右键——此前只有「点值=复制 key: value」一条路。运维场景真正要的是
     「这条 setting 的 PUT 片段 / 只复制值 / 复制成 terms 查询」，都得手打。
     一级两项直达 + 两个分组（其余动作收进去），与表格右键同约定。 -->
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="displayKey(rowMenu.r.k)"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/**
 * 全站统一 Settings 呈现组件——合并 MappingView kv 行 / IndexHub JsonTree /
 * 各处 pre 的重复设计。契约：
 * - dot-key 只在「.」后断行（DotKey <wbr>），零词中撕裂、零溢出
 * - 值点击复制（key: value 全量），空值给 —
 * - 默认值行灰显 + 「默认」徽标（含默认值场景由调用方 mergeDefaultRows 合流传入）
 * - 内置过滤（key/value 双命中 + 命中计数），filterable 开关
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { FlaskConical, SlidersHorizontal, Copy, Braces, ClipboardList } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { copyText } from '../utils/format';
import { filterSettingRows, isStaticSettingKey, type SettingRow } from '../utils/settingsView';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useHitLocate } from '../composables/useHitNav';
/* 裸 .empty 迁 EmptyState compact */
import EmptyState from './EmptyState.vue';
import DotKey from './DotKey.vue';
import HitNav from './HitNav.vue';
/* sg-badge/sg-static 胶囊改用 StatusPill 统一件（r 静态档/n 默认档） */
import StatusPill from './StatusPill.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';

const props = withDefaults(defineProps<{
  rows: SettingRow[];
  /** 展示时剪掉的前缀（如 'index.'），title/复制仍是全量 key */
  stripPrefix?: string;
  filterable?: boolean;
  filterPlaceholder?: string;
  maxHeight?: string;
  emptyText?: string;
  /** 分析器联动上下文（所属索引名）——传入后 analysis.* 定义/引用行出现
 「试」/可点名字，跳 /analyze 预填并自动执行；不传零增量 */
  analyzeIndex?: string;
}>(), {
  stripPrefix: '',
  filterable: false,
  filterPlaceholder: '过滤 key / value…',
  maxHeight: '',
  emptyText: '无 settings',
  analyzeIndex: '',
});

const store = useAppStore();
const kw = ref('');
const shown = computed(() => filterSettingRows(props.rows, kw.value));

/* 搜索定位：shown 即命中集（过滤后的渲染序 1..n），Enter 前进 / Shift+Enter 后退 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => shown.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

function displayKey(k: string): string {
  return props.stripPrefix && k.startsWith(props.stripPrefix) ? k.slice(props.stripPrefix.length) : k;
}

/* ═══ +1：静态键徽标 ═══
 ES 静态 index settings 清单——合并 utils/settingsView#isStaticSettingKey
 单源（MappingView 折叠节头「静态 M」摘要共用），本类只留调用。 */
function isStaticKey(k: string): boolean {
  return isStaticSettingKey(k);
}
async function copyRow(r: SettingRow) {
  if (await copyText(r.k + ': ' + r.v)) store.notify('success', '已复制 ' + displayKey(r.k));
}

/* ═══ 1380：行右键 ═══
   此前 settings 行只有「点值复制 key: value」。排查时真正要的是：
   把这一条拼进 PUT /_settings 的片段、只要值、或直接生成 term 查询去核对库里的实际值。
   一级只放两条直达（复制键值 / 复制 PUT 片段），其余进「更多…」分组。 */
const rowMenu = ref<{ x: number; y: number; r: SettingRow } | null>(null);
function openRowMenu(e: MouseEvent, r: SettingRow) {
  rowMenu.value = { x: e.clientX, y: e.clientY, r };
}
function onRowMenuKey(e: KeyboardEvent, r: SettingRow) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), r };
}
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const r = m.r;
  const putBody = JSON.stringify({ [r.k.replace(/^index\./, '')]: r.v }, null, 2);
  return [
    { key: 'copy-kv', label: '复制键值（key: value）', icon: Copy, run: () => void copyRow(r) },
    { key: 'copy-put', label: '复制 PUT 设置片段', icon: Braces, run: () => {
        void copyText(putBody).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 PUT 片段' : '复制失败'));
      } },
    { key: 'more-group', label: '更多…', icon: ClipboardList, sep: true, children: [
      { key: 'copy-key', label: '只复制键名', icon: Copy, run: () => {
          void copyText(r.k).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制键名' : '复制失败'));
        } },
      { key: 'copy-val', label: '只复制值', icon: Copy, run: () => {
          void copyText(r.v).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制值' : '复制失败'));
        } },
      { key: 'copy-term', label: '复制为查询片段（term）', icon: Braces, run: () => {
          const q = JSON.stringify({ term: { [r.k]: r.v } }, null, 2);
          void copyText(q).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 term 查询' : '复制失败'));
        } },
    ] },
  ];
});

/* ═══ ：分析器联动（analyzeIndex 传入才启用）═══
 定义行：index.analysis.<kind>.<name>(.*) 键 → 行名旁「试」钮（kind: analyzer/tokenizer/
 filter/char_filter/normalizer）；引用行：键尾 .analyzer/.tokenizer/.filter/.char_filter/
 .normalizer 的逗号分隔值 → 每个名字可点。目的地 /analyze?idx&kind&name 预填并自动执行。 */
const router = useRouter();
const DEF_CHILD_RE = /^index\.analysis\.(analyzer|tokenizer|filter|char_filter|normalizer)\.([^.]+)\./;
const REF_TAIL_RE = /\.(analyzer|tokenizer|filter|char_filter|normalizer)$/;
interface AnalyzeTarget { kind: string; name: string }
function defTarget(r: SettingRow): AnalyzeTarget | null {
  if (!props.analyzeIndex) return null;
  /* 引用尾段行（.tokenizer/.filter/…）的联动在值名字上（analyzeRefs），不重复出「试」钮 */
  if (REF_TAIL_RE.test(r.k)) return null;
  const m = r.k.match(DEF_CHILD_RE);
  return m ? { kind: m[1], name: m[2] } : null;
}
function analyzeRefs(r: SettingRow): AnalyzeTarget[] | null {
  if (!props.analyzeIndex || defTarget(r)) return null;
  const m = r.k.match(REF_TAIL_RE);
  if (!m || !r.v) return null;
  const names = r.v.split(',').map(s => s.trim()).filter(Boolean);
  /* 名字含空格/超长=不是组件名（自然语言值），整行保持原样 */
  if (!names.length || names.some(n => n.length > 64 || /\s/.test(n))) return null;
  return names.map(name => ({ name, kind: m[1] }));
}
function goAnalyze(t: AnalyzeTarget) {
  router.push({ path: '/analyze', query: { ...(props.analyzeIndex ? { idx: props.analyzeIndex } : {}), kind: t.kind, name: t.name } });
}
</script>

<style scoped>
.sg { min-width: 0; container-type: inline-size; }
.sg-bar { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1h); }
.sg-filter { flex: 1; min-width: 0; max-width: 480px; font-size: var(--fs-xs); height: 24px; padding: 0 var(--sp-2); }
.sg-count { flex-shrink: 0; font-size: var(--fs-2xs); color: var(--tx2); }
/* 两列网格：minmax(0,*) 是零溢出的根——key/value 都拿得到收缩权 */
.sg-row {
  display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--sp-1) var(--sp-3);
  align-items: baseline; padding: 3px 0; font-size: var(--fs-xs); border-bottom: 1px dashed var(--line);
}
.sg-row:last-child { border-bottom: 0; }
.sg-k { color: var(--tx1); min-width: 0; }
.sg-v {
  color: var(--tx0); min-width: 0; text-align: right; cursor: pointer;
  overflow-wrap: anywhere; word-break: normal;
}
.sg-v:hover { color: var(--ac-hi); }
.sg-def { opacity: .55; }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.sg-row.hit-cur { background: var(--ac-soft); box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); border-radius: var(--r-s); opacity: 1; }
/* sg-badge/sg-static 改用 StatusPill（静态档 tone r / 默认档 tone n）——
 尺寸/色值归 .pill 单源（pillSingleTrack MERGED 同步更新登记），本类只留行内落位 */
.sg-badge { margin-left: var(--sp-1h); vertical-align: 1px; }
/* .sg-empty（16px 内边距）随空态迁 EmptyState compact 退役，留白归组件 */
/* 分析器联动——「试」钮与可点名字（info 蓝虚线=链接语义） */
.sg-try {
  display: inline-flex; align-items: center; margin-left: 5px; padding: 1px var(--sp-1);
  border: 0; border-radius: var(--r-s); background: transparent; color: var(--info);
  cursor: pointer; vertical-align: 1px;
}
.sg-try:hover { color: var(--ac-hi); background: var(--ac-soft); }
.sg-analyze { color: var(--info); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
.sg-analyze:hover { color: var(--ac-hi); }
/* 宽容器变体（容器查询）——MappingView 全宽折叠节 ~1200px 主受益者。
 窄容器（IndexHub 右栏 ~280px）不触发断点零变：右对齐在窄栏的正确性（键折行后值
 仍独立可读）保留。宽容器下键尾→值右缘可达 600px 视觉断裂，值改左对齐紧随键列
 边界（Kibana settings 范式），gap 同步放宽到 --sp-4 维持列间呼吸。 */
@container (min-width: 760px) {
  .sg-row { gap: var(--sp-1) var(--sp-4); }
  .sg-v { text-align: left; }
}
</style>
