<template>
  <div class="mft" ref="rootEl">
    <!-- 字段行右键菜单（复制路径/复制类型/复制完整字段信息/analyzer 快验联动） -->
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y"
      :title="'字段 ' + rowMenu.f.path" :items="rowMenuItems" @close="rowMenu = null" />
    <!-- 查询 DSL 污染警示——mapping 里出现 query.bool.* 是「查询体被当文档写入」的铁证，
 不识别它，用户会以为是业务字段甚至以为控制台显示坏了 -->
    <div v-if="pollutedRoots.length" class="mft-warn">
      <ShieldAlert :size="13" style="flex-shrink:0" />
      <span>
        检测到疑似<b>查询 DSL 误写入</b>固化的字段：<b class="mono">{{ pollutedRoots.join('、') }}</b>
        ——大概率是查询请求体被当成文档索引后由 dynamic mapping 自动生成，并非业务字段。
        字段一旦生成无法删除，彻底清理需零停机重建。
      </span>
      <button class="btn sm ghost" style="flex-shrink:0" @click="togglePolluted">
        {{ pollutedCollapsed ? '展开查看' : '折叠这些字段' }}
      </button>
      <!-- 警示闭环——只告知「需零停机重建」不给入口是把用户扔在半路；
 直达托管重建并携带污染根清单，向导侧自动剔除 + dynamic:false 防复染 -->
      <button v-if="index" class="btn sm warn" style="flex-shrink:0" @click="gotoRebuild">
        <Hammer :size="12" /> 去零停机重建
      </button>
    </div>

    <div class="mft-bar">
      <!-- 轨4：手作绝对图标过滤胞改用 SearchFilterBar 单源（sfbUnify650 锁）——
 壳三件套+图标归组件（padding-left:30px 内联 hack 退役），Esc 清空内建承接
 （原裸 input 无 Esc 语义=补课），Enter 定位轮转经 @enter 接线语义等价 -->
      <SearchFilterBar v-model="kwLocal" class="mft-sfb" placeholder="过滤字段名 / 类型 / analyzer…" @enter="onHitKey" />
      <!-- 搜索定位：命中计数 + 上/下一个（输入框复用上面的过滤框，Enter/Shift+Enter 接线） -->
      <HitNav :count="hitIdxMap.size" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
      <button v-if="collapsibles.length" class="btn sm ghost" @click="toggleAll">
        <component :is="allCollapsed ? ChevronsUpDown : ChevronsDownUp" :size="12" />
        {{ allCollapsed ? '全部展开' : '全部折叠' }}
      </button>
    </div>

    <div class="scroll-y" :style="{ maxHeight }">
      <table class="tbl">
        <thead><tr><th>字段</th><th style="width:110px">类型</th><th>属性</th></tr></thead>
        <tbody>
          <tr
            v-for="f in shownRows" :key="f.path"
            :class="{ 'mft-pollute': pollutedSet.has(rootOf(f)), 'mft-struct': searching && !hitIdxMap.has(f.path), 'mft-hit': searching && hitIdxMap.has(f.path) }"
            :data-hit-idx="hitIdxMap.get(f.path)"
          >
            <td class="mono mft-cell">
              <!-- 缩进导线——纯 paddingLeft 的层级在深树里肉眼难对齐，竖导线才读得出父子归属。
 搜索态保留导线：祖先是真实结构行（不再是灰显路径前缀），层级依旧一眼可辨 -->
              <span v-for="i in f.depth" :key="i" class="mft-guide"></span>
              <!-- object 行可折叠；搜索态强制展开命中子树（折叠集被绕过），不再出折叠钮 -->
              <button v-if="f.hasChildren && !searching" class="mft-fold" :aria-label="collapsed.has(f.path) ? '展开子字段' : '收起子字段'" @click="toggle(f.path)">
                <component :is="collapsed.has(f.path) ? ChevronRight : ChevronDown" :size="12" />
              </button>
              <span v-else-if="f.depth" class="mft-tree">└</span>
              <span class="mft-name" :title="f.path + '（点击复制路径 · 右键更多操作）'" tabindex="0" role="button" @keydown.enter.prevent="copyPath(f.path)" @keydown.space.prevent="copyPath(f.path)" @click="copyPath(f.path)" @keydown="onRowMenuKey($event, f)"
                @contextmenu.prevent="openRowMenu($event, f)"><!--
                --><template v-for="(seg, si) in hlSegs(f.name)" :key="si"><!--
                  --><mark v-if="seg.hit" class="mft-mark">{{ seg.t }}</mark><!--
                  --><template v-else>{{ seg.t }}</template><!--
                --></template><!--
              --></span>
              <!-- multi-field 不再压在 attrs 文本里被截断，层级化子行 + 显式徽标 -->
              <span v-if="f.multi" class="mft-mf" title="multi-field（fields.*）：同一段数据的另一种索引方式，查询时用完整路径引用">多字段</span>
              <span v-if="f.hasChildren && collapsed.has(f.path) && !searching" class="mft-count" tabindex="0" role="button" :aria-label="'展开 ' + f.path + ' 的 ' + childCount(f.path) + ' 个子字段'" @keydown.enter.prevent="toggle(f.path)" @keydown.space.prevent="toggle(f.path)" @click="toggle(f.path)">
                +{{ childCount(f.path) }} 字段
              </span>
              <span v-if="pollutedSet.has(rootOf(f)) && !f.depth" class="mft-badge">疑似 DSL 污染</span>
            </td>
            <td><span class="chip mono mft-type" :data-t="f.type">{{ f.type }}</span></td>
            <td class="mono mft-attrs" :title="f.attrs">
