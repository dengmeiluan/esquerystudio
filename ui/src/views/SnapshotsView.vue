<template>
  <div class="sv" ref="rootEl">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="sv-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：快照的创建/恢复/删除不可用；需要快照写权限。
    </div>
    <PageHeader :icon="Camera" title="快照 / 恢复">
      <template #subtitle>
        <span>仓库快照与恢复操作</span>
        <!-- KPI 大卡墙退役：4 张 sv-kpi 统计改 inline 元信息串（数据全保留在此与 :title） -->
        <!-- KPI 大卡墙退役后 inline 串改用 MetaStrip 统一件：部分完成>0→warn、失败>0→err
 走组件 tone 档（原 meta-warn/meta-err 挂段容器连 i 一起染，合并后与全站同语言只染值）；
 「部分完成」的（部分成功）语义进段 tip，整条 :title 全文兜底不变 -->
        <MetaStrip v-if="currentRepo" class="sv-meta" :items="svMeta" :title="'快照 ' + fmtNum(snapshots.length) + '（repo=' + currentRepo + '） · 部分完成 ' + fmtNum(partialCount) + '（部分成功） · 失败 ' + fmtNum(failedCount) + ' · 进行中 ' + fmtNum(inProgressCount)" />
      </template>
      <!-- 原独立工具条 sv-bar 整体并入页头 actions（横幅层叠 -1） -->
      <template #actions>
        <n-select
          v-model:value="currentRepo"
          :options="repoOpts"
          filterable size="small"
          placeholder="选择快照仓库"
          style="width:280px"
          @update:value="onRepoChange"
        />
        <!-- 手写 repo 徽章 chip 退役并 MetaStrip mini 档（值亮+标签暗同全站语言；
 Server 图标随统一件无图标位退役，私造样式同步更新删除） -->
        <MetaStrip v-if="currentRepoMeta" :items="[{ value: currentRepoMeta.type, label: 'type' }]" />
        <button v-if="canOps" class="btn primary sm" @click="openCreate" :disabled="!currentRepo"><Plus :size="12" /> 创建快照</button>
