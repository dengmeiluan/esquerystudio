<template>
  <div class="pl-page">
    <PageHeader :icon="PackageOpen" title="插件矩阵" subtitle="_cat/plugins · 集群健康检测 · 一致性告警 · ES 7.10 只能 SSH 安装">
      <template #actions>
<!-- G148：原始请求/响应快查入口（Slm/Lifecycle D6 同款 rim 族；
 路径子串 '/cluster/plugins'=本页 pluginsMatrix 单通道；判空不开空弹窗） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（插件矩阵）" title="最近一次 _cat/plugins 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
<button class="btn ghost sm" @click="doLoad" :disabled="busy">
          <!-- G147：在途窗 RefreshCw 补 spinning（此前只 disabled=半合规；737 G132 同族） -->
          <RefreshCw :size="12" :class="{ spinning: busy }" /> 重新加载
        </button>
        <!-- G151：空开改走空名清名通道——行菜单带名打开后页头空开不再残留上次插件名 -->
        <button class="btn ghost sm" @click="openGuide('')">
          <BookOpen :size="12" /> 安装指南
        </button>
      </template>
    </PageHeader>

    <!-- 首次加载骨架屏，不把「加载中」伪装成「不可用」 -->
    <div v-if="busy && !available" class="pl-loading">
      <SkeletonBox v-for="i in 3" :key="i" height="64px" round />
    </div>

    <!-- 主空态改用 EmptyState compact（原裸 .pl-empty div；两个动作按钮走默认插槽逃生舱） -->
    <EmptyState v-else-if="!available" compact :icon="Info" :text="reason || '未加载 · 点击「重新加载」尝试'">
      <button class="btn sm" @click="doLoad" :disabled="busy">
          <!-- G147：空态重新加载钮在途 spinning（与页头钮同源 busy；busy && !available 时骨架屏顶替本钮，语义补全不破形） -->
          <RefreshCw :size="12" :class="{ spinning: busy }" /> 重新加载</button>
      <button class="btn ghost sm" @click="openGuide('')"><BookOpen :size="12" /> 安装指南</button>
    </EmptyState>

    <template v-else>
      <div class="pl-card">
        <div class="pl-card-hd">
          <span>矩阵：插件 × 节点</span>
          <!-- IndexHub 新范式→MetaStrip 统一件：note 蓝横幅 + KPI 统计条 + warn 横幅三层堆叠合并为卡头一行
 inline 元信息串，warn 仅真有不一致时内联；ES 7.10 API 边界全文走根 :title 兜底，段级 tip 各自细节 -->
          <!-- 插槽前手写 sep 退役——组件「有默认插槽自动渲染 .ms-sep」承担，图例段原样 -->
          <MetaStrip class="pl-strip" :items="plMeta" :title="plBaseTip">
            <span class="pl-hint">✅ = 已装 · ❌ = 未装</span>
          </MetaStrip>
        </div>
        <!-- 裸 pl-matrix 矩阵表整表换 QRT rows 型（cols=nodeNames 直映射，
 行=插件×节点）——列选/行高/列宽/整表 TSV·JSON 复制/五格式导出/渲染截断全归内核；
 插件名列 #cell-插件 槽承接 b+StatusPill 徽标（显示层接管，复制/导出恒 raw）；
 不一致行红底走 rowClass 契约（w527 DiagView dg-node-warn 同款 :deep td 皮）；
 行右键菜单迁 #row-actions 槽（QRT 单元格右键=内核菜单，宿主插件菜单改行尾
 快捷钮点开——CellContextMenu/三菜单项保形，pluginsRowMenu 同步更新）。 -->
        <QueryResultTable
          :cols="mxCols" :rows="mxRows" :col-tips="MX_COL_TIPS"
          storage-key="plugins:matrix" export-name="plugins-matrix"
          max-height="60vh" empty-text="未检测到插件"
          :row-class="mxRowClass">
          <template #cell-插件="{ row }">
            <b>{{ row[0] }}</b>
            <!-- W-D：矩阵行状态徽标 StatusPill（g/y 语义档，文案逐字） -->
            <StatusPill v-if="mxComplete(String(row[0]))" tone="g" label="✅ 完整" class="pl-mx-badge" />
            <StatusPill v-else tone="y" :label="'⚠ 缺 ' + (nodeCount - (mxSummary(String(row[0]))?.count ?? 0)) + ' 台'" class="pl-mx-badge" />
          </template>
          <template #row-actions="{ row }">
            <!-- 插件行菜单入口（原行右键迁槽——复制插件名/SSH 命令/指南，菜单本体保留） -->
            <button class="btn ghost xs" :aria-label="'插件 ' + row[0] + ' 操作菜单'" title="复制插件名 / SSH 安装命令 / 打开指南"
              @click.stop="openPluginMenu($event, String(row[0]))"><Terminal :size="10" /> 安装/卸载</button>
          </template>
        </QueryResultTable>
      </div>

      <div class="pl-card">
        <div class="pl-card-hd">
          <span>原始记录 · {{ nodes.length }} 条</span>
          <!-- 宿主「导出 CSV」钮退役（接线随收口修订）——raw 表 QRT 内建
 CSV 导出钮（bar-right 常驻）承接，审计文件名经 export-name="plugins-raw" 保形
 （旧审计前缀改为 plugins-raw 起头，BOM/转义/提示语归内核 exportCsv 同一口径）；
 W5 的 getCsvBlock 宿主管道随钮退役。 -->
        </div>
        <!-- 天罗W6：raw 表列筛选漏斗/排序/复制矩阵—— W5：裸表换 QRT rows 型，
 漏斗（列头内建）/排序/右键菜单/整表 TSV/列选/Ctrl+F 查找全归内核，宿主胶水
 （useColFilters+ColFilterPopover+useTableSort+rawKw 快滤）退役：kw 快滤与漏斗
 语义重叠（SystemView 天罗W6 同判据），过滤职责归 QRT 漏斗。列名用英文键
 （node/component/version/description）——与导出 CSV 表头、右键整表 TSV 表头逐字同源；
 plugins:raw 维度记忆列选/行高/列宽 -->
        <QueryResultTable :cols="RAW_COLS" :rows="rawMatrix" sortable :col-tips="RAW_COL_TIPS"
          storage-key="plugins:raw" export-name="plugins-raw" max-height="60vh" empty-text="无插件记录" />
      </div>
    </template>
  </div>

    <!-- 安装指南 modal -->
    <div v-if="showGuide" class="pl-modal" @click.self="showGuide = false">
      <!-- G150：aria 最小刀（569 ModalShell 壳契约三行随批）——补 role/aria-modal/
 aria-label（带名档含插件名）+关钮 aria-label；-A3 Esc/Tab trap 既有=半合规补全 -->
      <div class="pl-mo-b" ref="modalRef" role="dialog" aria-modal="true" :aria-label="(currentPlugin ? currentPlugin + ' · ' : '') + '插件安装指南'">
        <div class="pl-mo-hd">
          <BookOpen :size="14" /> 插件安装指南
          <!-- pl-mo-tag bg2 私造徽标改用 StatusPill 统一件（中性 n 档：插件名是
 标识型 chip；mono 字面随统一件 .pill 形态退役） -->
          <StatusPill v-if="currentPlugin" tone="n" :label="currentPlugin" />
          <button class="btn ghost xs pl-close" aria-label="关闭安装指南" @click="showGuide = false">×</button>
        </div>
        <div class="pl-mo-body">
          <div class="pl-step">
            <div class="pl-step-t"><span class="pl-step-n">1</span> SSH 登录到<b>每台</b>数据节点</div>
            <pre class="pl-code">ssh admin@es-node-1.example.com</pre>
          </div>
          <div class="pl-step">
            <div class="pl-step-t"><span class="pl-step-n">2</span> 安装插件（示例：ik 分词器）</div>
            <pre class="pl-code">cd /path/to/elasticsearch
