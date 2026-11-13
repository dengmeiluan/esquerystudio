<template>
  <div class="fv-page" ref="rootEl">
    <div class="fv-hd">
      <PageHeader :icon="Star" title="收藏夹" subtitle="跨会话的 DSL / REST / 视图 / 模板 — 一键重放 · localStorage 持久化">
      <template #actions>
<button class="btn ghost sm" @click="exportAll" :disabled="items.length === 0">
  <Download :size="12" /> 导出 JSON
</button>
<!-- 导入键盘可达——input 摘 display:none 换全局 .sr-only 保持可聚焦；
 label 加 tabindex/role 可 Tab 到位，Enter 触发文件选择（原键盘用户完全无法触发） -->
<label class="btn ghost sm" style="cursor:pointer" tabindex="0" role="button" @keydown.enter.prevent="importInput?.click()" @keydown.space.prevent="importInput?.click()">
  <Upload :size="12" /> 导入
  <input ref="importInput" type="file" class="sr-only" @change="importFile" accept="application/json" />
</label>
<button class="btn danger sm" title="清空全部收藏（仅本地数据，不可恢复）" @click="clearAll" :disabled="items.length === 0">
  <Trash2 :size="12" /> 清空
</button>
      </template>
      </PageHeader>
</div>

    <div class="fv-tabs">
      <button v-for="c in cats" :key="c.k" class="fv-tab" :class="{ act: kind === c.k }" @click="kind = c.k">
        <component :is="c.ic" :size="12" /> {{ c.l }}
        <span class="fv-tab-c">{{ counts[c.k] }}</span>
      </button>
      <!-- 页头过滤胶囊组件化——SearchFilterBar 统一件，落位类 fv-search
 透传到组件根（flex:1/min-width/margin-left:auto 落位照常）；Enter 走组件 enter 事件、
 Esc 清空内建（原行为等价），HitNav/全选 label 附加件走默认插槽原位 -->
      <SearchFilterBar v-model="kw" class="fv-search" input-class="fv-search-i" placeholder="搜索标题 / 副标题 / tag…" @enter="onHitKey">
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在搜索框接线） -->
        <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
        <!-- 全选当前过滤结果（勾选态按 id，过滤切换不丢勾） -->
        <label v-if="filtered.length" class="fv-checkall">
          <input type="checkbox" :checked="allChecked" @change="toggleAll" /> 全选
        </label>
      </SearchFilterBar>
      <!-- 批量操作浮动栏（有勾选才出，对齐 rt-float 范式） -->
      <div v-if="selCount" class="fv-float">
        <span class="fv-float-n">已选 <b>{{ selCount }}</b> 条</span>
        <button class="btn sm" @click="delSelected">删除选中</button>
        <button class="btn sm ghost" @click="selected = new Set()">取消选择</button>
      </div>
    </div>

    <!-- 无收藏项：两个并列去处（查询工作台 / REST 控制台），单 actionText 装不下两个，故走插槽 -->
    <EmptyState v-if="filtered.length === 0 && items.length === 0" :icon="Star"
      text="当前无收藏项"
      hint="任何 DSL 查询 / REST 请求 / 模板均可「⭐ 收藏」，跨会话恢复。">
      <!-- 空态给下一步动作（无目标页权限时禁用+提示，与重放同门——提前暴露可不可达） -->
      <button class="btn sm pri" :disabled="!canGo('/search')" :title="canGo('/search') ? undefined : '当前身份无查询工作台页面权限'"
        @click="goOrHint('/search')">去查询工作台跑一条 →</button>
      <!-- 指向页用注册名（/devtools=Dev Tools），与 /rest（REST 直连）区分 -->
      <button class="btn sm ghost" :disabled="!canGo('/devtools')" :title="canGo('/devtools') ? undefined : '当前身份无 Dev Tools 页面权限'"
        @click="goOrHint('/devtools')">去 Dev Tools 多标签控制台 →</button>
    </EmptyState>

    <EmptyState v-else-if="filtered.length === 0" :icon="Star"
      text="当前分类无匹配"
      hint="换个分类页签，或清掉搜索关键词看全部收藏"
      action-text="清除过滤" @action="kw = ''; kind = 'all'" />

    <div v-else class="fv-list">
      <div v-for="(it, i) in filtered" :key="it.id" class="fv-card" :class="{ 'fv-sel': selected.has(it.id) }" :data-hit-idx="i + 1" tabindex="0"
        @contextmenu.prevent="openFavMenu($event, it)" @keydown="onFavMenuKey($event, it)" data-row-nav @keydown.self="rowArrowNav">
        <!-- 批量选择勾选框 -->
        <input type="checkbox" class="fv-chk" :checked="selected.has(it.id)"
          :aria-label="'选中收藏：' + it.title" @click.stop @change="toggleSel(it.id)" />
        <div class="fv-card-l">
          <div class="fv-card-tt">
            <component :is="iconFor(it.kind)" :size="12" />
            <span class="fv-kind">{{ kindLabel(it.kind) }}</span>
            <MarkText :text="it.title" :kw="kw" />
          </div>
          <div class="fv-card-sub" v-if="it.subtitle"><MarkText :text="it.subtitle" :kw="kw" /></div>
          <!-- fv-card-meta 手写 meta 行合并 MetaStrip mini 档（；
 tag chip 同件再进一步——自插槽合并 items text 纯文本段（#前缀随段并入，
 ·分隔节奏归组件；fv-tag 私造 chip 皮退役，550 sv-repo 徽章合并同语言） -->
          <MetaStrip class="fv-card-meta" :items="fvCardMeta(it)">
            <!-- 重放去向前置可见——「打开」去哪个视图不用点了才知道 -->
            <span class="fv-dest">→ {{ replayTarget(it).label }}</span>
          </MetaStrip>
          <details class="fv-card-body">
            <summary>预览</summary>
            <!-- 预览走 highlightJson 高亮（转义安全 v-html；preview 内已先 pretty 后截断，截断文本高亮容错） -->
            <pre class="json-view" v-html="highlightJson(preview(it.payload))"></pre>
          </details>
        </div>
        <div class="fv-card-r">
          <!-- 1197：主行动「打开」常驻；「复制」「删除」静息隐藏——
               这两个动作早已在卡片右键的二级菜单里（复制… / 删除…），
               常驻在每张卡上既是重复入口，也和「打开」抢注意力（实报的头部平铺同族）。
               悬停 / 键盘聚焦 / 已勾选（触屏无 hover 的替代通道）时显现。 -->
          <button class="btn pri sm" @click="replay(it)">
            <Play :size="12" /> 打开
          </button>
          <span class="fv-card-ops">
            <button class="btn ghost sm" @click="copyPayload(it)"><Copy :size="12" /> 复制</button>
            <button aria-label="删除这条收藏（仅本地数据）" class="btn danger sm" title="删除这条收藏（仅本地数据）" @click="del(it.id)"><Trash2 :size="12" /></button>
          </span>
        </div>
      </div>
    </div>

    <!-- 本地偏好备份（记忆性轴收口）——列选/列宽/密度/草稿等偏好一键带走；
 白名单严格限定本站键前缀（同源 iframe 下 localStorage 与宿主共享，禁通配） -->
    <details class="fv-prefs" v-if="items.length === 0 || filtered.length > 0">
      <summary><Database :size="12" /> 本地偏好备份 <span class="fv-prefs-n mono">{{ prefKeys.length }} 键</span></summary>
      <div class="fv-prefs-body">
        <span class="fv-prefs-tip">列选/列宽/密度/草稿/查询偏好等本地设置。导入按白名单合并（同键覆盖），不会触碰宿主页面数据。</span>
        <button class="btn sm ghost" :disabled="!prefKeys.length" @click="exportPrefs"><Download :size="11" /> 导出偏好</button>
        <!-- 导入偏好键盘可达（头部「导入」11-13 行同款修法）——input 摘 display:none
 换全局 .sr-only 保持可聚焦，label 加 tabindex/role 可 Tab 到位，Enter 触发文件选择 -->
        <label class="btn sm ghost" style="cursor:pointer" tabindex="0" role="button" @keydown.enter.prevent="prefsInput?.click()" @keydown.space.prevent="prefsInput?.click()">
          <Upload :size="11" /> 导入偏好
          <input ref="prefsInput" type="file" class="sr-only" @change="importPrefs" accept="application/json" />
        </label>
        <button class="btn sm danger" :disabled="!prefKeys.length" @click="clearPrefs">
          <Trash2 :size="11" /> 清空偏好
        </button>
      </div>
    </details>
    <!-- 收藏卡片右键（1144）：与索引行/历史行同一件 CellContextMenu——卡片右侧的
 「打开/复制/删除」三个常驻钮只保留最高频的打开，其余低频动作收进右键，
 卡片正文区不再被按钮挤占（DBX 列表行心智：动作随对象走，不随页面常驻）。 -->
    <CellContextMenu v-if="favMenu" :x="favMenu.x" :y="favMenu.y" :title="'收藏 · ' + favMenu.it.title"
      :items="favMenuItems" @close="favMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { Star, Download, Upload, Trash2, Copy, Play, Code2, Terminal, Map as MapIcon, BookOpen, Database, ListChecks } from 'lucide-vue-next';
