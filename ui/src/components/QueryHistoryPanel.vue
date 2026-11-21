<template>
  <!-- 查询历史面板共享件（QueryHub 跨模式抽屉 / DslQueryView 历史弹窗双入口复用）。
 内置：过滤框（按查询文本/索引名，过滤词按 route 维度草稿化）、条数计数、复制查询文本、
 清空入口（emit 给父做确认）。条目动作按钮由 actions prop 配置，事件交父组件回放/删除。 -->
  <div class="qhp">
    <div class="qhp-bar">
      <!-- 轨4：裸 input（.inp 手写皮 + 独立高度/字号内衬）合并 SearchFilterBar 第 17 胞。
 落位/内衬归 .qhp-sfb（组件根，父 scoped 样式照常命中）；input-class 保留 .qhp-filter
 运行时锚（queryHistoryPanel.spec 零迁移）；Esc 清空由组件内建承接（原裸 input 无 Esc 语义）。 -->
      <SearchFilterBar v-model="kw" class="qhp-sfb" input-class="qhp-filter" placeholder="过滤：查询文本 / 索引名" />
      <span class="qhp-cnt mono">{{ shown.length }}/{{ items.length }} 条</span>
      <!-- 导出当前过滤结果为 JSON（与 92 批 RestView 历史导出同语义——
 100 条上限下旧查询找得到也带得走） -->
      <!-- title 诚实化——导出/导入闭环（合并导入按 mode+查询+索引去重 -->
      <button class="btn xs ghost" :disabled="!shown.length" title="导出当前过滤结果为 JSON（备份/带出，供检索或存档）" @click="exportShown">
        <FileDown :size="12" /> 导出
      </button>
      <!-- 导入合并（导出闭环消费方；同 mode+查询+索引去重） -->
      <!-- importable=false 隐藏导入入口——面板导入走 queryHistory store 合并，与页内
 自持历史的消费方（DevTools tab 草稿 / RestView es_rest_hist）不同存储，保留会
 「导入成功却看不见」；默认 true，既有消费方行为零变化 -->
      <input v-if="importable" ref="importFileEl" type="file" accept=".json,application/json" style="display:none"
        aria-label="导入查询历史" @change="onImportFile" />
      <button v-if="importable" class="btn xs ghost" title="从导出的 JSON 合并导入（同 mode+查询+索引去重）" @click="importFileEl?.click()">
        导入
      </button>
      <button v-if="clearable" class="btn xs ghost danger" :disabled="!items.length" @click="$emit('clear')">
        <Trash2 :size="12" /> 清空
      </button>
    </div>
    <div v-if="!items.length" class="qhp-empty">{{ emptyText }}</div>
    <div v-else-if="!shown.length" class="qhp-empty">无匹配「{{ filter.text }}」的历史</div>
    <div v-else class="qhp-list">
      <div
        v-for="(it, i) in shown" :key="it.id ?? i"
        class="qhp-item" :class="{ clickable: clickable }"
        @click="clickable && $emit('play', it)"
        @contextmenu.prevent="openRowMenu($event, it)"
        @keydown="onRowMenuKey($event, it)" data-row-nav @keydown.self="rowArrowNav"
       role="button" tabindex="0" @keydown.enter.prevent="clickable && $emit('play', it)" @keydown.space.prevent="clickable && $emit('play', it)">
        <div class="qhp-row">
          <span v-if="it.name" class="qhp-name" :title="it.name"><MarkText :text="it.name" :kw="kw" /></span>
          <span v-if="showMode && it.mode" class="qhp-mode" :data-mode="it.mode">{{ modeLabel(it.mode) }}</span>
          <!-- 索引名芯片化——点击直达索引工作区（.stop 不触发整行回放） -->
          <span v-if="it.index" class="qhp-idx mono qhp-idx-go" :title="it.index + '（点击打开索引工作区）'" tabindex="0" role="button" @keydown.enter.prevent.stop="gotoIndex(it.index)" @keydown.space.prevent.stop="gotoIndex(it.index)" @click.stop="gotoIndex(it.index)"><MarkText :text="it.index" :kw="kw" /></span>
          <!-- 1071：参数化 SQL 的参数条数徽标——回放会连同这些值恢复，避免用户以为只回放了文本 -->
          <span v-if="it.params" class="qhp-params mono" :title="'SQL 参数（回放时一并恢复）：' + it.params">{{ paramsTag(it.params) }}</span>
          <span v-if="it.ok === false" class="qhp-fail" role="img" aria-label="上次执行失败"
                :title="it.error ? '上次执行失败：' + it.error : '上次执行失败——回放可重试'"></span>
          <span
            v-if="it.took != null" class="qhp-took" :class="tookClass(it.took)"
            :title="props.tookTip || `ES 分片执行耗时 ${it.took}ms（took 字段，不含网络往返与序列化，端到端会更慢）`"
          >{{ fmtTook(it.took) }}</span>
          <span v-if="it.ts != null" class="qhp-time">{{ relTime(it.ts ?? 0, now) }}</span>
          <span class="qhp-acts" role="presentation" @click.stop @keydown.enter.stop>
            <button v-if="actions.includes('play')" aria-label="回放/执行" class="btn xs ghost" title="回放/执行" @click="$emit('play', it)"><Play :size="11" /></button>
            <button v-if="actions.includes('fill')" aria-label="仅填入" class="btn xs ghost" title="仅填入" @click="$emit('fill', it)"><CornerUpLeft :size="11" /></button>
            <button v-if="actions.includes('copy')" aria-label="复制查询文本" class="btn xs ghost" title="复制查询文本" @click="copyIt(it)"><Copy :size="11" /></button>
            <!-- 可选 'curl' action——行级仅 emit，curl 组装归宿主（method/path/body
 宿主行自持）；不传 'curl' 的宿主零变化（默认行为零增量） -->
            <button v-if="actions.includes('curl')" aria-label="复制为 curl" class="btn xs ghost" title="复制为 curl" @click="$emit('curl', it)"><Terminal :size="11" /></button>
            <!-- 可选 'newtab' action——行级仅 emit，新 Tab 组装与激活跳转归宿主
 （method/path/body 宿主行自持，DevTools histNewTab 先例）；不传 'newtab' 的宿主
 零变化（默认行为零增量，'curl' 552 同先例） -->
            <button v-if="actions.includes('newtab')" aria-label="回放到新 Tab" class="btn xs ghost" title="回放到新 Tab（新开一个请求标签页填入）" @click="$emit('newtab', it)"><ExternalLink :size="11" /></button>
            <!-- 一键转收藏（保存的搜索）——「回放后另存」压缩为一步，保存通道由宿主接。
 行级门：仅无 mode（页内自持历史）或 mode='dsl' 行出钮——收藏存储是 DSL 语义，
 sql/lucene 等跨模式行无收藏归宿，出钮即误导 -->
            <button v-if="actions.includes('fav') && (!it.mode || it.mode === 'dsl')" aria-label="转为收藏（保存的搜索）" class="btn xs ghost"
              title="转为收藏（保存的搜索）：免回放直接进入保存流程" @click="$emit('fav', it)"><Star :size="11" /></button>
            <button v-if="actions.includes('rename')" aria-label="重命名" class="btn xs ghost" title="重命名（以新名覆盖此条）" @click="$emit('rename', it)"><Pencil :size="11" /></button>
            <button v-if="actions.includes('del')" aria-label="删除此条" class="btn xs ghost" title="删除此条" @click="$emit('del', it)"><Trash2 :size="11" /></button>
          </span>
        </div>
        <!-- query 行接 MarkText——过滤词命中查询文本时同 name/index 一样 <mark> 高亮（主过滤目标补齐可视闭环） -->
        <div class="qhp-q mono" :title="it.query"><MarkText :text="it.query || '（无过滤 · match_all）'" :kw="kw" /></div>
        <!-- 可选摘要行（如 body 截断摘要）——不传不渲染，既有宿主零增量；
 文本态直排（MarkText 高亮主过滤目标是 query 行职责，摘要行不上高亮） -->
        <div v-if="it.sub" class="qhp-sub mono" :title="it.sub">{{ it.sub }}</div>
      </div>
    </div>
    <!-- 1142：历史行右键 —— 同一批行级动作经共享 CellContextMenu 分组呈现（项目右键
 能力补齐；行内窄钮保留作可发现入口，右键是 Power path，不抢主链路）。 -->
  <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenu.it.name || '查询历史'"
    :items="rowMenuItems" @close="rowMenu = null" />
