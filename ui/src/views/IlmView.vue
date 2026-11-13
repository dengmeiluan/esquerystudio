<template>
  <div class="ilm" ref="rootEl">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款）。
         策略写键与「重试 step」(ilm/move) 是两个端点，可能分别授权——两者都缺才是「完全只读」。 -->
    <div v-if="auth.probed && !canOps && !canMove" class="ilm-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：策略的新建/编辑/删除与手动迁移不可用；需要 ILM 写权限。
    </div>
    <!-- 只有 ilm/move 缺权（策略可写、重试不可用）：说明缺哪一项，避免「重试钮无故消失」 -->
    <div v-else-if="auth.probed && canOps && !canMove" class="ilm-perm-note" role="status">
      <Shield :size="13" /> 手动迁移（重试 step）不可用：需要 ILM 移步写权限或集群级写权；策略的新建/编辑/删除不受影响。
    </div>
    <PageHeader :icon="Recycle" title="ILM 索引生命周期">
      <template #subtitle>
        <span>策略管理 / 索引解释 / 生命周期移步</span>
        <!-- KPI 大卡墙退役：「策略数/当前视图」两卡与列表卡头「策略（N）」重复计数，直接删（计数留 :title）；
 Explain 状态改 inline 元信息串（原第三张 ilm-kpi 卡） -->
        <!-- 手写 meta-strip 裸 div 换 MetaStrip 统一件（DiagView 正解形态：
 class 透传落位，值亮+标签暗+·分隔+tone 语义档；原 meta-err 三元色由 tone:'err'
 承接，策略/视图计数进 items，全量语义 :title 兜底不变） -->
        <!-- 去 .meta-strip 全局类——补 .mono 摘除（组件本体 .ms 已设
 font-family:var(--mono)，全局 .mono 冗余；W8 meta-strip 全局块退役同判据） -->
        <MetaStrip class="ilm-meta" :items="ilmMeta"
          :title="'策略 ' + policies.length + '（已注册） · 当前视图 ' + filtered.length + '（过滤后） · Explain 状态 ' + explainSummary + '（索引：' + (explainIndex || '未选') + '）'" />
      </template>
      <!-- 原独立工具条 ilm-bar 并入页头 actions（横幅层叠 -1） -->
      <template #actions>
        <!-- 手写过滤框改用 SearchFilterBar 统一件（全站第 6 胞；558 cd-kw-inp 先例：
 v-model 接原 ref 零触、placeholder 逐字保留兼作 aria-label；Esc 清空/Enter 检索
 内建语义对齐，胶囊壳三件套归组件单源；内联 width:min(200px,100%)——
 极窄钳制——经 $attrs 透传挂根，557④ 锁面零触） -->
        <SearchFilterBar v-model="filter" class="ilm-input" placeholder="按策略名过滤" style="width:min(200px,100%)" @enter="onHitKey" /><!-- 内联 width:200px → min() 极窄钳制（546 AliasesView / 547 paneShell 同范式） -->
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在过滤框接线） -->
        <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
        <!-- explain 索引裸 n-select 换统一选择器；反转：页内可写
 选择器退役换只读 CurrentIdxChip——「选索引」唯一可写入口收敛顶栏（架构裁决），
 v-model 直绑 explainIndex（useIdxState）的 follow 下行跟随与 watch 驱动
 loadExplain 语义原样保留，选中/清空仍经 watch 重拉 -->
        <CurrentIdxChip />
<label style="display:inline-flex;align-items:center;gap:var(--sp-1);font-size: var(--fs-sm);color:var(--tx1);cursor:pointer">
          <input type="checkbox" v-model="ilmAutoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 自动刷新频率下拉改用 AutoRefreshSelect 统一件（原内联样式原生 select 退役；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="ilmAutoRefresh" v-model:ms="ilmIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
        <button aria-label="刷新策略列表" class="btn sm ghost" @click="loadPolicies" :disabled="loading" title="刷新策略列表">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
        <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/ilm/'=本页 policies/policy/explain/move 全通道（LifecycleView
 已锁子串 '/cluster/ilm/explain'，explain 面跨页互见） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（ILM）" title="最近一次 ILM 策略/解释/移步请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
      </template>
    </PageHeader>

    <!-- -A2：页面级失败态——策略拉取失败不能只闪 toast，KPI 显 0 会误导成「无策略」 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="loadPolicies" :disabled="loading">重试</button>
    </div>

    <div class="ilm-grid" :style="{ '--ilm-list-w': ilmListW + 'px' }">
      <!-- 左：策略列表。：pane 壳三件套（border/bg/radius）退役（535 SqlBridge
 pane 直贴约定续扫）——flex/overflow 布局语义与 .card padding 载体原样迁 .ilm-list -->
      <div class="ilm-list">
        <div class="card-t">
