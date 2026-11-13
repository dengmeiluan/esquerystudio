<template>
  <div class="alv" ref="rootEl">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <!-- 两级说明：完全只读（连新增都没有）= 需要别名写权限；只有新增（config-validator 写键）
         则说明切换/设写/解绑为何缺席——否则按钮静默消失，用户以为页面缺功能。 -->
    <div v-if="auth.probed && !canOps" class="alv-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：别名的新建/设写/解绑不可用；需要别名写权限。
    </div>
    <div v-else-if="auth.probed && canOps && !canFullAlias" class="alv-perm-note" role="status">
      <Shield :size="13" /> 仅可新建别名：原子切换/切换/设写/解绑需要别名页写权限；当前身份未获该权限。
    </div>
    <PageHeader :icon="Link2" title="别名图">
      <template #subtitle>
        <span>别名与索引的指向关系，支持重建与原子切换</span>
        <!-- KPI 大卡墙退役：统计改 MetaStrip 统一件 inline 元信息串（原 4 张 alv-kpi 卡数据全保留在各段 :title） -->
        <MetaStrip class="alv-strip" :items="hdMeta" />
      </template>
    </PageHeader>
    <!-- 顶栏 -->
    <div class="alv-bar lr-bar freeze">
      <div class="alv-bar-l lr-bar-l">
        <!-- 手写过滤框改用 SearchFilterBar 统一件（全站第 9 胞；558 cd-kw-inp 先例：
 v-model 接原 query 零触、placeholder 逐字保留、Esc 清空/Enter 检索（onHitKey）
 内建语义对齐；alv-kw-wrap 落位类挂根（flex/max-width 同步更新），alv-input 类锚随
 input-class 保留在 input 上（w5IndexWorkspace530 挂载锁同路径） -->
        <SearchFilterBar v-model="query" class="alv-kw-wrap" input-class="alv-input" placeholder="过滤 alias / index 名（支持子串）" @enter="onHitKey" />
        <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在过滤框接线） -->
        <HitNav :count="groups.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
      </div>
      <div class="alv-bar-r lr-bar-r">
        <label class="alv-chk">
          <input type="checkbox" v-model="showFilter" />
          <span>展开 filter/routing</span>
        </label>
        <button v-if="canOps" class="btn sm primary" @click="openCreate" title="新建别名绑定">
          <Plus :size="12" /> 新建别名
        </button>
        <!-- 原始 IO 快查——本页最近一次 alias-actions 写操作请求/响应原文（ioRecorder 记录环） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（别名图）" title="最近一次别名写操作请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
        <button aria-label="刷新别名列表" class="btn sm ghost" @click="load" :disabled="loading" title="刷新别名列表">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
      </div>
    </div>

    <!-- 写操作面板（新建 / 原子切换）。
 全站最后一个全局 .card 壳退役（约定④：border+底色+radius 整块消除）
 → border-top 分节承接（ ar-sec 同刀）；alv-panel 品牌弱化线语义保形转
 border-top-color=var(--ac-line)；card-t 行首横排保留 -->
    <div v-if="panel" class="alv-panel">
      <div class="card-t">
        <component :is="panel.mode === 'create' ? Plus : ArrowLeftRight" :size="13" style="color:var(--ac)" />
        {{ panel.mode === 'create' ? '新建别名绑定' : `原子切换 —— ${panel.alias}` }}
        <span class="alv-flex" />
        <button class="btn sm ghost" aria-label="关闭面板" @click="panel = null"><X :size="11" /></button>
      </div>

      <template v-if="panel.mode === 'create'">
        <div class="alv-form">
          <label class="alv-f"><span>别名</span><input v-model="cAlias" ref="cAliasEl" class="alv-fi" placeholder="my-alias" @keydown.enter="canOps && cAlias && cIndex && !acting && doCreate()" />
            <!-- 别名输入智能纠错（useInputLint 出数据，.il-hint 提示条样式全站单一出处 theme.css）——
 非法字符 err + 重名 warn（对照现有别名列表）；别名允许大写，故不套 indexNameRule -->
            <div v-if="cAliasHint" class="il-hint" :class="'il-' + cAliasLevel">{{ cAliasHint }}</div>
          </label>
          <label class="alv-f"><span>物理索引</span>
            <!-- 「用当前索引」回填钮合并 PickCurrentIdxBtn 统一件（558 五视图先例：
 data-test/title/aria 逐字锚由组件保真透传，回填语义归消费方——openCreate 既有
 pickedIdx 预填之上补显式覆盖口； 不 follow 口径不变） -->
            <div class="alv-idx-row">
              <IndexPicker v-model="cIndex" placeholder="my-index-v1" />
              <PickCurrentIdxBtn @pick="cIndex = store.pickedIdx" />
            </div>
          </label>
          <label v-if="canFullAlias" class="alv-chk"><input type="checkbox" v-model="cWrite" /><span>is_write_index</span></label>
          <label v-if="canFullAlias" class="alv-f"><span>routing（可选）</span><input v-model="cRouting" class="alv-fi" placeholder="留空不设" /></label>
        </div>
        <label v-if="canFullAlias" class="alv-f alv-f-block">
          <div class="alv-f-hd">
            <span>filter DSL（可选，形如 {"term":{"status":1}}）</span>
            <!-- filter 编辑框高度三档循环钮（ra.script-h 同款形态），useTierCycle('aliases.filterH') 跨会话记忆 -->
            <button class="btn ghost xs" style="margin-left:auto" data-test="alv-filter-h"
              :title="'filter 编辑框高度档：' + filterH + ' 行'" @click.prevent="cycleFilterH">高</button>
          </div>
          <!-- filter JsonArea 接 dsl-assist（bodyKind 'search'——filter 就是查询子句组合，
 DevTools「仅 search 档」门控同款）+ lintDsl 体检提示条（fields 源=新建面板选中的物理索引）；
 w10 reset 行与脚本判定不动，只加 prop 与 lint 显示。
 rows=3 定高 → 三档行数循环（JsonArea 既有 rows 写法，默认档 3 行不变） -->
          <JsonArea ref="filterJaRef" v-model="cFilter" :rows="filterH" :dsl-assist="filterAssist" placeholder="留空不设 filtered alias，例 {&quot;term&quot;:{&quot;status&quot;:1}}" />
          <!-- lint 条改用 theme.css .lint-bar 单源（纯类名替换，DOM 保形） -->
          <div v-if="filterLintErrors.length" role="alert" class="lint-bar lint-bar-err">
            <span>DSL 检查（错误）：{{ filterLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
          <div v-else-if="filterLintWarns.length" role="status" class="lint-bar lint-bar-warn">
            <span>DSL 检查：{{ filterLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
          </div>
        </label>
        <div class="alv-panel-act">
          <button v-if="canOps" class="btn sm primary" @click="doCreate" :disabled="!cAlias || !cIndex || acting"><Save :size="11" /> 创建</button>
        </div>
      </template>

      <template v-else>
        <div class="alv-form">
          <!-- 「从」侧改用 usePopupList 弹层（与「到」侧 IndexPicker 对称的输入+候选形态）；
 候选限定为已绑该别名的索引（IndexPicker 读全集群清单无法限定候选源），
 label 带索引名（WRITE 标记同旧 option 文案） -->
          <label class="alv-f"><span>从（解绑）</span>
            <div class="alv-swfrom" ref="sfRootEl">
              <input class="alv-fi" :value="sfKw || swFrom" placeholder="选择已绑索引" spellcheck="false" autocomplete="off"
                role="combobox" aria-autocomplete="list" :aria-expanded="sfOpen ? 'true' : 'false'"
                :aria-controls="sfListId" :aria-activedescendant="sfOpen && sfItems[sfCursor] ? sfItemId(sfCursor) : undefined"
                @input="onSfInput" @focus="openSfPanel" @keydown="sfOnKey" />
            </div>
            <Teleport :to="teleportTo" :disabled="inplace">
              <transition name="pop">
                <div v-if="sfOpen" class="alv-pop float-pop" :class="{ inplace }" :style="sfPopStyle" @mousedown.prevent.stop>
                  <div v-if="!sfItems.length" class="alv-pop-hint">别名 {{ panel?.alias }} 下没有匹配「{{ sfKw }}」的索引</div>
                  <div v-else class="alv-pop-list" ref="sfListEl" :id="sfListId" role="listbox">
                    <div v-for="(o, i) in sfItems" :key="o.index" class="alv-pop-item" :class="{ act: i === sfCursor }"
                      role="option" :id="sfItemId(i)" :aria-selected="i === sfCursor" tabindex="-1"
                      @mouseenter="sfCursor = i" @click="chooseSf(o)">
                      <span class="mono">{{ o.index }}{{ o.isWrite ? '（WRITE）' : '' }}</span>
                    </div>
                  </div>
                </div>
              </transition>
            </Teleport>
          </label>
          <span class="alv-sw-arrow">→</span>
          <label class="alv-f"><span>到（新绑）</span>
            <IndexPicker v-model="swTo" placeholder="my-index-v2" />
          </label>
          <label class="alv-chk"><input type="checkbox" v-model="swWrite" /><span>新索引设为 write</span></label>
        </div>
        <div class="alv-sw-hint">remove + add 在一次 <code>POST /_aliases</code> 里原子完成，查询方零感知——和 rebuild 内核同款机制</div>
        <div class="alv-panel-act">
          <button v-if="canFullAlias" class="btn sm primary" @click="doSwitch" :disabled="!swFrom || !swTo || swFrom === swTo || acting"><ArrowLeftRight :size="11" /> 原子切换</button>
        </div>
      </template>
    </div>

    <!-- 写操作本地 ConfirmModal 宿主退役，收敛全局 askConfirm（App.vue 唯一宿主；
 原白屏 pre-line 换行的 body 改单句 message，facts 具名行语义原样保留） -->

    <!-- 别名管控右键菜单(CellContextMenu 共享件,操作聚合到右键)
 y1 运行时修复:原先误嵌在「新建面板 create 分支」内,面板一关右键菜单就永不渲染——
 移到根级(组件 teleport 到 body,树位置不影响布局),与 SnapshotsView 同构 -->
    <CellContextMenu v-if="aliasMenu" :x="aliasMenu.x" :y="aliasMenu.y" :title="aliasMenu.g.alias"
      :items="aliasMenuItems" @close="aliasMenu = null" />
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenu.index"
      :items="rowMenuItems" @close="rowMenu = null" />

    <!-- 主区：按 alias 聚合分组（ 加载/失败/过滤隐藏/真无四态分明） -->
    <div v-if="loading && !groups.length" class="alv-groups">
      <SkeletonBox v-for="i in 4" :key="i" height="88px" round />
    </div>
    <!-- 三分支旧范式 .empty 改用 EmptyState compact（props 照 ClusterSettingsView/LuceneQueryView 邻页用法）；
 重试/清除过滤合并 actionText 槽，文案原样保留；图标 AlertTriangle/SearchX/Link2 按语义选（均已 import/SearchX 新增） -->
    <EmptyState v-else-if="loadErr" compact :icon="AlertTriangle" text="别名图拉取失败" :hint="loadErr" action-text="重试" @action="load" />
    <EmptyState v-else-if="!groups.length && rows.length" compact :icon="SearchX"
      :text="`无匹配 alias（共 ${aliasCount} 个，被当前关键字隐藏）`" action-text="清除过滤" @action="query = ''" />
    <EmptyState v-else-if="!groups.length" compact :icon="Link2" text="集群没有任何别名" hint="可点右上角「新建别名」创建第一个绑定" />
    <div v-else class="alv-groups">
      <!-- write 异常仅保留这一处（原 KPI alert 卡与警示卡两处拆分 → 通栏并入列表区头部，
 不再是独立横幅层；writeIssues 派生自分组的别名必有成员组，故随列表分支渲染不会丢） -->
      <div v-if="writeIssues.length" class="alv-warn-head">
        <div class="alv-warn-t sec-t"><AlertTriangle :size="13" style="color:var(--warn)" /> 需关注的 write 异常（{{ writeIssues.length }}）</div>
        <div v-for="w in writeIssues" :key="w.alias" class="alv-warn-row">
          <span class="mono">{{ w.alias }}</span>
          <!-- alv-warn-tag 纯 warn 色私造胶囊改用 StatusPill 统一件（warn→y 语义档） -->
          <StatusPill tone="y" :label="w.reason" />
          <span class="mono alv-warn-idxs" :title="w.indices.join(', ')">{{ w.indices.join(' , ') }}</span>
        </div>
      </div>
      <div v-for="(g, i) in groups" :key="g.alias" class="alv-group" :class="{ 'alv-deep-hit': isDeepHit(g) }" :data-hit-idx="i + 1">
        <div class="alv-g-hd" tabindex="0" @contextmenu.prevent="openAliasMenu($event, g)" @keydown="onAliasMenuKey($event, g)" data-row-nav @keydown.self="rowArrowNav">
          <div class="alv-g-hd-l">
            <Link2 :size="13" class="alv-g-ic" />
            <span class="mono alv-g-alias" :title="g.alias"><MarkText :text="g.alias" :kw="query" /></span>
            <!-- 五处手写 pill 改用 StatusPill 统一件（色档/tone 语义归组件单源，
 原 .pill b/r/n/g 裸挂退役； 前「p-* 无色胶囊」旧症一并随组件化封死） -->
            <StatusPill tone="b" :label="g.rows.length + ' 索引'" />
            <StatusPill v-if="g.writeCount > 1" tone="r" label="多写" title="别名下有多个 is_write_index=true，不合规" />
            <StatusPill v-else-if="g.writeCount === 0 && g.rows.length > 1" tone="n" label="只读" title="未指定 write index：跨索引聚合的只读用法（常态）；如需通过该别名写入，请先「设写」" />
            <StatusPill v-else-if="g.writeCount === 1" tone="g" label="正常" />
          </div>
          <div class="alv-g-hd-r">
            <button v-if="canFullAlias" class="btn sm" @click="openSwitch(g)" :title="'零停机原子切换指向'">
              <ArrowLeftRight :size="11" /> 切换
            </button>
            <button class="btn sm" @click="goInspect(g.alias)" :title="'查看别名详情'">
              <ExternalLink :size="11" /> 详情
            </button>
            <button class="btn sm" @click="goQuery(g.alias)" :title="'跳转 DSL 查询'">
              <TerminalSquare :size="11" /> 查询
            </button>
          </div>
        </div>
        <div class="alv-g-arrows">
          <template v-for="(r, i) in shownRows(g)" :key="r.index">
            <div class="alv-arrow-row" :class="{ 'is-write': r.isWriteIndex }" tabindex="0"
              @contextmenu.prevent="openRowMenu($event, g, r.index, r.isWriteIndex)"
              @keydown="onAliasRowMenuKey($event, g, r.index, r.isWriteIndex)" data-row-nav @keydown.self="rowArrowNav">
              <span class="alv-arrow">
                <span class="alv-arrow-dot"></span>
                <span class="alv-arrow-line"></span>
                <span class="alv-arrow-tip">▸</span>
              </span>
              <span class="mono alv-arrow-idx" :title="'打开索引工作区：' + r.index" tabindex="0" role="button" @keydown.enter.prevent="goHub(r.index)" @keydown.space.prevent="goHub(r.index)" @click="goHub(r.index)"><MarkText :text="r.index" :kw="query" /></span>
              <!-- 行内 write 徽标改用 StatusPill（alv-write-badge 锚类保留在外层） -->
              <StatusPill v-if="r.isWriteIndex === true" tone="g" label="可写" class="alv-write-badge" />
              <StatusPill v-else-if="r.isWriteIndex === false" tone="b" label="只读" class="alv-write-badge" />
              <StatusPill v-else tone="n" label="-" class="alv-write-badge" />
              <template v-if="showFilter">
                <!-- rt/filter 手写 meta 片合并 MetaStrip mini 档（550 sv-repo-meta 先例）——
 rt 值段入 items（title→tip 同步更新）；filter 段是 popover 触发器（交互语义）走默认插槽；
 bg2 胶囊底私造样式同步更新删除（形态归 .ms 单源） -->
                <MetaStrip v-if="r.routing || r.filter" class="alv-rowmeta" :items="r.routing ? [{ value: r.routing, label: 'rt', tip: 'index_routing' }] : []">
                  <n-popover v-if="r.filter" trigger="click" placement="bottom" :width="320">
                    <template #trigger>
                      <span class="ms-i alv-meta-filter">
                        filter: {{ trunc(JSON.stringify(r.filter), 40) }}
                      </span>
                    </template>
                    <pre class="json-view" v-html="highlightJson(JSON.stringify(r.filter, null, 2))"></pre>
                  </n-popover>
                </MetaStrip>
              </template>
              <button v-if="canFullAlias && g.rows.length > 1 && r.isWriteIndex !== true" class="btn sm ghost" :disabled="acting" @click="setWrite(g, r.index)" :title="'设为唯一 write index（其余自动设 false）'">
                设写
              </button>
              <button v-if="canFullAlias" :aria-label="'解绑此索引'" class="btn sm ghost alv-danger" :disabled="acting" @click="unbind(g.alias, r.index)" :title="'解绑此索引'">
                <Trash2 :size="10" />
              </button>
              <button :aria-label="'设为当前索引'" class="btn sm ghost" @click="pickIndex(r.index)" :title="'设为当前索引'">
                <MousePointer :size="10" />
              </button>
            </div>
          </template>
          <!-- 大组折叠展开钮。：去掉 !query.trim() 门控——过滤词非空时 shownRows
 已自动全量展开，此前景象在「折叠/全量」间突变且无任何控件可见；门控去掉后过滤态
 恒有展开/收起钮（此时点击只是预置折叠意图，清空过滤词后生效）。
 门控恢复 !query.trim()——过滤态下点击只换文案、行数不变（shownRows
 因过滤恒全量，折叠意图无处落地），钮与实际行为脱节困惑；改为过滤态直接不出钮
 （shownRows 仍恒全量，所见即所得），非过滤态折叠钮行为照旧。 -->
          <button v-if="!query.trim() && g.rows.length > ROW_LIMIT" class="btn xs ghost" style="align-self:flex-start;margin-top:var(--sp-1)"
            @click="toggleGroup(g)">
            {{ expandedGroups.has(g.alias) ? '收起' : `展开全部 ${g.rows.length} 个索引` }}
          </button>
        </div>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 alias-actions 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NPopover } from 'naive-ui';
import { Shield, Link2, RefreshCw, AlertTriangle, ExternalLink, TerminalSquare, MousePointer, Plus, ArrowLeftRight, Trash2, X, Save, Copy, ClipboardList, SearchX, Terminal } from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import CellContextMenu from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
import PageHeader from '../components/PageHeader.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import MarkText from '../components/MarkText.vue';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import IndexPicker from '../components/IndexPicker.vue';
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件（*/
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：顶栏过滤胶囊统一件 */
import JsonArea from '../components/JsonArea.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（660 范式） */
import { useTierCycle } from '../composables/useTierCycle'; /* ：filter 编辑框高度档记忆；合并 */
import { useInputLint, patternRule, dupRule } from '../composables/useInputLint'; /* ：别名输入智能纠错 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：lint 划线防抖统一件 */
import { lintClause } from '../utils/dslLint'; /* ：filter DSL 静态体检；：裸子句出口换 lintClause */
import type { BodyKind } from '../utils/dslCompletionContext'; /* ：filterAssist 档位类型 */
import { usePopupList } from '../composables/usePopupList';
/* 本地 pending-action ConfirmModal 宿主退役，改全局确认服务；loadErr 友好化 */
import { askConfirm } from '../composables/confirm';
import { friendlyEsError } from '../utils/esError';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import SkeletonBox from '../components/SkeletonBox.vue';
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：状态徽标统一件 */

import { useHitLocate } from '../composables/useHitNav';
import { trunc, fmtNum } from '../utils/format';
import HitNav from '../components/HitNav.vue';

const router = useRouter();
const route = useRoute();
const store = useAppStore();
/* 权限门禁——alias 写操作（新建/切换/设写/解绑）全走 /cluster/alias-actions=CLUSTER 档，
 rank3+ 可见；VIEWER/OPERATOR 只读观测（不再给会 403 的按钮） */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/alias-actions', store.target));
/* config-validator 写键只允许 add（建索引后挂载别名）：remove/switch/unbind 必须另有
   aliases 写键（或静态 aliases + 写档角色），与后端 aliasActionsAddOnly 同口径。 */
const canFullAlias = computed(() => {
  if (auth.isAdmin()) return true;
  if (auth.me == null) return canOps.value;
  const gp = auth.grantedPages;
  if (!Array.isArray(gp)) return canOps.value;
  const tid = !store.target || String(store.target).toLowerCase() === 'host' ? 'host' : store.target;
  /* env 模板与页面写门同口径：环境未开放 aliases 时，写键在场也不展示写控件。 */
  if (gp.includes('conn:' + tid + ':w:aliases')) return auth.envAllows('aliases', tid);
  return gp.includes('aliases') && auth.can('ops') && auth.envAllows('aliases', tid);
});

/* 原始 IO 快查（546 六页同款三件套）——/cluster/alias-actions 写通道独占
 （GET /cluster/aliases 会被 IndexHub 顶掉，勿用）；判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/alias-actions');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

interface Row { alias: string; index: string; isWriteIndex: boolean | null; filter: any; routing: string | null }
const rows = ref<Row[]>([]);
const loading = ref(false);
const loadErr = ref('');
/* 搜索词进 URL（?q=）——刷新/分享后过滤现场可复原（可重入） */
/* 过滤词切页保留(会话草稿)——useUrlState 只活在本页 URL,本页不在 KeepAlive 白名单 */
const query = useScopedDraft('q', { route: 'aliases' }, '').text;
const showFilter = ref(false);

/* ═══ ：深链消费 /aliases?idx=<索引名>（索引工作区「管控」/页头「别名」入口直达）═══
 ① 过滤词预填该索引名（过滤是子串匹配，别名/索引名含该串的分组都保留）；
 ② 成员含该索引的分组置顶 + 命中强调条（QRT hit-cur 游标同款视觉语言）；
 ③ 消费后 router.replace 清掉 ?idx 参（history 栈不留参，刷新不重放深链），
 deepIdx 保留到离开本页——强调条持续标记「此行来自哪里」 */
const deepIdx = ref('');
const isDeepHit = (g: Group) => !!deepIdx.value && g.rows.some(r => r.index === deepIdx.value);
function consumeDeepIdx() {
  const raw = route.query.idx;
  const idx = Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
  if (!idx) return;
  deepIdx.value = idx;
  if (query.value.trim() !== idx) query.value = idx;
  router.replace({ query: { ...route.query, idx: undefined } });
}

/* 大别名组行折叠——300 索引的别名组全量渲染卡死滚动；默认前 12 条+展开钮。
 展开集合按 alias 存（跨过滤/刷新保留展开意图），搜索过滤时自动全量（找东西别折叠）。 */
const ROW_LIMIT = 12;
const expandedGroups = ref<Set<string>>(new Set());
function shownRows(g: Group) {
  if (query.value.trim() || expandedGroups.value.has(g.alias)) return g.rows;
  return g.rows.slice(0, ROW_LIMIT);
}
function toggleGroup(g: Group) {
  const next = new Set(expandedGroups.value);
  if (next.has(g.alias)) next.delete(g.alias); else next.add(g.alias);
  expandedGroups.value = next;
}

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  loadErr.value = '';
  try {
    const raw = await api.aliases();
    if (seq !== loadSeq) return;
    rows.value = (raw || []).map((r: any) => ({
      alias: r.alias, index: r.index,
      isWriteIndex: r.isWriteIndex == null ? null : Boolean(r.isWriteIndex),
      filter: r.filter, routing: r.routing || null,
    }));
  } catch (e: any) {
    if (seq !== loadSeq) return;
    /* 裸错误串改 friendlyEsError */
    loadErr.value = friendlyEsError(e?.message || String(e));
    store.notify('error', '加载 alias 图失败：' + loadErr.value);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

interface Group { alias: string; rows: Row[]; writeCount: number }
const groups = computed<Group[]>(() => {
  const q = query.value.trim().toLowerCase();
  const map = new Map<string, Row[]>();
  for (const r of rows.value) {
    if (q && !r.alias.toLowerCase().includes(q) && !r.index.toLowerCase().includes(q)) continue;
    if (!map.has(r.alias)) map.set(r.alias, []);
    map.get(r.alias)!.push(r);
  }
  const out: Group[] = [];
  map.forEach((rs, alias) => {
    rs.sort((a, b) => (b.isWriteIndex ? 1 : 0) - (a.isWriteIndex ? 1 : 0));
    out.push({ alias, rows: rs, writeCount: rs.filter(r => r.isWriteIndex === true).length });
  });
  /* 深链置顶——成员含深链索引的分组排最前（其余仍按别名字典序），
 深链诉求是「看这个索引挂在哪些别名下」，命中组不该被字典序埋进长列表中部 */
  const deepFirst = (g: Group) => (isDeepHit(g) ? 0 : 1);
  return out.sort((a, b) => deepFirst(a) - deepFirst(b) || a.alias.localeCompare(b.alias));
});

const aliasCount = computed(() => new Set(rows.value.map(r => r.alias)).size);
const indexCount = computed(() => new Set(rows.value.map(r => r.index)).size);

/* 页头元信息串（MetaStrip 统一件）：原整条 :title 全文拆到各段 tip；
 write 异常计数并入「多索引 alias」段 tip 兜底（其组必为多索引组的子集，语义相承） */
const hdMeta = computed<MetaStripItem[]>(() => [
  { label: '别名', value: fmtNum(aliasCount.value), tip: `别名 ${fmtNum(aliasCount.value)}（全集群 alias，排除 . 开头系统）` },
  { label: '物理索引', value: fmtNum(indexCount.value), tip: `物理索引 ${fmtNum(indexCount.value)}（被 alias 指向的物理数）` },
  {
    label: '多索引 alias', value: fmtNum(multiIndexAliases.value.length),
    tip: `多索引 alias ${fmtNum(multiIndexAliases.value.length)}（指向 > 1 个索引，聚合读常态） · write 异常 ${fmtNum(writeIssues.value.length)}（多个 write=true，违规）`,
  },
]);

/* 搜索定位：过滤后的分组即命中集，卡片按渲染序带 data-hit-idx，Enter/Shift+Enter 逐个跳 */
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => groups.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }
const multiIndexAliases = computed(() => groups.value.filter(g => g.rows.length > 1));
const writeIssues = computed(() => {
  const out: { alias: string; reason: string; indices: string[] }[] = [];
  for (const g of groups.value) {
    if (g.rows.length <= 1) continue;
    if (g.writeCount > 1) {
      out.push({ alias: g.alias, reason: '多个 write=true', indices: g.rows.filter(r => r.isWriteIndex).map(r => r.index) });
    }
    /* 信噪比：多索引别名「未设 write」不再计入异常——时间分片/跨索引聚合的只读别名
 本来就不设 is_write_index（集群常态，QA 环境 103/133 全中）。写入失败是使用侧问题，
 别名面板把常态当告警只会淹没真正的「多写」违规。分组行上仍以中性「只读」徽标标注。 */
  }
  return out;
});

function pickIndex(idx: string) {
  /* F-2 去噪：浏览别名图时逐行点击高频触发，成功 toast 连弹是打扰——
 顶栏选中态本身即是即时反馈（索引名高亮+docs 变化），无需文字确认 */
  store.pick(idx);
}

/* ==================== ：写操作（新建 / 原子切换 / 设写 / 解绑） ==================== */
const panel = ref<null | { mode: 'create' | 'switch'; alias: string }>(null);
const acting = ref(false);
const cAlias = ref(''); const cIndex = ref(''); const cWrite = ref(false); const cRouting = ref(''); const cFilter = ref('');
/* 别名输入智能纠错（useInputLint 只出数据，.il-hint 提示条样式全站单一出处 theme.css）——
 ① 非法字符 err：patternRule 负类字符集（, : * " < > / \ 空格）；
 ② 重名 warn：dupRule 对照现有别名列表（put 覆盖语义，warn 不阻断）。
 别名允许大写（ES alias 命名无小写约束），禁套 indexNameRule */
const cAliasLint = useInputLint([
  patternRule(/^[^,:*"<>/\\ ]+$/, '别名含非法字符（, : * " < > / \\ 空格）'),
  dupRule(() => new Set(rows.value.map(r => r.alias)), '别名'),
]);
const { hint: cAliasHint, level: cAliasLevel, check: cAliasCheck } = cAliasLint;
watch(cAlias, v => { cAliasCheck(v); });
/* filter DSL 静态体检 + 补全白得——bodyKind 固定 'search'（filter 就是查询子句组合）；
 fields 源=新建面板当前选中的物理索引 cIndex（useIndexFields 惰性缓存，SqlBridge/DslQuery 同范式）；
 lint 空串/非法 JSON 静默（「留空不设」是常态不报噪音）。error 红条单列、warning/hint 黄条并列
 （RestView rtLint 同款接线）。 */
/* ·：fields 实拉 ensure 补线——528 起仅解构 fields 未 ensure（useIndexFields
 无自动拉取，ensure 须显式调用），字段/词项候选在此面恒空的存量缺角真机实证（probe-661 s6
 mapping 零请求）；554 SearchSandbox watch immediate 范式补齐 */
const { fields: filterFields, ensure: ensureFilterFields } = useIndexFields(() => cIndex.value);
watch(cIndex, () => { void ensureFilterFields(); }, { immediate: true });
/* terms 闭包接线——索引源=cIndex（新建面板选中物理索引）与 filterFields 同源；
 filter=查询子句组合（ search 档语义），动态值位候选成立 */
const alvTerms = useTermsSuggest(() => cIndex.value);
const filterAssist = { fields: () => filterFields.value, bodyKind: (): BodyKind => 'search', terms: (f: string, p: string) => alvTerms.suggestAsync(f, p) };
/* lintDsl → lintClause（裸子句出口，skipRoot 跳根级规则）——filter 本身就是查询子句，
 裸子句语义零误报（形如 {"term":{…}} 的 filter 在 lintDsl 会撞 root-bare-clause 假红） */
const filterLint = computed(() => {
  try { return lintClause(JSON.parse(cFilter.value || '')); } catch { return []; }
});
const filterLintErrors = computed(() => filterLint.value.filter(f => f.severity === 'error'));
const filterLintWarns = computed(() => filterLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
/* lint findings 注入编辑器划线（SearchSandboxView 范式：debounce 250ms 防每敲一键
 全量 findMatches；info 降级 hint——MonacoEditor marker 档只收 warning/hint/error；
 lintClause findings 与 setMarkers 同形，上方 banner 提示条保留双通道）。 */
const filterJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueFilterLintMarkers = useDebounceFn(() => {
  filterJaRef.value?.setMarkers?.(filterLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(cFilter, () => { queueFilterLintMarkers(); }, { immediate: true });
/* filter 编辑框高度三档行数循环 + usePref 跨会话记忆（ra.scriptH 同款形态；
 走 JsonArea 既有 rows 写法，默认档 3 行不变）。
 TIERS+usePref+手写 cycle 三件套合并 useTierCycle 单源
 （aliases.filterH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const FILTER_H_TIERS = [3, 9, 16];
const { v: filterH, cycle: cycleFilterH } = useTierCycle('aliases.filterH', FILTER_H_TIERS);
/* W10：连续录入重聚焦锚点（create 成功后清空输入并回焦别名框） */
const cAliasEl = ref<HTMLInputElement | null>(null);
const swFrom = ref(''); const swTo = ref(''); const swWrite = ref(true);

const panelRows = computed(() => {
  if (!panel.value || panel.value.mode !== 'switch') return [];
  return rows.value.filter(r => r.alias === panel.value!.alias);
});

/* 「从」侧弹层候选（usePopupList）：已绑该别名的索引，输入过滤+rank（精确>前缀>包含，IndexPicker 同口径）；
 回填 swFrom（index 串），与 doSwitch 的确认链零改动 */
const sfKw = ref('');
const sfItems = computed(() => {
  const k = sfKw.value.trim().toLowerCase();
  const list = panelRows.value.map(r => ({ index: r.index, isWrite: r.isWriteIndex === true }));
  if (!k) return list;
  const rank = (n: string) => n.toLowerCase() === k ? 0 : n.toLowerCase().startsWith(k) ? 1 : 2;
  return list.filter(o => o.index.toLowerCase().includes(k))
    .sort((a, b) => rank(a.index) - rank(b.index) || a.index.localeCompare(b.index));
});
function chooseSf(o: { index: string; isWrite: boolean }) { swFrom.value = o.index; sfKw.value = ''; closeSf(); }
function onSfInput(e: Event) {
  sfKw.value = (e.target as HTMLInputElement).value;
  sfCursor.value = 0;
  if (!sfOpen.value) openSfPanel();
}
const {
  open: sfOpen, cursor: sfCursor, popStyle: sfPopStyle, teleportTo, inplace,
  listId: sfListId, itemId: sfItemId, rootEl: sfRootEl, listEl: sfListEl,
  openPanel: openSfPanel, close: closeSf, onKey: sfOnKey,
} = usePopupList<{ index: string; isWrite: boolean }>({ items: () => sfItems.value, onChoose: chooseSf });

function openCreate() {
  cAlias.value = ''; cIndex.value = store.pickedIdx || ''; cWrite.value = false; cRouting.value = ''; cFilter.value = '';
  panel.value = { mode: 'create', alias: '' };
}
function openSwitch(g: Group) {
  if (!canFullAlias.value) { store.notify('warning', '当前授权仅允许新增别名（add）'); return; }
  const w = g.rows.find(r => r.isWriteIndex === true);
  swFrom.value = (w || g.rows[0])?.index || '';
  swTo.value = ''; swWrite.value = true;
  panel.value = { mode: 'switch', alias: g.alias };
}

async function execActions(actions: any[], okMsg: string, opts?: { stayOpen?: boolean }): Promise<boolean> {
  /* 四类写操作最终都汇入这里——执行体首行收口，按钮 v-if 之外无旁路 */
  if (!canOps.value) { store.notify('warning', '别名写操作需专项或 ADMIN 角色'); return false; }
  acting.value = true;
  try {
    const r: any = await api.aliasActions(JSON.stringify({ actions }));
    if (r?.error) throw new Error(r.message);
    store.notify('success', okMsg);
    /* W10：stayOpen 仅 create 连续录入使用——面板保留，清输入/重聚焦由调用方做；
 其余模式（switch/setWrite/unbind）行为不变：成功即收面板 */
    if (!opts?.stayOpen) panel.value = null;
    await load();
    return true;
  } catch (e: any) {
    /* 裸错误串并轨 friendlyEsError（与 258 行 loadErr 同源） */
    store.notify('error', '别名操作失败：' + friendlyEsError(String(e?.message ?? e)));
    return false;
  } finally { acting.value = false; }
}

async function doCreate() {
  if (!canOps.value) { store.notify('warning', '别名写操作需专项或 ADMIN 角色'); return; }
  const add: any = { index: cIndex.value.trim(), alias: cAlias.value.trim() };
  /* add-only 授权（config-validator 写键）后端只接受 index+alias：扩展参数一律不发送，
     不能把用户填写的 is_write_index/routing/filter 变成必 400 的请求。 */
  if (canFullAlias.value) {
    if (cWrite.value) add.is_write_index = true;
    if (cRouting.value.trim()) add.routing = cRouting.value.trim();
    if (cFilter.value.trim()) {
      try { add.filter = JSON.parse(cFilter.value); }
      /* 裸 e.message（浏览器原生 JSON 解析文案）合并 friendlyEsError（522 别名操作失败同源口径） */
      catch (e: any) { store.notify('error', 'filter DSL 解析失败：' + friendlyEsError(String(e?.message ?? e))); return; }
    }
  }
  /* W10：连续录入——create 成功后面板保留，清空输入并重聚焦别名框；
 批量建 N 个别名不再「关面板→点新建」×N（每轮 -2 击）。物理索引刻意保留：
 同步别名通常指向同一索引；失败时（返回 false）输入原样保留可改可重提。 */
  const ok = await execActions([{ add }], `别名 ${add.alias} → ${add.index} 已创建`, { stayOpen: true });
  if (!ok) return;
  cAlias.value = ''; cWrite.value = false; cRouting.value = ''; cFilter.value = '';
  await nextTick();
  cAliasEl.value?.focus();
}

/* 原本地 pending-action 宿主（cfmOpen/cfm/同名 askConfirm 包装，与全局服务遮蔽）整体退役——
 三类写操作改 await 全局 askConfirm（动态 title/okText/facts 全支持，level 沿用原 warn）；
 原 body 里的 \n（pre-line 渲染）改单句 message，信息量等价 */

async function doSwitch() {
  if (!canOps.value) { store.notify('warning', '别名写操作需专项或 ADMIN 角色'); return; }
  if (!canFullAlias.value) { store.notify('warning', '当前授权仅允许新增别名（add）'); return; }
  const alias = panel.value!.alias;
  const okGo = await askConfirm({
    title: '原子切换别名指向',
    level: 'warn',
    okText: '原子切换',
    message: `将在一次 POST /_aliases 里原子完成别名指向切换${swWrite.value ? '（新索引设为 write）' : ''}。查询方零感知，但旧索引将立即停止接收读写。`,
    facts: [{ label: '别名', value: alias }, { label: '改指向', value: `${swFrom.value} → ${swTo.value}` }],
  });
  if (!okGo) return;
  const add: any = { index: swTo.value.trim(), alias };
  if (swWrite.value) add.is_write_index = true;
  await execActions(
    [{ remove: { index: swFrom.value, alias } }, { add }],
    `已原子切换 ${alias}：${swFrom.value} → ${swTo.value}`,
  );
}

async function setWrite(g: Group, idx: string) {
  if (!canOps.value) { store.notify('warning', '别名写操作需专项或 ADMIN 角色'); return; }
  if (!canFullAlias.value) { store.notify('warning', '当前授权仅允许新增别名（add）'); return; }
  const okGo = await askConfirm({
    title: '切换 write index',
    level: 'warn',
    okText: '确认切换',
    message: `write index 将切换，其余 ${g.rows.length - 1} 个索引自动设 false。后续写入将全部落到新 write index。`,
    facts: [{ label: '别名', value: g.alias }, { label: '新 write index', value: idx }],
  });
  if (!okGo) return;
  const actions = g.rows.map(r => ({ add: { index: r.index, alias: g.alias, is_write_index: r.index === idx } }));
  await execActions(actions, `${g.alias} 的 write index 已切到 ${idx}`);
}

async function unbind(alias: string, index: string) {
  if (!canOps.value) { store.notify('warning', '别名写操作需专项或 ADMIN 角色'); return; }
  if (!canFullAlias.value) { store.notify('warning', '当前授权仅允许新增别名（add）'); return; }
  const okGo = await askConfirm({
    title: '解绑别名',
    level: 'warn',
    okText: '解绑',
    message: '解绑该别名的此索引映射。若这是该别名最后一个索引，别名将消失，所有用别名访问的查询/写入将立即报错。',
    facts: [{ label: '别名', value: alias }, { label: '索引', value: index }],
  });
  if (!okGo) return;
  await execActions([{ remove: { index, alias } }], `已解绑 ${alias} → ${index}`);
}
function goInspect(alias: string) {
  store.pick(alias);
  router.push('/mapping');
}
function goQuery(alias: string) {
  store.pick(alias);
  router.push('/search');
}
/* 物理索引名可点——跳索引工作区详情 */
function goHub(name: string) {
  store.pick(name);
  router.push({ path: '/indices', query: { idx: name } });
}

/* ═══ ：别名管控右键菜单（交互拉满——操作聚合到右键，主界面减负）═══
 组头右键 = 别名级操作（复制别名名/成员清单/切换/详情/查询）；
 成员行右键 = 索引级操作（复制索引名/工作区/查询/设写/解绑，danger 分层同既有按钮）。 */
const aliasMenu = ref<{ x: number; y: number; g: Group } | null>(null);
function openAliasMenu(e: MouseEvent, g: Group) {
  aliasMenu.value = { x: e.clientX, y: e.clientY, g };
}
function onAliasMenuKey(e: KeyboardEvent, g: Group) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  aliasMenu.value = { ...menuKeyAnchor(e), g };
}
const aliasMenuItems = computed(() => {
  const m = aliasMenu.value; if (!m) return [];
  const g = m.g;
  const members = g.rows.map(r => r.index);
  return [
    { key: 'copy-alias', label: '复制别名名', icon: Copy, run: async () => {
      const ok = await copyText(g.alias);
      store.notify(ok ? 'success' : 'error', ok ? '已复制别名名' : '复制失败');
    } },
    { key: 'copy-members', label: '复制成员索引清单', icon: ClipboardList, run: async () => {
      const ok = await copyText(members.join('\n'));
      store.notify(ok ? 'success' : 'error', ok ? `已复制 ${members.length} 个成员索引` : '复制失败');
    } },
    /* 切换=alias-actions 写操作（CLUSTER 档）——低权角色菜单不给出 */
    ...(canFullAlias.value ? [{ key: 'switch', label: '零停机切换指向…', icon: ArrowLeftRight, sep: true, run: () => openSwitch(g) }] : []),
    { key: 'inspect', label: '查看别名详情', icon: ExternalLink, run: () => goInspect(g.alias) },
    { key: 'query', label: 'DSL 查询此别名', icon: TerminalSquare, run: () => goQuery(g.alias) },
  ];
});
const rowMenu = ref<{ x: number; y: number; g: Group; index: string; isWrite: boolean | null } | null>(null);
function openRowMenu(e: MouseEvent, g: Group, index: string, isWrite: boolean | null) {
  rowMenu.value = { x: e.clientX, y: e.clientY, g, index, isWrite };
}
function onAliasRowMenuKey(e: KeyboardEvent, g: Group, index: string, isWrite: boolean | null) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), g, index, isWrite };
}
const rowMenuItems = computed(() => {
  const m = rowMenu.value; if (!m) return [];
  const items: { key: string; label: string; icon?: any; danger?: boolean; sep?: boolean; run: () => void }[] = [
    { key: 'copy-idx', label: '复制索引名', icon: Copy, run: async () => {
      const ok = await copyText(m.index);
      store.notify(ok ? 'success' : 'error', ok ? '已复制索引名' : '复制失败');
    } },
    { key: 'hub', label: '打开索引工作区', icon: ExternalLink, run: () => goHub(m.index) },
    { key: 'query', label: 'DSL 查询此索引', icon: TerminalSquare, run: () => { store.pick(m.index); router.push('/search'); } },
  ];
  /* 设写/解绑=alias-actions 写操作（CLUSTER 档）——低权角色菜单不给出 */
  if (canFullAlias.value && m.isWrite !== true) {
    items.push({ key: 'set-write', label: '设为唯一可写…', icon: Save, sep: true, run: () => {
      const g = rowMenu.value!.g;
      const r = g.rows.find(x => x.index === m.index);
      if (r) setWrite(g, m.index);
    } });
  }
  if (canFullAlias.value) {
    items.push({ key: 'unbind', label: '解绑此索引…', icon: Trash2, danger: true, sep: true, run: () => unbind(m.g.alias, m.index) });
  }
  return items;
});

onMounted(() => { load(); consumeDeepIdx(); });
/* 本页存活期间深链再入（如工作区反复跳「别名」）也跟进消费 */
watch(() => route.query.idx, v => { if (v) consumeDeepIdx(); });

/* 右键菜单挂载(CellContextMenu 共享件,RT/QRT/别名管控同款) */
</script>

<style scoped>
/* min-height:100% 让页面吃满 .page 可滚区（默认只有内容高，实测下方空出 626px 死白） */
.alv { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
/* .alv-bar 空规则死类删除（骨架职责已归 .lr-bar，模板挂载点与 lr-bar 骨架类保留）；
 .alv-title（fs-md/600）为页头接管后的死规则随标题四档合并一并退役 */
.alv-fi { background: var(--bg1); border: 1px solid var(--line); border-radius: var(--r-s); padding: 5px 9px; color: var(--tx0); font-size: var(--fs-sm); outline: 0; min-width: 180px; }
/* alv-input 手写皮随改用退役归 SearchFilterBar 胶囊壳单源（bg1 底/line 边/
 r-s 圆角/:focus 描边）——alv-input 类锚随 input-class 保留在 input 上作挂载锁路径；
 落位（flex:1/max-width:320px）与内衬（padding/字号对齐现行，高度结构零变动）迁 alv-kw-wrap */
.alv-kw-wrap { flex: 1; max-width: 320px; padding: var(--sp-1h) var(--sp-2h); font-size: var(--fs-sm); }
.alv-chk { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--tx1); cursor: pointer; user-select: none; }
/* 「物理索引」表单行——IndexPicker 与 PickCurrentIdxBtn 同行横排 */
.alv-idx-row { display: flex; align-items: center; gap: var(--sp-1h); }
.alv-idx-row :deep(.ixp) { flex: 1; min-width: 0; }
/* filter JsonArea 外框视图侧退壳（约定③；LifecycleView .lc-rollover 同语言）——
 组件本体零触，alv-panel border-top 分节已承接分界 */
.alv-f-block :deep(.ja) { border: none; border-radius: 0; }

/* KPI 大卡墙退役：页头 inline 元信息串（MetaStrip 统一件；本视图只承担落位间距） */
.alv-strip { margin-top: 3px; }

/* write 异常警示：不再是独立横幅卡，通栏并入列表网格首行（单卡连体） */
.alv-warn-head {
  grid-column: 1 / -1;
  border: 1px solid var(--warn-line); background: var(--warn-soft);
  border-radius: var(--r-s); padding: var(--sp-2) var(--sp-3);
}
.alv-warn-t { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-1); }
.alv-warn-row {
  display: grid; grid-template-columns: minmax(140px, 200px) minmax(100px, 130px) minmax(0, 1fr); gap: var(--sp-3); align-items: center;
  padding: 5px 0; font-size: var(--fs-sm); border-bottom: 1px dashed var(--warn-line);
}
.alv-warn-row:last-child { border-bottom: 0; }
/* alv-warn-tag 私造样式随 StatusPill 改用退役（色档归 .pill y 单源） */
.alv-warn-idxs { font-size: var(--fs-xs); color: var(--tx1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* flex:1 吃掉页面剩余高度，但 align-content:start 让卡片保持内容高、不被拉长
 —— 别名卡片高度必须跟随其索引条目数，拉伸会造出空洞卡片。
 这里要的只是「容器占满、卡片不变形」，消除的是容器下方的死白。 */
/* 轨道下限挂 min(400px,100%) 钳制（AnalysisSettingsView 同款先例）——
 375px 手机视口下裸 400px 下限撑破容器实锤横向溢出，min() 让轨道在极窄容器收缩到 100% */
.alv-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(400px, 100%), 1fr)); gap: var(--sp-2); flex: 1; align-content: start; }
.alv-group { padding: var(--sp-2) 0 var(--sp-3); overflow: hidden; }
/* D2 去卡片化：组不再套 .card 壳（审计判「卡套行」），改分节式——组间 hairline 分隔，
 组内箭头行自带引导线视觉；.card 的阴影/圆角在多列卡阵中制造视觉噪音 */
.alv-group + .alv-group { border-top: 1px solid var(--line); }
/* 三种空态（拉取失败 / 被过滤空 / 真无别名）在剩余区里居中。
 用 margin:auto 而不是父级 justify-content:center——后者在可滚容器里会裁掉溢出内容顶部。
 三分支改用 EmptyState compact 后选择器同步更新（EmptyState 根类 .empty-state，
 子组件根节点带本组件 scoped 属性，子选择器照常命中） */
.alv > .empty-state { margin: auto; }
.alv-g-hd {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2);
  padding: var(--sp-2h) var(--sp-3); border-bottom: 1px solid var(--line);
}
.alv-g-hd-l { display: flex; align-items: center; gap: 7px; min-width: 0; }
.alv-g-hd-r { display: flex; gap: 5px; flex: none; }
/* 按钮文字不许换行：窄卡片下「切换/详情/查询」曾被压成竖排 */
.alv-g-hd-r > .btn { flex: none; white-space: nowrap; }
.alv-g-ic { color: var(--ac-hi); }
/* 长别名（如 qa_sentiment_news_published）必须走截断而不是挤压兄弟节点：
 min-width:0 + ellipsis 让它成为唯一可收缩项，全名由 title 悬浮显示。
 实测未截断时它把右侧「N 索引」压成竖排（一个字一行：1/索/引，30x54），按钮也被挤重叠。 */
.alv-g-alias { font-weight: 600; font-size: var(--fs-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 徽标与计数不参与收缩：flex 默认允许 shrink，长别名一挤就把「1 索引」逼成竖排 */
.alv-g-hd-l > .pill { flex: none; white-space: nowrap; }

.alv-g-arrows { padding: var(--sp-2) var(--sp-3) var(--sp-2h); display: flex; flex-direction: column; gap: var(--sp-0); }
/* 当前命中分组卡：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.alv-group.hit-cur { border-color: var(--ac-line); box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
/* 深链命中分组（?idx= 消费后静态标记）：hit-cur 同款柔底+左强调条，无焦点环（非键盘游标态） */
.alv-group.alv-deep-hit { box-shadow: inset 3px 0 0 var(--ac-hi); background: var(--ac-soft); }
.alv-arrow-row {
  display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-1); border-radius: var(--r-s);
  transition: background var(--tr); font-size: var(--fs-sm);
}
.alv-arrow-row:hover { background: var(--bg2); }
.alv-arrow-row.is-write { background: var(--ok-soft); }
.alv-arrow { display: inline-flex; align-items: center; flex-shrink: 0; width: 40px; color: var(--tx2); }
.alv-arrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ac); }
.alv-arrow-line { flex: 1; height: 1.5px; background: var(--line-strong); margin: 0 var(--sp-0); }
.alv-arrow-tip { color: var(--tx2); font-size: var(--fs-xs); }
.alv-arrow-row.is-write .alv-arrow-dot { background: var(--ok); box-shadow: 0 0 5px var(--ok); }
.alv-arrow-idx { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); color: var(--tx0); cursor: pointer; }
.alv-arrow-idx:hover { color: var(--ac-hi); text-decoration: underline; }
.alv-write-badge { flex-shrink: 0; font-size: var(--fs-xs) !important; padding: 1px var(--sp-1h) !important; }
/* alv-meta bg2 胶囊私造样式随 MetaStrip 合并退役（形态归 .ms 单源）；
 本类只留行内落位（不参与收缩同 alv-write-badge），filter 触发器 hover/指针交互态保留 */
