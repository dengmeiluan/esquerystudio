<template>
  <div class="as-page">
    <div class="as-hd">
      <PageHeader :icon="Sliders" title="Analysis 全景">
      <template #subtitle>
        <span>一屏看全 analyzer / tokenizer / filter / char_filter / normalizer 五大类</span>
        <!-- 五枚 as-stat 统计条退役：改页头 inline 计数串（lv-* 配色沿用，数据全保留在此与 :title） -->
        <!-- 手写 meta-strip div 收敛 MetaStrip 统一件（值亮+标签暗+·分隔同构；
 数据与原 :title 全文等价拆到各段 tip；lv-* 五色不在 MetaStrip tone 语义档内，收敛为默认亮色）。
 .meta-strip 全局类退役（theme.css 全局块删除），落位改挂本页 .as-meta；
 class 上冗余 .mono 一并摘除（font-family 由组件 .ms 自带） -->
        <MetaStrip v-if="stats.total" class="as-meta" :items="hdMeta" />
      </template>
      <template #actions>
<CurrentIdxChip />
<button class="btn ghost sm" @click="doLoad" :disabled="!index || busy">
  <RefreshCw :size="12" :class="{ spinning: busy }" /> 加载
</button>
<button v-if="canReload" class="btn ghost sm" @click="doReload" :disabled="!index || busy">
  <Zap :size="12" /> 热重载搜索分词器
</button>
<button v-if="canOps" class="btn sm pri" @click="doSave" :disabled="!index || !loaded || busy || !hasChanges">
  <Save :size="12" /> 保存
</button>
      </template>
      </PageHeader>