<label class="sv-auto-lbl">
          <input type="checkbox" v-model="snapAutoRefresh" />
          <span>自动刷新</span>
        </label>
        <!-- 自动刷新频率下拉改用 AutoRefreshSelect 统一件（原内联样式原生 select 退役；开关 checkbox 与 usePref 逻辑不动） -->
        <AutoRefreshSelect v-if="snapAutoRefresh" v-model:ms="snapIntervalMs" :sizes="[10000, 30000, 60000]" label="自动刷新频率" />
        <button aria-label="刷新快照列表" class="btn sm ghost" @click="loadSnapshots" :disabled="loading || !currentRepo" title="刷新快照列表">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
        <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/snapshot/'=本页 repos/list/create/restore/delete/status 全通道） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（快照读写）" title="最近一次快照仓库/列表/创建/恢复/删除/进度请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
      </template>
    </PageHeader>

    <!-- -A2：页面级失败态——repo/快照拉取失败不能伪装成「未注册仓库」空态。
 errPreHtml+errMeta 双参改用（DiagView/TaskTree 547 铺装同口径：loadErrRaw
 旁路原始对象，code/endpoint 元信息行有则显；空 meta 输出与单参逐字一致，全文回看不变） -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      <span class="sv-err-txt" v-html="errPreHtml(loadErr, errMeta(loadErrRaw))"></span>
      <button class="btn sm" @click="loadRepos" :disabled="loadingRepos || loading">重试</button>
    </div>

    <!-- 无 repo 提示（轨4 刀④：空态空壳退役——EmptyState 裸置，
 空态不留整块空框） -->
    <EmptyState
      v-if="!repos.length && !loadingRepos && !loadErr"
      :icon="Camera"
      text="当前集群未注册任何 snapshot repository"
      hint="请先通过 PUT /_snapshot/<name> 注册 fs / s3 / gcs / azure 类型仓库 — 可复制下方命令在 DevTools 执行"
    >
      <template #default>
        <!-- 与 openInDevtools 同源门（1124）：无 DevTools 能力时不亮按钮，改为一句话说明，
             不把只读身份送进「点开只会被拒」的页面 -->
        <button v-if="canDevtools" class="btn sm pri" @click="goDevtoolsCreateRepo">📋 去 DevTools 创建 Repository</button>
        <span v-else-if="auth.probed" class="sv-dev-hint">当前身份没有 DevTools 写权限，仓库命令可在上方复制后交给管理员执行</span>
      </template>
    </EmptyState>

    <!-- 快照列表（时间线）。：pane 壳三件套（border/bg/radius）退役（535 SqlBridge
 pane 直贴约定续扫）——flex 布局语义与 .card padding 载体原样迁 .sv-list；
 ⚠卡片流排序锁域（sv.sortBy/sv.sortRev usePref+降序看守）零触碰 -->
    <div v-if="currentRepo" class="sv-list">
      <div class="card-t">
        <History :size="13" /> 快照时间线（{{ snapshots.length }}）
        <!-- 手写过滤框改用 SearchFilterBar 统一件（559 TasksView tv-kw 先例）：
 v-model filter 接线零触；Esc 清空内建（原 @keydown.esc.prevent 行为等价）；
 Enter 走组件定向 @enter 转 onHitKey（Shift+Enter 前后语义经原始 KeyboardEvent 保留）；
 胶囊壳归组件单源，sv-kw 纯锚类留 input（sweep524 同款挂载锚形态），sv-input-wrap 只留落位 -->
        <SearchFilterBar v-model="filter" class="sv-input-wrap" input-class="sv-kw" placeholder="按名字过滤" @enter="onHitKey" />
        <!-- 二批清零：卡片流排序（BrowserView clickSort 范式适配——卡片流无列头可点，收成 select 选键+方向钮翻转；
 默认 start_time 自然方向=新→旧降序，即迁移前列表固定序语义，不静默改序；偏好 usePref 跨会话记忆） -->
        <n-select v-model:value="sortBy" :options="sortOpts" size="small" style="width:104px" aria-label="排序字段" />
        <button class="btn sm ghost" aria-label="排序方向" :aria-pressed="sortRev"
          :title="sortRev ? '当前反序，点击恢复自然排序（开始时间 新→旧 / 名称 A→Z / 索引数 多→少 / 耗时 长→短）' : '当前自然排序（开始时间 新→旧 / 名称 A→Z / 索引数 多→少 / 耗时 长→短），点击翻转'"
          @click="sortRev = !sortRev">
          <ArrowDownNarrowWide v-if="!sortRev" :size="12" />
          <ArrowUpNarrowWide v-else :size="12" />
        </button>
        <!-- 快照列表 CSV 导出（跟随过滤，运维对账） -->
        <button class="btn sm ghost" :disabled="!filtered.length" title="导出当前快照列表为 CSV（跟随过滤）" @click="exportCsv">
          <FileDown :size="12" /> CSV
        </button>
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在过滤框接线） -->
        <HitNav :count="filtered.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
      </div>
      <div v-if="loading && !snapshots.length" style="padding:14px;display:flex;flex-direction:column;gap:var(--sp-2)">
        <SkeletonBox v-for="i in 4" :key="i" height="60px" round />
      </div>
      <div v-else-if="filtered.length" class="sv-tl">
        <div v-for="(s, i) in filtered" :key="s.snapshot" class="sv-tl-row" :class="'st-' + (s.state || '').toLowerCase()" :data-hit-idx="i + 1"
          tabindex="0"
          @contextmenu.prevent="openSnapMenu($event, s)" @keydown="onSnapMenuKey($event, s)" data-row-nav @keydown.self="rowArrowNav">
          <div class="sv-tl-dot"><component :is="stateIcon(s.state)" :size="14" /></div>
          <div class="sv-tl-body">
            <div class="sv-tl-head">
              <b class="mono mono-trunc" :title="s.snapshot"><MarkText :text="s.snapshot" :kw="filter" /></b>
              <!-- W-D：state 徽标改用 StatusPill（中文主体+英文小字 en 档组件化，原本地小字形态逐字同步更新；
 本地四色映射退役，tone g/b/r/y 走 .pill 单源、未知态 n 中性；chip 档判定文案不动） -->
              <StatusPill class="mono" :tone="stateTone(s.state)"
                :label="snapshotStateZh(s.state) || (s.state || '')"
                :en="snapshotStateZh(s.state) ? s.state : undefined" />
              <!-- TimeCell 合并：ts 取 start_time_in_millis（列表排序同源字段），abs 保持续老快照的绝对时间语义 -->
              <TimeCell class="sv-tl-time" :ts="s.start_time_in_millis" abs />
              <span v-if="s.duration_in_millis" class="mono sv-tl-dur">耗时 {{ fmtMs(s.duration_in_millis) }}</span>
              <div style="margin-left:auto; display:flex; gap:var(--sp-1h)">
                <!-- 1198：主行动「恢复」常驻；破坏性「删除」静息隐藏——
                     它早已在行右键菜单（恢复此快照… / 删除快照…）里，常驻只是重复入口，
                     且红色按钮挂在每一行上会在长列表里持续抢注意力。
                     悬停 / 键盘聚焦 / 该行更多按钮展开时显现；触屏无 hover 恒显。 -->
                <button v-if="canOps" class="btn sm" @click="openRestore(s)" :disabled="s.state === 'IN_PROGRESS'"><Undo2 :size="11" /> 恢复</button>
                <span class="sv-row-del">
                  <button v-if="canOps" class="btn sm danger" @click="doDeleteSnapshot(s)" :disabled="s.state === 'IN_PROGRESS'"><Trash2 :size="11" /> 删除</button>
                </span>
                <details class="sv-tl-more">
                  <summary class="btn sm ghost"><Info :size="11" /></summary>
                  <!-- W-C 批：快照原文 popover 走 highlightJson 范式（转义安全 v-html） -->
                  <pre class="mono json-view sv-tl-json" v-html="highlightJson(prettyJson(s))"></pre>
                </details>
              </div>
            </div>
            <div class="sv-tl-meta mono">
              <span v-if="s.indices?.length">indices: {{ s.indices.length }}</span>
              <span v-if="s.shards"> · shards: {{ s.shards.successful }}/{{ s.shards.total }}<span v-if="s.shards.failed" style="color:var(--err)"> · failed {{ s.shards.failed }}</span></span>
              <!-- W4c：global_state 布尔 → 是/否 + 档位（false 中性 / true --warn 小字——含集群全局状态属非常规配置，值得多看一眼） -->
              <span v-if="s.include_global_state !== undefined"> · global_state=<span :class="{ 'sv-gs-warn': s.include_global_state }">{{ s.include_global_state ? '是' : '否' }}</span></span>
            </div>
            <div v-if="s.indices?.length" class="sv-tl-chips">
              <span v-for="(idx, i) in s.indices.slice(0, 12)" :key="i" class="chip xs mono clickable" role="button" tabindex="0"
                :aria-label="'跳转数据浏览器：' + idx" title="选中该索引并跳转数据浏览器" @click="gotoIndex(idx)" @keydown.enter.prevent="gotoIndex(idx)" @keydown.space.prevent="gotoIndex(idx)">{{ idx }}</span>
              <span v-if="s.indices.length > 12" class="chip xs mono" style="color:var(--tx2)">+{{ s.indices.length - 12 }}</span>
            </div>
            <!-- 进行中快照行内进度——总 pct 进度条 + 每索引 stage 计数直方图
 （summary 端点随刷新搭车拉取，非进行中行不请求；FAILURE>0 红档一眼可辨） -->
            <div v-if="s.state === 'IN_PROGRESS' && snapSummaries[s.snapshot]" class="sv-prog">
              <div class="sv-prog-top">
                <span class="sv-prog-bar" aria-hidden="true"><span class="sv-prog-fill" :style="{ width: (snapSummaries[s.snapshot].pct ?? 0) + '%' }"></span></span>
                <span class="sv-prog-pct mono">{{ snapSummaries[s.snapshot].pct ?? 0 }}%</span>
                <span class="sv-prog-shards mono">{{ snapSummaries[s.snapshot].shardsStats.done }}/{{ snapSummaries[s.snapshot].shardsStats.total }} shards<template v-if="snapSummaries[s.snapshot].shardsStats.failed"> · <span style="color:var(--err)">failed {{ snapSummaries[s.snapshot].shardsStats.failed }}</span></template></span>
              </div>
              <div v-for="pi in snapSummaries[s.snapshot].indices" :key="pi.index" class="sv-prog-idx"
                :title="pi.index + '：' + pi.shardsDone + '/' + pi.shardsTotal + ' shards'">
                <span class="sv-prog-idx-name mono">{{ pi.index }}</span>
                <span class="sv-prog-stages mono">
                  <span v-for="st in STAGE_KEYS" :key="st" class="sv-stage"
                    :class="{ 'sv-stage-zero': !(pi.stageCounts?.[st] || 0), 'sv-stage-fail': st === 'FAILURE' && (pi.stageCounts?.[st] || 0) > 0 }">{{ st }} {{ pi.stageCounts?.[st] || 0 }}</span>
                </span>
                <span class="sv-prog-idx-shards mono">{{ pi.shardsDone }}/{{ pi.shardsTotal }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- err-bar 存在时不再显示「无快照」空态，两者互斥（失败不是空）
 裸 .empty 迁 EmptyState compact，创建快照按钮改 actionText 等价保留 -->
      <EmptyState v-else-if="!loadErr" compact :icon="History" text="当前 repo 无快照，或过滤无匹配"
        :action-text="canOps ? '创建快照' : undefined" @action="openCreate" />
    </div>

    <!-- 创建向导（补 max-width:92vw 窄屏守卫，SecurityView 审计弹窗先例） -->
    <n-modal v-model:show="createOpen" preset="card" title="创建快照" style="width:640px;max-width:92vw">
      <div class="sv-form">
        <div class="sv-form-row">
          <label>名称：</label>
          <input v-model="createName" class="sv-input" placeholder="snapshot-YYYYMMDD-HHmm 或自定义" />
        </div>
        <div class="sv-form-row">
          <label>Indices：</label>
          <input v-model="createIndices" class="sv-input" placeholder="逗号分隔，如 order-*,customer-*；留空快照全部" />
          <!-- 索引表达式校验提示条（useInputLint 出数据，.il-hint 单一样式出处 theme.css） -->
          <div v-if="createIndicesHint" class="il-hint" :class="'il-' + createIndicesLevel">{{ createIndicesHint }}</div>
        </div>
        <div class="sv-form-row">
          <label class="sv-chk">
            <input type="checkbox" v-model="createIncludeGlobalState" />
            <span>include_global_state（含集群 setting/template/ILM）</span>
          </label>
        </div>
        <div class="sv-form-row">
          <label class="sv-chk">
            <input type="checkbox" v-model="createPartial" />
            <span>partial（允许部分分片失败）</span>
          </label>
        </div>
        <div class="sv-form-preview">
          <div class="sv-preview-t">Request 预览：</div>
          <!-- W-C 批：请求行挂全局方法语义色（.m-put）+ 路径 --ac-hi，body 走 highlightJson -->
          <pre class="mono sv-req-line"><span class="m-put">PUT</span> <span class="sv-req-path">/_snapshot/{{ currentRepo }}/{{ createName || '&lt;name&gt;' }}</span></pre>
          <pre class="mono json-view" v-html="createPreviewHtml"></pre>
        </div>
      </div>
      <template #footer>
        <div style="display:flex; justify-content:flex-end; gap:var(--sp-2)">
          <button class="btn ghost sm" @click="createOpen = false">取消</button>
          <button class="btn primary sm" @click="doCreate" :disabled="creating || !createName || !canOps"
            :title="canOps ? '' : '当前授权不含快照写权限'">
            <Save :size="11" /> {{ creating ? '提交中…' : '开始快照（异步）' }}
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 恢复向导（补 max-width:92vw 窄屏守卫） -->
    <n-modal v-model:show="restoreOpen" preset="card" title="恢复快照" style="width:680px;max-width:92vw">
      <div v-if="restoreTarget" class="sv-form">
        <div class="sv-form-row">
          <label>来源：</label>
          <span class="mono">{{ currentRepo }} / {{ restoreTarget.snapshot }}</span>
          <!-- W-D：state→色档随主列表同走 StatusPill tone（此前恢复向导各态恒绿违反「失败=err」全站口径的缺陷已随改用收敛） -->
          <StatusPill class="mono" style="margin-left:var(--sp-2)" :tone="stateTone(restoreTarget.state)"
            :label="snapshotStateZh(restoreTarget.state) || (restoreTarget.state || '')"
            :en="snapshotStateZh(restoreTarget.state) ? restoreTarget.state : undefined" />
        </div>
        <div class="sv-form-row">
          <label>Indices：</label>
          <input v-model="restoreIndices" class="sv-input" :placeholder="mustSpecifyRestoreIndices ? '必填：显式指定业务索引（不可含控制面索引）' : '留空恢复全部（' + (restoreTarget.indices?.length || 0) + ' 个）'" />
          <!-- 索引表达式校验提示条（创建向导同款） -->
          <div v-if="restoreIndicesHint" class="il-hint" :class="'il-' + restoreIndicesLevel">{{ restoreIndicesHint }}</div>
        </div>
        <div class="sv-form-row">
          <label>Rename：</label>
          <input v-model="restoreRenamePattern" class="sv-input" placeholder="rename_pattern 正则（如 (.+)）" style="width:44%" />
          <span style="margin:0 var(--sp-1h); color:var(--tx2)">→</span>
          <input v-model="restoreRenameReplacement" class="sv-input" placeholder="rename_replacement（如 restored_$1）" style="width:44%" />
          <!-- rename_pattern new RegExp 试编译提示条（replacement 非正则不校验） -->
          <div v-if="restoreRenamePatternHint" class="il-hint" :class="'il-' + restoreRenamePatternLevel">{{ restoreRenamePatternHint }}</div>
        </div>
        <div class="sv-form-row">
          <label class="sv-chk">
            <input type="checkbox" v-model="restoreIncludeGlobalState" />
            <span>include_global_state</span>
          </label>
        </div>
        <div class="sv-form-preview">
          <div class="sv-preview-t">Request 预览：</div>
          <pre class="mono sv-req-line"><span class="m-post">POST</span> <span class="sv-req-path">/_snapshot/{{ currentRepo }}/{{ restoreTarget.snapshot }}/_restore</span></pre>
          <pre class="mono json-view" v-html="restorePreviewHtml"></pre>
        </div>
        <div class="sv-warn">
          <AlertTriangle :size="13" style="color:var(--warn)" />
          <span>目标索引名若与集群已存在的开启中索引冲突，将失败。建议使用 rename_pattern / rename_replacement 隔离。</span>
        </div>
      </div>
      <template #footer>
        <div style="display:flex; justify-content:flex-end; gap:var(--sp-2)">
          <button class="btn ghost sm" @click="restoreOpen = false">取消</button>
          <button class="btn primary sm" @click="doRestore"
            :disabled="restoring || (mustSpecifyRestoreIndices && !restoreIndices.trim()) || !canOps"
            :title="canOps ? '' : '当前授权不含快照写权限'">
            <Undo2 :size="11" /> {{ restoring ? '提交中…' : '开始恢复（异步）' }}
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 快照行右键菜单（E 组逐表过 dbx 清单）——复制快照名/快照信息/恢复/删除直达 -->
    <CellContextMenu v-if="snapMenu" :x="snapMenu.x" :y="snapMenu.y" :title="snapMenu.s.snapshot"
      :items="snapMenuItems" @close="snapMenu = null" />

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/snapshot/ 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { exportStamp, fmtNum, csvCell, downloadText, csvText } from '../utils/format';
import { useRouter } from 'vue-router';
import { NSelect, NModal } from 'naive-ui';
import EmptyState from '../components/EmptyState.vue';
import MarkText from '../components/MarkText.vue';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { usePref } from '../composables/urlState';
import AutoRefreshSelect from '../components/AutoRefreshSelect.vue';
import { writeStoredRaw } from '../utils/safeJson';
import CellContextMenu from '../components/CellContextMenu.vue';
import { Shield, Camera, Plus, RefreshCw, History, Undo2, Info, Save, Trash2, Copy, ClipboardList,
  AlertTriangle, CheckCircle2, Loader2, XCircle, FileDown, TerminalSquare,
  ArrowDownNarrowWide, ArrowUpNarrowWide, Terminal } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import type { SnapshotStatusSummary } from '../api'; /* ：行内进度摘要形状 */
import PageHeader from '../components/PageHeader.vue';
import { copyText } from '../utils/format';
import { useScopedDraft } from '../composables/useScopedDraft';
import { friendlyApiError } from '../utils/esError';
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：错误条双参改用（code/endpoint 元信息行） */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { snapshotStateZh } from '../utils/esEnumZh'; /* ：快照 state 枚举中文接线 */
/* 时长档单源（快照耗时 fmtMs） */
import { semFormat } from '../composables/useSemFormat';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';

import { askConfirm } from '../composables/confirm';
import { useInputLint, indexNameRule, type LintRule } from '../composables/useInputLint'; /* ：输入智能校验 */
import SkeletonBox from '../components/SkeletonBox.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：手写过滤框改用统一件 */
import TimeCell from '../components/TimeCell.vue';
import { highlightJson, prettyJson } from '../utils/jsonc';
import HitNav from '../components/HitNav.vue';
import { useHitLocate } from '../composables/useHitNav';
import { useModalEnter } from '../composables/useModalEnter';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* 页头统计串统一件 */
import StatusPill from '../components/StatusPill.vue'; /* W-D：state 徽标统一件 */

const store = useAppStore();
/* 权限门禁——快照创建/恢复=snapshot/create|restore=CLUSTER 档（rank3+）；
 删除快照同样 rank3 门槛（角色定义「OPERATOR=低危写」不含破坏性删除；后端 /cluster/snapshot/delete
 未入 CLUSTER 关键词清单是已知偏低档，待后端加固，前端先按角色意图收口） */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/snapshot/create', store.target));
/* DevTools 跳转是页面入口，不是当前页写权：无 DevTools/REST 页写键时不亮「打开 API」。 */
const canDevtools = computed(() => auth.canEndpoint('admin', 'POST',
  '/internal/es/index/cluster/devtools/execute', store.target));
function openInDevtools(method: string, path: string, title: string) {
  if (!canDevtools.value) { store.notify('warning', 'DevTools 入口需要 DevTools/REST 页写权限或 ADMIN'); return; }
  /* 与 Watcher/Ilm/DslQuery 同一 sessionStorage 契约；此前用 ?_prefill= 查询串，
     DevToolsView.consumePrefill 只读本键——点了打开空 Tab（ADMIN 也一样）。 */
  writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({ title, method, path }));
  router.push('/devtools');
}
const router = useRouter();

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/snapshot/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