<List :size="13" /> 策略（{{ filtered.length }}）
          <!-- W4c：左栏宽度循环档（usePref('ilm.listW') 记忆） -->
          <button class="btn xs ghost" :title="'左栏宽度档：' + ilmListW + 'px（点击切换）'" @click="cycleIlmListW">宽</button>
          <button v-if="canOps" class="btn xs" style="margin-left:auto" @click="openNewPolicy"><Plus :size="11" /> 新建</button>
        </div>
        <div v-if="loading && !filtered.length" style="padding:var(--sp-3);display:flex;flex-direction:column;gap:var(--sp-2)">
          <SkeletonBox v-for="i in 4" :key="i" height="80px" round />
        </div>
        <div v-else-if="filtered.length" class="ilm-rows">
            <div
              v-for="(p, i) in filtered" :key="p.name"
              class="ilm-p" :class="{ on: selected?.name === p.name }" :data-hit-idx="i + 1"
              :aria-current="selected?.name === p.name || undefined"
              @click="pickPolicy(p)"
              @contextmenu.prevent="openIlmMenu($event, p)" @keydown="onIlmMenuKey($event, p)" data-row-nav @keydown.self="rowArrowNav"
              role="button" tabindex="0" @keydown.enter.prevent="pickPolicy(p)" @keydown.space.prevent="pickPolicy(p)">
            <div class="ilm-p-head">
              <b class="mono"><MarkText :text="p.name" :kw="filter" /></b>
              <span v-if="p.version != null" class="chip mono">v{{ p.version }}</span>
              <span class="ilm-p-ops" style="margin-left:auto;display:flex;gap:var(--sp-1)" @click.stop>
                <button v-if="canOps" aria-label="编辑策略" class="btn xs ghost" title="编辑策略" @click="openEditPolicy(p)"><Pencil :size="11" /></button>
                <button v-if="canOps" aria-label="删除策略" class="btn xs ghost danger" title="删除策略" :disabled="deleting" @click="deletePolicy(p.name)"><Trash2 :size="11" /></button>
              </span>
            </div>
            <div class="ilm-p-phases">
              <!-- 策略卡 phase 小色块中文主显（phaseZh + ilm-ph-en 英文小字双语，
 140 explain 徽章同款范式）。宽度二选一裁定（目测）：色块是 inline-flex
 内容自适应宽且外层 flex-wrap 换行兜底，中文 1-2 字恒放得下——主显中文
 （附英文小字），不再裸甩英文 -->
              <div v-for="ph in phases(p)" :key="ph.name" class="ilm-ph" :style="{ background: PHASE_COLORS[ph.name] || 'var(--bg2)' }">
                <span class="ilm-ph-name"><template v-if="phaseZh(ph.name)">{{ phaseZh(ph.name) }}<span class="ilm-ph-en">{{ ph.name }}</span></template><template v-else>{{ ph.name }}</template></span>
                <span v-if="ph.min_age" class="ilm-ph-age mono">{{ ph.min_age }}</span>
              </div>
            </div>
            <!-- W4c：modified_date 裸串 → TimeCell 统一件（SnapshotsView 时间列同款 abs 档，悬浮带时区） -->
            <div v-if="p.modified_date" class="ilm-p-time mono">修改：<TimeCell :ts="p.modified_date" abs /></div>
          </div>
        </div>
        <!-- 过滤致空档：策略存在但被关键字全部隐藏（照 AliasesView 过滤档范式） -->
        <EmptyState v-else-if="policies.length" :icon="ShieldQuestion" text="无匹配策略"
          :hint="`共 ${policies.length} 个策略，被当前关键字隐藏`" action-text="清除过滤" @action="filter = ''" />
        <!-- 真空态：err-bar 存在时不再显示「未定义策略」，两者互斥（失败不是空，同 SnapshotsView 处理）。
             示例入口写过 DevTools 的 PUT 策略草稿，与 explain 跳转同门（1124）：无 DevTools 写权时不渲染，
             否则只读身份点下去只会拿到一条 toast。 -->
        <EmptyState v-else-if="!loadErr" :icon="ShieldQuestion" text="当前集群未定义任何 ILM 策略"
          :action-text="canDevtools ? '在 Dev Tools 创建示例策略 →' : ''" @action="createSample"
          :hint="canDevtools ? '' : '示例策略需要在 Dev Tools 写权限；可先联系管理员开通 ILM 或 DevTools 页'" />
      </div>

      <!-- 右：详情 + Explain（pane 壳退役，布局语义与 padding 载体迁 .ilm-detail） -->
      <div class="ilm-detail">
        <div class="card-t">
          <template v-if="selected">
            <Recycle :size="13" /> {{ selected.name }} · 时间线
          </template>
          <template v-else-if="explainIndex && explain">
            <FileSearch :size="13" /> Explain: {{ explainIndex }}
            <!-- 在 DevTools 打开（GET /<idx>/_ilm/explain 带参预填，Watcher 范式） -->
            <button class="btn ghost xs" style="margin-left:auto" :disabled="!canDevtools"
              :title="canDevtools ? '在 Dev Tools 打开 explain API' : 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'"
              @click="explainToDevtools">
              <TerminalSquare :size="11" /> Dev Tools
            </button>
          </template>
          <template v-else>
            <Info :size="13" /> 选择策略查看 Phase 时间线，或在顶栏选择索引查看 explain
          </template>
        </div>

        <!-- Phase 时间线 -->
        <div v-if="selected" class="ilm-timeline">
          <div v-for="(ph, i) in phases(selected)" :key="ph.name" class="ilm-tl">
            <div class="ilm-tl-dot" :style="{ background: PHASE_COLORS[ph.name] || 'var(--tx2)' }">{{ i + 1 }}</div>
            <div class="ilm-tl-body">
              <div class="ilm-tl-head">
                <b>{{ ph.name }}</b>
                <span v-if="ph.min_age" class="chip mono">min_age = {{ ph.min_age }}</span>
              </div>
              <div class="ilm-tl-actions">
                <div v-for="(cfg, action) in ph.actions" :key="action" class="ilm-tl-action">
                  <b class="mono">{{ action }}</b>
                  <!-- W-C 批：action 配置走 highlightJson 范式（转义安全 v-html） -->
                  <pre class="mono json-view" v-html="highlightJson(prettyJson(cfg))"></pre>
                </div>
                <div v-if="!ph.actions || !Object.keys(ph.actions).length" class="il-noact">无 actions</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Explain 数据 -->
        <div v-else-if="explainIndex && explain" class="ilm-ex">
          <div v-for="(info, idx) in explain.indices" :key="idx" class="ilm-ex-row">
            <div class="ilm-ex-name mono">{{ idx }}</div>
            <div v-if="info.managed === false" class="ilm-ex-unmg">
              <ShieldOff :size="12" /> 未被 ILM 管理（无 <code>index.lifecycle.name</code> 设置）
            </div>
            <template v-else>
              <div class="ilm-ex-line">
                <span class="ilm-ex-l">policy</span><b class="mono">{{ info.policy }}</b>
              </div>
              <div class="ilm-ex-line">
                <span class="ilm-ex-l">phase</span>
                <span class="chip mono" :style="{ background: PHASE_COLORS[info.phase], color: 'var(--tx-on-strong)' }"><!-- ：phase 枚举加中文名（esEnumZh.phaseZh；英文小字保留在后，色档不动） --><template v-if="phaseZh(info.phase)">{{ phaseZh(info.phase) }}<span class="ilm-ph-en">{{ info.phase }}</span></template><template v-else>{{ info.phase }}</template></span>
                <span class="ilm-ex-l" style="margin-left:14px">action</span><span class="mono">{{ info.action }}</span>
                <span class="ilm-ex-l" style="margin-left:14px">step</span><span class="mono">{{ info.step }}</span>
                <button v-if="canMove && isRetryable(info)" class="btn xs ghost" style="margin-left:14px" :disabled="retrying" @click="doRetryStep(info)"><RefreshCw :size="11" /> 重试 step</button>
              </div>
              <div v-if="info.age" class="ilm-ex-line">
                <span class="ilm-ex-l">age</span><span class="mono">{{ info.age }}</span>
              </div>
              <div v-if="info.step_info" class="ilm-ex-step">
                <b>step_info</b>
                <pre class="mono json-view" :class="{ err: info.step_info.type === 'illegal_argument_exception' || info.step_info.type === 'exception' }" v-html="highlightJson(prettyJson(info.step_info))"></pre>
              </div>
            </template>
          </div>
        </div>

        <!-- Explain 拉取失败：内联失败面板 + 重试，不回落引导空态；重试在途禁用（防连点双发，进度可感知） -->
        <EmptyState v-else-if="explainIndex && explainErr" :icon="RefreshCw" text="explain 拉取失败"
          :hint="'索引 ' + explainIndex + '：' + explainErr" action-text="重试" :action-disabled="explainLoading" @action="loadExplain" />

        <!-- -F2 逃生舱：引导列表经默认插槽承载（内容归 EmptyState 留白体系） -->
        <EmptyState v-else :icon="Recycle" text="选择左侧策略查看 Phase 时间线与 Explain">
          <ul style="text-align:left; list-style:none; padding:0; margin:0; font-size: var(--fs-sm); color:var(--tx1)">
            <li>· <b>左侧策略列表</b>：hot / warm / cold / delete 四阶段配色</li>
            <li>· <b>Phase 时间线</b>：min_age、actions 完整可视化</li>
            <li>· <b>Explain 视图</b>：定位索引当前 phase/action/step 及异常信息</li>
          </ul>
        </EmptyState>
      </div>
    </div>
  </div>

  <!-- ILM 策略编辑器（新建/编辑） -->
  <n-modal v-model:show="policyEditOpen" preset="card" :title="editingName ? '编辑策略 ' + editingName : '新建 ILM 策略'" style="width:680px;max-width:94vw" :bordered="false">
    <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-2)">
      <span class="ilm-ex-l" style="flex:none">策略名</span>
      <input v-model="policyName" class="inp mono" placeholder="my-ilm-policy" :disabled="!!editingName" />
      <!-- 表单校验审计：必填项就近提示（savePolicy 的 toast 前置到字段旁，拦截逻辑不变） -->
      <span v-if="!policyName.trim()" class="il-hint il-err" style="flex:none;margin:0">策略名必填</span>
    </div>
    <!-- Monaco 直挂合并 JsonArea 统一件（双向可编辑；原 360px 高度按组件 rows*19+16 公式取 rows=18≈358px，
 附带 JSON 合法性圆点/格式化/压缩/复制工具条；policyJsonErr 就近提示保留不动） -->
    <!-- policy body 接 dsl-assist（ILM 策略非 search body，fields 空数组——补全按通用检查降级） -->
    <!-- rows=18 定高（18*19+16=358px）改视口档 min(60vh,358px)（IndexHub/DslQuery
 弹窗编辑器 height="min(60vh,Npx)" 同款口径）——矮屏不再顶出弹窗滚两层；:rows 保留为
 非弹性回退档，弹性高经 .ilm-policy-ja :deep 覆盖内层 monaco-host 内联高（!important
 同 JsonArea fill 模式先例；JsonArea 组件本体不属改动面） -->
    <JsonArea v-model="policyBody" class="ilm-policy-ja" :dsl-assist="{ fields: () => [] }" :rows="18" placeholder="{ &quot;policy&quot;: { &quot;phases&quot;: { … } } }" />
    <!-- 表单校验审计：JSON 格式就近提示（纯展示 computed，实时反馈给修再存；错误仍由 savePolicy 兜底） -->
    <div v-if="policyJsonErr" role="alert" class="il-hint il-err">{{ policyJsonErr }}</div>
    <template #footer>
      <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
        <button class="btn" @click="policyEditOpen = false">取消</button>
        <!-- 空提交拦截：名空/JSON 非法时按钮禁用并说明原因（Enter 路径仍由 savePolicy 内同口径校验兜底） -->
        <button class="btn pri" :disabled="policyBusy || !policyName.trim() || !!policyJsonErr || !canOps"
          :title="!canOps ? '当前授权不含 ILM 写权限' : !policyName.trim() ? '先填策略名' : policyJsonErr ? '策略 JSON 不合法，修正后再保存' : ''"
          @click="savePolicy"><Save :size="12" /> 保存</button>
      </div>
    </template>
  </n-modal>

  <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/ilm/ 记录） -->
  <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  <!-- 策略卡右键（1144）：卡片右上只留最高频的「编辑/删除」，查看相位 JSON、
  复制策略名/策略体、到 Dev Tools 解释这些动作走右键——与索引行/历史行同一件。 -->
  <CellContextMenu v-if="ilmMenu" :x="ilmMenu.x" :y="ilmMenu.y" :title="'ILM 策略 · ' + ilmMenu.p.name"
    :items="ilmMenuItems" @close="ilmMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NModal } from 'naive-ui';
