<template>
  <div class="bw">
    <!-- ?doc= 深链打开的文档详情（右下悬浮卡，可关闭） -->
    <div v-if="linkedDoc" class="bw-linked-doc" data-test="linked-doc">
      <div class="bw-ld-hd">
        <span class="mono">文档 {{ linkedDoc.id }}</span>
        <div class="bw-ld-acts">
          <!-- G253（铁律 F 轻形态）：GET _doc 完整响应可达——_index/_id/_version/
 _found 元数据与 _source 业务字段分轨切换（768 G240/Mapping 「原始 JSON」同构，
 不引完整 RawIoModal 三件套：本卡数据源单一 _doc GET 无多端点切换诉求） -->
          <button class="btn ghost xs" :aria-pressed="rawView ? 'true' : 'false'" aria-label="查看原始响应"
            title="查看 GET /_doc 完整响应（含 _index/_id/_version/_found 元数据）" @click="rawView = !rawView">
            <FileJson :size="11" />
          </button>
          <button class="btn ghost xs" aria-label="关闭文档详情" @click="linkedDoc = null">✕</button>
        </div>
      </div>
      <!-- highlightJson 范式（jsonc.ts 输出专用 v-html）：文档 JSON 语法着色，裸 stringify 文本退役 -->
      <pre class="json-view bw-ld-body" v-html="linkedDocHtml"></pre>
    </div>
    <!-- 工具条（HitNav 定位条/排序下拉/方向钮随表换 QRT 壳退役——
 搜索定位归 QRT Ctrl+F 网格查找（命中计数 n/n + Enter 导航 + 当前命中高亮），
 排序归 QRT 列头点击（es_tbl_sort:browser:indices 记忆）；bw 搜索框只承担
 行过滤 + MarkText 命中源，900 档 .bw-search 独占行形态（528 W-E）不变 -->
    <!-- 只读身份前置说明（1124）：行内段合并/删除索引与「新建索引」隐藏时给出原因，
         避免只读身份看到「工具栏少一半」却无处可查（RestView/Aliases 同一语言） -->
    <div v-if="auth.probed && !canOps && !canForceMerge && !canCreateIdx" class="bw-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份只读：浏览与检索可用；段合并、删除索引、新建索引需要对应的连接页面写权限。
    </div>
    <div class="bw-bar">
      <!-- bw-search 改用 SearchFilterBar 统一件（全站第 16 胞）——547「异形豁免册」
 条目由合并约定推翻：胶囊壳三件套与 Search 内建图标归组件单源（bw-search-ic 绝对
 定位图标与 inline padding-left:30px 违规同步更新退役），Esc 清空由组件内建承接（行为等价，
 filterEscClear379 锚同步更新）；落位类 bw-search 透传组件根（min(240px,100%) 钳制与 900 档
 独占行同步更新，searchLocate「.bw-search input」后代选择器路径零迁） -->
      <SearchFilterBar v-model="kw" class="bw-search" placeholder="搜索索引名…" />
      <div class="seg">
        <button v-for="h in healthTabs" :key="h.k" :class="{ on: healthF === h.k }" :aria-pressed="healthF === h.k" @click="healthF = h.k">
          <!-- 健康 tab 色点改用 MetaStrip dot 形态单源（DiagView dgMeta 先例）——
 .bw-hdot 私造圆点退役，8px 圆点形态归组件 .ms-dot 单源；inline 化挂 .bw-tab-ms
 （块级 .ms 在非 flex 按钮内会折行，落位随段语义归本类） -->
          <MetaStrip v-if="h.dot" class="bw-tab-ms" :items="[{ dot: h.dot }]" />{{ h.t }}
        </button>
      </div>
      <button class="btn sm" :disabled="store.loadingIndices" @click="reload">
        <RefreshCw :size="12" :class="{ spinning: store.loadingIndices }" /> 刷新
      </button>
      <!-- w72:跨页闭环 — 浏览中直接跳索引工作区；钮恒在场（无选中 disabled 不消失，
 选中态切换不挪动后续钮位=位置恒定） -->
      <button :disabled="!store.pickedIdx" class="btn ghost sm" @click="goHub(store.pickedIdx)"
        title="在索引工作区打开当前选中索引（一站式文档/查询/配置）">
        <LayoutGrid :size="12" /> 工作区:{{ store.pickedIdx.slice(0, 20) }}
      </button>
      <!-- 新建索引一等入口（名称校验 + 分片/副本 + 别名 + 高级 JSON） -->
      <button v-if="canCreateIdx" class="btn sm pri" @click="createOpen = true">
        <Plus :size="12" /> 新建索引
      </button>
      <!-- 导出双通道合并「导出 ▾」聚合菜单（查询结果表导出聚合同语言）：
 CSV 下载与 Markdown 复制是同一对象（索引清单）的同类导出枚举，平铺双钮退役收进
 菜单（常驻按钮 5→4）；触发钮落在原 CSV 位（位置恒定），空行集恒在场 disabled
 非消失；内核级空集（列漏斗筛空）报真 warning 保留在 exportCsv/exportMd 本体。
 行集/列集走 QRT ref.getCsvBlock()（列漏斗+排序所见即所得），列序/表头经 EXPORT
 映射保旧契约（英文键七列、不含操作列） -->
      <span class="menu-wrap">
        <button class="btn ghost sm" :class="{ on: bwExpOpen }" :disabled="!filtered.length"
          aria-label="导出" aria-haspopup="menu" :aria-expanded="bwExpOpen"
          title="导出索引列表（CSV 下载 / Markdown 复制）" @click.stop="bwExpOpen = !bwExpOpen">
          <FileDown :size="12" /> 导出 ▾
        </button>
        <div v-if="bwExpOpen" class="bw-menu" role="menu" aria-label="导出索引列表">
          <button class="bw-mi" role="menuitem" aria-label="导出索引列表 CSV"
            title="导出索引列表 CSV（跟随过滤）" @click="exportCsv(); closeBwExp()">
            <span class="bw-mi-f">CSV</span> 索引列表下载
          </button>
          <button class="bw-mi" role="menuitem" aria-label="复制索引列表 Markdown"
            title="复制索引列表为 Markdown（群聊/工单直贴）" @click="exportMd(); closeBwExp()">
            <span class="bw-mi-f">MD</span> 索引列表 Markdown
          </button>
        </div>
      </span>
    </div>

    <!-- 表格（裸表换 QRT rows 型——524 教训先列锚清单再动手）：
 排序（列头点击+Shift 多键）/health·状态等值漏斗/列选/列宽/右键单元格菜单/
 键盘行导航/Ctrl+F 查找/聚合行/语义渲染/导出 CSV·MD·XLSX·PNG 全归内核
 （browser:indices 维度记忆）；行选中之 .bw-picked 走 rowClass 契约；
 528 W-E 两项新形态不得回退：状态列 indexStatusZh 中文主显+英文小字（起
 StatusPill en 档组件化，.sp-en 由统一件承担）走 #cell-状态 槽逐字保真；健康点/索引名链接+MarkText/操作列五钮走作用域槽；
 视图 FocusableSurface 包壳退役（QRT 内建 FS pane-id=qrt.table 接管放大） -->
    <!-- 表外 .card 壳（padding:0/overflow:hidden 内联随壳退役）→ .bw-res
 border-top 分节——538 SystemView .sy-res 同语言（QRT 本就全出血，分节由 gap 承担间距） -->
    <div class="bw-res">
      <!-- --vh-offset 的 210px fallback 删除（theme.css :root 已定义 210px，避免两处漂移） -->
      <QueryResultTable
        v-if="filtered.length"
        ref="bwQrt"
        :cols="BW_COLS" :rows="bwMatrix" sortable
        storage-key="browser:indices"
        export-name="browser-docs"
        :field-types="BW_TYPES"
        sem-on :sem-raw-cols="BW_SEM_RAW_COLS"
        :row-class="bwRowClass"
        max-height="calc(100vh - var(--vh-offset) + 38px)"
      >
        <!-- 健康色点改用 MetaStrip dot 形态单源（.bw-hdot.lg 私造圆点退役）——
 胞内仍是纯色点无文字（DOM 逐字保形），title 兜底随段级 tip 承接 -->
        <template #cell-健康="{ value }"><MetaStrip :items="[{ dot: healthColor(value), tip: String(value ?? '') }]" /></template>
        <template #cell-索引="{ value }"><span class="bw-name mono" title="打开索引工作区（文档/查询/配置/分片/运维一站式）" tabindex="0" role="button" @keydown.enter.prevent="goHub(value)" @keydown.space.prevent="goHub(value)" @click="goHub(value)"><MarkText :text="value" :kw="String(kw || '')" /></span></template>
        <template #cell-状态="{ value }"><!-- ：改用 StatusPill（indexStatusZh 中文主显+en 英文小字档组件化，原本地小字类同步更新退役，en 小字形态归组件 .sp-en 单源，qrtRowsSwap529 锚同步改锁） --><StatusPill :tone="value === 'open' ? 'g' : 'n'" :label="indexStatusZh(value) || (value || '')" :en="indexStatusZh(value) ? value : undefined" /></template>
        <template #cell-创建时间="{ value }"><span class="mono dim" :title="value">{{ fmtDate(value) }}</span></template>
        <!-- #cell-存储 槽退役——「槽内 bytes 单源」随内核 semRawCols
 显式非语义类型抑制守卫落地平移为表级 sem-on + 存储:bytes 显式标注消费
 （带单位字节串 '1.2mb' 由内核 bytes 档直出「1.2 MB」，title/导出/复制恒 raw；
 文档数经 BW_SEM_RAW_COLS 抑制按值推断，见该常量注） -->
        <template #cell-操作="{ row }">
          <div class="bw-acts" @click.stop>
            <button aria-label="索引工作区（文档/查询/配置/分片/运维）" class="btn sm" title="索引工作区（文档/查询/配置/分片/运维）" @click="goHub(row[1])"><Boxes :size="11" /></button>
            <n-popover trigger="click" placement="left" :show="rowMore === row[1]" @update:show="(v: boolean) => (rowMore = v ? String(row[1]) : '')">
              <template #trigger>
                <button :aria-label="'更多操作：' + row[1]" aria-haspopup="menu" class="btn sm ghost bw-more-trig"
                  title="更多：DSL 查询 / Mapping / 段合并 / 删除" @click.stop>
                  <Ellipsis :size="11" /><span class="bw-more-lb">更多</span>
                </button>
              </template>
              <div class="bw-more" role="menu" :aria-label="'索引操作：' + row[1]">
                <button class="bw-more-it" role="menuitem" @click="rowMore = ''; openIdx(row[1])"><TerminalSquare :size="12" /> DSL 查询</button>
                <button class="bw-more-it" role="menuitem" @click="rowMore = ''; goMapping(row[1])"><Braces :size="12" /> Mapping</button>
                <button v-if="canForceMerge" class="bw-more-it" role="menuitem" @click="rowMore = ''; askFmRow(row)"><Shrink :size="12" /> ForceMerge 段合并</button>
                <button v-if="canOps" class="bw-more-it danger" role="menuitem" @click="rowMore = ''; askDelRow(row)"><Trash2 :size="12" /> 删除索引</button>
              </div>
            </n-popover>
          </div>
        </template>
        <!-- 「复制行信息」随行右键菜单退役改走 QRT 行尾注入位（hover 与行复制钮同排）：
 单行事实串模板逐字保真（browserExportMd 源码锁） -->
        <template #row-actions="{ row }">
          <button class="btn ghost xs" aria-label="复制行信息" title="复制行信息" @click.stop="copyRowInfo(row)"><ClipboardCopy :size="11" /></button>
        </template>
      </QueryResultTable>
      <!-- 加载/过滤无结果/集群无索引 三态分开，不留空白不误导。
 加载态裸 .empty（theme.css 全局 .empty 的最后非表格消费）退役——
 SkeletonBox 骨架收口（SystemView:65 先例），语义 label 逐字保留；DocDiffModal
 表格 td.empty 属表格语义豁免不动 -->
      <div v-if="store.loadingIndices && !store.indices.length" aria-label="正在拉取索引列表">
        <SkeletonBox height="30px" round style="margin-bottom:var(--sp-3)" />
        <SkeletonBox v-for="i in 5" :key="i" height="20px" round style="margin-bottom:var(--sp-2)" />
      </div>
      <EmptyState v-else-if="!filtered.length && store.indices.length" compact :icon="Search" text="无匹配索引"
        :hint="`共 ${store.indices.length} 个，被当前搜索/健康过滤条件隐藏`" action-text="清除过滤" @action="kw = ''; healthF = 'all'" />
      <EmptyState v-else-if="!filtered.length && !store.loadingIndices" compact :icon="Boxes" text="未获取到索引"
        hint="集群无索引或拉取失败，点击右上角「刷新」重试" />
    </div>

    <!-- 计数行（分页随换壳退役——大索引列表由 QRT renderMore 增量渲染接管
 （MAX_RENDER=2000 首批 + 「继续渲染」行），排序/漏斗作用于全量所见集；
 「已筛选 N 列」暗状态提示与一键全清由 QRT 工具行内建（.qrt-filtered）接管） -->
    <!-- G254b：计数行 role=status——索引列表/过滤后行数变化=异步结果到达语义公告
 （G224/G229/G235 族） -->
    <div class="bw-foot mono" role="status">
      <span>{{ filtered.length }} / {{ store.indices.length }} 个索引</span>
    </div>

    <!-- 新建索引（创建成功直达索引工作区详情）；无创建权限彻底卸载组件 -->
    <CreateIndexModal v-if="canCreateIdx" v-model:show="createOpen" @created="goHub" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { NPopover } from 'naive-ui'; /* 1148：行内「更多操作」弹层 */
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue'; /* ：加载态骨架收口 */
import MarkText from '../components/MarkText.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：状态徽标统一件 */
import { Search, LayoutGrid, RefreshCw, TerminalSquare, Braces, Shrink, Trash2, Boxes, Plus, FileDown, ClipboardCopy, FileJson, ShieldAlert, Ellipsis } from 'lucide-vue-next';
import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* ：权限写门真源 */
import { useUrlState } from '../composables/urlState';
import type { IndexCat } from '../types';
import { exportStamp, fmtNum, healthColor, fmtDate, downloadText, copyText, csvText } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
/* 本地 ConfirmModal 宿主退役，改全局确认服务 */
import { askConfirm } from '../composables/confirm';
import CreateIndexModal from '../components/CreateIndexModal.vue';
/* 索引裸表换 QRT rows 型——排序（含方向翻转+记忆）/列漏斗/列选/列宽/
 右键单元格菜单/Ctrl+F 搜索定位/分页增量渲染/导出五格式归内核；宿主胶水
 （useColFilters+ColFilterPopover+useHitLocate+HitNav+Pagination+CellContextMenu+
 ColPicker+FocusableSurface 包壳）随壳退役（PluginsView 525 W5 同判据） */
