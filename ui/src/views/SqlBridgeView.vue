<template>
  <div class="br-page">
    <div class="br-hd">
      <PageHeader :icon="ArrowLeftRight" title="查询语法桥" subtitle="SQL ↔ DSL ↔ Lucene 三态互转 · 一目了然 · 教你原理">
      <template #actions>
<!-- 页头挂只读当前索引 chip（AnalysisSettingsView 范式；SQL 补全/示例 FROM
 静默消费 store.pickedIdx 却无可视锚，此处补齐；空索引时组件自身不渲染） -->
<CurrentIdxChip />
<button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
<button class="btn ghost sm" @click="loadSample">
  <BookOpen :size="12" /> 加载示例
</button>
<button class="btn primary sm" @click="doAll" :disabled="!sql.trim() || busy">
  <!-- G238：Wand2 单态无在途反馈（767 盘点 D5 实锚=钮 dis 唯一通道）→
 Loader2/Wand2 双态+「转换中…」文案（746 G161/766 G234 族）；kbd 提示保留（快捷键恒语义） -->
  <Loader2 v-if="busy" :size="12" class="spinning" /><Wand2 v-else :size="12" /> {{ busy ? '转换中…' : '一键全转换' }} <span class="kbd inline">⌘⏎</span>
</button>
      </template>
      </PageHeader>