import MarkText from '../components/MarkText.vue';
import { Shield, Recycle, List, RefreshCw, Info, FileSearch, ShieldOff, ShieldQuestion, Plus, Pencil, Trash2, Save, Terminal, TerminalSquare, Copy, ExternalLink, Braces, Eye, ListTree } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import PageHeader from '../components/PageHeader.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useIdxState } from '../composables/urlState';
import { friendlyEsError } from '../utils/esError';
import { phaseZh } from '../utils/esEnumZh'; /* ：ILM phase 枚举中文接线 */
import { highlightJson, prettyJson } from '../utils/jsonc';
import { askConfirm } from '../composables/confirm';
import { useScopedDraft } from '../composables/useScopedDraft';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle';
import JsonArea from '../components/JsonArea.vue';
import TimeCell from '../components/TimeCell.vue'; /* W4c：modified_date 统一时间件（Snapshots 同款） */
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 页头元信息串统一件 */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：页头过滤胶囊统一件 */
import HitNav from '../components/HitNav.vue';
import { useHitLocate } from '../composables/useHitNav';
import { useModalEnter } from '../composables/useModalEnter';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1144：策略卡右键 */
import { copyText } from '../utils/format';
import { writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
/* 权限门禁——ILM 策略保存/删除与 move step=rank3 档
 （角色定义「OPERATOR=低危写」不含策略级变更；后端 /cluster/ilm/policy 未入 CLUSTER 关键词是已知
 偏低档，待后端加固，前端先按角色意图收口；move/start/stop 本就在 CLUSTER 档） */
const auth = useAuthStore();
/* 策略增删改是集群级共享件：连接模型下除 w:ilm 外还需 rank3 或集群设置写键。 */
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/policy', store.target)
  && auth.canClusterScope(store.target));