import QueryResultTable from '../components/QueryResultTable.vue';
import MetaStrip from '../components/MetaStrip.vue'; /* ：健康色点 dot 形态单源（bw-hdot 四胞之一） */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：bw-search 过滤胶囊统一件（第 16 胞） */
import { indexStatusZh } from '../utils/esEnumZh'; /* ：open/close 状态中文名（跨工蚁契约导出） */
import { friendlyEsError } from '../utils/esError'; /* ：删除失败裸错误串收敛 */

const router = useRouter();
const store = useAppStore();
/* 权限写门——新建索引/ForceMerge/删除索引=ops 档高危写，VIEWER 不可见 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-index', store.target));
/* 行内 ForceMerge 走结构化 /cluster/force-merge，门禁随 optimizer 页写键（canOps 只管删索引钮） */
/* ForceMerge 走 /cluster/raw，非 ADMIN 会被 raw 系统守卫 403：入口与执行体同档 */
/* ForceMerge 走结构化 /cluster/force-merge（归属 optimizer 页）：按真实端点页写键门，
   不再用角色档 ADMIN 把有 optimizer 页写权的静态/连接用户误挡在门外。 */
const canForceMerge = computed(() => auth.canEndpoint('ops', 'POST',
  '/internal/es/index/cluster/force-merge', store.target));