<!--
 分析器组件名一键验证——名字点击=组件本体快验（/analyze）；
 text 字段行另给「字段验证」= 真实写入链路（/analyzer-lab field 通道，真实样本+三链路并排）
            --><template v-for="(seg, si) in attrTokens(f.attrs)" :key="si">
<!--
              --><span v-if="si > 0" class="mft-attr-sep">, </span><!--
              --><template v-if="seg.kind"><span class="mft-attr-k">{{ seg.k }}: </span><a class="mft-attr-link" role="link" tabindex="0" :title="'验证「' + seg.v + '」的分词效果'" @click="goAnalyze(seg.kind!, seg.v!)" @keydown.enter.prevent="goAnalyze(seg.kind!, seg.v!)">{{ seg.v }}</a></template><!--
              --><template v-else>{{ seg.raw }}</template><!--
            -->
</template><!--
              --><button v-if="f.type === 'text' && f.path" class="btn sm ghost mft-try" title="按字段验证：真实样本 + field/analyzer/search_analyzer 三链路并排"
                    @click="goFieldLab(f.path)">
字段验证
</button>
          </td>
          </tr>
        </tbody>
      </table>
      <!-- 两处裸 .empty 迁 EmptyState compact（字段树内嵌窄容器），清除过滤改 actionText 等价保留 -->
      <EmptyState v-if="!shownRows.length && rows.length" compact :icon="Search"
        :text="'无匹配字段（共 ' + rows.length + ' 个，被当前关键字隐藏，0 命中）'"
        action-text="清除过滤" @action="kwLocal = ''" />
      <EmptyState v-else-if="!shownRows.length" compact :icon="Braces"
        text="该索引没有任何字段（空 mapping 或纯动态索引）" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Search, ChevronRight, ChevronDown, ChevronsUpDown, ChevronsDownUp, ShieldAlert, Hammer, Copy, Braces } from 'lucide-vue-next';
