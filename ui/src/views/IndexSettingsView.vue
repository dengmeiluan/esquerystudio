<template>
  <div class="is">
    <PageHeader :icon="Sliders" title="索引设置（热更）" subtitle="动态设置热更新，静态项需 close/open" />
    <!-- 只读身份前置说明（1124）：保存钮隐藏时说明缺什么，避免只读身份只看到「没有保存」 -->
    <div v-if="auth.probed && !canOps" class="is-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份只读：设置可查看与对比；保存需要该连接的索引设置/索引页写权限（或 CLUSTER_OP 及以上角色）。
    </div>

    <!-- 顶栏。：card 壳退役（约定③）——裸 lr-bar 行直贴页面流，border-bottom 分界 -->
    <div class="is-bar lr-bar freeze">
      <div class="is-bar-l lr-bar-l">
        <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（「选索引」唯一入口收敛顶栏）——
 useIdxState follow:true + 脏态 guard（diffCount>0 暂停跟随）与顶栏同源，chip 即当前索引；
 「用当前索引」回填钮随 chip 即当前索引退役（无第二份 target 可回填） -->
        <CurrentIdxChip />
        <span v-if="lastReload" class="is-time mono">读取于 {{ lastReload }}</span>
      </div>
      <div class="is-bar-r lr-bar-r">
        <!-- 三态保存：全动态→护栏按钮；含静态/非法→禁用；Insight 降级→旧直存（智能死了，功能不能死）；
 保存=CLUSTER 档写操作，rank3+ 可见（两个出口同档） -->
        <GuardedActionButton
          v-if="canOps && canGuardedSave"
          action-id="apply-index-settings"
          :params="guardParams"
          :can="canOps && canGuardedSave"
          :label="`保存 (${diffCount})`"
          @executed="onExecuted"
        />
        <button
          v-else-if="canOps" class="btn primary sm" @click="save"
          :disabled="saving || !diffCount || saveBlocked || analyzing"
          :title="saveBlocked ? '含需重建/非法项，见右侧分析' : ''"
        >
          <Save :size="12" /> {{ saveBtnText }}
        </button>
        <button aria-label="刷新设置" class="btn sm ghost" @click="loadSettings" :disabled="!index || loading" title="刷新设置">
          <RefreshCw :size="12" :class="{ spinning: loading }" />
        </button>
        <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/index-settings'=本页 GET 读取 + PUT /update 热更同前缀，
 IndexOptimizerView 同串跨页互见：各取各自最近一条） -->
        <button aria-label="查看原始 IO（索引设置读写）" class="btn sm ghost" data-test="raw-io" title="最近一次索引 settings 读取/热更请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
      </div>
    </div>

    <!-- 轨4（刀④）：空态整块空框退役——EmptyState 裸置（DevToolsView:824 空态
 flex 居中无框范式），不再给「未选索引」留 bg1+border+radius 空壳 -->
    <EmptyState
      v-if="!index"
      centered
      :icon="Settings2"
      text="请选择要热更的索引"
      hint="在顶部索引选择器里挑一个索引，即可查看并热更其 settings"
    />

    <template v-else-if="loading && !form">
      <!-- 骨架壳（card + padding:var(--sp-4) 内联）退役——骨架裸置
 （SystemView:65 先例，538「空态不留整块空框」加载态同判）；.is flex gap 承担与顶栏间距 -->
      <div>
        <SkeletonBox v-for="i in 8" :key="i" height="34px" round style="margin-bottom:var(--sp-2)" />
      </div>
    </template>

    <!-- 双栏：左侧表单+diff，右侧 InsightRail 现场分析（窄屏折到底部） -->
    <div v-else-if="form" class="is-main">
      <div class="is-left">
        <!-- 快捷调节表单。
 card 壳退役（visual-judge 同页双标实锤=右列 is-custom/is-diff 已
 border-top 分节而本分节仍是圆角子卡）——约定④裸分节，card-t 行首横排维持 -->
        <div class="is-form">
          <div class="card-t"><Zap :size="13" /> 热参数（点击即可动态生效）</div>
          <div class="is-rows">
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="refresh_interval" /></label>
              <input v-model="form.refresh_interval" class="is-input mono" placeholder="1s / 30s / -1（禁用）" @blur="riCheck(form.refresh_interval)" />
              <div v-if="riHint" class="il-hint" :class="'il-' + riLevel">{{ riHint }}</div>
              <div class="is-hint">批量导入时改 <code>-1</code>，完成后再调回 <code>1s</code>；数值越大 CPU/IO 越省</div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="number_of_replicas" /></label>
              <input v-model="form.number_of_replicas" class="is-input mono" placeholder="0 / 1 / 2" />
              <div class="is-hint">调 <code>0</code> 加速导入；调回 <code>1+</code> 恢复高可用</div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="blocks.read_only" /></label>
              <select v-model="form['blocks.read_only']" class="is-input">
                <option value="">- 未设置 -</option>
                <option value="false">false（可写）</option>
                <option value="true">true（只读，含元数据）</option>
              </select>
              <div class="is-hint">紧急冻结索引写入；恢复用 <code>false</code></div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="blocks.read_only_allow_delete" /></label>
              <select v-model="form['blocks.read_only_allow_delete']" class="is-input">
                <option value="">- 未设置 -</option>
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
              <div class="is-hint">磁盘 flood-stage 时 ES 会置 <code>true</code>；清盘后手工置 <code>false</code></div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="blocks.write" /></label>
              <select v-model="form['blocks.write']" class="is-input">
                <option value="">- 未设置 -</option>
                <option value="false">false</option>
                <option value="true">true（只读，允许元数据变更）</option>
              </select>
              <div class="is-hint">shrink/split/clone 前需临时置 true</div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="routing.allocation.total_shards_per_node" /></label>
              <input v-model="form['routing.allocation.total_shards_per_node']" type="number" class="is-input mono" placeholder="留空 = 不限" />
              <div class="is-hint">单节点承载该索引最大分片数；平衡热点</div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="max_result_window" /></label>
              <input v-model="form.max_result_window" type="number" class="is-input mono" placeholder="10000（默认）" />
              <div class="is-hint">深分页阈值；建议改用 search_after 而非提高该值</div>
            </div>
            <div class="is-row" @contextmenu.prevent.stop="openRowMenu($event)" @keydown="openRowMenu($event)">
              <label><DotKey k="highlight.max_analyzed_offset" /></label>
              <input v-model="form['highlight.max_analyzed_offset']" type="number" class="is-input mono" placeholder="1000000（默认）" />
              <div class="is-hint">解决长文本高亮 illegal_argument_exception</div>
            </div>
          </div>

          <!-- 任意 setting 入口（静态项如 number_of_shards / analysis.* 也可提，右侧实时判定去向） -->
          <div class="is-custom">
            <div class="is-custom-head">
              <span class="is-custom-title sec-t">自定义 setting</span>
              <span class="is-custom-tip">支持任意索引级 setting（含静态项），编辑即实时判定「可热更 / 需重建 / 非法」</span>
              <button class="btn sm ghost" @click="addCustomRow"><Plus :size="12" /> 添加</button>
            </div>
            <div v-for="(r, i) in customRows" :key="i" class="is-custom-row">
              <SettingsKeyInput v-model="r.key" class="is-input" />
              <!-- 值输入悬停 :title=目录中文释义（SETTINGS_CATALOG 单源，normKey 去前缀口径） -->
              <input v-model="r.value" class="is-input mono" :title="customHint(r.key)" placeholder="值（留空 = 清除）" />
              <button aria-label="移除" class="btn sm ghost" title="移除" @click="removeCustomRow(i)"><X :size="12" /></button>
            </div>
          </div>

          <!-- Diff 预览（并入表单卡底部作 summary 区：分区标题+上边框分隔，不再独立成卡） -->
          <div class="is-diff">
            <div class="card-t is-diff-t">
              <GitCompare :size="13" /> 变更预览（{{ diffCount }}）· 会 PUT /{{ index }}/_settings
            </div>
            <div v-if="diffCount" class="is-diff-rows">
              <div v-for="d in diffList" :key="d.key" class="is-diff-item">
                <div class="is-diff-row">
                  <span class="is-diff-k"><DotKey :k="d.key" /></span>
                  <span class="mono is-diff-old" :title="'原值'">{{ d.old === '' || d.old == null ? '（未设置）' : d.old }}</span>
                  <ArrowRight :size="11" style="color:var(--tx2)" />
                  <span class="mono is-diff-new" :title="'新值'">{{ d.new === '' ? '（清除）' : d.new }}</span>
                  <!-- 裸 .pill n is-kind 徽标收口 StatusPill（kind→tone 语义映射：
 DYNAMIC→g/STATIC→y/其余→r，k-* 手写文字色档随改用退役，色归 tone 单源；
 is-kind 锚类保留——pillSingleTrack MERGED 看守） -->
                  <StatusPill v-if="kindOf(d.key)" class="is-kind" :tone="kindTone(kindOf(d.key))" :label="kindText(kindOf(d.key))" />
                </div>
                <div v-for="(gi, gj) in issuesOf(d.key)" :key="gj" class="is-gate">
                  <!-- severity 裸枚举 + g-err/g-warn 手写色档 → StatusPill+sevZh
 （tone 走 sevPill 五主档单源；中文标签 严重/警告/建议） -->
                  <StatusPill class="is-gate-sv" :tone="gateSevPill(gi.severity)" :label="gateSevZh(gi.severity)" />
                  {{ gi.message }}
                  <span v-if="gi.suggestion" class="is-gate-sug">{{ gi.suggestion }}</span>
                </div>
              </div>
            </div>
            <!-- 裸 .empty 迁 EmptyState compact（diff 分区窄容器；死类 is-narrow 同步更新删除） -->
            <EmptyState v-else compact :icon="GitCompare" text="暂无变更" />
          </div>
        </div>

        <!-- 完整原始 settings。：残壳 .card 退役（约定④，552 只退了 is-form 本次收尾）
 → border-top 分节（is-form/is-diff 同页同语言），card-t 行首横排 x=0 对齐 -->
        <div class="is-raw">
          <div class="is-raw-hd">
            <div class="card-t" role="button" tabindex="0" :aria-expanded="showRaw" @click="showRaw = !showRaw" @keydown.enter.prevent="showRaw = !showRaw" @keydown.space.prevent="showRaw = !showRaw" style="cursor:pointer">
              <FileJson :size="13" /> 完整 settings（含默认值） {{ showRaw ? '▾' : '▸' }}
            </div>
            <!-- raw 面补臂——键/值过滤 + 复制全部 + 点击全选兜底（MappingView 原始 JSON 同款范式）。
 手写过滤框改用 SearchFilterBar 统一件（第 16 胞收官；558b tv-kw 先例：
 v-model 接原 ref 零触、placeholder 逐字保留兼作 aria-label、Esc 清空内建补齐——
 原框无手写 Esc 绑定，filterEscClear379 计数册缺席胞；is-raw-kw-wrap 落位类挂根，
 is-raw-filter 锚随 input-class 保留在 input 上；data-test=is-raw-kw 点名锚） -->
            <template v-if="showRaw">
              <SearchFilterBar v-model="rawFilter" data-test="is-raw-kw" class="is-raw-kw-wrap" input-class="is-raw-filter" placeholder="过滤键或值（如 refresh）" />
              <button class="btn sm ghost" title="复制完整 settings（不受过滤影响）" @click="copyRawSettings"><Copy :size="11" /> 复制全部</button>
            </template>
          </div>
          <!-- W-C 批：完整 settings 走 highlightJson 范式（转义安全 v-html）；
 点击全选——复制被浏览器策略拦时 Ctrl+C 零门槛兜底 -->
          <pre v-if="showRaw" ref="rawPreEl" class="mono json-view is-raw-pre" role="button" tabindex="0" title="点击全选，Ctrl+C 复制" @click="selectAllRaw" @keydown.enter.prevent="selectAllRaw" @keydown.space.prevent="selectAllRaw" v-html="filteredRawHtml"></pre>
        </div>
      </div>

      <!-- 现场分析栏（降级铁律：degraded 时整栏静默收起） -->
      <InsightRail :loading="analyzing" :degraded="insightDegraded" :empty="!impact">
        <template v-if="impact">
          <!-- 三张 ir-card 卡壳降为单卡三分节（嵌套框冗余清）——分节标题走全局 .sec-t 档，
 分节间上边框分隔；三节显隐条件（常驻/hasStatic/hasIllegal）与全部文案语义原样保留。
 残壳 .card 退役（约定④）→ border-top 分节（同页 is-form 同语言） -->
          <div class="ir-card">
            <div class="ir-sec">
              <div class="sec-t ir-sec-t"><Activity :size="13" /> 变更总览</div>
              <div class="ir-counts">
                <div class="ir-count"><b class="c-dyn">{{ dynCount }}</b><span>动态可热更</span></div>
                <div class="ir-count"><b class="c-sta">{{ staticCount }}</b><span>静态需重建</span></div>
                <div class="ir-count"><b class="c-ill">{{ illegalCount }}</b><span>非法</span></div>
              </div>
            </div>

            <div v-if="impact.hasStatic" class="ir-sec">
              <div class="sec-t ir-sec-t"><Hammer :size="13" /> 就地重建预估</div>
              <template v-if="impact.rebuildEstimate && !impact.rebuildEstimate.error">
                <!-- 三行 ir-kv 手写 meta 行合并 MetaStrip mini 档（；
 数值 mono+tabular 归 .ms 单源，文案语义原样） -->
                <MetaStrip class="ir-kvs" :items="[
                  { value: fmtNum(impact.rebuildEstimate.docCount), label: '文档数' },
                  { value: fmtBytes(impact.rebuildEstimate.sizeBytes), label: '主分片体积' },
                  { value: '约 ' + impact.rebuildEstimate.estimatedMinutes + ' 分钟', label: '预计耗时' },
                ]" />
              </template>
              <div v-else class="ir-est-err">{{ impact.rebuildEstimate?.error || '预估不可用' }}</div>
              <div class="ir-note">静态 setting 无法热更；零停机重建可在不中断读写的前提下应用变更</div>
              <button class="btn pri sm ir-btn" @click="goRebuild"><Hammer :size="12" /> 转零停机重建</button>
            </div>

            <div v-if="impact.hasIllegal" class="ir-sec ir-block">
              <div class="sec-t ir-sec-t" style="color:var(--err)"><AlertTriangle :size="13" /> 非法项阻断</div>
              <div v-for="it in illegalItems" :key="it.key" class="ir-ill">
                <span class="ir-ill-key"><DotKey :k="it.key" /></span>
                <div class="ir-ill-note">{{ firstSuggestion(it) || it.note }}</div>
              </div>
            </div>
          </div>
        </template>
      </InsightRail>
    </div>

    <!-- 拉取失败后 form 为空——不留白屏，给原因与重试。
 失败态整卡（card is-empty 空框）退役——EmptyState centered 直贴
 （「空态不留整块空框」，AnalyzerLabView:49 是 546 先例）；文案保留原样
 （含 loadErr 动态拼接），重试走 EmptyState action 位（ 的
 「失败态整卡豁免」由约定推翻，彼处锁同步更新） -->
    <EmptyState v-else centered :icon="AlertTriangle"
      :text="'settings 拉取失败' + (loadErr ? '：' + loadErr : '')"
      action-text="重试" @action="loadSettings" />

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/index-settings 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
  <!-- 1341：设置行右键——键名/当前值/请求体片段一键带走 -->
  <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="'设置 · ' + rowMenu.key"
    :items="rowMenuItems" @close="rowMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Sliders, Save, RefreshCw, Zap, GitCompare, ArrowRight, FileJson,
  Plus, X, Activity, Hammer, AlertTriangle, Settings2, Copy, Terminal, ShieldAlert,
} from 'lucide-vue-next';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：raw 面过滤胶囊统一件（第 16 胞） */
import PageHeader from '../components/PageHeader.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraftState } from '../composables/useScopedDraft';
import { useIdxState, usePref } from '../composables/urlState';
import { friendlyEsError } from '../utils/esError';
import { SETTINGS_CATALOG } from '../utils/indexSettingsCatalog'; /* ：自定义行悬停释义单源 */
import { fmtTime, fmtNum, copyText } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import SkeletonBox from '../components/SkeletonBox.vue';
import InsightRail from '../components/InsightRail.vue';
import GuardedActionButton from '../components/GuardedActionButton.vue';
import DotKey from '../components/DotKey.vue';
import SettingsKeyInput from '../components/SettingsKeyInput.vue';
import EmptyState from '../components/EmptyState.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：gate severity 徽标统一件 */
import MetaStrip from '../components/MetaStrip.vue'; /* ：ir-kv meta 行统一件 */
/* gate severity 档位/中文标签收口 esEnumZh 单源（sevPill/sevZh——
 ERROR→r、WARN→y、INFO→b；critical→严重 / warn→警告 / 其余→建议），g-err/g-warn 手写色档退役 */