</div>

    <!-- 只读身份的前置说明：保存/热重载钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps && !canReload" class="as-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：Analysis 的保存/热重载不可用；需要集群 analysis 写权限。
    </div>

    <!-- 五枚统计条退役：原 .as-stat-row 独立横幅删除，计数并入页头 as-meta 串 -->

    <!-- 加载失败档：与初始引导空态分两档，给原因 + 重试（重发 doLoad）。
 .as-empty 裸 div 换 EmptyState compact 统一件（重试钮走默认插槽，
 保留 busy 禁用语义） -->
    <EmptyState v-if="loadErr" compact :icon="AlertTriangle" text="analysis 加载失败" :hint="loadErr">
      <button class="btn sm" @click="doLoad" :disabled="busy"><RefreshCw :size="12" :class="{ spinning: busy }" /> 重试</button>
    </EmptyState>

    <EmptyState v-else-if="!loaded" compact :icon="Info" text="顶栏选择索引后点「加载」查看该索引的 analysis 全景" action-text="加载当前索引" @action="doLoad" />

    <template v-else>
      <!-- 五类定义分组上方过滤行——五类共用一个过滤态（条目名/类型子串过滤，
 MarkText 高亮命中），空分组整卡隐藏，全空时给无匹配空态 -->
      <!-- 过滤行改用 SearchFilterBar 统一件（第 15 处消费；与前序三处同判据）
 ——胶囊壳三件套与 Search 内建图标归组件单源
 （as-filter-ic 绝对定位图标与 input 30px 左衬违规同步更新退役）；落位类 as-filter-bar
 透传组件根，清除钮走默认插槽原位；Esc 清空由组件内建承接；as-filter-ipt 锚随
 input-class 保留在 input 上 -->
      <SearchFilterBar v-model="filterKw" data-test="as-kw" class="as-filter-bar" input-class="as-filter-ipt" placeholder="过滤 analyzer/tokenizer/filter…">
        <button v-if="filterKw" class="btn ghost xs" @click="filterKw = ''">清除</button>
      </SearchFilterBar>
      <div v-if="hasFilterHit" class="as-groups" role="group" aria-label="分析组件分组">
        <template v-for="g in filteredGroups" :key="g.key">
          <div v-if="g.count" class="as-card">
            <div class="as-card-hd">
              <component :is="g.icon" :size="14" class="as-hd-ic2" :class="'lv-' + g.key" />
              <span>{{ g.label }}</span>
              <span class="as-count" :title="filterKw.trim() ? ('命中 ' + g.count + ' / 共 ' + g.total) : undefined">{{ g.count }}</span>
              <router-link v-if="g.key === 'filter' && hasSynFilter" to="/synonyms" class="as-link">
                <ExternalLink :size="10" /> 到同义词编辑器
              </router-link>
            </div>
            <!-- 分组内空占位合并 EmptyState compact（文案逐字保留；
 「保留」裁决由合并约定覆盖） -->
            <EmptyState v-if="!g.shown || !Object.keys(g.shown).length" compact :icon="Info" text="-" />
            <div v-else class="as-items">
              <div v-for="(cfg, name) in g.shown" :key="name" class="as-item" :class="{ expanded: openMap[g.key + ':' + name] }" tabindex="0"
                @contextmenu.prevent="openItemMenu($event, g.key, String(name), cfg)"
                @keydown="onItemMenuKey($event, g.key, String(name), cfg)" data-row-nav @keydown.self="rowArrowNav">
                <div class="as-item-hd" role="button" tabindex="0" :aria-expanded="!!openMap[g.key + ':' + String(name)]" @click="toggle(g.key, String(name))" @keydown.enter.prevent="toggle(g.key, String(name))" @keydown.space.prevent="toggle(g.key, String(name))">
                  <ChevronRight :size="10" class="as-caret" :class="{ open: openMap[g.key + ':' + name] }" />
                  <!-- 条目名/类型走 MarkText 命中高亮（textContent 与原文一致，title 不受影响） -->
                  <span class="as-item-nm" :title="String(name)"><MarkText :text="String(name)" :kw="filterKw" /></span>
                  <span v-if="(cfg as any)?.type" class="as-item-tp"><MarkText :text="String((cfg as any).type)" :kw="filterKw" /></span>
                  <!-- syn 徽标改用 StatusPill 统一件（550 裁定推翻 530「带图标 syn 与
 violet 档形态不等价不换」——theme.css 无 .tag 原语可作替代面，统一件是
 唯一收口；装饰图标随统一件无图标位退役；as-badge syn 锚保留，dv-pink
 色档由既有 scoped 规则继续承担） -->
                  <StatusPill v-if="isSynonymFilter(cfg)" class="as-badge syn" tone="b" :label="'synonym · ' + ((cfg as any).synonyms || []).length + ' 条'" />
                  <!-- W-D：tk 徽标改用 StatusPill（tone=y 全局档；as-badge 锚保留——
 as-item-hd 内 flex:none 防推出卡缘） -->
                  <StatusPill v-if="(cfg as any)?.tokenizer" tone="y" :label="'tk=' + ((cfg as any).tokenizer)" class="as-badge" />
                  <!-- flt 徽标同步收口 StatusPill（violet 档无统一件对应 tone，就近 b 信息档；
 as-badge flt 锚保留，ok 色档由既有 scoped 规则继续承担） -->
                  <StatusPill v-if="(cfg as any)?.filter?.length" class="as-badge flt" tone="b" :label="((cfg as any).filter.length) + ' filter'" />
                </div>
                <!-- 条目参数释义串（ANALYSIS_PARAM_ZH 词表消费，表外键零扰动）——
 「参数只见英文名不知作用」根治，展开态 pre 上方一行人话 -->
                <div v-if="openMap[g.key + ':' + name] && paramHint(cfg)" class="as-item-params">{{ paramHint(cfg) }}</div>
                <!-- W-C 批：条目配置走 highlightJson 范式（转义安全 v-html） -->
                <pre v-if="openMap[g.key + ':' + name]" class="as-item-body json-view" v-html="highlightJson(prettyJson(cfg))"></pre>
              </div>
            </div>
          </div>
        </template>
      </div>
      <!-- 过滤词非空且五组全空。：裸 div 换 EmptyState compact 统一件 -->
      <EmptyState v-else compact :icon="Search" text="无匹配的分析组件" :hint="'过滤词：' + filterKw">
        <button class="btn sm ghost" @click="filterKw = ''">清除过滤</button>
      </EmptyState>
    </template>

    <!-- 原始 settings JSON 编辑卡定高退役（rows=14）——抄 QueryXrayView qx.taH
 范式：resize:vertical 原生拖拽 + pointerup 读实高落盘 usePref as.rawH，刷新/回页恢复；
 默认 320px 与 rows=14 视觉等价，:rows=6 仅作无 flex 兜底 -->
    <div v-if="raw" class="as-card as-card-raw" :style="{ height: rawH }" role="group" aria-label="原始 settings.analysis JSON 编辑卡" @pointerup="saveRawH">
      <div class="as-card-hd">
        <FileJson :size="12" />
        <span>原始 settings.analysis JSON</span>
        <button class="btn ghost xs as-copy" @click="copyRaw"><Copy :size="10" /> 复制</button>
      </div>
      <!-- W-C 批修①：原只读 pre 无任何可编辑绑定，hasChanges 恒 false、「保存」永不可用——
 换 JsonArea 双向绑定 rawText：合法 JSON 回写 raw 对象（groups/stats/hasChanges 实时联动，
 保存链 close→更新→open 原样接通），非法 JSON 不回写、由合法性圆点提示 -->
      <!-- 接 dsl-assist（analysis settings 非 search body，fields 空数组——补全按通用检查降级）；
 【W3b】bodyKind 显式 'settings'（BodyKind 既有档位）：此前缺省按 'search' 冒充查询根键，
 "analyzer": 键位会出 must/filter 等查询键噪音，settings 档出设置键 -->
      <!-- P1-1：档路由静态 lint 划线挂点（lintSettingsBody 零请求静态规则，
 非法 JSON 静默清 markers，见 script queueAsLintMarkers） -->
      <!-- 558b 批：dsl-assist 收口 setup 常量 asAssist 并补 analyzers() 候选通道
 （AnalyzeView avBodyAssist 同款：自定义 analyzer/normalizer/tokenizer 名单，
 fields 维持空数组不回归，见 script 注释） -->
      <JsonArea ref="asJaRef" v-model="rawText" :dsl-assist="asAssist" :rows="6" fill />
    </div>

    <!-- 1367：分析组件条目右键菜单（项目统一 CellContextMenu）。
     一级按右键约定只放最高频两件（复制名称 / 复制配置 JSON）+ 分组父行，
     其余（复制引用代码片段、展开/收起）收进二级。 -->
    <CellContextMenu
      v-if="itemMenu"
      :x="itemMenu.x" :y="itemMenu.y" :title="itemMenu.title"
      :items="itemMenuItems"
      @close="itemMenu = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue';
