<template>
  <div class="ss">
    <!-- 执行中局部进度条（ind-bar 全站范式） -->
    <div class="pg-progress ind-bar" :class="{ on: running }"></div>
    <PageHeader :icon="FlaskConical" title="DSL 搜索沙盒" subtitle="全集群试错：explain/profile/相关性调试" />
    <!-- 顶栏。：card 壳退役（约定③）——裸 lr-bar 行直贴页面流，border-bottom 分界 -->
    <div class="ss-bar lr-bar freeze">
      <div class="ss-bar-l lr-bar-l">
        <!-- 裸 n-select 换统一选择器；反转：页内可写选择器退役换
 只读 CurrentIdxChip——「选索引」唯一可写入口收敛顶栏（架构裁决）。
 留空=全集群语义保留：chip 只在选中时渲染，未选时 indexName 照旧为空串走 _all -->
        <CurrentIdxChip />
        <!-- 三开关补中文释义 title（悬停可读，纯属性追加；explain 响应变大、
 profile 调优排障、auto-highlight 高亮语义一句话说清） -->
        <label class="ss-chk" title="返回每命中的打分解释（_explanation，响应变大）"><input type="checkbox" v-model="opts.explain" /><span>explain</span></label>
        <label class="ss-chk" title="返回各分片执行明细（Profile，调优排障用，响应变大）"><input type="checkbox" v-model="opts.profile" /><span>profile</span></label>
        <label class="ss-chk" title="按查询词自动高亮命中片段"><input type="checkbox" v-model="opts.highlight" /><span>auto-highlight</span></label>
      </div>
      <div class="ss-bar-r lr-bar-r">
        <!-- 裸串「took Xms · hits N」改用 MetaStrip 统一件 + TookBadge 四档语义徽标
 （took 徽标只能在默认插槽——其四档色归统一件，item.value 无从承接组件段；
 顺序随插槽位收敛为 hits 在前，语义无损失）。≥ 前缀（totalGte）并入 hits 值。
 手写 ss-took-sep 分隔与 ss-took-i 弱化包装退役——插槽段挂组件
 同名形态类 .ms-i/.ms-t（sep 自动化归 MetaStrip 组件），样式单一出处 -->
        <MetaStrip v-if="took != null" class="ss-took-ms" :items="ssResultMeta">
          <span class="ms-i ms-t"><i>took</i> <TookBadge :ms="took" /></span>
        </MetaStrip>
        <!-- 页内历史入口（四视图统一，DslQueryView 弹窗范式）——run() 一直在
 push mode=sandbox 历史（此前页内零出口，回放只能去查询工作台跨模式抽屉 -->
        <button class="btn sm ghost" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
        <button class="btn sm ghost" @click="copyCurl" :disabled="!dslBody.trim()" title="复制为 curl 命令，贴终端直接执行">
          <FileCode2 :size="12" /> curl
        </button>
