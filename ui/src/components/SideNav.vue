<template>
  <aside class="snav" :class="{ icon: store.navIcon }">
    <div class="brand" :title="store.navIcon ? brandTitle : ''">
      <div class="brand-logo">
        <Layers :size="18" :stroke-width="2.2" />
      </div>
      <div class="brand-tx">
        <div class="brand-name">{{ ui.product.name }}</div>
        <div class="brand-sub">{{ brandSub }}</div>
      </div>
    </div>

    <!-- 丝滑收展：常驻 DOM，收起时高度/透明度连续过渡——v-if 抽走 31px 是「往上顶」的元凶 -->
    <div class="nav-search" :class="{ hid: store.navIcon }">
      <Search :size="13" class="nav-search-ic" />
      <input
        ref="searchEl"
        v-model="navQuery"
        class="nav-search-in"
        type="text"
        placeholder="搜索功能 /"
        autocomplete="off"
        :tabindex="store.navIcon ? -1 : 0"
        @keydown.esc.stop="navQuery = ''"
      />
      <button v-if="navQuery" class="nav-search-x" aria-label="清空搜索词" @click="navQuery = ''"><X :size="12" /></button>
    </div>

    <nav class="nav-list">
      <!-- 探测在途不出任何菜单：grantedPages 的 null（=未启用全量可见）只有探测完成后才可信，
           在途放行=先渲染全量菜单、身份到达后再全部隐藏，无权限用户会看见菜单闪现（产线实报）。
           给中性等待态，探测完成后按授权精确渲染。 -->
      <div v-if="!auth.probed" class="nav-empty nav-degraded" role="status">
        身份确认中…
      </div>
      <!-- 身份未确认 ≠ 无权限：探测失败时菜单会保持「全量」形态，此时点进去必被 403。
           给一条可解释的状态条，避免用户把「后端不可达」当成「系统坏了」。 -->
      <div v-else-if="!auth.authDisabled && auth.me == null" class="nav-empty nav-degraded" role="status">
        <p>身份未确认：宿主凭证未到达或已失效。菜单可能多于实际权限，操作以服务端校验为准。</p>
        <p class="nav-degraded-act">
          请从宿主系统重新进入；如刚完成登录，可
          <button class="btn ghost xs" @click="retryIdentity">重试身份探测</button>
        </p>
      </div>
      <div v-else-if="!grouped.length" class="nav-empty">
        {{ navQuery.trim() ? '无匹配功能' : '当前身份/目标连接下没有可访问的页面——请在「安全中心 → 我的账号」查看授权，或联系管理员勾选菜单' }}
      </div>
      <div v-for="g in grouped" :key="g.id" class="nav-group">
        <!-- 组标题与图标态分隔线同时常驻：两态高度互补渐变，宽度动画全程不跳行高 -->
        <div class="nav-g-hd" role="button" tabindex="0" :aria-expanded="isOpen(g)" :title="packTip(g.id)" @click="toggleGroup(g.id)" @keydown.enter.prevent="toggleGroup(g.id)" @keydown.space.prevent="toggleGroup(g.id)">
          <ChevronDown :size="11" class="nav-g-caret" :class="{ closed: !isOpen(g) }" />
          <span class="nav-g-nm">{{ g.name }}</span>
          <span class="nav-g-cnt">{{ g.items.length }}</span>
        </div>
        <div class="nav-g-sep" :title="g.name"></div>
        <!-- 分组折叠：grid-rows 0fr↔1fr 连续过渡，替代 v-if 瞬跳 -->
        <div class="nav-g-body" :class="{ closed: !store.navIcon && !isOpen(g) }">
          <div class="nav-g-in">
            <router-link
              v-for="item in g.items"
              :key="item.path"
              :to="item.path"
              custom
              v-slot="{ navigate, isActive }"
            >
              <div
                class="nav-item" :class="{ on: isActive }" @click="navigate"
                role="link" tabindex="0" @keydown.enter.prevent="() => navigate()"
                :title="itemTip(item)"
              >
                <component :is="icons[item.icon]" :size="15" :stroke-width="1.9" class="nav-ic" />
                <span class="nav-name"><MarkText :text="item.name" :kw="navQuery" /></span>
                <span
                  v-if="item.minVer && store.verBelow(item.minVer)"
                  class="nav-ver"
                  :title="`当前集群 ES ${store.esVersion}，此功能需要 ES ${item.minVer}+，进入后相关接口可能不可用`"
                >需 {{ item.minVer }}+</span>
                <span class="kbd nav-key">{{ item.key }}</span>
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </nav>

    <div class="nav-foot">
      <div class="foot-row" :title="footTitle">
        <span class="dot" :class="dotCls"></span>
        <span class="foot-tx">{{ footTx }}</span>
      </div>
      <div class="foot-row dim" title="⌘K / Ctrl+K 打开命令面板">
        <Command :size="12" />
        <span class="foot-tx">⌘K 命令面板</span>
      </div>
      <!-- 当前版本号可见（发版核验最后一米：UI 即所见版本） -->
      <div class="foot-row dim" :title="ui.product.name + ' 当前版本 ' + STARTER_VERSION">
        <span class="foot-tx mono v-num">v{{ STARTER_VERSION }}</span>
      </div>
      <!-- 速查面板鼠标入口（? 键之外的第二可达路径；点击发事件总线） -->
      <button class="foot-row dim foot-btn" title="键盘速查（快捷键 ?）" @click="store.emit('open-hotkeys')">
        <Keyboard :size="12" />
        <span class="foot-tx">? 键盘速查</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { STARTER_VERSION } from '../data/integrationGuide';