.alv-rowmeta { flex-shrink: 0; }
/* filter 全文 popover 触发徽标（原 title 悬停改点击弹层） */
.alv-meta-filter { cursor: pointer; }
.alv-meta-filter:hover { color: var(--ac-hi); }



/* 写操作面板 */
/* 写操作面板：品牌色弱化为半透明线（线框纪律：不再整圈实色 --ac 边框）。
 全局 .card 壳退役（约定④：border+底色+radius 整块消除）→ border-top
 分节承接（ ar-sec 同刀）；品牌弱化线语义保形，border-color: var(--ac-line)
 转 border-top 分节线色；卡留白由本类 padding 承接（原 .card padding 随壳退役） */
.alv-panel { border-top: 1px solid var(--ac-line); padding: var(--sp-3) 14px; }
/* card-t 行首横排保留（theme.css .card-t 全局档在场，类名不随壳退役） */
.alv-panel .card-t { display: flex; align-items: center; gap: var(--sp-1h); }
.alv-flex { flex: 1; }
.alv-form { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-2); }
/* min-width:0 让 flex 子项可收缩（默认 auto 被 .alv-fi 的 180px 顶住）；
 flex:1 1 200px 让折行后字段等分长满行宽而非各自为战。
 注意：866px 实测并不折行（表单可用宽 740px 刚好排下 4 控件），
 折行阈值实测为 <=760px。本规则的实际收益是行内宽度再分配
 （700px 下末行字段 186->574），不是消除折行。 */