<!-- run 主钮补 Play spinning（文案切换既有——803 池「文案通道 NONE」系
 静态扫描误报实地核真修正；G161 族同图标 spinning 化） -->
        <button class="btn primary sm" @click="run" :disabled="running">
          <Play :size="12" :class="{ spinning: running }" /> {{ running ? '搜索中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : '搜索 (Ctrl+Enter)' }}
        </button>
        <button v-if="running" class="btn sm" @click="qr.cancel()"><XCircle :size="12" /> 取消</button>
        <button aria-label="重置为示例 DSL" class="btn sm ghost" @click="reset" title="重置为示例 DSL"><RotateCcw :size="12" /></button>
      </div>
    </div>

    <!-- 快捷片段 -->
    <div class="ss-snips">
      <span class="ss-snips-l">快捷片段：</span>
      <button v-for="s in snippets" :key="s.name" class="ss-snip" @click="applySnippet(s)">
        <Sparkles :size="10" /> {{ s.name }}
      </button>
    </div>

    <!-- 写死 .ss-grid（1fr 1.2fr + min-height:520px）退役 → WorkbenchLayout 双 pane
 （比例可调/可折叠/预设/记忆/<1100 自动 stacked）：editor=DSL 编辑器，result=结果区 -->
    <WorkbenchLayout :scope="ssScope" :panes="SS_PANES" axis="vertical" mode="sandbox">
      <template #pane-sandbox-editor>
      <!-- 左：DSL 编辑器（轨4：.card 壳退役——pane 即容器内容直贴，卡头
 card-t border-bottom 承接分界；卡头文案与 pane title 同文案双现身随 title 置空消重） -->
      <div class="ss-editor">
        <div class="card-t">
          <FileCode2 :size="13" /> Request DSL
          <span style="margin-left:auto; color:var(--tx2); font-size: var(--fs-xs)">Ctrl+Enter 执行 · Ctrl+S 保存到 localStorage</span>
          <!-- 「在构建器中打开」桥——条件树↔裸 JSON 通道此前只通一半
 （构建器→沙盒有、沙盒→构建器无）。走 ?dsl= 深链通道（DslQueryView onMounted
 消费预填并自动执行，SqlBridge/SqlConsole 同款跳转形态），目标索引随 ?idx= 带去 -->
          <button class="btn ghost xs" :disabled="!dslBody.trim()" @click="openInBuilder"
            title="当前 DSL 带到查询构建器（条件树可视化改写）">
            <ListTree :size="11" /> 在构建器中打开
          </button>
        </div>
        <!-- W-C 批：裸 Monaco 换 JsonArea（合法性圆点+格式化+压缩+复制工具条）。
 @keydown 未声明 emit 经 attrs 透传 .ja 根元素、Monaco textarea 冒泡可达，
 Ctrl+Enter 执行 / Ctrl+S 显式保存行为不变；Ctrl+Enter 走冒泡路径（原 @execute 通道随之退役）。
 dsl-assist 接字段智能补全（fields 源 useIndexFields，与 DslQueryView 同管线） -->
        <JsonArea ref="ssJaRef" v-model="dslBody" fill :dsl-assist="dslAssist" @keydown="onEditorKey" />
        <!-- 执行前静态检查提示条（随输入实时更新，零阻塞不拦执行）——
 红条=match_all 全量扫描（lintDsl 无此规则，此处补语义；：规则本体已
 下沉 dslLint（rule id 'match-all'，warning 档），本页维持独立红条口径，黄条流
 按 rule 排除 match-all 防同文双显）；黄条=lintDsl 非档位条。
 lint findings 全档展示（此前只筛 warning，terms-scalar 等 error 档被吞）——
 error 红条单列（结构必错 ES 直接拒绝），warning/hint/info 黄条并列；编辑器内同步 setMarkers 划线 -->
        <!-- lint 条改用 theme.css .lint-bar 单源（纯类名替换，DOM 保形；
 本页图标 DOM 零触） -->
        <div v-if="isMatchAll" class="lint-bar lint-bar-err" role="alert">
          <AlertCircle :size="11" />
          <span>match_all 全量扫描：不设任何过滤条件会遍历全索引，建议加 term/range 条件缩小范围</span>
        </div>
        <template v-else>
          <div v-if="lintErrors.length" class="lint-bar lint-bar-err" role="alert">
            <AlertCircle :size="11" />
            <span>DSL 检查（错误）：{{ lintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
          <div v-if="lintWarns.length" class="lint-bar lint-bar-warn" role="status">
            <AlertTriangle :size="11" />
            <span>DSL 检查：{{ lintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
        </template>
      </div>
      </template>

      <template #pane-sandbox-result>
      <!-- 右：结果 -->
      <!-- 后：结果区聚焦放大（hits/aggs/explain/profile/raw 五视图整卡聚焦）。
 结果 pane 双标题行合并（约定②二留一）——FocusableSurface headless 档
 （LiveDashboard ld.page 先例）退 fs-head 工具行，放大/还原双态钮并入 card-t 行尾；
 Esc 退出与焦点管理仍由组件统一承担。headless 置 :enabled 后（459 前缀锁保形） -->
      <FocusableSurface pane-id="sandbox.result" title="结果区" :enabled="focusPaneId === 'sandbox.result'" headless
        @update:enabled="v => (focusPaneId = v ? 'sandbox.result' : null)">
      <div class="ss-result">
        <div class="card-t">
          <ListChecks :size="13" /> Response
<!-- 结果视图 seg 升格（容器 role=group+aria-label+钮 aria-pressed，G192 范式随批裁） -->
          <div class="seg" role="group" aria-label="结果视图" style="margin-left:auto">
            <button :class="{ on: view === 'hits' }" :aria-pressed="view === 'hits'" @click="view = 'hits'"><FileText :size="11" /> hits ({{ hits.length }})</button>
            <button :class="{ on: view === 'agg' }" :aria-pressed="view === 'agg'" @click="view = 'agg'" :disabled="!hasAgg" title="DSL 需包含 aggs 聚合才有数据"><PieChart :size="11" /> aggs</button>
            <button :class="{ on: view === 'explain' }" :aria-pressed="view === 'explain'" @click="view = 'explain'; opts.explain = true" title="自动勾选 explain 并显示解释树（请求选项可关）"><Sigma :size="11" /> explain</button>
            <button :class="{ on: view === 'profile' }" :aria-pressed="view === 'profile'" @click="view = 'profile'; opts.profile = true" title="自动勾选 profile 并显示分片耗时（请求选项可关）"><Activity :size="11" /> profile</button>
            <button :class="{ on: view === 'raw' }" :aria-pressed="view === 'raw'" @click="view = 'raw'"><Braces :size="11" /> raw</button>
          </div>
          <!-- 原始 IO 快查——最近一次 /cluster/search-dsl 请求/响应原文（ioRecorder 记录环） -->
          <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（搜索沙盒）" title="最近一次搜索请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
          <!-- 聚焦双态钮（fs-head 行退役后的放大/还原入口，ld.page 先例） -->
          <button class="btn ghost xs" :aria-label="fsResOn ? '还原结果区' : '聚焦结果区'"
            :title="fsResOn ? '还原结果区（Esc 也可退出）' : '聚焦结果区'" @click="fsResOn = !fsResOn">
            <Minimize2 v-if="fsResOn" :size="11" /><Maximize2 v-else :size="11" />
          </button>
        </div>

        <div v-if="running" class="ss-loading">
          <SkeletonBox v-for="i in 5" :key="i" height="42px" round style="margin-bottom:var(--sp-1h)" />
        </div>

        <!-- 失败内联面板：错误全文留痕 + 重试，不再回落就绪空态。
 私造红壳（padding+err 色+err-soft 底，样式 .ss-err 段）退役合并全局
 .err-bar 形态（role=alert 补齐，theme.css 单源； mm/bt/pf 先例）——
 标题/pre/重试钮内容零触，本类只留 icon+body 多行面板顶对齐（mm-err 同款） -->
        <div v-else-if="runErr" role="alert" class="err-bar ss-err">
          <AlertCircle :size="14" />
          <div class="ss-err-body">
            <!-- 标题行走 friendlyEsError 人话，pre 保留错误全文（可复制回查）；
 pre 裸插值换 errPreHtml v-html（含 { 走 highlightJson 着色，否则转义平文） -->
            <div class="ss-err-h">搜索失败 · {{ friendlyRunErr }}</div>
            <pre class="mono ss-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
            <button class="btn sm" @click="run" :disabled="running">{{ running ? '重试中…' : '重试' }}</button>
          </div>
        </div>

        <template v-else-if="response">
          <!-- hits 视图：卡片列表 + 高亮 -->
          <div v-if="view === 'hits'" class="ss-hits">
            <!-- 558b 批：hits 结果面查找三件套（ lc-json-find 同款：过滤+计数+清除）。
 手写 input（inline max-width:220px 违规）改用 SearchFilterBar 统一件
 （ alv-kw-wrap 胞同款；Esc 清空组件内建，placeholder 兼 aria-label）；
 计数与清除钮走组件 slot 胶囊内右翼，hitsKw/shownHits 过滤链零触 -->
            <div class="ss-hits-find" v-if="hits.length">
              <SearchFilterBar v-model="hitsKw" class="ss-hits-find-bar" placeholder="在结果内查找（_id/_index）…">
                <span class="mono ss-hits-count">{{ shownHits.length }}/{{ hits.length }} 条</span>
                <button v-if="hitsKw" class="btn ghost xs" aria-label="清除结果查找" @click="hitsKw = ''">✕</button>
              </SearchFilterBar>
            </div>
            <!-- 558b 批：v-for 换 shownHits（携原始序号 i，explain 展开/收起仍按原 hits 下标定位）。
 _id/_index 裸 mark 改用 MarkText 统一件（splitMark 单源封装，
 mt-mark 全站统一命中底色；textContent 与原文一致、无 v-html 注入面契约不变），
 kw 空时单段平文零扰动 -->
            <div v-for="({ h, i }) in shownHits" :key="h._id + '_' + i" class="ss-hit" tabindex="0"
                 @contextmenu.prevent="openHitMenu($event, h)" @keydown="onHitMenuKey($event, h)" data-row-nav @keydown.self="rowArrowNav">
              <div class="ss-hit-head">
                <b class="mono"><MarkText :text="String(h._index ?? '')" :kw="hitsMarkKw" /></b>
                <span class="mono ss-hit-id">#<MarkText :text="String(h._id ?? '')" :kw="hitsMarkKw" /></span>
                <span class="chip mono ss-hit-score">score {{ h._score?.toFixed(3) ?? '-' }}</span>
                <button v-if="opts.explain && h._explanation" class="btn xs ghost" @click="toggleExplain(i)">
                  <Sigma :size="10" /> {{ expandedExplain === i ? '收起' : 'why?' }}
                </button>
              </div>
              <div v-if="h.highlight" class="ss-hl">
                <div v-for="(v, k) in h.highlight" :key="k" class="ss-hl-row">
                  <span class="ss-hl-k mono">{{ k }}:</span>
                  <span class="ss-hl-v" v-html="hlSafe(Array.isArray(v) ? v.join(' … ') : String(v))"></span>
                </div>
              </div>
              <details class="ss-hit-src">
                <summary class="ss-hit-src-t">_source（点击展开）</summary>
                <JsonTree :data="h._source" />
              </details>
              <div v-if="expandedExplain === i && h._explanation" class="ss-explain">
                <ExplainTree :node="h._explanation" :total="h._explanation.value || 1" :depth="0" />
              </div>
            </div>
            <!-- 裸 .empty 迁 EmptyState compact（0 命中语义，pane 结果区内嵌窄态） -->
            <EmptyState v-if="!hits.length" compact :icon="SearchX" text="无命中结果" hint="检查索引 / 查询语法" />
          </div>

          <!-- agg 视图 -->
          <div v-else-if="view === 'agg'" class="ss-agg">
            <JsonTree v-if="response.aggregations" :data="response.aggregations" tools />
            <!-- 视图保留语义下的空态兜底（停在 agg 重跑无 aggs 查询时不再空渲染） -->
            <EmptyState v-else compact :icon="PieChart" text="无聚合数据" hint="DSL 需包含 aggs 聚合才有结果" />
          </div>

          <!-- explain 视图：整棵 hits[0]._explanation -->
          <div v-else-if="view === 'explain'" class="ss-explain-full">
            <div v-if="hits[0]?._explanation">
              <div class="ss-explain-hint">
                <Info :size="12" />
                <!-- 整句必须包成单个 flex 子项：否则 flex 把「显示…点击各命中卡片的」/<b>why?</b>/
 「查看单独 explain。」各自当独立项挤压换行，容器窄到 330px 时被撕成三栏乱码（实测） -->
                <span>显示第一条命中的 explain 树；点击各命中卡片的 <b>why?</b> 查看单独 explain。</span>
              </div>
              <ExplainTree :node="hits[0]._explanation" :total="hits[0]._explanation.value || 1" :depth="0" />
            </div>
            <!-- 裸 .empty 迁 EmptyState compact -->
            <!-- 视图钮点击已自动勾选对应请求选项：旧响应无载荷时空态改示「重新搜索后生效」
 + 一键重跑（不再提示去勾选与状态矛盾）；无命中时重跑也无数据，维持原文案 -->
            <EmptyState v-else compact :icon="Sigma" text="无 explain 数据"
              :hint="opts.explain && hits.length ? '已勾选 explain，重新搜索后生效' : '需勾选 explain 且有命中'"
              :action-text="opts.explain && hits.length ? '立即重新搜索' : undefined" @action="run" />
          </div>

          <!-- profile 视图：分片耗时（勾选 profile 后端已返回，此前只能去 raw 翻） -->
          <div v-else-if="view === 'profile'" class="ss-profile">
            <JsonTree v-if="response.profile" :data="response.profile" tools />
            <!-- 裸 .empty 迁 EmptyState compact -->
            <EmptyState v-else compact :icon="Activity" text="无 profile 数据"
              :hint="opts.profile ? '已勾选 profile，重新搜索后生效' : '需勾选 profile 且有命中'"
              :action-text="opts.profile ? '立即重新搜索' : undefined" @action="run" />
          </div>

          <!-- raw 视图 -->
          <div v-else class="ss-raw">
            <!-- W-C 批：raw 响应走 highlightJson 范式（转义安全 v-html） -->
            <pre class="mono json-view" v-html="rawHtml"></pre>
          </div>
        </template>

        <!-- 初始引导裸 .empty 迁 EmptyState compact（引导语义：先写 DSL 再执行）；
 补 hint+action 三件套（action 接现成 reset=填示例 DSL） -->
        <EmptyState v-else compact :icon="FileCode2" text="左侧编写 DSL 后 Ctrl+Enter 执行"
          hint="快捷片段一键填入常见查询骨架，留空索引即全集群试跑" action-text="填入示例 DSL" @action="reset" />
      </div>
      </FocusableSurface>
      </template>
    </WorkbenchLayout>

    <!-- 页内查询历史（mode=sandbox 单档过滤，DslQueryView 弹窗范式）。
 play=回填草稿并执行（Ctrl+Enter 同通道）、fill=仅回填（四视图统一语义）；
 导入/清空入口关闭（importable=false/:clearable=false）——本面板只消费 mode 过滤后的
 queryHistory store，全清与导入仍归查询工作台跨模式抽屉，防「此处清空全模式连坐」 -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（DSL 搜索沙盒）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="执行搜索成功后自动记录（上限 100 条），可一键回填重跑"
        @play="h => replayHistRow(h, true)" @fill="h => replayHistRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 /cluster/search-dsl 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
    <CellContextMenu v-if="hitMenu" :x="hitMenu.x" :y="hitMenu.y" :title="hitMenu.title"
      :items="hitMenuItems" @close="hitMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { FlaskConical, Play, RotateCcw, Sparkles, FileCode2, FileText, PieChart, XCircle,
  Sigma, Braces, ListChecks, Info, AlertCircle, AlertTriangle, Activity, SearchX, ListTree, History, Terminal,
  Maximize2, Minimize2 } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
/* 页内历史面板合并 QueryHistoryPanel 共享件（DslQueryView 弹窗范式） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import PageHeader from '../components/PageHeader.vue';
/* 四处裸 .empty 迁 EmptyState compact */
import EmptyState from '../components/EmptyState.vue';
import { useAppStore } from '../stores/app';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useQueryHistoryStore } from '../stores/queryHistory';
import { useQueryRun } from '../composables/useQueryRun';
import { useIdxState } from '../composables/urlState';
import { toCurl } from '../utils/codegen';
import { encodeDslParam } from '../utils/queryHub'; /* ：沙盒→构建器 ?dsl= 桥 */
import { copyText, totalOf, fmtNum } from '../utils/format';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import JsonArea from '../components/JsonArea.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：hits 结果面查找胶囊统一件 */
/* 页内 IndexPicker 退役 → 只读 CurrentIdxChip（选择入口收敛顶栏；useIdxState
 follow 下行跟随与 ?idx= 深链上行语义不变），IndexPicker import 随之孤儿化删除 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import { highlightDslJson } from '../utils/jsonc'; /* ：DSL 语义键 j-clause 着色（highlightJson 语法遍同内核） */
import FocusableSurface from '../components/FocusableSurface.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import JsonTree from '../components/JsonTree.vue';
/* 1316：解释树换共享件——此前本页自造一棵 render 函数版（.ss-ex-*），
 只有「分值 + 描述」两列，没有贡献占比条、没有因子分档（weight/tf/idf/norm…）、没有右键，
 与排名侦探 / 打分解剖用的是两套皮。同一份 _explanation 在两页看起来不一样，
 是「不要造轮子」的典型走样。共享件 props 全带默认值后可直接挂，视图侧只留容器壳。 */
import ExplainTree from '../components/ExplainTree.vue';
/* 双 pane 可调工作台、DSL 静态检查、字段智能补全源、错误人话 */
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { lintDsl } from '../utils/dslLint';
import { useDebounceFn } from '../composables/useDebounceFn'; /* W-D：防抖统一件 */
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（660 范式） */
import { friendlyEsError } from '../utils/esError';
/* 558b 批：ES highlight 片段净化单源（原本地 hlSafe 平移，ResultTable.vue:1345 同构待其解禁同步更新） */
import { hlSafe } from '../utils/highlightSanitize';
/* hits 面 _id/_index 查找命中改用 MarkText 统一件（558b 手写 splitMark
 渲染退役，mt-mark 视觉单源；hintWave558b 源码锁同步更新改锚） */
import MarkText from '../components/MarkText.vue';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误面板 pre v-html 内核；534 收口波：双参改用（errMeta 旁路） */
/* 结果信息行统一件化：MetaStrip 承接 hits 段、TookBadge 承接 took 四档语义徽标 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import TookBadge from '../components/TookBadge.vue';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useAuthStore } from '../stores/auth'; /* 历史回放自动执行的身份/读页门（1124 续） */

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();

const DEFAULT_DSL = `{
  "size": 10,
  "query": {
    "match_all": {}
  },
  "sort": [
    { "_score": "desc" }
  ]
}`;

/* 草稿：DSL 体迁 useScopedDraft（按 集群/索引 隔离），Ctrl+S 保留为显式确认 */
/* 目标索引进 URL，分享/刷新后现场可复原；：与顶栏全局工作索引双向就位 */
const indexName = useIdxState({ follow: true });
const dslBody = useScopedDraft('dsl', {
  route: 'search-sandbox',

  index: () => indexName.value,
}, DEFAULT_DSL).text;
const opts = ref({ explain: false, profile: false, highlight: true });
const running = ref(false);
/* 后：结果区聚焦态 */
const focusPaneId = ref<string | null>(null);
/* 结果区聚焦双态钮（FocusableSurface headless 档，fs-head 行退役后
 放大/还原入口迁结果卡头；set 复用既有 focusPaneId 通道，Esc 退出由组件承担） */
const fsResOn = computed({
  get: () => focusPaneId.value === 'sandbox.result',
  set: (on: boolean) => { focusPaneId.value = on ? 'sandbox.result' : null; },
});
const qr = useQueryRun(); // 长查询读秒 + 取消（ 范式）
const response = ref<any>(null);
/* 禁「失败伪装成就绪空态」：错误全文进内联面板留痕，可重试 */
const runErr = ref('');
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const runErrRaw = ref<unknown>(null);
/* runErr 面板标题行的人话摘要（pre 仍保全文） */
const friendlyRunErr = computed(() => friendlyEsError(runErr.value));
const view = ref<'hits' | 'agg' | 'explain' | 'profile' | 'raw'>('hits');
const expandedExplain = ref<number | null>(null);

/* 可调工作台声明（照 AnalyzeView 形态）——编辑器 pane 可折叠，结果 pane 吃剩余。
 轨4：竖排标题轨退役（v 刀①）——卡头 Request DSL/Response 已是横排承接，
 与 pane title 同文案双现身随置空消重（单源） */
const ssScope = { target: store.target || 'host', route: '/search', mode: 'sandbox', profile: 'standard' as const };
const SS_PANES: WorkbenchPaneSpec[] = [
  { id: 'sandbox.editor', role: 'request', title: '', minSize: 300, defaultSize: 420, collapsible: true },
  { id: 'sandbox.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex' },
];

/* 字段智能补全源——useIndexFields（mappingDetail 出口，与 DslQueryView/FieldPicker 同管线）；
 留空索引（全集群）fields 为空，补全与类型规则零降级。闭包常量落 setup 作用域
 （模板内联对象字面量经 _ctx 代理会取到 undefined，DslQueryView 渗透 spec 红灯实证） */
const { fields: ssFields, ensure: ensureSsFields } = useIndexFields(() => indexName.value || '');
watch(indexName, () => ensureSsFields(), { immediate: true });
/* terms 闭包接线——索引源=indexName 与 ssFields 同源现调现读 */
const ssTerms = useTermsSuggest(() => indexName.value || '');
const dslAssist = { fields: () => ssFields.value, terms: (f: string, p: string) => ssTerms.suggestAsync(f, p) };

/* 执行前静态检查——lintDsl（ctx 传 mapping fields）随输入实时重估，
 只提示不拦截（零阻塞，同 LuceneInput .li-syntax 口径）；JSON 非法时静默
 （JsonArea 圆点已报，执行时后端会给出真实错误）。match_all 全量类警告单列红条 */
const parsedDsl = computed<Record<string, unknown> | null>(() => {
  try {
    const o = JSON.parse(dslBody.value);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
});
const isMatchAll = computed(() => {
  const q = parsedDsl.value?.query as unknown;
  return !!q && typeof q === 'object' && !Array.isArray(q) && 'match_all' in q;
});
/* lint findings 全档展示（此前 warnFindings 只筛 warning——terms-scalar 等
 error 结构必错档被吞）。error 红条单列，其余（warning/hint/info）黄条并列；
 编辑器内同步注入划线（JsonArea 新透传 setMarkers）。 */
const lintFindings = computed(() => {
  const o = parsedDsl.value;
  return o ? lintDsl(o, { fields: ssFields.value }) : [];
});
const lintErrors = computed(() => lintFindings.value.filter(f => f.severity === 'error'));
const lintWarns = computed(() => lintFindings.value.filter(f => f.severity !== 'error' && f.rule !== 'match-all'));

/* lint findings 注入编辑器划线（DslQueryView 范式：debounce 250ms 防每敲一键
 全量 findMatches；非法 JSON 不 lint——JsonArea 圆点已报；info 降级 hint，MonacoEditor
 marker 档只收 warning/hint/error；定位不到的 finding 由 setMarkers 返回 unplaced，
 行内条已全档兜底展示，不静默丢信息）。 */
const ssJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* W-D：手写 setTimeout 防抖换 useDebounceFn 统一件（250ms 同值；卸载自动清理，
 原手写版组件卸载后 timer 仍会触发一次 setMarkers） */
const queueLintMarkers = useDebounceFn(() => {
  const findings = parsedDsl.value ? lintDsl(parsedDsl.value, { fields: ssFields.value }) : [];
  ssJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dslBody, () => { queueLintMarkers(); }, { immediate: true });

const hits = computed<any[]>(() => response.value?.hits?.hits || []);

/* 558b 批：hits 结果面查找（ lucene json-find 三件套同款：过滤+计数+清除）——
 此前 hits 面无任何查找入口，大结果集只能肉眼扫 _id/_index。_id/_index 子串过滤不区分
 大小写；shownHits 携原始序号 i（过滤态 explain 展开/收起仍按原 hits 下标定位不串位）；
 hitsMarkKw 供 splitMark 切分高亮（trim 后空串=无标记零扰动） */
const hitsKw = ref('');
const shownHits = computed<{ h: any; i: number }[]>(() => {
  const kw = hitsKw.value.trim().toLowerCase();
  const all = hits.value.map((h, i) => ({ h, i }));
  if (!kw) return all;
  return all.filter(({ h }) =>
    String(h._id ?? '').toLowerCase().includes(kw) ||
    String(h._index ?? '').toLowerCase().includes(kw));
});
const hitsMarkKw = computed(() => hitsKw.value.trim());

/* 558b 批：hlSafe 净化单源迁 utils/highlightSanitize（import 在顶部 import 区，逻辑逐字
 平移，本视图只消费；ResultTable.vue:1345 同构待其解禁同步更新）。模板净化出口
 v-html="hlSafe(...)" 不变 */
/* W-C 批：raw 视图响应 JSON 高亮（输出已转义）；：换 highlightDslJson——DSL 语义键出
 j-clause，span 只换类名不改 textContent（响应面板 textContent 消费零扰动） */
const rawHtml = computed(() => (response.value ? highlightDslJson(JSON.stringify(response.value, null, 2)) : ''));
const totalHits = computed(() => totalOf(response.value?.hits).value);
const totalGte = computed(() => totalOf(response.value?.hits).gte);
const took = ref<number | null>(null);
const hasAgg = computed(() => !!response.value?.aggregations);

/* 结果信息行 MetaStrip items——hits 段（totalGte 时值带 ≥ 前缀，ES total 为 gte 估计口径）；
 took 段走默认插槽 TookBadge（四档语义色阈值单一出处 utils/format.ts，不再裸 ms） */
const ssResultMeta = computed<MetaStripItem[]>(() => [
  { value: (totalGte.value ? '≥ ' : '') + fmtNum(totalHits.value), label: 'hits' },
]);

/* 快捷片段：一键塞入常见 DSL 骨架 */
interface Snip { name: string; body: string; }
// calendar_interval 是 7.x 语法，6.x 只认 interval——片段跟着当前集群版本出，避免一键塞入就 400
const snippets = computed<Snip[]>(() => [
  { name: 'match_all', body: `{"size":10,"query":{"match_all":{}}}` },
  { name: 'term 精确', body: `{"size":10,"query":{"term":{"字段.keyword":"值"}}}` },
  { name: 'match 分词', body: `{"size":10,"query":{"match":{"字段":"关键词"}},"highlight":{"fields":{"字段":{}}}}` },
  { name: 'bool 组合', body: `{"size":10,"query":{"bool":{"must":[{"match":{"字段":"关键词"}}],"filter":[{"term":{"状态":"已发布"}}],"must_not":[],"should":[]}}}` },
  { name: 'range 时间', body: `{"size":10,"query":{"range":{"createTime":{"gte":"now-7d/d","lte":"now"}}}}` },
  /* 值位类型盲区补档——boolean 字面量与 ip 区间（queryAstOps 类型族对照，此前两面缺席） */
  { name: 'term 布尔', body: `{"size":10,"query":{"term":{"deleted":false}}}` },
  { name: 'range IP', body: `{"size":10,"query":{"range":{"ip":{"gte":"10.0.0.10","lte":"10.0.0.20"}}}}` },
  { name: 'aggs terms', body: `{"size":0,"aggs":{"by_status":{"terms":{"field":"状态.keyword","size":20}}}}` },
  { name: 'aggs 日期直方图', body: `{"size":0,"aggs":{"by_day":{"date_histogram":{"field":"createTime","${store.verBelow('7.0.0') ? 'interval' : 'calendar_interval'}":"day"}}}}` },
]);

function applySnippet(s: Snip) {
  dslBody.value = s.body;
  try { dslBody.value = JSON.stringify(JSON.parse(s.body), null, 2); } catch { /* 片段本身非 JSON 时保留原文即可 */ }
}

function reset() { dslBody.value = DEFAULT_DSL; }

/* 沙盒现场一键变 curl——复现/报障不用手拼命令 */
async function copyCurl() {
  const path = `/${indexName.value.trim() || '_all'}/_search`;
  if (await copyText(toCurl('POST', path, dslBody.value))) store.notify('success', '已复制 curl 命令');
}

/* 沙盒→构建器桥——条件树↔裸 JSON 双向通道补齐（此前构建器→沙盒有、
 沙盒→构建器断头）。?dsl= 入站契约已存在（DslQueryView onMounted atob 解码预填+自动执行，
 encodeDslParam 与其解码互为逆运算；SqlBridge/SqlConsole 同款 router.push 形态）。
 目标索引随 ?idx= 带去（留空不带，保持全集群语义）；mode=dsl 直落构建器分页 */
function openInBuilder() {
  router.push({
    path: '/search',
    query: {
      mode: 'dsl',
      ...(indexName.value.trim() ? { idx: indexName.value.trim() } : {}),
      dsl: encodeDslParam(dslBody.value),
    },
  });
}

async function run() {
  if (running.value) return;
  running.value = true;
  response.value = null;
  runErr.value = '';
  runErrRaw.value = null;
  took.value = null;
  expandedExplain.value = null;
  const signal = qr.begin();
  try {
    // 若开启 auto-highlight 且 query 中含 match/match_phrase 但无 highlight，则自动追加
    let body = dslBody.value;
    if (opts.value.highlight) {
      try {
        const obj = JSON.parse(body);
        if (obj.query && !obj.highlight && /"match(_phrase)?"/.test(body)) {
          obj.highlight = { fields: { '*': {} }, pre_tags: ['<em class="hl">'], post_tags: ['</em>'] };
          body = JSON.stringify(obj, null, 2);
        }
      } catch { /* 用户 DSL 非法 JSON 时跳过自动高亮，让后端报出真实语法错误 */ }
    }
    const r = await api.searchDsl(indexName.value || undefined, body, {
      explain: opts.value.explain, profile: opts.value.profile,
    }, signal);
    response.value = r;
    took.value = r?.took ?? null;
    /* 视图保留用户当前选择（重跑动线：explain/profile 空态重跑钮执行后留在原视图看新载荷）；
     「命中 0 且有 aggs 自动切 agg」引导保留 */
    if (!hits.value.length && hasAgg.value) view.value = 'agg';
    /* 执行成功记跨模式历史（原始 Request DSL + 目标索引，留空=全集群） */
    /* 记录查询耗时 */
    useQueryHistoryStore().push('sandbox', dslBody.value, indexName.value.trim() || undefined, took.value ?? undefined);
  } catch (e: any) {
    /* 主动取消不报失败（useQueryRun 契约「abort 后视图 catch 分支丢弃」；DslQueryView 取消甄别同语义）：
     轻提示即返，错误面板与 error toast 留给真失败 */
    if (e?.name === 'AbortError') { store.notify('info', `已取消搜索（${(qr.elapsedMs.value / 1000).toFixed(1)}s）`); return; }
    runErr.value = String(e?.message || e);
    runErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    store.notify('error', '搜索失败：' + friendlyEsError(String(e?.message ?? e))); /* ：面板 friendlyRunErr 已友好，toast 裸串并轨（BoostTunerView:347 口径） */
  } finally {
    running.value = false;
    qr.finish();
  }
}

/* 页内历史回放/回填——play=回填草稿并执行（Ctrl+Enter 同通道）、fill=仅回填。
 草稿通道=useScopedDraft dslBody（按集群/索引隔离），与手工编辑同一条写入路径 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'sandbox'));
function replayHistRow(row: { query: string }, runIt: boolean) {
  dslBody.value = row.query;
  histOpen.value = false;
  if (runIt) runAuto();
}

/* 历史回放自动执行的身份门（1124 续）：回放载荷可能来自上一账号，probe 未落地时旧 target
   的检索会先发出去。手动点「执行」不拦，后端仍按 search 页读键裁决。 */
const runAutoAllowed = () => auth.authDisabled
  || !auth.probeStarted /* 探测未启动（无鉴权嵌入/测试宿主）视同身份已定，与 store.identityKnown 同口径 */
  || (auth.probed && auth.me != null && auth.canReadPage('search', store.target));
let runAutoPending = false;
function runAuto() {
  if (runAutoAllowed()) { runAutoPending = false; void run(); return; }
  runAutoPending = true;
}
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!runAutoPending || !runAutoAllowed()) return;
  runAutoPending = false;
  void run();
});

/* 原始 IO 快查（545 四页同款）——特征 /cluster/search-dsl；判空 rec=null（本页
 还没跑过搜索）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/search-dsl');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ═══ 命中行右键（此前只能靠行内按钮）═══
 一级放两项高频（复制 _id / 复制 _source JSON）+ 一个分组父项；与「排序/筛选」解耦——
 沙盒是试错场，行级动作以"带回本地复现"为主。 */
const hitMenu = ref<{ x: number; y: number; title: string; h: any } | null>(null);
function openHitMenu(e: MouseEvent, h: any) {
  hitMenu.value = { x: e.clientX, y: e.clientY, title: '# ' + String(h?._id ?? ''), h };
}
function onHitMenuKey(e: KeyboardEvent, h: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  hitMenu.value = { ...menuKeyAnchor(e), title: '# ' + String(h?._id ?? ''), h };
}
const hitMenuItems = computed<CcmItem[]>(() => {
  const h = hitMenu.value?.h;
  if (!h) return [];
  const hl = h.highlight && Object.keys(h.highlight).length
    ? { key: 'hl', label: '复制高亮片段 JSON', run: () => { void copyText(JSON.stringify(h.highlight, null, 2)); } }
    : null;
  const items: CcmItem[] = [
    { key: 'copyId', label: '复制 _id', run: () => { void copyText(String(h._id ?? '')); } },
    { key: 'copySrc', label: '复制 _source JSON', run: () => { void copyText(JSON.stringify(h._source ?? {}, null, 2)); } },
    {
      key: 'more', label: '更多…', children: [
        { key: 'copyIdx', label: '复制 _index', run: () => { void copyText(String(h._index ?? '')); } },
        { key: 'copyScore', label: '复制 _score', run: () => { void copyText(String(h._score ?? '')); } },
        ...(hl ? [hl] : []),
      ],
    },
  ];
  return items;
});
function toggleExplain(i: number) {
  expandedExplain.value = expandedExplain.value === i ? null : i;
}

function onEditorKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault(); /* useScopedDraft 已自动持久化，这里只做显式确认提示 */
    store.notify('success', 'DSL 已保存到浏览器');
  }
}
/* Ctrl+Enter 只在编辑器内监听（onEditorKey）。
 此前额外挂了 window 级监听，与编辑器监听叠加会一次触发两回 run()，已移除。 */
onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  /* 五个送达入口（历史回放/收藏/模板库/远程集群/BoostTuner）经一次性通道送达沙盒：
   esquerystudio.sandbox.body 与 ss_dsl_body（sessionStorage；localStorage 旧落点残留读后清不再消费）。
   送达必达——非默认旧稿先暂存（esquerystudio.sandbox.prev + toast 一键找回）再覆盖，
   与 DSL 页回放的覆盖保护同语义 */
  const legacy = sessionStorage.getItem('esquerystudio.sandbox.body') || sessionStorage.getItem('ss_dsl_body');
  removeStoredRaw(sessionStorage, 'esquerystudio.sandbox.body');
  removeStoredRaw(sessionStorage, 'ss_dsl_body');
  removeStoredRaw(localStorage, 'ss_dsl_body');
  if (legacy) {
    const cur = dslBody.value;
    if (cur && cur !== legacy && cur !== DEFAULT_DSL) {
      writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.prev', JSON.stringify({ idx: indexName.value, dsl: cur }));
      store.notify('info', '已载入新查询，你之前编辑的 DSL 已暂存', {
        action: { label: '恢复我的 DSL', onClick: () => { dslBody.value = cur; } },
        duration: 10000,
      });
    }
    dslBody.value = legacy;
  }
});
</script>

