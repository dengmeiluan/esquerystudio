<template>
  <div class="tg-page">
    <div class="tg-hd">
      <PageHeader :icon="BookOpen" title="DSL 模板画廊" :subtitle="TEMPLATES.length + ' 个即插即用模板 · 一键复制 / 直接送入沙盒 / 直接送 REST 面板'">
        <template #actions>
          <!-- 页头过滤胶囊组件化——SearchFilterBar 统一件，落位类 tg-search
 透传到组件根；值漂移（bg1/line/6px）随胶囊壳单源归一，Esc 清空内建（原行为等价）。
 本框无 Enter 接线（原样），命中定位/清除走卡片页自身语义 -->
          <SearchFilterBar v-model="kw" class="tg-search" placeholder="搜索：match / date / agg / 中文关键词都可" />
        </template>
      </PageHeader>
    </div>

    <div class="tg-cats">
      <div v-for="c in CATS" :key="c"
           class="tg-cat" :class="{ on: cat === c }"
           @click="cat = c" role="button" tabindex="0" @keydown.enter.prevent="cat = c" @keydown.space.prevent="cat = c">
        {{ c }}
        <span class="tg-cat-cnt">{{ countOf(c) }}</span>
      </div>
    </div>

    <div class="tg-grid">
      <div v-for="t in filtered" :key="t.id" class="tg-card" :class="{ open: expanded.has(t.id) }" tabindex="0"
        @contextmenu.prevent="openTgMenu($event, t)" @keydown="onTgMenuKey($event, t)" data-row-nav @keydown.self="rowArrowNav">
        <div class="tg-c-hd">
          <div class="tg-c-tt">
            <component :is="ICONS[t.icon] || Sparkles" :size="13" class="tg-c-ic" />
            <span><MarkText :text="t.title" :kw="kw" /></span>
          </div>
          <div class="tg-c-hd-r">
            <span class="tg-c-cat">{{ t.cat }}</span>
            <!-- ：代码区双态展开钮（铁律 C 双态同钮）——紧凑默认截断 18/23 卡，
 展开看全模板（铁律 F 信息可达），位置恒定卡头右缘（铁律 B） -->
            <button class="tg-c-expand" :aria-expanded="expanded.has(t.id) ? 'true' : 'false'"
                    :aria-label="expanded.has(t.id) ? '收起代码区' : '展开查看完整模板'"
                    :title="expanded.has(t.id) ? '收起代码区' : '展开查看完整模板'"
                    @click="toggleExpand(t)">
              <ChevronUp v-if="expanded.has(t.id)" :size="12" />
              <ChevronDown v-else :size="12" />
            </button>
          </div>
        </div>
        <div class="tg-c-desc"><MarkText :text="t.desc" :kw="kw" /></div>
        <!-- D：裸 JSON 换 highlightJson（pretty(t) 已是 pretty 串，着色 + json-view 全局范式） -->
        <pre class="tg-c-code json-view" role="button" tabindex="0" title="点击复制模板 JSON" @click="copy(t)" @keydown.enter.prevent="copy(t)" @keydown.space.prevent="copy(t)" v-html="highlightJson(pretty(t))"></pre>
        <div class="tg-c-ft">
          <span class="tg-c-tags">
            <!-- tag chip 改用 StatusPill 统一件（同语言）——「危险」语义归
 r 档（原 tg-tag-danger err 色档同 token），普通 tag 中性 n 档；tg-tag/tg-tag-danger
 私造皮退役；kw 高亮不在 StatusPill 契约内同步更新退役（tags 仍在过滤管线，见 filtered） -->
            <StatusPill v-for="tag in t.tags" :key="tag" :tone="tag === '危险' ? 'r' : 'n'" :label="tag" />
          </span>
          <span class="tg-c-actions">
            <button class="btn xs ghost" @click="copy(t)" :title="'复制到剪贴板'"><Copy :size="10" /> 复制</button>
            <button class="btn xs ghost" @click="toSandbox(t)"><Beaker :size="10" /> 沙盒</button>
            <button class="btn xs pri" @click="toQuery(t)"><Play :size="10" /> DSL</button>
            <button :aria-pressed="isFav(t) ? 'true' : 'false'"
                    :aria-label="isFav(t) ? '取消收藏该模板' : '收藏该模板'"
                    class="btn xs ghost tg-fav" :class="{ on: isFav(t) }"
                    @click="toggleFav(t)"
                    :title="isFav(t) ? '取消收藏' : '收藏该模板，可在收藏夹一键回放至搜索沙盒'"><Star :size="10" :fill="isFav(t) ? 'currentColor' : 'none'" /></button>
          </span>
        </div>
      </div>
      <!-- 纯静态数据，空只可能是过滤造成——直接给清除入口 -->
      <EmptyState
        v-if="filtered.length === 0"
        class="tg-empty"
        :icon="LayoutTemplate"
        :text="`未找到匹配模板（共 ${TEMPLATES.length} 个）`"
        hint="当前搜索词或分类把全部模板都筛掉了"
        action-text="清除搜索与分类"
        @action="kw = ''; cat = '全部'"
      />
    </div>

    <!-- 1155：模板卡右键——卡片底部原本五颗钮平铺（复制/沙盒/DSL/收藏/展开），
         右键把同一批能力按「打开去向 / 复制 / 收藏 / 代码区」分两级，鼠标用户不必扫按钮行。 -->
    <CellContextMenu v-if="tgMenu" :x="tgMenu.x" :y="tgMenu.y"
      :title="'模板 · ' + tgMenu.t.title" :items="tgMenuItems" @close="tgMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  BookOpen, Copy, Beaker, Play, Sparkles, LayoutTemplate, Star, ChevronDown, ChevronUp,
  Search as IcSearch, ListFilter, BarChart3, TrendingUp, Calendar, Layers, Gauge,
  Filter, Highlighter, GitCompare, Boxes, Percent, Sigma, CornerDownRight, Code2,
} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { useAppStore } from '../stores/app';
/* 页头过滤胶囊统一件（wt/fv/tg 同场景合并）；Search 图标随胶囊组件化内建 */
import SearchFilterBar from '../components/SearchFilterBar.vue';
import MarkText from '../components/MarkText.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：tag chip 统一件（tg-tag 双档退役） */
import { useScopedDraft } from '../composables/useScopedDraft';

