<template>
  <div class="rt">
    <!-- 执行中局部进度条（ind-bar 全站范式） -->
    <div class="pg-progress ind-bar" :class="{ on: sending }"></div>
    <PageHeader :icon="Zap" title="REST 直连" subtitle="单次透传任意 ES REST 请求（快速试跑）" />

    <!-- 只读身份的前置说明：发送钮隐藏时不让页面变成无解释的空壳 -->
    <div v-if="auth.probed && !canSendAny" class="rt-perm-note" role="status">
      <Shield :size="13" /> 当前身份无法发送：需要 ADMIN，或该连接的「REST 直连」读权限（只读请求）／写权限（写请求）。
    </div>
    <div v-else-if="auth.probed && canSendAny && !canAdmin" class="rt-perm-note rt-perm-note-readonly" role="status">
      <Shield :size="13" /> 当前身份对该连接<b>只读</b>：可发送 GET／POST 查询类请求；写请求需「REST 直连」写权限。
    </div>

    <!-- 请求行（全局 .card 壳退役——bg/border/radius 归 theme.css 单源不再消费，
 局部 padding 条栏形态原样保留；响应分节加 border-top 承接约定①分界） -->
    <div class="rt-req">
      <div class="rt-req-row">
        <div class="seg rt-methods">
          <!-- W3-T11：选中端点后不在 ep.methods 内的方法置灰+title 提示（未选端点/自由文本=全可用） -->
          <button v-for="m in METHODS" :key="m" :class="{ on: method === m }" :data-m="m"
            :disabled="!!curEp && !curEp.methods.includes(m)"
            :title="curEp && !curEp.methods.includes(m) ? `该端点不支持 ${m}（可用：${curEp.methods.join('/')}）` : undefined"
            @click="method = m">
{{ m }}
</button>
        </div>
        <!-- W3-T11：端点目录补全渗透；面板关/无候选 Enter 透发 enter → send（裸 Enter 执行语义保留） -->
        <EndpointPathInput v-model="path" class="inp mono rt-path" placeholder="/_cluster/health"
          @endpoint="onEndpoint" @enter="send" />
        <button v-if="canSendAny" class="btn primary sm" :disabled="sending || !path.trim() || !currentSendable"
          :title="currentSendable ? (scopeAdvisory || undefined) : scopeDenyHint" @click="send">
          <Send :size="13" /> {{ sending ? '发送中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : '发送' }}
        </button>
        <span v-if="canAdmin && !currentSendable" class="rt-scope-dim" role="status" :title="scopeDenyHint">非 ADMIN 仅数据面</span>
        <button v-if="sending" class="btn sm" @click="qr.cancel()"><X :size="12" /> 取消</button>
      </div>
      <!-- 常用 snippet -->
      <div class="rt-snippets">
        <!-- 示例芯片键盘可达（role/tabindex/Enter， Overview 同口径） -->
        <span v-for="s in SNIPPETS" :key="s.path" class="chip mono" role="button" tabindex="0" :aria-label="'填入示例：' + s.label" @click="applySnippet(s)" @keydown.enter.prevent="applySnippet(s)" @keydown.space.prevent="applySnippet(s)">{{ s.label }}</span>
        <!-- W3-T11：端点带 body 骨架时出——直接覆盖现有 body（对齐 snippet 填充的无确认交互）；
 T11 复审 M1：显隐与 body 编辑区同口径加 hasBody——GET/HEAD 无 body 区且发送不带 body，按钮同隐 -->
        <button v-if="curEp?.body && hasBody" class="btn sm ghost" title="填入该端点的请求体骨架（覆盖现有 body）" @click="insertBody">
          <Braces :size="12" /> 插入 body 骨架
        </button>
        <button class="btn sm ghost rt-hist-btn" :disabled="!path.trim()" title="收藏当前请求（方法+路径+body），可在收藏夹一键回放至本页" @click="saveFav"><Star :size="12" /> 收藏</button>
        <button class="btn sm ghost rt-hist-btn" @click="histOpen = true"><History :size="12" /> 历史</button>
        <button class="btn sm ghost rt-hist-btn" title="查看当前身份在本页与当前连接下允许的操作（与后端拦截器判定同源）" @click="permOpen = true"><Shield :size="12" /> 我的权限</button>
      </div>
      <!-- body（W6：dslAssist 按端点/path 语义分档补全）。
 lintDsl 静态体检提示条（SearchSandboxView join 串形态同款，随输入实时重估，
 零阻塞不拦执行）——仅 search 语义档接（body 是 JSON 查询才吃查询规则；settings/mapping/
 bulk 档与 GET/HEAD 无 body 面不接，root-key-typo 会误报配置键）；error 红条单列，
 warning/hint 黄条并列；JSON 非法静默 -->
      <div v-if="hasBody" class="rt-body-wrap">
        <!-- body 编辑器弹性档「高」钮 + usePref 记忆（ubq.scriptH 三档循环同款形态）——
 首档 100% 沿既有块流 min-height max(180px,42vh) 兜底形态，后续档恒 ≥ 兜底不破口径 -->
        <div class="rt-ed-hd">
          <button class="btn ghost xs" data-test="rest-body-h" :title="'body 编辑器高度档：' + restEdH" @click="cycleRestEdH">高</button>
        </div>
        <!-- P0-1：编辑器划线通道挂点（banner 保留双通道，见 script queueRtLintMarkers） -->
        <MonacoEditor ref="rtBodyMonaco" v-model="body" :height="restEdH" :language="bodyLang" class="rt-body-ed" :dsl-assist="dslAssist" />
        <!-- .rt-lint 私造三档随同构改用 theme.css .lint-bar 单源（软/硬档
 lint-bar-warn/lint-bar-err，role/status 语义与文案逐字不动） -->
        <div v-if="rtLintErrors.length" role="alert" class="lint-bar lint-bar-err">
          <span>DSL 检查（错误）：{{ rtLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
        <div v-else-if="rtLintWarns.length" role="status" class="lint-bar lint-bar-warn">
          <span>DSL 检查：{{ rtLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
        </div>
      </div>
    </div>

    <!-- 响应（G7-C1：sending 期间保持分节在场，出占位文案，不闪引导空态） -->
    <div v-if="resp || respErr || sending" class="rt-resp">
      <div class="rt-resp-bar">
        <!-- W-D：响应状态/失败徽标改用 StatusPill（三档映射与失败红档语义不变，文案逐字） -->
        <StatusPill v-if="resp" :tone="resp.status < 300 ? 'g' : resp.status < 500 ? 'y' : 'r'" :label="'HTTP ' + resp.status" />
        <StatusPill v-if="respErr" tone="r" label="请求失败" />
        <!-- 裸耗时 → TookBadge 四档语义徽标（阈值单源 utils/format，BulkEditor 同款） -->
        <TookBadge v-if="elapsed != null" :ms="elapsed" title="请求耗时" />
        <!-- W2 批：大响应截断徽标（点击=复制取全文，copyResp 走 respParsed 完整原文） -->
        <button v-if="respTruncated" class="btn sm ghost" data-rt-trunc
          title="响应过大，仅截断展示前 512 KB；点击复制完整原文" @click="copyResp">
          已截断 · {{ truncKb }} KB · 复制取全文
        </button>
        <div class="rt-spacer"></div>
        <!-- G7-C2：错误时收敛无意义动作群（复制只会得到 "null"），只留显式重试——
 重试走 send()：PUT/DELETE 重开危险确认，确认门不绕过 -->
        <template v-if="resp">
          <input v-model="searchExpr" class="inp mono rt-search" placeholder="搜索响应…" @keydown.enter.prevent="searchExpr.trim() && ($event.shiftKey ? hitPrev() : hitNext())" @keydown.esc.prevent="searchExpr = ''" />
          <span v-if="searchExpr.trim()" class="mono rt-mc">{{ hitCur }}/{{ matchCount }}</span>
          <span v-if="searchExpr.trim()" class="rt-hn">
            <button type="button" class="btn sm ghost" :disabled="!matchCount" title="上一个匹配 (Shift+Enter)" @click="hitPrev">↑</button>
            <button type="button" class="btn sm ghost" :disabled="!matchCount" title="下一个匹配 (Enter)" @click="hitNext">↓</button>
          </span>
          <input v-model="jqExpr" class="inp mono rt-jq" placeholder="JQ 过滤响应（回车应用）" @keydown.enter="applyJq" @blur="jqCheck(jqExpr)" @keydown.esc.prevent="jqExpr = ''" />
          <div v-if="jqHint" class="il-hint" :class="'il-' + jqLevel">{{ jqHint }}</div>
          <button class="btn sm" @click="copyResp"><Copy :size="11" /> 复制</button>
        </template>
        <button v-if="respErr && canSendAny" class="btn sm" :disabled="sending" @click="send"><RefreshCw :size="11" :class="{ spinning: sending }" /> 重试</button>
        <!-- 原始 IO 快查——最近一次 /cluster/raw 透传请求/响应原文（ioRecorder 记录环；
 置动作群末尾不进 resp-only 分组，失败响应同样可查） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（REST 直连）" title="最近一次透传请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
      </div>
      <div ref="respBox" class="scroll-y rt-resp-scroll" tabindex="0" @contextmenu.prevent="openRespMenu" @keydown="onRespMenuKey">
        <!-- respErr 裸 pre → highlightJson v-html（转义安全，jsonc.ts 单一出处）——
 错误保原文全文 + JSON 错误体上色（j-key/j-str 语义），非 JSON 纯文本不着色仍走 .rt-err-pre 红。
 补 friendly 人话标题行（双轨范式）+ 上色内核换 errPreHtml
 （含 { 走 highlightJson、否则 HTML 转义平文，与全站错误面板同内核）；
 .rt-err-pre 类名不动（devxThreeState/restTruncW2 选择器锚） -->
        <template v-if="respErr">
          <div class="rt-err-h">请求失败 · {{ friendlyRespErr }}</div>
          <pre class="json-view rt-err-pre" v-html="respErrHtml"></pre>
        </template>
        <div v-else-if="sending" class="rt-waiting">发送中，等待集群响应…</div>
        <pre v-else class="json-view" v-html="respHtml"></pre>
      </div>
    </div>
    <EmptyState v-else :icon="Zap" text="输入任意 ES REST path 直接透传调用" hint="method 白名单 + path 校验由后端把关" />

    <!-- 危险方法确认收敛全局 askConfirm（本文件 166/190 已用，双范式归一）——
 后果前置文案/okText 动态方法名语义等价保留，本地 ConfirmModal 宿主退役 -->

    <!-- 历史 -->
    <!-- 弹窗体改用 QueryHistoryPanel 统一件——存储 key es_rest_hist 不动；
 条目映射见 histRows（query=「METHOD path」，合并串让旧 method/path 过滤口径等价）；
 clickable 整行=play=replay（填入+关弹窗，等价旧行点击——play 不执行，无误触写请求面）；
 actions 全量中 copy 面板自带（复制「METHOD path」），rename 不传（本页历史无名称字段无重命名存储）；
 导入隐藏（面板导入写 queryHistory store，与本页 es_rest_hist 不同存储）；导出经 export-row
 保留 {method,path,body,ts}（与 DevTools 导入互认的格式不变）；清空仍走 askClearHist 确认 -->
    <n-modal v-model:show="histOpen" preset="card" title="请求历史" style="width:560px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel :items="histRows" :actions="['play', 'fill', 'copy', 'del']"
        clickable empty-text="暂无历史" :importable="false"
        :export-row="histExportRow"
        @play="replay" @fill="fillOnly" @del="removeHistRow" @clear="askClearHist" />
      <template #footer>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn sm" @click="histOpen = false">关闭</button>
        </div>
      </template>
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 /cluster/raw 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
    <!-- 1379：响应体右键菜单——此前响应区只有工具行一个「复制」钮，
 想复制某一行/整段消息体或换成路径写法只能全选手动截取。
 一级两项常用（复制响应 / 复制请求行）+ 两个分组（导出/更少用），
 不把低频动作摊到一级（表格右键同约定）。 -->
    <CellContextMenu v-if="respMenu" :x="respMenu.x" :y="respMenu.y" title="响应操作"
      :items="respMenuItems" @close="respMenu = null" />
    <PermModal v-model:show="permOpen" :target="store.target" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { applyVars, missingVars, hasVars } from '../utils/vars';
import { NModal } from 'naive-ui';
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* W-D：响应状态徽标统一件 */
import { Send, History, Copy, Zap, RefreshCw, Braces, X, Star, Terminal, Shield, FileDown, Search } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import PermModal from '../components/PermModal.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth'; /* ：权限写门真源 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useHitNav } from '../composables/useHitNav';
/* body 编辑器弹性档记忆（usePref rest.edH，ubq.scriptH 同款三档循环）
 记忆件合并 useTierCycle 单源（pref 键/档值/默认档零迁） */
import { useTierCycle } from '../composables/useTierCycle';
import TookBadge from '../components/TookBadge.vue'; /* ：裸耗时统一徽标 */
import { useQueryRun } from '../composables/useQueryRun';
/* 历史改用 QueryHistoryPanel 后 relTime/fmtTime/exportStamp/downloadText 随本地实现退役 */
import { copyText } from '../utils/format';
import { jq } from '../utils/minijq';
import { readStoredJson, parseJsonSafe, writeStoredRaw } from '../utils/safeJson';
/* respErr 上色走 highlightJson（jsonc.ts 单一出处）；并 errPreHtml/friendlyEsError */
import { stripJsonComments, highlightJson } from '../utils/jsonc';
import { errPreHtml, errMeta } from '../utils/errPre';
import { friendlyEsError } from '../utils/esError';
import MonacoEditor from '../components/MonacoEditor.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { bodyKindForPath, bodyLangForPath } from '../utils/dslCompletionContext';
import { lintDsl, lintStructuredBody, lintSettingsBody, lintMappingBody, lintNdjsonBody, lintNdjsonLineKeys } from '../utils/dslLint'; /* ：DSL 静态体检（与 DevTools 同源分派） */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-1：划线防抖统一件 */
import EndpointPathInput from '../components/devtools/EndpointPathInput.vue';
import { REST_METHODS, type EsEndpoint } from '../utils/esEndpoints';
import { useInputLint, jqLiteRule } from '../composables/useInputLint';
/* 视图内搜索 mark 内核合并 respMark 单源（escapeRe/markHtmlAll，本文件三件本地实现退役） */
import { markHtmlAll } from '../utils/respMark';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
/* 历史弹窗体改用 QueryHistoryPanel 统一件（本地过滤/导出/空态实现退役） */
import QueryHistoryPanel, { type HistRow } from '../components/QueryHistoryPanel.vue';
/* 非 ADMIN 数据面写白名单（与后端 guardRawGuarded 同口径的客户端预暴露） */
import { nonAdminDataPlaneWriteAllowed, nonAdminRootSearchNeedsIndex,
  nonAdminIndexQueryParamRejected, nonAdminControlIndexDenied, nonAdminWildcardTargetAdvisory,
  nonAdminBodyTargetsControl, nonAdminCatNeedsJson, nonAdminAsyncResultRead } from '../utils/devtoolsScope';

const store = useAppStore();
/* 权限门按**内层方法**分档（1133）：只读请求读键即可，写请求要写键/ADMIN。
   此前一律按 admin 写档判定，宿主持 conn:{id}:rest 读键的只读身份连 GET 都发不出。 */
const auth = useAuthStore();
const RAW_EP = '/internal/es/index/cluster/raw';
const canExecInner = (m: string, p: string) => auth.canExecutePassthrough(m, p, RAW_EP, store.target);
/* 写档（用于「非 ADMIN 仅数据面」与说明条分叉） */
const canAdmin = computed(() => auth.canPassthroughWrite(RAW_EP, store.target));
/* 读档：只读身份的只读请求也应有发送钮 */
const canSendAny = computed(() => auth.canPassthroughRead(RAW_EP, store.target));
/* 非 ADMIN 写范围预暴露与 DevTools 同口径（后端同执行内核 guardRawGuarded，双页单口径）。
   me==null（未启用鉴权/探测完成未登录）跟随 canEndpoint 放行语义——后端 authDisabled
   形态无角色概念，scope 门不得把管理写在前端拦死 */
/* 1004：门带 body——根级检索的 PIT 豁免要读 pit.id，否则非 ADMIN 的 w:rest 用户
   发 PIT 搜索会被前端误禁（有权限的人被拦）。 */
const requestInScope = (m: string, p: string, b?: string | null) =>
  auth.isAdmin() || auth.me == null || auth.authDisabled || nonAdminDataPlaneWriteAllowed(m, p, b);
const currentSendable = computed(() => canExecInner(method.value, path.value)
  && requestInScope(method.value, path.value, body.value));
const SCOPE_DENY_HINT = '非 ADMIN 仅可执行数据面写（检索/文档/批量/SQL）；别名、快照、模板、脚本与集群管理写需 ADMIN';
/* 不可用原因分档（与 DevTools 同口径）：根级检索缺索引范围单列，直接说明怎么改 */
const scopeAdvisory = computed(() => {
  if (auth.isAdmin() || auth.me == null || auth.authDisabled) return '';
  return nonAdminWildcardTargetAdvisory(path.value, body.value) || '';
});
const scopeDenyHint = computed(() => {
  if (!auth.isAdmin() && auth.me != null && !auth.authDisabled) {
    if (nonAdminIndexQueryParamRejected(path.value)) {
      return 'index/indices 查询参数不能限定目标：请改用 /{index}/_search 路径形式';
    }
    if (nonAdminControlIndexDenied(path.value)) {
      return '控制面/系统索引不对非 ADMIN 开放：请改用业务索引';
    }
    if (nonAdminRootSearchNeedsIndex(path.value, body.value)) {
      return '根级检索需用 /{index}/_search 形式，或 PIT（body 带 pit.id）；非 ADMIN 不允许全量读';
    }
    if (nonAdminCatNeedsJson(path.value)) {
      return '_cat 目录查询需带 format=json 且保留 index 列（服务端据此逐行过滤控制面索引）';
    }
    if (nonAdminAsyncResultRead(path.value)) {
      return '异步查询结果按 id 取回（id 即凭据，结果集按执行者权限生成）：非 ADMIN 请重新提交查询，不要复用他人 id';
    }
    if (nonAdminBodyTargetsControl(path.value, body.value)) {
      return '请求体里的目标指向控制面索引：请把 _index / index / indices / SQL FROM 改为业务索引';
    }
  }
  return SCOPE_DENY_HINT;
});
/* 方法全集收口 esEndpoints.REST_METHODS */
const METHODS = REST_METHODS;
const SNIPPETS = [
  { label: 'cluster health', method: 'GET', path: '/_cluster/health' },
  { label: 'cat indices', method: 'GET', path: '/_cat/indices?format=json' },
  { label: 'nodes stats', method: 'GET', path: '/_nodes/stats/os,jvm,fs' },
  { label: 'cluster settings', method: 'GET', path: '/_cluster/settings?include_defaults=true' },
  { label: 'tasks', method: 'GET', path: '/_tasks?actions=*reindex&detailed=true' },
  { label: 'aliases', method: 'GET', path: '/_aliases' },
];

/* 草稿：method/path/body 迁 useScopedDraft（按集群目标隔离；favReplay 同键回填） */
const restScope = { route: 'rest',};
const method = useScopedDraft('method', restScope, 'GET').text as unknown as import('vue').Ref<typeof METHODS[number]>;
const path = useScopedDraft('path', restScope).text;
const body = useScopedDraft('body', restScope, '{\n  \n}').text;
const respBox = ref<HTMLElement | null>(null);
const sending = ref(false);
const qr = useQueryRun(); // 长查询读秒 + 取消（ 范式）
const resp = ref<any>(null);
const respErr = ref('');
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const respErrRaw = ref<unknown>(null);
/* 错误全文保原文 + highlightJson 上色（esc 先行转义安全；非 JSON 文本不着色）。
 内核换 errPreHtml（含 { 才走 highlightJson，平文走 HTML 转义——原实现
 对非 JSON 串也硬跑 highlightJson，转义语义未契约化）；标题行 friendly 同步补。 */
const respErrHtml = computed(() => errPreHtml(respErr.value, errMeta(respErrRaw.value)));
const friendlyRespErr = computed(() => friendlyEsError(respErr.value));
const elapsed = ref<number | null>(null);
const jqExpr = ref('');
/* ux2 ：jq 轻量预检一律 warn（字符串字面量内括号可能误报，只提醒不阻断），失焦校验 + 输入即清 */
const { hint: jqHint, level: jqLevel, check: jqCheck, clear: jqClear } = useInputLint([jqLiteRule()]);
watch(jqExpr, () => jqClear());
const jqResult = ref<any>(null);
import { askConfirm } from '../composables/confirm';

const searchExpr = ref('');
const histOpen = ref(false);
const permOpen = ref(false);

const hasBody = computed(() => method.value !== 'GET' && method.value !== 'HEAD');

/* body 编辑器弹性档 + usePref 记忆（ubq.scriptH「高」钮三档循环同款；
 首档 100% = 既有块流 min-height max(180px,42vh) 兜底形态，后续档恒 ≥ 兜底）。
 TIERS+usePref+手写 cycle 三件套合并 useTierCycle 单源
 （rest.edH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const REST_ED_H_TIERS = ['100%', 'max(180px, 56vh)', 'max(180px, 72vh)'];
const { v: restEdH, cycle: cycleRestEdH } = useTierCycle('rest.edH', REST_ED_H_TIERS);

interface HistItem { method: string; path: string; body: string; ts: number }
/* 脏值防御读取：手改/残留坏 JSON 不得炸 Rest 页挂载 */
const history = ref<HistItem[]>(readStoredJson(localStorage, 'es_rest_hist', [], Array.isArray));
function persistHist() { writeStoredRaw(localStorage, 'es_rest_hist', JSON.stringify(history.value.slice(0, 30))); }

/* 历史适配 QueryHistoryPanel HistRow——query=「METHOD path」（面板过滤按 query/index/name
 includes，合并串让旧 method/path 双口径过滤等价），id=原数组下标供删除定位；存储 key es_rest_hist 不动 */
interface RestHistRow extends HistRow { method: string; path: string; body: string }
const histRows = computed<RestHistRow[]>(() =>
  history.value.map((h, i) => ({ ...h, id: i, query: h.method + ' ' + h.path })));
async function askClearHist() {
  const ok = await askConfirm({
    title: '清空请求历史',
    message: `将删除全部 ${history.value.length} 条本地请求历史，此操作不可撤销。需要保留可先用「导出」备份。`,
    level: 'warn',
    okText: '清空',
  });
  if (!ok) return;
  history.value = [];
  persistHist();
}
/* play=回放（填入+关弹窗，等价旧行点击）；fill=仅填入（弹窗保持开可微调）。
 处理器按面板 HistRow 签名收参，内部窄化为本页 RestHistRow */
function replay(hr: HistRow) {
  const h = hr as RestHistRow;
  method.value = h.method as any;
  path.value = h.path;
  body.value = h.body;
  histOpen.value = false;
}
function fillOnly(hr: HistRow) {
  const h = hr as RestHistRow;
  method.value = h.method as any;
  path.value = h.path;
  body.value = h.body;
}
/* 面板 del 事件——按下标删除（map 时 id=原数组下标，删后 computed 重算自愈） */
function removeHistRow(hr: HistRow) {
  const h = hr as RestHistRow;
  if (h.id == null) return;
  history.value.splice(Number(h.id), 1);
  persistHist();
}
/* 导出行保留 rest 特有字段—— {method,path,body,ts} 格式（与 DevTools 导入互认）不变 */
const histExportRow = (r: HistRow): Record<string, unknown> => {
  const x = r as RestHistRow;
  return { method: x.method, path: x.path, body: x.body, ts: x.ts };
};

function applySnippet(s: { method: string; path: string }) {
  method.value = s.method as any;
  path.value = s.path;
}

/* 收藏当前请求——收藏体系对 /rest 的读侧早已闭环（favReplay 通用 rest 分支
 写本页草稿键并跳回 /rest），但本页一直没有写侧入口，收藏夹空态「任何 REST 请求均可
 收藏」的声明对 /rest 不成立。payload 形态与 DevToolsView saveFav 同构，回放落本页草稿。 */
function saveFav() {
  if (!path.value.trim()) return;
  store.addFavorite({
    kind: 'rest',
    title: `${method.value} ${path.value.trim()}`,
    subtitle: (body.value || '').slice(0, 60),
    payload: { method: method.value, path: path.value.trim(), body: body.value },
    tags: ['rest', 'rest-view'],
  });
  store.notify('success', '已收藏');
}

/* W3-T11：端点目录联动——onEndpoint 记录选中端点，curEp 驱动 method 置灰与 body 骨架；
 路径不再匹配端点模板（自由文本）即脱钩回全可用（零降级） */
const pickedEp = ref<EsEndpoint | null>(null);
/** 端点模板匹配：{index}/{id} 槽位段适配任意单段实例，查询串不参与 */
function epMatch(ep: EsEndpoint, p: string): boolean {
  const bare = (p || '').split('?')[0];
  const re = new RegExp('^' + ep.path.split(/\{[a-z]+\}/)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$');
  return re.test(bare);
}
const curEp = computed<EsEndpoint | null>(() =>
  pickedEp.value && epMatch(pickedEp.value, path.value) ? pickedEp.value : null);
function onEndpoint(ep: EsEndpoint) {
  pickedEp.value = ep;
  /* 当前 method 不在端点 methods 内 → 自动纠正为首个（与置灰提示并存） */
  if (!ep.methods.includes(method.value)) method.value = ep.methods[0] as any;
}
function insertBody() { if (curEp.value?.body) body.value = curEp.value.body; }

/* W6：body Monaco 智能补全——字段源吃当前工作索引 mappingDetail 出口（useIndexFields 统一管线，
 immediate 预热 + 换索引重拉，与 DslQueryView 同范式；失败零降级仅 field 档无候选）。
 bodyKind 随端点/path 派生：选中端点吃模板 path，自由文本按裸 path 判定（无特殊段回 search）。 */
const { fields: rtFields, ensure: ensureRtFields } = useIndexFields(() => store.pickedIdx || '');
watch(() => store.pickedIdx, () => { ensureRtFields(); }, { immediate: true });
const rtBodyKind = computed(() => bodyKindForPath(curEp.value?.path ?? path.value ?? '', method.value));
/* dslAssist 闭包在 setup 作用域声明（T14 实证：模板内联字面量走 _ctx 代理，ref 顶层 unwrap 后 .value 取 undefined） */
/* terms 通道接值位动态候选（658 DqlQueryView 首发姊妹刀）——索引源=store.pickedIdx
 与 rtFields 同源（Rest 无路径索引派生，fields 同口径）；未选索引/异常恒 resolve [] 零扰动 */
const rtTerms = useTermsSuggest(() => store.pickedIdx || '');
const dslAssist = { fields: () => rtFields.value, bodyKind: () => rtBodyKind.value, indices: () => store.indices.map(i => i.index), terms: (f: string, p: string) => rtTerms.suggestAsync(f, p) };
/* body lint 静态体检——与 DevTools 同一分派：bulk/msearch→NDJSON 配对、
 settings→lintSettingsBody、mapping→lintMappingBody、search→查询规则、
 结构化体→lintStructuredBody（根键校验）；JSON 解析失败静默 */
const rtLint = computed(() => {
  if (!hasBody.value) return [];
  const kind = rtBodyKind.value;
  if (kind === 'none' || kind === 'msearch-body' || kind === 'msearch-template-body' || kind === 'bulk-body') {
    const mode = kind === 'msearch-body' ? 'msearch' as const
        : kind === 'msearch-template-body' ? 'msearch-template' as const : 'bulk' as const;
    const base = lintNdjsonBody(body.value || '', mode);
    return kind !== 'none'
      ? [...base, ...lintNdjsonLineKeys(body.value || '', mode)]
      : base;
  }
  if (kind === 'settings') { try { return lintSettingsBody(JSON.parse(body.value || '')); } catch { return []; } }
  if (kind === 'mapping') { try { return lintMappingBody(JSON.parse(body.value || '')); } catch { return []; } }
  if (kind === 'search') {
    try { return lintDsl(JSON.parse(body.value || ''), { fields: rtFields.value }); }
    catch { return []; }
  }
  return lintStructuredBody(kind, body.value || '');
});
/* 1439：体语言与 DevTools 同源（_bulk/_msearch → ndjson） */
const bodyLang = computed(() => bodyLangForPath(path.value || ''));
const rtLintErrors = computed(() => rtLint.value.filter(f => f.severity === 'error'));
const rtLintWarns = computed(() => rtLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));

/* P0-1：banner→划线双通道（既有 banner 提示条保留）——SearchSandboxView 
 范式逐字：useDebounceFn 250ms 防 findMatches 每键全量跑；info 降级 hint（marker 档只收
 warning/hint/error）；rtLint 非法 JSON 静默返 []，setMarkers([]) 即清旧划线；
 unplaced 由 banner 全档兜底，不静默丢信息。 */
const rtBodyMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueRtLintMarkers = useDebounceFn(() => {
  rtBodyMonaco.value?.setMarkers?.(rtLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(body, () => { queueRtLintMarkers(); }, { immediate: true });

/* 危险方法确认收敛全局 askConfirm（与 askClearHist 同范式）——PUT/DELETE 先过确认门，
 重试按钮与发送同走 send()（G7-C2 语义：重试在失败现场，PUT/DELETE 重试同样重过确认门不直发） */
async function send() {
  /* 执行体收口——raw 透传是 admin 档，裸 Enter（@enter="send"）与重试钮都汇入
 此函数，按点位隐藏发送钮挡不住键盘路径，守卫收到执行体才是单源 */
  if (!canExecInner(method.value, path.value)) {
    store.notify('warning', canSendAny.value
      ? '当前身份对该连接只有只读权限：写请求需要「REST 直连」写权限'
      : 'raw 透传需要 ADMIN，或该连接的「REST 直连」读/写权限');
    return;
  }
  if (!path.value.trim().startsWith('/')) { store.notify('warning', 'path 必须以 / 开头'); return; }
  if (method.value === 'PUT' || method.value === 'DELETE') {
    const ok = await askConfirm({
      title: '危险操作确认',
      message: `即将执行 ${method.value} ${path.value}。` +
        (method.value === 'DELETE' ? 'DELETE 可能删除索引/文档/快照，不可恢复。' : 'PUT 可能变更集群/索引状态。'),
      level: 'warn',
      okText: method.value + ' 执行',
    });
    if (!ok) return;
  }
  doSend();
}

async function doSend() {
  /* 执行体单点门：send/重试/Enter/确认后目标切换最终都汇入此处，钮面隐藏不是唯一防线 */
  if (!canExecInner(method.value, path.value)) {
    store.notify('warning', canSendAny.value
      ? '当前身份对该连接只有只读权限：写请求需要「REST 直连」写权限'
      : 'raw 透传需要 ADMIN，或该连接的「REST 直连」读/写权限');
    return;
  }
  /* 非 ADMIN 数据面口径与 DevTools 同源：越权形态在客户端即拒，不把请求发到后端才 403 */
  if (!requestInScope(method.value, path.value, body.value)) { store.notify('warning', scopeDenyHint.value); return; }
  /* G7-A2：path 输入框 Enter 路径不受按钮 :disabled 约束——执行体守卫管键盘重入（教训 7） */
  if (sending.value) return;
  sending.value = true;
  respErr.value = '';
  respErrRaw.value = null;
  resp.value = null;
  elapsed.value = null; // G7-C1：清旧耗时，发送中不残留上次 ms
  jqResult.value = null;
  jqExpr.value = ''; // 清残留表达式，避免误套旧过滤
  searchExpr.value = '';
  /* Console Variables（与 DevTools 同源）：判定看原始请求，发送用展开值；
     未定义变量显式拦下——原样把 ${var} 发出去只会得到难懂的 ES 语法错误。 */
  const pathRaw = path.value.trim();
  const bodyRaw = hasBody.value ? stripJsonComments(body.value) : '';
  const miss = missingVars([pathRaw, bodyRaw].join('\n'));
  if (miss.length) {
    sending.value = false;
    store.notify('warning', '变量未定义：' + miss.map(n => '${' + n + '}').join('、') + '——请先在「变量」里填值');
    return;
  }
  const pathFinal = hasVars(pathRaw) ? applyVars(pathRaw, undefined, { pathMode: true }) : pathRaw;
  const bodyFinal = hasVars(bodyRaw) ? applyVars(bodyRaw) : bodyRaw;
  /* 变量展开结果再过一次范围门：避免「原始路径合规、展开后越权」被前端放行 */
  if ((pathFinal !== pathRaw || bodyFinal !== bodyRaw) && !requestInScope(method.value, pathFinal, bodyFinal)) {
    sending.value = false;
    store.notify('warning', scopeDenyHint.value + '（变量展开后的实际请求已越出当前授权范围）');
    return;
  }
  const t0 = performance.now();
  const signal = qr.begin();
  try {
    /* 2.6.0：发送前剥离 // 与 块注释（串内保护，_bulk NDJSON 天然安全）——注释随便写，ES 只收干净 JSON */
    resp.value = await api.raw(method.value, pathFinal, bodyFinal, signal);
    elapsed.value = Math.round(performance.now() - t0);
    /* 去重：同 method+path 旧记录提到最新 */
    history.value = history.value.filter(h => !(h.method === method.value && h.path === path.value.trim()));
    history.value.unshift({ method: method.value, path: path.value.trim(), body: body.value, ts: Date.now() });
    persistHist();
  } catch (e: any) {
    /* 主动取消不报失败（DslQueryView 取消甄别同语义）：轻提示即返，「请求失败」态留给真失败 */
    if (e?.name === 'AbortError') { store.notify('info', `已取消请求（${(qr.elapsedMs.value / 1000).toFixed(1)}s）`); return; }
    respErr.value = e?.message || String(e);
    respErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
  } finally {
    sending.value = false;
    qr.finish();
  }
}

/* 响应渲染（JSON 高亮 + JQ）——：原始响应体同样走精度保真解析，否则长 ID 在高亮/JQ/复制链路里失真 */
const respParsed = computed(() => {
  if (!resp.value) return null;
  const b = resp.value.body;
  if (typeof b === 'object') return b;
  try { return parseJsonSafe(b); } catch { return b; }
});
function applyJq() {
  if (!jqExpr.value.trim()) { jqResult.value = null; return; }
  try { jqResult.value = jq(respParsed.value, jqExpr.value.trim()); }
  catch (e: any) { store.notify('error', 'JQ: ' + e.message); }
}
/* 响应渲染（本地 esc/hl 32 行手写高亮退役——与 respErr 同走 highlightJson
 单一出处；对象/jq 结果先 pretty 再着色，j-key/j-str 等类名与全局 json-view 范式一致） */
const displaySrc = computed(() => {
  const v = jqResult.value !== null ? jqResult.value : respParsed.value;
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
});
/* W2 批：大响应截断展示（并轨 DevToolsView 口径：512KB 常量）——全量字符串直接跑
 highlightJson 在几 MB 响应上整卡假死；截断只作用于展示，复制/搜索语义不变（copyResp
 仍取 respParsed 全量原文，徽标即「复制取全文」通道）。 */
const REST_RESP_MAX = 512 * 1024;
const respTruncated = computed(() => (displaySrc.value?.length ?? 0) > REST_RESP_MAX);
const truncKb = computed(() => Math.round((displaySrc.value?.length ?? 0) / 1024));
const displayHtml = computed(() => {
  const src = displaySrc.value || '';
  return highlightJson(src.length > REST_RESP_MAX ? src.slice(0, REST_RESP_MAX) : src);
});
/* 响应内搜索（搜索定位轮）：文本节点包 <mark data-hit-idx>，当前命中加 cur 态并滚动定位。
 计数与渲染解耦（cur=0 纯计数模式）——否则 matchCount→respMarked→hitCur→matchCount
 成环，useHitNav 初始化即 TDZ。只作用于展示 HTML——复制走原文，搜索与复制互不污染。 */
const searchKw = computed(() => searchExpr.value.trim());
/* 本地 escapeRe/hitsInHtml/markHtml 三件退役，合并 utils/respMark.markHtmlAll
 单源（与 DslQueryView jsonMarkedHtml 同构实现；j-mark/j-mark-cur/data-hit-idx 逐字保形，
 cur=0 纯计数模式承接原 hitsInHtml——计数与渲染解耦防 useHitNav TDZ 环语义不变） */
const matchCount = computed(() => markHtmlAll(displayHtml.value, searchKw.value, 0).count);
/* 命中游标（wrap）+ 当前命中滚动到视口中心；计数变化（jq 切换/新响应）回到首个。 */
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitNav(() => matchCount.value);
const respHtml = computed(() => markHtmlAll(displayHtml.value, searchKw.value, hitCur.value).html);
watch(hitCur, () => nextTick(() => {
  respBox.value?.querySelector<HTMLElement>(`[data-hit-idx="${hitCur.value}"]`)
    ?.scrollIntoView({ block: 'center' });
}));
watch(matchCount, () => { if (searchKw.value) hitCur.value = 1; });

async function copyResp() {
  const v = jqResult.value !== null ? jqResult.value : respParsed.value;
  /* 诚实口径（按 copyText 结果反馈） */
  const ok = await copyText(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  store.notify(ok ? 'success' : 'error', ok ? '已复制响应' : '复制失败');
}

/* ═══ 1379：响应体右键菜单 ═══
   用户原话「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
   响应区此前只有工具行一个「复制」钮；想只取当前这段（已 JQ 过滤后的结果）
   或把请求行搬去 curl/历史，都得手工全选。
   一级只放两条高频动作（复制响应 / 复制请求行），其余收进两个分组 —— 与
   表格右键「一级 ≤2 + 分组父项」的既有约定同形。
   复制范围与工具行「复制」同一取值链（jqResult 优先），不另造口径。 */
const respMenu = ref<{ x: number; y: number } | null>(null);
function openRespMenu(e: MouseEvent) {
  if (!resp.value) return; /* 无响应不出菜单（与工具栏复制钮禁用同判） */
  respMenu.value = { x: e.clientX, y: e.clientY };
}
function onRespMenuKey(e: KeyboardEvent) {
  if (!isMenuKey(e) || !resp.value) return;
  e.preventDefault();
  respMenu.value = menuKeyAnchor(e);
}
function respText(): string {
  const v = jqResult.value !== null ? jqResult.value : respParsed.value;
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}
function respSizeText(): string {
  const n = respText().length;
  return n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
}
const respMenuItems = computed<CcmItem[]>(() => [
  { key: 'copy-resp', label: '复制响应', icon: Copy, run: () => void copyResp() },
  { key: 'copy-reqline', label: `复制请求行（${method.value} ${path.value.trim().slice(0, 28)}）`, icon: Braces, run: () => {
      const line = `${method.value} ${path.value.trim()}`;
      void copyText(line).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制请求行' : '复制失败'));
    } },
  { key: 'export-group', label: '导出与过滤…', icon: FileDown, sep: true, children: [
    { key: 'copy-resp-raw', label: '复制原始响应（绕过 JQ 过滤）', icon: Copy, run: () => {
        const raw = respParsed.value;
        void copyText(typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2))
          .then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制原始响应' : '复制失败'));
      } },
    { key: 'copy-resp-size', label: `复制并显示体积（当前 ${respSizeText()}）`, icon: FileDown, run: () => void copyResp() },
    { key: 'clear-jq', label: '清除 JQ 过滤（回到原始响应）', icon: X, run: () => { jqExpr.value = ''; } },
    { key: 'clear-search', label: '清除响应内搜索高亮', icon: Search, run: () => { searchExpr.value = ''; } },
  ] },
  { key: 'more-group', label: '更多…', icon: Terminal, children: [
    { key: 'open-rawio', label: '查看原始 IO', icon: Terminal, run: () => openRawIo() },
    { key: 'retry', label: '重发本次请求', icon: RefreshCw, run: () => void send() },
  ] },
]);

/* 原始 IO 快查（545 四页同款）——特征 /cluster/raw；判空 rec=null（本页还没
 发过请求）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/raw');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
/* G7-C6：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / chip·历史行级密排 / 亚阶梯不动 */
.rt { display: flex; flex-direction: column; gap: var(--sp-3); position: relative; }
/* 执行进度条贴页顶 */
/* 全局 .card 壳退役（请求/响应两块不再消费 theme 壳类，restFav/devxThreeState
 锚类 rt-req-row/.rt-resp-scroll 零变动）；响应分节 border-top 承接约定①分界 */
.rt-perm-note-readonly { border-color: var(--ac-line); background: var(--ac-soft); color: var(--tx1); }
.rt-perm-note { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-2) var(--sp-4) 0; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
.rt-req { padding: var(--sp-3) var(--sp-4); }
/* 非 ADMIN 数据面口径的按钮旁占位说明（dt-perm-dim 同形态） */
.rt-scope-dim { align-self: center; display: inline-flex; color: var(--muted); cursor: help; font-size: var(--fs-xs); }
/* 窄视口 7 控件必溢出——请求行可换行（row-gap 补换行后行距，gap 仍管同排间距） */
.rt-req-row { display: flex; gap: var(--sp-2); row-gap: var(--sp-1); align-items: center; flex-wrap: wrap; }
.rt-methods button[data-m="DELETE"].on { color: var(--err); }
.rt-methods button[data-m="PUT"].on { color: var(--warn); }
/* T11 复审 M2：.seg 置灰按钮补对比度与禁手——对齐 theme.css .btn:disabled 的 .45 口径 */
.seg button:disabled { opacity: .45; cursor: not-allowed; }
.rt-path { flex: 1; }
.rt-body-wrap { margin-top: var(--sp-3); }
/* body 编辑器高度「高」钮行（右对齐贴编辑器顶，块流自然高不构成恒高兄弟） */
.rt-ed-hd { display: flex; justify-content: flex-end; margin-bottom: var(--sp-1); }
/* .rt-lint/.rt-lint-warn/.rt-lint-err 三条私造规则随同构改用退役
 （theme.css .lint-bar/.lint-bar-warn/.lint-bar-err 单源承接，soft 底语义等值） */
/* body 编辑器弹性（原 180px 写死）：height:100% 在块流卡片中不可解析，由 min-height 兜底——
 180px 原值保底，42vh 视口弹性档（与 SqlConsole/ConfigValidator 同口径），Monaco 内置 RO 自动 layout。
 rest.edH 弹性档后本规则专管 100% 档兜底（后续档值恒 ≥ max(180px,42vh) 不受影响） */
.rt-body-wrap > .rt-body-ed { min-height: max(180px, 42vh); }
/* 编辑器外框退役（约定③， sq-editor/be-card-editor 同语言视图侧
 独立追加——rt-body-ed 即 MonacoEditor 根、携本视图 scope id，scoped 类规则直接命中；
 上方 rt-ed-hd 工具行自承分界）；538 min-height 锚行零触 */
.rt-body-wrap > .rt-body-ed { border: none; border-radius: 0; }
/* 动作组成组贴右：auto 只打组头（收藏），历史/我的权限相邻成员收紧——
 flex 多 auto margin 均分剩余空间会把三钮等距散列（宽视口实测各 175px 间距） */
.rt-hist-btn { margin-left: auto; }
.rt-hist-btn + .rt-hist-btn { margin-left: 0; }
/* 历史弹窗体改用 QueryHistoryPanel——.rt-hist-bar/.rt-hist 系本地行样式随自写实现退役
 （过滤/计数/行布局/相对时间全由面板 qhp-* 承接） */
.rt-spacer { flex: 1; }
.rt-snippets { display: flex; align-items: center; gap: var(--sp-1h); margin-top: var(--sp-3); flex-wrap: wrap; }
.rt-resp { padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border); }
/* 响应条 6 控件同排窄视口必溢出——同请求行补换行 */
.rt-resp-bar { display: flex; align-items: center; gap: var(--sp-3); row-gap: var(--sp-1); margin-bottom: var(--sp-2); flex-wrap: wrap; }
.rt-resp-scroll { max-height: calc(100vh - var(--vh-offset) + 120px); }
/* 搜索定位轮：当前命中可见焦点态 + 命中序号按钮组
 （cur 完整规则在下方 .json-view 段——须带前缀压过 .j-mark 的 color:inherit） */
.rt-hn { display: inline-flex; gap: var(--sp-0); }
.rt-err-pre { color: var(--err); }
/* friendly 人话标题行（pre 保留全文，双轨范式） */
.rt-err-h { font-weight: 600; font-size: var(--fs-sm); margin-bottom: var(--sp-1); }
.rt-waiting { padding: var(--sp-3); color: var(--tx2); font-size: var(--fs-sm); }
/* 复审 M3：C6 合并边角——引导空态图标的内联 opacity/margin 归 scoped（10px → 最近阶梯 --sp-3）。
 .rt-elapsed 规则随裸耗时改用 TookBadge 退役（形态/色档归组件单源） */
/* 固定 260px 改 flex-basis 可收缩（窄视口跟随换行行宽收缩，180px 可用下限兜底） */
.rt-jq { flex: 0 1 260px; min-width: 180px; height: 26px; font-size: var(--fs-xs); }
.rt-search { width: 130px; height: 26px; font-size: var(--fs-xs); }
.rt-mc { font-size: var(--fs-xs); color: var(--tx2); }
.json-view :deep(.j-mark) { background: var(--warn-soft); color: inherit; border-radius: 2px; padding: 0 1px; }
/* 当前命中前景色彩底深字（--tx-on-strong 家族口径）——须带 .json-view 前缀压过
 .j-mark 的 color:inherit（同 0,3,0 特异度靠源序取胜，故置其后），否则命中文字
 继承语法色（key 蓝压橙底可读性差，与查询工作台同元素渲染不一致） */
.json-view :deep(.j-mark-cur) { background: var(--dv-orange); color: var(--tx-on-strong); border-radius: 2px; box-shadow: var(--focus-ring); }

/* 900 紧凑微调档（Workbench 五视图之五）——请求/响应两卡水平侧距 --sp-4 收 --sp-3；
 请求行/响应条/snippet 行 已带 flex-wrap，窄容器换行不重叠，不在此重复 */
@media (max-width: 900px) {
  .rt-req { padding: var(--sp-3); }
  .rt-resp { padding: var(--sp-3); }
}
</style>
