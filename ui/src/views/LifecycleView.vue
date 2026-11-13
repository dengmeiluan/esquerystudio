<template>
  <div class="lc-page">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps && !canMove && !canRollover" class="lc-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：生命周期的启动/停止/rollover/迁移不可用；需要 ILM 生命周期写权限。
    </div>
    <PageHeader :icon="Layers" title="索引生命周期视图">
<template #subtitle>
        <span class="lc-hd-sub">
          ILM 阶段甘特 · 手动 rollover · move-to-step · start/stop ·
          <!-- 页头状态徽标改用 StatusPill 统一件（全站最后一个私造状态胶囊合并；
 meta-err/meta-ok/meta-warn 文本档退役——err→r/warn→y/ok→g 语义映射，:title 全文兜底不变；
 STOPPED 是人为暂停语义仍走 y 档，r 档只留给 stsErr 拉取失败，口径不变） -->
          <StatusPill v-if="stsErr" tone="r" label="状态拉取失败" :title="stsErr" />
          <StatusPill v-else :tone="ilmSts?.operation_mode === 'RUNNING' ? 'g' : 'y'" :label="ilmSts?.operation_mode || '—'" />
        </span>
      </template>
      <template #actions>
        <div class="lc-hd-r">
<button class="btn ghost sm" @click="load" :disabled="busy">
            <RefreshCw :size="12" :class="{ spinning: busy }" /> 刷新
          </button>
          <!-- G122：双钮补 spinning（ilmOpPending 此前只 disabled 半合规；733 G110 同款） -->
          <button v-if="canOps" class="btn ghost sm" @click="ilmStart"
            :disabled="ilmOpPending || !canClusterScope" :title="ilmScopeHint">
            <PlayCircle :size="12" :class="{ spinning: ilmOpPending }" /> Start ILM
          </button>
          <button v-if="canOps" class="btn ghost sm" @click="ilmStop"
            :disabled="ilmOpPending || !canClusterScope" :title="ilmScopeHint">
            <PauseCircle :size="12" :class="{ spinning: ilmOpPending }" /> Stop ILM
          </button>
          <!-- 前置说明：不可用态不只靠 title（触屏/键盘看不到 tooltip），在按钮旁常驻一句原因 -->
          <span v-if="canOps && !canClusterScope" class="dim" style="font-size:var(--fs-xs)" :title="ilmScopeHint">
            集群级开关需 rank3 / 集群设置写权
          </span>
</div>
      </template>