<style scoped>
.ss { display: flex; flex-direction: column; gap: var(--sp-2h); height: 100%; position: relative; }
/* 执行进度条贴页顶 */
/* .ss-title 死规则退役（卡头已用全局 .card-t，模板 grep 0 引用）。
 card 壳退役——裸行只留竖距与分界线，横距归页面流（14px 侧距随壳退役） */
.ss-bar { padding: var(--sp-2h) 0; border-bottom: 1px solid var(--line); }
/* 结果信息行改用 MetaStrip+TookBadge——基础形态归组件，插槽段（took 徽标）挂组件同名
 形态类 .ms-i/.ms-t；：手写 ss-took-sep/.ss-took-i 三条 scoped 规则退役，
 sep 自动化与形态归 MetaStrip 组件单一出处 */
.ss-took-ms { flex: none; }
.ss-chk { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; }

.ss-snips { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; padding: var(--sp-1); }
.ss-snips-l { font-size: var(--fs-xs); color: var(--tx2); }
.ss-snip {
  display: inline-flex; align-items: center; gap: var(--sp-1); padding: 3px var(--sp-2);
  font-size: var(--fs-xs); background: var(--bg2); border: 1px solid var(--line);
  border-radius: 10px; color: var(--tx1); cursor: pointer; transition: all var(--tr);
}
.ss-snip:hover { border-color: var(--ac); color: var(--ac-hi); background: var(--ac-soft); }

