<template>
  <div class="lc-page">
    <!-- 执行中局部进度条（ind-bar 全站范式） -->
    <div class="pg-progress ind-bar" :class="{ on: busy }"></div>
    <div class="lc-hd">
      <PageHeader :icon="SearchCode" title="Lucene 查询（query_string）" subtitle="数组/nested/text 全友好 · 绕过 ES-SQL 硬伤 · 分布式无损">
      <template #actions>
        <div class="lc-hd-r">
<!-- W4-T14：构建器前置入口——lucene 文本包装 query_string 走 ?dsl= 通道预填构建器 -->
<button class="btn ghost sm" @click="openInBuilder" title="转成 DSL 在构建器中打开（query_string 包装，现场尽量预填）">
  <ListTree :size="12" /> 在构建器中打开
</button>
<!-- 两钮 title 改随态三元（SqlConsole 执行钮 525 W10 同语言）——479 禁用原因
 契约保留在 else 支（缺索引/缺查询词仍见禁用原因），条件齐备时出功能描述 -->
<!-- 字段体检在途双通道（spinning+「体检中…」）+主执行钮补 Play spinning
 （文案切换既有）+重试钮 文案通道——G161 族，803 池①横切。在途示能各随其链
 （SqlConsole 同语言）：体检示能随 schemaBusy、执行读秒/取消钮随 qr.running，
 互斥闸门（disabled）保持共享 busy -->
<button class="btn ghost sm" :title="index ? '探测当前索引字段，提前提醒 SQL 失能字段（在 Lucene 里不受影响）' : '请先选择索引'" @click="doSchema" :disabled="!index || busy">
  <ShieldAlert :size="12" :class="{ spinning: schemaBusy }" /> {{ schemaBusy ? '体检中…' : '字段体检' }}
</button>
<button class="btn ghost sm" @click="showSyntax = !showSyntax">
  <BookOpen :size="12" /> 语法手册
</button>
<button class="btn ghost sm" @click="copyLink" title="URL 即查询现场：复制链接发同事，打开即复现">
  <Link2 :size="12" /> 复制链接
</button>
<!-- 页内历史入口（四视图统一，DslQueryView 弹窗范式）——doRun 一直在
 push mode=lucene 历史（此前页内零出口 -->
<button class="btn ghost sm" data-test="open-hist" @click="histOpen = true" title="查询历史"><History :size="12" /> 历史</button>
<button class="btn ghost sm" @click="doFav" :disabled="!qs.trim()">
  <Star :size="12" /> 收藏
</button>
<button class="btn primary sm" :title="index && qs.trim() ? '执行 Lucene 查询' : '请先选择索引并输入查询语句'" @click="doRun" :disabled="!index || !qs.trim() || busy">
  <Play :size="12" :class="{ spinning: qr.running.value }" /> {{ qr.running.value ? '执行中（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）…' : '执行' }} <span class="kbd inline">⏎</span>