import { readStoredJson, writeStoredRaw } from '../utils/safeJson';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Search, X,
  Layers, LayoutDashboard, TerminalSquare, Braces, Database, Zap,
  Wrench, History, Stethoscope, Rocket, Settings2, Command,
  ListTodo, FlaskConical, Link2, Network, FileCode2, Camera,
  Beaker, Sliders, Recycle,
  GaugeCircle, GitBranch, Calculator,
  HeartPulse, BookOpen, Wand2, Keyboard,
  ShieldCheck, BellRing, Star,
  LayoutGrid, Rows3, Pencil,
  Flame, MonitorSpeaker,
  SearchCode, ArrowLeftRight,
  FolderTree, BookText, PackageOpen,
  Microscope, SearchCheck, SlidersHorizontal, Grid3x3, ScanSearch,
  LayoutTemplate, ChevronDown, Hammer, GitCompareArrows, Boxes, Plug,
} from 'lucide-vue-next';
import { NAV_ITEMS, NAV_GROUPS, pageAllowed } from '../router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { isDemoMode } from '../platform/demoApi';
import { useUiConfigStore } from '../stores/uiConfig';
import MarkText from './MarkText.vue';
import { useRoute } from 'vue-router';

const store = useAppStore();
const ui = useUiConfigStore();
const brandSub = computed(() => ui.product.integrationName || 'QUERY WORKBENCH');
const brandTitle = computed(() => ui.product.name + ' · ' + ui.product.tagline);
const icons: Record<string, any> = {
  LayoutDashboard, TerminalSquare, Braces, Database, Zap,
  Wrench, History, Stethoscope, Rocket, Settings2,
  ListTodo, FlaskConical, Link2, Network, FileCode2, Camera,
  Beaker, Sliders, Recycle,
  GaugeCircle, GitBranch, Calculator,
  HeartPulse, BookOpen, Wand2,
  ShieldCheck, BellRing, Star,
  LayoutGrid, Rows3, Pencil,
  Flame, MonitorSpeaker, Layers,
  SearchCode, ArrowLeftRight,
  FolderTree, BookText, PackageOpen,
  Microscope, SearchCheck, SlidersHorizontal, Grid3x3, ScanSearch,
  LayoutTemplate, Hammer, GitCompareArrows, Boxes, Plug,
};