/* （兵蚁 MUST-FIX）：新建索引实调 POST /cluster/create-index（归 config-validator 页），与删索引(indices) 分属两页——canCreateIdx 独立裁决 */
const canCreateIdx = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));

/* 搜索词/健康过滤进 URL，刷新与分享后现场可复原 */
const kw = useUrlState('kw');
/* 导出聚合菜单（导出 ▾）状态——Esc/点外关闭；开层挂 document 监听、卸载摘卸对称 */
const bwExpOpen = ref(false);
/* 1148：行内「更多」弹层当前打开的索引名（空=全关；同一时刻只开一行） */
const rowMore = ref('');
function closeBwExp() { bwExpOpen.value = false; }
function onDocBwClick(e: Event) {
  if (!(e.target as HTMLElement | null)?.closest('.menu-wrap')) closeBwExp();
}
/* Esc 收起浮层：深链文档卡与导出菜单同一收起通道（卡为深链打开、无页面内触发器，收卡即完整语义） */
function onDocBwEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    linkedDoc.value = null;
    closeBwExp();
  }
}
document.addEventListener('click', onDocBwClick);
document.addEventListener('keydown', onDocBwEsc);
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocBwClick);
  document.removeEventListener('keydown', onDocBwEsc);
});
/* ?idx=&doc= 深链——QRT「在数据浏览器打开此文档」的落点；
 doc 消费即清（newdoc 同模式防刷新重灌），索引经 useIdxState 语义落到 store.pickedIdx */