import { flattenMapping, detectDslPollution, visibleRows, descendantCount, type MappingRow } from '../utils/mappingTree';
import { copyText } from '../utils/format';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
/* 两处裸 .empty 迁 EmptyState compact */
import EmptyState from './EmptyState.vue';
import SearchFilterBar from './SearchFilterBar.vue'; /* 轨4：手作绝对图标过滤胞改用统一件（sfbUnify650 锁） */
/* 搜索命中排序统一 rank 口径（精确>前缀>包含，与 FieldPicker/FieldSelect 同源） */
import { searchFields } from '../utils/fieldSearch';
import CellContextMenu from './CellContextMenu.vue';
import { useAppStore } from '../stores/app';
import { askConfirm } from '../composables/confirm';
import { useHitLocate } from '../composables/useHitNav';
import { useScopedDraft } from '../composables/useScopedDraft';
/* hlSegs 手写切分收口 splitMark 单源（useGridSearch 起带数值归一二遍） */
import { splitMark } from '../composables/useGridSearch';
import HitNav from './HitNav.vue';

/* Mapping 字段树统一组件——MappingView 与索引工作区 Mapping Tab 共用。
 核心主张：嵌套可折叠（默认收起深树）、搜索显全路径、点击复制路径、DSL 污染显式警示。 */
const props = withDefaults(defineProps<{
  /** ES mapping 的 properties 对象（多物理索引时视图侧先合并） */
  properties: Record<string, any> | null | undefined;
  /** 外部受控过滤词（如 MappingView 的 URL kw），不传则组件内自治 */
  keyword?: string;
  maxHeight?: string;
  /** 索引名——传入后污染警示条显示「去零停机重建」直达 CTA */
  index?: string;
}>(), { keyword: undefined, maxHeight: '60vh', index: '' });
const emit = defineEmits<{ (e: 'update:keyword', v: string): void; (e: 'analyze', f: any): void }>();

const store = useAppStore();
const router = useRouter();

/* ═══ ：分析器联动（定义/引用 → 一键验证闭环）═══
 attrs 属性摘要拆段：分词语义键（analyzer/search_analyzer/normalizer/tokenizer/filter/char_filter）
 的值渲染为可点名字，点击跳 /analyze 预填并自动执行（组件本体快验）；
 text 字段行附「字段验证」跳 /analyzer-lab?field=<path>（真实写入链路，嵌套/multi-field
 路径整体交给 ES 解析——search_analyzer 实际生效链只有 ES 自己知道）。 */
interface AttrSeg { raw: string; k?: string; v?: string; kind?: string }
const ANALYZE_KIND: Record<string, string> = {
  analyzer: 'analyzer', search_analyzer: 'analyzer', normalizer: 'normalizer',
  tokenizer: 'tokenizer', filter: 'filter', char_filter: 'char_filter',
};
function attrTokens(attrs: string): AttrSeg[] {
  if (!attrs) return [];
  /* attrsOf 的多属性分隔符是中点「·」（mappingTree.ts），值内不会有 */
  return attrs.split(/\s*·\s*/).map(part => {
    const m = part.match(/^(analyzer|search_analyzer|normalizer|tokenizer|filter|char_filter)\s*:\s*(.+)$/);
    return m ? { raw: part, k: m[1], v: m[2].trim(), kind: ANALYZE_KIND[m[1]] } : { raw: part };
  });
}
function goAnalyze(kind: string, name: string) {
  router.push({ path: '/analyze', query: { ...(props.index ? { idx: props.index } : {}), kind, name } });
}
function goFieldLab(path: string) {
  router.push({ path: '/analyzer-lab', query: { ...(props.index ? { idx: props.index } : {}), field: path } });
}

/* 污染警示→托管重建闭环：携带索引名与污染根清单，向导侧预剔除并设防复染。
 托管重建恒定作用于宿主集群——数据面在远程目标时，宿主未必有同名同构索引，
 不拦一道会把用户带进「向导预填与本页所见不一致」的迷惑现场 */