/* 分组折叠——状态持久化；当前路由所在组强制展开 */
const route = useRoute();
const auth = useAuthStore();
const LS_KEY = 'esquerystudio.nav.collapsed';
/* 脏值防御读取：手改/残留坏 JSON 不得炸全站导航挂载 */
const collapsed = ref<Record<string, boolean>>(readStoredJson(localStorage, LS_KEY, {}, (v) => v != null && typeof v === 'object' && !Array.isArray(v)));

/* 导航搜索：按名称/路径过滤，命中组强制展开；/ 键全局聚焦 */
const navQuery = ref('');
const searchEl = ref<HTMLInputElement | null>(null);

const grouped = computed(() => {
  const q = navQuery.value.trim().toLowerCase();
  const gp = auth.grantedPages; // 2.5.0：null=未启用全量可见；白名单外页面连入口都不露
  /* 连接模型键(conn:{id}:{page})按当前目标收缩——host 下仅静态键可见；ADMIN 全局可见 */
  const admin = auth.isAdmin();
  const visible = (i: (typeof NAV_ITEMS)[number]) => {
    /* 探测在途不出菜单：null（全量可见语义）只有探测完成后才可信——
       在途放行会让无权限身份先看见全量菜单再整批消失（闪现，产线实报） */
    if (!auth.probed) return false;
    if (admin) return true;
    /* 与路由守卫/命令面板同一真源：host-bound、env 模板、security/xmigrate 作用域收口都在 pageAllowed。 */
    return pageAllowed(gp, i.path, store.target, auth.envAllows, auth.me?.role);
  };
  return NAV_GROUPS
    .filter(g => ui.groupEnabled(g.id))
    .map(g => ({
      id: g.id as string, name: g.name,
      items: NAV_ITEMS.filter(i => i.group === g.id
        && ui.pageEnabled(i.pageKey)
        && visible(i)
        && (!q || i.name.toLowerCase().includes(q) || i.path.toLowerCase().includes(q))),
    }))
    .filter(g => g.items.length);
});
/* 组标题悬停显示所属功能包：部署裁剪后，用户仍能理解这一组属于哪个产品模块 */
function packTip(groupId: string) {
  const pack = ui.packs.find(p => p.groups.includes(groupId));
  return pack ? pack.name + (pack.description ? ' · ' + pack.description : '') : '';
}
function isOpen(g: { id: string; items: readonly { path: string }[] }) {
  if (navQuery.value.trim()) return true; // 搜索中：命中组无视折叠状态
  return !collapsed.value[g.id];
}

/* 路由切换时自动展开目标所在组（保证活跃项可见），但不剥夺用户手动折叠任意组的权利 */
watch(() => route.path, (p) => {
  const g = NAV_ITEMS.find(i => i.path === p)?.group;
  if (g && collapsed.value[g]) {
    collapsed.value[g] = false;
    writeStoredRaw(localStorage, LS_KEY, JSON.stringify(collapsed.value));
  }
}, { immediate: true });

function onSlashKey(e: KeyboardEvent) {
  if (e.key !== '/') return;
  if (store.navIcon) return; // 图标态搜索框已收起，不可聚焦到不可见输入
  const t = e.target as HTMLElement;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  e.preventDefault();
  searchEl.value?.focus();
  searchEl.value?.select();
}
onMounted(() => window.addEventListener('keydown', onSlashKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onSlashKey));
function toggleGroup(id: string) {
  collapsed.value[id] = !collapsed.value[id];
  writeStoredRaw(localStorage, LS_KEY, JSON.stringify(collapsed.value));
}

/* 底栏状态改报真实集群健康——连接成功不等于集群正常（yellow/red 必须如实露出）。
   零授权身份：探测完成但没有任何可见页——「连接中…」会永久挂着像卡死，
   改报中性「未授权任何集群」（灰点），授权到达后随身份 watch 自然转正常链 */