/* DevTools 跳转入口与 DevTools 页同门：无页写键时不展示可点击态。 */
const canDevtools = computed(() => auth.canEndpoint('admin', 'POST',
  '/internal/es/index/cluster/devtools/execute', store.target));
/* 「重试 step」实调 /cluster/ilm/move（rank3）——按真实端点单独裁决，不复用策略写门（两页端点可能分别授权） */
const canMove = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/move', store.target));
const router = useRouter();

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/ilm/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 空态引导——预填示例 ILM 策略跳 REST 控制台（复用 DevTools sessionStorage 联动协议） */
const SAMPLE_ILM_BODY = JSON.stringify({
  policy: {
    phases: {
      hot: { actions: { rollover: { max_size: '50gb', max_age: '7d' } } },
      delete: { min_age: '30d', actions: { delete: {} } },
    },
  },
}, null, 2);
function createSample() {
  /* 与 explain 跳转同源门（1124）：样例是 PUT 策略，无 DevTools 权限跳过去也发不出去 */
  if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'); return; }
  writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
    title: 'ILM 示例策略', method: 'PUT', path: '/_ilm/policy/sample-policy', body: SAMPLE_ILM_BODY,
  }));
  router.push('/devtools');
}

/* ILM 策略编辑器：新建/编辑/删除（此前策略变更只能去 REST 手写 JSON） */
const policyEditOpen = ref(false);
/* 策略编辑草稿——只服务新建会话：写一半的 body/名在关弹窗重开、切页回来、刷新后都回显
 （useScopedDraft 挂载读一次）；编辑会话体恒取自源策略，走独立 ref 不写新建稿，
 编辑取消后新建不被带出编辑体 */
const newPolicyName = useScopedDraft('policy-name', { route: 'ilm' }, '').text;
const newPolicyBody = useScopedDraft('policy-body', { route: 'ilm' }, '').text;
const editPolicyName = ref('');
const editPolicyBody = ref('');
const policyBusy = ref(false);
const editingName = ref(''); // 非空 = 编辑既有策略；空 = 新建
/* 模板/校验的绑定面按会话域转发（v-model 双向各落各域） */
const policyName = computed({
  get: () => (editingName.value ? editPolicyName : newPolicyName).value,
  set: (v: string) => { (editingName.value ? editPolicyName : newPolicyName).value = v; },
});
const policyBody = computed({
  get: () => (editingName.value ? editPolicyBody : newPolicyBody).value,
  set: (v: string) => { (editingName.value ? editPolicyBody : newPolicyBody).value = v; },
});
/* 表单校验审计：策略体 JSON 实时合法性（纯展示）——空体/解析失败给出具体原因，
 与 保存按钮禁用门、savePolicy 内兜底校验同口径（ReindexAdvanced bodyJsonErr 同构） */