function goDevtoolsCreateRepo() {
  openInDevtools('PUT', '/_snapshot/my_backup', 'snapshot repo sample');
}

/* -f 跨工具联动——快照包含的索引一键选中并跳数据浏览器核对现存数据 */
function gotoIndex(idx: string) {
  store.pick(idx);
  router.push('/browser');
}

const repos = ref<any[]>([]);
const loadingRepos = ref(false);
const snapshots = ref<any[]>([]);
const loading = ref(false);
const loadErr = ref('');
/* 原始错误对象旁路（压串前 ApiError 供 errMeta 读 code/endpoint；runErrRaw 同款范式） */
const loadErrRaw = ref<unknown>(null);
/* 快照过滤词进 URL */
const filter = useScopedDraft('filter', { route: 'snapshots' }, '').text;
/* 当前仓库选择按会话草稿记忆（route 维度）——多仓库环境切页/刷新不再回落第一仓库 */
const repoDraft = useScopedDraft('repo', { route: 'snapshots' }, '').text;
const currentRepo = ref<string | null>(repoDraft.value || null);

/* 二批清零：卡片流排序状态（BrowserView clickSort 范式同款——各字段自然方向比较器 + 方向钮整体翻转）。
 默认键 start_time、默认 sortRev=false=自然方向=新→旧降序，即迁移前 loadSnapshots 的固定序；
 usePref 偏好落盘 esquerystudio.pref.sv.*，同值赋值不触发 watch（默认值不落盘，BrowserView 同口径） */