</div>

</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Play, CornerUpLeft, Copy, Trash2, FileDown, Star, Terminal, ExternalLink, Pencil } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useNow } from '../composables/useNow';
import MarkText from './MarkText.vue';
import SearchFilterBar from './SearchFilterBar.vue'; /* 轨4：过滤框统一件（第 17 胞） */
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue'; /* 1142：行右键（分组） */
import { exportStamp, relTime, copyText, downloadText, fmtTook, tookClass } from '../utils/format';
import { QUERY_MODES } from '../utils/queryHub';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

/** 统一条目形状：DslQueryView 旧历史（dsl/idx）与 queryHistory store（query/index）在父侧映射 */
export interface HistRow {
  id?: string | number;
  mode?: string;
  /** 保存类条目的名称（已保存查询/模板），渲染为行首名称徽标 */
  name?: string;
  query: string;
  index?: string;
  /** 时间戳；模板类静态条目无时间概念可不传（不渲染时间） */
  ts?: number;
  took?: number;
  /** 上次执行失败标记（false=失败红点） */
  ok?: boolean;
  /** 1122：上次失败错误摘要（截断）——红点 tooltip 直接说明失败原因 */
  error?: string;
  /** 1071：SQL 位置参数（JSON 数组原文）——回放时随查询文本一起恢复 */
  params?: string;
  /** 可选摘要行（如 DevTools 历史行的 body 截断摘要）——不传不渲染（零增量） */
  sub?: string;
}