import { sevPill as gateSevPill, sevZh as gateSevZh } from '../utils/esEnumZh';
/* bytes 档单源（重建体积预估 fmtBytes） */
import { semFormat } from '../composables/useSemFormat';
import { useInputLint, patternRule, TIME_RE } from '../composables/useInputLint';

const store = useAppStore();
/* 权限门禁——settings 热更=/cluster/index-settings/update|update-settings=CLUSTER 档（rank3+）；
 读取/分析全角色可用，两个保存出口（护栏/降级直存）同档 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/index-settings/update', store.target));
const router = useRouter();

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/index-settings');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 目标索引进 URL——刷新/分享链接可复原（可重入）。
 follow:true + 脏态 guard——diffCount>0（有未保存变更）时暂停跟随，
 防顶栏切索引把「A 的表单」指到 B；保存/重载后 diffCount 归零，跟随自然恢复。
 「选中即拉取」由 watch(index) 承接（guard 内跳过），页内 IndexPicker @picked 随退役走 */
const index = useIdxState({ follow: () => diffCount.value === 0 });
const raw = ref<any>(null);
/* W-C 批：完整 settings JSON 高亮（highlightJson 输出已转义）；
 raw 面补臂——过滤词命中键/值的点键路径重排 JSON，空词=全文；
 「复制全部」恒复制完整原文（不受过滤影响） */