const sortBy = usePref('sv.sortBy', 'start_time');
const sortRev = usePref('sv.sortRev', false);
const sortOpts = [
  { label: '开始时间', value: 'start_time' },
  { label: '名称', value: 'name' },
  { label: '索引数', value: 'indices' },
  { label: '耗时', value: 'duration' },
];
/* 自然方向：start_time 新→旧（历史固定降序语义）、名称 A→Z、索引数 多→少、耗时 长→短；
 duration/indices 缺失兜底 0（ES 不保证回 duration_in_millis），name 字符串比 */
const SORT_CMP: Record<string, (a: any, b: any) => number> = {
  start_time: (a: any, b: any) => (b.start_time_in_millis || 0) - (a.start_time_in_millis || 0),
  name: (a: any, b: any) => String(a.snapshot || '').localeCompare(String(b.snapshot || '')),
  indices: (a: any, b: any) => (b.indices?.length || 0) - (a.indices?.length || 0),
  duration: (a: any, b: any) => (b.duration_in_millis || 0) - (a.duration_in_millis || 0),
};

/* SLM/快照执行期盯进度——快照列表接 useAutoRefresh */
const snapAutoRefresh = usePref('snapshots.autoRefresh', false);
const snapIntervalMs = usePref('snapshots.intervalMs', 30000);
const snapRefresher = useAutoRefresh(loadSnapshots, {
  ms: () => (snapAutoRefresh.value && currentRepo.value ? snapIntervalMs.value : 0),
  guard: () => !loading.value,
});
watch(snapAutoRefresh, (v) => { if (v && currentRepo.value) loadSnapshots(); snapRefresher.restart(); });
watch(snapIntervalMs, () => snapRefresher.restart());
watch(currentRepo, () => snapRefresher.restart());
/* 补 setOn(true)——接线漏了这行：内部 on 恒 false 时 restart() 是
 no-op，自动刷新从未真正排表（正典范式=TasksView :455-472「内部意图恒开，ms getter
 决定实际运行」）；行内进度轮询同样依赖此 tick */
snapRefresher.setOn(true);

onMounted(loadRepos);

/* -A2：提成具名函数才能重试；失败页面级透传 */
async function loadRepos() {
  loadingRepos.value = true;
  try {
    repos.value = (await api.snapshotRepos()) as any[];
    loadErr.value = '';
    loadErrRaw.value = null;
    if (repos.value.length) {
      const saved = repoDraft.value;
      currentRepo.value = saved && repos.value.some(r => r.name === saved) ? saved : repos.value[0].name;
      repoDraft.value = currentRepo.value ?? '';
      await loadSnapshots();
    }
  } catch (e: any) {
    loadErr.value = '快照仓库拉取失败：' + friendlyApiError(e);
    loadErrRaw.value = e; /* ：原始对象旁路（errMeta 双参喂入） */
    store.notify('error', 'snapshotRepos: ' + loadErr.value);
  } finally {
    loadingRepos.value = false;
  }
}

/* repoOpts 升级——同类型仓库 localeCompare 排序 + 按 type 分组（fs/url/s3…），
 多仓库环境扫读与定位不再依赖注册顺序；子项 label 口径不变（'name (type)'），
 snapshotRepoMemory 的选择记忆/自愈链路只认 value=name，分组不影响其行为 */