import { Sliders, RefreshCw, Zap, Info, ExternalLink, ChevronRight, FileJson, Copy,
  Wand2, Scissors, Filter, Eraser, Ruler, AlertTriangle, Save, Search, Shield, Braces, ChevronsUpDown } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import { askConfirm } from '../composables/confirm';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useIdxState, usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft'; /* 过滤词会话草稿 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
import JsonArea from '../components/JsonArea.vue';
import { lintSettingsBody } from '../utils/dslLint'; /* P1-1：档路由静态 lint */
import type { BodyKind } from '../utils/dslCompletionContext'; /* 558b 批：asAssist.bodyKind 返回域收窄 */
import { ANALYSIS_PARAM_ZH } from '../utils/dslCompletionContext'; /* ：条目参数中文释义词表 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P1-1：划线防抖统一件 */
import EmptyState from '../components/EmptyState.vue'; /* ：as-empty 裸空态统一件 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1367：条目右键菜单（项目统一件） */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：五类过滤行统一件（第 15 胞） */
import { highlightJson, prettyJson } from '../utils/jsonc';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
/* 页头统计串合并 MetaStrip 统一件 + MarkText 命中高亮（过滤行用） */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import MarkText from '../components/MarkText.vue';
import StatusPill from '../components/StatusPill.vue'; /* W-D：徽标统一件 */