async function gotoRebuild() {
  if (store.isRemote && !await askConfirm({
    title: '托管重建作用于宿主集群',
    message: `当前浏览的是「${store.targetName}」上的索引，而托管重建恒定作用于宿主集群：`
      + '若宿主集群没有同名索引或结构不同，向导预填将与本页所见不一致。'
      + '跨集群治理请改用「跨集群迁移」。仍要继续吗？',
    okText: '仍去托管重建',
  })) return;
  router.push({ path: '/adhoc-rebuild', query: { index: props.index, stripDsl: pollutedRoots.value.join(',') } });
}

/* 过滤词：受控/自治双模。自治分支走会话草稿(按索引作用域)——
 切页签/切菜单/iframe 重建回到本页时过滤词不再丢( 用户实测痛点) */
const kwDraft = useScopedDraft(
  'filter', { route: 'indices-mapping', index: () => props.index || '' }, '');
const kwLocal = computed({
  get: () => (props.keyword !== undefined ? props.keyword : kwDraft.text.value),
  set: v => { if (props.keyword !== undefined) emit('update:keyword', v); else kwDraft.text.value = v; },
});
/* 换索引即清过滤——A 索引的字段过滤词不应串到 B */
watch(() => props.index, () => { kwDraft.clear(); });

const rows = computed<MappingRow[]>(() => flattenMapping(props.properties));
const pollutedRoots = computed(() => detectDslPollution(props.properties));
const pollutedSet = computed(() => new Set(pollutedRoots.value));
function rootOf(f: MappingRow): string { return f.ancestors[0] || f.path; }

/* 折叠态：默认把「疑似污染」子树收起来（噪音靠边），其余展开 */
const collapsed = ref<Set<string>>(new Set());
watch(pollutedRoots, roots => { collapsed.value = new Set(roots); }, { immediate: true });
const pollutedCollapsed = computed(() => pollutedRoots.value.every(r => collapsed.value.has(r)));
function togglePolluted() {
  const next = new Set(collapsed.value);
  if (pollutedCollapsed.value) pollutedRoots.value.forEach(r => next.delete(r));
  else pollutedRoots.value.forEach(r => next.add(r));
  collapsed.value = next;
}
function toggle(path: string) {
  const next = new Set(collapsed.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsed.value = next;
}
const collapsibles = computed(() => rows.value.filter(r => r.hasChildren).map(r => r.path));
const allCollapsed = computed(() => collapsibles.value.length > 0 && collapsibles.value.every(p => collapsed.value.has(p)));
function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(collapsibles.value);
}

const searching = computed(() => !!kwLocal.value.trim());

/* 行自身命中口径：路径 / 类型 / 属性摘要任一含关键字（与既有过滤口径一致） */
function rowMatch(f: MappingRow, k: string): boolean {
  return f.path.toLowerCase().includes(k)
    || f.type.toLowerCase().includes(k)
    || f.attrs.toLowerCase().includes(k);
}

/* 搜索态：保祖先过滤——节点自身或任一后代命中则保留，命中节点的全部祖先保留为结构行
 （TaskTreeView filteredRoots 同款先例：结构上下文不丢，用户不再在深树里迷失） */
/* 命中行排序接 fieldSearch.searchFields 统一 rank 口径（精确=0 > 前缀=1 > 包含=2，
 同级字母序）——此前按 mapping 原序，最相关的精确/前缀命中可能淹没在深树尾部。
 仅重排命中行先后并让祖先结构行跟随各自命中链输出，树形展示结构（层级导线）不变；
 type/attrs-only 命中（path 不含关键字）searchFields 不收录，统一归包含档殿后。 */