bin/elasticsearch-plugin install {{ currentPlugin || 'analysis-ik' }}

<span class="pl-cm"># 或从本地 zip 安装（离线场景）</span>
bin/elasticsearch-plugin install file:///tmp/{{ currentPlugin || 'analysis-ik' }}-7.10.0.zip

<span class="pl-cm"># 或从 URL 安装</span>
bin/elasticsearch-plugin install https://github.com/medcl/elasticsearch-analysis-ik/releases/download/v7.10.0/elasticsearch-analysis-ik-7.10.0.zip</pre>
          </div>
          <div class="pl-step">
            <div class="pl-step-t"><span class="pl-step-n">3</span> 重启节点（<b>必须</b>，插件不 hot-load）</div>
            <pre class="pl-code">systemctl restart elasticsearch</pre>
          </div>
          <div class="pl-step">
            <div class="pl-step-t"><span class="pl-step-n">4</span> 校验：回本页刷新，看矩阵是否 ✅</div>
          </div>
          <div class="pl-step">
            <div class="pl-step-t"><span class="pl-step-n">⚠</span> 卸载</div>
            <pre class="pl-code">bin/elasticsearch-plugin remove {{ currentPlugin || 'analysis-ik' }}
systemctl restart elasticsearch</pre>
          </div>
          <div class="pl-tip">
            <Info :size="12" />
            <div>
              滚动重启：一次重启一台节点，等 <code>cluster/health = green</code> 再重启下一台，避免服务中断。
              重启期间设置 <code>cluster.routing.allocation.enable = primaries</code> 减少分片迁移。
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 插件行右键菜单（E 组顺延）——复制插件名/SSH 安装命令/打开指南 -->
    <CellContextMenu v-if="pluginMenu" :x="pluginMenu.x" :y="pluginMenu.y" :title="pluginMenu.plugin"
      :items="pluginMenuItems" @close="pluginMenu = null" />

    <!-- G148：原始请求/响应快查弹窗（rim 族；v-model:show 双向关闭） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { PackageOpen, RefreshCw, BookOpen, Info, Terminal, Copy } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import { trapTabKey } from '../utils/focusTrap';