const rawFilter = ref('');
const rawPreEl = ref<HTMLElement | null>(null);
const rawText = computed(() => (raw.value ? JSON.stringify(raw.value, null, 2) : ''));
const filteredRawHtml = computed(() => {
  if (!raw.value) return '';
  const t = rawFilter.value.trim().toLowerCase();
  if (!t) return highlightJson(rawText.value);
  const flat: Record<string, any> = {};
  const walk = (obj: any, prefix: string) => {
    for (const [k, v] of Object.entries(obj || {})) {
      const p = prefix ? prefix + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else flat[p] = v;
    }
  };
  walk(raw.value, '');
  const hit: Record<string, any> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (k.toLowerCase().includes(t) || String(v).toLowerCase().includes(t)) hit[k] = v;
  }
  return highlightJson(JSON.stringify(hit, null, 2));
});
/* 点击 JSON 区全选（MappingView selectAllRaw 同款：复制兜底第一步，Ctrl+C 走系统剪贴板）。
 事件派发通道取 currentTarget；复制失败 toast 的动作以构造事件直调本函数（无派发=
 currentTarget 为空），回落 rawPreEl 真身，全选兜底不落空 */
function selectAllRaw(e: MouseEvent | KeyboardEvent) {
  const el = (e.currentTarget as Node | null) ?? rawPreEl.value;
  if (!el) return;
  const sel = window.getSelection();
  const range = document.createRange();
  if (!sel || !range) return;
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}
/* 1341：设置行右键。全站右键普查（按渲染表面扫 16 条路由）发现本页 9 个热参数行
   完全没有右键；而这些行的键名正是用户下一步要贴进 DevTools / 设置 API 的东西，
   当前只能靠肉眼抄。一级只留「复制键名」（最高频）+「更多…」分组父项（项目右键约定）。
   ⚠键名取自该行 DotKey 的渲染文本，避免在模板里再写一份与 UI 可能漂移的对照表。 */