const docLink = useUrlState('doc');
/* ?idx= 落 pickedIdx（useIdxState 写侧语义；只消费不 follow——浏览器的选中是用户自己的） */
const idxLink = useUrlState('idx');
if (idxLink.value && idxLink.value !== store.pickedIdx) store.pick(idxLink.value);
const healthF = useUrlState('health', 'all') as Ref<'all' | 'green' | 'yellow' | 'red'>;
/* browser.sortBy/sortReversed 偏好退役——排序归 QRT 列头点击，
 方向/键记忆走 es_tbl_sort:browser:indices（内核 readSortLs/persistSort 同一口径） */

const healthTabs = [
  { k: 'all', t: '全部', dot: '' },
  { k: 'green', t: 'green', dot: 'var(--ok)' },
  { k: 'yellow', t: 'yellow', dot: 'var(--warn)' },
  { k: 'red', t: 'red', dot: 'var(--err)' },
] as const;

/* ═══ ：QRT rows 型数据映射 ═══
 列=中文键（与旧表头逐字同源，漏斗 aria「筛选 健康 列」保真）；矩阵值标量化：
 文档数落 number（fieldTypes long → 内建数值右对齐/千分位/区间筛选）、存储/分片保
 旧展示串、创建时间保原始串（#cell-创建时间 槽 fmtDate 展示，旧口径不变）；
 操作列矩阵值占位空串（展示/导出经槽与 EXPORT 映射处理）。 */