import { useAppStore } from '../stores/app';
import SkeletonBox from '../components/SkeletonBox.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
/* 主空态改用 EmptyState compact； W5：列筛选弹层宿主挂载随
 raw 表换 QRT 壳退役（漏斗由 QRT 内建 ColFilterPopover 接管） */
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* W-D：矩阵行状态徽标统一件 */
/* W5：raw 表换 QRT rows 型——排序（useTableSort）/列漏斗（useColFilters+
 ColFilterPopover）/复制矩阵（matrixText）/kw 快滤（useScopedDraft）宿主胶水全数退役，
 功能由 QRT 内核接管 */
import QueryResultTable from '../components/QueryResultTable.vue';
/* G148：原始请求/响应快查弹窗（rim 族复用；数据源=api.ts ioRecorder 记录环，本组件零请求） */
import RawIoModal from '../components/RawIoModal.vue';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError';

const store = useAppStore();
const busy = ref(false);
const available = ref(false);
const reason = ref('');
const nodes = ref<any[]>([]);
/* ═══ W5：raw 表 QRT rows 型数据映射 ═══
 列=英文键（与导出 CSV 表头、QRT 右键整表 TSV 表头逐字同源）；矩阵值标量化（缺值落 null）。 */
const RAW_COLS = ['node', 'component', 'version', 'description'];
/* ═══ G149：列头中文语义 tip（QRT colTips 通道）═══
 raw 表列名英文=与导出 CSV 表头/右键整表 TSV 表头逐字同源（有意口径，不动）；
 中文语义走悬浮层（717 G60/736 G133 双语同款：显示层英文留检索，悬浮层中文备注） */
const RAW_COL_TIPS: Record<string, string> = {
  node: '节点名：安装该插件的 ES 节点名',
  component: '插件组件名：bin/elasticsearch-plugin 安装的身份标识',
  version: '插件版本：须与 ES 节点版本匹配',
  description: '插件用途描述：该插件干什么用',
};
const MX_COL_TIPS: Record<string, string> = {
  插件: '插件名：按 component 汇总（一行一个插件，列=节点；✅ 已装/❌ 未装）',
};
const rawMatrix = computed(() =>
  nodes.value.map(r => [r.name ?? null, r.component ?? null, r.version ?? null, r.description ?? null]));
/* ═══ G148：原始 IO 三件套（Slm 561 同款；判空不开空弹窗）═══ */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/plugins');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
/* ═══ ：矩阵表 QRT rows 型数据映射 ═══
 列=「插件」+nodeNames 直映射（行=插件×节点）；格值 ✅/❌ 字符（复制/导出同值——原
 ok/miss 双色底随裸表皮退役，emoji 自带色相语义无损）。 */
const mxCols = computed(() => ['插件', ...nodeNames.value]);
const mxRows = computed(() =>
  summary.value.map(p => [p.plugin, ...nodeNames.value.map((n: string) => (p.installedOn ?? []).includes(n) ? '✅' : '❌')]));