const policyJsonErr = computed(() => {
  const s = policyBody.value.trim();
  if (!s) return '策略体不能为空——粘贴或编写 ILM policy JSON';
  try { JSON.parse(s); return ''; } catch (e: any) { return '策略 JSON 不合法：' + String(e?.message ?? e); }
});
function openNewPolicy() {
  editingName.value = '';
  /* 半成品稿优先回显，空稿才落示例体；保存成功即清稿（savePolicy），不会带出已保存的旧策 */
  if (!policyBody.value.trim()) policyBody.value = SAMPLE_ILM_BODY;
  policyEditOpen.value = true;
}
function openEditPolicy(p: any) {
  editingName.value = p.name;
  editPolicyName.value = p.name;
  editPolicyBody.value = JSON.stringify({ policy: p.policy }, null, 2);
  policyEditOpen.value = true;
}
async function savePolicy() {
  if (!canOps.value) { store.notify('warning', 'ILM 策略变更需要 CLUSTER_OP/ADMIN 角色'); return; }
  /* 2.1.6：执行体防重 */
  if (policyBusy.value) return;
  if (!policyName.value.trim()) { store.notify('error', '策略名不能为空'); return; }
  let parsed: any;
  try { parsed = JSON.parse(policyBody.value); } catch { store.notify('error', '策略 JSON 不合法'); return; }
  policyBusy.value = true;
  try {
    await api.ilmPolicyPut(policyName.value.trim(), JSON.stringify(parsed));
    store.notify('success', `策略 ${policyName.value} 已保存`);
    if (!editingName.value) { newPolicyName.value = ''; newPolicyBody.value = ''; } // 新建稿随保存消费
    policyEditOpen.value = false;
    loadPolicies();
  } catch (e: any) {
    store.notify('error', '保存失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { policyBusy.value = false; }
}
/* 策略编辑弹窗 Enter=保存（can 与主按钮 disabled 同口径；Monaco 内是
 TEXTAREA，tagName 检查天然放行，Enter 换行不受接管影响） */
useModalEnter(policyEditOpen, savePolicy, () => canOps.value && !policyBusy.value);
/* 提交防重（INTERACTION 范式）：删除在途时双击/重入直接短路 */
const deleting = ref(false);
async function deletePolicy(name: string) {
  if (!canOps.value) { store.notify('warning', 'ILM 策略变更需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (deleting.value) return;
  if (!await askConfirm({
    title: '删除 ILM 策略',
    level: 'critical', guardText: name,
    message: `将删除策略「${name}」。已应用该策略的索引会停止生命周期推进，此操作不可恢复。`,
    okText: '删除策略',
  })) return;
  deleting.value = true;
  try {
    await api.ilmPolicyDelete(name);
    store.notify('success', `策略 ${name} 已删除`);
    if (selected.value?.name === name) selected.value = null;
    loadPolicies();
  } catch (e: any) {
    store.notify('error', '删除失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { deleting.value = false; }
}

const policies = ref<any[]>([]);
const loading = ref(false);

/* ILM phase 迁移是典型盯进度场景——接 useAutoRefresh（KeepAlive/页面隐藏/卸载全链停续） */
const ilmAutoRefresh = usePref('ilm.autoRefresh', false);
const ilmIntervalMs = usePref('ilm.intervalMs', 30000);
const ilmRefresher = useAutoRefresh(loadPolicies, {
  ms: () => (ilmAutoRefresh.value ? ilmIntervalMs.value : 0),
  guard: () => !loading.value,
});
/* 内部意图恒开（on 初值 false 时 restart() 是 no-op，自动刷新静默不排表
 隐患）——实际运行由 ms getter 与用户 usePref 开关相与决定；TasksView :455 正典范式 */
ilmRefresher.setOn(true);
watch(ilmAutoRefresh, (v) => { if (v) loadPolicies(); ilmRefresher.restart(); });
watch(ilmIntervalMs, () => ilmRefresher.restart());

const loadErr = ref('');
/* 策略过滤与 explain 索引进 URL，排障链接可直接分享 */
const filter = useScopedDraft('kw', { route: 'ilm' }, '').text;
const selected = ref<any>(null);
/* /：explain 索引并轨 useIdxState（只读解释视图，属跟随白名单）。深链兼容：
 useIdxState 内部就是 useUrlState('idx', pickedIdx)——同键同语义，历史 ?idx= 分享链接
 原样可用，且深链值上行 store.pick（顶栏就位）。顶栏切索引即跟随；
 loadExplain 改由 watch 驱动：n-select @update:value 只覆盖用户交互，follow 的
 程序化改值不经过它——不补 watch 会渲染出「新索引名 + 旧 explain」的错配。 */
const explainIndex = useIdxState({ follow: true });
watch(explainIndex, () => loadExplain());
const explain = ref<any>(null);
const explainErr = ref('');
const explainLoading = ref(false); // explain 无骨架态，仅用于重试按钮防重入

/* Elastic 官方 phase 语义 → 主题 token（W-C 批：原 PHASE_DARK/PHASE_LIGHT 双表 + 五枚裸 hex 退役，
 单 token 表双主题自适应——theme.css 对 --dv-* 系与 --err 在 :root[data-theme="light"] 各备加深档，
 视图零分支，对齐 AnalyzeView palette 的 --dv-* color-mix 先例）。
 映射：hot(rollover 活跃期)=--dv-orange ｜ warm(转温)=--dv-yellow ｜ cold(转冷)=--dv-blue ｜
 frozen(冻结)=--dv-cyan ｜ delete(删除)=--err（语义错误红）。warm 原走 --warn，归并 --dv-yellow
 同族（token 分类色板，语义色 warn 留给真实告警）。
 徽标文字统一 --tx-on-strong（暗色=深字配亮填充，浅色=白字配深填充）。
 深底档（-deep）：白字彩底场景专用，浅色段已加深到 WCAG AA（≥4.5:1），暗色段回落主档。
 徽标(.ilm-ph)/时间线圆点(.ilm-tl-dot)/explain 徽章三处共用本表 */
const PHASE_COLORS: Record<string, string> = {
  hot: 'var(--dv-orange-deep)',
  warm: 'var(--dv-yellow-deep)',
  cold: 'var(--dv-blue-deep)',
  frozen: 'var(--dv-cyan-deep)',
  delete: 'var(--err)',
};

/* 页头元信息串 MetaStrip items——策略/视图计数 + Explain 值；
 Explain 异常档 tone:'err' 承接原 meta-err 三元色（原裸 div 的内联 span 退役；
 原 indexOpts 裸 label/value 选项构造随 n-select 退役，索引清单语义由 IndexPicker 承担） */
const ilmMeta = computed<MetaStripItem[]>(() => [
  { value: policies.value.length, label: '策略（已注册）' },
  { value: filtered.value.length, label: '当前视图（过滤后）' },
  { value: explainSummary.value, label: 'Explain · ' + (explainIndex.value || '未选'), tone: hasErr.value ? 'err' : undefined },
]);

/* W4c：策略卡与 explain 视图互斥收口——点卡看时间线时同步清 explainIndex（URL ?idx=
 随 useIdxState 一并上行清空；watch 驱动 loadExplain 将 explain 复位）。修页头错配：
 此前点卡只改 selected，页头 Explain 元信息串仍显旧索引旧值 */
function pickPolicy(p: any) {
  selected.value = p;
  explainIndex.value = '';
}

/* ═══ 1144：策略卡右键 ═══
 卡片右上常驻「编辑/删除」已覆盖主链路，右键补那些「看得见但要翻出去找」的动作：
 查看策略体（相位 JSON）、复制策略名/策略体、在 Dev Tools 里对某索引跑 explain。
 写操作（编辑/删除）沿用原入口与本页权限门，右键不绕过 canOps。 */
const ilmMenu = ref<{ x: number; y: number; p: any } | null>(null);
function openIlmMenu(e: MouseEvent, p: any) {
  ilmMenu.value = { x: e.clientX, y: e.clientY, p };
}
function onIlmMenuKey(e: KeyboardEvent, p: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  ilmMenu.value = { ...menuKeyAnchor(e), p };
}
const ilmMenuItems = computed<CcmItem[]>(() => {
  const m = ilmMenu.value; if (!m) return [];
  const p = m.p;
  const body = JSON.stringify({ policy: p.policy }, null, 2);
  return [
    { key: 'pick', label: '查看相位时间线', icon: ListTree, run: () => pickPolicy(p) },
    { key: 'body', label: '查看策略 JSON', icon: Braces, run: () => {
      /* 复用本页编辑弹窗的只读档（打开即看到完整策略体；不保存不会写集群） */
      editingName.value = p.name;
      editPolicyName.value = p.name;
      editPolicyBody.value = body;
      policyEditOpen.value = true;
    } },
    {
      key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'copy-name', label: '复制策略名', icon: Copy, run: async () => {
          const ok = await copyText(p.name);
          store.notify(ok ? 'success' : 'error', ok ? '已复制策略名：' + p.name : '复制失败');
        } },
        { key: 'copy-body', label: '复制策略 JSON', icon: Braces, run: async () => {
          const ok = await copyText(body);
          store.notify(ok ? 'success' : 'error', ok ? `已复制「${p.name}」策略 JSON` : '复制失败');
        } },
      ],
    },
    {
      key: 'explain-group', label: '生命周期解释…', icon: Eye, children: [
        { key: 'explain-cur', label: explainIndex.value ? `解释当前索引（${explainIndex.value}）` : '解释当前索引（未选）',
          icon: FileSearch, run: () => { if (!explainIndex.value) { store.notify('warning', '先在顶栏选择索引'); return; } void loadExplain(); } },
        { key: 'explain-dev', label: '在 Dev Tools 打开 explain', icon: ExternalLink, run: () => explainToDevtools() },
      ],
    },
    ...(canOps.value ? [{
      key: 'ops-group', label: '策略写操作…', icon: Pencil, sep: true, children: [
        { key: 'edit', label: '编辑策略', icon: Pencil, run: () => openEditPolicy(p) },
        { key: 'del', label: '删除策略', icon: Trash2, danger: true, run: () => void deletePolicy(p.name) },
      ],
    }] : []),
  ];
});

/* W4c：左栏宽度档（循环钮切档 + usePref 跨会话记忆；最小实现，不迁 WorkbenchLayout）。
 经 CSS var 注入 grid-template-columns，窄屏断点整条覆盖不受内联 style 干扰。
 W9：档循环三件套合并 useTierCycle 统一件（键名/档值/默认档语义不变） */
const { v: ilmListW, cycle: cycleIlmListW } = useTierCycle('ilm.listW', [300, 360, 440], 360);

const filtered = computed(() => {
  if (!filter.value) return policies.value;
  const kw = filter.value.toLowerCase();
  return policies.value.filter(p => p.name?.toLowerCase().includes(kw));
});

/* 搜索定位：过滤结果即命中集，卡片按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

function phases(p: any): { name: string; min_age?: string; actions?: any }[] {
  const raw = p?.policy?.phases || {};
  const order = ['hot', 'warm', 'cold', 'frozen', 'delete'];
  return order
    .filter(n => raw[n])
    .map(name => ({ name, ...raw[name] }));
}

async function loadPolicies() {
  loading.value = true;
  try {
    const list = await api.ilmPolicies();
    policies.value = Array.isArray(list) ? list : [];
    loadErr.value = '';
  } catch (e: any) {
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'ilm/policies: ' + loadErr.value);
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  loadPolicies();
  // URL 带 idx（分享/刷新恢复）时自动 explain，别让用户再点一次
  if (explainIndex.value) loadExplain();
});

/* explain API 带参跳 DevTools（_prefill 会话契约，run:true 直达结果） */
function explainToDevtools() {
  if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'); return; }
  if (!explainIndex.value) return;
  writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
    title: 'explain/' + explainIndex.value, method: 'GET',
    path: '/' + encodeURIComponent(explainIndex.value) + '/_ilm/explain', run: true,
  }));
  router.push('/devtools');
}

async function loadExplain() {
  if (!explainIndex.value) { explain.value = null; explainErr.value = ''; return; }
  const idx = explainIndex.value;
  explainLoading.value = true;
  try {
    const r = await api.ilmExplain(idx);
    if (idx !== explainIndex.value) return;
    explain.value = r;
    explainErr.value = '';
    selected.value = null; // 切换到 explain 视图
  } catch (e: any) {
    if (idx !== explainIndex.value) return;
    explainErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', 'ilm/explain: ' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（ilm/move 同口径，前缀保留） */
    explain.value = null;
  } finally { if (idx === explainIndex.value) explainLoading.value = false; }
}

/* step_info 异常（如 illegal_argument_exception）可重试当前 step */
function isRetryable(info: any): boolean {
  const t = info?.step_info?.type;
  return !!t && t !== 'no_step_info';
}

/* 提交防重：ilm/move 是写操作，重试在途时双击/Enter 重复下发直接短路 */
const retrying = ref(false);
async function doRetryStep(info: any) {
  if (!canMove.value) { store.notify('warning', 'ILM 移步需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (retrying.value) return;
  const idx = explainIndex.value;
  if (!idx) return;
  const body = JSON.stringify({
    current_step: { phase: info.phase, action: info.action, name: info.step },
    next_step: { phase: info.phase, action: info.action, name: info.step },
  });
  retrying.value = true;
  try {
    await api.ilmMove(idx, body);
    store.notify('success', `已触发 ${idx} 重试当前 step（${info.phase}/${info.action}/${info.step}）`);
    loadExplain();
  } catch (e: any) {
    store.notify('error', 'ilm/move 失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（XmigrateView w80 先例） */
  } finally { retrying.value = false; }
}

const explainSummary = computed(() => {
  if (!explain.value?.indices) return '-';
  const arr = Object.values(explain.value.indices) as any[];
  if (!arr.length) return '-';
  const info = arr[0];
  if (info.managed === false) return 'unmanaged';
  return info.phase + '/' + info.action;
});
const hasErr = computed(() => {
  if (!explain.value?.indices) return false;
  return Object.values(explain.value.indices as any).some((v: any) => {
    const t = v?.step_info?.type;
    return t && /exception/i.test(t);
  });
});
</script>

<style scoped>
.ilm { display: flex; flex-direction: column; gap: var(--sp-3); }
/* .ilm-title（fs-sm/600）为 PageHeader 接管后的死规则，随标题四档合并退役 */
/* 类随改用挂 SearchFilterBar 根——手写输入框皮（bg2 底/line 边/4px 圆角/
 focus 描边）退役归组件 .sfb 胶囊壳单源，本类只留落位与高度内衬（26px 对齐现行，
 高度链零动；mono 字族保留等形）；内联 width:min(200px,100%) 透传挂根（557④ 锁面） */
.ilm-input { height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); font-family: var(--font-mono, monospace); }

/* KPI 大卡墙退役：页头 inline 元信息串（W-C 批：基础形态合并全局 .meta-strip，本页只留页头下移量）。
 串本体换 MetaStrip 统一件（class 透传命中本条落位），
 meta-err 三元色由组件 tone:'err' 语义档承接，scoped 提级规则同步更新删除。
 全局 .meta-strip 类退役只留 .mono，落位下移量改挂 .ilm-meta */
.ilm-meta { margin-top: 3px; }

/* W4c：左列宽由 --ilm-list-w（usePref 宽度档）注入，minmax 下限保留 */
.ilm-grid { display: grid; grid-template-columns: minmax(260px, var(--ilm-list-w, 360px)) minmax(0, 1fr); gap: var(--sp-3); min-height: 500px; }
/* pane 壳（.card 三件套）退役——flex/overflow 布局语义与 .card padding 载体
 原样迁入无壳类（14px 垂直留白为 .card 刻意值同步更新保字面，内容边距零变动） */
.ilm-list { display: flex; flex-direction: column; overflow: hidden; padding: 14px var(--sp-4); }
.ilm-rows { flex: 1; overflow-y: auto; padding: var(--sp-1h) 0; }
.ilm-p { padding: var(--sp-2h) var(--sp-3); cursor: pointer; border-bottom: 1px solid var(--line); transition: background var(--tr); }
.ilm-p:hover { background: var(--bg2); }
.ilm-p.on { background: var(--ac-soft); }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.ilm-p.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.ilm-p-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-1h); font-size: var(--fs-sm); }
/* 1196：卡片头的编辑/删除静息隐藏（1147 列头 / 1189 窄列同款纪律）——这两颗是低频写操作，
   常驻在每张卡片上既占位又与「查看相位/解释」抢注意力，且它们早已在行右键「策略写操作…」二级里。
   保留可达性：悬停、键盘聚焦（:focus-within）或当前选中行（.on）时显现；
   触屏无 hover——选中行即出，且右键菜单始终是完整入口。 */
.ilm-p-ops { opacity: 0; transition: opacity var(--tr); }
.ilm-p:hover .ilm-p-ops, .ilm-p:focus-within .ilm-p-ops, .ilm-p.on .ilm-p-ops { opacity: 1; }
@media (hover: none) { .ilm-p-ops { opacity: 1; } }
.ilm-p-phases { display: flex; gap: var(--sp-1); flex-wrap: wrap; margin-bottom: var(--sp-1); }
.ilm-ph { display: inline-flex; align-items: center; gap: 5px; padding: var(--sp-0) var(--sp-2); border-radius: var(--r-m); color: var(--tx-on-strong); font-size: var(--fs-xs); font-weight: 600; }
.ilm-ph-age { opacity: .85; font-size: var(--fs-xs); }
.ilm-p-time { font-size: var(--fs-xs); color: var(--tx2); }

/* pane 壳退役，overflow 布局语义与 .card padding 载体原样迁入 */
.ilm-detail { overflow: auto; padding: 14px var(--sp-4); }
/* 14px 18px→var(--sp-4)（16px，间距落梯） */
.ilm-timeline { padding: var(--sp-4); position: relative; }
.ilm-timeline::before { content: ''; position: absolute; left: 32px; top: 30px; bottom: 30px; width: 2px; background: var(--line); }
.ilm-tl { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); position: relative; }
.ilm-tl-dot { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--tx-on-strong); font-weight: 600; z-index: 1; box-shadow: 0 0 0 3px var(--bg0); }
.ilm-tl-body { flex: 1; }
.ilm-tl-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1h); font-size: var(--fs-md); }
.ilm-tl-actions { display: flex; flex-direction: column; gap: var(--sp-1h); margin-top: var(--sp-1); }
.ilm-tl-action { background: var(--bg2); border-radius: var(--r-xs); padding: var(--sp-1h) var(--sp-2h); }
.ilm-tl-action b { color: var(--info); font-size: var(--fs-xs); }
.ilm-tl-action pre { margin: var(--sp-1) 0 0; font-size: var(--fs-xs); max-height: 180px; overflow: auto; }