const BW_COLS = ['健康', '索引', '状态', '文档数', '存储', '分片', '创建时间', '操作'];
/* semOn 语义渲染扩展按列收口——存储列显式 bytes 档（值域单源 useSemFormat），
 文档数列恒 long（数值/千分位/区间口径），绝不配 bytes/percent——qrtRowsSwap529 千分位锁
 与「文档数≠字节数」语义双看守。起表级 sem-on 开启（「刻意不开」的两处
 理由由 semRawCols 守卫解除，见模板 #cell-存储 退役注） */
const BW_TYPES: Record<string, string> = { 文档数: 'long', 存储: 'bytes' };
/* semRawCols 显式非语义类型抑制守卫——文档数（计数列，≥1000 裸数字会被
 useSemFormat 按值推断判 ms 显「12.3s」）显式抑制「按值推断」链，显示走既有数值链
 （千分位/右对齐/区间筛选/导出全不受影响）；存储列 bytes 为显式语义标注，不受抑制影响 */
const BW_SEM_RAW_COLS = ['文档数'];
const bwMatrix = computed<any[][]>(() => filtered.value.map(i => [
  i.health ?? null, i.index, i.status ?? null, Number(i['docs.count'] || 0),
  i['store.size'] || '-', (i.pri || 0) + '/' + (i.rep || 0), i['creation.date.string'] || '', '',
]));
/* 行选中高亮（y3 .bw-picked 契约）走 QRT rowClass 契约（ W-D 内核） */
function bwRowClass(row: any[]): string | undefined {
  return row[1] === store.pickedIdx ? 'bw-picked' : undefined;
}
/* 矩阵行 → IndexCat 还原（操作钮/复制行信息/确认弹窗 facts 复用旧函数体）。
 矩阵数值化仅文档数（排序/右对齐需要），还原回旧接口的字符串形态 */
function rowToIdx(row: any[]): IndexCat {
  const [pri, rep] = String(row[5] || '0/0').split('/');
  return {
    index: row[1], health: row[0], status: row[2], 'docs.count': String(row[3] ?? ''),
    'store.size': row[4], pri, rep,
    'creation.date.string': row[6],
  };
}
const bwQrt = ref<InstanceType<typeof QueryResultTable> | null>(null);

/* y3：分页随换壳退役——大索引列表由 QRT renderMore 增量渲染接管（排序/漏斗作用全量）； */
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  /* 深链消费——pickedIdx 已由 useIdxState 落定，doc 非空即打开文档查看。
 消费即清防刷新重灌；文档内容经既有 _source 展示通道（读原文档塞进详情区）。
 1125：深链读取同样要过身份门——宿主换 token 的窗口里 probed 未落地，
 旧 target 的文档会先拉回来（只读也会 403 噪声，结果还可能串到新账号界面）。 */
  const docId = (docLink.value || '').trim();
  if (docId && store.pickedIdx) {
    docLink.value = '';
    idxLink.value = '';
    if (linkDocAllowed()) void openLinkedDoc(store.pickedIdx, docId);
    else pendingLinkDocId.value = docId;
  }
});
/* 与 DslQuery autoRunAllowed 同口径：未鉴权/探测未启动视同身份已定；否则必须身份落地且本页可读 */
const linkDocAllowed = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('indices', store.target));
const pendingLinkDocId = ref('');
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  const id = pendingLinkDocId.value;
  if (!id || !store.pickedIdx || !linkDocAllowed()) return;
  pendingLinkDocId.value = '';
  void openLinkedDoc(store.pickedIdx, id);
});
/* 深链打开文档：拉原文档 → 弹详情（highlightJson 范式着色展示；json-view 全局类管排版，
 v-html 仅消费 utils/jsonc 的 highlightJson 输出——转义安全）。
 G253：完整响应留存 raw 字段（元数据与 _source 分轨）+rawView 切换
 （重开卡复位 _source 精简视图） */
const linkedDoc = ref<{ id: string; src: any; raw: any } | null>(null);
const rawView = ref(false);
const linkedDocHtml = computed(() =>
  linkedDoc.value ? highlightJson(JSON.stringify(rawView.value ? linkedDoc.value.raw : linkedDoc.value.src, null, 2)) : '');
async function openLinkedDoc(idx: string, id: string) {
  try {
    /* GET /cluster/doc 是 VIEWER 可读通道（raw 是 ADMIN 域——深链看文档不该被角色拦死） */
    const r: any = await api.getDoc(idx, id);
    linkedDoc.value = { id, src: r?._source ?? r ?? null, raw: r ?? null };
    rawView.value = false;
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（错误语义合并单源） */
    store.notify('error', '打开文档失败：' + friendlyEsError(String(e?.message ?? e)));
  }
}
function reload() { store.loadIndices(); }