</div>

    <!-- 一键转换失败：内联面板留存 + 重试（失败时两卡旧结果已清空，防误读）；移出工作台（失败态全宽可见）。
 脱 .br-card 大容器卡壳（border+card-bg+radius 退役）→ 全局 .err-bar 形态
 承载（558b pf-err 先例），br-err 锚只留多行富内容顶对齐 + role=alert；.br-err-pre 槽类保留 -->
    <div v-if="convErr" role="alert" class="err-bar br-err" style="margin-bottom:var(--sp-3)">
      <AlertCircle :size="14" />
      <div class="br-err-body">
        <!-- 标题行走 friendlyEsError 人话 + pre 换 errPreHtml v-html 全文双轨
 （SqlConsoleView/SearchSandboxView 同范式；.br-err-pre 类名与面板位置不动）。
 改用双参——errMeta(convErrRaw) 旁路对象读 code/endpoint（convErr 已压串
 读不出），meta 空时输出与单参逐字一致（errPre524 锚），字符串全文回看语义不变 -->
        <div><b>一键转换失败</b> · {{ friendlyConvErr }}</div>
        <pre class="br-err-pre" v-html="errPreHtml(convErr, errMeta(convErrRaw))"></pre>
        <div class="br-err-acts">
          <button class="btn sm" @click="doAll" :disabled="!sql.trim() || busy"><Loader2 v-if="busy" :size="12" class="spinning" />{{ busy ? '转换中…' : '重试' }}</button>
        </div>
      </div>
    </div>

    <!-- 三栏接统一可调工作台（与 DevTools/查询工作台同底座）——
 此前固定等分 grid 不可调；现白得拖拽调宽/三预设/偏好记忆/窄屏自动堆叠 -->
    <WorkbenchLayout :scope="brScope" :panes="BRIDGE_PANES" axis="vertical" mode="bridge">
      <template #pane-bridge-sql>
        <!-- 三 pane 卡壳退役（四刀约定③④）——pane 即容器内容直贴，分界由
 .br-card-hd 既有 border-bottom 承接；竖排轨标题语义落行首横排 br-title（DevTools 0b130b92 同款）。
 ⚠高度链承重墙等效迁移：.br-pane 保 height:100%+flex column（rp-content 已拉伸定高），
 monaco-host 直挂原 flex 字面（sqlLint534:145 锚随改用迁移） -->
        <div class="br-pane">
          <div class="br-card-hd">
            <span class="br-title">分布式 SQL · 商业版 · 数组失败</span>
            <div class="br-hd-r">
              <!-- T4：试跑接 useQueryRun——读秒文案+瞬时取消钮（IndexHub 534 P0-A 同款）；
 busy 仍兼作试跑/转换互斥既有口径（页头钮 disabled 绑定零变化），qr 只供计时/取消/signal -->
              <button class="btn ghost xs" @click="runSql" :disabled="!sql.trim() || busy">
                <Play :size="11" /> {{ qr.running.value ? '试跑中 ' + (qr.elapsedMs.value / 1000).toFixed(1) + 's' : '试跑' }}
              </button>
              <button v-if="qr.running.value" class="btn ghost xs" @click="qr.cancel()"><X :size="11" /> 取消</button>
              <!-- G240：试跑原始响应恒驻入口（Mapping 「原始 JSON」轻形态同构；
 IndexHub P1 形态=失败态也可回看；未试跑无响应=disabled 非 v-if 消失） -->
              <button class="btn ghost xs" aria-label="查看试跑原始响应" title="最近一次试跑的原始响应（成功/不可用/失败现场均可回看）" :disabled="!lastRaw" @click="rawOpen = true"><FileJson :size="11" /></button>
            </div>
          </div>
          <!-- P0-3：划线通道挂点 + 体检提示条（banner 双通道； br-card 壳退役后
 pane 布局结构不动，提示条自动高度不进编辑器高度链；lint 零阻塞不拦试跑/转换）。
 .br-sql-lint 私造形态改用 theme.css .lint-bar 单源（锚并存） -->
          <MonacoEditor ref="brSqlMonaco" v-model="sql" language="sql" height="100%" @execute="doAll" />
          <div v-if="brSqlLint.length" class="lint-bar br-sql-lint lint-bar-warn" role="status">
            <span v-for="(f, i) in brSqlLint" :key="i">· <button type="button" class="br-lint-ln"
              :title="'定位到第 ' + f.line + ' 行'" @click="locateBrLine(f.line)">第 {{ f.line }} 行</button>：{{ f.message }} — {{ f.suggestion }}</span>
          </div>
          <!-- G239：结果条补 role=status（试跑后动态出现，SR 自动播报；lint-bar 族同款） -->
          <div v-if="sqlResult" role="status" class="br-result" :class="{ err: sqlResult.err }">
            <div>
              <b>{{ sqlResult.err ? '❌ 失败' : '✅ 成功' }}：</b>{{ sqlResult.msg }}
              <!-- 1111：与 SQL 控制台同一套「错误定位到手」——锚点 chip/上一版标记 -->
              <template v-if="sqlResult.err">
                <button v-if="brErrPos && !brResultStale" type="button" class="br-err-loc mono" data-test="br-err-locate"
                        :title="'ES 报错位置：第 ' + brErrPos.line + ' 行第 ' + brErrPos.column + ' 列——点击定位到该处'"
                        @click="locateBrErr">定位 {{ brErrPos.line }}:{{ brErrPos.column }}</button>
                <span v-if="brResultStale" class="br-err-stale" data-test="br-err-stale">错误来自上一版 SQL</span>
              </template>
            </div>
            <div v-if="brFnFix && brFnFix.suggestions.length && !brResultStale" class="br-fnfix" role="group" aria-label="相近函数建议">
              <span class="br-fnfix-t">函数 [{{ brFnFix.fn }}] 不存在——相近函数：</span>
              <button v-for="s in brFnFix.suggestions" :key="s.name" type="button" class="btn sm" data-test="br-fn-fix"
                      :title="'替换 SQL 中的 ' + brFnFix.fn + ' 为 ' + s.name"
                      @click="applyBrFnFix(s.name)">{{ s.name }}</button>
            </div>
          </div>
          <!-- W1：试跑结果文本行 → 真表格（表头=cols、行=lastRows 前 20 行）。
 W5：预览裸表换 QRT rows 型——lastCols+lastRows 天然就是
 QRT rows 型二维矩阵，同构度最高（换壳 < 保留壳自补列选/右键/放大三件的成本），
 白得列选（列宽/密度按 storageKey 记忆）/单元格右键菜单（复制值/行 JSON/整表 TSV/
 排序/列管理）/聚焦放大/Ctrl+F 查找/行导航/行内展开/漏斗。三格式复制钮保留卡头：
 QRT 内建整表复制只覆盖预览 20 行，「复制按钮取全量」语义不可让。ISO 日期/数值
 语义档起走 QRT 内建按值采样推断（SQL 无 mapping；预览固定 20 行切片
 与内核采样窗一致）——延续 es_tbl_sem 口径，数据恒 raw（复制/导出不加工）。 -->
          <div v-if="sqlResult && !sqlResult.err && previewRows.length" class="br-preview">
            <div class="br-preview-hd">
              <span class="br-preview-note">仅预览前 {{ previewRows.length }} 行（共 {{ lastRows.length }} 行）——复制按钮取全量</span>
              <button class="btn ghost xs" :disabled="!lastRows.length" @click="copyPreviewMatrix('tsv')" title="复制全部行（TSV：列名作表头）">复制全部（TSV）</button>
              <button class="btn ghost xs" :disabled="!lastRows.length" @click="copyPreviewMatrix('md')" title="复制全部行（Markdown 表，群聊/工单直贴）">Markdown</button>
              <button class="btn ghost xs" :disabled="!lastRows.length" @click="copyPreviewMatrix('json')" title="复制全部行（JSON 数组，逐行对象）">JSON</button>
            </div>
            <QueryResultTable :cols="lastCols" :rows="previewRows" sortable
              storage-key="sqlbridge:preview" max-height="240px" />
          </div>
        </div>
      </template>
      <template #pane-bridge-dsl>
        <div class="br-pane">
          <div class="br-card-hd">
            <span class="br-title">Elasticsearch 原生 JSON · 最完整</span>
            <div class="br-hd-r">
              <button class="btn ghost xs" @click="copyDsl" :disabled="!dsl">
                <Copy :size="11" /> 复制
              </button>
              <button class="btn ghost xs" @click="gotoQuery" :disabled="!dsl">
                <ExternalLink :size="11" /> 到 DSL 页
              </button>
            </div>
          </div>
          <!-- DSL 只读面挂 dsl-assist 白得通道（brDslAssist，字段 hover 白得） -->
          <MonacoEditor :model-value="dsl || '// 点击一键转换后自动生成'" language="json" :readonly="true" height="100%" :dsl-assist="brDslAssist" />
        </div>
      </template>
      <template #pane-bridge-lucene>
        <div class="br-pane">
          <div class="br-card-hd">
            <span class="br-title">query_string 语法 · 数组/nested 全友好</span>
            <div class="br-hd-r">
              <button class="btn ghost xs" @click="copyLucene" :disabled="!lucene">
                <Copy :size="11" /> 复制
              </button>
              <button class="btn ghost xs" @click="gotoLucene" :disabled="!lucene">
                <ExternalLink :size="11" /> 到 Lucene 页
              </button>
            </div>
          </div>
          <MonacoEditor :model-value="lucene || '（从 DSL 抽取 query_string 片段）'" language="lucene" :readonly="true" height="100%" />
        </div>
      </template>
    </WorkbenchLayout>

    <!-- u：页内查询历史（此前只写不显，遗留补齐）——mode=sql 单档过滤
 （与 SqlConsole 共池，Lead 裁决），DslQueryView 弹窗范式；导入/清空入口关闭（同沙盒口径）。
 play=回填草稿并试跑、fill=仅回填 -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（语法桥）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="试跑成功后自动记录（上限 100 条），可一键回填重跑"
        @play="h => replayHistRow(h, true)" @fill="h => replayHistRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- G240：试跑原始响应全文回看（铁律 F）——QRT 只展示 rows/columns=
 「所见非所存」缝隙，此处一键看全文；Mapping 轻形态同构（highlightJson
 转义安全 v-html；rawJson 本身已是 pretty 串） -->
    <n-modal v-model:show="rawOpen" preset="card" title="试跑原始响应 — POST /cluster/sql/lenient" style="width:760px;max-width:94vw" :bordered="false">
      <pre class="mono scroll-y br-raw-pre" v-html="highlightJson(rawJson)"></pre>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="copyRaw"><Copy :size="12" /> 复制全部</button>
          <button class="btn" @click="rawOpen = false">关闭</button>
        </div>
      </template>
    </n-modal>

    <!-- 表格：三者对比 -->
      <div class="br-card wide">
        <div class="br-card-hd">
          <span>三者能力对比</span>
          <span class="br-meta">选择合适的通道，别用错工具打错仗</span>
        </div>
        <!-- G239：sr-only caption（视觉零变化高度零影响；卡头可见标题之外
 的表格语义锚，屏幕阅读器读表前先闻其名） -->
        <table class="br-cmp">
          <caption class="sr-only">三者能力对比：SQL / DSL / Lucene query_string 通道选择</caption>
          <thead>
            <tr>
              <th>能力</th>
              <th>SQL</th>
              <th>DSL</th>
              <th>Lucene query_string</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in COMPARE" :key="c.f">
              <td class="br-cmp-f">{{ c.f }}</td>
              <td :class="'br-cmp-c ' + c.sqlCls">{{ c.sql }}</td>
              <td :class="'br-cmp-c ' + c.dslCls">{{ c.dsl }}</td>
              <td :class="'br-cmp-c ' + c.lcCls">{{ c.lc }}</td>
            </tr>
          </tbody>
        </table>
      </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeftRight, BookOpen, Wand2, Play, Copy, ExternalLink, AlertCircle, History, X, Loader2, FileJson } from 'lucide-vue-next';