interface Props {
  items: HistRow[];
  /** 条目动作按钮集合（缺省只给回放）。加 'fav'：一键转收藏（行级门=无 mode 或
 * mode='dsl'，收藏存储 es_query_saved 是 DSL 语义；面板只发事件，保存通道由宿主接）。
 * 加 'curl'：一键复制 curl（行级仅 emit，命令组装归宿主）。
 * 加 'newtab'：回放到新 Tab（行级仅 emit，mkTab+激活跳转归宿主；
 * 追加在枚举末位—— 枚举字面子串锁零触） */
  actions?: ('play' | 'fill' | 'copy' | 'curl' | 'del' | 'rename' | 'fav' | 'newtab')[];
  /** 是否显示清空入口（emit('clear')，确认由父组件做） */
  clearable?: boolean;
  /** 是否显示模式徽标（跨模式历史需要，单模式历史关闭） */
  showMode?: boolean;
  /** 点击条目整行触发 play（QueryHub 抽屉既有交互） */
  clickable?: boolean;
  emptyText?: string;
  /* ── ：两个可选扩展（DevTools/RestView 历史改用消费；缺省=既有行为零变化） ── */
  /** 是否提供「导入」入口（默认 true）。导入走 queryHistory store 合并，自持历史的
 * 消费方（DevTools/RestView）传 false 隐藏，防「导入成功却写进别的存储」 */
  importable?: boolean;
  /** 导出行映射（缺省维持既有字段集 mode/name/index/query/took/ts——旧导出格式不变）。
 * 自持历史消费方用它保留条目特有字段（如 rest 的 method/path/body） */
  exportRow?: (it: HistRow) => Record<string, unknown>;
  /** 耗时徽标悬停语义（缺省按 ES took 字段口径）。自持历史的 took 若是
 * 端到端实测（如 DevTools performance.now），传自己的口径防提示与数据源不符 */
  tookTip?: string;
}