.ilm-ex { padding: var(--sp-4); } /* ：14px 18px→var(--sp-4) */
.ilm-ex-row { padding: var(--sp-3) 0; border-bottom: 1px solid var(--line); }
.ilm-ex-row:last-child { border-bottom: 0; }
.ilm-ex-name { font-size: var(--fs-md); font-weight: 600; color: var(--tx0); margin-bottom: var(--sp-2); }
.ilm-ex-unmg { display: inline-flex; align-items: center; gap: var(--sp-1h); color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-1) var(--sp-2); background: var(--bg2); border-radius: var(--r-xs); }
.ilm-ex-unmg code { background: var(--bg1); padding: 1px var(--sp-1); border-radius: 2px; color: var(--info); }
.ilm-ex-line { display: flex; align-items: center; gap: var(--sp-1h); padding: 3px 0; font-size: var(--fs-xs); }
.il-noact { font-size: var(--fs-xs); color: var(--tx2); padding: var(--sp-1h); }
.ilm-ex-l { color: var(--tx2); text-transform: uppercase; font-size: var(--fs-xs); letter-spacing: .04em; }
/* phase 枚举英文小字（中文主体后缀，XmigrateView .xm-st-en 同款） */
.ilm-ph-en { font-size: var(--fs-2xs); opacity: .65; margin-left: 3px; }
.ilm-ex-step { margin-top: var(--sp-1h); }
.ilm-ex-step pre { background: var(--bg2); padding: var(--sp-2); border-radius: var(--r-xs); font-size: var(--fs-xs); max-height: 220px; overflow: auto; margin: var(--sp-1) 0 0; }
.ilm-ex-step pre.err { background: var(--err-soft); color: var(--err); border-left: 3px solid var(--err); }