/* 页头过滤胶囊统一件（wt/fv/tg 同场景合并）；Search 图标随胶囊组件化内建，本页不再单独引图标 */
import SearchFilterBar from '../components/SearchFilterBar.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1144：收藏卡片右键 */

import PageHeader from '../components/PageHeader.vue';import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { pageAllowed } from '../router';
import MarkText from '../components/MarkText.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：fv-card-meta 统一件（时间戳段）；：tag 段合并 items */

import { askConfirm } from '../composables/confirm';
import { useScopedDraft } from '../composables/useScopedDraft';
import { exportStamp, copyText, fmtTime, downloadText } from '../utils/format';
import { highlightJson } from '../utils/jsonc'; /* ：收藏预览 JSON 高亮 */
import { replayFavorite, replayTarget } from '../utils/favReplay';
import EmptyState from '../components/EmptyState.vue';
import HitNav from '../components/HitNav.vue';
import { useHitLocate } from '../composables/useHitNav';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();
/* 类型/关键词过滤进 URL */
const kind = useScopedDraft('kind', { route: 'favorites' }, 'all').text as Ref<'all' | 'dsl' | 'rest' | 'route' | 'template'>;
const kw = useScopedDraft('kw', { route: 'favorites' }, '').text;

const cats = [
  { k: 'all' as const, l: '全部', ic: Star },
  { k: 'dsl' as const, l: 'DSL', ic: Code2 },
  { k: 'rest' as const, l: 'REST', ic: Terminal },
  { k: 'route' as const, l: '视图', ic: MapIcon },
  { k: 'template' as const, l: '模板', ic: BookOpen },
];