</button>
<button v-if="qr.running.value" class="btn sm" @click="qr.cancel()"><X :size="12" /> 取消</button>
        </div>
      </template>
      </PageHeader>
    </div>

    <!-- 写死 .lc-grid 双栏退役 → WorkbenchLayout 双 pane（比例可调/可折叠/预设/记忆，
 <1100 自动 stacked，自制 @media 断点删除）。editor pane=条件区+语法模板+速查+体检警告
 （纵向卡片栈），result pane=结果区；60vh 硬顶交 pane 撑满 -->
    <WorkbenchLayout :scope="lcScope" :panes="LC_PANES" axis="vertical" mode="lucene">
      <template #pane-lucene-editor>
      <div class="lc-pane-stack">
      <!-- 轨4：.lc-card 局部壳退役（四刀约定③④）——pane 已是容器，内容直贴，
 分界由 .lc-card-hd border-bottom 承接；warn 块为语义告警框（红框语义同族）自持边框 -->
      <!-- DSL→Lucene 翻译缺失常驻提示：进站那一刻的 toast 看完就没了，刷新更是什么都不剩，
 用户会拿着「少了条件」的 query_string 去跑还以为等价。这里把它做成可关闭的常驻条，
 逐条列出 query_string 表达不了的子句名，并给出换通道指引。 -->
      <div v-if="carriedLossy.length" class="lc-lossy" role="status">
        <AlertTriangle :size="13" />
        <div class="lc-lossy-body">
          <b>这份查询从 DSL 翻译而来，但有 {{ carriedLossy.length }} 处 query_string 表达不了：</b>
          <span class="lc-lossy-list mono">{{ carriedLossy.join('、') }}</span>
          <span class="lc-lossy-hint">这些条件当前缺失——需要完整语义请回查询工作台用 DSL 通道执行。</span>
        </div>
        <button class="btn ghost xs lc-lossy-x" aria-label="关闭翻译缺失提示" title="关闭提示" @click="carriedLossy = []"><X :size="12" /></button>
      </div>
      <div class="lc-editor">
        <div class="lc-card-hd">
          <div class="lc-inp-line">
            <label class="lc-inp"><span>index</span>
              <!-- 页内 IndexPicker 退役换只读 CurrentIdxChip——「选索引」唯一可写
 入口收敛顶栏（架构裁决）；useIdxState follow 下行跟随不变，未选索引走下方
 「先在顶栏选择一个索引」空态（DslQueryView 同款范式） -->
              <CurrentIdxChip />
            </label>
            <!-- 558b 批：size/from/order 裸 label 补中文释义 title（悬停可读，纯属性追加） -->
            <label class="lc-inp"><span title="每页返回条数 · 上限 10000">size</span>
              <input :value="size" type="number" min="1" max="10000" class="lc-ii sm" @change="onSizeInput" />
            </label>
            <label class="lc-inp"><span title="跳过条数 · 翻页偏移">from</span>
              <input v-model.number="from" type="number" min="0" class="lc-ii sm" />
            </label>
            <!-- size/from/order 三件套补齐第四件——sort 裸 label 挂中文释义 title -->
            <label class="lc-inp"><span title="排序字段（可排序类型，_score/_doc 可手输）">sort</span>
              <!-- type-filter 只出可排序类型（同 PIT/构建器排序行口径）；伪字段 _score/_doc 手输保留。
 排序场景 date/long 提前（时间与数值是最常排序族） -->
              <FieldPicker v-model="sortField" :index="index" :type-filter="SORTABLE_TYPES" :type-priority="['date','long']" placeholder="ts / @timestamp" />
            </label>
            <label class="lc-inp"><span title="排序方向 desc 降序 asc 升序">order</span>
              <select v-model="sortOrder" class="lc-ii sm">
                <option value="desc">desc</option>
                <option value="asc">asc</option>
              </select>
            </label>
          </div>
        </div>
        <!-- W2 ：主查询框换 LuceneInput 三段补全（字段/terms/op 提示）。
 原 textarea 的 Ctrl+Enter 执行语义由 @enter 承接——面板关时 Enter 透发即执行；
 弹层有候选时 Enter=回填不执行（补全与执行不打架）。 -->
        <div class="lc-qwrap">
          <LuceneInput v-model="qs" :index="index" @enter="doRun" placeholder-value="*"
            placeholder="+status:ACTIVE tags:(red OR blue) name:hello*  或  * （全部）" />
        </div>
      </div>

      <div class="lc-tpl">
        <div class="lc-card-hd">Lucene 语法模板</div>
        <ul class="lc-tpl-ul">
          <li v-for="t in TEMPLATES" :key="t.k" @click="qs = t.q" role="button" tabindex="0" @keydown.enter.prevent="qs = t.q" @keydown.space.prevent="qs = t.q">
            <span class="lc-tpl-k">{{ t.k }}</span>
            <code class="lc-tpl-c">{{ t.q }}</code>
            <span class="lc-tpl-d">{{ t.d }}</span>
          </li>
        </ul>
      </div>

      <div v-if="showSyntax" class="lc-syntax">
        <div class="lc-card-hd">query_string 速查手册</div>
        <div class="lc-syn-body">
          <div class="lc-syn-col">
            <div class="lc-syn-tt">基础</div>
            <ul>
              <li><code>field:value</code> 精确</li>
              <li><code>field:"quoted phrase"</code> 短语</li>
              <li><code>*</code> 匹配全部</li>
              <li><code>_exists_:field</code> 字段存在</li>
            </ul>
          </div>
          <div class="lc-syn-col">
            <div class="lc-syn-tt">组合</div>
            <ul>
              <li><code>+must -mustnot should</code></li>
              <li><code>a AND b</code> / <code>a OR b</code> / <code>NOT a</code></li>
              <li><code>(a OR b) AND c</code></li>
              <li><code>field:(a OR b OR c)</code></li>
            </ul>
          </div>
          <div class="lc-syn-col">
            <div class="lc-syn-tt">范围/通配/模糊</div>
            <ul>
              <li><code>age:[10 TO 20]</code> 闭区间</li>
              <li><code>age:{10 TO 20}</code> 开区间</li>
              <li><code>name:hel*</code> 前缀通配</li>
              <li><code>name:h?llo</code> 单字符</li>
              <li><code>name:hello~2</code> 模糊（编辑距离）</li>
              <li><code>msg:"quick fox"~5</code> 邻近</li>
            </ul>
          </div>
          <div class="lc-syn-col">
            <div class="lc-syn-tt">加权/转义</div>
            <ul>
              <li><code>title:hello^2</code> boost</li>
              <li><code>\+</code> / <code>\-</code> / <code>\/</code> 转义</li>
              <li><code>2024-01-01</code> 直接写 ISO 日期</li>
            </ul>
          </div>
        </div>
      </div>

      <div v-if="warnings.length" class="lc-warn">
        <ShieldAlert :size="14" />
        <div>
          <div><b>字段体检</b> · {{ warnings.length }} 项 SQL 失能字段（在 Lucene 里不受影响）：</div>
          <ul class="lc-warn-list">
            <li v-for="(w, i) in warnings" :key="i">{{ w }}</li>
          </ul>
        </div>
      </div>
      </div>
      </template>

      <template #pane-lucene-result>
      <!-- 结果区五态互斥且穷尽：busy 骨架 → runErr 内联面板（重试）→ 初始就绪 → 0 命中空态 → 数据表 -->
      <div class="lc-result">
        <div v-if="busy" class="lc-loading">
          <SkeletonBox v-for="i in 3" :key="i" height="42px" round style="margin-bottom:var(--sp-1h)" />
        </div>
        <!-- .lc-err 私造错误条合并全局 err-bar（558b 三面红壳同范式——role=alert
 在场、v-if 链同条件保形、.lc-err-pre 槽类沿 558 先例保留；红壳底/边框归 theme.css 单源） -->
        <div v-else-if="runErr" role="alert" class="err-bar lc-err">
          <AlertCircle :size="14" />
          <div class="lc-err-body">
            <!-- 标题行走 friendlyEsError 人话；：pre 换 errPreHtml v-html
 （DslQueryView 同款——JSON 错误体着色，否则转义平文，全文可回看语义不变） -->
            <div><b>Lucene 查询失败</b> · {{ friendlyRunErr }}</div>
            <pre class="lc-err-pre" v-html="errPreHtml(runErr, errMeta(runErrRaw))"></pre>
            <div class="lc-err-acts">
              <button class="btn sm" @click="doRun" :disabled="!index || !qs.trim() || busy">{{ busy ? '重试中…' : '重试' }}</button>
            </div>
          </div>
        </div>
        <!-- 裸空态合并 EmptyState compact（初始引导 / 0 命中两分支） -->
        <EmptyState v-else-if="!index" compact :icon="SearchCode" text="先在顶栏选择一个索引" />
        <EmptyState v-else-if="!searched" compact :icon="SearchCode" text="选择索引、输入 query_string 后按 Enter 执行" hint="补全弹层开着时 Enter=回填候选，结果将显示在这里" />
        <EmptyState v-else-if="!hits.length && from > 0" compact :icon="SearchX" text="本页无结果（可能已翻过末页）" action-text="回到第一页" @action="backToFirstPage" />
        <EmptyState v-else-if="!hits.length" compact :icon="SearchX" text="无匹配文档" hint="试试放宽查询条件或调整时间范围" />
        <template v-else>
        <div class="lc-card-hd">
          <span>
            结果：<b>{{ fmtNum(hits.length) }}</b> / 共 <b>{{ totalGte ? '≥ ' : '' }}{{ fmtNum(total) }}</b>
            <!-- 手写元信息串合并 MetaStrip（值亮+标签暗+·分隔统一口径）；
 took 纯数值 stats item → TookBadge 四档语义徽标（BulkEditorView 同款），shards 留值对 -->
            <MetaStrip class="lc-meta" :items="metaItems"><TookBadge :ms="took" /></MetaStrip>
          </span>
          <div class="lc-hd-r">
            <!-- 原始 IO 快查——最近一次 /cluster/lucene-search 请求/响应原文（ioRecorder 记录环） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（Lucene 检索）" title="最近一次检索请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
            <!-- 换共享 Pagination——：表格视图分页随 QRT 内建分页行
 （页码/页大小/翻页事件全量内建），顶部分页器只剩 JSON 视图在用（JSON 无 QRT）；
 聚焦 JSON 工具行的分页器同步保留 -->
            <Pagination v-if="viewMode === 'json'" :page="page" :total-pages="totalPages" :page-size="size" :disabled="busy"
              @update:page="goPage" @update:page-size="setSize" />
            <!-- 视图切换/JSONL/CSV 三钮退役——seg+JSONL 寄居 QRT 工具行
 （#bar-prepend，下方），CSV 走 QRT 内建导出钮（bar-right 常驻，与 SystemView
 561 收口同判据：宿主钮与内建能力重复）。QRT :hide-body 随视图分档——
 工具行常驻，切回表格入口不丢（DslQueryView 541 同款范式）。 -->
          </div>
        </div>
          <!-- 表格头收口——QRT 移出 FS 常驻（表格/JSON 双档同渲染）：seg+JSONL
 寄居 bar-prepend、:hide-body 分档（JSON 档表格体隐、工具行常驻）、聚焦放大换
 QRT 内建聚焦面（FS headless，外层表格 FS 与 focusable 关断随收口退役；
 hideBody→true 自动退聚焦=RT 552 rtFix552 对称件）。外层 FS
 聚焦通道随本收口退役。 -->
          <QueryResultTable ref="resultTbl" :hits="hits" :total="total" :total-gte="totalGte" :loading="busy" sortable remote-sort :sync-sort="luceneSortSync" @sort-change="onSortChange" selectable row-drawer fill use-as-condition cond-target="Lucene" :cond-sort="false" @use-as-condition="useAsCondition" :took="took" :page="page" :page-size="size" :pager-disabled="busy" @update:page="goPage" @update:page-size="setSize" :hide-body="viewMode !== 'table'" max-height="100%" :storage-key="index ? 'lucene:' + index : undefined" :field-types="fieldTypes" empty-hint="调整查询语句或时间范围后重查"
            :searchable="viewMode === 'table'" refreshable @refresh="doRun">
            <template #bar-prepend>
              <!-- 特定能力保留在外层：扁平表格 vs 逐 hit JsonTree（嵌套展开）切换，不塞进通用表；
 seg 升格（容器 role=group+aria-label+钮 aria-pressed，G192 范式） -->
              <div class="seg" role="group" aria-label="展示形态">
                <button :class="{ on: viewMode === 'table' }" :aria-pressed="viewMode === 'table'" @click="viewMode = 'table'">表格</button>
                <button :class="{ on: viewMode === 'json' }" :aria-pressed="viewMode === 'json'" @click="viewMode = 'json'">文档 JSON</button>
              </div>
              <!-- 1439：改词/改排序未重跑时结果还是上一次的——DSL/索引工作区同款芯片 -->
              <span v-if="resultStale" class="pill warn stale-chip" role="status"
                title="当前查询已修改但还没执行——下方结果仍来自上一次执行（回车或点执行更新）">结果已过期</span>
              <button class="btn ghost xs" @click="exportJsonl">
                <FileDown :size="11" /> JSONL
              </button>
            </template>
          </QueryResultTable>
        <!-- JSON 视图对称聚焦（嵌套展开树同样需要全屏浏览）——
 v-else 随表格档 FS 退役改显式 v-if（QRT 常驻后 JSON 面只管 JSON 树） -->
        <FocusableSurface v-if="viewMode === 'json'" pane-id="lucene.json" title="JSON 结果" :enabled="focusPaneId === 'lucene.json'"
          @update:enabled="v => (focusPaneId = v ? 'lucene.json' : null)">
          <!-- JSON 聚焦态工具行（分页+导出在放大态可用，与 449 表格分支对称） -->
          <div v-if="focusPaneId === 'lucene.json'" class="lc-hd-r focus-tools">
            <button class="btn ghost xs" @click="viewMode = 'table'; focusPaneId = null">
              <ListTree :size="11" /> 表格
            </button>
            <Pagination :page="page" :total-pages="totalPages" :page-size="size" :disabled="busy"
              @update:page="goPage" @update:page-size="setSize" />
            <button class="btn ghost xs" @click="exportJsonl">
              <FileDown :size="11" /> JSONL
            </button>
            <button class="btn ghost xs" @click="exportCsv" :disabled="!hits.length"
              title="导出全部命中为 CSV">
              <FileDown :size="11" /> CSV
            </button>
          </div>
        <div class="lc-tbl-wrap">
          <!-- JSON 视图内查找（304 遗留项）——_id/_source 双匹配过滤 + 命中计数。
 手写 input 改用 SearchFilterBar 统一件（ss-hits-find 561 先例同款
 窄栏胶囊；Esc 清空组件内建承接行为等价，placeholder 兼 aria-label；
 计数/清除入 slot 胶囊内右翼，jsonKw/jsonHits 过滤链零触） -->
          <div class="lc-json-find" v-if="hits.length">
            <SearchFilterBar v-model="jsonKw" class="lc-json-find-bar" placeholder="在 JSON 视图内查找（_id/字段值）…">
              <span class="mono lc-json-count">{{ jsonHits.length }}/{{ hits.length }} 条</span>
              <button v-if="jsonKw" class="btn ghost xs" aria-label="清除 JSON 视图查找" @click="jsonKw = ''">✕</button>
            </SearchFilterBar>
          </div>
          <table class="lc-tbl">
            <thead>
              <tr>
                <th style="width:220px">_id</th>
                <th style="width:60px">_score</th>
                <th>_source</th>
              </tr>
            </thead>
            <tbody>
              <!-- 过滤态命中行给锚点——_id 套 MarkText 高亮 + 行底色类 + aria-current
 （轻量版：滚动定位仍归 QRT/HitNav 链路；kw 空时无类无属性，零扰动） -->
              <tr v-for="h in jsonHits" :key="h._id" :class="{ 'lc-hit-row': !!jsonMarkKw }" :aria-current="jsonMarkKw ? 'true' : undefined" tabindex="0"
                @contextmenu.prevent="openHitMenu($event, h)" @keydown="onHitMenuKey($event, h)">
                <td><code><MarkText :text="h._id" :kw="jsonMarkKw" /></code></td>
                <td>{{ fmtScore(h._score) }}</td>
                <!-- 548 E2 回收——JsonTree 开 highlightKw 外部高亮通道（tools 私有
 kw 空时回落生效），_source 侧接 jsonMarkKw（_id 列 MarkText 同源），过滤
 命中行锚点补齐；行底色类 .lc-hit-row + aria-current 保留 -->
                <td class="lc-src"><JsonTree :data="h._source" :highlight-kw="jsonMarkKw" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        </FocusableSurface>
        </template>
      </div>
      </template>
    </WorkbenchLayout>

    <!-- 页内查询历史（mode=lucene 单档过滤，DslQueryView 弹窗范式）。
 play=回填 ?q= 现场并执行、fill=仅回填；导入/清空入口关闭（同沙盒口径） -->
    <n-modal v-model:show="histOpen" preset="card" title="查询历史（Lucene）" style="width:640px;max-width:92vw" :bordered="false">
      <QueryHistoryPanel
        :items="histRows" :actions="['play', 'fill', 'copy', 'del']" :clearable="false" :importable="false"
        empty-text="执行成功后自动记录（上限 100 条），可一键回填重跑"
        @play="h => replayHistRow(h, true)" @fill="h => replayHistRow(h, false)" @del="h => qh.removeOne(h.id)"
      />
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 /cluster/lucene-search 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- JSON 视图命中行右键：复制文档 / 以 _id 查 / 转 DSL 工作台 -->
    <CellContextMenu v-if="hitMenu" :x="hitMenu.x" :y="hitMenu.y"
      :title="'命中文档 · ' + hitMenu.h._id" :items="hitMenuItems" @close="hitMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, type Ref } from 'vue';