/* 策略编辑弹窗 JsonArea 视口档——:rows=18 定高回退，弹性高 min(60vh,358px)
 覆盖内层 monaco-host 内联 height（!important 同 JsonArea .ja.fill 先例） */
.ilm-policy-ja :deep(.monaco-host) { height: min(60vh, 358px) !important; }
/* 弹窗编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——n-modal 卡头与 JsonArea 自带 ja-bar 工具条（bg+border-bottom）自承分界，不另补承接线
 （：本面无 header 元素直接贴编辑器）；组件本体零触，纯视觉 */
.ilm-policy-ja { border: none; border-radius: 0; }

/* 死 .empty 规则同步更新删除（两处空态早已 EmptyState 化，模板零引用实证） */
/* 实测 iframe 可用宽 ~866px，固定栏宽在此崩塌。
 断点值复用 theme.css 既有的 1000px，不新造断点。 */
@media (max-width: 1100px) {
  .ilm-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——策略列表/详情堆叠已由
 1100 档合并，此处收时间线/示例区侧距，时间线头与示例键值行允许换行（长策略名/长 code 不再硬挤） */
@media (max-width: 900px) {
  .ilm-timeline { padding: var(--sp-3); }
  .ilm-ex { padding: var(--sp-3); }
  .ilm-tl-head { flex-wrap: wrap; }
  .ilm-ex-line { flex-wrap: wrap; }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.ilm-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
