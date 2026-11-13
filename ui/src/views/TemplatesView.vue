<template>
  <div class="tv2" ref="rootEl">
    <PageHeader :icon="FileCode2" title="模板管理" subtitle="索引模板与组件模板管理，支持参数模拟调试">
      <!-- 原独立工具条 tv2-bar 整体并入页头 actions（横幅层叠 -1） -->
      <template #actions>
        <div class="tv2-acts">
<!-- 模板类型 seg 升格（容器 role=group+aria-label+钮 aria-pressed，G192 范式） -->
          <div class="seg" role="group" aria-label="模板类型">
            <!-- KPI 大卡墙退役：两 tab 条数改分段按钮角标（tv2-kpi 两卡删除，计数与 legacy 提示全保留） -->
            <button :class="{ on: tab === 'index' }" :aria-pressed="tab === 'index'" :title="'index_template 已注册 ' + indexTemplates.length + ' 个'" @click="tab = 'index'"><FileCode2 :size="11" /> index_template<i class="tv2-tab-n">{{ indexTemplates.length }}</i></button>
            <button
              :class="{ on: tab === 'component' }" :aria-pressed="tab === 'component'" :disabled="legacy"
              :title="legacy ? 'component_template 需 7.8+，当前目标集群不支持' : 'component_template 可组合，共 ' + componentTemplates.length + ' 个'"
              @click="!legacy && (tab = 'component')"
            >