const rowMenu = ref<{ x: number; y: number; key: string; val: string } | null>(null);

/** 从被右键的 .is-row 里读出键名与当前值（值取该行 .is-input 的 value）。 */
function openRowMenu(e: MouseEvent | KeyboardEvent) {
  const row = (e.currentTarget as HTMLElement) || null;
  if (!row) return;
  if (e instanceof KeyboardEvent && !isMenuKey(e)) return;
  /* 键名只认 DotKey：它的 title 恒为完整键（.dotkey 内部用 <wbr> 断行，
     textContent 可能被折成「refre sh_interval」，所以取 title 而不是文本）。 */
  const dk = row.querySelector('.dotkey') as HTMLElement | null;
  const key = (dk?.getAttribute('title') || dk?.textContent || '').replace(/\s+/g, '').trim();
  if (!key) return;
  const el = row.querySelector('input.is-input, select.is-input') as HTMLInputElement | HTMLSelectElement | null;
  const val = el ? String(el.value ?? '') : '';
  const at = e instanceof KeyboardEvent ? menuKeyAnchor(e) : { x: e.clientX, y: e.clientY };
  rowMenu.value = { ...at, key, val };
}

const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const copy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    store.notify(ok ? 'success' : 'error', ok ? msg : '复制失败');
  };
  const body = JSON.stringify({ index: { [m.key]: m.val || null } }, null, 2);
  return [
    { key: 'is-copy-key', label: '复制设置键名', run: () => void copy(m.key, `已复制「${m.key}」`) },
    {
      key: 'is-more', label: '更多…', sep: true, children: [
        { key: 'is-copy-val', label: `复制当前值（${m.val || '未设置'}）`, run: () => void copy(m.val, '已复制当前值') },
        { key: 'is-copy-pair', label: '复制「键: 值」', run: () => void copy(`${m.key}: ${m.val}`, '已复制键值对') },
        { key: 'is-copy-body', label: '复制为设置请求体（PUT _settings 片段）', run: () => void copy(body, '已复制请求体片段') },
      ],
    },
  ];
});

