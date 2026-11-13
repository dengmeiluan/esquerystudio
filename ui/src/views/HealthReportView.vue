<template>
  <div class="hr-page">
    <div class="hr-hd">
      <PageHeader :icon="HeartPulse" title="一键集群体检" subtitle="10 秒扫描：状态、分片、Pending、索引健康、节点负载 · 智能打分与建议">
      <template #actions>
        <div class="hr-hd-r">
          <button class="btn ghost sm" :disabled="!data" @click="copyReportMd" title="复制报告 Markdown（贴群/工单）">
            <ClipboardCopy :size="12" /> 复制 MD
          </button>
          <button class="btn ghost sm" :disabled="!data" @click="exportMd">
            <Download :size="12" /> 导出 Markdown
          </button>
          <!-- G263：原始 IO 快查（778 G259/777 G255 同构）——本页体检通道
 （GET /cluster/health-report）请求/响应原文直达 -->
          <button class="btn sm ghost" title="最近一次集群体检（health-report）请求/响应原文（复制/cURL 回放）" @click="openRawIo">
            <Terminal :size="11" /> 原始 IO
          </button>
          <button class="btn pri sm" :disabled="loading" @click="run">
            <RefreshCcw :size="12" :class="{ 'spin': loading }" /> {{ loading ? '扫描中…' : '开始体检' }}
          </button>
        </div>
      </template>
      </PageHeader>