import { NModal } from 'naive-ui';

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import { useAppStore } from '../stores/app';
import { useQueryHistoryStore } from '../stores/queryHistory'; /* u：试跑成功记历史（与 SqlConsole 共池） */
import { encodeDslParam } from '../utils/queryHub';
import { copyText } from '../utils/format'; /* W5：fmtNum/epochMsText 随 brCellText 退役（显示层归 QRT 内建） */
import { matrixText } from '../utils/copyMatrix'; /* W1：试跑结果 TSV/MD/JSON 三格式复制（RT/QRT 共用矩阵内核） */
import { dslToLucene } from '../utils/dslToLucene';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核（双轨范式）；：补 errMeta 双参改用 */
import { highlightJson } from '../utils/jsonc'; /* G240：试跑原始响应全文高亮（Mapping 同款） */
import { friendlyEsError } from '../utils/esError'; /* ：错误标题行人话 */
import { usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useQueryRun } from '../composables/useQueryRun'; /* T4：试跑读秒+可取消（ 范式统一件） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue'; /* u：页内历史面板合并共享件（SqlConsole 同范式） */
import MonacoEditor from '../components/MonacoEditor.vue';
import QueryResultTable from '../components/QueryResultTable.vue'; /* W5：预览表换 QRT rows 型（列选/右键/放大/查找内核化） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页头只读当前索引锚 */
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
/* W2 批：SQL 智能补全 provider 迁 utils/sqlCompletion.ts 单例（SqlConsole 同享同一份语言级注册）；
 monaco 实例与字段源仍由本页供给（monaco 单例模块与 MonacoEditor 同实例，字段源幂等缓存） */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useIndexFields } from '../composables/useIndexFields';