/* 复制全部（ v3 范式）——失败必须出声，错误 toast 直接带「全选内容」动作 */
async function copyRawSettings() {
  if (await copyText(rawText.value)) { store.notify('success', '完整 settings 已复制'); return; }
  store.notify('error', '浏览器拦下了剪贴板——内容还在面板里，全选后 Ctrl+C 即可', {
    duration: 10000,
    action: { label: '全选内容', onClick: () => {
      const pre = rawPreEl.value;
      if (!pre) return;
      pre.scrollIntoView({ block: 'nearest' });
      selectAllRaw(new MouseEvent('click') as any);
      pre.focus?.();
    } },
  });
}
const original = ref<Record<string, any>>({});
const form = ref<Record<string, any> | null>(null);
/* ux2 ：refresh_interval 时间格式失焦校验 + 输入即清（防旧 hint 滞留误导） */
const { hint: riHint, level: riLevel, check: riCheck, clear: riClear } = useInputLint([
  patternRule(TIME_RE, '时间格式：数字+单位（ms/s/m/h/d），或 -1 禁用'),
]);
watch(() => form.value?.refresh_interval, () => riClear());
const curSettings = ref<any>({});
const loading = ref(false);
const loadErr = ref('');
const saving = ref(false);
const lastReload = ref('');
/* raw 展开态落 usePref 跨会话记忆（key 沿用 is_ 前缀惯例）。
 任务提及的「含默认值/仅显式」过滤态本页不存在（该状态在 MappingView/ClusterSettingsView），未越界新建 */
const showRaw = usePref('is_showraw', false);

/* 自定义 setting 行（任意键，静态变更入口） */
/* 草稿：自定义 settings 行草稿（写类视图，按 集群/索引 隔离——A 索引的行不串到 B） */
const customRowsDraft = useScopedDraftState<{ key: string; value: string }[]>('custom-rows', {
  route: 'index-settings',

  index: () => index.value,
}, []);
const customRows = customRowsDraft.state;
/* 热设置表单编辑值进草稿——此前 form 为裸 ref，切页/刷新编辑现场全丢 */
const formDraft = useScopedDraftState<Record<string, any>>('hot-form', {
  route: 'index-settings',

  index: () => index.value,
}, {});
watch(form, v => { if (v) formDraft.state.value = { ...v }; }, { deep: true });

/* 现场分析状态：impact=分析结果；degraded=Insight 接口异常（整栏收起+徽标静默，功能零影响） */
const impact = ref<any>(null);
const analyzing = ref(false);
const insightDegraded = ref(false);
let impactTimer: number | undefined;
let impactSeq = 0;

/* 支持的可热变字段清单 */
const HOT_KEYS = [
  'refresh_interval',
  'number_of_replicas',
  'blocks.read_only',
  'blocks.read_only_allow_delete',
  'blocks.write',
  'routing.allocation.total_shards_per_node',
  'max_result_window',
  'highlight.max_analyzed_offset',
];