const noClusterAccess = computed(() => {
  const gp = auth.grantedPages;
  return !!auth.probed && !auth.authDisabled && auth.me != null && Array.isArray(gp) && gp.length === 0;
});
const dotCls = computed(() => {
  if (noClusterAccess.value) return 'c-idle';
  if (store.clusterOk === null) return 'c-warn';
  if (!store.clusterOk) return 'c-err';
  return store.clusterHealth === 'red' ? 'c-err' : store.clusterHealth === 'yellow' ? 'c-warn' : 'c-ok';
});
const footTx = computed(() => {
  if (isDemoMode) return '演示集群 · 合成数据';
  if (noClusterAccess.value) return '未授权任何集群';
  if (store.clusterOk === null) return '连接中…';
  if (!store.clusterOk) return '连接失败';
  if (store.clusterHealth === 'red') return '集群 RED';
  if (store.clusterHealth === 'yellow') return '集群 YELLOW';
  return '集群正常';
});
const footTitle = computed(() => {
  if (noClusterAccess.value) return '当前身份未被授权任何集群连接';
  if (store.clusterOk === null) return '集群连接中…';
  if (!store.clusterOk) return '集群连接失败';
  const h = store.clusterHealth || '未知';
  const un = store.clusterUnassigned;
  return `集群健康：${h}${un > 0 ? ` · 未分配分片 ${un}` : ''}`;
});

/* 手动重试不仅重探，还补发一次 ready：宿主监听晚挂时，子页初期的重播窗口可能已过，
   只重探只会再拿一次 401。补发让宿主有机会立刻回凭证。 */
function retryIdentity() {
  try {
    if (window.parent !== window) window.parent.postMessage({ type: 'esquerystudio-ready' }, '*');
  } catch { /* 跨域限制时静默 */ }
  auth.probe();
}

/* 图标态：文字全隐，tooltip 是唯一可读入口——名称+快捷键都要在 title 里给全 */
function itemTip(item: { name: string; key?: string }) {
  return item.key ? `${item.name} · 快捷键 ${item.key}` : item.name;
}
</script>

<style scoped>
.snav {
  width: 208px; flex-shrink: 0; height: 100%;
  background: var(--bg1); border-right: 1px solid var(--line);
  display: flex; flex-direction: column; user-select: none;
}
.brand { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3); }
.brand-logo {
  width: 30px; height: 30px; border-radius: var(--r-m); display: flex; align-items: center; justify-content: center;
  /* 品牌渐变底上的字收 --tx-on-strong（彩底白字语义档）：暗色=深字配亮青，浅色=白字配深青 */
  background: linear-gradient(135deg, var(--ac) 0%, var(--ac-hi) 100%); color: var(--tx-on-strong);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--ac) 35%, transparent);
}
.brand-name { font-size: var(--fs-md); font-weight: 650; letter-spacing: .01em; }
.brand-sub { font-size: var(--fs-xs); color: var(--tx2); letter-spacing: .06em; text-transform: uppercase; }

.nav-search {
  display: flex; align-items: center; gap: var(--sp-1); margin: 0 var(--sp-3) var(--sp-1);
  padding: 0 var(--sp-2); height: 27px; flex-shrink: 0;
  border: 1px solid var(--line); border-radius: var(--r-s);
  background: var(--bg0); color: var(--tx2);
  /* 收展时高度/边距/透明度一起插值，下方内容被「推着走」而非瞬间上顶 */
  overflow: hidden;
  transition: border-color var(--tr), height var(--nav-tr), margin var(--nav-tr),
              opacity var(--nav-tr), border-width var(--nav-tr);
}
.nav-search.hid { height: 0; margin-bottom: 0; opacity: 0; border-width: 0; pointer-events: none; }
.nav-search:focus-within { border-color: var(--ac); }
.nav-search-ic { flex-shrink: 0; opacity: .8; }
.nav-search-in {
  flex: 1; min-width: 0; background: transparent; border: none; outline: none;
  color: var(--tx0); font-size: var(--fs-sm); font-family: inherit;
}
.nav-search-in::placeholder { color: var(--tx2); opacity: .75; }
.nav-search-x { flex-shrink: 0; cursor: pointer; opacity: .7; background: none; border: none; padding: var(--sp-0); display: flex; align-items: center; color: inherit; }
.nav-search-x:hover { opacity: 1; color: var(--tx0); }
.nav-empty { padding: var(--sp-4) var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); text-align: center; }
.nav-degraded { text-align: left; line-height: 1.5; border: 1px solid var(--warn-line, var(--line)); border-radius: var(--r-s); background: var(--warn-soft); color: var(--tx1); margin-bottom: var(--sp-2); }
.nav-degraded p { margin: 0; }
.nav-degraded-act { margin-top: var(--sp-1h); }