.alv-f { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx2); min-width: 0; flex: 1 1 200px; }
.alv-f-block { width: 100%; margin-top: var(--sp-2); }
/* filter 编辑框高度档——标题行（钮右靠）；行数档走 JsonArea 既有 rows 写法，无容器层 */
.alv-f-hd { display: flex; align-items: center; gap: var(--sp-1); }
/* filter DSL lint 体检提示条私有形态（display/gap/margin-top/padding/radius/
 字号/行高 + warn/err 底色）退役 → theme.css .lint-bar 单源（模板纯类名改用，DOM 保形；
 margin-top 随单源归 --sp-2 档，落位节奏全站归一） */
.alv-fi:focus { border-color: var(--ac); }
/* .alv-fta 死规则随编辑器外框退役删除（filter 编辑器早已 JsonArea 化，
 模板 grep 0 引用实证——bg1+border+radius 外框形态不回流，① 源码锁） */
.alv-sw-arrow { font-size: var(--fs-xl); color: var(--tx2); padding-bottom: var(--sp-1h); }
/* 「从」侧弹层（usePopupList）：输入复用 .alv-fi 皮，弹层 Teleport 到 body */
.alv-swfrom { position: relative; display: flex; }
/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号
 .alv-pop.inplace scoped 拷贝退役换挂 theme.css .float-pop.inplace 基座
 （absolute/top:100%/left:0/min-width:100%；HealthReportView .hr-pop.inplace 合并先例，
 模板 class 已是 float-pop 链，inplace 行为不变——z 回落基座的 --z-island 档） */