import { copyText } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
import EmptyState from '../components/EmptyState.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const router = useRouter();
const store = useAppStore();
/* 原设想的 URL 化未实施——实为 useScopedDraft 的 sessionStorage 草稿
 （同标签页刷新保留、跨标签页不共享、无深链分享； 史志注释如实化） */
const kw = useScopedDraft('kw', { route: 'templates-gallery' }, '').text;
const cat = useScopedDraft('cat', { route: 'templates-gallery' }, '全部').text;

/* ：单卡双态展开——紧凑默认 130px 截断 18/23 卡（ 实测最长 32 行
 仅可见 ~7 行），展开解除上限看全模板；展开属临时浏览态不落盘（刷新回默认紧凑，
 与筛选/草稿类持久态区分，铁律 B 的「状态不重置」针对持久语义非浏览态） */
const expanded = ref(new Set<string>());
function toggleExpand(t: Tpl) {
  const next = new Set(expanded.value);
  if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
  expanded.value = next;
}

const ICONS: Record<string, any> = {
  Search: IcSearch, ListFilter, BarChart3, TrendingUp, Calendar, Layers, Gauge,
  Filter, Highlighter, GitCompare, Boxes, Percent, Sigma, Sparkles,
};

interface Tpl { id: string; cat: string; title: string; desc: string; body: any; tags: string[]; icon: string; }

