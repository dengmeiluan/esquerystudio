<template>
  <header class="tbar">
    <div class="tbar-left">
      <!-- 侧栏折叠开关——auto 态下的自动折叠必须给用户一个显式反悔入口 -->
      <!-- navHidden 时优先恢复侧栏（Mod+B 同义）；否则图标折叠切换 -->
      <button
        :aria-label="store.navHidden ? '展开侧栏' : store.navIcon ? '折叠侧栏' : '收成图标条'"
        class="btn ghost sm nav-toggle"
        :title="store.navHidden ? '展开侧栏（Mod+B 隐藏/恢复）' : store.navIcon ? '展开侧栏' : '收成图标条'"
        @click="store.navHidden ? store.setNavHidden(false) : store.toggleNav()"
      >
        <component :is="store.navHidden || store.navIcon ? PanelLeftOpen : PanelLeftClose" :size="14" />
      </button>
      <ClusterSwitcher />
      <n-select
        ref="idxSelRef"
        class="idx-select"
        :value="store.pickedIdx || null"
        :options="idxOptions"
        :loading="store.loadingIndices"
        filterable
        clearable
        :placeholder="idxPlaceholder"
        size="small"
        :consistent-menu-width="false"
        :render-label="renderLabel"
        @update:value="onPick"
      />
      <span v-if="store.pickedInfo" class="idx-meta mono"
        :title="fmtNum(store.pickedInfo['docs.count']) + ' docs · ' + store.pickedInfo['store.size']">
        <!-- store.size 裸字节串 → storeSizeText 单源（utils/format，semFormat bytes 档）；
 title 恒 raw（Overview 同范式：悬浮保留原始值） -->
        {{ fmtNum(store.pickedInfo['docs.count']) }} docs · {{ storeSizeText(store.pickedInfo['store.size']) }}
      </span>
      <!-- 健康徽标改用 StatusPill 统一件（healthCls→tone 映射 g/y/r 语义档；
 label 语义=health 原文保留；flex-shrink 落位由 .tbar-left .pill 既有规则承接不变） -->
      <StatusPill v-if="store.pickedInfo" :tone="healthCls(store.pickedInfo.health)" :label="store.pickedInfo.health" />
    </div>
    <div class="tbar-right">
      <!-- 全局作业进度——长耗时作业（托管重建/跨集群迁移）跑完不需守页，
 任何页面看得见在跑几个、跑到几成，点击回作业页；无在跑作业时不占位 -->
      <button v-if="jobCount" class="btn ghost sm tbar-job" :title="jobTitle" @click="gotoJobs">
        <Loader2 :size="13" class="tbar-job-spin" />
        <span class="tbar-alert-n">{{ jobCount }}<template v-if="jobPct >= 0"> · {{ jobPct }}%</template></span>
      </button>
      <!-- 全局告警指示——告警不再只活在大屏，任何页面都看得见并一键回大屏处理；无告警时不占位不制噪 -->
      <button v-if="alertCount" class="btn ghost sm tbar-alert" :class="{ bad: monBad > 0 }" :title="alertTitle" @click="gotoLive">
        <BellRing :size="13" />
        <span class="tbar-alert-n">{{ alertCount }}</span>
      </button>
      <!-- 通知历史入口——错过的 toast（尤其失败提醒）在这里回看，未读 error/warning 亮红点 -->
      <NotifyCenter />
      <UserMenu />
      <span v-if="store.clusterSelf" class="idx-meta mono self-chip" :title="'当前实例 ' + store.clusterSelf">{{ store.clusterSelf }}</span>
      <button ref="palBtnRef" class="btn ghost sm" @click="emit('open-palette')" title="命令面板（⌘K / Ctrl+K）">
        <Command :size="13" /> <span class="tbar-kt">⌘K</span>
      </button>
      <button :aria-label="'密度：' + (store.settings.density === 'compact' ? '紧凑' : '宽松') + '（点击切换）'" class="btn ghost sm" @click="store.toggleDensity()" :title="'密度：' + (store.settings.density === 'compact' ? '紧凑' : '宽松') + '（点击切换）'">
        <component :is="store.settings.density === 'compact' ? Rows2 : Rows3" :size="13" />
      </button>
      <button v-if="auth.canReadPage('devtools', store.target) || auth.canReadPage('mcp', store.target)" aria-label="MCP 接入与密钥管理" class="btn ghost sm tbar-mcp" title="MCP 接入：端点、工具、密钥与用量" @click="openMcp">
        <Plug :size="13" /><span class="tbar-mcp-label">MCP</span>
      </button>
      <button aria-label="接入文档（Maven 坐标 / iframe 嵌入 / 菜单 SPI）" class="btn ghost sm" title="接入文档（Maven 坐标 / iframe 嵌入 / 菜单 SPI）" @click="showGuide = true">
        <BookOpen :size="13" />
      </button>
      <button :aria-label="'主题：' + themeLabel + '（点击循环）'" class="btn ghost sm" @click="store.cycleTheme()" :title="'主题：' + themeLabel + '（点击循环）'">
        <component :is="themeIcon" :size="13" />
      </button>
      <button aria-label="刷新索引列表" class="btn ghost sm" :class="{ spinning: store.loadingIndices }" @click="store.loadIndices()" title="刷新索引列表">
        <RefreshCw :size="13" />
      </button>
    </div>
    <IntegrationGuide v-model:show="showGuide" />
  </header>