/* .ss-grid（1fr 1.2fr + min-height:520px）退役——双栏交给 WorkbenchLayout
 （pane 内 rp-content 转纵向 flex，编辑器/结果卡吃满 pane）；1100px 自制断点随之删除，
 窄视口 stacked 由 WorkbenchLayout 自动处理 */
.ss :deep(.rp-content) { display: flex; flex-direction: column; }
/* 轨4：.card 全局壳随模板类退役（四刀约定③④）——flex 链本体保留零变动；
 卡头转 fs-head 语言（DevTools .dt-pane-tt 同款）：行首横排 + border-bottom 承接分界，
 内容直贴 pane（Kibana 控制台同语言）；card-t 全局档无 padding/border，本地补齐 */
.ss-editor, .ss-result { display: flex; flex-direction: column; overflow: hidden; flex: 1 1 auto; min-height: 0; }
.ss-editor > .card-t, .ss-result > .card-t { padding: var(--sp-2) var(--sp-3); margin-bottom: 0; border-bottom: 1px solid var(--border); flex-shrink: 0; font-size: var(--fs-sm); }
/* .ja 编辑器外框退役（约定③，AnalysisSettings as-card-raw:同语言）
 ——分界由 .ss-editor > .card-t 既有 border-bottom 承接（已补），radius 随先例归零；
 组件本体零触，视图侧覆盖。纯视觉，flex/高度链零变动 */