const TEMPLATES = computed<Tpl[]>(() => [
  /* --- 查询 --- */
  { id: 'q-match-all', cat: '查询', icon: 'Search', title: 'match_all（全表 20 条）', desc: '最基础查询，快速探索索引', tags: ['基础'], body: { size: 20, query: { match_all: {} } } },
  { id: 'q-match', cat: '查询', icon: 'Search', title: 'match 单字段', desc: '分词匹配，最常用', tags: ['全文'], body: { size: 20, query: { match: { title: '关键词' } } } },
  { id: 'q-multi-match', cat: '查询', icon: 'Search', title: 'multi_match 多字段', desc: 'best_fields 多字段全文', tags: ['全文'], body: { query: { multi_match: { query: '关键词', fields: ['title^2', 'content'], type: 'best_fields' } } } },
  { id: 'q-term', cat: '查询', icon: 'ListFilter', title: 'term 精确值（.keyword）', desc: '不分词精确匹配', tags: ['精确'], body: { query: { term: { 'status.keyword': 'active' } } } },
  { id: 'q-terms', cat: '查询', icon: 'ListFilter', title: 'terms 多值', desc: 'IN 语义', tags: ['精确'], body: { query: { terms: { 'status.keyword': ['active', 'pending'] } } } },
  { id: 'q-range', cat: '查询', icon: 'Calendar', title: 'range 时间窗（最近 7 天）', desc: '时间维度过滤，now-7d/d', tags: ['时间'], body: { query: { range: { '@timestamp': { gte: 'now-7d/d', lte: 'now/d' } } } } },
  { id: 'q-bool', cat: '查询', icon: 'Filter', title: 'bool 组合（must + filter + must_not）', desc: '生产查询骨架', tags: ['组合'], body: { query: { bool: { must: [{ match: { title: '债券' } }], filter: [{ term: { 'status.keyword': 'active' } }, { range: { publishDate: { gte: 'now-30d' } } }], must_not: [{ term: { 'category.keyword': 'test' } }] } } } },
  { id: 'q-wildcard', cat: '查询', icon: 'Search', title: 'wildcard 通配', desc: '注意慢，谨慎在生产使用', tags: ['慢查询'], body: { query: { wildcard: { 'code.keyword': { value: '01*', case_insensitive: true } } } } },
  { id: 'q-prefix', cat: '查询', icon: 'Search', title: 'prefix 前缀', desc: '比 wildcard 快，索引前缀', tags: ['前缀'], body: { query: { prefix: { 'code.keyword': '019' } } } },
  { id: 'q-exists', cat: '查询', icon: 'Filter', title: 'exists 字段存在', desc: '找有值的文档', tags: ['字段'], body: { query: { exists: { field: 'externalId' } } } },
  /* --- 聚合 --- */
  { id: 'a-terms', cat: '聚合', icon: 'BarChart3', title: 'terms 分组（Top 20）', desc: '按 keyword 分组计数', tags: ['分组'], body: { size: 0, aggs: { by_status: { terms: { field: 'status.keyword', size: 20 } } } } },
  // calendar_interval 是 7.x 语法，6.x 只认 interval——模板跟着当前集群版本出
  { id: 'a-date-histogram', cat: '聚合', icon: 'Calendar', title: 'date_histogram 时间桶', desc: '按天分桶统计', tags: ['时间'], body: { size: 0, aggs: { by_day: { date_histogram: { field: '@timestamp', ...(store.verBelow('7.0.0') ? { interval: 'day' } : { calendar_interval: 'day' }), min_doc_count: 0 } } } } },
  { id: 'a-nested', cat: '聚合', icon: 'Layers', title: '嵌套聚合（terms + avg）', desc: '分组内求平均', tags: ['嵌套'], body: { size: 0, aggs: { by_industry: { terms: { field: 'industry.keyword', size: 20 }, aggs: { avg_amount: { avg: { field: 'amount' } } } } } } },
  { id: 'a-percentiles', cat: '聚合', icon: 'Percent', title: 'percentiles 分位数（P50/95/99）', desc: '响应时间监控经典', tags: ['分位'], body: { size: 0, aggs: { rt_percentiles: { percentiles: { field: 'responseTime', percents: [50, 95, 99] } } } } },
  { id: 'a-cardinality', cat: '聚合', icon: 'Sigma', title: 'cardinality 唯一值统计', desc: 'UV/PV 用户数（近似）', tags: ['去重'], body: { size: 0, aggs: { unique_users: { cardinality: { field: 'userId.keyword', precision_threshold: 3000 } } } } },
  { id: 'a-composite', cat: '聚合', icon: 'GitCompare', title: 'composite 分页聚合', desc: '大规模分组时避免 OOM', tags: ['大数据'], body: { size: 0, aggs: { pages: { composite: { size: 100, sources: [{ status: { terms: { field: 'status.keyword' } } }] } } } } },
  /* --- 高亮/排序 --- */
  { id: 'h-highlight', cat: '搜索优化', icon: 'Highlighter', title: 'highlight 高亮片段', desc: '前端展示搜索结果关键片段', tags: ['高亮'], body: { query: { match: { content: '关键词' } }, highlight: { fields: { content: { fragment_size: 150, number_of_fragments: 3 } }, pre_tags: ['<em>'], post_tags: ['</em>'] } } },
  { id: 'h-sort-score', cat: '搜索优化', icon: 'TrendingUp', title: '排序：_score + 时间', desc: '相关度优先，同分按时间倒序', tags: ['排序'], body: { query: { match: { title: '关键词' } }, sort: [{ _score: 'desc' }, { '@timestamp': 'desc' }] } },
  { id: 'h-source', cat: '搜索优化', icon: 'Gauge', title: '_source 字段裁剪', desc: '大文档只取需要字段', tags: ['性能'], body: { _source: ['id', 'title', 'code', '@timestamp'], query: { match_all: {} } } },
  { id: 'h-search-after', cat: '搜索优化', icon: 'Boxes', title: 'search_after 深度分页', desc: '替代 from+size 深翻页', tags: ['分页'], body: { size: 50, sort: [{ '@timestamp': 'desc' }, { _id: 'asc' }], search_after: [1706000000000, 'last-id'], query: { match_all: {} } } },
  /* --- 运维 --- */
  { id: 'o-count', cat: '运维', icon: 'Sigma', title: '_count 快速计数', desc: '仅取计数不取文档', tags: ['运维'], body: { query: { match_all: {} } } },
  { id: 'o-delete-by-query', cat: '运维', icon: 'Filter', title: 'delete_by_query（谨慎）', desc: '按条件删除，需送 REST 面板执行', tags: ['危险'], body: { query: { range: { createTime: { lt: 'now-90d' } } } } },
  { id: 'o-update-by-query', cat: '运维', icon: 'Sparkles', title: 'update_by_query（谨慎）', desc: '批量更新字段', tags: ['危险'], body: { query: { term: { 'flag.keyword': 'old' } }, script: { source: 'ctx._source.flag = "new"', lang: 'painless' } } },
]);