</div>

    <!-- G2-B3：失败不再仅 toast 后回落「尚未运行体检」伪装空态（ 同源）——
 err-bar 全文+重试常驻；有旧报告时与报告并存，刷新失败不丢数据 -->
    <div v-if="runErr" role="alert" class="err-bar rise-in">
      体检失败：{{ runErr }}
      <button class="btn sm" @click="run" :disabled="loading">重试</button>
    </div>

    <EmptyState v-if="!data && !loading && !runErr" :icon="HeartPulse"
                text="尚未运行体检"
                hint="生成 30 秒可读、可导出、可分享的诊断报告"
                action-text="开始体检" @action="run" />

    <!-- G265a：role=status——在途状态语义播报（G224/G229/G235 族；
 shimmer 无真实进度值，progressbar 无 valuenow 语义含糊，语义归容器） -->
    <div v-if="loading" class="hr-load" role="status" aria-label="正在体检，耗时约 5-15 秒">
      <div class="hr-load-tt">正在体检…</div>
      <div class="hr-load-bar"><div class="hr-load-fill"></div></div>
      <div class="hr-load-sub">耗时约 5-15s，取决于集群大小</div>
    </div>

    <div v-if="data" class="hr-body">
      <!-- 多份存档任选两次对比（202「与上次对比」升级）——基准/对照下拉+得分差摘要+完全一致正向反馈 -->
      <details v-if="archive.length >= 2" class="hr-diff">
        <!-- 得分差/变化率徽标改用 StatusPill 统一件（升降直映主档：up→g/down→r；
 xs 档对齐原 2xs，mono 保数字档；hr-diff-pct 锚类保留，皮归 .pill 单源） -->
        <summary>体检对比（{{ diffItems.length }} 项变化 · 得分 {{ baseScore ?? '—' }} → {{ cmpScore ?? '—' }} <StatusPill v-if="scoreDelta" class="hr-diff-pct mono xs" :tone="deltaUp ? 'g' : 'r'" :label="scoreDelta" />）</summary>
        <div class="hr-diff-pick">
          <!-- 基准/对照改用 usePopupList 弹层选择器（原生 select 无输入过滤，存档 8 份后靠滚动盲找）：
 label 带时间（archiveLabel），输入即过滤（精确>前缀>包含 rank），点选/Enter 回填存档下标；
 pickBase/pickCmp 语义不变（仍为下标，diff 链路零改动），弹层 Teleport 在 body 下 -->
          <label class="hr-pick" ref="baseRootEl">
            <span>基准（旧）</span>
            <input class="hr-sel mono" :value="baseKw || baseLabel" placeholder="选择基准报告" spellcheck="false" autocomplete="off"
              role="combobox" aria-autocomplete="list" :aria-expanded="baseOpen ? 'true' : 'false'"
              :aria-controls="baseListId" :aria-activedescendant="baseOpen && baseItems[baseCursor] ? baseItemId(baseCursor) : undefined"
              @input="onBaseInput" @focus="openBasePanel" @keydown="baseOnKey" />
          </label>
          <span class="hr-diff-arrow">→</span>
          <label class="hr-pick" ref="cmpRootEl">
            <span>对照（新）</span>
            <input class="hr-sel mono" :value="cmpKw || cmpLabel" placeholder="选择对照报告" spellcheck="false" autocomplete="off"
              role="combobox" aria-autocomplete="list" :aria-expanded="cmpOpen ? 'true' : 'false'"
              :aria-controls="cmpListId" :aria-activedescendant="cmpOpen && cmpItems[cmpCursor] ? cmpItemId(cmpCursor) : undefined"
              @input="onCmpInput" @focus="openCmpPanel" @keydown="cmpOnKey" />
          </label>
          <Teleport :to="teleportTo" :disabled="inplace">
            <transition name="pop">
              <div v-if="baseOpen" class="hr-pop float-pop" :class="{ inplace }" :style="basePopStyle" @mousedown.prevent.stop>
                <!-- (b)：hr-pop-hint 裸 div 空态合并 EmptyState compact 统一件
 （ rp-empty/st-list-empty 同语言；文案逐字保留走 :text 绑定） -->
                <EmptyState v-if="!baseItems.length" compact :icon="SearchX" :text="'没有匹配「' + baseKw + '」的存档报告'" />
                <div v-else class="hr-pop-list" ref="baseListEl" :id="baseListId" role="listbox">
                  <div v-for="(o, i) in baseItems" :key="o.i" class="hr-pop-item" :class="{ act: i === baseCursor }"
                    role="option" :id="baseItemId(i)" :aria-selected="i === baseCursor" tabindex="-1"
                    @mouseenter="baseCursor = i" @click="chooseBase(o)">
                    <span class="mono">{{ o.label }}</span>
                    <!-- 选中标记改用 StatusPill（本弹层当前选中原 .on→b 强调档/另一角色
 →n 中性档；mark 徽标语义非搜索高亮，MarkText 不合—— pillSweep554 头注） -->
                    <StatusPill v-if="o.i === pickBase" class="hr-pop-mark" tone="b" label="当前基准" />
                    <StatusPill v-if="o.i === pickCmp" class="hr-pop-mark" tone="n" label="当前对照" />
                  </div>
                </div>
              </div>
            </transition>
          </Teleport>
          <Teleport :to="teleportTo" :disabled="inplace">
            <transition name="pop">
              <div v-if="cmpOpen" class="hr-pop float-pop" :class="{ inplace }" :style="cmpPopStyle" @mousedown.prevent.stop>
                <EmptyState v-if="!cmpItems.length" compact :icon="SearchX" :text="'没有匹配「' + cmpKw + '」的存档报告'" />
                <div v-else class="hr-pop-list" ref="cmpListEl" :id="cmpListId" role="listbox">
                  <div v-for="(o, i) in cmpItems" :key="o.i" class="hr-pop-item" :class="{ act: i === cmpCursor }"
                    role="option" :id="cmpItemId(i)" :aria-selected="i === cmpCursor" tabindex="-1"
                    @mouseenter="cmpCursor = i" @click="chooseCmp(o)">
                    <span class="mono">{{ o.label }}</span>
                    <StatusPill v-if="o.i === pickCmp" class="hr-pop-mark" tone="b" label="当前对照" />
                    <StatusPill v-if="o.i === pickBase" class="hr-pop-mark" tone="n" label="当前基准" />
                  </div>
                </div>
              </div>
            </transition>
          </Teleport>
          <!-- 对比结果 Markdown 复制（处置报告贴工单——得分差+变化清单全带出） -->
          <button class="btn sm ghost" style="margin-left:auto" title="复制对比结果为 Markdown（工单/群聊直贴）" @click="copyDiffMd"><ClipboardCopy :size="11" /> 复制对比 MD</button>
        </div>
        <div v-if="diffItems.length" class="hr-diff-body">
          <div v-for="(d, i) in diffItems" :key="i" class="hr-diff-row">
            <code class="hr-diff-k mono">{{ d.k }}</code>
            <span class="hr-diff-old" :title="d.old">{{ d.old === '' ? '（无）' : d.old }}</span>
            <span class="hr-diff-arrow">→</span>
            <span class="hr-diff-new" :title="d.new">{{ d.new === '' ? '（无）' : d.new }}</span>
            <StatusPill v-if="d.pct" class="hr-diff-pct mono xs" :tone="d.tone" :label="d.pct" />
          </div>
        </div>
        <div v-else class="hr-diff-same">两份报告内容完全一致，期间集群状态无变化</div>
      </details>
      <!-- 顶部评分卡 -->
      <div class="hr-hero" :class="scoreCls">
        <div class="hr-hero-l">
          <div class="hr-score">
            <span class="hr-score-n">{{ data.score }}</span>
            <span class="hr-score-max">/ 100</span>
          </div>
          <div class="hr-score-tt">{{ scoreLabel }}</div>
        </div>
        <!-- 摘要值并 meta-num 全局数值档（b 已 mono，补 tabular-nums，三页统一数值档） -->
        <div class="hr-hero-r meta-num">
          <div class="hr-hero-row">
            <!-- 状态 toUpperCase 裸串+statCls 手配色 → StatusPill 统一件
 （tone 走 statusTone=healthPill 同源窄化：green→g/yellow→y/其余→r）。
 label 中文化——clusterHealthZh 主显（健康/亚健康/异常），
 未收录枚举回落原裸串（OverviewView jobStatusZh 同款回落形态） -->
            <span>状态</span><StatusPill :tone="statusTone" :label="healthZh(String(data.summary?.status || '')) || String(data.summary?.status || '').toUpperCase() || '-'" />
          </div>
          <div class="hr-hero-row"><span>未分配分片</span><b>{{ data.summary?.unassigned }}</b></div>
          <!-- G265b：ES 术语 label 中文悬停释义（G55/G60/ 族；术语主显保留，
 buildReportMd 工单导出同词不动） -->
          <div class="hr-hero-row"><span title="集群待处理任务数（pending tasks）">Pending Tasks</span><b>{{ data.summary?.pending }}</b></div>
          <div class="hr-hero-row"><span>不健康索引</span><b>{{ data.summary?.unhealthyIndices }}</b></div>
          <div class="hr-hero-row"><span>节点 / 高负载</span><b>{{ data.summary?.nodes }} / {{ data.summary?.hotNodes }}</b></div>
          <div class="hr-hero-row dim"><span>生成时间</span><b>{{ generatedAt }}</b></div>
        </div>
      </div>

      <!-- 检查项 -->
      <div class="hr-sec">
        <!-- 分节计数徽标改用 StatusPill n 档（中性计数；hr-sec-cnt 锚类保留，皮归 .pill 单源） -->
        <div class="card-t hr-sec-hd">检查项 <StatusPill class="hr-sec-cnt" tone="n" :label="String(data.checks?.length || 0)" /></div>
        <div class="hr-checks">
          <div v-for="(c, i) in data.checks" :key="i" class="hr-check" :class="'lv-' + c.level"
            tabindex="0"
            @contextmenu.prevent="openCheckMenu($event, c)" @keydown="onCheckMenuKey($event, c)" data-row-nav @keydown.self="rowArrowNav">
            <span class="hr-lv"><Circle v-if="c.level==='info'" :size="8" fill="currentColor" /><AlertTriangle v-else-if="c.level==='warn'" :size="12" /><AlertOctagon v-else :size="13" /></span>
            <span class="hr-name">{{ c.name }}</span>
            <span class="hr-msg">{{ c.message }}</span>
            <!-- 检查项复制（critical/warn 正是贴工单内容） -->
            <button class="btn ghost xs" :aria-label="'复制检查项：' + c.name"
              title="复制此检查项（级别+名称+详情）" @click="copyCheck(c)">
<ClipboardCopy :size="10" />
</button>
          </div>
        </div>
      </div>

      <!-- 不健康索引 -->
      <div v-if="data.unhealthyIndices?.length" class="hr-sec">
        <div class="card-t hr-sec-hd">