const store = useAppStore();
/* 权限写门——热重载/保存 analysis 均为写操作，VIEWER 不显示入口 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/analysis-update', store.target));
/* 热重载实调 /cluster/reload-analyzers（属 analysis-settings 页）——与保存分属两端点，各自判门 */
const canReload = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reload-analyzers', store.target));
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
const busy = ref(false);
const loaded = ref(false);
const loadErr = ref('');
const raw = ref<any>(null);
const originalRaw = ref<any>(null);
/* W-C 批修①：rawText 是「原始 settings.analysis JSON」区的编辑面（字符串）。
 用户输入合法 JSON 才回写 raw 对象（hasChanges 比较 raw vs originalRaw，口径不变）；
 非法中间态不回写，旧 raw 保持，合法性由 JsonArea 圆点/错误行提示 */
const rawText = ref('');
watch(rawText, (v) => { try { raw.value = JSON.parse(v); } catch { /* 非法 JSON：不回写 */ } });

/* P1-1：档路由静态 lint（划线通道）——lintSettingsBody 直接 import 纯函数
 消费（DevTools dtLint 档路由同源，settings 语义不吃 search 根键表）；非法 JSON 静默返 []，
 setMarkers([]) 即清旧划线（DevTools 同契约）。零请求、零阻塞（保存门仍走既有链路）。 */
const asJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* 558b 批：原始 settings JSON 区补全 analyzers() 候选接线（AnalyzeView avBodyAssist 同通道
 契约）——此前该区 fields 空数组且无 analyzers 通道，"analyzer": 值位零候选。页内 raw 即
 analysis 对象（doLoad 已存），零请求：analyzer/normalizer/tokenizer 三组自定义组件名直接
 从 raw 派生（filter 不入通道，AnalyzeView 同口径）。fields 维持空数组（本区是 settings 非
 mapping，契约不回归）；闭包常量落 setup 作用域（模板内联对象字面量经 _ctx
 代理会换引用，AnalyzeView avBodyAssist 同款规避） */
const asAssist = {
  fields: () => [],
  bodyKind: (): BodyKind => 'settings',
  analyzers: () => [
    ...Object.keys(raw.value?.analyzer || {}),
    ...Object.keys(raw.value?.normalizer || {}),
    ...Object.keys(raw.value?.tokenizer || {}),
  ],
};
const queueAsLintMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintSettingsBody> = [];
  try { findings = lintSettingsBody(JSON.parse(rawText.value || '')); } catch { findings = []; }
  asJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(rawText, () => { queueAsLintMarkers(); }, { immediate: true });
const openMap = reactive<Record<string, boolean>>({});

/* 原始 JSON 卡高度记忆（QueryXrayView qx.taH 同范式）——resize:vertical 原生拖拽
 结束 pointerup 读实高落盘；默认 320px ≈ 原 rows=14 视觉 */
const rawH = usePref<string>('as.rawH', '320px');
function saveRawH(e: PointerEvent) {
  const h = Math.round((e.currentTarget as HTMLElement).getBoundingClientRect().height);
  if (h > 0) rawH.value = h + 'px';
}

const hasChanges = computed(() => {
  if (!originalRaw.value || !raw.value) return false;
  return JSON.stringify(originalRaw.value) !== JSON.stringify(raw.value);
});

function toggle(g: string, n: string) {
  const k = g + ':' + n;
  openMap[k] = !openMap[k];
}

/* ═══ 1367：分析组件条目右键菜单 ═══
 用户要求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」——
 分析组件（60+ 条 analyzer/tokenizer/filter/char_filter/normalizer）此前右键是浏览器默认菜单。
 菜单按项目右键约定：一级 ≤2 高频动作 + 分组父行，绝不重复已在左键路径上的动作。
 复制「引用代码」生成的是**可直接粘进 mapping 的片段**，这是运营最高频的下一步动作。 */