/* 从嵌套 settings.index.* 展平出目标值 */
function pick(obj: any, dotPath: string): any {
  const parts = dotPath.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

async function loadSettings() {
  if (!index.value) return;
  const idx = index.value;
  loading.value = true;
  loadErr.value = '';
  try {
    const r = await api.indexSettings(idx);
    if (idx !== index.value) return;
    raw.value = r;
    const node = r?.[idx] || Object.values(r || {})[0] || {};
    const idxCur = node.settings?.index || {};
    const idxDef = node.defaults?.index || {};
    curSettings.value = idxCur;
    const merged: Record<string, any> = {};
    const originals: Record<string, any> = {};
    for (const k of HOT_KEYS) {
      const v = pick(idxCur, k) ?? pick(idxDef, k);
      merged[k] = v == null ? '' : String(v);
      originals[k] = merged[k];
    }
    form.value = (formDraft.restored.value && Object.keys(formDraft.state.value).length)
      ? { ...merged, ...formDraft.state.value }   // 编辑现场复原(线上值兜底新键)
      : merged;
    original.value = originals;
    if (!customRowsDraft.restored.value) customRows.value = [];   // 有草稿不冲行
    lastReload.value = fmtTime(Date.now());
  } catch (e: any) {
    if (idx !== index.value) return;
    /* 裸错误串改 friendlyEsError */
    loadErr.value = friendlyEsError(e?.message || String(e));
    form.value = null;
    store.notify('error', 'index-settings: ' + loadErr.value);
  } finally {
    if (idx === index.value) loading.value = false;
  }
}

/* 「选中即拉取」改 watch(index) 承接——跟随改值不经过页内选择器
 @picked（已退役），必须 watch 驱动拉取；diffCount>0（脏态）时跳过，保存后恢复 */
watch(index, (v) => {
  if (!v || diffCount.value > 0) return;
  loadSettings();
});

onMounted(() => {
  if (!store.indices.length) store.loadIndices();
  if (index.value) loadSettings();
});
onBeforeUnmount(() => { if (impactTimer) window.clearTimeout(impactTimer); });

function addCustomRow() {
  customRows.value.push({ key: '', value: '' });
}
function removeCustomRow(i: number) {
  customRows.value.splice(i, 1);
}
/** 去 index. 前缀，与后端 normalize 一致 */
function normKey(k: string): string {
  const t = k.trim();
  return t.startsWith('index.') ? t.slice('index.'.length) : t;
}

/* 自定义 setting 行值输入悬停 :title=目录中文释义+示例（SETTINGS_CATALOG
 单源，normKey 去 index. 前缀口径与后端一致；目录外键回落空串零扰动） */
function customHint(k: string): string {
  const s = SETTINGS_CATALOG.find(e => e.key === normKey(k));
  return s ? `${s.desc}｜示例：${s.example}` : '';
}

const diffList = computed(() => {
  if (!form.value) return [];
  const out: { key: string; old: any; new: any }[] = [];
  for (const k of HOT_KEYS) {
    const cur = form.value[k] ?? '';
    const ori = original.value[k] ?? '';
    if (String(cur) !== String(ori)) {
      out.push({ key: k, old: ori, new: cur });
    }
  }
  // 自定义行同通道进 diff（与表单键重复时以表单为准）
  for (const r of customRows.value) {
    const k = normKey(r.key);
    if (!k) continue;
    if (HOT_KEYS.includes(k) || out.some(o => o.key === k)) continue;
    const ori = pick(curSettings.value, k);
    out.push({ key: k, old: ori == null ? '' : String(ori), new: r.value });
  }
  return out;
});
const diffCount = computed(() => diffList.value.length);

/* 扁平变更集：与后端 settings-impact / apply-index-settings 契约一致 */
const changesFlat = computed(() => {
  const out: Record<string, any> = {};
  for (const d of diffList.value) {
    out[d.key] = d.new === '' ? null : coerce(d.new);
  }
  return out;
});

/* ---------------- 实时行内判定（800ms 防抖 + seq 防乱序） ---------------- */

watch(diffList, () => {
  if (impactTimer) window.clearTimeout(impactTimer);
  impactSeq++;
  if (!diffCount.value) {
    impact.value = null;
    analyzing.value = false;
    return;
  }
  analyzing.value = true;
  impactTimer = window.setTimeout(refreshImpact, 800);
}, { deep: true });

async function refreshImpact() {
  const seq = ++impactSeq;
  try {
    const r = await api.insight.settingsImpact(index.value, changesFlat.value);
    if (seq !== impactSeq) return;
    impact.value = r;
    insightDegraded.value = false;
  } catch {
    if (seq !== impactSeq) return;
    // 降级铁律：徽标静默、rail 收起，保存功能不受任何影响
    impact.value = null;
    insightDegraded.value = true;
  } finally {
    if (seq === impactSeq) analyzing.value = false;
  }
}

function kindOf(key: string): string {
  const it = (impact.value?.items || []).find((x: any) => x.key === key);
  return it?.kind || '';
}
function kindText(kind: string) {
  return kind === 'DYNAMIC' ? '可热更' : kind === 'STATIC' ? '需重建' : '非法';
}
/* kind→StatusPill tone 语义映射（改用伴生；DYNAMIC 可热更=g/STATIC 需重建=y/其余非法=r） */
function kindTone(kind: string): 'g' | 'y' | 'r' {
  return kind === 'DYNAMIC' ? 'g' : kind === 'STATIC' ? 'y' : 'r';
}
function issuesOf(key: string): any[] {
  const it = (impact.value?.items || []).find((x: any) => x.key === key);
  return it?.gateIssues || [];
}

const dynCount = computed(() => (impact.value?.items || []).filter((x: any) => x.kind === 'DYNAMIC').length);
const staticCount = computed(() => (impact.value?.items || []).filter((x: any) => x.kind === 'STATIC').length);
const illegalCount = computed(() => (impact.value?.items || []).filter((x: any) => x.kind === 'ILLEGAL').length);
const illegalItems = computed(() => (impact.value?.items || []).filter((x: any) => x.kind === 'ILLEGAL'));

function firstSuggestion(it: any): string {
  return it?.gateIssues?.[0]?.suggestion || '';
}
/* 数值单源退役——fmtBytes 本地字节三元合并 semFormat bytes 单源
 （1024 进制档位制；空/异常值回落 '0 B'，展示档位以单源为准） */
function fmtBytes(n: any): string {
  return semFormat(Number(n) || 0, 'bytes')?.text ?? '0 B';
}

/* ---------------- 三态保存 ---------------- */

/** 全部 DYNAMIC 且 Insight 正常 → 护栏按钮（estimate→confirmToken→execute→回执） */
const canGuardedSave = computed(() =>
  !insightDegraded.value && !analyzing.value && !!impact.value && diffCount.value > 0
  && !impact.value.hasStatic && !impact.value.hasIllegal
);
/** 含静态/非法项 → 保存禁用（转右侧分析引导） */
const saveBlocked = computed(() =>
  !insightDegraded.value && !!impact.value && (impact.value.hasStatic || impact.value.hasIllegal)
);
const saveBtnText = computed(() => {
  if (saving.value) return '保存中…';
  if (analyzing.value && !insightDegraded.value && diffCount.value) return '分析中…';
  return `保存 ${diffCount.value ? '(' + diffCount.value + ')' : ''}`;
});
const guardParams = computed(() => ({ index: index.value, changes: changesFlat.value }));

function onExecuted(receipt: any) {
  /* 保存成功后 diff 归零会让护栏按钮卸载，组件自带的回执滑出条随卸载消失；
     这里补一条全局通知，保证回执号/审计检索提示始终可见。 */
  const id = String(receipt?.receiptId || '').slice(0, 8);
  store.notify('success', id ? `已执行 · 回执 ${id}（审计可按回执号检索）` : '索引设置已执行');
  loadSettings();
}

/** 转零停机重建：携带 {index, pendingSettings} 上下文跳 AdhocRebuildView 预填 */
function goRebuild() {
  router.push({
    path: '/adhoc-rebuild',
    query: { index: index.value, pendingSettings: JSON.stringify(changesFlat.value) },
  });
}

/* 旧直存路径：Insight 降级时的回退（智能死了，功能不能死） */
async function save() {
  /* 执行体收口：护栏钮/回退钮之外无其它按钮面，但函数直调与后续入口同受此门 */
  if (!canOps.value) { store.notify('warning', '索引设置保存需专项角色'); return; }
  /* 2.1.6：执行体防重 */
  if (saving.value) return;
  if (!diffCount.value || !form.value) return;
  const idx: Record<string, any> = {};
  for (const d of diffList.value) {
    // 空字符串 → null（清除）；否则原样
    setDeep(idx, d.key, d.new === '' ? null : coerce(d.new));
  }
  const body = JSON.stringify({ index: idx });
  saving.value = true;
  try {
    await api.updateIndexSettings(index.value, body);
    store.notify('success', `已热更 ${diffCount.value} 项：${index.value}`);
    await loadSettings();
  } catch (e: any) {
    /* w80 先例平移：裸 e.message → friendlyEsError（同 loadSettings 口径） */
    store.notify('error', '热更失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    saving.value = false;
  }
}

function setDeep(obj: any, dotPath: string, v: any) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] || {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = v;
}
function coerce(v: any): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  return v;
}
</script>

