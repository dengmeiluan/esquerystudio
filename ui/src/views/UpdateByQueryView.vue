<template>
  <div class="uq-page">
    <div class="uq-hd">
      <PageHeader :icon="Recycle" title="Update / Delete by Query" subtitle="按自定义 query 批量更新 / 删除 · 支持 script · 全参数开放 · 默认异步返回 taskId">
        <template #actions>
          <!-- G242：模式组容器补 role=group+aria-label+双钮 aria-pressed
 （QueryXray qx-tabs 753 G192 同款；act 类只管视觉，aria 承语义） -->
          <div class="uq-mode" role="group" aria-label="模式切换：update_by_query / delete_by_query">
            <button class="uq-mode-b" :class="{ act: mode === 'update' }" :aria-pressed="mode === 'update'" @click="mode = 'update'">
              <Pencil :size="12" /> update_by_query
            </button>
            <button class="uq-mode-b danger" :class="{ act: mode === 'delete' }" :aria-pressed="mode === 'delete'"
        :disabled="!canDelete" :title="canDelete ? '' : '当前授权不含删除权限'" @click="canDelete && (mode = 'delete')">
              <Trash2 :size="12" /> delete_by_query
            </button>
          </div>
        </template>
      </PageHeader>
    </div>

    <div class="uq-grid">
      <!-- uq-card 整卡壳退役（bg+border+radius 整块消除，v 约定①）→ uq-sec 只留
 border-top 分节；卡身内衬（框中框双层）随壳一并退役——字段直贴分节，间距归 uq-sec 的
 flex gap（高度链零变动：uq-qcard min-height 280 原样同步更新） -->
      <div class="uq-sec">
        <!-- 卡头位：曾并轨全局 .card-t（13px/650 卡头档），壳退役随之转
 fs-head 行首横排档（PainlessLab .pl-editor-hd 同款：fs-xs 行 + border-bottom 分界，
 底色块本就无） -->
        <div class="uq-card-hd">目标</div>
          <div class="uq-field">
            <!-- G243：八字段 label 补 title 中文悬停释义（铁律 F「不知道这参数
 干什么」即缺陷；ReindexAdvanced 745 G159「参数名：中文说明」形态，label
 文本不动英文留检索；option/placeholder 既有中文覆盖不动） -->
            <label title="索引：批量写的目标索引——支持通配符 pattern（如 logs-*）与逗号分隔多索引（a,b,c），命中即全量生效">索引（支持 pattern，如 logs-* / a,b,c）</label>
            <div class="uq-idx-row">
              <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（「选索引」唯一入口收敛顶栏）；
 写类页不开 useIdxState follow（统一件口径），「用当前索引」回填钮保留（AdhocRebuild 范式） -->
              <CurrentIdxChip />
              <!-- 「用当前索引」一键回填：写类页不开 follow（统一件口径），统一件把顶栏全局
 选中带入目标；不自动执行。：内联钮合并 PickCurrentIdxBtn
 统一件（图标/样式/data-test/title 随件内聚，本页只接 @pick 显式覆盖口） -->
              <PickCurrentIdxBtn @pick="index = store.pickedIdx" />
            </div>
          </div>
          <div class="uq-field">
            <label title="max_docs：本次最多处理的文档数上限——留空不限；适合先小批量试写再全量">max_docs（可选上限）</label>
            <input v-model="maxDocs" class="inp" placeholder="留空 = 不限" />
          </div>
          <div class="uq-field">
            <label title="conflicts：版本冲突策略——默认 abort 遇到版本冲突即中止（可安全重试）；proceed 遇冲突继续（已处理文档不回滚）">conflicts</label>
            <select v-model="conflicts" class="inp">
              <option value="">默认（abort）</option>
              <option value="proceed">proceed（冲突继续）</option>
            </select>
          </div>
          <div class="uq-field">
            <label title="slices：并行分片数——auto 按目标索引分片数自动切分（推荐）；指定数字可提升并行度但占用更多资源">slices（并行分片）</label>
            <input v-model="slices" class="inp" placeholder="auto / 数字" @blur="slicesCheck(slices)" />
            <div v-if="slicesHint" class="il-hint" :class="'il-' + slicesLevel">{{ slicesHint }}</div>
          </div>
      </div>

      <div class="uq-sec">
        <div class="uq-card-hd">节流 / 异步</div>
          <div class="uq-field">
            <label title="wait_for_completion：false（默认）异步执行，立即返回 taskId 可查进度；true 同步阻塞等待完成（大任务易超时）">wait_for_completion</label>
            <select v-model="waitForCompletion" class="inp">
              <option value="false">false（异步：仅返回 taskId）</option>
              <option value="true">true（同步阻塞等待）</option>
            </select>
          </div>
          <div class="uq-field">
            <label title="requests_per_second：每秒处理文档数限流——-1 不限；如 500 = 500 doc/s，控制批量写对集群的写入压力">requests_per_second（限流）</label>
            <input v-model="requestsPerSecond" class="inp" placeholder="-1 = 不限 / 500 = 500 doc/s" @blur="rpsCheck(requestsPerSecond)" />
            <div v-if="rpsHint" class="il-hint" :class="'il-' + rpsLevel">{{ rpsHint }}</div>
          </div>
          <div class="uq-field">
            <label title="refresh：完成后是否刷新索引使变更可搜——默认不刷新（稍后自然可见）；true 立即刷新；wait_for 等刷新完成才返回">refresh</label>
            <select v-model="refresh" class="inp">
              <option value="">默认</option>
              <option value="true">true</option>
              <option value="wait_for">wait_for</option>
            </select>
          </div>
          <div class="uq-field">
            <label title="scroll：批量拉取的滚动窗口时长（如 5m）——控制游标存活时间，大任务设过短会中断">scroll</label>
            <input v-model="scroll" class="inp" placeholder="如 5m" />
          </div>
      </div>

      <div class="uq-sec wide uq-qcard">
        <div class="uq-card-hd">
          <span>Query {{ mode === 'update' ? '+ Script（可选）' : '（必填，防误删）' }}</span>
          <div class="uq-card-hd-r">
            <button class="btn ghost xs" @click="queryStr = ''; scriptSource = ''" :disabled="!queryStr && !bodyStr" title="清空 query 和 script">清空</button>
            <button class="btn ghost xs" @click="loadTpl('match_all')" :disabled="mode === 'delete'">match_all</button>
            <button class="btn ghost xs" @click="loadTpl('term')">term</button>
            <button class="btn ghost xs" @click="loadTpl('range')">range</button>
            <button class="btn ghost xs" @click="loadTpl('bool')">bool</button>
            <button class="btn ghost xs" @click="doFav" :disabled="!bodyStr">
              <Star :size="11" /> 收藏
            </button>
          </div>
        </div>
        <!-- W4c：rows=10 定高 → fill 弹性（AdhocRebuild 手编区同款），.uq-qcard min-height 承接。
 @submit（Ctrl+Enter）接既有 doSubmit（确认门与空 query 守卫都在
 doSubmit 内，键盘路径不绕；painless 编辑器 @execute 先例同款补齐） -->
        <!-- P0-1：编辑器划线通道挂点（黄条 banner 保留双通道，见 script queueUqLintMarkers） -->
        <JsonArea ref="uqJaRef" v-model="queryStr" fill :placeholder="queryPlaceholder" :dsl-assist="uqQueryAssist" @submit="doSubmit" />
        <div v-if="mode === 'update'" class="uq-script">
          <div class="uq-script-hd">Painless Script（可选，与 doc 二选一）<!-- ：直达调试入口 --><router-link class="uq-lab-link" to="/painless-lab">去 Painless Lab 调试</router-link>
            <!-- 脚本面高度档循环钮（SqlConsoleView codeH「高」钮同款形态） -->
            <button class="btn ghost xs" style="margin-left:auto" data-test="ubq-script-h"
              :title="'脚本编辑器高度档：' + scriptH" @click="cycleScriptH">高</button>
          </div>
          <!-- 28vh → 42vh 弹性档 + usePref 记忆（SqlConsole codeH 三档循环同款，
 editorTiers 族口径：st.editorH/qx.taH 先例）。
 painless 面接 assist（uqQueryAssist 同源 fields——脚本里 doc['f']
 hover 与四骨架补全共享查询口字段源） -->
          <MonacoEditor v-model="scriptSource" language="painless" :height="scriptH"
          :dsl-assist="uqQueryAssist"
          @execute="doSubmit" />
        </div>
      </div>

      <!-- 执行前 DSL 静态体检护栏条（占网格整行，贴近执行按钮）。
 警告黄条只提示不拦截；全量删除组合红条同样只提示——放行门仍是既有 askConfirm 确认流程。
 .uq-lint 私造双档改用 theme.css .lint-bar 单源（uq-lint 锚并存，
 grid-column 落位留 scoped；role 语义与文案逐字不动） -->
      <div v-if="fullDeleteWarn" role="alert" class="lint-bar uq-lint lint-bar-err">
        ⚠ delete_by_query + match_all 组合＝<b>全量删除</b>：目标索引命中的全部文档将被真实删除且不可恢复。建议先「预估影响文档数」核对范围再执行。
      </div>
      <div v-else-if="queryLintWarnings.length" class="lint-bar uq-lint lint-bar-warn">
        <span v-for="(f, i) in queryLintWarnings" :key="i" class="uq-lint-item">· {{ f.message }} — {{ f.suggestion }}</span>
      </div>

      <div class="uq-actions">
        <!-- G241：预估钮 Loader2/Search 双态+「预估中…」在途文案（铁律 D；
 768 G238/766 G234/753 G190 族同款——:disabled 之外补 spinning+文案两通道） -->
        <button class="btn ghost sm" @click="loadEstimate" :disabled="estimating">
          <Loader2 v-if="estimating" :size="12" class="spinning" /><Search v-else :size="12" /> {{ estimating ? '预估中…' : '预估影响文档数' }}
        </button>
        <span class="uq-est" v-if="estimateN !== null">
          <b>{{ fmtNum(estimateN) }}</b> 文档匹配
        </span>
        <div class="uq-actions-r">
          <button v-if="canOps" :class="mode === 'delete' ? 'btn sm danger-solid' : 'btn primary sm'" @click="doSubmit"
            :disabled="submitting || !index.trim() || !queryStr.trim()">
            <Send :size="12" /> {{ submitting ? '执行中…' : ('执行 ' + (mode === 'delete' ? '删除' : '更新')) }}
          </button>
          <!-- 表单校验审计：执行门禁用时就近说明原因（索引/query 二缺一），不再只有灰按钮无解释 -->
          <span v-if="canOps && !submitting && (!index.trim() || !queryStr.trim())" class="dim" style="font-size: var(--fs-xs)">
            {{ !index.trim() ? '先选目标索引' : 'query 不能为空（空 query 等价 match_all，会命中整个索引）' }}
          </span>
          <span v-else-if="!canOps" class="dim" style="font-size: var(--fs-xs)">批量写需 REBUILD_OP/ADMIN 角色</span>
        </div>
      </div>

      <!-- G5-B1：写链路失败全文内联面板（对齐 Bulk 批 12b B1）——version_conflict/脚本编译错长文直显，
 限高可滚 + 重试重跑 doSubmit；与结果卡互斥（失败清旧结果，不残留上次成功伪装） -->
      <div v-if="submitErr" role="alert" class="err-bar rise-in uq-err">
        <span class="uq-err-msg">{{ submitErr }}</span>
        <button v-if="canOps" class="btn sm" @click="doSubmit" :disabled="submitting || !index.trim() || !queryStr.trim()">重试</button>
      </div>
      <div v-else-if="result" class="uq-sec wide">
        <div class="uq-card-hd">
          <span>结果</span>
          <div class="uq-card-hd-r">
            <!-- 原始 IO 快查——本页 update/delete_by_query 最近一次请求/响应原文（ioRecorder 记录环） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（批量写执行）" title="最近一次 update/delete_by_query 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
              <Terminal :size="11" /> 原始 IO
            </button>
            <!-- uq-badge code-bg 私造徽标改用 StatusPill 统一件（中性 n 档：taskId
 是状态型信息 chip，非强调语义） -->
            <StatusPill v-if="result.taskId" tone="n" :label="'异步任务：' + result.taskId" />
            <!-- 死 API 激活——api.progress(taskId) 一次性拉取（InternalEsIndexRebuildController
 /progress 端点现成，Java 零改）；行内三态中文（ReindexAdvancedView 同款） -->
            <button v-if="result.taskId" class="btn ghost xs" data-test="ubq-progress" :disabled="progressLoading"
              title="拉取该任务当前进度（一次性查询，不挂轮询）" @click="queryTaskProgress">{{ progressLoading ? '查进度中…' : '查进度' }}</button>
            <button v-if="result.taskId" class="btn ghost xs" @click="goTaskTree">
              <ExternalLink :size="11" /> 到任务树
            </button>
            <!-- 下钻对称——写完就地验证（Search 图标已 import 未用，正好归位） -->
            <button v-if="index" class="btn ghost xs" @click="router.push({ path: '/search', query: { mode: 'dsl', idx: index } })">
              <Search :size="11" /> 去查询验证
            </button>
          </div>
        </div>
        <!-- 查进度行内三态（进行中 x/y / 已完成 / 查不到降级） -->
        <div v-if="result.taskId && (progressLoading || progressText)" role="status" class="uq-prog">{{ progressLoading ? '进度查询中…' : progressText }}</div>
        <!-- W4c：结果区限高落偏好 usePref（默认 400=历史定值），内联 maxHeight 覆盖 -->
        <pre class="uq-result json-view" :style="{ maxHeight: uqResultH + 'px' }" v-html="resultHtml"></pre>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 -by-query 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Recycle, Pencil, Trash2, Star, Send, Search, ExternalLink, Terminal, Loader2 } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useQueryHistoryStore } from '../stores/queryHistory'; /* ：执行留痕（写操作入跨模式历史） */