不健康索引
          <StatusPill class="hr-sec-cnt" tone="n" :label="String(data.unhealthyIndices.length)" />
        </div>
        <!-- W5：裸表换 QRT rows 型（天罗W6 graft 胶水退役：useTableSort 排序/
 useColStats tfoot/Σ 开关钮/数值矩阵钮/idxKw 快滤框——排序/漏斗/聚合行/整表 TSV/
 列选归 QRT 内核；idxKw 与漏斗语义重叠，过滤职责归 QRT 漏斗+Ctrl+F，SystemView
 天罗W6 同判据）。storageKey=health:unhealthy 与既有 es_tbl_agg:health:unhealthy
 落盘键无缝兼容；数值列 Number 化——QRT 采样口径 isNumeric 只认 number（'5' 字符串
 不计 Σ，graft 期 isNumeric:()=>true 强制口径的内核侧等价），'1kb' 带单位串保持
 字符串自动出局 Σ（口径不变）；health pill 色档随纯文本壳退役（值照常渲染），
 索引名跳转由 row-actions 注入钮承接 -->
        <QueryResultTable :cols="UX_COLS" :rows="uxMatrix" sortable
          storage-key="health:unhealthy" export-name="health-ux" :field-types="UX_TYPES" max-height="420px">
          <!-- health/size 两列补显示槽（QRT 数据恒 raw——uxMatrix 原值不动，
 排序/聚合/导出/漏斗全走原值；仅显示层加工，两槽 title 恒 raw 原值）：
 health → healthZh 中文主显 + 色点（green→g / yellow→y / red→r，healthPill 档名）；
 size → semFormat bytes 单源（parseBytes 先归一字节数，不可解析回落原值）。
 ⚠已知冲突：healthThreeState.spec.ts:191 旧锚锁单元格文本==='red'，
 中文主显后该例红灯——锚迁移归守卫归属方（文件面不含该 spec） -->
          <template #cell-health="{ value }">
            <!-- health 色点改用 MetaStrip dot 形态单源（DiagView dgMeta 先例）——
 私造圆点与 hd-g/y/r 三档色规则退役，色值直传 dot 位（healthColor 与原三档
 同 token）；中文主显走 value 亮色段（文案不变），title 兜底仍由槽级 span 承接
 （ 锚同步更新） -->
            <span class="hr-cell-health" :title="String(value ?? '')"><MetaStrip :items="[{ dot: healthColor(String(value || '')), value: healthZh(value) || value }]" /></span>
          </template>
          <template #cell-size="{ value }">
            <span class="mono" :title="String(value ?? '')">{{ semFormat(parseBytes(value), 'bytes')?.text ?? value }}</span>
          </template>
          <template #row-actions="{ row }">
            <button v-if="row[0]" class="btn ghost xs" :aria-label="'打开索引工作区（分片诊断）：' + row[0]"
              title="打开索引工作区（分片诊断）" @click.stop="goHub(String(row[0]))"><ExternalLink :size="11" /></button>
          </template>
        </QueryResultTable>
      </div>

      <!-- 节点 -->
      <div v-if="data.nodes?.length" class="hr-sec">
        <div class="card-t hr-sec-hd">节点负载 <StatusPill class="hr-sec-cnt" tone="n" :label="String(data.nodes.length)" /></div>
        <!-- W5：节点负载表同步换 QRT rows 型（storageKey=health:nodes 与
 es_tbl_agg:health:nodes 兼容）；heap/cpu/disk/ram hotCls 水位色档随纯文本壳退役
 （数值保真进排序/聚合/漏斗区间）； W-F：hotCls 行级语义回收——
 rowClass 契约（内核 W-D 落地：返回 class 追加到 tr），heap/cpu/disk 超阈行挂
 hr-row-hot（bad）/hr-row-warm（warn），多列取最严重档，CSS 类定义留本视图 scoped -->
        <QueryResultTable :cols="ND_COLS" :rows="ndMatrix" sortable
          storage-key="health:nodes" export-name="health-nd" :field-types="ND_TYPES" max-height="420px"
          :row-class="ndRowClass" />
      </div>

      <!-- allocation explain -->
      <div v-if="data.allocationExplain" class="hr-sec">
        <div class="card-t hr-sec-hd">分配解释（allocation/explain）</div>
        <div v-if="data.allocationExplain.unassigned_info" class="hr-alloc-line">
          <!-- 天罗W6：reason 裸码接 reasonZh 人话 + meta-warn 档（与 DiagView 同源同档）；
 can_allocate 三档收口 canAllocateCls（yes→ok/no→err/其余 warn，原内联三元等价迁移） -->
          <span class="dg-k">reason：</span><span class="mono meta-warn">{{ data.allocationExplain.unassigned_info.reason }}</span>
          <span class="hr-alloc-zh">（{{ reasonZh(data.allocationExplain.unassigned_info.reason) }}）</span>
          <b style="margin-left:var(--sp-3)">can_allocate：</b><span class="mono" :class="canAllocateCls(data.allocationExplain.can_allocate)">{{ data.allocationExplain.can_allocate }}</span>
        </div>
        <details class="hr-alloc-details">
          <summary>原始 JSON</summary>
          <!-- W-C 批：allocation explain 原始 JSON 走 highlightJson 范式（转义安全 v-html） -->
          <pre class="hr-code json-view" v-html="allocExplainHtml"></pre>
        </details>
      </div>
    </div>

    <!-- G263：受控弹窗挂页尾（777/778 同款） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1177：检查项行右键（warn/critical 正是贴工单的内容，此前只有行尾一颗左键钮） -->
    <CellContextMenu v-if="checkMenu" :x="checkMenu.x" :y="checkMenu.y"
      :title="'检查项 · ' + checkMenu.c.name" :items="checkMenuItems" @close="checkMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { HeartPulse, Download, RefreshCcw, Circle, AlertTriangle, AlertOctagon, ClipboardCopy, ExternalLink, SearchX, Terminal, Copy, Braces, Info, Filter } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：状态徽标统一件 */
import RawIoModal from '../components/RawIoModal.vue'; /* G263：原始 IO 快查弹窗（778 G259 同构） */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { useRouter } from 'vue-router';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { useScopedDraft } from '../composables/useScopedDraft';
import { exportStamp, fmtTime, downloadText, copyText, healthPill } from '../utils/format';
/* health 色点 dot 色值单源（healthColor 独立 import 行——上一行 format import
 被 字面锁定，逐字不动，parseBytes 先例同款） */
import { healthColor } from '../utils/format';
import MetaStrip from '../components/MetaStrip.vue'; /* ：health 色点 dot 形态单源（bw-hdot 四胞之一） */
/* size 列 bytes 显示槽归一（parseBytes 独立 import 行——上一行 format import
 被 .spec 字面锁定，逐字不动） */
import { parseBytes } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
/* 天罗W6：枚举跨页收口——reason 人话与 can_allocate 三档出自 utils/esEnumZh（DiagView 同源） */
import { reasonZh, canAllocateCls } from '../utils/esEnumZh';
/* health 列中文主显——起本地 HEALTH_ZH 三值映射退役，合并
 esEnumZh.clusterHealthZh 单源（ClusterSwitcher/SetupWizard 同源；esEnumZh 随批提交，
 批内自洽；import 别名 healthZh 模板槽零改动）。独立 import 行——上一行 esEnumZh import
 被 .spec 字面锁定，逐字不动 */