const CATS = ['全部', '查询', '聚合', '搜索优化', '运维'];
function countOf(c: string) { return c === '全部' ? TEMPLATES.value.length : TEMPLATES.value.filter(t => t.cat === c).length; }
const filtered = computed(() => {
  const q = kw.value.trim().toLowerCase();
  return TEMPLATES.value.filter(t => (cat.value === '全部' || t.cat === cat.value)
    && (!q || t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.tags.some(g => g.toLowerCase().includes(q)) || JSON.stringify(t.body).toLowerCase().includes(q)));
});
function pretty(t: Tpl) { return JSON.stringify(t.body, null, 2); }

function copy(t: Tpl) {
  /* 诚实口径（282 扫尾——此前剪贴板被拦也报已复制） */
  copyText(pretty(t)).then(ok => store.notify(ok ? 'success' : 'error', ok ? `模板已复制：${t.title}` : '复制失败'));
}
function toSandbox(t: Tpl) {
  writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.body', pretty(t));
  router.push({ path: '/search', query: { mode: 'sandbox' } });
  store.notify('info', `模板已送入搜索沙盒：${t.title}`);
}
function toQuery(t: Tpl) {
  writeStoredRaw(sessionStorage, 'esquerystudio.dsl.body', pretty(t));
  /* ：显式 mode=dsl 落点钉死——QueryHub 无 ?mode= 时按 qh.mode 记忆
 回落上次模式（上次停留沙盒 tab 时本动线被带进沙盒页， 读数实证）；深链
 mode 优先于记忆，与 toSandbox 显式带 mode 同范式（铁律 B 落点恒定） */
  router.push({ path: '/search', query: { mode: 'dsl' } });
  store.notify('info', `模板已送入查询工作台：${t.title}`);
}

/* 模板收藏写侧——收藏夹 kind:'template' 此前全站零写侧（分类 tab 与
 favReplay 回放分支都在，却无处创建）。收藏后从收藏夹一键回放至搜索沙盒。
 ：Star 双态回显+取消通道——aria-pressed+实心态标记已收藏，
 再点即 removeFavorite（addFavorite 按 kind+title 幂等覆盖，写侧契约不破） */