.ss-editor :deep(.ja) { border: none; border-radius: 0; }
/* lint 体检提示条私有形态（row 版 display/gap/padding/border-top + svg 内衬 +
 warn/err 底色）退役 → theme.css .lint-bar 单源（模板纯类名改用，DOM 保形） */
.ss-loading { padding: 14px; }
/* .ss-err 私造红壳（padding+err 色+err-soft 底）退役合并 theme.css .err-bar
 （role=alert； mm-err 先例同款）——本组只留 icon+body 多行面板顶对齐
 （err-bar align-items:center 对富内容不对，抵掉即顶对齐；mm-err 同口径） */
.ss-err { align-items: flex-start; }
.ss-err-body { flex: 1; min-width: 0; }
.ss-err-h { font-weight: 400; font-size: var(--fs-sm); margin-bottom: var(--sp-1); }
.ss-err-pre { font-size: var(--fs-xs); margin: 0 0 var(--sp-2); white-space: pre-wrap; word-break: break-word; color: var(--tx1); max-height: 200px; overflow: auto; }

.ss-hits { overflow-y: auto; padding: var(--sp-2) var(--sp-3); flex: 1; }
/* 558b 批：hits 结果面查找条（ .lc-json-find 同形态） */
.ss-hits-find { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
/* sfb 落位类挂 SearchFilterBar 根（alv-kw-wrap 胞同款）——inline max-width:220px
 违规退役归此类；mono 字号经根继承进 .sfb-i（原 inp mono 皮保真），内衬贴胶囊原密度 */
.ss-hits-find-bar { flex: none; width: 220px; padding: 0 var(--sp-2); font-family: var(--mono); font-size: var(--fs-xs); }
.ss-hits-count { font-size: var(--fs-xs); color: var(--tx2); white-space: nowrap; }
/* .ss-hit-head mark 私有样式退役——_id/_index 命中高亮改用 MarkText，
 mt-mark 组件单源承接（warn 底/tx-on-strong/2px 圆角/0 1px 内衬同值，全站统一命中底色） */
.ss-hit { padding: var(--sp-2h) var(--sp-3); border-bottom: 1px solid var(--line); }
.ss-hit-head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1h); flex-wrap: wrap; }
.ss-hit-id { color: var(--tx2); font-size: var(--fs-xs); }
.ss-hit-score { background: var(--info-soft); color: var(--info); border: 0; }
.ss-hl { background: var(--bg2); border-left: 2px solid var(--warn); padding: var(--sp-1h) var(--sp-2h); border-radius: var(--r-xs); margin-bottom: var(--sp-1h); }
.ss-hl-row { font-size: var(--fs-xs); padding: var(--sp-0) 0; }
.ss-hl-k { color: var(--tx2); margin-right: var(--sp-1h); }
.ss-hl-v :deep(em.hl) { background: var(--warn-soft); color: var(--warn); font-style: normal; padding: 0 var(--sp-0); border-radius: 2px; font-weight: 600; }
.ss-hit-src { margin-top: var(--sp-1); }
.ss-hit-src-t { cursor: pointer; font-size: var(--fs-xs); color: var(--tx2); padding: 3px 0; }
.ss-hit-src-t:hover { color: var(--ac-hi); }
.ss-hit-src pre { max-height: 260px; overflow: auto; background: var(--bg1); padding: var(--sp-2); border-radius: var(--r-xs); font-size: var(--fs-xs); }
/* 聚焦面内限高解除（404 同款）——ss-err-pre/ss-hit-src pre 在 sandbox.result
 聚焦面内，放大后仍被 200/260px 限高裁在面顶部（有滚动但浪费整面空间）；聚焦态解除随面拉伸。 */