import { clusterHealthZh as healthZh } from '../utils/esEnumZh';
import { semFormat } from '../composables/useSemFormat'; /* ：size 列 bytes 单源显示 */
import { loadArchive, pushReport, archiveLabel, defaultPair, type ArchivedReport } from '../utils/reportArchive';
import { usePopupList } from '../composables/usePopupList';
import { highlightJson } from '../utils/jsonc';
import QueryResultTable from '../components/QueryResultTable.vue'; /* W5：双表换 QRT rows 型 */
import { metricTone } from '../utils/metricThresholds'; /* W-F：节点表行级水位档（hotCls 语义回收，阈值单一真源） */
import { writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
const router = useRouter();

/* 不健康索引名可点——直跳索引工作区分片诊断 tab（ W5：入口从 index 格
 点击改由 QRT row-actions 注入钮承接，goHub 语义零变化） */
function goHub(name: string) {
  store.pick(name);
  router.push({ path: '/indices', query: { idx: name, tab: 'shards' } });
}
const loading = ref(false);
const data = ref<any>(null);
/* W-C 批：分配解释原始 JSON 高亮（highlightJson 输出已转义） */
const allocExplainHtml = computed(() =>
  data.value?.allocationExplain ? highlightJson(JSON.stringify(data.value.allocationExplain, null, 2)) : '');
/* G2-B3：失败状态位——err-bar 常驻（全文+重试），与 EmptyState/报告区互斥 */
const runErr = ref('');

/* G263：原始 IO 快查（778 G259 同构）——按本页体检通道端点取记录环最近一条；
 判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/health-report');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先开始一次体检（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ═══ W5：双表 QRT rows 型数据映射 ═══
 列头文案逐字承旧 thead（index/health/pri/rep/docs/size；name/heap%/cpu%/load 1m/disk%/ram%）；
 数值列 Number 化——QRT 内核采样口径 isNumeric 只认 number（graft 期 useColStats
 isNumeric:()=>true 强制口径在内核侧的等价实现；'5' 字符串若不转 Number 会被 Σ 出局），
 size '1kb' 带单位串保持字符串（Number=NaN 自动出局 Σ，口径与 graft 期一致）；
 fieldTypes 只喂显示/交互档位（数值右对齐+千分位），数据恒 raw。 */
const UX_COLS = ['index', 'health', 'pri', 'rep', 'docs', 'size'];
const num = (v: any): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const uxMatrix = computed(() => (data.value?.unhealthyIndices || []).map((ix: any) =>
  [ix.index ?? null, ix.health ?? null, num(ix.pri), num(ix.rep), num(ix['docs.count']), ix['store.size'] ?? null]));
const UX_TYPES: Record<string, string> = { pri: 'integer', rep: 'integer', docs: 'long' };
const ND_COLS = ['name', 'heap%', 'cpu%', 'load 1m', 'disk%', 'ram%'];
const ndMatrix = computed(() => (data.value?.nodes || []).map((n: any) =>
  [n.name ?? null, num(n['heap.percent']), num(n.cpu), num(n['load_1m']), num(n['disk.used_percent']), num(n['ram.percent'])]));
const ND_TYPES: Record<string, string> = { 'heap%': 'scaled_float', 'cpu%': 'scaled_float', 'load 1m': 'float', 'disk%': 'scaled_float', 'ram%': 'scaled_float' };
/* W-F：节点表水位行色档消费（QRT rowClass 契约，内核 W-D 并行在途）——
 W5 随纯文本壳退役的 hotCls 语义行级回收：heap/cpu/disk 三列过 METRIC_THRESHOLDS
 阈值表（单一真源，与 LiveDashboard/DiagView 同源不回自造阈值），bad→hr-row-hot、
 warn→hr-row-warm（多列取最严重档）；ndMatrix 列序 [name, heap%, cpu%, load 1m, disk%, ram%]。
 QRT 尚无该 prop 时经 attrs 透传不报错，待内核落地后 Lead 终验。 */
const ndRowClass = (row: any[]): string | undefined => {
  const tones = [
    metricTone('heap', row[1] as number),
    metricTone('cpu', row[2] as number),
    metricTone('disk', row[4] as number),
  ];
  if (tones.includes('bad')) return 'hr-row-hot';
  if (tones.includes('warn')) return 'hr-row-warm';
  return undefined;
};

/* 报告可重入——最近一次体检落 sessionStorage，刷新后自动复原（生成时间行可辨新旧） */
const SS_KEY = 'esquerystudio.health-report.last';
/* 多份存档 + 任选两次对比（202 单份 PREV_KEY「与上次对比」升级）——
 localStorage 环形存档 8 份，对比卡任选基准/对照两份 diff */
const archive = ref<ArchivedReport[]>([]);
const pickBase = ref(1); /* 基准下标（旧，默认次新） */
const pickCmp = ref(0);  /* 对照下标（新，默认最新） */
onMounted(() => {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) data.value = JSON.parse(raw);
  } catch { /* 坏值回落空态 */ }
  archive.value = loadArchive(localStorage);
  const dp = defaultPair(archive.value);
  if (dp) { pickBase.value = dp.base; pickCmp.value = dp.cmp; }
});

/* ═══ 基准/对照弹层选择器（usePopupList 双实例）═══
 候选=存档报告（label 带 archiveLabel 时间），输入即过滤+rank，回填仍是存档下标
 （pickBase/pickCmp 消费方 defaultPair/copyDiffMd/diffItems 零改动） */
type ArchOpt = { i: number; label: string };
const archOpts = computed<ArchOpt[]>(() => archive.value.map((e, i) => ({ i, label: archiveLabel(e) })));
const baseKw = ref('');
const cmpKw = ref('');
const baseLabel = computed(() => archOpts.value[pickBase.value]?.label || '');
const cmpLabel = computed(() => archOpts.value[pickCmp.value]?.label || '');
/* rank：精确命中 0 < 前缀命中 1 < 其余包含命中 2（比较前统一小写，IndexPicker 同口径） */
function archRank(label: string, kw: string): number {
  const l = label.toLowerCase();
  return l === kw ? 0 : l.startsWith(kw) ? 1 : 2;
}
function archFilterItems(kw: string): ArchOpt[] {
  const k = kw.trim().toLowerCase();
  if (!k) return archOpts.value;
  return archOpts.value
    .filter(o => o.label.toLowerCase().includes(k))
    .sort((a, b) => archRank(a.label, k) - archRank(b.label, k) || a.label.localeCompare(b.label));
}
const baseItems = computed(() => archFilterItems(baseKw.value));
const cmpItems = computed(() => archFilterItems(cmpKw.value));