function isFav(t: Tpl) {
  return store.favorites.some(f => f.kind === 'template' && f.title === t.title);
}
/* ═══ 1155：模板卡右键（与 watch/ILM 卡片菜单同一两级语言）═══
 一级 = 去向（沙盒 / 查询工作台）+ 分组父行；复制、收藏、代码区折叠收进二级。
 底部按钮行原样保留（触屏无右键），右键是给鼠标用户的快通道。 */
const tgMenu = ref<{ x: number; y: number; t: Tpl } | null>(null);
function openTgMenu(e: MouseEvent, t: Tpl) {
  tgMenu.value = { x: e.clientX, y: e.clientY, t };
}
function onTgMenuKey(e: KeyboardEvent, t: Tpl) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  tgMenu.value = { ...menuKeyAnchor(e), t };
}
const tgMenuItems = computed<CcmItem[]>(() => {
  const m = tgMenu.value; if (!m) return [];
  const t = m.t;
  const body = pretty(t);
  return [
    { key: 'to-sandbox', label: '送入搜索沙盒', icon: Beaker, run: () => toSandbox(t) },
    { key: 'to-query', label: '送入查询工作台（DSL）', icon: Play, run: () => toQuery(t) },
    {
      key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'copy-json', label: '复制模板 JSON', icon: Copy, run: () => copy(t) },
        { key: 'copy-title', label: '复制模板标题', icon: CornerDownRight, run: async () => {
          const ok = await copyText(t.title);
          store.notify(ok ? 'success' : 'error', ok ? '已复制标题：' + t.title : '复制失败');
        } },
        { key: 'copy-body-curl', label: '复制为 cURL（POST _search）', icon: Code2, run: async () => {
          const curl = `curl -XPOST '<你的集群>/_search' -H 'Content-Type: application/json' -d '${body.replace(/'/g, "'\''")}'`;
          const ok = await copyText(curl);
          store.notify(ok ? 'success' : 'error', ok ? '已复制 cURL' : '复制失败');
        } },
      ],
    },
    {
      key: 'fav-group', label: '收藏…', icon: Star, children: [
        { key: 'fav-toggle', label: isFav(t) ? '取消收藏该模板' : '收藏该模板', icon: Star, run: () => toggleFav(t) },
      ],
    },
    {
      key: 'view-group', label: '代码区…', icon: ChevronDown, children: [
        { key: 'exp-toggle', label: expanded.value.has(t.id) ? '收起代码区' : '展开查看完整模板', icon: ChevronDown, run: () => toggleExpand(t) },
      ],
    },
  ];
});

function toggleFav(t: Tpl) {
  const hit = store.favorites.find(f => f.kind === 'template' && f.title === t.title);
  if (hit) {
    store.removeFavorite(hit.id);
    store.notify('info', `已取消收藏：${t.title}`);
    return;
  }
  store.addFavorite({
    kind: 'template',
    title: t.title,
    subtitle: t.desc,
    payload: pretty(t),
    tags: ['template', 'gallery'],
  });
  store.notify('success', `已收藏：${t.title}（收藏夹可一键回放）`);
}
</script>

<style scoped>
/* G6-S1：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 亚阶梯(≤3px) / 行级密排不动。
 九档等值收口（含半档 --sp-0/-1h/-2h = 2/6/10px），6/10/12px 等值 px 退役；1/3/5px 刻意值保字面 */
.tg-page { display: flex; flex-direction: column; gap: var(--sp-4); }
/* E：头部行允许换行——窄屏下 .tg-search（min-width:320px）不再把标题行横向顶爆 */
.tg-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); flex-wrap: wrap; }
/* 值漂移（bg1/line/radius 6px）随胶囊壳组件化归 SearchFilterBar 单源
 （panel 底+border-subtle+8px）；min-width 320px → min(320px,100%) 极窄溢出钳制
 （529 带兜底范式）；gap/padding 留本类（padding 对齐现行，高度结构零变动） */
.tg-search { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-2h); min-width: min(320px, 100%); }