<style scoped>
.is { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 轨4（刀④）：空态空壳规则（bg1+border+radius）随模板类退役——空态不留
 整块空框，EmptyState 裸置；：失败态整卡 .is-empty 规则随之退役
 （失败态改 EmptyState centered 直贴，留白归组件单源，原 34px 契约由组件承担） */
/* card 壳退役——裸行只留竖距与分界线，横距归页面流（与卡/空态同缘对齐） */
.is-bar { padding: var(--sp-3) 0; border-bottom: 1px solid var(--line); }
/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.is-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
/* .is-title（fs-sm/650）为 PageHeader 接管后的死规则，随标题四档合并退役 */
.is-time { font-size: var(--fs-xs); color: var(--tx2); }
/* 工具行尺寸统一：GAB 根按钮（.btn.pri 默认号）对齐全行 sm 基准（GAB 多根组件 class 不透传，行内对齐） */
.is-bar-r :deep(.btn.pri) { padding: 3px var(--sp-2); font-size: var(--fs-xs); }

/* 双栏 */
.is-main { display: flex; gap: var(--sp-3); align-items: flex-start; }
.is-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
@media (max-width: 1100px) {
  .is-main { flex-direction: column; }
  .is-main :deep(.irail) { width: 100%; }
}

/* card 壳退役后行首横排对齐（card-t 与行内容同 x=0，右列 is-custom/is-diff 同语言） */
.is-form { padding: 0 0 var(--sp-3); }
.is-rows { padding: 0; }
/* label 列 minmax 弹性（容得下 40+ 字符 dot-key，实在不够在点后换行）；说明列 minmax(0,1fr) 拿收缩权，不再被挤成竖排 */
.is-row { display: grid; grid-template-columns: minmax(200px, 300px) minmax(160px, 220px) minmax(0, 1fr); gap: var(--sp-3); align-items: center; padding: var(--sp-2) 0; border-bottom: 1px dashed var(--line); }
.is-row:last-child { border-bottom: 0; }
.is-row label { font-size: var(--fs-sm); color: var(--tx1); min-width: 0; }
.is-input { height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-xs); color: var(--tx0); min-width: 0; }
.is-input:focus { border-color: var(--ac); outline: 0; }
.is-hint { font-size: var(--fs-xs); color: var(--tx2); min-width: 0; line-height: 1.5; }
.is-hint code { padding: 1px var(--sp-1); background: var(--bg2); border-radius: 3px; color: var(--info); font-family: var(--mono, monospace); }
/* 窄容器：三列塞不下时堆叠成单列，说明全宽跟随，永不挤成一柱竖排 */
@media (max-width: 900px) {
  .is-row { grid-template-columns: 1fr; gap: var(--sp-1); padding: var(--sp-3) 0; }
  .is-custom-row { grid-template-columns: 1fr auto; }
  .is-custom-row .is-input:first-child { grid-column: 1 / -1; }
}

/* 自定义 setting。：卡中卡子框（bg0+dashed+radius）退役（约定④）——
 border-top 分节流，is-diff 裁决逐字参照系；内缩随分节流下放 head/rows 自携 --sp-4 */