.nav-list { flex: 1; padding: var(--sp-2); overflow-y: auto; overflow-x: hidden; }
.nav-group { margin-bottom: var(--sp-0); }
.nav-g-hd {
  display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-2) var(--sp-2) var(--sp-1);
  cursor: pointer; color: var(--tx1); user-select: none;
  /* 两态常驻：图标态整行收成 0 高，与分隔线互补渐变 */
  overflow: hidden; white-space: nowrap;
  transition: height var(--nav-tr), padding var(--nav-tr), opacity var(--nav-tr);
  height: 30px; box-sizing: border-box;
}
.snav.icon .nav-g-hd { height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; pointer-events: none; }
.nav-g-hd:hover { color: var(--tx0); }
.nav-g-caret { flex-shrink: 0; transition: transform var(--tr); opacity: .7; }
.nav-g-caret.closed { transform: rotate(-90deg); }
/* 一级组标题必须 ≥ 二级条目，形成正确的视觉层级 */
.nav-g-nm { flex: 1; font-size: var(--fs-md); font-weight: 650; letter-spacing: .02em; }
.nav-g-cnt { font-size: var(--fs-xs); opacity: .6; background: var(--bg2); border-radius: var(--r-m); padding: 0 var(--sp-1); }
/* 分组折叠：grid-rows 0fr↔1fr，高度全程可插值（替代 v-if 瞬跳） */
.nav-g-body {
  display: grid; grid-template-rows: 1fr;
  transition: grid-template-rows var(--nav-tr);
}
.nav-g-body.closed { grid-template-rows: 0fr; }
.nav-g-in { min-height: 0; overflow: hidden; }
.nav-item {
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2); margin-bottom: 1px;
  border-radius: var(--r-s); cursor: pointer; color: var(--tx1);
  transition: background var(--tr), color var(--tr), padding var(--nav-tr), gap var(--nav-tr);
  position: relative; overflow: hidden; white-space: nowrap;
}
.nav-item:hover { background: var(--bg2); color: var(--tx0); }
.nav-item.on { background: var(--ac-soft); color: var(--ac-hi); }
.nav-item.on::before {
  content: ''; position: absolute; left: -8px; top: 6px; bottom: 6px; width: 2.5px;
  border-radius: 2px; background: var(--ac);
}
.nav-ic { flex-shrink: 0; opacity: .9; }
.nav-name {
  flex: 1; font-size: var(--fs-sm); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: opacity var(--nav-tr);
}
/* 版本能力降级徽标——入口级预警不禁止，悬停解释原因 */
.nav-ver {
  flex-shrink: 0; font-size: var(--fs-2xs); line-height: 1; padding: var(--sp-1);
  border-radius: var(--r-s); color: var(--warn); background: var(--warn-soft, var(--warn-line));
  border: 1px solid var(--warn-line);
  cursor: help; letter-spacing: .01em;
}
.nav-key { opacity: 0; transition: opacity var(--tr); }
.nav-item:hover .nav-key { opacity: .8; }
.nav-item.on .nav-key { opacity: .8; }