.fs-active .ss-err-pre, .fs-active .ss-hit-src pre { max-height: none; flex: 1 1 auto; }

.ss-explain { margin-top: var(--sp-1h); padding: var(--sp-2); background: var(--bg2); border-radius: var(--r-xs); }
.ss-explain-full { padding: var(--sp-3); overflow: auto; }
.ss-profile { padding: var(--sp-3); overflow: auto; }
/* flex-start：整句折成两行时图标须对齐首行，center 会让图标飘到两行正中 */
.ss-explain-hint { display: flex; align-items: flex-start; gap: var(--sp-1h); color: var(--tx2); font-size: var(--fs-xs); padding: var(--sp-1) 0 var(--sp-2h); }
.ss-explain-hint > svg { flex: none; margin-top: var(--sp-0); }
/* 1316：.ss-ex-* 六条 :deep 规则随自造树退役——皮归 components/ExplainTree.vue 单源
 （缩进/占比条/因子档/右键三页一致）。保留 .ss-explain 内边距与 .ss-explain-full 滚动壳。 */

.ss-agg pre, .ss-raw pre { flex: 1; overflow: auto; padding: var(--sp-3); margin: 0; font-size: var(--fs-xs); }
/* scoped .empty 覆盖（26px 紧凑留白）随四处空态迁 EmptyState compact 一并退役，留白归组件 */