type AsItemMenu = { x: number; y: number; g: string; name: string; cfg: any; title: string };
const itemMenu = ref<AsItemMenu | null>(null);
function openItemMenu(e: MouseEvent, g: string, name: string, cfg: any) {
  itemMenu.value = { x: e.clientX, y: e.clientY, g, name, cfg, title: `${g} · ${name}` };
}
function onItemMenuKey(e: KeyboardEvent, g: string, name: string, cfg: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  itemMenu.value = { ...menuKeyAnchor(e), g, name, cfg, title: `${g} · ${name}` };
}
/* 属性名按 ES settings.analysis 的段名走（用户要粘到 mapping 里能直接用） */
const AS_SEG: Record<string, string> = {
  analyzer: 'analyzer', tokenizer: 'tokenizer', filter: 'filter',
  char_filter: 'char_filter', normalizer: 'normalizer',
};
function asRefSnippet(m: AsItemMenu): string {
  const seg = AS_SEG[m.g] ?? m.g;
  /* filter 段在 mapping 里是数组元素，其余是引用名——两种粘法都给了，避免猜错 */
  return seg === 'filter'
    ? JSON.stringify({ filter: [m.name] }, null, 2)
    : JSON.stringify({ [seg]: m.name }, null, 2);
}
async function asCopy(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const itemMenuItems = computed<CcmItem[]>(() => {
  const m = itemMenu.value;
  if (!m) return [];
  const open = !!openMap[m.g + ':' + m.name];
  return [
    { key: 'as-copy-name', label: '复制名称', icon: Copy, run: () => void asCopy(m.name, `已复制名称「${m.name}」`) },
    { key: 'as-copy-json', label: '复制配置 JSON', icon: Braces, run: () => void asCopy(prettyJson(m.cfg), `已复制「${m.name}」配置`) },
    {
      key: 'as-more', label: '更多…', icon: ChevronsUpDown, sep: true, children: [
        { key: 'as-ref', label: '复制引用代码（粘进 mapping）', icon: Copy, run: () => void asCopy(asRefSnippet(m), '已复制引用片段') },
        { key: 'as-toggle', label: open ? '收起详情' : '展开详情', icon: ChevronRight, run: () => toggle(m.g, m.name) },
      ],
    },
  ];
});

/* 条目参数释义串——ANALYSIS_PARAM_ZH 词表消费（在册键拼「键=人话 · …」，
 词表外键零扰动不出现；非对象配置体回落空串不渲染） */
function paramHint(cfg: any): string {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return '';
  return Object.keys(cfg)
    .filter(k => ANALYSIS_PARAM_ZH[k])
    .map(k => `${k}=${ANALYSIS_PARAM_ZH[k]}`)
    .join(' · ');
}

const groups = computed(() => {
  const a = raw.value || {};
  return [
    { key: 'analyzer',    label: 'Analyzer（分词器管线）',    icon: Wand2,     data: a.analyzer    || {} },
    { key: 'tokenizer',   label: 'Tokenizer（切词器）',        icon: Scissors,  data: a.tokenizer   || {} },
    { key: 'filter',      label: 'Token Filter（词元过滤）',   icon: Filter,    data: a.filter      || {} },
    { key: 'charFilter',  label: 'Char Filter（字符过滤）',    icon: Eraser,    data: a.char_filter || {} },
    { key: 'normalizer',  label: 'Normalizer（keyword 规范）', icon: Ruler,     data: a.normalizer  || {} },
  ];
});

const stats = computed(() => {
  const gs = groups.value;
  const s: any = { total: 0, analyzer: 0, tokenizer: 0, filter: 0, charFilter: 0, normalizer: 0 };
  for (const g of gs) {
    const n = Object.keys(g.data || {}).length;
    s[g.key] = n;
    s.total += n;
  }
  return s;
});

const hasSynFilter = computed(() => {
  const flt = raw.value?.filter || {};
  for (const k of Object.keys(flt)) {
    const t = flt[k]?.type;
    if (t === 'synonym' || t === 'synonym_graph') return true;
  }
  return false;
});

/* 页头统计串 MetaStrip items——原手写 div 的整条 :title 全文按段拆到各 tip（AliasesView hdMeta 先例） */
const hdMeta = computed<MetaStripItem[]>(() => [
  { value: stats.value.analyzer, label: 'analyzer', tip: `analyzer ${stats.value.analyzer}（分词器管线） · 共 ${stats.value.total} 项` },
  { value: stats.value.tokenizer, label: 'tokenizer', tip: `tokenizer ${stats.value.tokenizer}（切词器）` },
  { value: stats.value.filter, label: 'filter', tip: `filter ${stats.value.filter}（词元过滤）` },
  { value: stats.value.charFilter, label: 'char_filter', tip: `char_filter ${stats.value.charFilter}（字符过滤）` },
  { value: stats.value.normalizer, label: 'normalizer', tip: `normalizer ${stats.value.normalizer}（keyword 规范） · 共 ${stats.value.total} 项` },
]);

/* 五类定义分组共用一个过滤态——条目名/类型子串过滤，空分组整卡隐藏；
 过滤只影响分组展示区，页头 stats 与原始 JSON 区不受影响。
 过滤词走 useScopedDraft 会话草稿（sessionStorage，不进 URL）——同会话刷新/
 重进页面可复原，分享链接不带关键字；按索引作用域（Mapping indices-mapping 同款）防
 A 索引过滤词串到 B（SearchFilterBar 24 消费面主流形态归一） */
const filterKw = useScopedDraft('filter', { route: 'analysis-settings', index: () => index.value.trim() }, '').text;
const filteredGroups = computed(() => {
  const k = filterKw.value.trim().toLowerCase();
  return groups.value.map(g => {
    const all = g.data || {};
    if (!k) return { ...g, shown: all, count: Object.keys(all).length, total: Object.keys(all).length };
    const shown: Record<string, any> = {};
    for (const [name, cfg] of Object.entries(all)) {
      if (name.toLowerCase().includes(k) || String((cfg as any)?.type || '').toLowerCase().includes(k)) shown[name] = cfg;
    }
    return { ...g, shown, count: Object.keys(shown).length, total: Object.keys(all).length };
  });
});
const hasFilterHit = computed(() => !filterKw.value.trim() || filteredGroups.value.some(g => g.count > 0));

function isSynonymFilter(cfg: any) {
  return cfg?.type === 'synonym' || cfg?.type === 'synonym_graph';
}

async function doLoad() {
  if (!index.value.trim()) return;
  busy.value = true;
  try {
    const r: any = await api.analysisSettings(index.value.trim());
    raw.value = r?.analysis || {};
    rawText.value = JSON.stringify(raw.value, null, 2);
    originalRaw.value = JSON.parse(JSON.stringify(raw.value));
    loaded.value = true;
    loadErr.value = '';
    if (!Object.keys(raw.value).length) store.notify('warning', '该索引未定义任何 analysis');
    else store.notify('success', `已加载 ${stats.value.total} 项 analysis 配置`);
  } catch (e: any) {
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '加载失败：' + friendlyEsError(String(e?.message ?? e))); /* ：下半句裸拼并轨（上半句 loadErr:275 已 friendly，半修半漏补齐） */
    loaded.value = false;
  } finally { busy.value = false; }
}