import { normalizePrefEnum } from '../utils/prefEnum';
import { SearchCode, BookOpen, Play, Star, ShieldAlert, FileDown, Link2, AlertCircle, ListTree, X, SearchX, History, Terminal, Copy, Braces, Info, AlertTriangle } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
/* 页内历史面板合并 QueryHistoryPanel 共享件（DslQueryView 弹窗范式） */
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import Pagination from '../components/Pagination.vue';
import { useAppStore } from '../stores/app';
import { useQueryHistoryStore } from '../stores/queryHistory';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import FieldPicker from '../components/FieldPicker.vue';
import LuceneInput from '../components/LuceneInput.vue';
import JsonTree from '../components/JsonTree.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import FocusableSurface from '../components/FocusableSurface.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
/* 双 pane 可调工作台（editor=条件区/result=结果区） */
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
/* 空态统一 EmptyState、元信息统一 MetaStrip、错误人话 friendlyEsError */
import EmptyState from '../components/EmptyState.vue';
import MetaStrip from '../components/MetaStrip.vue';
import MarkText from '../components/MarkText.vue';
import TookBadge from '../components/TookBadge.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：JSON 视图查找胶囊统一件 */
import { friendlyEsError } from '../utils/esError';
/* 错误面板 pre v-html 内核（DslQueryView 消费先例同款） */
import { errPreHtml, errMeta } from '../utils/errPre';
import { useUrlState, useIdxState, usePref } from '../composables/urlState';
import { usePagerSize, PAGER_SIZES } from '../composables/usePagerSize';
import { useQueryRun } from '../composables/useQueryRun';
import { useResultStale } from '../composables/useResultStale';
import { useIndexFieldTypes } from '../composables/useIndexFieldTypes';
import { resolveSortField } from '../utils/sortField';
import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';
import { appendLuceneClause } from '../utils/filterMerge';
import { useRouter } from 'vue-router';
import { encodeDslParam } from '../utils/queryHub';
import { exportStamp, copyText, fmtTime, downloadText, totalOf, fmtNum, csvCell, fmtCell } from '../utils/format';
import { removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { useAuthStore } from '../stores/auth'; /* 历史回放自动执行的身份/读页门（1124 续） */

const store = useAppStore();
const auth = useAuthStore();
const router = useRouter();
/* sort 字段 FieldPicker 的可排序类型过滤（逗号分隔字符串，同 PIT/构建器排序行口径）。
 补 unsigned_long（545 数值族九口径对齐——此前排序字段选择器漏第九种数值类型） */
/* 可排序类型单源（queryAstOps；与 PIT/构建器同表——此前三处各抄一份会漂） */
const SORTABLE_TYPES = SORTABLE_FIELD_TYPES.join(',');
/* 可调工作台声明（照 AnalyzeView 形态）——条件区可折叠，结果区吃剩余；
 本视图经 QueryHubView 嵌入（route 恒为 /search），mode 维度区分记忆键 */
const lcScope = { target: store.target || 'host', route: '/search', mode: 'lucene', profile: 'standard' as const };
/* 轨4：竖排标题轨退役（v 刀①，AnalyzeView 519 先例）——结果卡头
 「结果：…」已是横排承接，条件区字段行自描述，title 置空即不渲染 34px 竖排轨 */
const LC_PANES: WorkbenchPaneSpec[] = [
  { id: 'lucene.editor', role: 'request', title: '', minSize: 300, defaultSize: 380, collapsible: true },
  { id: 'lucene.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex' },
];
/* 核心查询现场进 URL——链接可发同事、刷新可复原；size 属个人偏好落 localStorage */
const index = useIdxState({ follow: true });
/* 字段类型映射（mapping-detail 顶层叶子）——QRT 双层列头类型徽标 */
const fieldTypes = useIndexFieldTypes(index);
const qs = useUrlState('q', '*');
/* 页大小合并共享 usePagerSize：读=共享键钳制档位（10/20/50/100，越档/坏值回落），
 写=共享键 es_pager_size（一次调节全站一致）。共享键从未设置时保持本视图历史默认 50
 （legacyKey=lucene.size 兼容读 → 50）——usePagerSize 的全局 DEF=20 不回填本视图
 （lucene 起档 50 语义契约，dslAssistPenetration ③ 以 size:50 锁）；
 遗留清裸种子退役：lucene.size 越档值（如 15）旧裸读放行，现与共享键同钳制回落 50。 */
const { size, set: setSharedSize } = usePagerSize({ legacyKey: 'lucene.size', def: 50 });
function setSize(v: number) {
  setSharedSize(v);
  from.value = 0;
  if (searched.value) doRun();
}
/* header size 输入单点收敛（此前 v-model 裸绑=不钳制/不归页/不重查/不写共享键的
 第二口径）：档位值走 setSize 全套（与分页器/IndexHub 同语义）；非档位值=
 会话内自由取值（ES 上限 10000；DslQuery PAGER_SIZES.includes 同判据——非档位
 不参与共享分页契约），归页 1+重查照做、不写共享键防毒化（读侧钳制会静默丢弃） */
function onSizeInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const raw = el.value.trim();
  const n = Math.floor(Number(raw));
  if (raw === '' || !Number.isFinite(n)) { el.value = String(size.value); return; }
  const clamped = Math.min(10000, Math.max(1, n));
  if (PAGER_SIZES.includes(clamped)) { setSize(clamped); return; }
  size.value = clamped;
  from.value = 0;
  if (searched.value) doRun();
}
/* URL 即现场：?page= 对齐 DSL 通道契约（DslQueryView 同款，默认页 1 不占 URL）——
 刷新/深链保持页码；goPage/setSize/手改 from 后执行时经 watch(page) 写回 */