import { ensureSqlCompletion, suggestFunctionsFor, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { lintSql } from '../utils/sqlLint'; /* P0-3：SQL 静态 lint */
/* 1111：与 SQL 控制台同源的错误锚点解析（line X:Y → 行列定位） */
import { parseSqlErrorPos } from '../utils/sqlErrorPos';
/* 1123：跨模式历史回放——执行选项摘要 + 语法桥不支持的参数/选项须明示 */
import { describeSqlOpts } from '../utils/sqlOpts';
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-3：划线防抖统一件 */
import { writeStoredRaw } from '../utils/safeJson';
import { useAuthStore } from '../stores/auth'; /* 回放自动试跑的身份/读页门（与 SQL 控制台同源） */

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();

/* 三栏可调工作台声明。W2 批修复「柄在但拖不动」：三 pane 全 'flex' 时
 sizeOf 恒回 minSize + .wl-flex-pane 永久压内联宽，constraintsRecord 排除 flex 后
 预设条不渲染、拖拽置 userTouched 反而关闭自适应。改 sized+flex 混合：
 SQL/Lucene 定宽可拖（进 constraintsRecord → 拖拽/预设/记忆全活），DSL 吃剩余空间。 */
const brScope = { target: store.target || 'host', route: '/sql-bridge', mode: 'bridge', profile: 'standard' as const };
/* 竖排标题轨退役（刀①②，约定：title 置空即不渲染）——34px 侧轨×3
 回收工作区，标题语义落各 pane 行首横排 br-title（DevTools 0b130b92 同款） */
const BRIDGE_PANES: WorkbenchPaneSpec[] = [
  { id: 'bridge.sql', role: 'request', title: '', minSize: 280, defaultSize: 340, collapsible: true },
  { id: 'bridge.dsl', role: 'response', title: '', minSize: 300, defaultSize: 'flex', collapsible: true },
  { id: 'bridge.lucene', role: 'response', title: '', minSize: 260, defaultSize: 320, collapsible: true },
];

/* SQL 草稿跨会话记忆（内容体量不适合塞 URL，落 localStorage） */
const sql = usePref('sqlbridge.sql', '');

/* P0-3：SQL 静态 lint 双通道（SqlConsoleView 同款）——
 ① 编辑器划线：setLineMarkers 行号直射 owner='es-sql-lint'，useDebounceFn 250ms；
 ② 页内 banner：brSqlLint 逐条「第 N 行」提示条（自动高度，去壳后 pane 布局结构不动——
 与 .br-result 既有自动高兄弟同形态，编辑器 flex:1 1 0 min-height:260px 既有弹性不动）。 */
const brSqlMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
/* 1388：带上索引清单——1386 的「FROM 后裸索引名缺双引号」规则靠**精确命中已知索引**
   才敢报（不猜）。桥这边已有 store.indices（同页补全的 FROM 候选同源），此前没传，
   于是同一条 SQL 在控制台会提示、在语法桥不提示——同一条规则两处不一致。 */
const brSqlLint = computed(() => lintSql(sql.value || '', store.indices.map(i => String(i.index || '')).filter(Boolean)));
const queueBrSqlLintMarkers = useDebounceFn(() => {
  brSqlMonaco.value?.setLineMarkers?.(
    brSqlLint.value.map(f => ({ line: f.line, message: f.message + '（' + f.suggestion + '）' })),
    'es-sql-lint',
  );
}, 250);
watch(sql, () => { queueBrSqlLintMarkers(); }, { immediate: true });
/* dsl/lucene 转换输出持久化（此前刷新即丢；按 SQL 文本指纹隔离——同 SQL 恒同转换） */
/* mode 槽承载 SQL 指纹（长度+首尾采样）——同 SQL 恒同转换，换 SQL 即隔离 */
const sqlFingerprint = computed(() => {
  const q = sql.value.trim();
  return q.length + ':' + (q.slice(0, 16) + q.slice(-16));
});
/* .text 解包：dsl/lucene 回到 Ref<string> 语义（模板与 doAll/copy 系零变化） */
const dsl = useScopedDraft('dsl-out', { route: 'sqlbridge', mode: () => sqlFingerprint.value }, '').text;
const lucene = useScopedDraft('lucene-out', { route: 'sqlbridge', mode: () => sqlFingerprint.value }, '').text;
/* 试跑结果落内存（rows/columns 可预览可复制）——此前只报「X 行 × Y 列」即弃。
 W1：preview 文本行/cols 随真表格化退役——展示直接吃 lastRows/lastCols 单一数据源 */
const sqlResult = ref<{ err: boolean; msg: string } | null>(null);
/* 1111：错误锚点/函数纠错绑定失败时的 SQL 快照；改稿后旧位置不可信 → chip/红线撤下，
 结果条保留并标「错误来自上一版 SQL」（SQL 控制台 1109 同语义）。 */
const brResultSql = ref('');
const brErrPos = computed(() => (sqlResult.value?.err ? parseSqlErrorPos(sqlResult.value.msg) : null));
const brResultStale = computed(() => !!sqlResult.value?.err && sql.value !== brResultSql.value);
const brFnFix = computed(() => (sqlResult.value?.err && !brResultStale.value ? suggestFunctionsFor(sqlResult.value.msg) : null));
function locateBrErr() {
  const p = brErrPos.value;
  if (p) brSqlMonaco.value?.revealPosition?.(p.line, p.column);
}
function locateBrLine(line: number) {
  brSqlMonaco.value?.revealPosition?.(line, 1);
}
function applyBrFnFix(name: string) {
  const fn = brFnFix.value?.fn;
  if (!fn) return;
  const re = new RegExp('\\b' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
  sql.value = sql.value.replace(re, name);
  store.notify('info', `已将函数 ${fn} 替换为 ${name}，可重新试跑`);
}
function syncBrErrMarker() {
  const p = brResultStale.value ? null : brErrPos.value;
  brSqlMonaco.value?.setLineMarkers?.(
    p ? [{ line: p.line, message: '执行错误：' + (sqlResult.value?.msg || '') }] : [],
    'es-sql-runerr', 'error',
  );
}
watch(sql, () => { if (sqlResult.value?.err) syncBrErrMarker(); });
/* 保留原始行列（复制全量数据源；表格预览吃前 20 行） */
const lastRows = ref<any[][]>([]);
const lastCols = ref<string[]>([]);
/* W1：预览行集——「仅预览前 20 行」语义保留并明示；复制钮取 lastRows 全量 */
const previewRows = computed(() => lastRows.value.slice(0, 20));
const convErr = ref(''); // 一键转换失败全文，供内联面板回看
/* errPre 双参改用旁路——doAll catch 把 ApiError 压串进 convErr（既有行为不动，
 全文回看语义逐字保留），原始错误对象旁路留存供 errMeta 读 code/endpoint（xm-err 549
 范式，SqlConsole runErrObj 同款）；translate 不可用分支无原始对象，meta 空时输出与
 单参逐字一致（errPre524 锚）；重跑即清 */
const convErrRaw = ref<unknown>(null);
/* 错误标题行人话（pre 保留全文，双轨范式） */
const friendlyConvErr = computed(() => friendlyEsError(convErr.value));
const busy = ref(false);

const COMPARE = [
  { f: '数组字段 SELECT', sql: '❌ 报错', sqlCls: 'no',  dsl: '✅ 原生', dslCls: 'ok',  lc: '✅ 原生', lcCls: 'ok' },
  { f: 'nested 字段',     sql: '❌ 不支持', sqlCls: 'no', dsl: '✅ nested query', dslCls: 'ok', lc: '⚠ 平铺访问', lcCls: 'partial' },
  { f: 'GROUP BY text',   sql: '❌ 报错', sqlCls: 'no',  dsl: '✅ terms agg', dslCls: 'ok', lc: '⚠ 不支持聚合', lcCls: 'partial' },
  { f: '深度分页 (>10000)', sql: '⚠ cursor 有限', sqlCls: 'partial', dsl: '✅ PIT+search_after', dslCls: 'ok', lc: '⚠ 需 from/size', lcCls: 'partial' },
  { f: '模糊/通配语法',   sql: '⚠ LIKE %', sqlCls: 'partial', dsl: '✅ wildcard/fuzzy', dslCls: 'ok', lc: '✅ *?~', lcCls: 'ok' },
  { f: '范围/日期',       sql: '✅ BETWEEN', sqlCls: 'ok', dsl: '✅ range', dslCls: 'ok', lc: '✅ [a TO b]', lcCls: 'ok' },
  { f: '学习成本',        sql: '⭐⭐ 熟悉 SQL 者友好', sqlCls: 'ok', dsl: '⭐⭐⭐⭐ JSON 结构复杂', dslCls: 'partial', lc: '⭐⭐⭐ 语法简洁', lcCls: 'ok' },
  { f: '聚合/GROUP BY',   sql: '✅ COUNT/SUM/AVG', sqlCls: 'ok', dsl: '✅ 所有聚合', dslCls: 'ok', lc: '❌ 不支持', lcCls: 'no' },
  { f: '跨集群搜索',      sql: '⚠ CCS 有限', sqlCls: 'partial', dsl: '✅ CCS 支持', dslCls: 'ok', lc: '✅ CCS 支持', lcCls: 'ok' },
  { f: '总体推荐',        sql: '⚡ 快速探索 · 熟悉 SQL', sqlCls: 'ok', dsl: '👑 生产查询 · 全能', dslCls: 'ok', lc: '🎯 全文/精确 · 数组友好', lcCls: 'ok' },
];

function loadSample() {
  sql.value = `SELECT id, name, status, score
FROM "${store.pickedIdx || 'my-index'}"
WHERE status = 'ACTIVE' AND score >= 60
ORDER BY score DESC
LIMIT 100`;
}

async function doAll() {
  /* G238b：起手 busy 守卫——⌘⏎ 走 Monaco @execute 直达本函数，模板
 disabled 挡不住键盘通道（G同构）；与 runSql 起手对称，在途窗内不重复发 */
  if (!sql.value.trim() || busy.value) return;
  busy.value = true;
  convErr.value = '';
  convErrRaw.value = null; /* ：重跑清 raw 旁路（runErrObj 同款） */
  try {
    /* 1. translate SQL → DSL */
    const r: any = await api.sqlTranslate(JSON.stringify({ query: sql.value }));
    if (r?.available === false) {
      dsl.value = ''; lucene.value = '';
      convErr.value = 'translate 不可用：' + (r.reason || 'unknown');
      store.notify('error', 'translate 失败：' + (r.reason || 'unknown'));
      return;
    }
    dsl.value = JSON.stringify(r, null, 2);
    /* 2. 从 DSL 抽取 query_string 片段（启发式） */
    lucene.value = dslToLucene(r);
  } catch (e: any) {
    /* 失败时清空两卡旧结果：内联面板占位，残留的上轮成果易被误读成输出 */
    dsl.value = ''; lucene.value = '';
    convErr.value = String(e?.message || e);
    convErrRaw.value = e; /* ：原始错误对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    /* toast 裸串并轨 friendlyEsError（obsWave560 FFE 范式） */
    store.notify('error', '转换失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

/* T4：试跑接 useQueryRun（ 范式统一件，IndexHub 534 P0-A 同款）——
 begin() 返回 signal 传 api.sqlLenient 既有 signal 形参（零 api 改动），100ms tick 驱动
 「试跑中 X.Xs」读秒；begin 即作废上一轮控制器。busy 仍兼作试跑/转换互斥口径
 （页头钮 disabled 绑定零变化），qr 只供计时/取消/signal */
const qr = useQueryRun();

/* G240：试跑原始响应旁路留存（内存态，与 sqlResult/lastRows 同生命周期）——
 三态置位：成功/noavail=响应体原文（await 后即置，两分支共用）；异常=error 串（失败现场
 可回看）；AbortError 取消不置位=旧值保留（与「上一轮结果条原样保留」语义一致） */
const rawOpen = ref(false);
const lastRaw = ref<unknown>(null);
const rawJson = computed(() => JSON.stringify(lastRaw.value, null, 2));
function copyRaw() {
  /* 按复制结果反馈 */
  copyText(rawJson.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制原始响应' : '复制失败'));
}

async function runSql() {
  if (!sql.value.trim() || busy.value || qr.running.value) return;
  busy.value = true;
  const signal = qr.begin(); /* 取消以 AbortError 落此 */
  /* 1111：回包锚定实际发出的那一版 SQL（await 期间可能继续改稿） */
  const sqlSnapshot = sql.value;
  try {
    const r: any = await api.sqlLenient(JSON.stringify({ query: sql.value }), signal);
    lastRaw.value = r;
    if (r?.available === false) {
      sqlResult.value = { err: true, msg: r.reason || 'unknown' };
      brResultSql.value = sqlSnapshot;
      syncBrErrMarker();
      return;
    }
    const rows: any[][] = r.rows || [];
    const cols: string[] = r.columns || [];
    lastRows.value = rows;
    lastCols.value = cols;
    sqlResult.value = {
      err: false,
      msg: `返回 ${rows.length} 行 × ${cols.length} 列`,
    };
    brResultSql.value = '';
    brSqlMonaco.value?.setLineMarkers?.([], 'es-sql-runerr', 'error');
    /* u：试跑成功记跨模式历史（mode='sql' 与 SqlConsole 共池，Lead 裁决）；
 索引锚 pickedIdx 优先，缺省解析 FROM 表名（引号壳兼容；解析不到留空由 store 归 undefined） */
    qh.push('sql', sql.value, store.pickedIdx || /\bFROM\s+"?([\w.-]+)"?/i.exec(sql.value)?.[1] || '');
  } catch (e: any) {
    /* 用户主动取消不算错误（ 同语义）：AbortError 静默丢弃——不进 br-result.err 红条，
 只给轻提示（DslQueryView/IndexHub 同款），上一轮结果条原样保留 */
    if (e?.name === 'AbortError') { store.notify('info', '已取消试跑'); return; }
    lastRaw.value = { error: String(e?.message || e) };
    sqlResult.value = { err: true, msg: e?.message || String(e) };
    brResultSql.value = sqlSnapshot;
    syncBrErrMarker();
  } finally { busy.value = false; qr.finish(); }
}

/* ═══ u：页内查询历史（此前只写不显，遗留补齐）═══
 mode='sql' 单档过滤与 SqlConsole 共池（Lead 裁决：语法桥试跑即 SQL 查询）；
 DslQueryView 弹窗范式合并 QueryHistoryPanel 共享件，导入/清空入口关闭（同沙盒口径） */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
/* 1123：与控制台/QueryHub 抽屉同口径显示执行选项摘要；失败红点由共享面板直接渲染 */
const histRows = computed(() => qh.items.filter(i => i.mode === 'sql').map(i => {
  const sub = describeSqlOpts(i.opts);
  return sub ? { ...i, sub } : i;
}));
function replayHistRow(row: { query: string; params?: string; index?: string; opts?: Record<string, unknown> }, runIt: boolean) {
  /* 1123：索引现场跟随（与 SQL 控制台 1085 同语义），避免历史来自 A、顶栏停在 B */
  const idx = row.index || '';
  if (idx && idx !== store.pickedIdx) {
    store.pick(idx);
    store.notify('info', `已切到历史记录索引 ${idx}`);
  }
  const hasParams = !!row.params?.trim();
  const optSub = describeSqlOpts(row.opts);
  sql.value = row.query;
  histOpen.value = false;
  /* 语法桥的试跑只发送 {query}：位置参数与执行选项都无法还原。带这些现场的条目
     只回填、不自动执行，避免用不同口径跑出「回放结果」的假象。 */
  if (hasParams || optSub) {
    const why = hasParams ? '位置参数' : `执行选项（${optSub}）`;
    store.notify('info', `语法桥不支持${why}，已仅回填 SQL；请回 SQL 控制台回放`, { duration: 5200 });
    return;
  }
  if (runIt) runSqlAuto();
}

/* 历史回放自动试跑的身份门（1123 续）：回放载荷可能来自上一账号，probe 未落地时
   me=null，旧 target 的试跑会先发出去（只读 403 噪声 + 结果串号）。手动点「试跑」
   不拦——用户已看到当前界面，后端仍按页面读键裁决。 */
const sqlAutoAllowed = () => auth.authDisabled
  || !auth.probeStarted /* 探测未启动（无鉴权嵌入/测试宿主）视同身份已定，与 store.identityKnown 同口径 */
  || (auth.probed && auth.me != null && auth.canReadPage('search', store.target));
let sqlAutoPending = false;
function runSqlAuto() {
  if (sqlAutoAllowed()) { sqlAutoPending = false; void runSql(); return; }
  sqlAutoPending = true;
}
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!sqlAutoPending || !sqlAutoAllowed()) return;
  sqlAutoPending = false;
  void runSql();
});

/* W1：语义显示层（es_tbl_sem 口径）—— W5 换 QRT 壳后
 显示层归 QRT displayText 内建（epoch 毫秒人性化恒开；ISO 日期本地化/数值千分位右对齐
 走列类型语义档）；brCellText 手写显示函数随壳退役。：brColTypes 宿主推断
 胶水退役——QRT 内建按值采样档（ISO 日期/数值形态占比≥50%）与原胶水口径等价，
 预览固定 20 行切片与内核采样窗一致，行为锁见 tableKernelContracts527。 */

/* TSV 复制合并升级（ W1）：matrixText 三格式（TSV/MD/JSON），
 行集恒 lastRows 全量——预览只截显示不截复制，工单拿到的必须是完整结果 */
function copyPreviewMatrix(fmt: 'tsv' | 'md' | 'json') {
  if (!lastRows.value.length || !lastCols.value.length) return;
  const cols = lastCols.value;
  const text = matrixText({
    rows: lastRows.value,
    cols,
    getVal: (row: any[], c: string) => row[cols.indexOf(c)],
  }, fmt);
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `试跑结果已复制（${fmt.toUpperCase()}，${lastRows.value.length} 行）` : '复制失败'));
}

function copyDsl() {
  if (!dsl.value) return;
  /* 先报成功后异步复制=时序假成功——改为按结果反馈 */
  copyText(dsl.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 DSL' : '复制失败'));
}
function copyLucene() {
  if (!lucene.value) return;
  copyText(lucene.value).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制 Lucene' : '复制失败')); /* */
}
function gotoQuery() {
  if (!dsl.value) return;
  router.push({ path: '/search', query: { mode: 'dsl', dsl: encodeDslParam(dsl.value) } });
}
function gotoLucene() {
  if (!lucene.value) return;
  writeStoredRaw(sessionStorage, 'esquerystudio.lucene.q', lucene.value);
  if (store.pickedIdx) writeStoredRaw(sessionStorage, 'esquerystudio.lucene.index', store.pickedIdx);
  router.push({ path: '/search', query: { mode: 'lucene' } });
}

/* ═══ SQL 智能补全（W2 批：provider 单例迁 utils/sqlCompletion.ts）═══
 注册/析构契约不变：语言级注册（'sql'），挂载 ensure、卸载 dispose（引用计数，
 SqlConsole 共享同一份）。本页只供给字段源：当前索引（store.pickedIdx，loadSample 同源）；
 FROM 表名位字段源由单例模块内部持有。 */
const curFieldsCtx = useIndexFields(() => store.pickedIdx || '');

/* DSL 只读面 dsl-assist 白得通道——fields 复用 SQL 补全同一 useIndexFields 出口
 （curFieldsCtx，模块级缓存共享；挂载 ensure 预热，见 onMounted）。bodyKind 'doc'：该面是
 机器生成的完整转换产物（非用户编写），补全插入语义不存在，'doc' 档键位零候选最静音
 （标 'search' 会在 Ctrl+Space 出查询键骨架噪音——只读面出插不了的建议纯误导）；
 字段 hover「type · path」与档位无关，白得 */
const brDslAssist = { fields: () => curFieldsCtx.fields.value, bodyKind: () => 'doc' as const };

function sqlCtx(): SqlCompletionCtx {
  return {
    indices: () => store.indices,
    pickedIdx: () => store.pickedIdx || '',
    curFields: () => curFieldsCtx.fields.value,
    /* 去 void 包装直返 Promise（契约本就 void|Promise<void>，④值位冷缓存首轮
 await 到位再分派—— ③A3 契约半边补齐） */
    ensureCurFields: () => curFieldsCtx.ensure(),
  };
}

let sqlCompletion: { dispose(): void } | null = null;
onMounted(() => {
  sqlCompletion = ensureSqlCompletion(monaco, sqlCtx);
  void curFieldsCtx.ensure(); /* ：DSL 面字段 hover 预热（幂等+缓存，DevToolsView 同范式；空索引早退零请求） */
});
onBeforeUnmount(() => { sqlCompletion?.dispose(); sqlCompletion = null; });
</script>

<style scoped>
/* .br-hd-l/.br-hd-ic/.br-hd-tt/.br-hd-sub 死规则退役（页头早已由 PageHeader 接管，模板 grep 0 引用） */
.br-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
.br-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
.br-hd-r { display: flex; gap: var(--sp-1h); align-items: center; }
/* 固定等分 grid 退役——三栏布局交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠）；
 .br-card.wide 的 grid-column 语义随之失效（wide 卡已移出工作台），保留类名仅样式兜底 */
/* 三 pane 卡壳退役（四刀约定③④）——pane 即容器内容直贴，分界由 .br-card-hd
 既有 border-bottom 承接；.br-card 壳（bg+border+radius）仅页面级 wide 卡（err 面板/对比表）保留 */
.br-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); overflow: hidden; display: flex; flex-direction: column; }
/* 编辑器弹性（高度链承重墙等效迁移）：pane 根保 height:100%+flex column（rp-content 已拉伸定高），
 host 直挂原 flex 字面（sqlLint534:145 锚随改用迁移）；stacked 档（窄屏上下堆叠）pane 自然高，
 height:100% 失效回落 auto，host 由 min-height 260px 兜底（原值） */