/* 新建索引弹窗 */
const createOpen = ref(false);

/* 天罗W6：过滤管线——filteredBase=kw+健康 tab（漏斗/排序在 QRT 内核对此行集叠加，
 与旧「漏斗候选行集=filteredBase」口径一致）；宿主 useColFilters 胶水退役 */
const filteredBase = computed(() => {
  let list = store.indices.slice();
  const k = kw.value.trim().toLowerCase();
  if (k) list = list.filter(i => i.index.toLowerCase().includes(k));
  if (healthF.value !== 'all') list = list.filter(i => i.health === healthF.value);
  return list;
});
const filtered = computed(() => filteredBase.value);

/* →：点索引名→索引工作区（文档/查询/配置/分片/运维操作一站式） */
/* 索引列表 CSV 导出（运维对账/容量盘点）——行集/列集改走
 QRT ref.getCsvBlock()（列漏斗+排序+列选所见即所得），列序/表头经 EXPORT 映射保旧契约
 （英文键七列、不含操作列；存储 '-' 兜底与旧 CSV 的空串兜底差异：空值列出 '-'） */
const EXPORT_HEAD = ['index', 'health', 'status', 'docs.count', 'store.size', 'shards', 'creation.date'];
const EXPORT_SRC = ['索引', '健康', '状态', '文档数', '存储', '分片', '创建时间'];
function exportCsv() {
  const blk = bwQrt.value?.getCsvBlock();
  /* 空行集（内核列漏斗叠加筛空）报真不静默——同动线在查询页已有同款话术 */
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const idxs = EXPORT_SRC.map(c => blk.head.indexOf(c));
  downloadText(
    `browser-indices-${exportStamp()}.csv`,
    /* CSV 组装合并 utils csvText（BOM+表头+行矩阵单一出处） */
    csvText(EXPORT_HEAD, blk.rows.map(r => idxs.map(i => r[i]))),
    'text/csv;charset=utf-8',
  );
  store.notify('success', `已导出 ${blk.rows.length} 条索引记录`);
}

/* 索引清单 Markdown 复制（与 CSV 同数据、群聊/工单直贴——对齐 节点表双通道）
 行集改走 getCsvBlock()；表头/列序（六列、无创建时间）逐字保真 */
async function exportMd() {
  const blk = bwQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const MD_SRC = ['索引', '健康', '状态', '文档数', '存储', '分片'];
  const idxs = MD_SRC.map(c => blk.head.indexOf(c));
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    '| 索引 | 健康 | 状态 | 文档数 | 存储 | 分片 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...blk.rows.map(r => '| ' + idxs.map(i => esc(r[i])).join(' | ') + ' |'),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${blk.rows.length} 条索引记录（Markdown）` : '复制失败');
}

/* 复制行信息（单行事实串，回应「这个索引多大/什么时候建的」类问答）——
 入口随行右键菜单退役改走 QRT #row-actions 行尾注入位，事实串模板逐字保真 */
async function copyRowInfo(row: any[]) {
  const i = rowToIdx(row);
  const line = `${i.index}: health=${i.health} status=${i.status} docs=${i['docs.count'] || 0} store=${i['store.size'] || '-'} shards=${i.pri || 0}/${i.rep || 0} created=${i['creation.date.string'] || '-'}`;
  const ok = await copyText(line);
  store.notify(ok ? 'success' : 'error', ok ? '已复制行信息' : '复制失败');
}

function openIdx(name: string) {
  store.pick(name);
  router.push('/search');
}

function goHub(name: string) {
  /* y3 修复:深链 ?idx= 被剥成裸 #/indices——此前先 pick(name) 再 push,IndexHub 首次挂载时
 useIdxState→useUrlState('idx', pickedIdx) 的 defVal=name 与 query 值相同,其
 onActivated writeBack 走「默认值不占 URL」分支 usp.delete('idx'),hash 丢 idx。
 改为:push 前先把 pickedIdx 清空(挂载时 defVal=''≠query 值,writeBack 走 set 分支保留深链),
 本处不再 pick,顶栏由 IndexHub 的 useIdxState 深链上行 pick(state.value) 恢复( 官方通道)。 */
  if (store.pickedIdx) store.pick('');
  router.push({ path: '/indices', query: { idx: name } });
}
function goMapping(name: string) {
  store.pick(name);
  router.push('/mapping');
}

/* ForceMerge——：本地 ConfirmModal（warn/okText 等价迁移），确认通过后原 doFm 执行体原样内联。
 操作列槽行内钮经 askFmRow 适配（矩阵行 → IndexCat）后复用原函数体 */