function mxSummary(plugin: string) { return summary.value.find(s => s.plugin === plugin); }
function mxComplete(plugin: string) { return !!mxSummary(plugin)?.complete; }
/* 不一致行红底（w527 rowClass 契约；complete 语义由后端 summary 给出，不回自算） */
function mxRowClass(row: any): string | undefined {
  return mxComplete(String(row?.[0])) ? undefined : 'pl-mx-incomp';
}
/* rawQrt ref 随宿主导出钮退役（getCsvBlock 管道归内核内建导出） */
const summary = ref<any[]>([]);
const mismatches = ref<string[]>([]);
const nodeCount = ref(0);
const pluginCount = ref(0);
const showGuide = ref(false);
const currentPlugin = ref('');
const modalRef = ref<HTMLElement | null>(null);
/* -A3：键盘契约——Escape 关 + Tab 焦点陷阱（ConfirmModal 同款范式） */
function onModalKey(e: KeyboardEvent) {
  if (!showGuide.value) return;
  if (e.key === 'Escape') { showGuide.value = false; return; }
  if (modalRef.value) trapTabKey(modalRef.value, e);
}
window.addEventListener('keydown', onModalKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onModalKey));

const nodeNames = computed(() => {
  const s = new Set<string>();
  nodes.value.forEach(n => s.add(n.name));
  return Array.from(s);
});

/* 卡头元信息串（MetaStrip 统一件）：ES 7.10 API 边界全文走根 :title 兜底（原整条 title 前半），
 不一致段与 warn 角标（仅真有不一致时内联）各带细节 tip；hint 段（✅/❌ 图例）走默认插槽 */
const plBaseTip = 'ES 7.10 API 边界：只能读插件列表（_cat/plugins）；安装/卸载必须 SSH 到每台节点执行 bin/elasticsearch-plugin install <name> 并重启节点，REST 层做不到 —— 这是 ES 官方限制，不是我们偷懒。';
const plMeta = computed<MetaStripItem[]>(() => [
  { label: '节点', value: nodeCount.value },
  { label: '插件', value: pluginCount.value },
  {
    label: '不一致', value: mismatches.value.length,
    tone: mismatches.value.length ? 'warn' : undefined,
    tip: mismatches.value.length ? '检测到不一致：' + mismatches.value.join('；') + ' —— 使用该插件的查询会在部分分片失败。' : undefined,
  },
  ...(mismatches.value.length ? [{
    value: '⚠ 插件未全节点装齐' as string,
    tone: 'warn' as const,
    tip: '检测到不一致：某些插件未在所有节点上安装齐 —— 会导致使用该插件的查询在部分分片失败！ ' + mismatches.value.join('；'),
  }] : []),
]);

async function doLoad() {
  busy.value = true;
  try {
    const r: any = await api.pluginsMatrix();
    available.value = !!r?.available;
    reason.value = r?.reason || '';
    nodes.value = r?.nodes || [];
    summary.value = r?.summary || [];
    mismatches.value = r?.mismatches || [];
    nodeCount.value = r?.nodeCount || 0;
    pluginCount.value = r?.pluginCount || 0;
    if (available.value) {
      if (mismatches.value.length) store.notify('warning', `${mismatches.value.length} 项插件不一致`);
      else store.notify('success', `${pluginCount.value} 个插件全节点一致`);
    } else {
      store.notify('error', '插件列表不可用：' + reason.value);
    }
  } catch (e: any) {
    available.value = false;
    /* A：ES 错误友好化——reason 先 friendly 再进空态占位与 toast */
    reason.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '加载失败：' + reason.value);
  } finally { busy.value = false; }
}

function openGuide(plugin: string) {
  currentPlugin.value = plugin;
  showGuide.value = true;
}

/* ═══ ：插件行右键菜单（E 组顺延）——复制插件名/SSH 安装命令/打开指南。
 矩阵表单元格是 ✅/❌ 标记，右键落在插件行上（语义主体是插件而非单元格） ═══ */
const pluginMenu = ref<{ x: number; y: number; plugin: string } | null>(null);
function openPluginMenu(e: MouseEvent, plugin: string) {
  pluginMenu.value = { x: e.clientX, y: e.clientY, plugin };
}
const pluginMenuItems = computed(() => {
  const m = pluginMenu.value; if (!m) return [];
  const name = m.plugin;
  return [
    { key: 'copy-name', label: '复制插件名', icon: Copy, run: async () => {
      const ok = await copyText(name);
      store.notify(ok ? 'success' : 'error', ok ? '已复制插件名' : '复制失败');
    } },
    { key: 'copy-cmd', label: '复制 SSH 安装命令', icon: Terminal, run: async () => {
      const ok = await copyText(`bin/elasticsearch-plugin install ${name}`);
      store.notify(ok ? 'success' : 'error', ok ? '已复制安装命令' : '复制失败');
    } },
    { key: 'guide', label: '安装/卸载指南', icon: BookOpen, sep: true, run: () => openGuide(name) },
  ];
});

onMounted(doLoad);
</script>