import { useUrlState, useIdxState, usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件 */
import StatusPill from '../components/StatusPill.vue'; /* ：异步任务徽标统一件 */
import { askConfirm } from '../composables/confirm';
import JsonArea from '../components/JsonArea.vue';
import { useInputLint, patternRule, SLICES_RE, RPS_RE } from '../composables/useInputLint';
import { fmtTime, fmtNum } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
import { lintDsl } from '../utils/dslLint'; /* ：执行前 DSL 静态体检 */
import { friendlyEsError } from '../utils/esError'; /* ：预估失败裸错误串收敛 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-1：划线防抖统一件 */
import { permDeniedAdvice } from '../utils/esErrorAdvice'; /* W4c：三视图同构 403 建议收敛单一出处 */
import { useIndexFields } from '../composables/useIndexFields'; /* ：lint 字段表 + dsl-assist 字段源 */
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（661 范式） */
import { useTierCycle } from '../composables/useTierCycle'; /* ：脚本面高度档循环统一件 */
import MonacoEditor from '../components/MonacoEditor.vue';
import { removeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
/* 权限门禁——UBQ/DBQ=/cluster/update-by-query|delete-by-query=REBUILD 档（rank3+）；
 预估影响（count 只读）全角色可用。删除共享端点还接受 w:search 页授权，不能复用更新门。 */
const auth = useAuthStore();
const canUpdate = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/update-by-query', store.target));
const canDelete = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/delete-by-query', store.target));
const router = useRouter();
/* 模式进 URL（?mode=）——收藏重放/分享链接可复原 update|delete 现场 */
const mode = useUrlState('mode', 'update') as unknown as import('vue').Ref<'update' | 'delete'>;
const canOps = computed(() => mode.value === 'delete' ? canDelete.value : canUpdate.value);
/* 旧链接带 ?mode=delete 但身份落地后确认没有删除权：落回更新模式，避免展示必 403 的执行钮。
   probe 完成前 canDelete 恒 false，不能在身份未定时抹掉深链模式。 */
watch([mode, canDelete, () => auth.probed], () => {
  if (mode.value === 'delete' && auth.probed && !canDelete.value) mode.value = 'update';
}, { immediate: true });
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState();
const maxDocs = ref('');
const conflicts = ref('');
const slices = ref('auto');
const waitForCompletion = ref('false');
const requestsPerSecond = ref('');
/* ux2 ：slices / requests_per_second 结构化格式失焦校验 + 输入即清（防旧 hint 滞留误导） */
const { hint: slicesHint, level: slicesLevel, check: slicesCheck, clear: slicesClear } = useInputLint([
  patternRule(SLICES_RE, 'slices：auto 或整数'),
]);
const { hint: rpsHint, level: rpsLevel, check: rpsCheck, clear: rpsClear } = useInputLint([
  patternRule(RPS_RE, 'requests_per_second：-1 不限，或数字（可小数）'),
]);
watch(slices, () => slicesClear());
watch(requestsPerSecond, () => rpsClear());
const refresh = ref('');
const scroll = ref('');
/* 手写查询进 sessionStorage 草稿——刷新/误导航不丢稿（可重入） */
/* 草稿：写类视图——查询体草稿必须按 集群/索引 隔离（防 A 的更新语句带到 B） */
const queryStr = useScopedDraft('query', {
  route: 'update-by-query',

  index: () => index.value,
}).text;
const scriptSource = useScopedDraft('script', {
  route: 'update-by-query',
  index: () => index.value,
}).text;
/* 收藏回放 carry——favReplay 写一次性键，挂载即消费（取 body.query 入查询草稿；
 旧 esquerystudio.draft.update-by-query.query 是草稿治理前命名空间，无人消费，「已恢复」提示是假的） */
const ubqCarry = sessionStorage.getItem('esquerystudio.ubq.carry');
if (ubqCarry && ubqCarry.trim()) {
  try {
    const q = JSON.parse(ubqCarry).query;
    if (q) queryStr.value = JSON.stringify(q, null, 2);
  } catch { queryStr.value = ubqCarry; }
  removeStoredRaw(sessionStorage, 'esquerystudio.ubq.carry');
}
const estimateN = ref<number | null>(null);
const estimating = ref(false);
const submitting = ref(false);
const result = ref<any>(null);

/* 原始 IO 快查（545 四页同款）——特征 '-by-query' 统一接 update/delete_by_query
 两通道；判空 rec=null（本页还没执行过写操作）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('-by-query');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ═══ ：执行前智能护栏（本页是全站破坏性最强的入口） ═══
 lintDsl 对 query 文本做静态体检，warning 项在执行按钮附近出黄条；delete_by_query +
 match_all 组合＝全量删除，红条单独点名。两者都只提示不拦截——真正放行门仍是既有
 askConfirm 确认弹层（delete 走 critical 级 + 索引名 guard），不改变确认流程。 */
const { fields: uqIdxFields, ensure: ensureUqFields } = useIndexFields(() => index.value);
/* query 编辑器接字段智能补全（dsl-assist 全站字段源标准；三行写法参照 AdhocRebuildView
 arSettingsAssist——setup 作用域常量，防模板内联对象每次渲染换引用反复重注册 provider）。
 bodyKind 缺省即 'search'（MonacoEditor 分派缺省），query 体语义正好。索引含 pattern 时
 mappingDetail 失败零降级（fields 空＝无候选，不影响手输与执行）。 */
/* 值位动态候选接线（661 范式照抄）——useTermsSuggest 实例+terms 闭包，索引源与 fields 同源现调现读 */
const uqTerms = useTermsSuggest(() => index.value);
const uqQueryAssist = { fields: () => uqIdxFields.value, terms: (f: string, p: string) => uqTerms.suggestAsync(f, p) };
watch(index, () => { void ensureUqFields(); }, { immediate: true });
/* JSON 解析失败在此静默不阻塞执行：JsonArea 红点已提示，doSubmit 既有合法性门兜底 */
const queryLint = computed(() => {
  try { return lintDsl(JSON.parse(queryStr.value || ''), { fields: uqIdxFields.value }); }
  catch { return []; }
});
const queryLintWarnings = computed(() => queryLint.value.filter(f => f.severity === 'warning'));

/* P0-1：banner→划线双通道（既有黄条 banner 保留）——SearchSandboxView 
 范式逐字：useDebounceFn 250ms + info 降级 hint；queryLint 非法 JSON 静默返 []，setMarkers([])
 即清旧划线。error 档（terms-scalar 等）banner 原本只走 warning——划线通道把 error 也在
 编辑器内点名，双通道互补。 */
const uqJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueUqLintMarkers = useDebounceFn(() => {
  uqJaRef.value?.setMarkers?.(queryLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(queryStr, () => { queueUqLintMarkers(); }, { immediate: true });
const fullDeleteWarn = computed(() => {
  if (mode.value !== 'delete') return false;
  try {
    const q = JSON.parse(queryStr.value || '');
    return !!q && typeof q === 'object' && !Array.isArray(q) && 'match_all' in q;
  } catch { return false; }
});

/* W-C 批：结果 JSON 高亮（highlightJson 输出已转义） */
const resultHtml = computed(() => (result.value ? highlightJson(JSON.stringify(result.value, null, 2)) : ''));
/* G5-B1：写链路失败全文——内联错误面板数据源，与 result 互斥（失败即清旧结果） */
const submitErr = ref('');

const queryPlaceholder = computed(() => mode.value === 'delete'
  ? '{ "term": { "status": "obsolete" } }'
  : '{ "range": { "score": { "lt": 60 } } }');

const bodyStr = computed(() => {
  try {
    const q = JSON.parse(queryStr.value || '{}');
    const b: any = { query: q };
    if (mode.value === 'update' && scriptSource.value.trim()) {
      b.script = { lang: 'painless', source: scriptSource.value };
    }
    return JSON.stringify(b, null, 2);
  } catch { return ''; }
});

function loadTpl(k: string) {
  const m: Record<string, string> = {
    match_all: '{ "match_all": {} }',
    term: '{ "term": { "status": "active" } }',
    range: '{ "range": { "score": { "gte": 60, "lt": 100 } } }',
    bool: '{ "bool": { "must": [ { "term": { "status": "active" } } ], "filter": [ { "range": { "ts": { "gte": "now-7d" } } } ] } }',
  };
  queryStr.value = m[k];
}

/* 2.1.6：连点/改稿竞态守卫——预估在途时改 query 再点，慢包后到会顶掉新稿的命中数；
 世代计数让旧包（成功/失败/复位三支）整包作废。 */
let estimateSeq = 0;
async function loadEstimate() {
  if (!index.value.trim() || !queryStr.value.trim()) return;
  const seq = ++estimateSeq;
  estimating.value = true;
  try {
    let q: any;
    try { q = JSON.parse(queryStr.value); } catch { store.notify('error', 'query JSON 解析失败'); return; }
    const r = await api.searchDsl(index.value, JSON.stringify({ query: q, size: 0, track_total_hits: true }));
    if (seq !== estimateSeq) return;
    estimateN.value = r?.hits?.total?.value ?? r?.hits?.total ?? 0;
  } catch (e: any) {
    if (seq !== estimateSeq) return;
    /* 裸错误串 → friendlyEsError（XmigrateView w80 行逐字平移，全站兜底先例） */
    store.notify('error', '预估失败：' + friendlyEsError(String(e?.message ?? e)));
    estimateN.value = null;
  } finally { if (seq === estimateSeq) estimating.value = false; }
}

function doFav() {
  if (!bodyStr.value) return;
  store.addFavorite({
    kind: 'rest',
    title: `${mode.value === 'update' ? 'UpdateByQuery' : 'DeleteByQuery'} @${fmtTime(Date.now())}`,
    subtitle: `${index.value} · ${estimateN.value !== null ? estimateN.value + ' docs' : '未预估'}`,
    payload: { mode: mode.value, index: index.value, body: bodyStr.value },
    tags: [mode.value === 'update' ? 'ubq' : 'dbq'],
  });
  store.notify('success', '已收藏');
}

/* z5 轮：403 补下一步建议——W4c 起收敛 utils/esErrorAdvice 单一出处（三视图文案逐字等价） */
async function doSubmit() {
  /* 权限执行体首行门（按钮 v-if 之外的 Ctrl+Enter/重试通道）：批量写需专项或 ADMIN */
  if (!canOps.value) { store.notify('warning', '批量写需专项或 ADMIN 角色'); return; }
  /* @execute(Grave/Ctrl+Enter) 与重试按钮不经执行钮 disabled，此处必须自防重入 */
  if (submitting.value) return;
  /* z5 轮实测缺口：执行钮 :disabled 有 !queryStr 门，但 Monaco Ctrl+Enter 路径不经按钮——
 空 query 会构造出 {"query":{}}（ES 语义=match_all 打全索引），与按钮门对齐 */
  if (!queryStr.value.trim()) { store.notify('error', 'query 不能为空——空 query 等价 match_all，会命中整个索引'); return; }
  if (!bodyStr.value) { store.notify('error', 'query JSON 无效'); return; }
  const desc = mode.value === 'update' ? '更新' : '删除';
  const nHint = estimateN.value !== null ? `预估影响 ${estimateN.value} 条文档` : '未预估影响范围（建议先点「预估」）';
  const isDelete = mode.value !== 'update';
  if (!await askConfirm({
    title: `${desc} by query`,
    level: isDelete ? 'critical' : 'warn',
    guardText: isDelete ? index.value : '',
    message: `将对 ${index.value} 执行 ${desc} by query，${nHint}。${isDelete ? '命中文档将被真实删除且不可恢复。' : '命中文档将被脚本改写，旧值不保留。'}\n参数：conflicts=${conflicts.value} slices=${slices.value} rps=${requestsPerSecond.value} maxDocs=${maxDocs.value || '不限'}`,
    okText: `执行${desc}`,
  })) return;
  submitting.value = true;
  submitErr.value = '';
  try {
    const opts = {
      conflicts: conflicts.value || undefined,
      slices: slices.value || undefined,
      refresh: refresh.value || undefined,
      waitForCompletion: waitForCompletion.value || undefined,
      requestsPerSecond: requestsPerSecond.value || undefined,
      scroll: scroll.value || undefined,
      maxDocs: maxDocs.value || undefined,
    } as any;
    const r = mode.value === 'update'
      ? await api.updateByQuery(index.value, bodyStr.value, opts)
      : await api.deleteByQuery(index.value, bodyStr.value, opts);
    result.value = r;
    /* 执行留痕入查询历史（526 遗留「写操作无历史不可回溯」）—— 跨模式
 账本既有 push 接口一行落账，不新增 store API；mode 取最接近档 'dsl'（body 即 DSL 查询体，
 查询工作台 dsl 通道可回放），update/delete 之别由确认弹层与结果卡承载 */
    useQueryHistoryStore().push('dsl', bodyStr.value, index.value);
    store.notify('success', desc + ' 已提交' + (r.taskId ? '，taskId=' + r.taskId : ''));
  } catch (e: any) {
    /* G5-B1：失败全文进内联面板（不过 friendlyEsError——version_conflict 明细/脚本编译栈是排障依据）；
 清旧结果防残留伪装；notify 保留（内建 friendlyEsError 收敛）。
 z5 轮：403 场景在原文上补下一步建议（permDeniedAdvice） */
    submitErr.value = permDeniedAdvice(e);
    result.value = null;
    store.notify('error', desc + ' 失败：' + submitErr.value);
  } finally { submitting.value = false; }
}

function goTaskTree() {
  if (result.value?.taskId) {
    /* W4c·完成去向链：合并进 ?taskId= 深链（与 RA 同链，TaskTree 挂载消费直选）——
 原 esquerystudio.task-tree.focus 会话键在 TaskTree 改 query 消费后无读者（死链），一并退役 */
    router.push({ path: '/task-tree', query: { taskId: String(result.value.taskId) } });
  }
}

/* 死 API 激活——api.progress(taskId) 一次性拉取（后端 ReindexProgress：
 status=RUNNING|COMPLETED|UNKNOWN + total/created/updated/deleted 结构化计数）。
 三态中文：RUNNING=进行中 x/y、COMPLETED=已完成、UNKNOWN/拉取失败=查不到降级
 （任务完成后从 _tasks 消失/过期是常态路径，降级是预期分支不是异常，不 toast 轰炸）。
 仅用户点击时拉取（盯进度走「到任务树」深链），不挂轮询。ReindexAdvancedView 同款 */
const taskProgress = ref<any>(null);
const progressLoading = ref(false);
const progressFailed = ref(false);
async function queryTaskProgress() {
  const tid = result.value?.taskId;
  if (!tid || progressLoading.value) return;
  progressLoading.value = true;
  progressFailed.value = false;
  try {
    taskProgress.value = await api.progress(String(tid));
  } catch { progressFailed.value = true; }
  finally { progressLoading.value = false; }
}
const progressText = computed(() => {
  const p = taskProgress.value;
  if (progressFailed.value || !p || p.status === 'UNKNOWN') return '查不到进度（任务可能已过期或 taskId 无效）';
  const counts = ` ${p.created ?? 0}/${p.total ?? '?'}`;
  return p.status === 'COMPLETED' ? '已完成' + counts : '进行中' + counts;
});

/* W4c：结果区限高落偏好（默认 400=历史定值；经内联 maxHeight 生效） */
const uqResultH = usePref('ubq.resultH', 400);
/* painless 脚本面 28vh → 42vh 弹性档 + usePref 跨会话记忆
 （SqlConsoleView codeH「高」钮三档循环同款，editorTiers 族口径：st.editorH/qx.taH 先例）。
 私造「TIERS + usePref + cycle」三件套合并 useTierCycle 统一件
 （ W9 口径）——键名 ubq.scriptH / 档值序 / 默认档（tiers[0]）不变，零迁移 */
const SCRIPT_H_TIERS = ['max(110px, 42vh)', 'max(150px, 56vh)', 'max(220px, 72vh)'];
const { v: scriptH, cycle: cycleScriptH } = useTierCycle('ubq.scriptH', SCRIPT_H_TIERS);
</script>

<style scoped>
.uq-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
.uq-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* W4c 同口径死 CSS 清理——.uq-hd-l/-ic/-tt/-sub 页头换 PageHeader 后无模板引用，删除。
 卡头随壳退役转 fs-head 行首横排档（PainlessLab .pl-editor-hd 同款：fs-xs 行 +
 border-bottom 分界；.card-t 并轨随模板摘除退役），本地只留条栏布局与行首小标题档 */
.uq-card-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }
.uq-mode { display: flex; border: 1px solid var(--border); border-radius: var(--r-s); overflow: hidden; background: var(--bg2); }
.uq-mode-b { padding: 5px var(--sp-2h); background: transparent; border: 0; color: var(--muted); font-size: var(--fs-sm); display: flex; align-items: center; gap: var(--sp-1); cursor: pointer; transition: all var(--tr); }
.uq-mode-b:hover { color: var(--tx0); }
/* 选中态：柔底+语义色高亮字，危险模式用红色语义而非实心色块 */
.uq-mode-b.act { background: var(--ac-soft); color: var(--ac-hi); font-weight: 600; }
.uq-mode-b.danger.act { background: var(--err-soft); color: var(--err); }
.uq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
/* uq-card 壳（bg+border+radius+overflow）退役 → uq-sec border-top 分节 +
 flex 列布局承接原卡身内衬的纵向间距（内衬 padding 框随退役，字段直贴分节） */
.uq-sec { border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: var(--sp-2); }
.uq-sec.wide { grid-column: 1 / -1; }
/* W4c：query 编辑器 fill 弹性（JsonArea fill 自带 flex:1），卡身 flex column + min-height
 承接原 rows=10 定高（206px Monaco + 工具条），竖向可随窗成长。
 flex column 归 uq-sec 单源，本地只留 min-height 定高字面（高度链零变动） */
.uq-qcard { min-height: 280px; }
/* .ja 退壳——JsonArea fill 已吃满 .uq-qcard 分节（RankDebugView:418 等五先例），
 外框 border/圆角随壳退役，与分节卡一体观感 */
.uq-qcard :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.uq-card-hd-r { display: flex; gap: var(--sp-1); }
.uq-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.uq-field label { font-size: var(--fs-xs); color: var(--muted); }
/* 「用当前索引」回填钮与选择器同行。
 > .ixp 满宽规则随 IndexPicker 退役清零（chip 自带胶囊观感不满宽） */
.uq-idx-row { display: flex; align-items: center; gap: var(--sp-1h); }
.inp { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-xs); padding: 5px var(--sp-2); font-size: var(--fs-sm); color: var(--fg); }
.uq-script { border-top: 1px solid var(--border); }
/* 编辑器外框退役（约定③， sq-editor/be-card-editor 同语言视图侧
 独立追加）；uq-script-hd 既有 border-bottom 承接分界 */
.uq-script > :deep(.monaco-host) { border: none; border-radius: 0; }
/* 卡头行改 flex，右侧挂「去 Painless Lab 调试」弱链。
 code-bg 头条退役 → 约定②行首横排档（uq-card-hd 538 同语言：border-bottom 分界 +
 650/tx1/.02em，muted 弱化档退役；padding 原值不动，flex 结构零变动） */
.uq-script-hd { display: flex; align-items: center; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }
.uq-lab-link { margin-left: auto; color: var(--ac); text-decoration: none; font-size: var(--fs-xs); }
.uq-lab-link:hover { text-decoration: underline; }
/* .uq-lint 私造形态/双档随改用 lint-bar 单源退役，只留网格整行落位 */
.uq-lint { grid-column: 1 / -1; }
.uq-actions { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) 0; }
.uq-actions-r { margin-left: auto; }
.uq-est { font-size: var(--fs-sm); color: var(--muted); }
.uq-est b { color: var(--fg); }
/* .uq-badge 私造样式随 StatusPill 改用退役（n 档形态归 .pill 单源） */
/* W4c：max-height 裸值退役——限高落 usePref('ubq.resultH')，经内联 maxHeight 生效 */
.uq-result { padding: var(--sp-3); font-size: var(--fs-xs); background: var(--code-bg); margin: 0; overflow-x: auto; }
/* G5-B1：err-bar 占满网格整行；全局 err-bar 的 margin-bottom 与网格 gap 叠加，清零（Bulk be-err 同构）。
 写链路失败长文（version_conflict 明细/脚本编译栈）限高可滚 */
.uq-err { grid-column: 1 / -1; margin-bottom: 0; align-items: flex-start; }
.uq-err-msg { max-height: 120px; overflow: auto; white-space: pre-wrap; }
/* 查进度行内三态文案（进行中 x/y / 已完成 / 查不到降级）——
 .uq-sec 是 flex 纵列（非 grid），side padding 对齐 .uq-card-hd */
.uq-prog { margin: 0; padding: 0 var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }

/* G5-B2： 实测 iframe 可用宽 ~866px，双栏在此挤压（Bulk 批 12b 同款硬伤）。
 断点归一 标准值 1100（堆叠语义） */
@media (max-width: 1100px) {
  .uq-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——双卡堆叠已由 1100 档
 合并，此处收页侧距，卡头与执行行动作区允许换行（体检徽标+执行钮组窄视口不再硬挤；
 结果区横滚由 .uq-result overflow-x 自带） */
@media (max-width: 900px) {
  .uq-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); } /* ：10px → var(--sp-2h) 精确等值收口 */
  .uq-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
  .uq-actions { flex-wrap: wrap; row-gap: var(--sp-1); }
}
</style>