const pageLink = useUrlState('page', '1');
const from = ref(Math.max(0, ((parseInt(pageLink.value, 10) || 1) - 1) * size.value));
const page = computed(() => Math.floor(from.value / Math.max(1, size.value)) + 1);
watch(page, v => { pageLink.value = String(v); });
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / Math.max(1, size.value))));
function goPage(p: number) {
  if (p === page.value || busy.value) return;
  from.value = (p - 1) * size.value;
  doRun();
}
const sortField = useUrlState('sort');
const sortOrder = useUrlState('order', 'desc') as Ref<'desc' | 'asc'>;
/* 1439：结果「已过期」判据（DSL 工作台同款，useResultStale 共享件）——
   查询词/排序/翻页偏移改了但还没重跑时，结果表里仍是上一次执行的内容。
   签名取「实际请求口径」：sortField 在执行时会被 resolveSortField 归一
   （title → title.keyword），故快照在归一后、发请求前取，否则一执行完就误报过期；
   from 手输框没有执行副作用，只能靠这里标过期（分页器/页大小档是自动重跑）。 */
const runSig = computed(() => JSON.stringify([qs.value, sortField.value.trim(), sortOrder.value, from.value, size.value]));
const { stale: resultStale, markRun: markRunSig } = useResultStale(() => runSig.value, () => searched.value);
/* 1402：表头排序=服务端排序（此前 QRT 本地档只排「当前页」——用户点了箭头，
 跨页顺序却没变，是「看起来排了、换页又乱」的经典心智错位）。内核 remote 档只
  emit 意图，这里写回 sortField/sortOrder 并回第一页重查；箭头由 sync-sort 回填。 */