const props = withDefaults(defineProps<Props>(), {
  actions: () => ['play'],
  clearable: true,
  showMode: false,
  clickable: false,
  emptyText: '暂无查询历史',
  importable: true,
  exportRow: undefined,
  tookTip: '',
});

const emit = defineEmits<{
  (e: 'play', it: HistRow): void;
  (e: 'fill', it: HistRow): void;
  (e: 'curl', it: HistRow): void;
  (e: 'del', it: HistRow): void;
  (e: 'rename', it: HistRow): void;
  (e: 'fav', it: HistRow): void;
  (e: 'newtab', it: HistRow): void; /* ：回放到新 Tab（组装归宿主） */
  (e: 'clear'): void;
}>();

const store = useAppStore();
const hist = useQueryHistoryStore();
const route = useRoute();
/* 索引名芯片跳转——router 在无路由测试环境为 undefined，gotoIndex 内护栏 */
const router = useRouter();
const now = useNow();

/* 1142：行右键菜单（同一批动作，分组菜单）——高频回放/填入留一级，其余按语义分组。
 门控同行内钮（actions 枚举 / fav 的 mode 门），不越权暴露。 */
const rowMenu = ref<{ x: number; y: number; it: HistRow } | null>(null);
function openRowMenu(e: MouseEvent, it: HistRow) {
  rowMenu.value = { x: e.clientX, y: e.clientY, it };
}
function onRowMenuKey(e: KeyboardEvent, it: HistRow) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), it };
}
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value; if (!m) return [];
  const it = m.it;
  const emitAndClose = (name: 'play' | 'fill' | 'curl' | 'del' | 'rename' | 'fav' | 'newtab') => () => {
    /* 联合事件名无法直投 overloaded emit（TS 选不出单一签名）——逐名分派保类型 */
    switch (name) {
      case 'play': emit('play', it); break;
      case 'fill': emit('fill', it); break;
      case 'curl': emit('curl', it); break;
      case 'del': emit('del', it); break;
      case 'rename': emit('rename', it); break;
      case 'fav': emit('fav', it); break;
      case 'newtab': emit('newtab', it); break;
    }
  };
  const copyChildren = [
    { key: 'copy-query', label: '复制查询文本', icon: Copy, run: () => copyIt(it) },
    ...(it.index ? [{ key: 'copy-index', label: '复制索引名', icon: Copy, run: async () => {
      const ok = await copyText(it.index!);
      store.notify(ok ? 'success' : 'error', ok ? '已复制索引名' : '复制失败');
    } }] : []),
  ];
  const moreChildren = [
    ...(props.actions.includes('newtab') ? [{ key: 'newtab', label: '回放到新 Tab', icon: ExternalLink, run: emitAndClose('newtab') }] : []),
    ...(props.actions.includes('fav') && (!it.mode || it.mode === 'dsl')
      ? [{ key: 'fav', label: '转为收藏（保存的搜索）', icon: Star, run: emitAndClose('fav') }] : []),
    ...(props.actions.includes('rename') ? [{ key: 'rename', label: '重命名', icon: Pencil, run: emitAndClose('rename') }] : []),
    ...(props.actions.includes('del') ? [{ key: 'del', label: '删除此条', icon: Trash2, danger: true, sep: true, run: emitAndClose('del') }] : []),
  ];
  return [
    ...(props.actions.includes('play') ? [{ key: 'play', label: '回放 / 执行', icon: Play, run: emitAndClose('play') }] : []),
    ...(props.actions.includes('fill') ? [{ key: 'fill', label: '仅填入', icon: CornerUpLeft, run: emitAndClose('fill') }] : []),
    ...(props.actions.includes('curl') ? [{ key: 'curl', label: '复制为 curl', icon: Terminal, run: emitAndClose('curl') }] : []),
    { key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: copyChildren },
    ...(moreChildren.length ? [{ key: 'more-group', label: '更多操作…', icon: Pencil, children: moreChildren }] : []),
  ];
});