const items = computed(() => store.favorites || []);

const counts = computed(() => {
  const c: Record<string, number> = { all: items.value.length, dsl: 0, rest: 0, route: 0, template: 0 };
  items.value.forEach(x => { if (c[x.kind] !== undefined) c[x.kind]++; });
  return c;
});

const filtered = computed(() => {
  let arr = items.value;
  if (kind.value !== 'all') arr = arr.filter(x => x.kind === kind.value);
  const q = kw.value.trim().toLowerCase();
  if (q) arr = arr.filter(x => (x.title + ' ' + (x.subtitle || '') + ' ' + (x.tags || []).join(' ')).toLowerCase().includes(q));
  return arr;
});

/* 搜索定位：过滤结果即命中集，卡片按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
/* 导入入口 input 引用——label 聚焦时 Enter 触发文件选择（键盘可达） */
const importInput = ref<HTMLInputElement | null>(null);
/* 「导入偏好」input 引用（与头部导入 importInput 分名防撞，修法同款） */
const prefsInput = ref<HTMLInputElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

/* 批量选择+批量删除——200 条上限下逐条删太累（对齐 RT 勾选范式；
 勾选态按 id 集合，过滤切换不丢勾） */
const selected = ref<Set<string>>(new Set());
function toggleSel(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}
const allChecked = computed(() => filtered.value.length > 0 && filtered.value.every(x => selected.value.has(x.id)));
function toggleAll() {
  if (allChecked.value) {
    const keep = new Set(selected.value);
    filtered.value.forEach(x => keep.delete(x.id));
    selected.value = keep;
  } else {
    filtered.value.forEach(x => selected.value.add(x.id));
    selected.value = new Set(selected.value);
  }
}
const selCount = computed(() => selected.value.size);
async function delSelected() {
  if (!selected.value.size) return;
  if (!await askConfirm({
    title: '删除选中收藏',
    level: 'warn',
    message: `将删除选中的 ${selected.value.size} 条收藏（仅本地数据），此操作不可撤销。`,
    okText: `删除 ${selected.value.size} 条`,
  })) return;
  selected.value.forEach(id => store.removeFavorite(id));
  store.notify('success', `已删除 ${selected.value.size} 条收藏`);
  selected.value = new Set();
}