const luceneSortSync = computed(() => {
  const f = sortField.value.trim();
  if (!f) return null;
  /* 箭头按「列名」回填：text 列实际下发的是 .keyword 子域，但表头列叫 title。
 只有「基列确实是 text 且存在同名 keyword 子域」时才剥离，避免把用户手输的
 真实子域列名（a.keyword）错误还原。 */
  const base = f.endsWith('.keyword') ? f.slice(0, -'.keyword'.length) : '';
  const col = base && fieldTypes.value?.[base] === 'text' && fieldTypes.value?.[f] === 'keyword' ? base : f;
  return { f: col, d: (sortOrder.value === 'asc' ? 1 : -1) as 1 | -1 };
});
/* 1439：结果单元格「加入查询条件 / 排除此值」——把值拼成 phrase 子句并进检索词后重查。
   与索引工作区 onDocsFilterHit 同一合并件（appendLuceneClause），不另造拼接。 */
function useAsCondition(p: { field: string; value: unknown; not?: boolean }) {
  if (!p?.field) return;
  /* 短语化：值里的引号是唯一需要转义的字符，其余按整串短语匹配 */
  const v = p.value == null ? '' : String(p.value);
  if (!v) { store.notify('warning', '空值无法生成 Lucene 条件'); return; }
  const clause = p.field + ':"' + v.replace(/"/g, '\\"') + '"';
  qs.value = appendLuceneClause(qs.value, clause, !!p.not);
  store.notify('info', `已${p.not ? '排除' : '追加'}条件 ${clause}，正在重查`);
  void doRun();
}

function onSortChange(s: { f: string; d: 'asc' | 'desc' } | null) {  if (busy.value) { store.notify('info', '查询执行中，请等待完成'); return; }
  /* text → .keyword 子域；无子域的 text 列不可排序，就地拦下不发注定 400 的请求 */
  if (s) {
    const res = resolveSortField(s.f, fieldTypes.value);
    if (!res.ok) { store.notify('warning', res.reason || '该字段不支持排序'); return; }
    sortField.value = res.field;
    sortOrder.value = s.d;
  } else {
    sortField.value = '';
  }
  from.value = 0;
  void doRun();
}
const hits = ref<any[]>([]);
const total = ref(0);
const totalGte = ref(false);
/* 表格化（默认，QueryResultTable 扁平列）与逐 hit JsonTree 嵌套展开的视图切换 */
/* 视图模式持久化（usePref）——与 DslQuery view 草稿持久化口径对齐 */
const viewModePref = usePref<string>('lucene.viewMode', 'table');
const viewMode = computed<'table' | 'json'>({
  get: () => normalizePrefEnum(viewModePref.value, ['table', 'json'] as const, 'table'),
  set: v => { viewModePref.value = v; },
});
/* 结果表聚焦态 */
const focusPaneId = ref<string | null>(null);
/* JSON 视图内查找（304 遗留项收尾）——按 _id/_source 内容过滤，表格视图查找走 QRT/HitNav 不共用 */
const jsonKw = ref('');
const jsonHits = computed(() => {
  const kw = jsonKw.value.trim().toLowerCase();
  if (!kw) return hits.value;
  return hits.value.filter(h =>
    String(h._id ?? '').toLowerCase().includes(kw) ||
    JSON.stringify(h._source ?? {}).toLowerCase().includes(kw));
});
const took = ref(0);
/* JSON 视图过滤态命中标记关键词（MarkText kw；trim 后空串=无标记零扰动） */
const jsonMarkKw = computed(() => jsonKw.value.trim());

/* ═══ JSON 视图命中行右键 ═══
 这张表是手写的（_id/_score/_source 三列，走 JsonTree 嵌套），TableKernel 的单元格
 右键覆盖不到它——结果就是「表格视图能右键复制文档，切到 JSON 视图就没了」。
 一级只留最高频的两项，其余收进二级（全站右键同规矩）。
 只读安全：只有复制/跳转，没有任何写动作。 */
const hitMenu = ref<{ x: number; y: number; h: any } | null>(null);
function openHitMenu(e: MouseEvent, h: any) {
  hitMenu.value = { x: e.clientX, y: e.clientY, h };
}
function onHitMenuKey(e: KeyboardEvent, h: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  hitMenu.value = { ...menuKeyAnchor(e), h };
}
async function copyHit(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const hitMenuItems = computed<CcmItem[]>(() => {
  const m = hitMenu.value; if (!m) return [];
  const h = m.h;
  const doc = { _id: h._id, ...(h._source ?? {}) };
  return [
    { key: 'hit-copy-id', label: '复制 _id', icon: Copy, run: () => copyHit(String(h._id ?? ''), '已复制 _id：' + h._id) },
    { key: 'hit-copy-doc', label: '复制文档 JSON（_id + _source）', icon: Braces, run: () => copyHit(JSON.stringify(doc, null, 2), '已复制文档 JSON') },
    {
      key: 'hit-more', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'hit-copy-src', label: '复制 _source（不含 _id）', icon: Braces, run: () => copyHit(JSON.stringify(h._source ?? {}, null, 2), '已复制 _source') },
        { key: 'hit-copy-score', label: '复制 _score', icon: Info, run: () => copyHit(String(h._score ?? ''), '已复制 _score') },
        /* 命中行的下一步高频动作：拿 _id 去 DSL 工作台看这个文档为什么排在这 */
        { key: 'hit-to-dsl', label: '用 _id 在 DSL 工作台查此文档', icon: Link2, run: () => {
          router.push({
            path: '/search',
            query: {
              mode: 'dsl',
              ...(index.value.trim() ? { idx: index.value.trim() } : {}),
              dsl: encodeDslParam(JSON.stringify({ query: { ids: { values: [String(h._id)] } }, size: 10 }, null, 2)),
            },
          });
        } },
      ],
    },
  ];
});
const totalShards = ref(0);
const successfulShards = ref(0);
const warnings = ref<string[]>([]);
const busy = ref(false);
/* 字段体检链自有在途位：执行钮读秒/取消钮随执行链（qr.running），体检示能随本链 */
const schemaBusy = ref(false);
const qr = useQueryRun(); // 长查询读秒 + 取消（ 范式）
const showSyntax = ref(false);
/* 三态契约状态位：searched 区分「未执行/已执行」，runErr 持错误全文供内联面板回看 */
const searched = ref(false);
const runErr = ref('');
/* 534 收口波双参改用：原始错误对象旁路留存（catch 压串丢 code/endpoint，喂 errMeta 用） */
const runErrRaw = ref<unknown>(null);
/* runErr 面板标题行的人话摘要（pre 仍保全文） */
const friendlyRunErr = computed(() => friendlyEsError(runErr.value));
/* 切索引清结果（DSL 工作台 watch(pickedIdx) 同语义）——旧索引的命中留在新索引标签下
   就是「结果看起来属于当前索引」的假现场；查询词草稿保留，等用户自己回车。 */