function chooseBase(o: ArchOpt) { pickBase.value = o.i; baseKw.value = ''; closeBase(); }
function chooseCmp(o: ArchOpt) { pickCmp.value = o.i; cmpKw.value = ''; closeCmp(); }

const {
  open: baseOpen, cursor: baseCursor, popStyle: basePopStyle, teleportTo, inplace,
  listId: baseListId, itemId: baseItemId, rootEl: baseRootEl, listEl: baseListEl,
  openPanel: openBasePanel, close: closeBase, onKey: baseOnKey,
} = usePopupList<ArchOpt>({ items: () => baseItems.value, onChoose: chooseBase });
const {
  open: cmpOpen, cursor: cmpCursor, popStyle: cmpPopStyle,
  listId: cmpListId, itemId: cmpItemId, rootEl: cmpRootEl, listEl: cmpListEl,
  openPanel: openCmpPanel, close: closeCmp, onKey: cmpOnKey,
} = usePopupList<ArchOpt>({ items: () => cmpItems.value, onChoose: chooseCmp });

function onBaseInput(e: Event) {
  baseKw.value = (e.target as HTMLInputElement).value;
  baseCursor.value = 0;
  if (!baseOpen.value) openBasePanel();
}
function onCmpInput(e: Event) {
  cmpKw.value = (e.target as HTMLInputElement).value;
  cmpCursor.value = 0;
  if (!cmpOpen.value) openCmpPanel();
}

const generatedAt = computed(() => {
  if (!data.value?.generatedAt) return '';
  try { return fmtTime(data.value.generatedAt); }
  catch { return data.value.generatedAt; }
});
const scoreCls = computed(() => {
  const s = data.value?.score ?? 0;
  return s >= 85 ? 'ok' : s >= 60 ? 'warn' : 'err';
});
const scoreLabel = computed(() => {
  const s = data.value?.score ?? 0;
  return s >= 85 ? '状态良好，可继续观察' : s >= 60 ? '存在告警，建议处理' : '严重问题，立即处置';
});
/* statCls 手配色三元随状态徽标改用 StatusPill 退役
 （tone 走 utils/format.healthPill：green→g / yellow→y / 其余→r 单源）；
 healthPill 返回 string 而组件 tone 是五主档联合——本 computed 仅做类型窄化
 （healthPill 按定义只出 g/y/r，as 断言诚实，逻辑零重复） */
const statusTone = computed<'g' | 'y' | 'r'>(() =>
  healthPill(String(data.value?.summary?.status || '')) as 'g' | 'y' | 'r');

let runSeq = 0;
async function run() {
  const seq = ++runSeq;
  loading.value = true;
  runErr.value = '';
  try {
    const rep = await api.healthReport();
    if (seq !== runSeq) return;
    data.value = rep;
    writeStoredRaw(sessionStorage, SS_KEY, JSON.stringify(data.value));
    /* 多份存档——落 localStorage 环形档并重置默认对比对（基准=次新/对照=最新）；
 sessionStorage SS_KEY 仍写（ 刷新复原语义不变），PREV_KEY 单份对比退役 */
    archive.value = pushReport(localStorage, data.value);
    const dp = defaultPair(archive.value);
    if (dp) { pickBase.value = dp.base; pickCmp.value = dp.cmp; }
    store.notify('success', `体检完成：得分 ${data.value.score}`);
  } catch (e: any) {
    if (seq !== runSeq) return;
    runErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '体检失败：' + runErr.value);
  } finally { if (seq === runSeq) loading.value = false; }
}

/* ═══ 报告对比（扁平化键值 diff）═══
 报告对象拍平成 dot-key:标量值，列出两份报告中所有值变化的键（含新增/消失）。
 数组序列化成 JSON 串比较；218 起数据源=存档中任选「基准（旧）/对照（新）」两份。 */
const baseEntry = computed(() => archive.value[pickBase.value] || null);
const cmpEntry = computed(() => archive.value[pickCmp.value] || null);
const baseScore = computed(() => baseEntry.value?.score ?? null);
const cmpScore = computed(() => cmpEntry.value?.score ?? null);
/* 得分差：基准→对照升降直读（↑ 好转绿 / ↓ 退化红），相等或缺分不出 */
const deltaUp = computed(() => (cmpScore.value ?? 0) > (baseScore.value ?? 0));
const scoreDelta = computed(() => {
  const b = baseScore.value, c = cmpScore.value;
  if (b == null || c == null || c === b) return '';
  return (c > b ? '↑ ' : '↓ ') + Math.abs(c - b);
});
function flatReport(o: any, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(o || {})) {
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatReport(v, key, out);
    else out[key] = Array.isArray(v) ? JSON.stringify(v) : String(v ?? '');
  }
  return out;
}
const diffItems = computed(() => {
  if (!baseEntry.value || !cmpEntry.value) return [];
  const a = flatReport(baseEntry.value.data);
  const b = flatReport(cmpEntry.value.data);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  /* 数值型变化附变化率（↑/↓ 徽标，可视化拉满）；非数值/缺失不判 */
  const out: { k: string; old: string; new: string; pct?: string; tone?: 'g' | 'r' | 'n' }[] = [];
  for (const k of keys) {
    /* 生成时间是报告元数据非集群状态：排除出对比——否则任何两份报告恒有 ≥1 项变化，
     「完全一致」的正向反馈永不出现 */
    if (k === 'generatedAt') continue;
    if (!(k in a)) { out.push({ k, old: '', new: b[k] }); continue; }
    if (!(k in b)) { out.push({ k, old: a[k], new: '' }); continue; }
    if (a[k] !== b[k]) out.push({ k, old: a[k], new: b[k] });
  }
  for (const d of out) {
    const ov = parseFloat(d.old), nv = parseFloat(d.new);
    if (!Number.isNaN(ov) && !Number.isNaN(nv) && ov !== 0) {
      const rate = ((nv - ov) / Math.abs(ov)) * 100;
      if (Math.abs(rate) >= 1) {
        d.pct = (rate > 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(rate)) + '%';
        d.tone = diffTone(d.k, rate > 0);
      }
    }
  }
  return out.slice(0, 200);
});
/* 徽标色档随指标性质分档，不一律「涨绿跌红」：score 涨=改善（绿）；
 「越多越糟」的集群健康量（未分配分片/待处理任务/不健康索引/高负载节点）
 涨=恶化（红）跌=缓解（绿）；其余容量/结构量（节点数/索引数等）涨跌无好坏，
 中性档不判方向——白名单双表，未收录键一律中性（宁中性勿误导）。 */