function iconFor(k: string) {
  return ({ dsl: Code2, rest: Terminal, route: MapIcon, template: BookOpen } as any)[k] || Star;
}
function kindLabel(k: string) {
  return ({ dsl: 'DSL', rest: 'REST', route: '视图', template: '模板' } as any)[k] || k;
}
function fmtTs(ts: number) {
  try { return fmtTime(ts); } catch { return String(ts); }
}
/* 卡片 meta items（时间戳值段 + tag text 纯文本段）——tag 合并 MetaStrip mini 档
 （550 sv-repo 徽章先例同语言；#前缀随段并入暗色文本，kv 过滤仍吃 tags 原数组不受影响；
 fv-tag 私造 chip 皮退役， 锚同步更新） */
function fvCardMeta(it: any): MetaStripItem[] {
  /* ：时间戳段补段级中文 tip（715 G55/717 G60/721 G74/724 同族；
 tip 走 :title 悬停通道+help 档，备注不进可见文本） */
  return [{ value: fmtTs(it.ts), tip: '收藏时间' }, ...(it.tags || []).map((t: string) => ({ text: '#' + t }))];
}
function preview(payload: any): string {
  const s = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return s.length > 800 ? s.slice(0, 800) + '\n…（已截断）' : s;
}

/* 重放走统一真链路（utils/favReplay），此前预填键无人消费，「打开」是假动作 */
function replay(it: any) {
  replayFavorite(it, router, (t, m) => store.notify(t, m),
    (path) => canGo(path));
}

/* ═══ 1144：收藏卡片右键 ═══
 动作全部复用卡片既有能力（打开/复制/勾选/删除），不新增写路径；
 一级只留高频两项，其余按「复制… / 选择… / 删除」分组——与表格/列表右键同一语言。 */
const favMenu = ref<{ x: number; y: number; it: any } | null>(null);
function openFavMenu(e: MouseEvent, it: any) {
  favMenu.value = { x: e.clientX, y: e.clientY, it };
}
function onFavMenuKey(e: KeyboardEvent, it: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  favMenu.value = { ...menuKeyAnchor(e), it };
}
const favMenuItems = computed<CcmItem[]>(() => {
  const m = favMenu.value; if (!m) return [];
  const it = m.it;
  const isSel = selected.value.has(it.id);
  return [
    { key: 'replay', label: `打开（${replayTarget(it).label}）`, icon: Play, run: () => replay(it) },
    {
      key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'copy-payload', label: '复制内容', icon: Copy, run: () => copyPayload(it) },
        { key: 'copy-title', label: '复制标题', icon: Copy, run: async () => {
          const ok = await copyText(it.title);
          store.notify(ok ? 'success' : 'error', ok ? '已复制标题：' + it.title : '复制失败');
        } },
      ],
    },
    {
      key: 'sel-group', label: '选择…', icon: ListChecks, children: [
        { key: 'sel-toggle', label: isSel ? '取消勾选' : '勾选此项', icon: ListChecks, run: () => toggleSel(it.id) },
        ...(filtered.value.length > 1 ? [{ key: 'sel-all', label: `勾选当前 ${filtered.value.length} 条`, icon: ListChecks, run: () => toggleAll() }] : []),
      ],
    },
    {
      key: 'danger-group', label: '删除…', icon: Trash2, sep: true, children: [
        { key: 'del-one', label: '删除此条收藏', icon: Trash2, danger: true, run: () => void del(it.id) },
        ...(selected.value.size > 1 ? [{ key: 'del-sel', label: `删除选中的 ${selected.value.size} 条`, icon: Trash2, danger: true, run: () => void delSelected() }] : []),
      ],
    },
  ];
});