<Puzzle :size="11" /> component_template<i class="tv2-tab-n">{{ legacy ? '—' : componentTemplates.length }}</i>
</button>
          </div>
          <!-- 目标集群 < 7.8 时后端降级读 legacy /_template，前端明示而非静默假装 -->
          <span v-if="legacy" class="tv2-legacy" title="目标集群版本 < 7.8，已降级读写 legacy /_template；注意 legacy 语法：settings/mappings 在顶层，用 order 而非 priority">legacy /_template</span>
          <!-- 手写过滤框改用 SearchFilterBar 统一件（全站第 7 胞；558 tv-kw 先例：
 v-model 接原 ref 零触、placeholder 逐字保留、Esc 清空/Enter 检索内建语义对齐；
 tv2-kw-wrap 落位类挂根（min() 极窄钳制同步更新），tv2-kw 类锚随 input-class 保留在
 input 上；.tv2-input 类保留给「新建模板名」combobox 输入，其皮不属改动面） -->
          <SearchFilterBar v-model="filter" class="tv2-kw-wrap" input-class="tv2-kw" placeholder="过滤名字（子串）" @enter="onHitKey" />
          <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在过滤框接线） -->
          <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
          <button v-if="canOps" class="btn sm" @click="openNew"><Plus :size="12" /> 新建 {{ tab === 'index' ? '索引模板' : '组件模板' }}</button>
          <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/templates'=本页 list/put/delete 全通道，本页独占调用者） -->
          <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（模板）" title="最近一次模板列表/保存/删除请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
            <Terminal :size="12" /> 原始 IO
          </button>
          <button aria-label="刷新模板列表" class="btn sm ghost" @click="load" :disabled="loading" title="刷新模板列表">
            <RefreshCw :size="12" :class="{ spinning: loading }" />
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- 只读身份的前置说明：新建/保存/删除钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="tv2-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：模板的新建/保存/删除不可用；需要集群模板写权限。
    </div>

    <div class="tv2-grid" :style="tv2LeftW > 0 ? { '--tv2-left-w': tv2LeftW + 'px' } : undefined">
      <!-- 左：列表。：pane 壳三件套（border/bg/radius）退役（535 SqlBridge pane
 直贴约定续扫）——flex/overflow 布局语义与 .card padding 载体原样迁 .tv2-list -->
      <div class="tv2-list">
        <div class="card-t">
          <List :size="13" /> 列表（{{ filtered.length }}）
        </div>
        <!-- G6-B1：err-bar 独立于数据互斥链顶置（G2/ 教训）——有旧数据刷新失败时与旧列表并存，不再困在链内无渲染出口 -->
        <div v-if="loadErr" role="alert" class="err-bar rise-in tv2-err">
          模板列表拉取失败：{{ loadErr }}
          <button class="btn sm" @click="load" :disabled="loading"><RefreshCw :size="12" :class="{ spinning: loading }" /> 重试</button>
        </div>
        <div v-if="loading && !filtered.length" class="tv2-skel">
          <SkeletonBox v-for="i in 5" :key="i" height="34px" class="tv2-skel-b" round />
        </div>
        <div v-else-if="filtered.length" class="tv2-rows">
          <div
            v-for="(t, i) in filtered"
            :key="t.name"
            class="tv2-row"
            :class="{ on: selected?.name === t.name }"
            :aria-current="selected?.name === t.name || undefined"
            :data-hit-idx="i + 1"
            @click="select(t)"
           role="button" tabindex="0" @keydown.enter.prevent="select(t)" @keydown.space.prevent="select(t)"
           @contextmenu.prevent="openTplMenu($event, t)"
           @keydown="onTplMenuKey($event, t)" data-row-nav @keydown.self="rowArrowNav">
            <div class="tv2-row-l">
              <div class="tv2-row-name mono"><MarkText :text="t.name" :kw="filter" /></div>
              <div class="tv2-row-sub mono">
                <template v-if="tab === 'index'">
                  <span v-if="t.index_patterns?.length">
                    patterns: <span v-for="(p, i) in t.index_patterns" :key="i" class="chip mono">{{ p }}</span>
                  </span>
                  <span v-if="t.priority != null" class="tv2-pri">priority={{ t.priority }}</span>
                  <span v-if="t.order != null" class="tv2-pri">order={{ t.order }}</span>
                  <span v-if="t.composed_of?.length" class="tv2-comp">composed_of={{ t.composed_of.length }}</span>
                </template>
                <template v-else>
                  <span v-if="t.version != null" class="tv2-pri">v={{ t.version }}</span>
                </template>
              </div>
            </div>
            <button v-if="canOps" aria-label="删除" class="btn sm ghost" @click.stop="del(t)" :disabled="delBusy" title="删除">
              <Trash2 :size="11" />
            </button>
          </div>
        </div>
        <!-- 失败/过滤隐藏/真无三态分明——失败态已由互斥链外顶置 err-bar 承担（G6-B1）
 两处裸 .empty 迁 EmptyState compact（左列表窄列），清除过滤改 actionText 等价保留 -->
        <EmptyState v-else-if="filter && (tab === 'index' ? indexTemplates : componentTemplates).length" compact :icon="ListFilter"
          :text="'无匹配模板（共 ' + (tab === 'index' ? indexTemplates : componentTemplates).length + ' 个，被当前关键字隐藏）'"
          action-text="清除过滤" @action="filter = ''" />
        <EmptyState v-else-if="!loadErr" compact :icon="FileCode2"
          :text="'集群没有任何 ' + (tab === 'index' ? '索引' : '组件') + '模板'"
          hint="可点右上角「新建」创建（注：6.x 集群仅支持 legacy _template）" />
      </div>

      <!-- 列表/编辑器分栏拖拽柄（中缝 11px 占位列；窄屏堆叠态隐藏） -->
      <SplitHandle axis="vertical" :size="tv2LeftW > 0 ? tv2LeftW : 340" :min="220" :max="2000"
        label="列表/编辑器分栏" class="tv2-split"
        @resize-end="(s: number) => tv2LeftW = clampTv2W(s)" @reset="tv2LeftW = 0" />

      <!-- 右：编辑器（pane 壳退役，布局语义与 padding 载体迁 .tv2-editor） -->
      <div class="tv2-editor">
        <div class="card-t">
          <template v-if="selected || newMode">
            <FileCode2 :size="13" />
            <span v-if="newMode">新建 {{ tab === 'index' ? '索引' : '组件' }} 模板</span>
            <span v-else>{{ selected?.name }}</span>
            <div class="tv2-ed-acts">
              <button v-if="canOps" class="btn primary sm" @click="save" :disabled="saving">
                <Save :size="11" /> {{ saving ? '保存中…' : '保存 (Ctrl+S)' }}
              </button>
              <button class="btn sm ghost" @click="cancel">取消</button>
            </div>
          </template>
          <template v-else>
            <Info :size="13" />
            <span>选择左侧模板查看/编辑，或点击「新建」</span>
          </template>
        </div>

        <div v-if="newMode" class="tv2-newname">
          <label>名称：</label>
          <!-- 原生 datalist 合并 usePopupList 轻量形态（XmigrateView 同款就地渲染）——
 原生 datalist 触发行为随浏览器不可控且无法键盘导航，统一骨架带来 ↑↓/Enter/Esc、
 aria combobox、点击外部关闭；候选=现有模板名按输入过滤（cap 30），手输新名不受影响 -->
          <div class="tv2-nm-wrap" ref="nmRootEl">
            <input :value="newName" placeholder="模板名（如 logs-order-*）" class="tv2-input" spellcheck="false" autocomplete="off"
              role="combobox" aria-autocomplete="list" aria-label="模板名"
              :aria-expanded="nmOpen ? 'true' : 'false'" :aria-controls="nmListId"
              :aria-activedescendant="nmOpen && nmItems[nmCursor] ? nmItemId(nmCursor) : undefined"
              @focus="nmOpenPanel" @input="onNmInput" @keydown="nmOnKey" />
            <div v-if="nmOpen && nmItems.length" class="tv2-nm-drop" ref="nmListEl" role="listbox" :id="nmListId">
              <div v-for="(n, i) in nmItems" :key="n" class="tv2-nm-item mono" :class="{ act: i === nmCursor }"
                role="option" :id="nmItemId(i)" :aria-selected="i === nmCursor"
                @mouseenter="nmCursor = i" @click="pickNm(n)">{{ n }}</div>
            </div>
          </div>
          <div v-if="newNameHint" class="il-hint" :class="'il-' + newNameLevel">{{ newNameHint }}</div>
        </div>

        <!-- JsonArea 统一件（裸 Monaco 合并）：合法性圆点/格式化/压缩/复制工具行 + fill 吃满编辑器列；
 keydown 透传根元素承接 Ctrl+S（未声明 emit 经 attrs 落 .ja 根） -->
        <JsonArea
          v-if="selected || newMode"
          v-model="editBody"
          fill
          :dsl-assist="tplAssist"
          @keydown="onEditorKey"
        />
        <!-- G6-C：编辑器引导态归位 EmptyState（S6 四态归位）——自造 40px 留白块退役，教学说明走逃生舱插槽 -->
        <EmptyState v-else class="tv2-ed-empty" :icon="FileCode2" text="选择左侧模板查看/编辑，或点击「新建」">
          <div class="tv2-hint-tx">Index Template 用于自动匹配 <code>index_patterns</code> 的新索引。Component Template 是可组合子模板，通过 <code>composed_of</code> 引入。</div>
        </EmptyState>
      </div>
    </div>

    <!-- W4：删模板确认直挂 ConfirmModal 退役，合并全局 askConfirm
 （ 后果前置语义不变，del() 内联承载） -->

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/templates 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1169：模板行右键——此前一行只有一个删除钮，想拿模板名/patterns/整段定义只能手抄。
         一级只给两项高频（复制名、复制定义），其余进二级；删除仍留行内按钮（破坏性动作不藏进右键）。 -->
    <CellContextMenu v-if="tplMenu" :x="tplMenu.x" :y="tplMenu.y"
      :title="(tab === 'index' ? '索引模板 · ' : '组件模板 · ') + tplMenu.t.name"
      :items="tplMenuItems" @close="tplMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import { FileCode2, Puzzle, List, Plus, Trash2, RefreshCw, Save, Info, ListFilter, Terminal, Shield, Copy, Braces, ChevronDown, TerminalSquare } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { askConfirm } from '../composables/confirm';