const searchedRows = computed<MappingRow[]>(() => {
  const k = kwLocal.value.trim().toLowerCase();
  if (!k) return [];
  const hits = rows.value.filter(f => rowMatch(f, k));
  if (!hits.length) return [];
  const ranked = searchFields({
    fields: rows.value.map(f => ({ path: f.path, type: f.type })),
    query: k, cap: Infinity,
  });
  const rankOf = new Map(ranked.flat.map(h => [h.path, h.rank]));
  const sorted = [...hits].sort((a, b) =>
    (rankOf.get(a.path) ?? 2) - (rankOf.get(b.path) ?? 2) || a.path.localeCompare(b.path));
  const byPath = new Map(rows.value.map(f => [f.path, f]));
  const emitted = new Set<string>();
  const out: MappingRow[] = [];
  for (const h of sorted) {
    for (const a of h.ancestors) {
      if (emitted.has(a)) continue;
      const row = byPath.get(a);
      if (row) { out.push(row); emitted.add(a); }
    }
    if (!emitted.has(h.path)) { out.push(h); emitted.add(h.path); }
  }
  return out;
});

const shownRows = computed<MappingRow[]>(() => {
  if (searching.value) return searchedRows.value; /* 折叠集被绕过：命中子树恒展开 */
  return visibleRows(rows.value, collapsed.value);
});

/* 命中定位：自身命中的行按渲染序编号 data-hit-idx 1..n；祖先结构行不占号 */
const hitIdxMap = computed<Map<string, number>>(() => {
  const m = new Map<string, number>();
  const k = kwLocal.value.trim().toLowerCase();
  if (!k) return m;
  let i = 0;
  for (const f of shownRows.value) if (rowMatch(f, k)) m.set(f.path, ++i);
  return m;
});

const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => hitIdxMap.value.size, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

/* 字段名命中片段拆分（模板 <mark> 渲染，插值天然转义，无 v-html 注入面——JsonTree renderHl 同款口径）。
 手写 while 切分退役收口 useGridSearch.splitMark 单源（JsonTree renderHl 先例，
 全站第四份纯文本切分实现归一）；返回结构保形 {t,hit}（模板消费点零变更），splitMark 的
 {t,m} 纯映射；数值归一二遍白得（两侧同数字形态整段 mark），字面切分行为零漂移。 */
function hlSegs(name: string): { t: string; hit: boolean }[] {
  const k = kwLocal.value.trim().toLowerCase();
  return splitMark(name, k).map(s => ({ t: s.t, hit: s.m }));
}
function childCount(path: string): number { return descendantCount(rows.value, path); }

/* ═══ ：字段行右键菜单 ═══ */
const rowMenu = ref<{ x: number; y: number; f: any } | null>(null);
function openRowMenu(e: MouseEvent, f: any) {
  rowMenu.value = { x: e.clientX, y: e.clientY, f };
}
function onRowMenuKey(e: KeyboardEvent, f: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), f };
}
const rowMenuItems = computed(() => {
  const rm = rowMenu.value; if (!rm) return [];
  const close = () => { rowMenu.value = null; };
  const f = rm.f;
  return [
    { key: 'copy-path', label: '复制字段路径', icon: Copy, run: () => { close(); void copyPath(f.path); } },
    { key: 'copy-type', label: '复制类型', icon: Copy, run: () => { close(); copyText(f.type).then(ok => store.notify(ok ? 'success' : 'error', ok ? '类型已复制' : '复制失败')); } },
    { key: 'copy-full', label: '复制完整字段信息', icon: Copy, run: () => { close(); copyText(f.path + ' · ' + f.type + (f.attrs ? ' · ' + f.attrs : '')).then(ok => store.notify(ok ? 'success' : 'error', ok ? '字段信息已复制' : '复制失败')); } },
    { key: 'analyze', label: 'analyzer 快验', icon: Search, run: () => { close(); emit('analyze', f); } },
  ];
});

async function copyPath(path: string) {
  /* 失败分支补齐（诚实口径——此前失败静默） */
  const ok = await copyText(path);
  store.notify(ok ? 'success' : 'error', ok ? '已复制字段路径：' + path : '复制失败');
}
</script>