</template>

<script setup lang="ts">
import { computed, h, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NSelect } from 'naive-ui';
import { Command, RefreshCw, Rows2, Rows3, Moon, Sun, Monitor, MonitorSmartphone, PanelLeftClose, PanelLeftOpen, BookOpen, BellRing, Loader2, Plug } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useLiveMonitorStore } from '../stores/liveMonitor';
import { useJobTrackerStore } from '../stores/jobTracker';
import ClusterSwitcher from './ClusterSwitcher.vue';
import StatusPill from './StatusPill.vue'; /* ：健康徽标统一件 */
import UserMenu from './UserMenu.vue';
import NotifyCenter from './NotifyCenter.vue';
import IntegrationGuide from './IntegrationGuide.vue';
import { fmtNum, healthPill as healthCls, storeSizeText } from '../utils/format';
import IndexOptionRow from './IndexOptionRow.vue';
import { ensureAliases, aliasEntries, aliasesOf } from '../composables/useAliases';

const emit = defineEmits<{ (e: 'open-palette'): void }>();
/* 命令面板关闭后焦点归还触发钮（键盘用户 Esc 后不悬空；父组件经 ref 调用） */
const palBtnRef = ref<HTMLButtonElement | null>(null);
function focusPaletteBtn() { palBtnRef.value?.focus(); }
defineExpose({ focusPaletteBtn });
const showGuide = ref(false);
const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();
/* 顶栏 MCP 是全局入口：直接进入独立控制台，避免先跳 DevTools 再弹模态的二次跳转。 */
function openMcp() {
  router.push('/mcp');
}
const mon = useLiveMonitorStore();
const jt = useJobTrackerStore();

/* 全局作业徽标：数据源是常驻轮询 store（离开作业页仍在跟 */
const jobCount = computed(() => jt.runningCount);
const jobPct = computed(() => jt.overallPct);
const jobTitle = computed(() => {
  const top = jt.running.slice(0, 3).map(j => {
    const p = j.pct >= 0 ? ` ${j.pct}%` : j.stage ? ` ${j.stage}` : '';
    return `• ${j.kindName}「${j.label}」${p}`;
  });
  const more = jobCount.value > 3 ? `\n…共 ${jobCount.value} 个` : '';
  return `${jobCount.value} 个作业运行中\n${top.join('\n')}${more}\n完成或失败会自动通知；点击查看作业列表`;
});
/* 跳到「运行中最多」的那类作业页，单类场景等于直达 */
function gotoJobs() {
  const xm = jt.running.filter(j => j.kind === 'xmigrate').length;
  router.push(xm >= jt.runningCount - xm ? '/xmigrate' : '/adhoc-rebuild');
}