</PageHeader>
    </div>

    <!-- G4-B3：策略拉取失败 err-bar 独立顶置（互斥链外）——不再 .catch(() => []) 伪装「无策略」空态（ 同源），旧甘特保留 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="load" :disabled="busy">重试</button>
    </div>

    <div class="lc-panel">
      <div class="lc-panel-tt">
        <Rocket :size="12" /> 手动 Rollover
        <span class="lc-sub">对写入别名手动触发 rollover（可 dry-run 预检）</span>
        <!-- 条件编辑框高度三档循环钮（ra-script-h 同款 margin-left:auto 形态），useTierCycle('lifecycle.roH') 记忆 -->
        <button class="btn ghost xs" style="margin-left:auto" data-test="lc-ro-h"
          :title="'条件编辑框高度档：' + roH + ' 行'" @click="cycleRoH">高</button>
      </div>
      <div class="lc-rollover">
        <!-- 「用当前索引」回填钮合并 PickCurrentIdxBtn 统一件（558 五视图先例：
 data-test/title 逐字锚由组件保真；@pick 显式覆盖口，草稿仅空时自动回填语义不变
 （272 先例——写类表单不 follow，要换目标由用户点钮/显式改输入） -->
        <div class="lc-idx-row">
          <IndexPicker v-model="rolloverAlias" placeholder="别名（写入 alias 或 data stream）" />
          <PickCurrentIdxBtn @pick="rolloverAlias = store.pickedIdx" />
        </div>
        <!-- W4c：conditions 非 search body——bodyKind 显式 'none'（原缺省走 search 档冒充，补全按通用检查降级） -->
        <!-- rows=4 定高 → 三档行数循环（JsonArea 既有 rows 写法，默认档 4 行不变），
 useTierCycle('lifecycle.roH') 跨会话记忆；下方挂 lintClause 零 ctx 结构体检提示条
 （提示条渲染形态与 alv-lint/ra-lint 同构，零阻塞不拦执行） -->
        <JsonArea ref="roJaRef" v-model="rolloverCond" :dsl-assist="{ fields: () => [], bodyKind: () => 'none' }" :rows="roH" placeholder="{ &quot;conditions&quot;: { &quot;max_docs&quot;: 100000, &quot;max_age&quot;: &quot;7d&quot;, &quot;max_size&quot;: &quot;50gb&quot; } }" />
        <div v-if="roLintErrors.length" role="alert" class="lc-lint lc-lint-err">
          <span>DSL 检查（错误）：{{ roLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
        <div v-else-if="roLintWarns.length" role="status" class="lc-lint lc-lint-warn">
          <span>DSL 检查：{{ roLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
        <div class="lc-actions">
          <!-- G121：roPending 守卫+spinning+文案切换（修前无守卫连点可重复触发；
 dry/run 分档让触发钮各自改用，互斥共用一档防并发，729 G95/731 G104/733 G110 同款） -->
          <button v-if="canRollover" class="btn ghost sm" @click="doRollover(true)" :disabled="!rolloverAlias.trim() || roPending !== null">
            <Search :size="12" :class="{ spinning: roPending === 'dry' }" /> {{ roPending === 'dry' ? '预检中…' : 'Dry Run 预检' }}
          </button>
          <button v-if="canRollover" class="btn primary sm" @click="doRollover(false)" :disabled="!rolloverAlias.trim() || roPending !== null">
            <Rocket :size="12" :class="{ spinning: roPending === 'run' }" /> {{ roPending === 'run' ? '执行中…' : '执行 Rollover' }}
          </button>
          <!-- 原始 IO 快查——本页最近一次 rollover（含 dry-run）请求/响应原文
 （ioRecorder 记录环；下方「原始响应」details 的快查姊妹钮，545 Adhoc 先例 margin-left:auto） -->
          <button class="btn ghost sm" style="margin-left:auto" data-test="raw-io" aria-label="查看原始 IO（Rollover）" title="最近一次 Rollover（含 Dry-run）请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoRollover"><Terminal :size="12" /> 原始 IO</button>
        </div>
        <!-- 结构化结果：真实 rollover 展示新旧索引切换 + 跳转；dry-run 展示条件命中 -->
        <div v-if="rolloverInfo" class="lc-ro">
          <div v-if="rolloverInfo.new_index" class="lc-ro-ok">
            已切换到新索引 <b class="mono">{{ rolloverInfo.new_index }}</b>（旧索引 <span class="mono">{{ rolloverInfo.old_index }}</span> 转为只读）
          </div>
          <div v-if="rolloverInfo.new_index" class="lc-ro-act">
            <button class="btn sm" @click="router.push('/indices?idx=' + encodeURIComponent(rolloverInfo.new_index))">打开新索引工作区</button>
            <button class="btn sm ghost" @click="router.push('/aliases')">看别名图</button>
          </div>
          <div v-if="rolloverInfo.conditions" class="lc-ro-cond">
            <div v-for="(v, k) in rolloverInfo.conditions" :key="k" :style="{ color: v ? 'var(--ok)' : 'var(--tx2)' }">
              {{ v ? '✓ 命中' : '✗ 未命中' }} — {{ k }}
            </div>
          </div>
        </div>
        <!-- 原始响应裸 pre → highlightJson 高亮收口（json-view 全站范式）；
 错误分支换 errPreHtml v-html（前缀移除后全文含 { 走 highlightJson、否则转义平文） -->
        <details v-if="rolloverResult" class="lc-raw">
          <summary>原始响应</summary>
          <pre v-if="rolloverResultIsErr" class="lc-result" v-html="rolloverResultHtml"></pre>
          <pre v-else class="lc-result json-view" v-html="rolloverResultHtml"></pre>
        </details>
      </div>
    </div>

    <div class="lc-panel">
      <div class="lc-panel-tt">
        <GitBranch :size="12" /> ILM 阶段甘特（{{ policies.length }} 个策略）
        <span class="lc-sub">水平条按 min_age 时序排列</span>
      </div>
      <!-- ：首载骨架 → 真空 EmptyState（与 loadErr 互斥，失败不是空） → 甘特；err-bar 在页顶链外 -->
      <div v-if="busy && !policies.length" class="lc-sk">
        <SkeletonBox v-for="i in 3" :key="i" height="30px" round />
      </div>
      <!-- 空态给下一步动作（S6 归位 EmptyState 三件套）——去 ILM 控制中心看能力探测与创建入口 -->
      <EmptyState
        v-else-if="!policies.length && !loadErr"
        :icon="Layers"
        text="暂无 ILM 策略，或集群不支持 ILM"
        hint="到 ILM 控制中心确认能力探测结果，或经 REST 控制台创建策略"
        action-text="去 ILM 控制中心确认"
        @action="router.push('/ilm')"
      />
      <!-- 甘特条/图例 phase 中文化（phaseZh 单源，IlmView explain 徽章「中文主体+
 英文小字」双语范式参照）。条内宽度二选一裁定（目测）：bar 最窄 8%（fmtPolicies
 widthPct 下限）× track 约 600px ≈ 48px，中文「删除/冻结」1-2 字（≤24px）比英文裸串
 （delete 6 字符 mono ≈ 43px）更窄——条内亦收中文不溢出，title 恒双语「中文（english）」兜底 -->
      <div v-else-if="policies.length" class="lc-gantt">
        <div v-for="p in policies" :key="p.name" class="lc-gantt-row" tabindex="0"
          @contextmenu.prevent="openLcMenu($event, p)" @keydown="onLcMenuKey($event, p)" data-row-nav @keydown.self="rowArrowNav">
          <div class="lc-gantt-label" :title="p.name">{{ p.name }}</div>
          <div class="lc-gantt-track">
            <div v-for="ph in p.phases" :key="ph.name" class="lc-gantt-bar" :class="'ph-' + ph.name"
              :style="{ left: ph.leftPct + '%', width: ph.widthPct + '%' }"
              :title="`${phaseZh(ph.name) || ph.name}（${ph.name}） · min_age: ${ph.minAge}`">
              <span>{{ phaseZh(ph.name) || ph.name }}</span><em v-if="ph.ageSec > 0" class="lc-gantt-age">{{ ph.minAge }}</em>
            </div>
          </div>
        </div>
      </div>
      <!-- 图例 phase 中文（phaseZh 主显，图例空间充裕必收中文；未知枚举回落英文） -->
      <div class="lc-legend">
        <span><i class="ph-hot"></i>{{ phaseZh('hot') || 'hot' }}</span>
        <span><i class="ph-warm"></i>{{ phaseZh('warm') || 'warm' }}</span>
        <span><i class="ph-cold"></i>{{ phaseZh('cold') || 'cold' }}</span>
        <span><i class="ph-frozen"></i>{{ phaseZh('frozen') || 'frozen' }}</span>
        <span><i class="ph-delete"></i>{{ phaseZh('delete') || 'delete' }}</span>
      </div>
    </div>

    <div class="lc-panel">
      <div class="lc-panel-tt">
        <FastForward :size="12" /> 手动推进 ILM 到指定 step
        <span class="lc-sub">POST /_ilm/move/&lt;index&gt;</span>
      </div>
      <div class="lc-move">
        <!-- 同 rollover——PickCurrentIdxBtn 合并（@pick 显式覆盖口） -->
        <div class="lc-idx-row">
          <IndexPicker v-model="moveIndex" placeholder="索引名" />
          <PickCurrentIdxBtn @pick="moveIndex = store.pickedIdx" />
        </div>
        <div v-if="curStepInfo" class="lc-curstep">{{ curStepInfo }}（已自动预填，可改）</div>
        <!-- phase/action 四输入挂 datalist 候选（phase 值域=esEnumZh ILM_PHASE_ZH
 五键、action 值域=新增 ILM_ACTION_ZH 官方九动作，二者是闭词汇域稳挂）；step 是随
 策略/动作组合而异的开放域（complete 等 cryptic 标识），值域不稳不挂下拉。
 六 input 各补 :title 中文释义（phase/action 候选域双语，step 说明预填通道） -->
        <datalist id="ilm-phase-opts"><option v-for="(zh, k) in ILM_PHASE_ZH" :key="k" :value="k">{{ zh }}</option></datalist>
        <datalist id="ilm-action-opts"><option v-for="(zh, k) in ILM_ACTION_ZH" :key="k" :value="k">{{ zh }}</option></datalist>
        <div class="lc-move-row">
          <span>current</span>
          <input v-model="curPhase" placeholder="阶段（如 hot）" class="lc-inp-sm" list="ilm-phase-opts" :title="'ILM 生命周期阶段（hot 热 / warm 温 / cold 冷 / frozen 冻结 / delete 删除）'" />
          <input v-model="curAction" placeholder="动作名" class="lc-inp-sm" list="ilm-action-opts" :title="'ILM 动作名（下拉候选=官方九动作：forcemerge 强制合并段 / shrink 收缩分片 / allocate 调整副本分配 / rollover 滚动 / delete 删除 / set_priority 恢复优先级 / unfollow 解除跟随 / searchable_snapshot 可搜索快照 / downsample 降采样）'" />
          <input v-model="curStep" placeholder="step 名" class="lc-inp-sm" :title="'ILM 内部 step 标识（随策略与动作组合而异，候选域不稳未挂下拉；选索引后自动预填当前值）'" />
        </div>
        <div class="lc-move-row">
          <span>next →</span>
          <input v-model="nextPhase" placeholder="阶段（如 warm）" class="lc-inp-sm" list="ilm-phase-opts" :title="'ILM 生命周期阶段（hot 热 / warm 温 / cold 冷 / frozen 冻结 / delete 删除）'" />
          <input v-model="nextAction" placeholder="动作名" class="lc-inp-sm" list="ilm-action-opts" :title="'ILM 动作名（下拉候选=官方九动作：forcemerge 强制合并段 / shrink 收缩分片 / allocate 调整副本分配 / rollover 滚动 / delete 删除 / set_priority 恢复优先级 / unfollow 解除跟随 / searchable_snapshot 可搜索快照 / downsample 降采样）'" />
          <input v-model="nextStep" placeholder="step 名" class="lc-inp-sm" :title="'ILM 内部 step 标识（随策略与动作组合而异，候选域不稳未挂下拉；选索引后自动预填当前值）'" />
        </div>
        <div class="lc-actions">
          <!-- G123：推进钮补 mvPending 守卫+spinning+文案（随 G121 同修同验） -->
          <button v-if="canMove" class="btn primary sm" @click="doMove" :disabled="!moveIndex.trim() || mvPending">
            <FastForward :size="12" :class="{ spinning: mvPending }" /> {{ mvPending ? '推进中…' : '推进' }}
          </button>
          <!-- 原始 IO 快查（explain 通道）——选索引自动预填的 ilm/explain 记录
 （data-test 双钮第②钮，548 QueryXray raw-io-tv 先例；explain 为只读预检全角色可用） -->
          <button class="btn ghost sm" style="margin-left:auto" data-test="raw-io-lc-explain" aria-label="查看原始 IO（ILM explain）" title="最近一次 ILM explain（选索引自动预填当前 step）请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIoExplain"><Terminal :size="12" /> 原始 IO</button>
        </div>
        <!-- 同 rollover——JSON 响应走 highlightJson；：错误分支换 errPreHtml v-html -->
        <template v-if="moveResult">
          <pre v-if="moveResultIsErr" class="lc-result" v-html="moveResultHtml"></pre>
          <pre v-else class="lc-result json-view" v-html="moveResultHtml"></pre>
        </template>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取 rollover / explain 各自最近一条记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1169：甘特策略行右键——此前这条列表只能「看」，想拿策略名或阶段表只能手抄。
         一级只放高频两项，其余复制动作收进二级（与表格/卡片右键同语言）。 -->
    <CellContextMenu v-if="lcMenu" :x="lcMenu.x" :y="lcMenu.y"
      :title="'ILM 策略 · ' + lcMenu.p.name" :items="lcMenuItems" @close="lcMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Shield, Layers, RefreshCw, PlayCircle, PauseCircle, Rocket, Search, GitBranch, FastForward, Terminal, Copy, Braces, ListOrdered } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import IndexPicker from '../components/IndexPicker.vue';
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件（*/
import { askConfirm } from '../composables/confirm';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import JsonArea from '../components/JsonArea.vue';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：状态徽标统一件（全站最后一个私造胶囊合并） */
import { friendlyEsError } from '../utils/esError';
import { highlightJson } from '../utils/jsonc';
import { errPreHtml } from '../utils/errPre'; /* ：错误分支 pre v-html 内核 */
import { useTierCycle } from '../composables/useTierCycle'; /* ：编辑框高度档记忆；合并 */
import { lintClause } from '../utils/dslLint'; /* ：rollover 条件结构体检 */
import { phaseZh, ILM_PHASE_ZH, ILM_ACTION_ZH } from '../utils/esEnumZh'; /* ：甘特/图例 phase 中文（esEnumZh 单源）；：move 弹窗 datalist 候选域 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：划线注入防抖统一件 */
import { removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();

/* 1169：甘特策略行右键菜单（只读数据 → 只给「看/抄」两类动作，不含写） */
const lcMenu = ref<{ x: number; y: number; p: any } | null>(null);
function openLcMenu(e: MouseEvent, p: any) {
  lcMenu.value = { x: e.clientX, y: e.clientY, p };
}
function onLcMenuKey(e: KeyboardEvent, p: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  lcMenu.value = { ...menuKeyAnchor(e), p };
}
const lcMenuItems = computed<CcmItem[]>(() => {
  const m = lcMenu.value; if (!m) return [];
  const p = m.p;
  const phases = (p.phases || []) as any[];
  const phaseLine = (ph: any) => `${phaseZh(ph.name) || ph.name}（${ph.name}） min_age=${ph.minAge}`;
  return [
    { key: 'lc-copy-name', label: '复制策略名', icon: Copy, run: async () => {
      const ok = await copyText(String(p.name || ''));
      store.notify(ok ? 'success' : 'error', ok ? '已复制策略名：' + p.name : '复制失败');
    } },
    { key: 'lc-copy-json', label: '复制整条策略 JSON', icon: Braces, run: async () => {
      const ok = await copyText(JSON.stringify(p, null, 2));
      store.notify(ok ? 'success' : 'error', ok ? '策略 JSON 已复制' : '复制失败');
    } },
    {
      key: 'lc-copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'lc-copy-phase', label: '复制阶段表（每行：中文（english） min_age）', icon: ListOrdered, run: async () => {
          const txt = phases.map(phaseLine).join('\n');
          const ok = await copyText(txt);
          store.notify(ok ? 'success' : 'error', ok ? `已复制 ${phases.length} 个阶段` : '复制失败');
        } },
        { key: 'lc-copy-phase-en', label: '复制阶段英文原名（逗号分隔）', icon: Braces, run: async () => {
          const txt = phases.map((ph: any) => ph.name).join(',');
          const ok = await copyText(txt);
          store.notify(ok ? 'success' : 'error', ok ? '已复制阶段序列' : '复制失败');
        } },
      ],
    },
  ].filter(Boolean) as CcmItem[];
});
/* 权限门禁——ILM 起停/rollover/move step=/cluster/ilm/start|stop|move、/cluster/rollover=CLUSTER 档（rank3+）；
 甘特图/explain 全角色可用；本页写门统一按 lifecycle 页 start 端点做连接感知裁决 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/start', store.target));
/* 「推进」走共享写端点 ilm/move（归属 ilm | lifecycle 两页）：只看 ilm/start 会把
   持 w:ilm 的授权人挡在按钮外，而其后端实际允许——按真实端点判定，与执行门同源。 */
const canMove = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/ilm/move', store.target));
/* Rollover 是 /cluster/rollover（页归属 lifecycle，rank3），与 ilm/start 的共享页集不同：
   只持 w:cluster-settings 的人能调 ilm/start 但**不能** rollover——复用 canOps 会亮一个必 403 的钮。 */
const canRollover = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/rollover', store.target));
/* ILM start/stop 是集群级动作（作用于目标集群全部索引）：连接模型下页面写键短路角色门，
   后端要求 rank3 或该连接的 cluster-settings 写键，前端必须同源——否则 rank2 的
   w:lifecycle 持有人看见可点、点下去 403。 */
const canClusterScope = computed(() => auth.canClusterScope(store.target));
const ilmScopeHint = computed(() => canClusterScope.value
  ? '集群级开关：启动/停止目标集群的 ILM 执行'
  : '集群级动作需 rank3 角色（CLUSTER_OP / REBUILD_OP / AUDIT_OP）或该连接的「集群设置」写权限；单索引 rollover 与推进步骤仍可用');
const router = useRouter();
const busy = ref(true); /* ：初值 true——首帧即骨架，不闪「无策略」空态 */
const ilmOpPending = ref(false); /* 复审 M4：start/stop 写操作防重入——in-flight 期间按钮禁用 + 重入直接返回，杜绝双击双发 */
/* G121/G123：rollover 与 move 写操作在途档（铁律 D 在途可感知）——
 rollover 按 dry/run 分档（触发钮文案/图标各自改用），互斥共用一档防并发；move 单档 */
const roPending = ref<'dry' | 'run' | null>(null);
const mvPending = ref(false);
const ilmSts = ref<any>(null);
const policies = ref<any[]>([]);
const loadErr = ref('');  /* 策略源失败（err-bar 页顶独立） */
const stsErr = ref('');   /* 状态徽标源失败（页头记名降级）——双源各立错误位（ 教训） */

/* 操作参数进草稿——别名/条件/六项 phase-action-step 切页/刷新不丢 */
const rolloverAlias = useScopedDraft('rollover-alias', { route: 'lifecycle' }, '').text;
const rolloverCond = useScopedDraft('rollover-cond', { route: 'lifecycle' }, '{\n  "conditions": {\n    "max_docs": 100000,\n    "max_age": "7d",\n    "max_size": "50gb"\n  }\n}').text;const rolloverResult = ref('');
const rolloverInfo = ref<any>(null);
/* 条件编辑框高度三档行数循环 + usePref 跨会话记忆（ra.scriptH 同款形态；
 走 JsonArea 既有 rows 写法，默认档 4 行不变）。
 TIERS+usePref+手写 cycle 三件套合并 useTierCycle 单源
 （lifecycle.roH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const RO_H_TIERS = [4, 10, 18];
const { v: roH, cycle: cycleRoH } = useTierCycle('lifecycle.roH', RO_H_TIERS);
/* rollover 条件 lintClause 零 ctx 结构体检——实地核形态：该 JSON 是 rollover 完整 body
 （{conditions:{…}} 包裹）非 search body 也非裸查询子句，lintDsl 根级规则（root-key-typo 等）
 必误报 conditions，走裸子句出口（skipRoot 跳根级 search-body 规则、键级规则全保留）零误报；
 fields 传 []（无 mapping 语义，纯结构规则）；JSON 非法静默（JsonArea 圆点已报） */
const roLint = computed(() => {
  try { return lintClause(JSON.parse(rolloverCond.value || ''), { fields: [] }); }
  catch { return []; }
});
const roLintErrors = computed(() => roLint.value.filter(f => f.severity === 'error'));
const roLintWarns = computed(() => roLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
/* lint findings 同步注入编辑器划线（SearchSandboxView canonical 挂法：JsonArea
 ref + watch 输入 → 防抖 setMarkers；severity info→hint 降级——MonacoEditor marker 档只收
 warning/hint/error；JSON 非法时 roLint 为空即无划线，圆点报错通道不变）。
 下方 lc-lint 行内提示条 banner 保留，行内条与划线双轨并存 */
const roJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueRoLintMarkers = useDebounceFn(() => {
  roJaRef.value?.setMarkers?.(roLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(rolloverCond, () => { queueRoLintMarkers(); }, { immediate: true });
/* 原始响应裸 pre → highlightJson 高亮（输出已转义，v-html 安全）。
 「错误：」前缀判型退役（消脆弱前缀）——doRollover/doMove 失败路径改为
 直接存原始错误全文（前缀移除，DevToolsView 语义色轮同口径：前缀会破坏着色侦测），
 判型改稳判：JSON.parse 成功且含 error 键 = ES 错误 JSON；parse 失败 = 错误平文；
 parse 成功无 error 键 = 成功响应。 */
function resultLooksErr(s: string): boolean {
  if (!s) return false;
  try {
    const o = JSON.parse(s) as unknown;
    return o !== null && typeof o === 'object' && 'error' in (o as Record<string, unknown>);
  } catch { return true; }
}
const rolloverResultIsErr = computed(() => resultLooksErr(rolloverResult.value));
/* 错误分支走 errPreHtml（含 { 走 highlightJson 着色、否则转义平文），成功分支保持 highlightJson */
const rolloverResultHtml = computed(() =>
  rolloverResultIsErr.value ? errPreHtml(rolloverResult.value) : highlightJson(rolloverResult.value));

/* W4c：moveIndex 并入既有 move-form 草稿（此前游离 ref，切页/刷新独丢）——
 computed 桥接，模板/watch/确认文案真相读写零改动 */
const moveForm = useScopedDraftState('move-form', { route: 'lifecycle' }, {
  moveIndex: '',
  curPhase: 'hot', curAction: 'complete', curStep: 'complete',
  nextPhase: 'warm', nextAction: 'complete', nextStep: 'complete',
}).state;
const moveIndex = computed({
  get: () => moveForm.value.moveIndex as string,
  set: (v: string) => { moveForm.value.moveIndex = v; },
});
/* 一次性回填顶栏选中（对齐 Xmigrate 口径）：仅空时回填——不改用户已输/草稿恢复值；
 写类视图不做持续 follow（ 白名单口径，防「A 的 move 目标被顶栏切换悄悄改掉」），
 要换目标由用户显式改输入 */
if (!moveForm.value.moveIndex && store.pickedIdx) {
  moveForm.value.moveIndex = store.pickedIdx;
  /* G124：回填是同步赋值且早于下方 watch 注册——watch 看不到这次变更，
 回填链上 explain 零发/六输入保持默认（ A0 实锚）；显式补发预填。
 KeepAlive 重挂不重跑 setup=不重触；草稿恢复值不自动预填语义不变 */
  prefillCurStep(store.pickedIdx);
}
const curPhase = computed({ get: () => moveForm.value.curPhase as string, set: (v: string) => { moveForm.value.curPhase = v; } });
const curAction = computed({ get: () => moveForm.value.curAction as string, set: (v: string) => { moveForm.value.curAction = v; } });
const curStep = computed({ get: () => moveForm.value.curStep as string, set: (v: string) => { moveForm.value.curStep = v; } });
const nextPhase = computed({ get: () => moveForm.value.nextPhase as string, set: (v: string) => { moveForm.value.nextPhase = v; } });
const nextAction = computed({ get: () => moveForm.value.nextAction as string, set: (v: string) => { moveForm.value.nextAction = v; } });
const nextStep = computed({ get: () => moveForm.value.nextStep as string, set: (v: string) => { moveForm.value.nextStep = v; } });
const moveResult = ref('');
const moveResultIsErr = computed(() => resultLooksErr(moveResult.value));
/* 错误分支走 errPreHtml（判型稳判见 resultLooksErr），成功分支保持 highlightJson */
const moveResultHtml = computed(() =>
  moveResultIsErr.value ? errPreHtml(moveResult.value) : highlightJson(moveResult.value));
const curStepInfo = ref('');

/* 选索引后预填当前 ILM step（ilm/explain 已有）：phase/action/step 是 cryptic 内部标识，手填易错。
 G124：抽出共用函数供 watch 与一次性回填两路调用（回填同步赋值早于 watch 注册，
 watch 恒看不到那次变更——回填处显式补发） */
function prefillCurStep(i: string) {
  api.ilmExplain(i).then((r: any) => {
    if (moveIndex.value.trim() !== i) return; // 输入已改：旧索引预填慢包丢弃（预填值直进推进请求体，回跳即错发）
    const info = r?.indices?.[i] || r;
    if (!info?.phase) return;
    curPhase.value = info.phase || 'hot';
    curAction.value = info.action || 'complete';
    curStep.value = info.step || 'complete';
    curStepInfo.value = `当前所处：${info.phase} / ${info.action} / ${info.step}`;
  }).catch(() => { /* 无 ILM 策略时保留手动输入 */ });
}
watch(moveIndex, (idx) => {
  curStepInfo.value = '';
  const i = idx.trim();
  if (!i) return;
  prefillCurStep(i);
});

const PHASE_ORDER = ['hot', 'warm', 'cold', 'frozen', 'delete'];

function parseAge(s: string | undefined): number {
  if (!s) return 0;
  const m = /(\d+)([smhdMy])/.exec(s);
  if (!m) return 0;
  const n = +m[1]; const u = m[2];
  const map: any = { s: 1, m: 60, h: 3600, d: 86400, M: 86400 * 30, y: 86400 * 365 };
  return n * (map[u] || 1);
}

function fmtPolicies(raw: any) {
  const list: any[] = [];
  /* G4-A1：后端契约是数组 [{name, policy, ...}]（EsIndexAdmin.listIlmPolicies 把策略名塞进 row.name）——
 此前 Object.entries(数组) 把下标当策略名，甘特标签全部渲染成 0/1/2…
 复审 M1/M2：删不可达的映射兼容分支（同仓后端恒定数组、api 类型 get<any[]>）；
 name 缺失兜底带下标——空串会空甘特 label 且 :key 碰撞 */
  const entries: [string, any][] = (Array.isArray(raw) ? raw : [])
    .map((row: any, i: number) => [String(row?.name || `(未命名#${i})`), row]);
  for (const [name, def] of entries) {
    const policy = def?.policy || def;
    const phases = policy?.phases || {};
    const rows: any[] = [];
    for (const ph of PHASE_ORDER) if (phases[ph]) rows.push({ name: ph, minAge: phases[ph].min_age || '0s', ageSec: parseAge(phases[ph].min_age || '0s') });
    list.push({ name, phases: rows });
  }
  /* 共享时间轴：所有策略统一按全局最大 min_age 归一——此前每策略各自 maxAge 归一，跨策略长度不可比 */
  const globalMax = Math.max(1, ...list.flatMap((p: any) => p.phases.map((r: any) => r.ageSec)));
  for (const p of list) {
    const rows = p.phases;
    for (let i = 0; i < rows.length; i++) {
      rows[i].leftPct = rows[i].ageSec / globalMax * 100;
      const next = rows[i + 1];
      rows[i].widthPct = next ? (next.ageSec - rows[i].ageSec) / globalMax * 100 : 100 - rows[i].leftPct;
      if (rows[i].widthPct < 8) rows[i].widthPct = 8;
    }
  }
  return list;
}

async function load() {
  busy.value = true;
  try {
    /* ：双源各立错误位，不再 .catch(() => null/[]) 静默吞错（ 禁静默 + 伪装空态）——
 策略失败出 err-bar（保留旧甘特），状态失败页头记名；成功路径清各自 err 位 */
    const [sts, pols] = await Promise.all([
      api.ilmStatus().then(r => { stsErr.value = ''; return r; })
        .catch((e: any) => {
          stsErr.value = friendlyEsError(String(e?.message ?? e));
          store.notify('error', 'ilm/status: ' + stsErr.value);
          return null;
        }),
      api.ilmPolicies().then(r => { loadErr.value = ''; return r; })
        .catch((e: any) => {
          loadErr.value = 'ILM 策略拉取失败：' + friendlyEsError(String(e?.message ?? e));
          store.notify('error', 'ilm/policies: ' + loadErr.value);
          return null;
        }),
    ]);
    if (sts) ilmSts.value = sts;
    if (pols) policies.value = fmtPolicies(pols);
  } finally { busy.value = false; }
}

/* G4-B5：原无 catch——失败是 unhandled rejection 零反馈；手动写操作 toast 透传即达标（G1/ 裁定），重跑即重试
 复审 M4：ilmOpPending 防重入——in-flight 期间重入直接返回（配合按钮 :disabled），finally 复位 */
async function ilmStart() {
  if (!canOps.value) { store.notify('warning', 'ILM 操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (!canClusterScope.value) { store.notify('warning', ilmScopeHint.value); return; }
  if (ilmOpPending.value) return;
  /* 与「停止」和命令面板同一安全档：启动会恢复 rollover/过期删除等自动动作，
     误点一下就可能触发全量索引的级联推进——必须先确认（原先只有停止有确认，不对称）。 */
  if (!await askConfirm({
    title: '启动 ILM 引擎',
    level: 'warn',
    okText: '启动引擎',
    message: '所有索引的生命周期策略将恢复自动推进：rollover / shrink / forcemerge / delete 等动作会按策略触发，可能删除已过期索引。',
  })) return;
  if (ilmOpPending.value) return;
  ilmOpPending.value = true;
  try {
    await api.ilmStart();
    store.notify('success', 'ILM 引擎已启动，策略恢复推进');
    load();
  } catch (e: any) {
    store.notify('error', 'ILM 启动失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（前缀动作词保留，protectThreeState 锁面零触） */
  } finally { ilmOpPending.value = false; }
}
async function ilmStop() {
  if (!canOps.value) { store.notify('warning', 'ILM 操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (!canClusterScope.value) { store.notify('warning', ilmScopeHint.value); return; }
  if (ilmOpPending.value) return;
  if (!await askConfirm({ title: '停止 ILM 引擎', level: 'warn', okText: '停止引擎', message: '所有索引的生命周期策略将暂停推进（rollover/收缩/删除等动作不再触发），可随时重新启动恢复。' })) return;
  if (ilmOpPending.value) return; /* 确认等待期间另一写操作可能已开始 */
  ilmOpPending.value = true;
  try {
    await api.ilmStop();
    store.notify('success', 'ILM 引擎已停止，策略推进暂停');
    load();
  } catch (e: any) {
    store.notify('error', 'ILM 停止失败：' + friendlyEsError(String(e?.message ?? e))); /* ：同上 */
  } finally { ilmOpPending.value = false; }
}

async function doRollover(dryRun: boolean) {
  /* Dry Run 同样走 /cluster/rollover（rank3 写端点）——按钮 v-if 之外执行体单源守卫 */
  if (!canRollover.value) { store.notify('warning', 'Rollover 需要 lifecycle 页写权限'); return; }
  if (roPending.value) return; /* G121：入口防重入（dry-run 无确认门更要挡连点） */
  // 非 dry-run 会真实创建新索引并切换别名，强制确认
  if (!dryRun && !await askConfirm({
    title: '真实 Rollover',
    message: `将对别名「${rolloverAlias.value}」执行真实 Rollover：创建新索引并将写入目标切到新索引，旧索引不再接受写入。此操作不可自动回退，建议先用 Dry-run 预演。`,
    okText: '执行 Rollover',
  })) return;
  if (roPending.value) return; /* 确认等待期间另一执行可能已开始（ilmStop 同款口径） */
  roPending.value = dryRun ? 'dry' : 'run';
  try {
    const body = rolloverCond.value.trim() || undefined;
    const r = await api.rolloverAlias(rolloverAlias.value, body, dryRun);
    rolloverResult.value = JSON.stringify(r, null, 2);
    rolloverInfo.value = r;
    if (dryRun) store.notify('success', 'Dry Run 完成');
    else store.notify('success', 'Rollover 完成');
  } catch (e: any) {
    /* 「错误：」前缀移除（DevToolsView 语义色轮口径）——判型已改 resultLooksErr 稳判，
 前缀不再需要且会破坏 errPreHtml 的 JSON 着色侦测 */
    rolloverResult.value = String(e?.message || e);
    store.notify('error', 'Rollover 失败：' + friendlyEsError(String(e?.message ?? e))); /* ：裸 err → friendlyEsError（前缀保留） */
  } finally { roPending.value = null; }
}

async function doMove() {
  if (!canMove.value) { store.notify('warning', '推进步骤需要 ilm 或 lifecycle 页写权限'); return; }
  if (mvPending.value) return; /* G123：入口防重入 */
  // ILM move-step 为高危操作：跳步可能直接触发收缩/删除等动作，critical 级输入守卫
  if (!await askConfirm({
    title: '强制推进 ILM 步骤',
    level: 'critical', guardText: moveIndex.value,
    message: `将强制推进索引「${moveIndex.value}」的生命周期：${curPhase.value}/${curAction.value}/${curStep.value} → ${nextPhase.value}/${nextAction.value}/${nextStep.value}。跳步可能直接触发收缩、冻结甚至删除动作，不可回退。`,
    okText: '强制推进',
  })) return;
  if (mvPending.value) return; /* 确认等待期间另一次推进可能已开始（ilmStop 同款口径） */
  mvPending.value = true;
  try {
    const body = {
      current_step: { phase: curPhase.value, action: curAction.value, name: curStep.value },
      next_step: { phase: nextPhase.value, action: nextAction.value, name: nextStep.value },
    };
    const r = await api.ilmMove(moveIndex.value, JSON.stringify(body));
    moveResult.value = JSON.stringify(r, null, 2);
    if (r?.available === false) store.notify('warning', '不可用：' + (r.reason || ''));
    else store.notify('success', '已推进');
  } catch (e: any) {
    /* 「错误：」前缀移除（同 doRollover——判型稳判后前缀破坏着色侦测） */
    moveResult.value = String(e?.message || e);
    store.notify('error', '迁移步骤失败：' + friendlyEsError(String(e?.message ?? e))); /* ：同上 */
  } finally { mvPending.value = false; }
}

onMounted(() => {
  /* 命令面板「Rollover Dry Run」预填接收 */
  const prefill = sessionStorage.getItem('esquerystudio.lifecycle.rollover');
  if (prefill) {
    removeStoredRaw(sessionStorage, 'esquerystudio.lifecycle.rollover');
    rolloverAlias.value = prefill;
  }
  load();
});

/* 原始 IO 快查（548 QueryXray 双钮先例）——rollover / ilm explain 两通道各取各的
 记录（前缀互不混淆）；判空 rec=null 时 notify 引导，不开空弹窗。共用同一弹窗宿主
 rawIoShow/rawIoRec，先后点开互不残留 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIoRollover() {
  const rec = ioRecorder.last('/cluster/rollover');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
function openRawIoExplain() {
  const rec = ioRecorder.last('/cluster/ilm/explain');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
.lc-page { padding: var(--sp-2) var(--sp-3); }
/* 页头旧壳四条死规则删（PageHeader 合并后同族漏删，模板零引用；
 副题行与右组钮容器两条活规则保留——模板消费在场，733 同族） */
.lc-hd-sub { font-size: var(--fs-xs); color: var(--muted); }
/* 状态 b 改用 StatusPill 统一件（胶囊观感/色档归组件单源），本页无值色胶水 */
.lc-hd-r { display: flex; gap: var(--sp-2); }

/* 轨4：lc-panel 面板壳（bg+border+radius）退役 → io-cur/io-recs 538 同款
 border-top 分节（原 margin-bottom 间距载体原样保留）；lc-panel-tt 行首横排档不动 */
.lc-panel { border-top: 1px solid var(--line); padding-top: var(--sp-2); margin-bottom: var(--sp-3); }
.lc-panel-tt { font-size: var(--fs-xs); font-weight: 600; display: flex; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-2); }
.lc-panel-tt .lc-sub { font-weight: 400; color: var(--muted); font-size: var(--fs-xs); margin-left: var(--sp-2); }

.lc-rollover, .lc-move { display: flex; flex-direction: column; gap: var(--sp-2); }
/* lc-idx-row——IndexPicker 与 PickCurrentIdxBtn 同行横排（AdhocRebuild idxRowEl
 同款形态；width="100%" 内联宽由 flex:1 承接，满宽行为等值零变动） */
.lc-idx-row { display: flex; align-items: center; gap: var(--sp-1h); }
.lc-idx-row :deep(.ixp) { flex: 1; min-width: 0; }
/* rollover 辅助编辑器外框退役（约定③；RankDebugView rd-card-ed 先例同语言）——
 JsonArea 自带 border+radius 壳退掉，分节流分界已归 lc-panel border-top；
 rows 三档定高不随容器伸缩，不接 flex 链（rd 先例的 flex:1 属其编辑卡弹性语境） */
.lc-rollover :deep(.ja) { border: none; border-radius: 0; }
/* rollover 条件 lint 体检提示条（.alv-lint 同构）；行数档走 JsonArea 既有 rows 写法，无容器层 */
.lc-lint { display: flex; flex-direction: column; gap: var(--sp-0); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-s); font-size: var(--fs-xs); line-height: 1.5; }
.lc-lint-warn { background: var(--warn-soft); color: var(--warn); }
.lc-lint-err { background: var(--err-soft); color: var(--err); }
.lc-inp-sm { padding: 3px var(--sp-1h); font-size: var(--fs-xs); font-family: var(--mono); border: 1px solid var(--border); border-radius: 3px; background: var(--panel-2); color: var(--fg); flex: 1; }
.lc-actions { display: flex; gap: var(--sp-2); }
/* 200px 定高 → 42vh 弹性档（240px 保底略升，矮屏可用性优先） */
.lc-result { margin: var(--sp-2) 0 0; padding: var(--sp-2); background: var(--panel-2); border-radius: var(--r-xs); font-family: var(--mono); font-size: var(--fs-xs); max-height: max(240px, 42vh); overflow: auto; white-space: pre-wrap; }
.lc-ro-ok { font-size: var(--fs-sm); color: var(--ok); margin-top: var(--sp-2); }
.lc-ro-act { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.lc-ro-cond { margin-top: var(--sp-2); font-size: var(--fs-sm); display: flex; flex-direction: column; gap: 3px; }
.lc-curstep { margin-top: var(--sp-1); font-size: var(--fs-xs); color: var(--ac-hi); }
.lc-raw { margin-top: var(--sp-2); }
.lc-raw summary { font-size: var(--fs-xs); color: var(--muted); }

.lc-sk { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-1) 0; }
.lc-gantt { display: flex; flex-direction: column; gap: var(--sp-2); max-height: 320px; overflow-y: auto; padding: var(--sp-1); }
.lc-gantt-row { display: flex; gap: var(--sp-2); align-items: center; }
.lc-gantt-label { width: 180px; font-family: var(--mono); font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-gantt-track { flex: 1; position: relative; height: 20px; background: var(--panel-2); border-radius: 2px; overflow: hidden; }
.lc-gantt-bar { position: absolute; top: 0; bottom: 0; padding: 3px var(--sp-1h); font-size: var(--fs-xs); color: var(--tx-on-strong); font-family: var(--mono); font-weight: 600; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.lc-gantt-age { font-style: normal; font-size: var(--fs-2xs); opacity: .85; margin-left: var(--sp-1); }
.lc-gantt-bar.ph-hot { background: var(--err); }
.lc-gantt-bar.ph-warm { background: var(--warn); }
.lc-gantt-bar.ph-cold { background: var(--dv-blue); }
.lc-gantt-bar.ph-frozen { background: var(--dv-indigo); }
.lc-gantt-bar.ph-delete { background: var(--dv-slate); }

.lc-legend { display: flex; gap: var(--sp-3); padding: var(--sp-2) var(--sp-1); font-size: var(--fs-xs); color: var(--muted); }
/* 877 对称对齐：色点垂直居中由 align-items 结构承担（BrowserView 健康 seg 同律），
 inline 基线 + vertical-align:-1px 手调补偿退役；点距归 --sp-1 token */
.lc-legend span { display: inline-flex; align-items: center; gap: var(--sp-1); }
.lc-legend i { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; } /* ：phase 色键圆点归一（全站 dot 语言；StatusPill 同构） */
.lc-legend .ph-hot { background: var(--err); }
.lc-legend .ph-warm { background: var(--warn); }
.lc-legend .ph-cold { background: var(--dv-blue); }
.lc-legend .ph-frozen { background: var(--dv-indigo); }
.lc-legend .ph-delete { background: var(--dv-slate); }

.lc-move-row { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--fs-xs); color: var(--muted); }
.lc-move-row > span { width: 60px; }

/* 900 紧凑微调档——页侧距 --sp-3 收 --sp-2；面板标题行（标题+长副题+高度档钮）
 与 move-step 输入行（标签+三输入框）窄容器补 wrap（gap 同轴生效，换行行距免调）。
 本页无宽表，甘特 track flex:1 自收缩，无需横滚兜底 */
@media (max-width: 900px) {
  .lc-page { padding: var(--sp-2); }
  .lc-panel-tt { flex-wrap: wrap; }
  .lc-move-row { flex-wrap: wrap; }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.lc-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