<style scoped>
.mft { display: flex; flex-direction: column; gap: var(--sp-2); }
.mft-warn {
  display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-3); font-size: var(--fs-sm);
  color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft); border-radius: var(--r-m);
}
.mft-bar { display: flex; align-items: center; gap: var(--sp-2); }
/* 轨4：过滤胞改用 SFB 落位类（壳三件套+图标归组件单源，原手作绝对图标壳双规则退役） */
.mft-sfb { position: relative; flex: 1; height: 30px; padding: 0 var(--sp-2h); font-size: var(--fs-sm); }
.mft-cell { white-space: nowrap; }
/* 层级竖导线——每深一层一条，父子归属一眼可辨 */
.mft-guide { display: inline-block; width: 15px; height: 17px; vertical-align: -4px; border-left: 1px solid color-mix(in srgb, var(--line) 85%, var(--tx2)); }
.mft-mf {
  margin-left: 7px; font-size: var(--fs-2xs); padding: 0 var(--sp-1h); border-radius: 99px;
  color: var(--dv-cyan, var(--info)); border: 1px solid currentColor; opacity: .85;
}
.mft-fold {
  display: inline-flex; align-items: center; vertical-align: -2px; margin-right: 3px;
  background: none; border: 0; padding: 0; cursor: pointer; color: var(--tx2);
}
.mft-fold:hover { color: var(--tx0); }
.mft-tree { color: var(--tx2); margin-right: 5px; }
.mft-name { cursor: pointer; }
.mft-name:hover { text-decoration: underline dotted; text-underline-offset: 3px; }
/* 搜索定位：命中片段 <mark>（与 JsonTree .jt-mark 同一视觉语言，纯 token 无硬编码色） */
.mft-mark { background: var(--warn); color: var(--tx-on-strong); border-radius: 2px; padding: 0 1px; }
/* v3.0.0 纠错：命中行整行柔底——rowMatch 口径含 type/attrs 命中（关键字打在类型/分析器上时
 字段名无 <mark> 可看），此前命中行与上下文行完全同款，用户看不出该行为何被列为命中 */
tr.mft-hit td { background: var(--warn-soft); }
/* 搜索态的结构祖先行：不为命中、只作路径上下文，整体降一档存在感 */
.mft-struct .mft-name { color: var(--tx1); }
.mft-struct .mft-type, .mft-struct .mft-attrs { opacity: .78; }
/* 分析器名一键验证（虚线下划线=可点链接语义，info 蓝与类型徽标同族） */
.mft-attr-link { color: var(--info); cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
.mft-attr-link:hover { color: var(--ac-hi); }
.mft-attr-sep { opacity: .6; }
.mft-try { margin-left: var(--sp-2); }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
tr.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.mft-count {
  margin-left: var(--sp-2); font-size: var(--fs-2xs); color: var(--tx2); cursor: pointer;
  padding: 0 var(--sp-1h); border: 1px dashed var(--line); border-radius: 99px;
}
.mft-count:hover { color: var(--ac-hi); border-color: var(--ac-hi); }
.mft-badge {
  margin-left: var(--sp-2); font-size: var(--fs-2xs); padding: 0 var(--sp-1h); border-radius: 99px;
  color: var(--warn); border: 1px solid currentColor; opacity: .9;
}
.mft-pollute .mft-cell, .mft-pollute .mft-attrs { opacity: .72; }
.mft-type { font-size: var(--fs-xs); padding: 1px 7px; }
/* attrs 不再 ellipsis 后半截——允许换行，任何属性都看得全（title 仍保留供悬停确认） */
.mft-attrs { font-size: var(--fs-xs); color: var(--tx2); max-width: 340px; white-space: normal; word-break: break-word; line-height: 1.5; }
/* 超长字段名/深路径不被容器 hidden 掉——横向可滚，能滚到 = 能看全 */
.mft .scroll-y { overflow-x: auto; }
</style>