const DIFF_GOOD_UP = ['score'];
const DIFF_BAD_UP = ['summary.unassigned', 'summary.pending', 'summary.unhealthyIndices', 'summary.hotNodes'];
function diffTone(key: string, up: boolean): 'g' | 'r' | 'n' {
  if (DIFF_GOOD_UP.includes(key)) return up ? 'g' : 'r';
  if (DIFF_BAD_UP.includes(key)) return up ? 'r' : 'g';
  return 'n';
}
/* 对比结果 Markdown 复制（处置报告贴工单——基准/对照标签+得分差+全量变化清单） */
async function copyDiffMd() {
  if (!baseEntry.value || !cmpEntry.value) return;
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const lines: string[] = [];
  lines.push(`## 体检对比：${archiveLabel(baseEntry.value)} → ${archiveLabel(cmpEntry.value)}`);
  const b = baseScore.value, c = cmpScore.value;
  if (b != null && c != null) lines.push(`- 综合得分：${b} → ${c}${scoreDelta.value ? `（${scoreDelta.value}）` : ''}`);
  if (!diffItems.value.length) {
    lines.push('- 两次报告内容完全一致，期间集群状态无变化');
  } else {
    lines.push(`- 变化 ${diffItems.value.length} 项：`, '');
    lines.push('| 键 | 旧值 | 新值 | 变化 |');
    lines.push('| --- | --- | --- | --- |');
    for (const d of diffItems.value) {
      lines.push(`| ${esc(d.k)} | ${esc(d.old === '' ? '（无）' : d.old)} | ${esc(d.new === '' ? '（无）' : d.new)} | ${d.pct || '-'} |`);
    }
  }
  const ok = await copyText(lines.join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? '已复制对比结果（Markdown）' : '复制失败');
}

/* 报告组装抽 buildReportMd（导出与剪贴板复制共用同一口径） */
function buildReportMd(): string {
  if (!data.value) return '';
  const d = data.value;
  const lines: string[] = [];
  lines.push(`# ES 集群体检报告`);
  lines.push('');
  lines.push(`- 生成时间：${generatedAt.value}`);
  lines.push(`- 综合评分：**${d.score} / 100**（${scoreLabel.value}）`);
  lines.push('');
  lines.push(`## 摘要`);
  const s = d.summary || {};
  lines.push(`| 项 | 值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 集群状态 | ${s.status?.toUpperCase()} |`);
  lines.push(`| 未分配分片 | ${s.unassigned} |`);
  lines.push(`| 初始化分片 | ${s.initializing} |`);
  lines.push(`| 重定位分片 | ${s.relocating} |`);
  lines.push(`| Pending Tasks | ${s.pending} |`);
  lines.push(`| 不健康索引 | ${s.unhealthyIndices} |`);
  lines.push(`| 节点数 / 高负载 | ${s.nodes} / ${s.hotNodes} |`);
  lines.push('');
  lines.push(`## 检查项`);
  (d.checks || []).forEach((c: any) => {
    const icon = c.level === 'critical' ? '🔴' : c.level === 'warn' ? '🟡' : '🔵';
    lines.push(`- ${icon} \`${c.name}\`  ${c.message}`);
  });
  if (d.unhealthyIndices?.length) {
    lines.push('');
    lines.push(`## 不健康索引`);
    lines.push(`| index | health | pri | rep | docs | size |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    d.unhealthyIndices.forEach((ix: any) => {
      lines.push(`| \`${ix.index}\` | ${ix.health} | ${ix.pri} | ${ix.rep} | ${ix['docs.count']} | ${ix['store.size']} |`);
    });
  }
  if (d.nodes?.length) {
    lines.push('');
    lines.push(`## 节点负载`);
    lines.push(`| name | heap% | cpu% | load 1m | disk% | ram% |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    d.nodes.forEach((n: any) => {
      lines.push(`| \`${n.name}\` | ${n['heap.percent']} | ${n.cpu} | ${n['load_1m']} | ${n['disk.used_percent']} | ${n['ram.percent']} |`);
    });
  }
  return lines.join('\n');
}

function exportMd() {
  const md = buildReportMd();
  if (!md) return;
  downloadText(`es-health-report-${exportStamp()}.md`, md, 'text/markdown;charset=utf-8');
  store.notify('success', 'Markdown 报告已导出');
}

/* 检查项复制（级别+名称+详情） */
async function copyCheck(c: any) {
  const ok = await copyText(`[${c.level}] ${c.name}: ${c.message}`);
  store.notify(ok ? 'success' : 'error', ok ? '检查项已复制' : '复制失败');
}

/* 1177：检查项行右键。行尾那颗「复制」是左键且只到得了鼠标；warn/critical 常常要
 「只抄详情」「只抄名字」或「按这一级筛一下再抄」，逐条手选太慢。
 一级只留最高频两项，其余收进「更多…」二级（与全站右键同一规矩）；
 只读安全：菜单里只有复制/筛选，没有任何写动作。 */
const checkMenu = ref<{ x: number; y: number; c: any } | null>(null);
function openCheckMenu(e: MouseEvent, c: any) {
  checkMenu.value = { x: e.clientX, y: e.clientY, c };
}
function onCheckMenuKey(e: KeyboardEvent, c: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  checkMenu.value = { ...menuKeyAnchor(e), c };
}
async function copyCheckText(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const checkMenuItems = computed<CcmItem[]>(() => {
  const m = checkMenu.value; if (!m) return [];
  const c = m.c;
  const line = `[${c.level}] ${c.name}: ${c.message}`;
  const levelZh = c.level === 'critical' || c.level === 'error' ? '严重' : c.level === 'warn' ? '警告' : '提示';
  return [
    { key: 'check-copy-line', label: '复制此检查项（级别+名称+详情）', icon: ClipboardCopy, run: () => copyCheckText(line, '检查项已复制') },
    { key: 'check-copy-msg', label: '只复制详情', icon: Copy, run: () => copyCheckText(String(c.message ?? ''), '详情已复制') },
    {
      key: 'check-more', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'check-copy-name', label: '只复制名称', icon: Info, run: () => copyCheckText(String(c.name ?? ''), '名称已复制') },
        { key: 'check-copy-level', label: `复制级别（${levelZh}）`, icon: Braces, run: () => copyCheckText(`${c.level}`, '级别已复制') },
        { key: 'check-copy-json', label: '复制整项 JSON', icon: Braces, run: () => copyCheckText(JSON.stringify(c, null, 2), '检查项 JSON 已复制') },
      ],
    },
  ];
});

/* 主报告复制 Markdown（文件下载之外的剪贴板通道，贴群/工单直达） */
async function copyReportMd() {
  const md = buildReportMd();
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? '报告 Markdown 已复制' : '复制失败');
}
</script>