const repoOpts = computed(() => {
  const sorted = [...repos.value]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const byType = new Map<string, any[]>();
  for (const r of sorted) {
    const t = r.type || '?';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push({ label: r.name + ' (' + t + ')', value: r.name });
  }
  return [...byType.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map(t => ({ type: 'group' as const, label: t, key: t, children: byType.get(t) }));
});
const currentRepoMeta = computed(() => repos.value.find(r => r.name === currentRepo.value));

async function onRepoChange() {
  repoDraft.value = currentRepo.value ?? '';
  await loadSnapshots();
}

async function loadSnapshots() {
  if (!currentRepo.value) return;
  /* 选择源快照比对——repo 切换 onRepoChange 绕自动刷新 guard 直调，旧 repo 迟到回包
 不得顶掉新 repo 列表（失败支清空与 finally 复位/进度搭车同口径） */
  const repo = currentRepo.value;
  loading.value = true;
  try {
    const list = (await api.snapshotList(repo)) as any[];
    if (repo !== currentRepo.value) return;
    snapshots.value = list;
    loadErr.value = '';
    loadErrRaw.value = null;
  } catch (e: any) {
    if (repo !== currentRepo.value) return;
    loadErr.value = '快照列表拉取失败：' + friendlyApiError(e);
    loadErrRaw.value = e; /* ：原始对象旁路（errMeta 双参喂入） */
    store.notify('error', 'snapshotList: ' + loadErr.value);
    snapshots.value = [];
  } finally {
    if (repo === currentRepo.value) {
      loading.value = false;
      /* 进行中行进度随列表刷新搭车拉取（不新开定时器；失败清空同路径清进度） */
      void loadSnapProgress();
    }
  }
}

const filtered = computed(() => {
  let list = snapshots.value.slice();
  const kw = filter.value.toLowerCase();
  if (kw) list = list.filter(s => (s.snapshot || '').toLowerCase().includes(kw));
  /* 排序在过滤后应用（跟随过滤语义，HitNav 命中序/CSV 导出同源此序）；方向钮整体翻转 */
  const cmp = SORT_CMP[sortBy.value] || SORT_CMP.start_time;
  const d = sortRev.value ? -1 : 1;
  list.sort((a: any, b: any) => cmp(a, b) * d);
  return list;
});

/* 快照列表 CSV 导出（运维对账——名/状态/起止/耗时/索引数/索引清单，
 跟随当前过滤；SecurityView 审计导出同格式 csvCell+BOM） */
function exportCsv() {
  if (!filtered.value.length) return;
  const head = ['snapshot', 'state', 'start_time', 'duration_ms', 'indices_count', 'indices'];
  downloadText(
    `snapshots-${currentRepo.value || 'repo'}-${exportStamp()}.csv`,
    /* 组装合并 csvText */
    csvText(head, filtered.value.map((s: any) => [
      s.snapshot, s.state, s.start_time || '', s.duration_in_millis ?? '',
      s.indices?.length ?? 0, (s.indices || []).join(' '),
    ])),
    'text/csv;charset=utf-8',
  );
  store.notify('success', `已导出 ${filtered.value.length} 条快照记录`);
}

/* 搜索定位：过滤结果即命中集，时间线行按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filtered.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

const partialCount = computed(() => snapshots.value.filter(s => s.state === 'PARTIAL').length);
const failedCount = computed(() => snapshots.value.filter(s => s.state === 'FAILED').length);
const inProgressCount = computed(() => snapshots.value.filter(s => s.state === 'IN_PROGRESS').length);

/* ═══ ：进行中快照行内进度（可观测/进度可见） ═══
 列表 API 对 IN_PROGRESS 行不回 shards 统计（shards 字段恒空）——对进行中行逐个打
 summary 端点（snapshotStatusSummary，同端点 summary=true 分支）。三条红线：
 ① 轮询搭现有 snapRefresher/useAutoRefresh 的 loadSnapshots 便车（手动刷新同路径），
 本页禁新开定时器；② progInFlight 防重叠请求；③ progSeq 请求代序号——卸载/清空
 时代号前移，旧响应回来比对不等即丢，陈旧结果不写入。 */
const snapSummaries = ref<Record<string, SnapshotStatusSummary>>({});
const STAGE_KEYS = ['INIT', 'STARTED', 'START', 'FINALIZE', 'DONE', 'FAILURE'] as const;
let progSeq = 0;
let progInFlight = false;

async function loadSnapProgress() {
  const repo = currentRepo.value;
  const rows = (snapshots.value || []).filter(s => s.state === 'IN_PROGRESS');
  if (!repo || !rows.length) {
    progSeq++; /* 在途代号作废：旧响应回来必丢 */
    snapSummaries.value = {};
    return;
  }
  if (progInFlight) return; /* 防重叠：跳过，在途请求完成后照常写入（下轮再补新行） */
  progInFlight = true;
  const seq = ++progSeq;
  try {
    const rs = await Promise.all(rows.map(s =>
      api.snapshotStatusSummary(repo, s.snapshot).catch(() => null))); /* 单行失败不拖垮整批，行内退回无进度 */
    if (seq !== progSeq) return; /* 陈旧丢弃（卸载/列表清空后回来的旧响应） */
    const map: Record<string, SnapshotStatusSummary> = {};
    rows.forEach((row, i) => { const r = rs[i]; if (row && r) map[row.snapshot] = r; });
    snapSummaries.value = map;
  } finally {
    if (seq === progSeq) progInFlight = false;
  }
}
/* 卸载即作废在途代：组件销毁后旧请求结果不写入 */
onBeforeUnmount(() => { progSeq++; });

/* 页头统计串 MetaStrip items——>0 即警示档（部分完成=warn/失败=err），0 回中性亮色（全站语言）。
 W4c：快照总数自 MetaStrip 摘除——与卡头「快照时间线（N）」双显重复（IlmView 页头注释先例：
 与列表卡头重复的计数直接删，计数留 :title 全文兜底），repo 维度计数 :title 已有 */
const svMeta = computed<MetaStripItem[]>(() => [
  { value: fmtNum(partialCount.value), label: '部分完成', tone: partialCount.value ? 'warn' : undefined, tip: '部分成功' },
  { value: fmtNum(failedCount.value), label: '失败', tone: failedCount.value ? 'err' : undefined },
  { value: fmtNum(inProgressCount.value), label: '进行中' },
]);

function stateIcon(state: string) {
  return state === 'SUCCESS' ? CheckCircle2
    : state === 'IN_PROGRESS' ? Loader2
    : state === 'FAILED' ? XCircle
    : AlertTriangle;
}
/* W-D：state → StatusPill tone（原本地四色映射同 token：success=g
 in_progress=b failed=r partial=y，未知态 n 中性） */
function stateTone(state: string): 'g' | 'b' | 'r' | 'y' | 'n' {
  return state === 'SUCCESS' ? 'g'
    : state === 'IN_PROGRESS' ? 'b'
    : state === 'FAILED' ? 'r'
    : state === 'PARTIAL' ? 'y'
    : 'n';
}
/* 数值单源退役——fmtMs 本地三元随时长档合并 semFormat duration 单源退役
 （展示微差可接受：'1m 30s' → '90.0s'，档位以单源为准） */
function fmtMs(ms: number): string {
  return semFormat(ms, 'duration')?.text ?? (ms + ' ms');
}

/* 创建向导 */
const createOpen = ref(false);
const createName = ref('');
const createIndices = ref('');
const createIncludeGlobalState = ref(false);
const createPartial = ref(false);
const creating = ref(false);

function openCreate() {
  /* 空态 actionText 之外的第二道门：任何入口（含 EmptyState 事件）都不得为只读用户打开提交面 */
  if (!canOps.value) { store.notify('warning', '快照操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  createName.value = `snap-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  createIndices.value = '';
  createIncludeGlobalState.value = false;
  createPartial.value = false;
  createOpen.value = true;
}

/* W-C 批：请求预览 body 走 highlightJson（已转义 HTML，全站唯一 v-html 通道） */
const createPreviewHtml = computed(() => highlightJson(createPreview.value));
const restorePreviewHtml = computed(() => highlightJson(restorePreview.value));

const createPreview = computed(() => {
  const body: any = {};
  if (createIndices.value.trim()) body.indices = createIndices.value.trim();
  body.include_global_state = createIncludeGlobalState.value;
  body.partial = createPartial.value;
  return JSON.stringify(body, null, 2);
});

async function doCreate() {
  if (!canOps.value) { store.notify('warning', '快照操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (creating.value) return; /* 提交防重（同 doRestore）：在途时双击/Enter 重复下发直接短路 */
  if (!currentRepo.value || !createName.value) return;
  // 真实提交前强制确认：快照创建会占用仓库存储并触发集群 IO
  if (!await askConfirm({
    title: '创建快照',
    message: '将异步创建快照：会占用仓库存储并在创建期间增加集群 IO 负载。',
    okText: '创建快照',
    facts: [{ label: '仓库', value: currentRepo.value }, { label: '快照名', value: createName.value }],
  })) return;
  creating.value = true;
  try {
    await api.snapshotCreate(currentRepo.value, createName.value, createPreview.value);
    /* 纯文本成功通知升格带 action「查状态」（对齐 doRestore 恢复异步指路先例 +
 force_merge 深链范式）——快照异步创建，一键去 DevTools 预填 GET
 /_snapshot/<repo>/<name> 看进度（686 行级「状态」动作同一契约，零新端点） */
    store.notify('success', '快照已提交（异步）：' + createName.value, {
      duration: 12000,
      action: {
        label: '查状态',
        onClick: () => { openInDevtools('GET', `/_snapshot/${encodeURIComponent(currentRepo.value || '')}/${encodeURIComponent(createName.value)}`, 'snapshot/' + createName.value); },
      },
    });
    createOpen.value = false;
    /* 提交后立即补刷一次（IN_PROGRESS 行级进度不等 1500ms 才可见）；1500ms 单发兜底保留 */
    loadSnapshots();
    setTimeout(loadSnapshots, 1500);
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（doRestore 已修是先例，创建失败同口径合并） */
    store.notify('error', '创建失败：' + friendlyApiError(e));
  } finally {
    creating.value = false;
  }
}

/* 恢复向导 */
const restoreOpen = ref(false);
const restoreTarget = ref<any>(null);
const restoreIndices = ref('');
/* 非 ADMIN 必须显式指定业务索引：restore-all 会覆盖控制面索引（后端 restoreSnapshotGuarded 同口径） */
const mustSpecifyRestoreIndices = computed(() => !auth.can('admin'));
const restoreRenamePattern = ref('');
const restoreRenameReplacement = ref('');
const restoreIncludeGlobalState = ref(false);
const restoring = ref(false);

/* ═══ ：输入智能校验（useInputLint 出数据，.il-hint 提示条样式全站单一出处 theme.css）═══
 ① Indices 双向导：逗号分隔多表达式拆分逐个过 indexNameRule 单表达式逻辑；快照 indices
 支持通配（placeholder 示例 order-*），校验前把 * 折叠为普通字符探针——其余规则
 （全小写/非法字符/保留头/长度）原样生效。提示条不阻断提交（异步任务由 ES 侧裁决）。
 ② rename_pattern：new RegExp 客户端试编译尽力校验（ES 侧 Java 正则语义差异不追，只拦
 括号不配对等硬伤）；replacement 非正则无编译语义，不校验。 */
function snapshotIndicesRule(): LintRule {
  const single = indexNameRule();
  return (v) => {
    for (const part of v.split(',')) {
      const expr = part.trim();
      if (!expr) continue;
      const hit = single(expr.replace(/\*/g, 'a'));
      if (hit) return { msg: `索引表达式「${expr}」${hit.msg}` };
    }
    return null;
  };
}
function renamePatternRule(): LintRule {
  return (v) => {
    try { new RegExp(v); return null; } catch (e) { return { msg: 'rename_pattern 不是合法正则：' + (e as Error).message }; }
  };
}
const createIndicesLint = useInputLint([snapshotIndicesRule()]);
const { hint: createIndicesHint, level: createIndicesLevel, check: createIndicesCheck } = createIndicesLint;
const restoreIndicesLint = useInputLint([snapshotIndicesRule()]);
const { hint: restoreIndicesHint, level: restoreIndicesLevel, check: restoreIndicesCheck } = restoreIndicesLint;
const renamePatternLint = useInputLint([renamePatternRule()]);
const { hint: restoreRenamePatternHint, level: restoreRenamePatternLevel, check: restoreRenamePatternCheck } = renamePatternLint;
watch(createIndices, v => { createIndicesCheck(v); });
watch(restoreIndices, v => { restoreIndicesCheck(v); });
watch(restoreRenamePattern, v => { restoreRenamePatternCheck(v); });

function openRestore(s: any) {
  /* 当前端两个入口都带 v-if/menu 剪辑，但直调（键盘/程序化）仍需同门：
     打开恢复弹窗等于进入一次 restore 写意图，先拦在这里再谈执行体。 */
  if (!canOps.value) { store.notify('warning', '快照操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  restoreTarget.value = s;
  restoreIndices.value = '';
  restoreRenamePattern.value = '(.+)';
  restoreRenameReplacement.value = 'restored_$1';
  restoreIncludeGlobalState.value = false;
  restoreOpen.value = true;
}

/* 快照行右键菜单（E 组逐表过 dbx 清单）——复制快照名/快照信息/
 恢复/删除直达（恢复与删除沿用既有确认与禁用语义；列管理不做：时间线非列式表格） */
const snapMenu = ref<{ x: number; y: number; s: any } | null>(null);
function openSnapMenu(e: MouseEvent, s: any) {
  snapMenu.value = { x: e.clientX, y: e.clientY, s };
}
function onSnapMenuKey(e: KeyboardEvent, s: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  snapMenu.value = { ...menuKeyAnchor(e), s };
}
const snapMenuItems = computed(() => {
  const m = snapMenu.value; if (!m) return [];
  const s = m.s;
  const facts = `snapshot=${s.snapshot} repo=${currentRepo.value} state=${s.state || '-'} `
    + `start=${s.start_time || '-'} indices=${s.indices?.length ?? 0} `
    + `shards=${s.shards ? s.shards.successful + '/' + s.shards.total : '-'}`;
  const inProgress = s.state === 'IN_PROGRESS';
  /* 恢复/删除=rank3 档——低权角色菜单只留复制项 */
  const ops = inProgress || !canOps.value ? [] : [
    { key: 'restore', label: '恢复此快照…', icon: Undo2, sep: true, run: () => openRestore(s) },
    /* 在 DevTools 打开 _restore API（GET 快照详情+恢复 body 骨架双段预填不便，先给 GET；恢复向导=恢复此快照…） */
    ...(canDevtools.value ? [{ key: 'devtools-restore', label: '在 DevTools 打开恢复 API', icon: TerminalSquare, run: () => {
      openInDevtools('POST', `/_snapshot/${encodeURIComponent(currentRepo.value || '')}/${encodeURIComponent(s.snapshot)}/_restore`, 'restore/' + s.snapshot);
    } }] : []),
    { key: 'delete', label: '删除快照…', icon: Trash2, danger: true, run: () => doDeleteSnapshot(s) },
  ];
  return [
    { key: 'copy-name', label: '复制快照名', icon: Copy, run: async () => {
      const ok = await copyText(s.snapshot);
      store.notify(ok ? 'success' : 'error', ok ? '已复制快照名' : '复制失败');
    } },
    { key: 'copy-row', label: '复制快照信息', icon: ClipboardList, run: async () => {
      const ok = await copyText(facts);
      store.notify(ok ? 'success' : 'error', ok ? '已复制快照信息' : '复制失败');
    } },
    /* 在 DevTools 打开（GET /_snapshot/<repo>/<snap>；sessionStorage 预填契约） */
    ...(canDevtools.value ? [{ key: 'devtools', label: '在 DevTools 打开 API', icon: TerminalSquare, run: () => {
      openInDevtools('GET', `/_snapshot/${encodeURIComponent(currentRepo.value || '')}/${encodeURIComponent(s.snapshot)}`, 'snapshot/' + s.snapshot);
    } }] : []),
    ...ops,
  ];
});

/* 删除快照（过期快照清理，此前只能去 REST 手删） */
async function doDeleteSnapshot(s: any) {
  if (!canOps.value) { store.notify('warning', '快照操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (!await askConfirm({
    title: '删除快照',
    level: 'critical', guardText: s.snapshot,
    message: '将删除该快照，快照数据不可恢复。',
    okText: '删除快照',
    facts: [{ label: '快照名', value: s.snapshot }, { label: '仓库', value: currentRepo.value || '-' }],
  })) return;
  try {
    await api.snapshotDelete(currentRepo.value!, s.snapshot);
    store.notify('success', '快照已删除');
    loadSnapshots();
  } catch (e: any) {
    store.notify('error', '删除失败：' + friendlyApiError(e));
  }
}

const restorePreview = computed(() => {
  const body: any = {};
  if (restoreIndices.value.trim()) body.indices = restoreIndices.value.trim();
  if (restoreRenamePattern.value.trim() && restoreRenameReplacement.value.trim()) {
    body.rename_pattern = restoreRenamePattern.value.trim();
    body.rename_replacement = restoreRenameReplacement.value.trim();
  }
  body.include_global_state = restoreIncludeGlobalState.value;
  return JSON.stringify(body, null, 2);
});

async function doRestore() {
  if (!canOps.value) { store.notify('warning', '快照操作需要 CLUSTER_OP/ADMIN 角色'); return; }
  if (mustSpecifyRestoreIndices.value && !restoreIndices.value.trim()) {
    store.notify('warning', '恢复需显式指定业务索引（不允许恢复全部，防覆盖控制面索引）');
    return;
  }
  if (restoring.value) return; /* ：函数体级防重入 */
  if (!currentRepo.value || !restoreTarget.value) return;
  // 恢复为高危操作：可能创建/覆盖索引，critical 级输入守卫并讲清 rename 规则
  const hasRename = restoreRenamePattern.value.trim() && restoreRenameReplacement.value.trim();
  const renameNote = hasRename ? '' : '；未配置重命名（同名索引可能冲突/覆盖）';
  if (!await askConfirm({
    title: '恢复快照',
    level: 'critical', guardText: restoreTarget.value.snapshot,
    message: `将恢复该快照，恢复可能创建或覆盖线上索引，被覆盖的数据不可找回${renameNote}。`,
    okText: '执行恢复',
    facts: [
      { label: '快照名', value: restoreTarget.value.snapshot },
      { label: '仓库', value: currentRepo.value },
      ...(hasRename ? [{ label: '重命名规则', value: `${restoreRenamePattern.value.trim()} → ${restoreRenameReplacement.value.trim()}` }] : []),
    ],
  })) return;
  restoring.value = true;
  try {
    await api.snapshotRestore(currentRepo.value, restoreTarget.value.snapshot, restorePreview.value);
    /* 成功反馈带「去查询验证」动作（写类视图验证去處；目标索引按 rename 规则推导：
 配了 rename_replacement 则首索引名替换前缀，否则原名；异步执行后可查）。
 推导是尽力服务：rename 正则 lint 只提示不阻断提交，坏正则由 ES 侧裁决——
 推导自身抛错只降级为不带深链的成功通知，不得把已提交成功的恢复误报成失败 */
    const firstIdx = restoreTarget.value.indices?.[0];
    let verifyIdx: string | undefined = firstIdx;
    if (firstIdx && restoreRenameReplacement.value.trim() && restoreRenamePattern.value.trim()) {
      try {
        verifyIdx = firstIdx.replace(new RegExp(restoreRenamePattern.value), restoreRenameReplacement.value);
      } catch { /* 坏 pattern：放弃深链推导，成功语义不变 */ }
    }
    store.notify('success', '恢复已提交（异步）：' + restoreTarget.value.snapshot
      + '，进度见列表行' /* ：补进度指路（恢复是异步任务，列表行有行级进度） */, {
      duration: 8000,
      ...(verifyIdx ? { action: { label: '去查询验证', onClick: () => { router.push({ path: '/search', query: { mode: 'dsl', idx: verifyIdx } }); } } } : {}),
    });
    restoreOpen.value = false;
    /* 提交成功后立即补刷列表一次——恢复提交后列表行才出现/推进 IN_PROGRESS 进度 */
    loadSnapshots();
  } catch (e: any) {
    /* 裸错误串 → friendlyEsError（快照恢复失败高危路径，XmigrateView w80 先例全站兜底） */
    store.notify('error', '恢复失败：' + friendlyApiError(e));
  } finally {
    restoring.value = false;
  }
}

/* 表单弹窗 Enter=提交——创建/恢复均内置二次确认（askConfirm），等价点击主按钮；
 can 门与主按钮 disabled 同口径（creating/restoring 在途不放行，防 Enter 重复下发） */
useModalEnter(createOpen, doCreate, () => canOps.value && !creating.value);
useModalEnter(restoreOpen, doRestore, () => canOps.value);
</script>

<style scoped>
.sv { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 轨4（刀④）：空态空壳规则（bg1+border+radius）随模板类退役——空态不留
 整块空框，EmptyState 裸置 */
/* .sv-title（fs-sm/600）为 PageHeader 接管后的死规则，随标题四档合并退役。
 repo 徽章 chip 私造样式随模板退役删除（并 MetaStrip mini 档，形态归组件单源） */
.sv-input { height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); font-family: var(--font-mono, monospace); }
/* v3.0.0：内联 width:200px 合并（B2 审计归零）。：过滤框改用 SearchFilterBar 后
 旧 .sv-input-w（input 落位）退役改 .sv-input-wrap（落位随先例上移壳根，tv-kw-wrap 同形） */
.sv-input-wrap { margin-left: auto; width: 200px; box-sizing: border-box; }
/* 空态里的 DevTools 能力说明（替代按钮，弱化为说明文字） */
.sv-dev-hint { display: inline-block; font-size: var(--fs-xs); color: var(--tx2); max-width: 46ch; line-height: 1.5; }
.sv-input:focus { border-color: var(--ac); outline: 0; }

/* KPI 大卡墙退役：页头 inline 统计串改用 MetaStrip 统一件——基础形态（flex/b/i/sep/mono/tone）
 全由组件承担，本页只留落位 */
.sv-meta { margin-top: 3px; }
/* 自动刷新开关 label 的 inline style 收 scoped（DiagView .dg-auto-lbl 同款） */
.sv-auto-lbl { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; }

/* pane 壳（.card 三件套）退役——flex 布局语义与 .card padding 载体原样迁入
 （14px 垂直留白为 .card 刻意值同步更新保字面，内容边距零变动；522 排序锁域零触） */
.sv-list { display: flex; flex-direction: column; padding: 14px var(--sp-4); }
.sv-tl { padding: var(--sp-2h) 14px; position: relative; }
.sv-tl::before { content: ''; position: absolute; left: 27px; top: 20px; bottom: 20px; width: 2px; background: var(--line); }
.sv-tl-row { display: flex; gap: var(--sp-3); padding: var(--sp-2h) 0; position: relative; }
/* 1198：破坏性「删除」静息隐藏——与「恢复」并列常驻时，红色按钮在长列表里持续抢注意力，
   而它早已在行右键菜单（删除快照…）里。悬停 / 键盘聚焦时显现；
   触屏无 hover 恒显，右键始终是第二条完整通道。 */
.sv-tl-row .sv-row-del { display: inline-flex; opacity: 0; transition: opacity var(--tr); }
.sv-tl-row:hover .sv-row-del, .sv-tl-row:focus-within .sv-row-del { opacity: 1; }
@media (hover: none) { .sv-tl-row .sv-row-del { opacity: 1; } }
/* 当前命中行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.sv-tl-row.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); border-radius: var(--r-s); }
.sv-tl-dot { width: 26px; height: 26px; border-radius: 50%; background: var(--bg1); border: 2px solid var(--line); display: flex; align-items: center; justify-content: center; z-index: 1; flex-shrink: 0; }
.sv-tl-row.st-success .sv-tl-dot { border-color: var(--ok); color: var(--ok); }
.sv-tl-row.st-in_progress .sv-tl-dot { border-color: var(--info); color: var(--info); }
.sv-tl-row.st-in_progress .sv-tl-dot :deep(svg) { animation: spin 1.4s linear infinite; }
.sv-tl-row.st-failed .sv-tl-dot { border-color: var(--err); color: var(--err); }
.sv-tl-row.st-partial .sv-tl-dot { border-color: var(--warn); color: var(--warn); }
.sv-tl-body { flex: 1; min-width: 0; }
.sv-tl-head { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); flex-wrap: wrap; }
.sv-tl-time { color: var(--tx2); font-size: var(--fs-xs); margin-left: var(--sp-1); }
.sv-tl-dur { color: var(--tx2); font-size: var(--fs-xs); }
/* W-D：英文小字规则随 state 徽标改用 StatusPill 退役（en 档组件化；XmigrateView .xm-st-en 是其自有样式不在此列） */
.sv-tl-meta { font-size: var(--fs-xs); color: var(--tx1); margin-top: 3px; }
/* W4c：global_state=true 弱警示档（--warn 小字，--fs-2xs 比行主导 --fs-xs 低一档） */
.sv-gs-warn { color: var(--warn); font-size: var(--fs-2xs); }
.sv-tl-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: 5px; }
/* 迷你形态（padding/radius）归全局 .chip.xs，本行散写退役（bg2/tx1/fs-xs 全局 .chip 已有） */
.sv-tl-chips .chip.clickable { cursor: pointer; }
.sv-tl-chips .chip.clickable:hover { color: var(--ac); background: var(--ac-soft); } /* ：--ac-soft 已全主题定义，fallback 删 */
/* 进行中行内进度面板——进度条同 TasksView .tv-prog-bar/.tv-prog-fill 样式范式
 （scoped 不跨文件，本地同形落地）；stage 直方图 FAILURE 红档 / 零计数弱化 */
/* 轨4：行内进度面板框三件退役（约定④）——bg1 面保留作分组语义
 （.sv-tl-row 无底色，面即分组）；obsProgress533 挂载锁只锚 .sv-prog-fill 不涉壳 */
.sv-prog { margin-top: 5px; padding: var(--sp-1h) var(--sp-2); background: var(--bg1); display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-xs); }
.sv-prog-top { display: flex; align-items: center; gap: var(--sp-1h); min-width: 0; }
.sv-prog-bar { width: 72px; height: 4px; border-radius: 2px; background: var(--bg2); overflow: hidden; flex-shrink: 0; }
.sv-prog-fill { display: block; height: 100%; background: var(--ac); border-radius: 2px; transition: width 400ms ease; }
.sv-prog-pct { color: var(--tx1); font-variant-numeric: tabular-nums; }
.sv-prog-shards { color: var(--tx2); font-size: var(--fs-2xs); }
.sv-prog-idx { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; flex-wrap: wrap; }
.sv-prog-idx-name { color: var(--tx1); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-prog-stages { display: inline-flex; gap: var(--sp-1h); flex-wrap: wrap; font-size: var(--fs-2xs); }
.sv-stage { color: var(--tx1); white-space: nowrap; }
.sv-stage-zero { color: var(--tx2); }
.sv-stage-fail { color: var(--err); font-weight: 600; }
.sv-prog-idx-shards { color: var(--tx2); margin-left: auto; }
/* W-D：state 徽标本地四色映射与英文小字规则随 StatusPill 改用退役
 （g/b/r/y 语义档与 en 小字档均归统一件单源；时间线圆点 .st-* 色不在其列，保留） */
.sv-tl-more { position: relative; }
.sv-tl-more summary { list-style: none; cursor: pointer; }
.sv-tl-more[open] .sv-tl-json { display: block; }
.sv-tl-json { display: none; position: absolute; right: 0; top: 30px; background: var(--bg0); border: 1px solid var(--line); border-radius: var(--r-s); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); max-width: 460px; max-height: 320px; overflow: auto; z-index: 5; box-shadow: var(--shadow-pop); }

.sv-form { display: flex; flex-direction: column; gap: var(--sp-2h); }
.sv-form-row { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm); }
/* 表单行内 lint 提示条折行占满整行（theme.css .il-hint 容器档同款手法；
 flex-basis 只在本容器收口——theme.css「禁全局 basis」纪律），行开 wrap 防挤压 44% 双输入 */
.sv-form-row { flex-wrap: wrap; }
.sv-form-row .il-hint { flex-basis: 100%; }
.sv-form-row label { min-width: 80px; color: var(--tx1); }
.sv-chk { display: inline-flex !important; align-items: center; gap: var(--sp-1h); min-width: 0; }
/* 轨4：模态内嵌预览框 border 退役（刀④；df-code/hr-code 代码面语言：bg+radius 无 border） */
.sv-form-preview { margin-top: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); background: var(--bg2); border-radius: var(--r-xs); }
.sv-preview-t { font-size: var(--fs-xs); color: var(--tx2); margin-bottom: var(--sp-1); }
.sv-form-preview pre { margin: 0; font-size: var(--fs-xs); color: var(--tx0); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
/* W-C 批：请求行方法/路径语义色（全局 .m-* 只给 color，路径走品牌亮档） */
.sv-req-path { color: var(--ac-hi); }
.sv-warn { display: flex; gap: var(--sp-1h); align-items: flex-start; margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--tx1); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-xs); padding: var(--sp-1h) var(--sp-2h); }
/* scoped .empty 覆盖随「无快照」空态迁 EmptyState compact 一并退役，留白归组件 */

/* 响应式顺带（responsive900Sweep529 口径：只加 CSS 零结构动、档内非空）——
 本页时间线为单列流式布局（无分栏堆叠诉求，1100 档无落点不造空壳档）；1100 收 JSON 弹出层
 防溢出，900 让卡头过滤框独占整行不再挤压排序控件 */
@media (max-width: 1100px) {
  .sv-tl-json { max-width: min(460px, 80vw); }
}
@media (max-width: 900px) {
  .sv-input-wrap { width: 100%; margin-left: 0; }
  .sv-tl-row { gap: var(--sp-2); }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.sv-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