/* 全局告警徽标：数据源是常驻采样 store（因此不在大屏也持续更新 */
const monBad = computed(() => mon.badCount);
const alertCount = computed(() => mon.activeAlerts.length);
const alertTitle = computed(() => {
  const top = mon.activeAlerts.slice(0, 3).map(a => `• ${a.title} ${a.num}${a.unit}（阈值 ${a.threshold}）`);
  const more = alertCount.value > 3 ? `\n…共 ${alertCount.value} 条` : '';
  return `集群实时告警 ${mon.badCount} 严重 / ${mon.warnCount} 警告\n${top.join('\n')}${more}\n点击进实时大屏查看`;
});
function gotoLive() { router.push('/live'); }

const themeIcon = computed(() => {
  const t = store.settings.theme;
  return t === 'light' ? Sun : t === 'auto' ? Monitor : t === 'host' ? MonitorSmartphone : Moon;
});
const themeLabel = computed(() => {
  const t = store.settings.theme;
  return t === 'light' ? '浅色' : t === 'auto' ? '跟随系统 (当前 ' + store.effectiveTheme + ')'
    : t === 'host' ? '跟随宿主 (当前 ' + store.effectiveTheme + ')' : '深色';
});

/* 最近使用 + W3 D7 别名分组置顶：别名是查询一等目标，放所有分组最前；
 recent 从 pool（别名+索引）里找——选过的别名也进最近使用。 */
const clusterKey = computed(() => store.target || '@host');
watch(clusterKey, k => { ensureAliases(k); }, { immediate: true });

/* 占位带全量计数：未选中时也看得出选择器里躺着多少索引（与页头「索引列表 N」同语言） */
const idxPlaceholder = computed(() =>
  store.indices.length ? `全部索引 ${store.indices.length} · 可搜索` : '选择索引（可搜索）');

const idxOptions = computed(() => {
  const ali = aliasEntries(clusterKey.value)
    .map(a => ({ label: a.name, value: a.name, kind: 'alias' as const, aliasTo: a.to }));
  const all = store.indices.map(i => ({ label: i.index, value: i.index, info: i, kind: 'index' as const }));
  const pool = [...ali, ...all];
  const rec = store.recentIdx
    .map(n => pool.find(o => o.value === n))
    .filter((o): o is NonNullable<typeof o> => !!o);
  const groups: any[] = [];
    /* 别名组保持全量不去重：选过的别名同时出现在「最近使用」与「别名」组是有意的
 （别名是一等查询目标，置顶展示优先于去重洁癖），value 相同不影响 naive-ui 选中态 */
  if (ali.length) groups.push({ type: 'group' as const, label: '别名', key: 'alias', children: ali });
  if (!rec.length) { groups.push(...all); return groups; }
  const recSet = new Set(rec.map(o => o.value));
  groups.push(
    { type: 'group' as const, label: '最近使用', key: 'recent', children: rec },
    { type: 'group' as const, label: '全部索引', key: 'all', children: all.filter(o => !recSet.has(o.value)) },
  );
  return groups;
});

const idxSelRef = ref();

function aliasMeta(to: string[]): string {
  return '→ ' + (to.length > 2 ? to.slice(0, 2).join(', ') + ` +${to.length - 2}` : to.join(', '));
}

function renderLabel(option: any) {
  if (option.kind === 'alias') {
    return h(IndexOptionRow, { kind: 'alias', name: option.label, meta: aliasMeta(option.aliasTo || []) });
  }
  const i = option.info;
  if (!i) return option.label;
  return h(IndexOptionRow, {
    name: option.label,
    health: i.health,
    meta: fmtNum(i['docs.count']) + ' docs',
    aliases: aliasesOf(option.label, clusterKey.value),
    /* chip 选中别名：等价于在下拉里选该别名（store.pick），再 blur 收起面板 */
    onSelectAlias: (a: string) => { store.pick(a); idxSelRef.value?.blur(); },
  });
}

function onPick(v: string | null) {
  store.pick(v || '');
}