.is-custom { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.is-custom-head { display: flex; align-items: center; gap: var(--sp-3); margin: 0 var(--sp-4); }
/* 分节标题档归位——.is-custom-title 形态（fs-sm/650/tx0 自造）换挂全局弱分节
 .sec-t（fs-sm/600/tx1），本类只留落位（行内 flex 头中的 flex-shrink） */
.is-custom-title { flex-shrink: 0; }
.is-custom-tip { font-size: var(--fs-xs); color: var(--tx2); flex: 1; }
.is-custom-row { display: grid; grid-template-columns: minmax(180px, 320px) minmax(0, 1fr) auto; gap: var(--sp-2); margin: var(--sp-2) var(--sp-4) 0; align-items: center; }

/* 变更预览：表单卡底部 summary 分区（上边框分隔，标题与内容左右对齐 is-rows 的 var(--sp-4)） */
.is-diff { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.is-diff-t { margin: 0 var(--sp-4) var(--sp-2); }
.is-diff-rows { padding: 0 var(--sp-4); }
.is-diff-item { border-bottom: 1px dashed var(--line); padding: var(--sp-0) 0; }
.is-diff-item:last-child { border-bottom: 0; }
/* diff 行允许折行，key/旧值/新值都拿 min-width:0，长值在断点处换行不溢出 */
.is-diff-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-1) 0; font-size: var(--fs-xs); flex-wrap: wrap; }
.is-diff-k { color: var(--tx1); flex: 0 1 auto; min-width: 0; max-width: 46%; }
.is-diff-old { color: var(--tx2); text-decoration: line-through; min-width: 0; overflow-wrap: anywhere; }
.is-diff-new { color: var(--ok); font-weight: 600; min-width: 0; overflow-wrap: anywhere; }

/* 行内判定徽标。：徽标本体改用 StatusPill（k-dynamic/k-static/k-illegal
 手写文字色档随改用退役，色归 tone 单源；.is-kind 只留落位锚） */
.is-kind { margin-left: auto; flex-shrink: 0; }
.is-gate { font-size: var(--fs-xs); color: var(--tx1); padding: 0 0 var(--sp-1) var(--sp-3); }
/* g-err/g-warn 手写色档随 gate severity 改用 StatusPill 退役（色归 tone 单源），
 .is-gate-sv 只留落位间距 */
.is-gate-sv { margin-right: var(--sp-1); }
.is-gate-sug { color: var(--tx2); margin-left: var(--sp-2); }

/* raw 面头行——标题占主位，过滤框/复制钮右靠；pre 前距由头行 padding-bottom 承担 */
/* .card 壳退役 → border-top 分节（is-form 同页同语言：行首 x=0 对齐，
 竖距 var(--sp-3) 与 .is-left gap 同档承接壳原 14px 前距） */
.is-raw { padding: var(--sp-3) 0 0; border-top: 1px solid var(--border); }
.is-raw-hd { display: flex; align-items: center; gap: var(--sp-2); padding-bottom: var(--sp-2h); }
.is-raw-hd .card-t { flex: 1; min-width: 0; margin-bottom: 0; }
/* 类随改用挂 SearchFilterBar 根——手写输入框皮（is-input bg2 底/line 边/4px 圆角）
 退役归组件 .sfb 胶囊壳单源，本类只留落位（200px→min(200px,100%) 极窄钳制同步更新）与高度内衬
 （26px 对齐现行，高度链零动）；is-raw-filter 锚经 input-class 保留在 input 上（无遗留样式） */
.is-raw-kw-wrap { width: min(200px, 100%); flex-shrink: 0; box-sizing: border-box; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-sm); }
/* 完整 settings 预上限随视口弹性（460px 定高在大屏仍要内层滚动且下方留大片空白）；
 --vh-offset 为全站页头预留口径（theme.css :root=210px），按 BrowserView/MappingView 先例不写
 本地 fallback，避免两处漂移 */
.is-raw pre { max-height: calc(100vh - var(--vh-offset)); overflow: auto; padding: var(--sp-3) var(--sp-4); margin: 0; font-size: var(--fs-xs); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
/* scoped .empty 覆盖随「暂无变更」空态迁 EmptyState compact 一并退役，留白归组件 */

/* InsightRail 卡片。：三卡降单卡三分节——.ir-card .card-t 卡头规则随卡壳退役，
 分节标题走全局 .sec-t 档（flex 排布/间距归 ir-sec-t），分节间上边框分隔。
 残壳 .card 退役 → border-top 分节 hairline（is-form 同页同语言） */
.ir-card { padding: var(--sp-3); border-top: 1px solid var(--border); }
.ir-sec + .ir-sec { margin-top: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--line); }
.ir-sec-t { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.ir-counts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-2); }
.ir-count { display: flex; flex-direction: column; align-items: center; gap: var(--sp-0); background: var(--bg2); border-radius: var(--r-s); padding: var(--sp-2) var(--sp-1); }
.ir-count b { font-size: var(--fs-xl); font-weight: 650; }
.ir-count span { font-size: var(--fs-xs); color: var(--tx2); }
.c-dyn { color: var(--ok); }
.c-sta { color: var(--warn); }
.c-ill { color: var(--err); }
/* ir-kv 三条私造行样式随 MetaStrip 合并退役（形态归 .ms 单源） */
.ir-est-err { font-size: var(--fs-xs); color: var(--warn); padding: var(--sp-1) 0; }
.ir-note { font-size: var(--fs-xs); color: var(--tx2); margin: var(--sp-2) 0; line-height: 1.5; }
.ir-btn { width: 100%; justify-content: center; }
/* 原 .ir-block 卡红边随卡壳退役——改挂分节分隔线（非法项分节上边框走 err 档） */
.ir-sec.ir-block { border-top-color: var(--err-line); }
.ir-ill { padding: var(--sp-1) 0; border-bottom: 1px dashed var(--line); }
.ir-ill:last-child { border-bottom: 0; }
.ir-ill-key { font-size: var(--fs-xs); color: var(--err); min-width: 0; }
.ir-ill-note { font-size: var(--fs-xs); color: var(--tx1); margin-top: var(--sp-0); }
</style>