.br-pane { height: 100%; display: flex; flex-direction: column; }
.br-pane > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }
/* (b)：编辑器外框退役（同 av-left 独立追加手法——sqlLint534:147/
 sqlBridgeFlat535:140 逐字锁钉死原行）；pane 卡头 br-card-hd 既有 border-bottom 承接分界，
 组件本体零触 */
.br-pane > :deep(.monaco-host) { border: none; border-radius: 0; }
.br-card.wide { margin-bottom: var(--sp-3); }
.br-card-hd { display: flex; align-items: center; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); gap: var(--sp-2); }
/* G237：tag 族四变体死规则整删（767 S-G237 死扫实锚=模板零引用；
 pillSingleTrack MERGED 字典该类项留作负向防回潮锚——重新长出尺寸/色值会被看守抓 */
/* 竖排轨退役后 br-title 升 sec-t 行首横排档（DevTools .dt-pane-tt 同语言：
 tx1+加重，muted 弱化档退役——它现在是 pane 主标题不是卡内小注） */
.br-title { color: var(--tx1); font-size: var(--fs-sm); font-weight: 600; flex: 1; }
.br-meta { color: var(--muted); font-size: var(--fs-xs); margin-left: var(--sp-3); }
/* 结果条「线+背景差」双保险收敛为背景差单保险——色块底已分组，border-top 删除
 （err 分支同基类治：只覆写 background/color，无自有线） */