async function doSave() {
  if (!canOps.value) { store.notify('warning', '保存 Analysis 配置需专项角色'); return; }
  /* 2.1.6：执行体防重（确认窗期间连点不再叠第二个） */
  if (busy.value) return;
  if (!index.value.trim()) return;
  /* close→更新→open 期间索引不可读写，属服务中断型写操作——必须二次确认 */
  const okGo = await askConfirm({
    level: 'warn',
    title: '保存 Analysis 配置',
    message: `将对索引「${index.value}」执行 close → 更新 → open：期间索引不可读写，依赖它的业务会立刻报错。确认继续？`,
    okText: '确认保存',
  });
  if (!okGo) return;
  busy.value = true;
  try {
    await api.analysisUpdate(index.value.trim(), raw.value);
    originalRaw.value = JSON.parse(JSON.stringify(raw.value));
    store.notify('success', 'Analysis 配置已保存（索引已 close→更新→open）');
  } catch (e: any) {
    store.notify('error', '保存失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（XmigrateView w80 先例） */
  } finally { busy.value = false; }
}

async function doReload() {
  if (!canReload.value) { store.notify('warning', '热重载搜索分词器需专项角色'); return; }
  if (!index.value.trim()) return;
  busy.value = true;
  try {
    await api.reloadAnalyzers(index.value.trim());
    store.notify('success', '搜索分词器已热重载');
  } catch (e: any) {
    store.notify('error', '热重载失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（doSave 297 行同款） */
  } finally { busy.value = false; }
}

function copyRaw() {
  /* W-C 批修②：原来 then 二分 toast 之外又无条件补一条 info——成功必弹双 toast；删 info 行只留二分 */
  copyText(JSON.stringify(raw.value, null, 2)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '分析配置已复制' : '复制失败')); /* ：失败显性 */
}
</script>

<style scoped>
/* 页面转 flex 纵向吃满可滚区——分组 grid 由此拿到「页面余高」弹性（as-groups flex:1）
 --sp 间距 token 收口（theme.css:100-103 裁决，只收精确等值字面；
 3/5/9/30 等奇数/定位刻意值保字面） */
.as-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); display: flex; flex-direction: column; min-height: 100%; }
/* 只读身份说明条（RestView .rt-perm-note 同款形态；as-page 无 flex gap 自补下距） */
.as-perm-note { display: flex; align-items: center; gap: var(--sp-2); margin: 0 0 var(--sp-3); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
.as-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* 五枚统计条退役：页头 inline 计数串（范式同 IndexHub ih-meta） */
/* W-C 批：基础形态合并全局 .meta-strip（theme.css 末段）；改挂 MetaStrip 组件根（class 透传仍命中），
 原 lv-* 五色规则随组件合并删除（MetaStrip tone 语义档不含五色，收敛为默认亮色）。
 全局 .meta-strip 类退役（theme.css 全局块删除，IlmView .ilm-meta 同款先例），
 落位下移量同步更新 .as-meta；形态（flex/字色/mono）单一出处归组件 .ms */
.as-meta { margin-top: 3px; }
/* 过滤行改用 SearchFilterBar——胶囊壳三件套/内建图标归组件单源，本类只留
 落位（gap/margin-bottom 对齐现行）与内衬（padding 对齐 .ipt 原值 6px/10px，高度链零变动）；
 as-filter-ipt 锚保留（input 在子组件作用域，:deep 承接 360px 收缩形态；30px 左衬随
 内建图标退役，flex:1/min-width:0 归组件 .sfb-i 单源） */
.as-filter-bar { gap: var(--sp-1h); margin-bottom: var(--sp-3); padding: var(--sp-1h) var(--sp-2h); }
.as-filter-bar :deep(.as-filter-ipt) { max-width: 360px; }
/* .as-empty/.as-load-err 裸空态规则随 EmptyState compact 合并删除。
 as-empty-sub 分组内空占位亦合并 EmptyState compact（「保留」
 裁决由合并约定覆盖），本地规则同步更新删除 */
/* 分组 grid 吃页面余高（单行时 align-content stretch 拉伸行高，卡内 as-items 弹性生效）；
 min-height:0 传递防行被内容撑破 */
.as-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); flex: 1 1 auto; min-height: 0; }
/* 卡转 flex 纵向——as-items 在卡内 flex 拉伸（原始 JSON 卡同构无副作用）。
 轨4：as-card 壳 chrome 退役（540 df/rd/sy 同语言）——内容直贴，分界由
 as-card-hd 既有 border-bottom 承接；overflow+flex+min-height 骨架逐字保留（收缩防撑破
 是结构语义非 chrome） */