async function askFm(idx: IndexCat) {
  /* 行内 ForceMerge 走结构化 /cluster/force-merge——执行体首行收口，键盘/程序旁路同受门 */
  if (!canForceMerge.value) { store.notify('warning', 'ForceMerge 需 optimizer 页写权限'); return; }
  const okGo = await askConfirm({
    title: 'ForceMerge 段合并',
    level: 'warn',
    okText: '开始合并',
    message: `将对 ${idx.index} 执行 _forcemerge?max_num_segments=1。这是重 IO 操作，大索引可能持续数分钟，建议在低峰期执行。`,
  });
  if (!okGo) return;
  try {
    /* ES 7.10 _forcemerge 不支持 wait_for_completion，接口本身同步返回；
       响应若含 taskId（未来版本/兼容端）仍指路任务页，否则按同步完成提示。 */
    const r: any = await api.clusterForceMerge(idx.index, 1);
    if (r?.taskId) {
      store.notify('success', `已提交后台执行：${idx.index} ForceMerge（taskId=${r.taskId}，去任务页看进度）`);
    } else {
      store.notify('success', `已触发 ${idx.index} 的 ForceMerge`);
    }
  } catch (e: any) {
    store.notify('error', 'ForceMerge 失败: ' + friendlyEsError(String(e?.message ?? e)));
  }
}
function askFmRow(row: any[]) { return askFm(rowToIdx(row)); }

/* 删除——：本地 ConfirmModal（critical + guardText=索引名 + okText 等价迁移；
 正文里的索引名/文档数/store.size 改走 facts 具名行） */
async function askDel(idx: IndexCat) {
  if (!canOps.value) { store.notify('warning', '删除需专项或 ADMIN 角色'); return; }
  const okGo = await askConfirm({
    title: '删除索引',
    level: 'critical',
    guardText: idx.index,
    okText: '永久删除',
    message: '将永久删除该索引，数据不可恢复，请输入索引名确认。',
    facts: [
      { label: '索引', value: idx.index },
      { label: '文档数', value: fmtNum(idx['docs.count']) },
      { label: '存储', value: idx['store.size'] || '-' },
    ],
  });
  if (!okGo) return;
  try {
    await api.deleteIndex(idx.index);
    store.notify('success', `索引 ${idx.index} 已删除`);
    if (store.pickedIdx === idx.index) store.pick('');
    store.loadIndices();
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（索引删除高危路径，w80 先例全站兜底） */
    store.notify('error', '删除失败: ' + friendlyEsError(String(e?.message ?? e)));
  }
}
function askDelRow(row: any[]) { return askDel(rowToIdx(row)); }
</script>

<style scoped>
.bw { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
/* 窄屏工具条允许换行，避免挤压 */
.bw-bar { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; row-gap: var(--sp-1); }
/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.bw-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-2); }
/* 导出聚合菜单（导出 ▾）——浮层四要素（白底 bg1/边框/阴影 --shadow-pop/圆角 r-m），
 查询结果表 qrt-menu 同配方；menu-wrap 定位壳承接 absolute 展开 */
.menu-wrap { position: relative; flex: none; }
.bw-menu { position: absolute; top: calc(100% + var(--sp-1)); right: 0; z-index: 60; background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m); box-shadow: var(--shadow-pop); padding: var(--sp-1h); min-width: 200px; }
.bw-mi { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: var(--sp-1h) var(--sp-2h); border: 0; background: transparent; border-radius: var(--r-s); color: var(--tx1); font-size: var(--fs-xs); cursor: pointer; text-align: left; white-space: nowrap; }
.bw-mi:hover { background: var(--bg2); color: var(--tx0); }
.bw-mi-f { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--ac-hi); width: var(--sp-5); flex-shrink: 0; }
/* width:240px → min(240px,100%) 极窄溢出钳制（XmigrateView .xm-jobs-kw 同款范式，
 900 档 100% 独占行不变） */
/* bw-search 改用 SearchFilterBar——胶囊壳/内建图标归组件单源，本类只留落位
 （min(240px,100%) 钳制与 900 档独占行同步更新，responsive900Sweep529 锚保形）与内衬
 （padding 对齐 .inp 原值 6px/10px，高度链零变动） */
.bw-search { width: min(240px, 100%); padding: var(--sp-1h) var(--sp-2h); }
/* .bw-hdot/.bw-hdot.lg 私造圆点退役——健康 tab 与 #cell-健康 槽两处改用
 MetaStrip dot 形态单源（DiagView dgMeta 先例），8px 圆点形态归组件 .ms-dot；
 seg 钮升 flex 结构居中（对称对齐：色点垂直居中由 align-items:center 结构承担，
 vertical-align:1px 手调补偿退役）；.bw-tab-ms 只承担圆点右距（--sp-1 与
 HistoryChart .hc-chip 色点间距同口径） */