import PageHeader from '../components/PageHeader.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：页头过滤胶囊统一件 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useUrlState, usePref } from '../composables/urlState';
import JsonArea from '../components/JsonArea.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import MarkText from '../components/MarkText.vue';
import { friendlyEsError } from '../utils/esError';
import { useInputLint, dupRule } from '../composables/useInputLint';
import HitNav from '../components/HitNav.vue';
import { useHitLocate } from '../composables/useHitNav';
/* 列表/编辑器分栏拖拽柄 + 模板名候选下拉统一骨架（XmigrateView 轻量形态） */
import SplitHandle from '../components/SplitHandle.vue';
import { usePopupList } from '../composables/usePopupList';
import type { BodyKind } from '../utils/dslCompletionContext';
import { writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useRouter } from 'vue-router';

const store = useAppStore();
const router = useRouter();

/* 1169：模板行右键（只读数据 + 一个写入口）。一级=复制名/复制定义；二级收 patterns 与 DevTools。 */
const tplMenu = ref<{ x: number; y: number; t: any } | null>(null);
function openTplMenu(e: MouseEvent, t: any) {
  tplMenu.value = { x: e.clientX, y: e.clientY, t };
}
/* 键盘 Menu 键（Shift+F10）——Vue 的 .menu 修饰符匹配不到 ContextMenu 键，改统一判据 */
function onTplMenuKey(e: KeyboardEvent, t: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  tplMenu.value = { ...menuKeyAnchor(e), t };
}
const tplMenuItems = computed<CcmItem[]>(() => {
  const m = tplMenu.value; if (!m) return [];
  const t = m.t;
  const raw = t._raw?.index_template || t._raw?.component_template || t._raw || {};
  const pats: string[] = Array.isArray(t.index_patterns) ? t.index_patterns : [];
  const path = tab.value === 'index'
    ? `/_index_template/${encodeURIComponent(t.name)}`
    : `/_component_template/${encodeURIComponent(t.name)}`;
  return [
    { key: 'tpl-name', label: '复制模板名', icon: Copy, run: async () => {
      const ok = await copyText(String(t.name || ''));
      store.notify(ok ? 'success' : 'error', ok ? '已复制模板名：' + t.name : '复制失败');
    } },
    { key: 'tpl-json', label: '复制模板定义 JSON', icon: Braces, run: async () => {
      const ok = await copyText(JSON.stringify(raw, null, 2));
      store.notify(ok ? 'success' : 'error', ok ? '模板定义已复制' : '复制失败');
    } },
    {
      key: 'tpl-more', label: '更多…', icon: ChevronDown, sep: true, children: [
        ...(pats.length ? [{
          key: 'tpl-pats', label: `复制匹配模式（${pats.length} 条）`, icon: List, run: async () => {
            const ok = await copyText(pats.join('\n'));
            store.notify(ok ? 'success' : 'error', ok ? `已复制 ${pats.length} 条 patterns` : '复制失败');
          },
        }] : []),
        { key: 'tpl-dev', label: '在 DevTools 打开（只读 GET）', icon: TerminalSquare, run: () => {
          /* 入口门与 DevToolsView 页门同源（canReadPage）——不具备读权时不跳转、不写 session 键 */
          if (!(auth.probed && auth.me != null && auth.canReadPage('devtools', store.target))) {
            store.notify('warning', 'DevTools 入口需要 DevTools 页面读权限或 ADMIN');
            return;
          }
          writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
            title: (tab.value === 'index' ? 'index_template/' : 'component_template/') + t.name,
            method: 'GET', path, body: '', run: false,
          }));
          router.push('/devtools');
        } },
      ],
    },
  ] as CcmItem[];
});
/* 权限门禁——模板保存/删除=/cluster/templates/put|delete=CLUSTER 档（rank3+）；
 查看模板内容全角色可用 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/templates/put', store.target));

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/templates');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* tab/过滤词进 URL */
const tab = useUrlState('tab', 'index') as Ref<'index' | 'component'>;
const filter = useScopedDraft('kw', { route: 'templates' }, '').text;
const indexTemplates = ref<any[]>([]);
const componentTemplates = ref<any[]>([]);
/* G6-B2：loading 初值 true——首帧即进骨架守卫（loading && !filtered.length），不闪真空文案 */
const loading = ref(true);
const loadErr = ref('');
const legacy = ref(false);
const saving = ref(false);
const delBusy = ref(false);