watch(index, (n, o) => {
  if (n === o) return;
  hits.value = [];
  total.value = 0;
  totalGte.value = false;
  took.value = 0;
  totalShards.value = 0;
  successfulShards.value = 0;
  searched.value = false;
  from.value = 0;
  runErr.value = '';
  runErrRaw.value = null;
});
/* 结果头元信息串（MetaStrip 值对）——took 已合并 TookBadge（只留 shards */
const metaItems = computed(() => [
  { value: `${successfulShards.value}/${totalShards.value}`, label: 'shards' },
]);
/* 0 命中空态「回到第一页」行动钮 */
function backToFirstPage() { from.value = 0; doRun(); }

/* JSON 视图 _score 裸 toFixed(3) 换 ScoreExplainView fmtScore 同语义
 （数值取 Number+4 位小数；缺分/'-' 档、非有限数值回原文不崩）——
 原写法 toFixed?.(3) 对 0 分命中显示 '-'（falsy 短路）、小数位与评分页口径不一 */
function fmtScore(s: any): string {
  if (s == null || s === '') return '-';
  const n = Number(s);
  return isFinite(n) ? n.toFixed(4) : String(s);
}

const TEMPLATES = [
  { k: '全部',    d: '仅测试连通', q: '*' },
  { k: '存在',    d: '字段存在', q: '_exists_:status' },
  { k: '范围',    d: '数值区间', q: 'score:[60 TO 90]' },
  { k: '通配',    d: '前缀匹配', q: 'name:hel*' },
  { k: '组合',    d: '与或非',   q: '+status:ACTIVE -deleted:true (tags:red OR tags:blue)' },
  { k: '短语',    d: '双引号短语', q: 'msg:"database error"' },
  { k: '邻近',    d: 'word~5',  q: 'msg:"quick fox"~5' },
  { k: '模糊',    d: 'fuzz~2',  q: 'name:helo~2' },
  { k: '数组',    d: '匹配任意值', q: 'tags:red' },
  { k: 'nested',  d: 'nested field 平铺', q: 'products.color:red' },
  { k: '日期',    d: 'ISO 日期', q: 'ts:[2024-01-01 TO 2024-12-31]' },
  /* 值位类型盲区补档——ip 段区间形态（date 族区间已有，ip 缺席） */
  { k: 'IP 段',   d: 'IP 区间', q: 'ip:[10.0.0.0 TO 10.0.0.255]' },
  { k: 'boost',   d: '字段加权', q: 'title:hello^2 OR body:hello' },
];

/* DSL→Lucene 翻译缺失清单（来自会话 carry，见 onMounted）；用户关掉即清空 */
const carriedLossy = ref<string[]>([]);

onMounted(() => {
  const carry = sessionStorage.getItem('esquerystudio.lucene.q');
  if (carry) { qs.value = carry; removeStoredRaw(sessionStorage, 'esquerystudio.lucene.q'); }
  const ci = sessionStorage.getItem('esquerystudio.lucene.index');
  if (ci) { index.value = ci; removeStoredRaw(sessionStorage, 'esquerystudio.lucene.index'); }
  /* 翻译缺失清单同样是一次性 carry：读走即删，但保留在页面状态里直到用户关掉——
     否则刷新一次提示就彻底消失，用户会以为翻译是等价的。 */
  const lcLossy = sessionStorage.getItem('esquerystudio.lucene.lossy');
  if (lcLossy) {
    removeStoredRaw(sessionStorage, 'esquerystudio.lucene.lossy');
    try {
      const arr = JSON.parse(lcLossy);
      if (Array.isArray(arr)) carriedLossy.value = arr.filter((x: unknown) => typeof x === 'string');
    } catch { /* 坏数据当没有：宁可少提示，也不显示乱码清单 */ }
  }
});

async function doRun() {
  /* 再入守卫：执行钮 disabled 挡不住 Enter/历史回放/改页大小通道——旧请求被
   begin() 作废后其 finally 会提前熄灭在途示能，第二跑全程无进度无取消 */
  if (!index.value.trim() || !qs.value.trim() || busy.value || qr.running.value) return;
  busy.value = true; runErr.value = ''; runErrRaw.value = null;
  const signal = qr.begin();
  try {
    /* 1169：sort 也能从 URL/手输进来（FieldPicker 只过滤下拉候选，挡不住 ?sort=title）——
       直接送给 ES 会 400「Fielddata is disabled on text fields」。先解析成 .keyword 子域，
       解析不了就地拦下并给可行动提示，不发注定失败的请求。 */
    const sfRaw = sortField.value.trim();
    if (sfRaw) {
      const res = resolveSortField(sfRaw, fieldTypes.value);
      if (!res.ok) {
        store.notify('warning', res.reason || '该字段不支持排序');
        return; /* finally 里会复位 busy / qr */
      }
      sortField.value = res.field;
    }
    const sigAtSend = runSig.value;
    const idxAtSend = index.value.trim();
    const qsAtSend = qs.value.trim();
    const r: any = await api.luceneSearch(idxAtSend, qsAtSend, size.value, from.value,
      sfRaw ? sortField.value.trim() : undefined, sortOrder.value, signal);
    /* 在途切索引：旧索引响应不得落进新索引现场（IndexHub runDocs 同判据） */
    if (index.value.trim() !== idxAtSend) return;
    took.value = r.took || 0;
    totalShards.value = r._shards?.total || 0;
    successfulShards.value = r._shards?.successful || 0;
    const h = r.hits?.hits || [];
    hits.value = h;
    total.value = typeof r.hits?.total === 'object' ? (r.hits.total.value || 0) : (r.hits?.total || 0);
    totalGte.value = totalOf(r.hits).gte;
    searched.value = true;
    markRunSig(sigAtSend);
    /* 执行成功记跨模式历史（query_string 原文 + 目标索引） */
    /* 记录查询耗时 */
    useQueryHistoryStore().push('lucene', qsAtSend, idxAtSend || undefined, took.value || undefined);
  } catch (e: any) {
    /* 主动取消不报失败（DslQueryView 取消甄别同语义）：轻提示即返，错误面板留给真失败 */
    if (e?.name === 'AbortError') { store.notify('info', `已取消查询（${(qr.elapsedMs.value / 1000).toFixed(1)}s）`); return; }
    runErr.value = String(e?.message || e); /* 原文留 pre 全文回看；人话由 friendlyRunErr 派生 */
    runErrRaw.value = e; /* 534 收口波：原始对象旁路（errMeta 读 code/endpoint，压串时丢失） */
    /* toast 裸串并轨 friendlyEsError */
    store.notify('error', 'Lucene 查询失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; qr.finish(); }
}

/* 页内历史回放/回填——play=回填 ?q= 现场并执行、fill=仅回填。
 doRun 自带「无索引/空查询」守卫，历史条目在无索引现场回放时静默回落为仅回填 */
const qh = useQueryHistoryStore();
const histOpen = ref(false);
const histRows = computed(() => qh.items.filter(i => i.mode === 'lucene'));
function replayHistRow(row: { query: string }, runIt: boolean) {
  qs.value = row.query;
  histOpen.value = false;
  if (runIt) doRunAuto();
}

/* 历史回放自动执行的身份门（1124 续）：回放载荷可能来自上一账号，probe 未落地时旧 target
   的检索会先发出去。手动点「检索」不拦，后端仍按 search 页读键裁决。 */
const doRunAutoAllowed = () => auth.authDisabled
  || !auth.probeStarted /* 探测未启动视同身份已定，与 store.identityKnown 同口径 */
  || (auth.probed && auth.me != null && auth.canReadPage('search', store.target));
let doRunAutoPending = false;
function doRunAuto() {
  if (doRunAutoAllowed()) { doRunAutoPending = false; void doRun(); return; }
  doRunAutoPending = true;
}
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!doRunAutoPending || !doRunAutoAllowed()) return;
  doRunAutoPending = false;
  void doRun();
});