<style scoped>
/* G2-C7：区块级间距落梯 --sp token（亚阶梯微调、控件内 padding、尺寸值不动） */
.hr-page { display: flex; flex-direction: column; gap: var(--sp-4); }
.hr-hd { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); }
/* W-F：.hr-hd-l/.hr-hd-ic/.hr-hd-tt/.hr-hd-sub 死规则删除（页头已迁 PageHeader 全局件） */
.hr-hd-r { display: flex; gap: var(--sp-2); }


.hr-load { padding: var(--sp-6) var(--sp-4); text-align: center; }
.hr-load-tt { font-size: var(--fs-md); color: var(--tx1); margin-bottom: var(--sp-3); }
.hr-load-bar { max-width: 380px; height: 4px; margin: 0 auto; background: var(--bg2); border-radius: 2px; overflow: hidden; }
.hr-load-fill { height: 100%; width: 30%; background: linear-gradient(90deg, transparent, var(--ac-hi), transparent); animation: lb 1.4s ease-in-out infinite; }
.hr-load-sub { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-3); }
/* 位移动画 margin-left → transform（合成器线程跑，不再逐帧重排）；
 translateX 百分比相对自身宽（30% 轨宽），-100%↔333% 与原 margin-left -30%↔100% 轨道等价 */
@keyframes lb { 0% { transform: translateX(-100%); } 100% { transform: translateX(333%); } }

/* 轨4：dashed 大容器框退役（约定④）——框三件消除，border-top 分节承接
 （.hr-sec 636 同类同语言）；模板类名被 healthDiff.spec.ts:28 字面锁，只动 CSS 不动模板 */
.hr-diff { margin-bottom: var(--sp-3); border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.hr-diff summary { cursor: pointer; font-size: var(--fs-sm); color: var(--tx1); padding: var(--sp-1h) var(--sp-2h); }
/* 240px 定高 → max(240px, 42vh) 视口弹性档（ lc-result 同款口径——
 240px 保底略升，矮屏可用性优先；w527 行级锁只锁 .hr-hero 两档，此处安全） */
.hr-diff-body { padding: var(--sp-1) var(--sp-2h) var(--sp-2); max-height: max(240px, 42vh); overflow: auto; }
.hr-diff-row { display: flex; align-items: baseline; gap: var(--sp-2); font-size: var(--fs-xs); padding: var(--sp-0) 0; border-bottom: 1px dashed var(--line); }
.hr-diff-old, .hr-diff-new { min-width: 0; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-diff-k { color: var(--tx2); min-width: 0; overflow-wrap: anywhere; flex: 1; }
.hr-diff-old { color: var(--err); text-decoration: line-through; opacity: .8; }
.hr-diff-new { color: var(--ac-hi); }
.hr-diff-arrow { color: var(--tx2); }
/* .hr-diff-pct 私造皮（2xs 手滚胶囊+up 绿/down 红手配色）随改用 StatusPill 退役——
 升降档归 .pill g/r 单源、尺寸走全局 .pill.xs；类名保留作锚（pillSweep554 看守不再长回皮） */
/* 对比对选择器(基准→对照紧凑下拉)与完全一致正向反馈 */
.hr-diff-pick { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-0) var(--sp-2h) var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }
.hr-diff-pick label { display: inline-flex; align-items: center; gap: var(--sp-1); }
.hr-sel { font-size: var(--fs-xs); color: var(--tx1); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); padding: var(--sp-0) var(--sp-1h); max-width: 260px; }
.hr-sel:focus-visible { outline: 2px solid var(--ac); outline-offset: 1px; }
/* 基准/对照弹层选择器（usePopupList）：输入复用 .hr-sel 皮，弹层 Teleport 到 body（fixed 定位随 place()） */
.hr-pick { position: relative; }
/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号
 .hr-pop.inplace scoped 拷贝随之退役——inplace 基座（absolute/top:100%/left:0/min-width:100%）
 合并 theme.css .float-pop.inplace；模板 class 已是 float-pop xx-pop 链，inplace 行为不变 */
.hr-pop { overflow: hidden; font-size: var(--fs-xs); }
.hr-pop-list { max-height: 220px; overflow: auto; padding: 3px 0; }
.hr-pop-item { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2h); cursor: pointer; }
.hr-pop-item.act, .hr-pop-item:hover { background: var(--hover); }
/* .hr-pop-mark 改用 StatusPill 后只留布局锚（弹层行内推右 + 不压缩）——描边/字号/
 色档归 .pill b/n 单源（本弹层当前选中原 .on 强调→b、另一角色弱化→n） */
.hr-pop-mark { margin-left: auto; flex: none; }
/* (b)：弹层空态合并 EmptyState compact（.hr-pop-hint 裸 div 与本地规则退役，
 文案逐字保留走 :text 绑定）——窄弹层留白按原 hint 档收紧（compact 默认 16px 12px
 在弹层内喧宾夺主），图标/文案排布归 EmptyState 统一留白体系 */
.hr-pop :deep(.empty-state) { padding: var(--sp-2h) var(--sp-3); }
.hr-diff-same { padding: var(--sp-1) var(--sp-2h) var(--sp-2h); font-size: var(--fs-xs); color: var(--ok); }
/* hr-hero 大横幅框退役（551 裁决推翻 545「hero 豁免」：hero 是 chrome
 非语义）——bg/三态渐变底/全框边/radius:10px/fat padding 整块消除，降为 border-bottom
 分节（hr-sec 同语言，内容回行首）；ok/warn/err 三态语义色由 hr-score-n 文本色承接
 （分数即状态），.hr-hero.ok/.warn/.err 的边框/渐变档退役、字色档保留；
 类名保留（healthThreeState 在场锁），hr-hero-r meta-num/两档 grid 锁不受影响 */