const selected = ref<any>(null);
const newMode = ref(false);
const newName = ref('');
/* ux2 ：模板名查重 warn（put 覆盖语义）+ datalist 原生补全，就地校验 */
const { hint: newNameHint, level: newNameLevel, check: newNameCheck } = useInputLint([
  dupRule(() => [...indexTemplates.value, ...componentTemplates.value].map(t => t.name), '模板'),
]);
watch(newName, v => newNameCheck(v));
/* 双栏比例可调（templates.leftW，0=自动 minmax(280px,380px)）——中缝 SplitHandle
 拖拽 + usePref 跨会话记忆（ConfigValidator/DiffEditor 同范式） */
const tv2LeftW = usePref('templates.leftW', 0);
function clampTv2W(s: number) { return Math.round(Math.min(2000, Math.max(220, s))); }
/* 模板名候选迁 usePopupList 统一骨架（轻量形态：就地渲染 + 纯文本行）。
 候选=index+component 模板名并集按输入过滤（cap 30），Enter/点击回填；查重 lint
 走既有 watch(newName) 不重复接线 */
const NM_CAP = 30;
const nmFiltered = computed(() => {
  const kw = newName.value.trim().toLowerCase();
  const all = [...indexTemplates.value, ...componentTemplates.value].map(t => String(t.name));
  return kw ? all.filter(n => n.toLowerCase().includes(kw)) : all;
});
const nmItems = computed(() => nmFiltered.value.slice(0, NM_CAP));
function pickNm(n: string) { newName.value = n; nmClose(); }
const {
  open: nmOpen, cursor: nmCursor, listId: nmListId, itemId: nmItemId,
  rootEl: nmRootEl, listEl: nmListEl, openPanel: nmOpenPanel, close: nmClose, onKey: nmOnKey,
} = usePopupList<string>({
  items: () => nmItems.value,
  onChoose: pickNm,
  to: () => false,
  idPrefix: 'tv2-nm',
  activeSelector: '.tv2-nm-item.act',
});
/* 输入即开面板 + 光标复位（IndexPicker onInput 同款语义） */
function onNmInput(e: Event) {
  newName.value = (e.target as HTMLInputElement).value;
  nmCursor.value = 0;
  if (!nmOpen.value) nmOpenPanel();
}
const editBody = ref('');
/* ux2 ：模板 body 挂新增 template 档（index_patterns/priority/template 容器等八键全 snippet）。
 quality 修复轮零降级门：component tab（顶层仅 template/version/_meta 合法，六键必 400）
 与 legacy 模式（<7.8，顶层 settings/mappings + order 语法不同）降 none 不出层。 */