/* 原始 IO 快查（545 四页同款）——特征 /cluster/lucene-search；判空 rec=null
 （本页还没检索过）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/lucene-search');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}



async function doSchema() {
  if (!index.value.trim()) return;
  busy.value = true; schemaBusy.value = true;
  try {
    const r: any = await api.resolveSchema(index.value.trim());
    warnings.value = r?.warnings || [];
    store.notify(warnings.value.length ? 'warning' : 'success',
      warnings.value.length ? `${warnings.value.length} 项 SQL 失能字段（Lucene 不受影响）` : '无 SQL 限制风险');
  } catch (e: any) { /* ：裸串并轨 friendlyEsError */ store.notify('error', '体检失败：' + friendlyEsError(String(e?.message ?? e))); }
  finally { busy.value = false; schemaBusy.value = false; }
}

/* 查询现场已全量在 URL（idx/q/sort/order），复制链接即可分享复现。
 剪贴板被拒时同样要有反馈（域内双分支口径），不得静默 */
async function copyLink() {
  const ok = await copyText(location.href);
  store.notify(ok ? 'success' : 'error', ok ? '链接已复制，打开即复现当前查询' : '复制失败');
}

/* W4-T14：在构建器中打开——互转通道只收 DSL（?dsl= base64），lucene 文本包装 query_string
 尽量预填；'*'/空落 match_all；sort 现场随带。构建器对 query_string 落 GenericNode
 结构化透镜兜底（零降级），用户可在构建器里继续改写。 */
function openInBuilder() {
  const q = qs.value.trim();
  const body: Record<string, any> = {
    query: q && q !== '*' ? { query_string: { query: q } } : { match_all: {} },
    size: size.value,
  };
  const sf = sortField.value.trim();
  if (sf) body.sort = [{ [sf]: { order: sortOrder.value } }];
  router.push({
    path: '/search',
    query: {
      mode: 'dsl',
      ...(index.value.trim() ? { idx: index.value.trim() } : {}),
      dsl: encodeDslParam(JSON.stringify(body, null, 2)),
    },
  });
}

function doFav() {
  store.addFavorite({
    kind: 'rest', title: `Lucene @${fmtTime(Date.now())}`,
    subtitle: `${index.value} · ${qs.value.slice(0, 60)}`,
    payload: { index: index.value, q: qs.value, size: size.value, sortField: sortField.value, sortOrder: sortOrder.value },
    tags: ['lucene', 'r30'],
  });
  store.notify('success', '已收藏');
}

function exportJsonl() {
  const lines = hits.value.map(h => JSON.stringify({ _id: h._id, _score: h._score, ...h._source }));
  downloadText(`lucene-${index.value || 'no-index'}-${exportStamp()}.jsonl`, lines.join('\n'), 'application/x-ndjson');
  store.notify('success', 'JSONL 已导出');
}

/* CSV 导出——经 QRT getCsvBlock 拿「可见列+排序后行矩阵」（所见即所得），
 与 SQL 通道同格式（csvCell 转义 + BOM，Excel 直开） */
const resultTbl = ref<{ getCsvBlock: () => { head: string[]; rows: any[][] } } | null>(null);
function exportCsv() {
  const blk = resultTbl.value?.getCsvBlock?.();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const head = blk.head.map(c => `"${c}"`).join(',');
  const body = blk.rows.map(r => r.map(v => csvCell(fmtCell(v))).join(',')).join('\n');
  downloadText(`lucene-${index.value || 'no-index'}-${exportStamp()}.csv`, head + '\n' + body, 'text/csv;charset=utf-8', { bom: true });
  store.notify('success', 'CSV 已导出');
}
</script>

<style scoped>
/* 1414：工具行里的「表格 / 文档 JSON」两档不许折行——全局 .seg 带 flex-wrap:wrap，
   在 762px 宽的结果槽里被压成上下两行，把工具行从 41px 顶到 67px（实测 1440×900）。
   seg 在 QRT 的 bar-prepend 插槽内（子组件作用域），要 :deep 才能命中。
   与 QRT 内建 .qrt-view-seg { flex-wrap: nowrap } 同口径。 */
.lc-result :deep(.seg) { flex-wrap: nowrap; }
/* .lc-page 转纵向 flex 撑满——WorkbenchLayout 在有高度链的容器里吃满剩余，
 无高度链（QueryHub 嵌入）时由其内置 min-height 兜底 */
.lc-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); position: relative; display: flex; flex-direction: column; height: 100%; }
/* 执行进度条贴页顶 */
.lc-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* 删 .lc-hd-l 死规则（.lc-hd-tt/-ic/-sub 已删，同族漏网；模板 grep 0 引用） */
/* 删 -hd-tt/-hd-ic/-hd-sub 死规则（页头已由 PageHeader 接管，模板 0 引用，grep 确认） */
/* 工具行窄容器换行策略（415 dt-actions 同款——容器可换行、子项不逐字断） */
.lc-hd-r { display: flex; gap: var(--sp-1h); flex-wrap: wrap; row-gap: var(--sp-1); align-items: center; }
.lc-hd-r > * { white-space: nowrap; flex-shrink: 0; }
/* .lc-grid 写死双栏退役——双栏交给 WorkbenchLayout（pane 内 rp-content 转纵向 flex，
 卡片吃满 pane 宽；结果卡吃满 pane 高，60vh 硬顶随之退役） */