.seg button { display: inline-flex; align-items: center; }
.seg .bw-tab-ms { display: inline-flex; margin-right: var(--sp-1); }
.bw-name { color: var(--ac-hi); cursor: pointer; font-size: var(--fs-sm); }
.bw-name:hover { text-decoration: underline; }
/* 表外 .card 壳退役 → 538 SystemView .sy-res 同语言 border-top 分节
 （表格皮归 QRT 内建；父级 .bw flex gap 承担与工具条的间距） */
.bw-res { border-top: 1px solid var(--border); }
.bw-linked-doc {
  /* 局部层级注释（z:60 是视图内悬浮卡档（低于 --z-popover 1150/右键菜单 --z-ctx 1200），
 只需盖过本页表格与聚焦面（--z-focus 300），不归全局 z token——升档反而会压住筛选/右键浮层 */
  position: fixed; right: 24px; bottom: 24px; z-index: 60;
  width: 460px; max-width: 44vw; max-height: 60vh;
  display: flex; flex-direction: column;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  box-shadow: var(--shadow-pop);
}
.bw-ld-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-1h) var(--sp-2h); border-bottom: 1px solid var(--line); font-size: var(--fs-xs); color: var(--tx1); }
/* G253：卡头动作组（原始响应双态钮+关闭钮） */
.bw-ld-acts { display: flex; align-items: center; gap: var(--sp-1); }
.bw-ld-body { margin: 0; padding: var(--sp-2h); overflow: auto; flex: 1; font-size: var(--fs-xs); line-height: 1.5; color: var(--tx0); }
/* .bw-picked 行选中高亮改走 QRT rowClass 契约——类挂在内核 tr 上，
 视图 scoped 样式须经 :deep 穿透（!important 压过内核斑马纹/hover 行底） */
.bw :deep(.bw-picked) { background: var(--ac-soft) !important; }
/* 1148：行内操作收敛——五个图标钮常驻会把「操作」列撑到 300px+ 并把其他列挤窄；
 静息态只留最常用的「打开工作区」+ 更多（⋯），其余四个收进 ⋯ 弹层（一个都不删）。
 悬停行时仍只显示这两颗，避免 6 个图标在窄列里互相贴脸。 */
.bw-acts { display: flex; gap: var(--sp-1); align-items: center; }
/* 行内「更多」弹层（DSL 查询 / Mapping / 段合并 / 删除）——与右键菜单同语言 */
.bw-more { display: flex; flex-direction: column; gap: 1px; min-width: 168px; }
/* 触发钮：图标 + 文字（纯图标在操作列里最难认；「更多」两字给出可点范围） */
.bw-more-trig { gap: var(--sp-1); }
.bw-more-lb { font-size: var(--fs-xs); }
.bw-more-it { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1h) var(--sp-2); border: 0; border-radius: var(--r-s);
  background: none; color: var(--tx1); font-size: var(--fs-sm); text-align: left; cursor: pointer; }
.bw-more-it:hover { background: var(--bg2); color: var(--ac-hi); }
.bw-more-it.danger:hover { background: var(--err-soft); color: var(--err); }
/* y3：列宽拖拽柄（.bw-rs 全家）随换 QRT 壳退役——列宽归内核 qrt-rs（es_tbl_cols 记忆） */
/* y3：分页条（.bw-foot 计数行保留；翻页/已筛选提示随换壳退役——翻页由 QRT renderMore
 增量渲染接管、「已筛选 N 列」由 QRT 工具行 .qrt-filtered 接管） */
.bw-foot { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-xs); color: var(--tx2); text-align: right; }
/* 窄容器：固定列宽合计 748px，挤压索引名列——创建时间列降级隐藏（CSV/Markdown 导出仍含全字段）。
 1280 独档并入 1100 全站档；：列头随壳进内核，藏列改 :deep data-col 选择器 */
@media (max-width: 1100px) {
  .bw :deep([data-col="创建时间"]) { display: none; }
}

/* ═══ 天罗W6：health/status 列筛选漏斗（.bw-f-btn/.bw-flt-on/.bw-flt-clear 全家）
 随换 QRT 壳退役——漏斗归 QRT 内建 .qrt-funnel + ColFilterPopover（含值内搜索/mini-bar），
 暗状态提示归 QRT 工具行 .qrt-filtered（.bw-hit-cur/useHitLocate 定位态同步退役，
 搜索定位归 QRT Ctrl+F 网格查找） ═══ */
/* 状态中文主显后的英文枚举小字随 StatusPill 改用退役
 （en 小字形态归组件 .sp-en 单源；XmigrateView .xm-st-en 是其自有样式不在此列） */
/* 900 紧凑微调档（ 口径）——工具行元素已随 .bw-bar wrap，此处让
 搜索框独占一行（窄视口 240px 定宽挤占命中导航/健康过滤的可用行宽）；表格横滚兜底
 在内核 .qrt-wrap，不在此重复造 */
@media (max-width: 900px) {
  .bw-search { flex: 0 0 100%; }
}
</style>