/* 900 紧凑微调档（Workbench 五视图之一：pane 堆叠已由 WorkbenchLayout <1100 JS 档
 兜底；lrBarSingleTrack 裁决=.ss-bar-r 局部 wrap 规则退役——子栏 flex/align/
 gap 一律归 lr-bar 骨架单源，骨架既有 wrap 兜底已覆盖窄宿主，本页不再自携）。
 .ss-bar 900 侧距收窄档随 card 壳退役删除——裸行横距归页面流，窄宿主换行归 lr-bar wrap */

/* 900 紧凑微调档重立（ 口径；552 出册后 W4 实裁补档）——本页零
 grid-template-columns（单列化无对象），唯两卡头工具群 900 下横排挤压（编辑器卡头
 快捷键提示+构建器钮、结果卡头 seg 五视图钮+原始 IO+聚焦钮），允许 wrap 换行即安全
 （528 W-E「只加 CSS 零结构动」口径）；pane 堆叠归 WorkbenchLayout <1100 JS 档、
 lr-bar/snips/hit 头 wrap 兜底在档，不重复收。mediaVerdict565 锁档 */
@media (max-width: 900px) {
  .ss-editor > .card-t, .ss-result > .card-t { flex-wrap: wrap; row-gap: var(--sp-1); }
}
</style>