.hr-hero { display: flex; gap: var(--sp-4); padding: var(--sp-1) 0 var(--sp-3); border-bottom: 1px solid var(--line); }
.hr-hero-l { display: flex; flex-direction: column; justify-content: center; padding-right: var(--sp-4); border-right: 1px solid var(--line); min-width: 160px; }
.hr-score { font-family: var(--mono); }
/* 44px 大数字 700→650；：字面量归 --fs-num-xl 展示数字档 */
.hr-score-n { font-size: var(--fs-num-xl); font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; }
.hr-hero.ok .hr-score-n { color: var(--ok); }
.hr-hero.warn .hr-score-n { color: var(--warn); }
.hr-hero.err .hr-score-n { color: var(--err); }
.hr-score-max { font-size: var(--fs-lg); color: var(--tx2); margin-left: var(--sp-1); }
.hr-score-tt { font-size: var(--fs-sm); color: var(--tx1); margin-top: var(--sp-2); }
.hr-hero-r { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-1) var(--sp-4); }
/* 大屏 1600 档四列——hero 摘要 KPI 在 2K 宽下收成四列，减少行间大留白 */
@media (min-width: 1600px) {
  .hr-hero-r { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
.hr-hero-row { display: flex; justify-content: space-between; font-size: var(--fs-sm); padding: var(--sp-1) 0; }
.hr-hero-row span { color: var(--tx2); }
.hr-hero-row b { font-family: var(--mono); }
.hr-hero-row.dim b { color: var(--tx2); font-weight: normal; }
.ok { color: var(--ok); }
.warn { color: var(--warn); }
.err { color: var(--err); }

/* 轨4：hr-sec 中性大容器框（bg+border+radius）退役 → io-preview 540 同款
 border-top 分节（hr-page flex gap 承担节间距）；hr-sec-hd card-t 行首档保（降层不消义）。
 hr-hero 大横幅框随裁决退役并入分节流（上文注），其 border-bottom 即
 hero 与首节分界——紧邻首节不再重复出线。原 545「hero 语义边框豁免」就此推翻 */
.hr-sec { border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.hr-hero + .hr-sec { border-top: 0; padding-top: 0; }
.hr-alloc-line { font-size: var(--fs-sm); margin-bottom: var(--sp-2); }
/* 键名裸 b 收口 .dg-k（DiagView dg-alloc-row 同款类名/同款形对齐） */
.dg-k { color: var(--tx0); font-weight: 600; margin-right: var(--sp-1); }
.hr-alloc-details summary { font-size: var(--fs-xs); color: var(--tx2); cursor: pointer; }
/* W-F：分节头挂全局 .card-t（650 卡头档），本地 600 自造声明退役（口径 B 归位） */
.hr-sec-hd { margin-bottom: var(--sp-2); }
/* .hr-sec-cnt 私造皮（fs-xs+bg2 底胶囊）随改用 StatusPill n 档退役——形态与
 .pill 默认档同形（fs-xs/bg2 底），色板归单源；类名保留作锚 */

/* W-F：节点表水位行色档（hotCls 语义行级回收）。tr 由 QRT 内核渲染，
 deep 穿透（类名消费在本视图 scoped，阈值逻辑在上方 ndRowClass 单一出处） */
.hr-body :deep(.hr-row-hot td) { background: var(--err-soft); color: var(--err); }
.hr-body :deep(.hr-row-warm td) { background: var(--warn-soft); color: var(--warn); }

.hr-checks { display: flex; flex-direction: column; gap: var(--sp-1); }
/* info 级不再整行 bg2 填充（线框纪律：仅 warn/critical 着色），基础行透明 */
/* 检查项行 4 列：模板 4 子项（图标/名称/详情/复制按钮），3 列模板下第 4 项自动放置
 掉进「第 2 行第 1 栏」=24px 图标轨道（≤900 档同形态缺陷已按量尺修正，宽档同病）——
 尾部 auto 轨道把按钮收进同一行行尾；对齐走规则（grid 语境下 flex 内联口吻失效） */
.hr-check { display: grid; grid-template-columns: 24px minmax(120px, 160px) minmax(0, 1fr) auto; gap: var(--sp-3); padding: var(--sp-2) var(--sp-3); font-size: var(--fs-sm); border-radius: var(--r-xs); }
.hr-check > .btn { align-self: center; justify-self: end; }
.hr-check.lv-critical { background: var(--err-soft); color: var(--err); }
.hr-check.lv-warn { background: var(--warn-soft); color: var(--warn); }
.hr-check.lv-info { color: var(--tx2); }
.hr-lv { text-align: center; }
.hr-name { font-family: var(--mono); font-size: var(--fs-xs); }
.hr-msg { color: var(--tx1); }
.hr-check.lv-critical .hr-msg, .hr-check.lv-warn .hr-msg { color: inherit; }

/* W5：双表表皮（.hr-tbl/.hr-tbl-wrap/.hr-flt/.hr-agg-* 全家）随换 QRT 壳退役——
 排序态/过滤框/聚合 footer 行/色档归 QRT 内建（max-height 420px 由 props 传内核） */

.hr-alloc-zh { color: var(--tx2); }
.hr-code { background: var(--bg2); padding: var(--sp-3); border-radius: var(--r-s); font-family: var(--mono); font-size: var(--fs-xs); max-height: max(240px, 42vh); overflow-y: auto; white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }

/* hd-g/y/r 私造圆点三档随 MetaStrip dot 形态单源退役
 （DiagView dgMeta 先例；色值经 healthColor 直传组件 dot 位，8px 圆点归 .ms-dot 单源） */

/* W-F：补 1100 堆叠档（此前仅 900 倒挂）。双档范式（Overview/Diag 同口径）：
 1100=布局堆叠——hero 得分列与摘要列纵向铺开、摘要 3 列收 2 列，消除中段宽度互相挤压；
 900 保留紧凑微调语义（hero-r 单列 + 检查行塌两栏）不动。 */
@media (max-width: 1100px) {
  .hr-hero { flex-direction: column; gap: var(--sp-3); }
  .hr-hero-l { border-right: 0; border-bottom: 1px solid var(--line); padding-right: 0; padding-bottom: var(--sp-3); min-width: 0; }
  .hr-hero-r { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* 窄容器塌两栏（24px 图标列保留）。G2-C1 断点归一 标准值 900（紧凑微调语义）：
 900-1000 带恢复三栏（24px+minmax(120,160)+1fr 实测排得下），900 以下塌两栏表现同原意图。
 .hr-msg 必须显式落到第 2 栏：3 个子项进 2 栏栅格会被自动放置排到「第2行第1栏」，
 即 24px 图标轨道里，实测宽 24px / scroll 48px 直接溢出（量尺抓到）。 */
@media (max-width: 900px) {
  /* 窄容器：hero 摘要三列放不下，塌单列（6 行 KPI 纵向铺开） */
  .hr-hero-r { grid-template-columns: 1fr; }
  .hr-check { grid-template-columns: 24px minmax(0, 1fr); }
  .hr-msg { grid-column: 2; }
  /* 的复制按钮是 .hr-check 第 4 个 grid 子项：塌两栏后自动放置会把它
 排进「第 2 行第 1 栏」（24px 图标轨道）直接溢出（量尺抓到）——显式落第 2 栏右对齐 */
  .hr-check > .btn { grid-column: 2; justify-self: end; }
}
</style>