.br-result { padding: var(--sp-1h) var(--sp-3); font-size: var(--fs-xs); background: var(--ok-soft); color: var(--ok); }
.br-result.err { background: var(--err-soft); color: var(--err); }
/* 1111：错误锚点 chip / 上一版标记 / 函数纠错行（与 SQL 控制台 .sq-err-loc 同语言） */
.br-err-loc { margin-left: var(--sp-2); padding: 1px var(--sp-1h); font-size: var(--fs-2xs); line-height: 1.5;
  color: var(--err); background: var(--err-soft);
  border: 1px solid var(--err-line); border-radius: var(--r-xs); cursor: pointer; }
.br-err-loc:hover { border-color: var(--err); }
.br-err-stale { margin-left: var(--sp-2); padding: 1px var(--sp-1h); font-size: var(--fs-2xs);
  color: var(--warn); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-xs); }
.br-fnfix { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-top: var(--sp-1h); }
.br-fnfix-t { opacity: .85; }
.br-lint-ln { padding: 0; border: 0; background: none; font: inherit; color: inherit;
  text-decoration: underline dotted; text-underline-offset: 2px; cursor: pointer; }
.br-lint-ln:hover { color: var(--brand); text-decoration-color: var(--brand); }
/* .br-sql-lint 私造形态（含 warn-line 边线）随改用 theme.css .lint-bar 单源退役；
 自动高度 flex none 语义归 .lint-bar，编辑器既有弹性不动 */