.lc-page :deep(.rp-content) { display: flex; flex-direction: column; }
.lc-pane-stack { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
/* 轨4：.lc-card 壳规则（bg+border+radius+overflow）退役——pane 即容器，
 内容直贴；区块分界由 .lc-card-hd border-bottom 承接（v 刀③④），高度链零变动 */
.lc-result { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; }
/* 卡头字重 400→650 对齐标题四档（.st-card-hd/.qx-card-hd 同形态全站口径） */
.lc-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }
/* DSL→Lucene 翻译缺失常驻条：用告警色（与错误面板同族但更轻），常驻到用户手动关闭 */
.lc-lossy {
  display: flex; align-items: flex-start; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-2);
  background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m);
  color: var(--tx0); font-size: var(--fs-xs); line-height: 1.55;
}
.lc-lossy > svg { flex: none; margin-top: 2px; color: var(--warn); }
.lc-lossy-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.lc-lossy-list { color: var(--warn); font-weight: 650; word-break: break-all; }
.lc-lossy-hint { color: var(--tx2); }
.lc-lossy-x { flex: none; margin-left: auto; }
.lc-inp-line { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.lc-inp { display: flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--muted); }
.lc-ii { border: 1px solid var(--border); border-radius: 3px; padding: 3px var(--sp-1h); font-size: var(--fs-xs); background: var(--card-bg); color: var(--fg); font-family: var(--mono); min-width: 140px; }
.lc-ii.sm { min-width: 70px; }
/* W2 ：LuceneInput 外壳——对齐原 .lc-ta 的 code-bg 嵌入观感，宽度仍 100% 随卡片 */
.lc-qwrap { padding: var(--sp-2) var(--sp-3); background: var(--code-bg); }
.lc-tpl-ul { list-style: none; padding: 0; margin: 0; }
.lc-tpl-ul li { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); cursor: pointer; }
.lc-tpl-ul li:last-child { border-bottom: 0; }
.lc-tpl-ul li:hover { background: var(--code-bg); }
.lc-tpl-k { display: inline-block; color: var(--brand); font-weight: 400; margin-right: var(--sp-1h); min-width: 42px; }
.lc-tpl-c { display: inline-block; font-family: var(--mono); background: var(--code-bg); padding: 1px var(--sp-1); border-radius: 2px; margin-right: var(--sp-1h); }
.lc-tpl-d { color: var(--muted); }
.lc-syntax .lc-syn-body { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-3); padding: var(--sp-2h) 14px; }
/* .lc-syn-tt 保留私有形态（brand 色四列速查小节头，非标准分节），间距走 --sp */
.lc-syn-tt { font-size: var(--fs-sm); font-weight: 600; margin-bottom: var(--sp-1); color: var(--brand); }
.lc-syn-col ul { list-style: disc; padding-left: 18px; margin: 0; font-size: var(--fs-xs); }
.lc-syn-col code { background: var(--code-bg); padding: 1px var(--sp-1); border-radius: 2px; }
/* 轨4：.lc-card 壳退役后 warn 块语义边框自持（v 刀④「语义边框保留」——
 warn 琥珀框与 err 红框同族，完整 border+radius+soft 底不动） */
.lc-warn { display: flex; gap: var(--sp-2h); padding: var(--sp-3) 14px; background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m); color: var(--warning, var(--warn)); }
.lc-warn-list { margin: var(--sp-1) 0 0 var(--sp-5); padding: 0; font-size: var(--fs-xs); color: var(--fg); }
/* .lc-meta 只留外距——排版（值亮/标签暗/mono/·分隔）由 MetaStrip 统一承担 */
.lc-meta { margin-left: var(--sp-1h); }
.lc-loading { padding: 14px; }
/* .lc-err 私造红壳（padding/color）合并全局 err-bar（theme.css 单源）——
 本地只留多行面板顶对齐（558b ProfileFlame .pf-err 同款；.lc-err-pre 槽类沿 558 先例保留） */
.lc-err { align-items: flex-start; }
.lc-err-body { flex: 1; min-width: 0; }
.lc-err-pre { margin: var(--sp-1h) 0 0; font-family: var(--mono); font-size: var(--fs-xs); white-space: pre-wrap; word-break: break-word; color: var(--fg); max-height: 200px; overflow: auto; }
.lc-err-acts { margin-top: var(--sp-2); }
/* 60vh 硬顶交 pane 撑满——非聚焦 max-height:100% 随 pane（无高度链时回落自然高）；
 聚焦态 fs-active 全屏链保持不变 */
.lc-tbl-wrap { overflow: auto; max-height: 100%; }
/* JSON 聚焦态充满聚焦面 */
.fs-active .lc-tbl-wrap { max-height: none; height: 100%; }
/* JSON 视图内查找条（输入+命中计数+清除） */
.lc-json-find { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); }
/* sfb 落位类挂 SearchFilterBar 根（ss-hits-find-bar 同款）——原 input inline
 max-width:220px 违规退役归此类；mono 经根继承进 .sfb-i（原 inp mono 皮保真） */
.lc-json-find-bar { flex: none; width: 220px; padding: 0 var(--sp-2); font-family: var(--mono); font-size: var(--fs-xs); }
.lc-json-count { font-size: var(--fs-xs); color: var(--tx2); white-space: nowrap; }
/* 过滤态命中行底色（文本高亮由 MarkText mt-mark 承担，行底色给整行锚点） */
.lc-hit-row td { background: var(--ac-soft); }
.lc-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.lc-tbl th, .lc-tbl td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.lc-tbl th { background: var(--code-bg); position: sticky; top: 0; font-weight: 400; }
.lc-src { max-height: 200px; overflow: auto; background: var(--code-bg); padding: var(--sp-1h) var(--sp-2); border-radius: 3px; }

/* 1100px 自制断点随 .lc-grid 退役——窄视口 stacked 由 WorkbenchLayout 自动处理 */
/* 900 档豁免（实测裁决，不补 @media 档）——pane 外的页头/条件行全链路
 已有自适应兜底：<900 页头靠 PageHeader 自身 flex-wrap（ph/ph-r 档）+ .lc-hd-r 工具行
 自带 wrap（415 dt-actions 同款）自然单列化；条件行 .lc-inp-line 自带 wrap；主体双栏
 <1100 交 WorkbenchLayout JS stacked 档；语法手册 grid auto-fill minmax(220px,1fr) 自动
 减列；结果表横滚兜底在 QRT 内核。无任何固定多列/固定宽残留在 pane 外，补 900 档无事可做 */
</style>