.tg-cats { display: flex; gap: var(--sp-2); flex-wrap: wrap; padding-bottom: var(--sp-1); border-bottom: 1px dashed var(--line); }
.tg-cat { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-3); border-radius: 999px; background: var(--bg2); color: var(--tx1); font-size: var(--fs-sm); cursor: pointer; transition: all var(--tr); border: 1px solid transparent; }
.tg-cat:hover { background: var(--bg3); color: var(--tx0); }
/* 选中态统一柔底+品牌描边（实心亮色+白字对比不足且脱离全站语言） */
.tg-cat.on { background: var(--ac-soft); color: var(--ac-hi); border-color: var(--ac-line); font-weight: 600; }
.tg-cat-cnt { font-size: var(--fs-xs); opacity: .8; padding: 0 var(--sp-1); }

/* 核对：卡片网格断点语义由 auto-fill + minmax(340px, 1fr) 内在承担（容器够宽自动多列、不足自动单列），
 无需 @media 断点—— 双档标准不适用本页 */
.tg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--sp-3); }
/* tg-card 卡壳退役（约定④：bg1+border+radius:8px 整块消除 → border-top 分节流）；
 hover 浮起（translateY+shadow）属 chrome 同步更新退役，顶部 hairline 变色承接悬停反馈；
 tg-c-code 代码内容面 bg2 语义保留（540 df 先例 carve-out）；类名保留
 （qualityThreeState 在场锁消费面） */
.tg-card { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-1) 0 var(--sp-3); border-top: 1px solid var(--line); }
.tg-card:hover { border-color: var(--ac); }

.tg-c-hd { display: flex; justify-content: space-between; align-items: center; }
.tg-c-tt { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-md); font-weight: 650; color: var(--tx0); }
.tg-c-ic { color: var(--ac-hi); }
.tg-c-hd-r { display: flex; align-items: center; gap: var(--sp-1h); }
.tg-c-cat { font-size: var(--fs-xs); padding: 1px var(--sp-1h); background: var(--bg2); border-radius: 999px; color: var(--tx2); }
/* ：展开钮——轻量图标钮（20px 圆角方块，ghost 同语言）；展开态品牌色 */
.tg-c-expand { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--r-xs); background: transparent; border: none; color: var(--tx2); cursor: pointer; padding: 0; }
.tg-c-expand:hover { color: var(--tx0); background: var(--bg2); }
.tg-card.open .tg-c-expand { color: var(--ac-hi); }

.tg-c-desc { font-size: var(--fs-xs); color: var(--tx2); }
.tg-c-code { flex: 1; background: var(--bg2); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-xs); font-family: var(--mono); font-size: var(--fs-xs); max-height: 130px; overflow-y: auto; white-space: pre-wrap; cursor: pointer; line-height: 1.5; margin: 0; color: var(--tx1); }
.tg-c-code:hover { background: var(--bg0); }
/* ：展开态解除紧凑上限看全模板（铁律 F）；紧凑默认 130px 零触。
 同排卡片等高随 grid 内在行为（浏览态临时，可接受） */
.tg-card.open .tg-c-code { max-height: none; }

.tg-c-ft { display: flex; justify-content: space-between; align-items: center; padding-top: var(--sp-1); border-top: 1px dashed var(--line); }
.tg-c-tags { display: flex; gap: var(--sp-1); flex-wrap: wrap; }
/* .tg-tag/.tg-tag-danger 私造 chip 皮随 StatusPill 改用退役（同语言）——
 普通 tag 中性 n 档、「危险」语义 r 档（err 色 token 同源），色板/胶囊形态归 .pill 单源 */
.tg-c-actions { display: flex; gap: var(--sp-1); }
/* ：收藏态视觉——品牌色实心星（aria-pressed 语义配套的卡面回显） */
.tg-fav.on { color: var(--ac-hi); }

/* 版式交由 EmptyState（padding 34px 16px），此处只保留父栅格契约 */
.tg-empty { grid-column: 1 / -1; }

/* 900 紧凑微调档——页 gap/卡片内距收一档兜密度（网格列数由 auto-fill
 minmax 内在自适应无需塌列，头行 .tg-hd 已 flex-wrap；：卡壳随分节流退役后横内衬归零） */
@media (max-width: 900px) {
  .tg-page { gap: var(--sp-3); }
  .tg-card { padding: var(--sp-0) 0 var(--sp-2); }
}
</style>