/* 空态导航与重放同门（pageAllowed 单源）：无权限不再裸 push 到 /forbidden，
   按钮提前禁用+提示（所见即所得） */
function canGo(path: string) {
  return auth.isAdmin()
    || pageAllowed(auth.grantedPages, path, store.target, auth.envAllows, auth.me?.role);
}
function goOrHint(path: string) {
  if (!canGo(path)) { store.notify('warning', '当前身份无该页面权限'); return; }
  router.push(path);
}

function copyPayload(it: any) {
  const s = typeof it.payload === 'string' ? it.payload : JSON.stringify(it.payload, null, 2);
  copyText(s).then(ok => store.notify(ok ? 'success' : 'error', ok ? '内容已复制' : '复制失败')); /* */
}
/* 单条删除补确认门（批量删除 warn 门已落位，单条此前直删无门）。
 开 dismissable——收藏仅本地数据非数据资产，critical/guardText 不适用（ W10 参数）；
 勾「本次会话不再询问」后本会话内单删不再逐次弹窗（Adhoc doAbort 首开同款用法） */
async function del(id: string) {
  const it = items.value.find(x => x.id === id);
  if (!await askConfirm({
    level: 'warn',
    title: '删除收藏',
    message: `将删除收藏「${it?.title || id}」（仅本地数据），可通过重新收藏恢复。`,
    okText: '删除',
    dismissable: true,
  })) return;
  store.removeFavorite(id);
  store.notify('success', '已删除收藏：' + (it?.title || id));
}
async function clearAll() {
  if (!await askConfirm({
    level: 'warn',
    title: '清空收藏夹',
    message: `将删除全部 ${items.value.length} 条收藏，此操作不可撤销。建议先用右上角「导出」备份。`,
    okText: '清空收藏',
  })) return;
  store.clearFavorites();
  store.notify('success', '收藏夹已清空');
}
function exportAll() {
  downloadText(`esquerystudio-favorites-${exportStamp()}.json`, JSON.stringify(items.value, null, 2), 'application/json;charset=utf-8');
}
function importFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const arr = JSON.parse(String(r.result));
      if (!Array.isArray(arr)) throw new Error('格式错误：需要 JSON 数组');
      /* 导入反馈诚实化——addFavorite 按 kind+title 幂等覆盖，重导同一份
 导出文件时 N 条全是「覆盖」而非「新增」，笼统「已导入 N 条」有误导性 */
      let added = 0;
      let updated = 0;
      let skipped = 0;
      arr.forEach((x: any) => {
        if (x && x.kind && x.title) {
          const exists = items.value.some(it => it.kind === x.kind && it.title === x.title);
          store.addFavorite({ kind: x.kind, title: x.title, subtitle: x.subtitle, payload: x.payload, tags: x.tags });
          exists ? updated++ : added++;
        } else {
          skipped++; // 缺 kind/title 的坏条目：跳过并如实计数（漏了这段的诚实化）
        }
      });
      const parts = [`新增 ${added} 条`];
      if (updated) parts.push(`覆盖同名 ${updated} 条`);
      if (skipped) parts.push(`跳过坏条目 ${skipped} 条（缺 kind/title）`);
      store.notify('success', `已导入：${parts.join('，')}`);
    } catch (err: any) {
      /* 裸串「导入失败：」+ err.message（JSON.parse 英文 SyntaxError 直出）换人话
 ——主文案讲人话，原始 message 括注保真可查证（toast 无 secondary 档，括注即次行） */
      store.notify('error', '不是合法的收藏 JSON 文件（原始错误：' + err.message + '）');
    }
  };
  r.readAsText(f);
}

/* ═══ ：本地偏好备份（记忆性轴收口）═══
 白名单严格限定本站键前缀——es console 以 iframe 嵌宿主，同源 localStorage 共享，
 绝不可按「非本站即删」或全量导入，波及宿主页面数据。 */