<style scoped>
/* G1-C12：区块级间距落梯 --sp token（徽章/控件内 padding 与亚阶梯微调不动） */
.pl-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
/* W-F：.pl-hd/.pl-hd-l/.pl-hd-ic/.pl-hd-tt/.pl-hd-sub/.pl-hd-r 死规则删除（页头已迁 PageHeader）
 .pl-card-hd 条状卡头（带壳 padding+分隔线）属组件私有形态豁免，不并轨 .card-t */
/* IndexHub 新范式→MetaStrip 统一件：原本地 meta 形态与 warn 角标类退役；插槽手写
 sep 也随组件「默认插槽自动 .ms-sep」退役（.pl-strip-sep 规则删除），仅 hint 段留局部样式 */
/* .pl-empty 随主空态改用 EmptyState compact 退役（原表格行内子空态
 内芯合并 EmptyState compact， td/colspan 外壳随矩阵表换内核退役） */
.pl-loading { display: flex; flex-direction: column; gap: var(--sp-2); }
/* pl-card 壳三件套退役 → border-top 分节（545 lc-panel 同语言；模板/高度链零动，
 分界由 pl-card-hd 既有 border-bottom 承接；overflow:hidden 裁剪壳随圆角退役） */
.pl-card { border-top: 1px solid var(--line); padding-top: var(--sp-2); margin-bottom: var(--sp-3); }
.pl-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.pl-hint { color: var(--muted); font-size: var(--fs-xs); }
/* 裸矩阵表皮（滚动壳/矩阵表/单元格排版全家）随矩阵表换 QRT rows 型退役
 ——滚动/表头粘顶归 QRT 内建；max-height 60vh 由 props 传内核 */
/* W-D：ok/warn 子档色规则随 StatusPill 改用退役（.pill g/y 同 token 单源），
 display:inline-block 保留（矩阵单元格内既有落位形态） */
.pl-mx-badge {display: inline-block;}
/* 不一致行红底（rowClass 契约；w527 DiagView dg-node-warn 同款 :deep td 皮——tr 由内核渲染） */
.pl-page :deep(.pl-mx-incomp td) { background: var(--err-soft); }
/* 子空态内芯已随内芯合并退役； td/colspan 外壳随矩阵表换
 QRT rows 型一并退役（空态文案归内核 empty-text） */
.pl-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--mask); display: flex; align-items: center; justify-content: center; z-index: var(--z-modal-view); }
/* E：补 max-width 防窄视口横向溢出（640px 写死在小屏顶出滚动条） */
.pl-mo-b { width: 640px; max-width: 92vw; max-height: 82vh; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); display: flex; flex-direction: column; }
.pl-mo-hd { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); font-size: var(--fs-md); display: flex; align-items: center; gap: var(--sp-2); }
/* .pl-mo-tag 私造样式随 StatusPill 改用退役（n 档形态归 .pill 单源） */
.pl-close { margin-left: auto; }
.pl-mo-body { padding: var(--sp-4); overflow: auto; }
.pl-step { margin-bottom: var(--sp-4); }
.pl-step-t { font-size: var(--fs-sm); color: var(--fg); margin-bottom: var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); }
.pl-step-n { display: inline-flex; width: 20px; height: 20px; align-items: center; justify-content: center; background: var(--ac-soft); color: var(--ac-hi); border: 1px solid var(--ac-line); border-radius: 50%; font-size: var(--fs-xs); font-weight: 600; }
/* 轨4：代码框 border 退役（刀④；df-code/hr-code 全站代码面语言：bg+radius 无 border） */
.pl-code { background: var(--bg2); border-radius: var(--r-xs); padding: var(--sp-2) var(--sp-3); font-family: var(--mono); font-size: var(--fs-xs); color: var(--fg); margin: 0; overflow-x: auto; white-space: pre; }
.pl-cm { color: var(--ok); }
.pl-tip { display: flex; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--info-soft); border-radius: var(--r-xs); font-size: var(--fs-xs); margin-top: var(--sp-3); }
.pl-tip code { background: var(--bg2); padding: 1px var(--sp-1); border-radius: 3px; }

/* .pl-hint-right 随宿主「导出 CSV」钮退役（无消费者） */

/* 900 紧凑微调档——页侧距 --sp-4 收 --sp-3；指南弹窗体内距收 --sp-3
 （弹窗已有 max-width:92vw 钳制）。：.pl-mx-cell 紧凑档随矩阵表皮退役
 （QRT 单元格内距归内核行高三档）；.pl-code overflow-x 横滚兜底保留 */
@media (max-width: 900px) {
  .pl-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .pl-mo-body { padding: var(--sp-3); }
}
</style>