function gotoIndex(idx?: string) {
  if (!idx) return;
  router?.push({ path: '/indices', query: { idx } });
}

/* 过滤词按 route 维度草稿化（39/52/53 批列表态偏好口径）——两个入口各自记忆互不串扰 */
const filter = useScopedDraft('hist-filter', { route: route.path || 'query' });
/* v-model 直连顶层 ref（嵌套 ref 不解包，直接绑 filter.text 会脏写） */
const kw = filter.text;
const shown = computed(() => {
  const k = kw.value.trim().toLowerCase();
  if (!k) return props.items;
  return props.items.filter(it =>
    (it.query || '').toLowerCase().includes(k)
    || (it.index || '').toLowerCase().includes(k)
    || (it.name || '').toLowerCase().includes(k)
    || (it.params || '').toLowerCase().includes(k)
  );
});

/* 1071：参数徽标文案——合法数组出「参数 N」，历史里畸形值只出「参数」不猜数量 */
function paramsTag(raw: string): string {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? `参数 ${v.length}` : '参数';
  } catch { return '参数'; }
}

async function copyIt(it: HistRow) {
  if (!it.query) return;
  const ok = await copyText(it.query);
  store.notify(ok ? 'success' : 'error', ok ? '已复制查询文本' : '复制失败');
}

/* 导出当前过滤结果为 JSON（与 92 批 RestView 历史导出同语义——
 历史上限 100 条，找得到也要带得走；文件名含 route 维度区分双入口） */
/* 导入合并（消费方闭环——95 批 title 诚实化问题就此解封） */
const importFileEl = ref<HTMLInputElement | null>(null);
const importing = ref(false);
async function onImportFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (!f || importing.value) return;
  importing.value = true;
  try {
    const list = JSON.parse(await f.text());
    const r = hist.mergeFrom(list);
    store.notify(r.added ? 'success' : 'info', `导入完成：新增 ${r.added} 条，跳过重复/无效 ${r.skipped} 条`);
  } catch (err: any) {
    store.notify('error', '导入失败：' + String(err?.message ?? err).slice(0, 100));
  } finally { importing.value = false; }
}