const tplAssist = {
  fields: (): { path: string; type: string }[] => [],
  bodyKind: (): BodyKind => (legacy.value || tab.value === 'component' ? 'none' : 'template'),
};

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  loadErr.value = '';
  try {
    const r = await api.templates();
    if (seq !== loadSeq) return;
    legacy.value = !!r?.legacy;
    if (legacy.value && tab.value === 'component') tab.value = 'index';
    indexTemplates.value = (r?.index_templates || []).map((it: any) => ({
      name: it.name,
      ...(it.index_template || {}),
      _raw: it,
    }));
    componentTemplates.value = (r?.component_templates || []).map((it: any) => ({
      name: it.name,
      version: it.component_template?.version,
      ...(it.component_template || {}),
      _raw: it,
    }));
  } catch (e: any) {
    if (seq !== loadSeq) return;
    /* G6-B1：读链路 friendlyEsError 收敛后进顶置 err-bar；toast 保留原文 */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'templates: ' + (e?.message || e));
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}
onMounted(load);

const filtered = computed(() => {
  const src = tab.value === 'index' ? indexTemplates.value : componentTemplates.value;
  if (!filter.value) return src;
  const kw = filter.value.toLowerCase();
  return src.filter(t => t.name.toLowerCase().includes(kw));
});