.as-card { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.as-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); display: flex; align-items: center; gap: var(--sp-1h); }
.as-hd-ic2.lv-analyzer   { color: var(--dv-indigo); }
.as-hd-ic2.lv-tokenizer  { color: var(--warn); }
.as-hd-ic2.lv-filter     { color: var(--ok); }
.as-hd-ic2.lv-charFilter { color: var(--dv-violet); }
.as-hd-ic2.lv-normalizer { color: var(--dv-pink); }
.as-count { margin-left: auto; padding: 1px var(--sp-1h); background: var(--bg2); border-radius: 3px; font-size: var(--fs-xs); color: var(--muted); font-family: var(--mono); }
.as-link { margin-left: var(--sp-1h); font-size: var(--fs-xs); color: var(--brand); text-decoration: none; display: inline-flex; align-items: center; gap: 3px; }
.as-link:hover { text-decoration: underline; }
/* .as-empty-sub 规则随分组空占位 EmptyState compact 合并退役，留白归组件 */
/* 340px 钉死封顶改 flex 弹性——卡有确定高（余高拉伸）时 items 吃满卡内剩余，
 封顶改 min(340px, 100%)：余高充足仍限 340，余高不足跟随卡高收缩（100% 相对卡高） */
.as-items { padding: var(--sp-1) 0; flex: 1 1 auto; min-height: 0; max-height: min(340px, 100%); overflow: auto; }
.as-item { padding: 0; }
.as-item-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-3); cursor: pointer; font-size: var(--fs-sm); font-family: var(--mono); }
.as-item-hd:hover { background: var(--bg2); }
.as-caret { color: var(--muted); transition: transform var(--tr); }
.as-caret.open { transform: rotate(90deg); }
.as-item-nm { color: var(--fg); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.as-item-tp { color: var(--brand); font-size: var(--fs-xs); flex: none; }
/* 条目参数释义串（ANALYSIS_PARAM_ZH 消费，展开态 pre 上方一行）——
 左缩进对齐 pre 本体（sp-6 同款），mono 弱化字色不抢配置体 */
.as-item-params { padding: var(--sp-1) var(--sp-3) 0 var(--sp-6); color: var(--muted); font-size: var(--fs-xs); font-family: var(--mono); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
/* y1 运行时修复:行内徽标原会被 flex 收缩推出卡缘裁切(实测 lastBadgeRight 684 > cardRight 663)——
 名字列 min-width:0 收缩 + 徽标不收缩,长名单走 ellipsis+title,徽标整颗可见 */
.as-item-hd .as-badge { flex: none; }
.as-badge { color: var(--muted); display: inline-flex; align-items: center; gap: var(--sp-0); }
.as-badge.syn {color: var(--dv-pink);}
.as-badge.flt {color: var(--ok);}
/* pre 改软换行，长 key/长值在断点处折行，永不水平溢出。
 200px 封顶改 min() 视口弹性——矮视口不再占半屏（28vh 与 qx-ta 弹性口径一致） */
.as-item-body { padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-6); background: var(--bg2); font-family: var(--mono); font-size: var(--fs-xs); margin: 0; max-height: min(200px, 28vh); overflow: auto; white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
.as-copy { margin-left: auto; }
/* 原始 JSON 卡弹性——.as-card 自带 overflow:hidden 满足 resize 生效条件；
 .ja flex 接管卡内剩余（QueryXrayView qx-card-ed 同款接线，不改共享组件） */
.as-card-raw { flex: none; resize: vertical; }
.as-card-raw :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }

/* 900 紧凑微调档——页侧距 16px 刻字收 --sp-3（顶/底节奏不动）；
 分组 grid 轨道下限挂 min(320px,100%) 防极窄溢出钳制（AnalyzerLabView 同款先例，
 auto-fit 网格内嵌套 min() 合法）；分组卡头（图标+类名+计数+同义词链接）窄容器补 wrap */
@media (max-width: 900px) {
  .as-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .as-groups { grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); }
  .as-card-hd { flex-wrap: wrap; }
}
</style>