.alv-pop { overflow: hidden; font-size: var(--fs-sm); }
.alv-pop-list { max-height: 200px; overflow: auto; padding: 3px 0; }
.alv-pop-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }
.alv-pop-item.act, .alv-pop-item:hover { background: var(--hover); }
.alv-pop-hint { padding: var(--sp-2h); color: var(--tx2); font-size: var(--fs-xs); }
.alv-sw-hint { font-size: var(--fs-xs); color: var(--tx2); margin-top: var(--sp-2); }
.alv-sw-hint code { background: var(--bg2); padding: 0 var(--sp-1); border-radius: 3px; }
.alv-panel-act { margin-top: var(--sp-2h); display: flex; gap: var(--sp-2); }
.alv-danger:hover { color: var(--err); }

/* 实测 iframe 可用宽 ~866px，固定栏宽在此崩塌。
 断点归一 标准值 1100（堆叠语义）。 */
@media (max-width: 1100px) {
  .alv-warn-row { grid-template-columns: minmax(0, 1fr); }
  /* 塌栏后独占满宽，不必再截断——让违规索引名完整可见 */
  .alv-warn-idxs { white-space: normal; overflow: visible; text-overflow: clip; }
}

/* 760 野断点并档——原 实测豁免档按全站 900/1100 双档纪律
 合并（BrowserView 1280→1100 并档先例）：「折行后复选框独占整行」规则并入 900 档，760 块删除 */
@media (max-width: 900px) {
  .alv-form > .alv-chk { flex: 1 0 100%; }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.alv-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