/* 搜索定位：过滤结果即命中集，行按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

function select(t: any) {
  newMode.value = false;
  selected.value = t;
  // 提取可编辑主体：index_template / component_template 的完整 body
  const raw = t._raw?.index_template || t._raw?.component_template || t._raw;
  editBody.value = JSON.stringify(raw, null, 2);
}

function openNew() {
  selected.value = null;
  newMode.value = true;
  newName.value = '';
  const tpl = tab.value === 'index'
    ? { index_patterns: ['example-*'], priority: 100, template: { settings: { number_of_shards: 1 }, mappings: { properties: {} } } }
    : { template: { settings: {}, mappings: { properties: {} } } };
  editBody.value = JSON.stringify(tpl, null, 2);
}

function cancel() {
  selected.value = null;
  newMode.value = false;
  editBody.value = '';
}

/* z4 运行时验证修复：切 tab 不清选中会残留旧 tab 的模板稿——编辑器仍显示上一 tab
 的模板、保存钮仍可按，会把 index 模板 body 以 component kind 写入（保存语义错位）。
 切 tab 即退出选中/新建态，回到引导空态。 */
watch(tab, () => cancel());

async function save() {
  /* 保存钮/编辑器快捷键/全局快捷键三通道共用的在途互斥闸；键盘事件冒泡使一次
     按键先后触发两条通道，闸收在本体且置位必须先于任何 await（含覆盖确认窗） */
  if (saving.value) return;
  /* 写权限随执行体检查而非按钮可见性——快捷键路径不经按钮 */
  if (!canOps.value) { store.notify('error', '当前身份无模板写权限'); return; }
  const name = newMode.value ? newName.value.trim() : selected.value?.name;
  if (!name) { store.notify('error', '请填写模板名称'); return; }
  /* 覆盖同名模板会整体替换其 body，需二次确认；取消路径由 finally 复位 */
  const exists = (tab.value === 'index' ? indexTemplates.value : componentTemplates.value).some(t => t.name === name);
  saving.value = true;
  try {
    if (exists) {
      const okOverwrite = await askConfirm({
        title: '覆盖已有模板',
        message: `模板「${name}」已存在，保存将整体替换其内容。确认覆盖？`,
        okText: '覆盖',
      });
      if (!okOverwrite) return;
    }
    await api.putTemplate(name, tab.value, editBody.value);
    store.notify('success', `${tab.value === 'index' ? '索引' : '组件'}模板已保存：${name}`);
    await load();
    if (newMode.value) newMode.value = false;
    // 重新选中
    const src = tab.value === 'index' ? indexTemplates.value : componentTemplates.value;
    const found = src.find(t => t.name === name);
    if (found) select(found);
  } catch (e: any) {
    store.notify('error', '保存失败：' + (e?.message || e));
  } finally {
    saving.value = false;
  }
}

/* 删除走统一确认。 W4：直挂 ConfirmModal 合并 askConfirm，
 模板名入 facts 具名行，后果语句逐字保留。
 在途互斥闸：确认窗+请求窗全程钉住（置位先于确认窗 await，取消/失败路径
 finally 复位），请求窗内重复点击不二发；钮面 :disabled 承接在途反馈 */
async function del(t: any) {
  if (!canOps.value) { store.notify('error', '当前身份无模板写权限'); return; }
  if (delBusy.value) return;
  delBusy.value = true;
  try {
    if (!await askConfirm({
      title: '删除模板',
      message: `将删除${tab.value === 'index' ? '索引' : '组件'}模板 ${t.name}。 已按该模板创建的索引不受影响，但后续新建索引将不再自动套用它，不可恢复。`,
      level: 'warn',
      okText: '删除',
      dismissable: true,
      facts: [{ label: '模板名', value: t.name }],
    })) return;
    await api.deleteTemplate(t.name, tab.value);
    store.notify('success', '已删除：' + t.name);
    if (selected.value?.name === t.name) cancel();
    await load();
  } catch (e: any) {
    store.notify('error', '删除失败：' + (e?.message || e));
  } finally {
    delBusy.value = false;
  }
}

function onEditorKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
}

// 页面级 Ctrl+S 兜底
function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && (selected.value || newMode.value)) {
    e.preventDefault();
    save();
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey));
</script>

<style scoped>
/* G6-S1：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 亚阶梯(≤3px) / 行级密排不动 */
.tv2 { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
/* 只读身份说明条（RestView .rt-perm-note 同款形态；tv2 flex gap 承担落位，零 margin） */
.tv2-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
/* 原独立工具条 tv2-bar 并入页头 actions 后的内部排布（窄屏折行） */
.tv2-acts { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
/* KPI 大卡墙退役：tab 条数角标（原两张 tv2-kpi 卡） */
.tv2-tab-n { font-style: normal; font-size: var(--fs-2xs); line-height: 1; padding: var(--sp-0) 5px; border-radius: var(--r-m); background: var(--bg2); color: var(--tx2); font-variant-numeric: tabular-nums; }
.seg button.on .tv2-tab-n { background: var(--ac-soft); color: var(--ac-hi); }
.seg .tv2-tab-n { margin-left: var(--sp-0); }
/* min-width:200px → min(200px,100%) 极窄溢出钳制（529 带兜底范式）。
 .tv2-input 皮保留给「新建模板名」combobox 输入（过滤框已改用 SearchFilterBar 不在此域） */
.tv2-input { height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); font-family: var(--font-mono, monospace); min-width: min(200px, 100%); }
.tv2-input:focus { border-color: var(--ac); outline: 0; }
/* 类随改用挂 SearchFilterBar 根——胶囊壳三件套归组件单源，本类只留落位
 （min() 极窄钳制同步更新，paneShellWave547 锁面）与高度内衬（26px 对齐现行，高度链零动） */
.tv2-kw-wrap { min-width: min(200px, 100%); height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); }

/* 双栏比例可调——中缝 11px SplitHandle 占位列，左宽走 --tv2-left-w（默认 minmax(280px,380px) 自适应，0=自动） */
.tv2-grid { display: grid; grid-template-columns: var(--tv2-left-w, minmax(280px, 380px)) 11px minmax(0, 1fr); gap: var(--sp-3); flex: 1; min-height: 480px; }
/* pane 壳（.card 三件套）退役——flex/overflow 布局语义与 .card padding 载体
 原样迁入无壳类（14px 垂直留白为 .card 刻意值同步更新保字面，内容边距零变动） */
.tv2-list { display: flex; flex-direction: column; overflow: hidden; padding: 14px var(--sp-4); }
/* G6-B1：err-bar 在卡片内的边距（全局 .err-bar 仅 margin-bottom，卡内需补侧距） */
.tv2-err { margin: var(--sp-3) var(--sp-3) var(--sp-2); }
.tv2-skel { padding: var(--sp-3); }
.tv2-skel-b { margin-bottom: var(--sp-2); }
.tv2-skel-b:last-child { margin-bottom: 0; }
.tv2-rows { flex: 1; overflow-y: auto; padding: var(--sp-1) 0; }
.tv2-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); cursor: pointer; border-bottom: 1px solid var(--line); transition: background var(--tr); }
.tv2-row:hover { background: var(--bg2); }
.tv2-row.on { background: var(--ac-soft); }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.tv2-row.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.tv2-row-l { flex: 1; min-width: 0; }
.tv2-row-name { font-size: var(--fs-sm); font-weight: 600; color: var(--tx0); }
.tv2-row-sub { font-size: var(--fs-xs); color: var(--tx2); margin-top: 3px; display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; }
.tv2-row-sub .chip { padding: 1px var(--sp-1h); font-size: var(--fs-xs); border-radius: 3px; background: var(--bg2); }
.tv2-pri, .tv2-comp { padding: 1px var(--sp-1h); background: var(--ac-soft); color: var(--ac-hi); border-radius: 3px; font-size: var(--fs-xs); }
.tv2-legacy { padding: var(--sp-0) var(--sp-2); background: var(--warn-soft); color: var(--warn); border: 1px solid var(--warn-line); border-radius: 10px; font-size: var(--fs-xs); font-family: var(--font-mono, monospace); cursor: help; }
.seg button:disabled { opacity: .45; cursor: not-allowed; }
/* .tv2-clr 随列表空态迁 EmptyState compact 退役（按钮间距归 .es-extra gap） */