const PREF_KEY_RE = /^(esquerystudio\.pref\.|esquerystudio\.draft\.|esquerystudio\.jobs\.seen|es_cols:|es_tbl_|es_pager_size$|es_recent_idx$|esquerystudio_ihub_w$)/;
const prefKeys = computed(() => Object.keys(localStorage).filter(k => PREF_KEY_RE.test(k)));
function exportPrefs() {
  const dump: Record<string, string | null> = {};
  for (const k of prefKeys.value) dump[k] = localStorage.getItem(k);
  downloadText(`esquerystudio-prefs-${exportStamp()}.json`, JSON.stringify({ kind: 'esquerystudio-prefs', keys: dump }, null, 2), 'application/json;charset=utf-8');
  store.notify('success', `已导出 ${prefKeys.value.length} 个偏好键`);
}
function importPrefs(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(String(r.result));
      const dump = parsed && parsed.kind === 'esquerystudio-prefs' ? parsed.keys : null;
      if (!dump || typeof dump !== 'object') throw new Error('格式错误：需要「导出偏好」生成的文件');
      let applied = 0;
      let skipped = 0;
      for (const [k, v] of Object.entries(dump as Record<string, string | null>)) {
        if (!PREF_KEY_RE.test(k)) { skipped++; continue; }
        writeStoredRaw(localStorage, k, String(v ?? ''));
        applied++;
      }
      store.notify('success', `已导入 ${applied} 个偏好键，刷新页面生效${skipped ? `（跳过非本站键 ${skipped} 个）` : ''}`);
    } catch (err: any) {
      /* 同 importFile 口径人话化（原始 message 括注保真） */
      store.notify('error', '文件无法读取，请重试（原始错误：' + err.message + '）');
    }
  };
  r.readAsText(f);
}
async function clearPrefs() {
  if (!await askConfirm({
    title: '清空本地偏好',
    level: 'warn',
    message: `将删除 ${prefKeys.value.length} 个偏好键（列选/列宽/密度/草稿/查询偏好），恢复默认值。建议先「导出偏好」备份。`,
    okText: '清空偏好',
  })) return;
  for (const k of prefKeys.value) removeStoredRaw(localStorage, k);
  store.notify('success', '本地偏好已清空，刷新页面生效');
}
</script>

<style scoped>
.fv-page { padding: var(--sp-4) var(--sp-4) var(--sp-5); }
/* 本地偏好备份折叠卡。轨4：dashed 大容器框退役（约定④）——
 框三件消除，border-top 分节承接（556 ws-w / 554 hr-sec 同语言），类名保留作挂载锚 */
.fv-prefs { margin-top: var(--sp-4); border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.fv-prefs summary { display: flex; align-items: center; gap: var(--sp-1h); cursor: pointer; font-size: var(--fs-sm); color: var(--tx2); }
.fv-prefs summary:hover { color: var(--tx1); }
.fv-prefs-n { font-size: var(--fs-xs); }
.fv-prefs-body { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; padding: var(--sp-2h) var(--sp-0) var(--sp-1); }
.fv-prefs-tip { font-size: var(--fs-xs); color: var(--tx2); flex: 1 1 260px; }
.fv-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
/* 删 -hd-ic/-hd-tt/-hd-sub 死规则（页头已由 PageHeader 接管，模板 0 引用）；
 -hd 左右组后缀族两条同族漏删回补删除（PageHeader actions 插槽接管，模板 0 引用） */
.fv-tabs { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); flex-wrap: wrap; }
.fv-tab { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-1) var(--sp-3); background: var(--bg2); border: 1px solid var(--line); color: var(--tx1); border-radius: 16px; cursor: pointer; font-size: var(--fs-sm); transition: all var(--tr); }
.fv-tab:hover { border-color: var(--line-strong); color: var(--tx0); }
/* 选中态：柔底+品牌描边高亮字（全站统一语言），实心亮色块+白字是廉价感来源 */
.fv-tab.act { background: var(--ac-soft); color: var(--ac-hi); border-color: var(--ac-line); font-weight: 600; }
.fv-tab-c { padding: 0 var(--sp-1); background: var(--hl-strong); border-radius: var(--r-m); font-size: var(--fs-xs); }
/* 胶囊壳三件套（panel 底/border-subtle 弱边/8px 圆角）随组件化归
 SearchFilterBar 单源，本类只留落位与内衬（padding 对齐现行，高度结构零变动）；
 .fv-search-i 裸输入形态归组件 .sfb-i 单源（inputClass 保留类名锚） */