.nav-foot { padding: var(--sp-3); border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: var(--sp-2); }
.foot-row { display: flex; align-items: center; gap: var(--sp-2); color: var(--tx1); }
.foot-row.dim { color: var(--tx2); }
/* 速查入口是 button（可点），对齐 div 行视觉但保留 hover 反馈 */
.foot-btn { background: transparent; border: 0; cursor: pointer; font: inherit; text-align: left; padding: 0; width: 100%; }
.foot-btn:hover { color: var(--tx0); }
.foot-tx { font-size: var(--fs-xs); }
.dot { width: 7px; height: 7px; border-radius: 50%; }
/* W8：辉光收 --glow-m 档（几何 token），语义色由消费点追加（theme.css glow 段注释） */
.dot.c-ok { background: var(--ok); box-shadow: var(--glow-m) var(--ok); }
.dot.c-warn { background: var(--warn); }
.dot.c-err { background: var(--err); box-shadow: var(--glow-m) var(--err); }
.dot.c-idle { background: var(--tx3); }

/* ── / 图标折叠态：866px iframe 里 208px 侧栏吃掉 1/4 宽度，收成 56px 纯图标轨。
 丝滑化：所有元素常驻 DOM，高度/透明度/宽度全程同步插值（同一时长同一缓动），
 彻底消灭 v-if 抽行导致的「往上顶」跳变；尊重 reduced-motion（theme.css 全局已压缩动效）。 */
.snav { --nav-tr: 240ms cubic-bezier(.25, .8, .3, 1); transition: width var(--nav-tr); will-change: width; }
.snav.icon { width: 56px; }
.snav.icon .brand { justify-content: center; padding: var(--sp-3) 0 var(--sp-3); }
.brand { transition: padding var(--nav-tr); }
/* 文字块用 max-width+opacity 淡出，不用 display:none 硬断 */
.brand-tx { overflow: hidden; white-space: nowrap; max-width: 140px; transition: max-width var(--nav-tr), opacity var(--nav-tr); }
.snav.icon .brand-tx { max-width: 0; opacity: 0; }
.snav.icon .nav-list { padding: var(--sp-2) var(--sp-1); }
.nav-list { transition: padding var(--nav-tr); }
.snav.icon .nav-item { justify-content: center; padding: var(--sp-2) 0; gap: 0; }
.snav.icon .nav-name, .snav.icon .nav-ver, .snav.icon .nav-key {
  /* 参与 flex 布局但宽度归零：文字随宽度动画淡出而非瞬断（min-width 必须归零，否则 .kbd 的 18px 下限压过 max-width） */
  flex: 0 0 0; max-width: 0; min-width: 0; opacity: 0; overflow: hidden; margin: 0; padding: 0; border-width: 0;
}
.nav-ver, .nav-key { transition: opacity var(--nav-tr); }
.snav.icon .nav-item.on::before { left: -4px; }
/* 组分隔线：仅图标态可见，与组标题高度互补（常驻，透明度渐变） */
.nav-g-sep { height: 1px; background: var(--line); margin: 0 var(--sp-2); opacity: 0; transition: opacity var(--nav-tr), margin var(--nav-tr); }
.snav.icon .nav-g-sep { opacity: 1; margin: var(--sp-2); }
.nav-group:first-child .nav-g-sep { display: none; }
.snav.icon .nav-foot { padding: var(--sp-3) 0 var(--sp-3); align-items: center; }
.nav-foot { transition: padding var(--nav-tr); }
.snav.icon .foot-row { justify-content: center; }
.foot-tx { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 120px; transition: max-width var(--nav-tr), opacity var(--nav-tr); }
.snav.icon .foot-tx { max-width: 0; opacity: 0; }
</style>

/* 版本号微缩显示（icon 态由 nav-name 同款折叠规则隐藏） */
.v-num { font-size: var(--fs-2xs); letter-spacing: .02em; }
.snav.icon .v-num { flex: 0 0 0; max-width: 0; min-width: 0; opacity: 0; overflow: hidden; }