/* W4：healthCls 页内版退役，收口 utils/format 的 healthPill
 （green→g / yellow→y / 其余→r，与 healthColor 同源分档） */
</script>

<style scoped>
.tbar {
  height: 46px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--sp-4); background: var(--bg1); border-bottom: 1px solid var(--line); gap: var(--sp-3);
}
.tbar-left { display: flex; align-items: center; gap: var(--sp-2); flex: 1; min-width: 0; overflow: hidden; }
.idx-select { width: 320px; max-width: 44vw; flex-shrink: 1; min-width: 240px; }
/* docs/size 元信息不许被硬裁成“546,”——收缩时省略号兜底，窄视口下整体隐藏（要么完整要么不显示） */
.idx-meta { font-size: var(--fs-xs); color: var(--tx2); white-space: nowrap; flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* 原游离窄档（idx-meta 隐藏+idx-select 底线收缩）并入本档——
 1100 档与 utils/layout BP_STACK 互锚（workbenchStackBp527 同语言），全站断点单源对齐 */
@media (max-width: 1100px) {
  .tbar-left .idx-meta { display: none; }
  .idx-select { min-width: 200px; }
}
/* 866px iframe 实测 .tbar-left cw165/sw336 硬裁——窄容器下次要信息整体隐藏，
 选择器底线降到 150，⌘K 只留图标（title 已有快捷键说明），实例 chip 让位。
 台账：1000px 为非标断点（不在 1100/900 全站双档册内， iframe 实测豁免档；
 adaptive556 记 TopBar 自适应档恒定 2 处在案），不并入标准档——改档=行为变更，超面 */
@media (max-width: 1000px) {
  .idx-select { min-width: 150px; width: 240px; }
  .tbar-right .self-chip { display: none; }
  .tbar-kt, .tbar-mcp-label { display: none; }
  .tbar { padding: 0 var(--sp-2); gap: var(--sp-2); }
}
/* 健康徽标不可被挤压截断（yellow → yell…） */
.tbar-left .pill { flex-shrink: 0; }
/* 告警徽标：默认警告色，有严重条目时转错误色；数字与铃铛同行不另开气泡挤顶栏 */
.tbar-mcp { flex-shrink: 0; gap: 5px; color: var(--ac-hi); border-color: color-mix(in srgb, var(--ac) 32%, var(--line)); }
.tbar-mcp-label { font-family: var(--mono); font-size: var(--fs-xs); font-weight: 650; letter-spacing: .02em; }
.tbar-alert { flex-shrink: 0; color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--line)); }
.tbar-alert.bad { color: var(--err); border-color: color-mix(in srgb, var(--err) 45%, var(--line)); }
.tbar-alert-n { font-family: var(--mono); font-size: var(--fs-xs); font-weight: 650; }
/* 作业徽标：进度是中性信息用主色，转圈图标表明「还在跑」 */
.tbar-job { flex-shrink: 0; color: var(--acc); border-color: color-mix(in srgb, var(--acc) 35%, var(--line)); }
.tbar-job-spin { animation: rot 1.4s linear infinite; }
.nav-toggle { flex-shrink: 0; }
.tbar-right { display: flex; align-items: center; gap: var(--sp-1); }
/* S4：同一工具条控件高度归一 28px（sm 档，对齐 n-select small）；三容器本已 align-items:center。
 子组件触发器（集群切换/用户菜单/通知中心）从这里 :deep 归一，不改子组件文件 */
.tbar .btn.sm { height: 28px; }
.tbar-left :deep(.cs-chip), .tbar-right :deep(.um-chip), .tbar-right :deep(.nc-btn) { height: 28px; }
/* 实例标识长主机名时自身省略，把空间让给索引选择器（title 已有全名） */
.self-chip { padding: var(--sp-1) var(--sp-2); background: var(--bg2); border: 1px solid var(--line); border-radius: 99px; max-width: 170px; overflow: hidden; text-overflow: ellipsis; }
.spinning :deep(svg) { animation: rot 1s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
</style>