/* pane 壳退役，flex/overflow 布局语义与 .card padding 载体原样迁入 */
.tv2-editor { display: flex; flex-direction: column; overflow: hidden; padding: 14px var(--sp-4); }
/* .ja 编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——分界由编辑器卡头承接线承担（全局 .card-t 无 border，补齐，纯视觉）；
 组件本体零触，flex/高度链零变动 */
.tv2-editor > .card-t { border-bottom: 1px solid var(--border); padding-bottom: var(--sp-2); }
.tv2-editor :deep(.ja) { border: none; border-radius: 0; }
.tv2-ed-acts { margin-left: auto; display: flex; align-items: center; gap: var(--sp-2); }
.tv2-newname { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line); font-size: var(--fs-sm); }
.tv2-newname label { color: var(--tx1); }
.tv2-newname .tv2-input { flex: 1; }
/* 模板名候选下拉（usePopupList 就地渲染，absolute 随根） */
.tv2-nm-wrap { position: relative; flex: 1; display: flex; min-width: 0; }
.tv2-nm-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 40; margin-top: var(--sp-1); background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s); box-shadow: var(--shadow-pop); max-height: 240px; overflow: auto; }
.tv2-nm-item { padding: 5px var(--sp-2h); font-size: var(--fs-xs); cursor: pointer; }
.tv2-nm-item:hover, .tv2-nm-item.act { background: var(--ac-soft); color: var(--ac-hi); }
/* ：引导态归位 EmptyState 后只补「撑满编辑器列 + 垂直居中」；留白归 .empty-state 一处所有；
 列表空态亦迁 EmptyState compact，全局 .empty 在本页已无引用 */
.tv2-ed-empty { height: calc(100% - 42px); justify-content: center; }
.tv2-hint-tx { font-size: var(--fs-sm); color: var(--tx1); line-height: 1.5; max-width: 460px; text-align: center; }
.tv2-hint-tx code { background: var(--bg2); padding: 1px 5px; border-radius: 3px; font-size: var(--fs-xs); color: var(--ac-hi); }


/* G6-B3：断点归一 双档标准——.tv2-grid 双栏→单栏堆叠语义取 1100（原 1000 为 历史值，theme.css 已无该档）。
 堆叠后 Monaco host 高 calc(100% - 42px) 的父高链 indefinite 会塌陷（AnalyzeView 同构先例）：
 页面放开定高改由内容撑高，编辑器列给定高。 */
@media (max-width: 1100px) {
  .tv2 { height: auto; min-height: 100%; }
  .tv2-grid { grid-template-columns: minmax(0, 1fr); }
  /* 堆叠态拖拽柄隐藏（.df-split 同款） */
  .tv2-split { display: none; }
  /* 编辑器定高 480px 改 vh 弹性档（.rd-card-ed max() 同口径——480px 兜底、42vh 跟随视口） */
  .tv2-editor { height: max(480px, 42vh); }
}
/* 900 紧凑微调档（ 口径）——堆叠后编辑器头动作行（保存/删除/格式化等）
 窄视口允许换行不再右推；列表行工具钮随之自然收纳（表格横滚兜底在全局 .tbl-wrap） */
@media (max-width: 900px) {
  .tv2-ed-acts { margin-left: 0; flex-wrap: wrap; }
}
</style>