function exportShown() {
  if (!shown.value.length) return;
  const seg = route.path.replace(/^\//, '').replace(/\//g, '-') || 'history';
  store.notify('success', `已导出 ${shown.value.length} 条历史`);
  /* exportRow 传入时按调用方映射取行（保留条目特有字段），缺省维持既有字段集 */
  const rows = props.exportRow
    ? shown.value.map(props.exportRow)
    : shown.value.map(it => ({
        mode: it.mode, name: it.name, index: it.index, query: it.query,
        /* 1071：有参数才写键——无参数历史的导出形态与旧版逐字节一致 */
        ...(it.params ? { params: it.params } : {}),
        took: it.took, ts: it.ts,
      }));
  downloadText(
    `query-history-${seg}-${exportStamp()}.json`,
    JSON.stringify(rows, null, 2),
    'application/json;charset=utf-8',
  );
}

function modeLabel(k: string): string {
  return QUERY_MODES.find(m => m.k === k)?.t || k;
}
/* fmtTook/tookClass 前置下沉 utils/format.ts 单一出处（DevToolsView 复制品同步退役） */
</script>

<style scoped>
/* 工具行：表格顶部紧凑口径，单行放过滤/计数/清空 */
.qhp-bar { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }
/* 落位与内衬归本类（原 .qhp-filter 的 flex/height/font/padding 逐值迁入；
 胶囊壳三件套与内建 Search 图标归 SearchFilterBar 单源，高度链零变动） */
.qhp-sfb { flex: 1; min-width: 0; height: 26px; font-size: var(--fs-sm); padding: 0 var(--sp-2); }
.qhp-cnt { font-size: var(--fs-2xs); color: var(--tx2); font-variant-numeric: tabular-nums; flex-shrink: 0; }
/* 空态留白走全站契约 34px 16px（theme.css .empty 注释明令，与 EmptyState 组件同值）；
 16px 等值收 --sp-4（34px 契约值保字面， st-list-empty 先例） */
.qhp-empty { padding: 34px var(--sp-4); text-align: center; font-size: var(--fs-sm); color: var(--tx2); }
.qhp-list { display: flex; flex-direction: column; gap: var(--sp-1h); max-height: 56vh; overflow-y: auto; }
.qhp-item {
  padding: var(--sp-2) var(--sp-2h); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s);
  transition: border-color .12s, background .12s;
}
.qhp-item.clickable { cursor: pointer; }
.qhp-item.clickable:hover { border-color: var(--ac-line); background: var(--ac-soft); }
.qhp-row { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: 3px; }
.qhp-mode {
  font-size: var(--fs-2xs); font-weight: 600; padding: 0 var(--sp-1h); border-radius: var(--r-xs); line-height: 17px;
  background: var(--bg2); border: 1px solid var(--line); color: var(--tx1); flex-shrink: 0;
}
/* 1071：参数徽标与 mode 徽标同构（品牌色区分「这条回放会带参数」） */
.qhp-params {
  font-size: var(--fs-2xs); font-weight: 600; padding: 0 var(--sp-1h); border-radius: var(--r-xs); line-height: 17px;
  background: var(--ac-soft); border: 1px solid var(--ac-line); color: var(--ac-hi); flex-shrink: 0;
}
.qhp-idx {
  font-size: var(--fs-2xs); color: var(--ac-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 180px; flex-shrink: 1;
}
/* 索引名芯片化——hover 下划线+指针，语义为可点击跳转 */
.qhp-idx-go { cursor: pointer; }
.qhp-idx-go:hover { text-decoration: underline; }
.qhp-fail {
  width: 8px; height: 8px; flex-shrink: 0;
  border-radius: 50%; background: var(--err); cursor: help;
  /* W8：失败点光晕合并全站唯一焦点环档（--focus-ring），不再自写 3px 环 */
  box-shadow: var(--focus-ring);
} /* ：纯圆点（8px 无文字=无对比度合规负担；语义走 role/aria/title） */
.qhp-took {
  font-size: var(--fs-2xs); font-weight: 600; padding: 0 5px; border-radius: 3px; line-height: 16px;
  flex-shrink: 0; font-variant-numeric: tabular-nums;
}
.qhp-took.fast { background: var(--ok-soft); color: var(--ok); }
.qhp-took.ok { background: var(--bg2); color: var(--tx1); }
.qhp-took.slow { background: var(--warn-soft); color: var(--warn); }
.qhp-took.veryslow { background: var(--err-soft); color: var(--err); }
.qhp-name {
  font-size: var(--fs-xs); font-weight: 650; color: var(--ac-hi);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; flex-shrink: 1;
}
.qhp-time { margin-left: auto; font-size: var(--fs-2xs); color: var(--tx2); flex-shrink: 0; }
.qhp-acts { display: flex; gap: var(--sp-1); flex-shrink: 0; }
.qhp-q {
  font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 100%;
}
/* 可选摘要行——qhp-q 同语言降一级（fs-2xs/tx2 弱化，mono/ellipsis 同形）；
 顶距合并 --sp-0 半档（ --sp 裸值合并口径，与 .qhp-row margin-bottom 3px 刻意值同族豁免位） */
.qhp-sub {
  font-size: var(--fs-2xs); color: var(--tx2); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 100%; margin-top: var(--sp-0);
}
</style>