.br-cmp { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.br-cmp th, .br-cmp td { padding: var(--sp-1h) var(--sp-2h); border-bottom: 1px solid var(--border); text-align: left; }
.br-cmp th { background: var(--code-bg); font-weight: 400; font-size: var(--fs-xs); }
.br-cmp-f { font-weight: 400; color: var(--fg); width: 20%; }
.br-cmp-c.ok { color: var(--ok); }
.br-cmp-c.partial { color: var(--warn); }
.br-cmp-c.no { color: var(--err); }
/* .br-err 私造红壳（err 色/err-line 边/err-soft 底/私造 padding）随脱卡壳
 合并全局 .err-bar 形态（theme.css :554 单源，558b pf-err 同语言）——只留多行富内容
 顶对齐（icon+body 不随 err-bar 居中），上落位由模板内联 margin 保形 */
.br-err { align-items: flex-start; }
.br-err-body { flex: 1; min-width: 0; }
.br-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
.br-err-acts { margin-top: var(--sp-2); }

/* W1：试跑结果三格式复制工具行；
 W5：预览表格皮（滚动容器/手写表格全家）随换 QRT 壳退役——
 滚动/表头粘顶/数值右对齐归 QRT 内建（max-height 240px 由 props 传内核） */
.br-preview-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-1h) var(--sp-3) 0; flex-wrap: wrap; }
.br-preview-note { font-size: var(--fs-xs); color: var(--muted); margin-right: auto; }
/* G240：原始响应 modal 全文 pre（字体归全局 .mono、滚动归 .scroll-y，
 此处只落限高与内边距两私有量） */
.br-raw-pre { max-height: 60vh; padding: var(--sp-2); font-size: var(--fs-xs); }

/* 窄屏堆叠由 WorkbenchLayout stacked 档自动处理（embedded/compact），
 自制 1100px 断点退役 */

/* 900 紧凑微调档（Workbench 五视图之四）——页侧距 --sp-4 收 --sp-3（顶/底节奏不动）；
 三 pane 卡头（标题+试跑/复制/跳转钮组）窄容器补 wrap，.br-title flex:1 可收缩、钮组整排落到次行 */
@media (max-width: 900px) {
  .br-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .br-card-hd { flex-wrap: wrap; row-gap: var(--sp-1h); }
}
</style>