.fv-search { flex: 1; min-width: 180px; margin-left: auto; display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-3); }
/* ·件B（实报「收藏夹在大屏电脑面前的比例不对」）：单列全宽行在
 1600px 内容宽下过宽过扁、动作钮组与内容漂移两端——双列栅格恢复卡身比例（~760px/列）；
 <1100 回落单列。纯 CSS：勾选/过滤/HitNav/批量行为零变化；行内结构（chk|内容|动作）不动 */
.fv-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-3); align-items: start; }
/* fv-card 列表项卡带框降层为 border-top 行（约定④；slm-card 551 先例：
 panel 底+全框+radius 整块消除，悬停反馈由顶部 hairline 变色承接）；类名保留作 DOM 锚 */
.fv-card { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3) 0; border-top: 1px solid var(--border-subtle); }
/* 批量选择——勾选框、选中态、浮动操作栏（对齐 rt-float 范式） */
.fv-chk { margin-top: 3px; flex-shrink: 0; }
.fv-card.fv-sel { border-color: var(--ac-line); background: var(--ac-soft); }
.fv-checkall { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; white-space: nowrap; }
.fv-float { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--ac-soft); border: 1px solid var(--ac-line); border-radius: var(--r-m); font-size: var(--fs-sm); }
.fv-float-n { color: var(--tx1); }
.fv-card:hover { border-color: var(--brand); }
.fv-card-l { flex: 1; min-width: 0; }
.fv-card-tt { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-md); font-weight: 600; }
.fv-kind { padding: 1px var(--sp-2); background: var(--ac-soft); color: var(--ac-hi); border-radius: 3px; font-size: var(--fs-xs); font-weight: 400; }
.fv-card-sub { font-size: var(--fs-xs); color: var(--text-muted); margin-top: 3px; }
/* 本类只留落位外距（flex/字号/分隔归 .ms 单源，rc-card-meta 同款范式） */
.fv-card-meta { margin-top: var(--sp-2); }
/* .fv-tag 私造 chip 皮随 tag 段合并 MetaStrip items 退役（550 sv-repo 同语言；
 文案「#tag」逐字保留，形态归组件 .ms-t 暗色段单源） */
.fv-dest { padding: 1px var(--sp-2); background: var(--ac-soft); color: var(--ac-hi); border-radius: 3px; font-size: var(--fs-xs); }
.fv-card-body { margin-top: var(--sp-2); font-size: var(--fs-xs); }
.fv-card-body summary { cursor: pointer; color: var(--text-muted); }
.fv-card-body pre { background: var(--code-bg); padding: var(--sp-2) var(--sp-3); border-radius: 5px; overflow-x: auto; margin-top: var(--sp-2); font-size: var(--fs-xs); }
.fv-card-r { display: flex; gap: var(--sp-2); flex-shrink: 0; align-items: center; }
/* 1197：与「打开」并列的次级动作（复制/删除）静息隐藏——它们已在右键二级菜单里，
   常驻只是重复入口。悬停 / 键盘聚焦 / 卡片被勾选时显现；触屏无 hover 走勾选与右键两条通道。 */
.fv-card-ops { display: inline-flex; gap: var(--sp-2); opacity: 0; transition: opacity var(--tr); }
.fv-card:hover .fv-card-ops, .fv-card:focus-within .fv-card-ops, .fv-card.fv-sel .fv-card-ops { opacity: 1; }
@media (hover: none) { .fv-card-ops { opacity: 1; } }
/* 当前命中卡片：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.fv-card.hit-cur { background: var(--ac-soft) !important; border-color: var(--ac-line); box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.btn.danger { background: var(--err-soft); color: var(--err); border-color: var(--err-line); }
.btn.danger:hover:not(:disabled) { background: var(--err-soft); }

/* 900 紧凑微调档——页侧距与卡片内距收窄（--sp-4→--sp-3 / 卡内 --sp-3 --sp-4→
 --sp-2h --sp-3）；收藏卡「内容+右钮组（flex-shrink:0 三钮）」窄容器补 wrap，钮组整排落到次行。
 .fv-tabs 基础态已 flex-wrap、预览 pre 已 overflow-x:auto，横滚兜底不在此重复 */
@media (max-width: 1100px) {
  .fv-list { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .fv-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .fv-card { flex-wrap: wrap; padding: var(--sp-2h) 0; } /* ：横距随卡壳退役归零（border-top 行） */
}
</style>
