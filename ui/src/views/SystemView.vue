<template>
  <div class="sy">
    <!-- 统一页头：WHICHS 退役后只剩「分布式锁」一个系统索引，seg 切换器随之退役，语义并入副标题。
 横幅降级——宿主作用域并入副标题自述。
 sy-intro 信息条已删（与副标题语义重复）：intro 独有的「starter 自家/非业务索引、
 DSL 结果上限」并入副标题，页面少一层横幅 -->
    <PageHeader :icon="Settings2" title="系统索引" subtitle="宿主集群系统索引 · 分布式锁（starter 自家，非业务索引）· 锁占用确认 / 重建等锁排查 · 支持自定义 DSL，结果上限 100 条">
<template #actions>
<span style="flex:1"></span>
      <!-- G259：原始 IO 快查（777 G255/755 G200 同构）——本页查询执行通道
 （POST /system-query）请求/响应原文直达；inspect 读通道语义并入 title 自述 -->
      <button class="btn sm ghost" title="最近一次系统索引查询（system-query）请求/响应原文（复制/curl 回放）" @click="openRawIo">
        <Terminal :size="11" /> 原始 IO
      </button>
      <button class="btn sm" @click="loadInspect" :disabled="loading"><RefreshCw :size="12" :class="{ spinning: loading }" /> 刷新</button>
      </template>
</PageHeader>

    <!-- 老书签指向已退役视图：陈述事实并说明已切到哪，不报错 -->
    <div v-if="retiredNote" class="sy-retired">
      <Info :size="13" style="flex-shrink:0;margin-top:1px" />
      <span>{{ retiredNote }}</span>
    </div>

    <div v-if="isBrowserMode" class="sy-browser-note">
      <Info :size="13" style="flex-shrink:0;margin-top:1px" />
      <span>浏览器模式没有跨实例分布式锁：这里展示当前浏览器内的托管重建作业锁；真正的跨实例互斥由服务端控制面提供。</span>
    </div>

    <!-- 索引信息（ W-D：sy-meta 手写 chip 行 + pill r 换 MetaStrip 统一件，
 值亮+标签暗+·分隔同构；mapping 读取失败并入 err 档，文案逐字） -->
    <MetaStrip v-if="info" :items="syMeta" />
    <!-- C12：inspect 失败不再仅 toast 后 chip 区静默消失——内联小字提示 + 重试。
 裸红字挂全局 .il-hint.il-err 单源（theme.css :565-566，561 RA il-hint
 全站语言；字排/色档同值），本地锚只留 flex 布局（重试钮行内排布）+ margin-top 中和保原落位 -->
    <div v-if="inspectErr" class="sy-inspect-err il-hint il-err">
      索引信息读取失败：{{ inspectErr }}
      <button class="btn ghost xs" @click="loadInspect" :disabled="loading">重试</button>
    </div>

    <!-- 查询区（ W-D：inline padding 归 scoped token 类。
 全局 .card 壳退役——bg/border/radius 不再消费，padding 条栏形态原样保留） -->
    <div class="sy-qcard">
      <!-- W-F：150px 定高 → 视口弹性档（ ConfigDrift/ClusterSettings 42vh 档范式）——
 max(150px,…) 保底历史最低视觉不降，大屏 DSL 编辑不再局促（查询输入面非只读预览，28vh 档够写不霸屏）。
 弹性档 + usePref 记忆（sys.edH，ubq.scriptH「高」钮三档循环同款；首档沿用原口径） -->
      <!-- P0-1：编辑器划线通道挂点（banner 保留双通道，见 script queueSysLintMarkers） -->
      <MonacoEditor ref="sysDslMonaco" v-model="dsl" :height="sysEdH" :dsl-assist="sysAssist" @execute="run" />
      <!-- DSL 静态体检提示条（search 语义档与 sysAssist 同口径；RestView rtLint 同款接线，
 随输入实时重估、零阻塞不拦执行；JSON 非法静默）
 .sy-lint 私造双档改用 theme.css 单源 .lint-bar（558 红壳合并同范式——
 形态/双档语义逐字同值，sy-lint scoped 三条退役） -->
      <div v-if="sysLintErrors.length" role="alert" class="lint-bar lint-bar-err">
        <span>DSL 检查（错误）：{{ sysLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
      <div v-else-if="sysLintWarns.length" role="status" class="lint-bar lint-bar-warn">
        <span>DSL 检查：{{ sysLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
      <div class="sy-run-row">
        <!-- G260：Loader2/Play 双态+「执行中…」在途文案（766 G234/746 G161 族；
 running 骨架条既有=结果区反馈，本次补按钮本体双态=同页刷新钮标准归一） -->
        <button class="btn pri sm" :disabled="running" @click="run"><Loader2 v-if="running" :size="12" class="spinning" /><Play v-else :size="12" /> {{ running ? '执行中…' : '执行' }} <span class="kbd">Ctrl⏎</span></button>
        <button class="btn sm" @click="reset">重置</button>
        <!-- 查询编辑器高度「高」钮（ubq.scriptH 三档循环同款形态） -->
        <button class="btn ghost xs" data-test="sys-dsl-h" :title="'查询编辑器高度档：' + sysEdH" @click="cycleSysEdH">高</button>
        <span v-if="resp" class="mono" style="margin-left:auto;font-size: var(--fs-xs);color:var(--tx2)">
          <b style="color:var(--tx0)">{{ fmtNum(resp.total) }}</b> 条 ·
          <!-- 裸 took ms → TookBadge 四档语义徽标（阈值单一出处 utils/format.ts） -->
          <TookBadge :ms="resp.took" title="查询耗时" />
        </span>
      </div>
    </div>

    <!-- -A2：自动查询失败不能伪装成初始空态 -->
    <div v-if="loadErr && !resp" role="alert" class="err-bar rise-in">
      {{ loadErr }}
      <button class="btn sm" @click="run" :disabled="running"><RefreshCw :size="12" /> 重试</button>
    </div>

    <!-- 结果：running 分支先于结果与空态——执行中给 SkeletonBox 骨架，结果区不再零反馈。
 全局 .card 壳退役——骨架块裸置；结果分节 sy-res 接 border-top 分节
 （原 padding:0/overflow:hidden 内联随壳退役，QRT 本就全出血） -->
    <div v-if="running">
      <SkeletonBox height="30px" round style="margin-bottom:var(--sp-3)" />
      <SkeletonBox v-for="i in 5" :key="i" height="20px" round style="margin-bottom:var(--sp-2)" />
    </div>
    <div v-else-if="resp" class="sy-res">
      <!-- sy-res-bar 独立行退役——视图 seg+复制钮寄居 QRT 自带工具行
 （#bar-prepend 槽，bar-left 最前；DslQueryView 同款范式），「翻页、展示形式
 统一在表格头」裁决；:hide-body（view!=='table' 时表格体隐、工具行常驻）——
 视图切换不再连工具行一起消失（RT 547 hideBody 同款平移）。 -->
      <QueryResultTable ref="resQrt" class="sy-qrt"
        :hits="resp.hits ?? []" :total="resp.total" :sortable="true"
        :storage-key="'system:' + which"
        export-name="system-index"
        :field-types="SY_TYPES"
        row-drawer
        searchable refreshable
        :hide-body="view !== 'table'"
        max-height="calc(100vh - var(--vh-offset) + 150px)"
        empty-text="查询完成但无数据" empty-hint="调整上方查询 DSL（缩小/放宽匹配条件）后点「执行」重跑"
        @refresh="run">
        <template #bar-prepend>
          <!-- G261：seg 容器 role=group+双钮 aria-pressed（776 G254/DiffEditor
 140 先例同构——键盘/读屏可达） -->
          <div class="seg" role="group" aria-label="结果展示形式">
            <button type="button" :class="{ on: view === 'table' }" :aria-pressed="view === 'table'" @click="view = 'table'">表格</button>
            <button type="button" :class="{ on: view === 'json' }" :aria-pressed="view === 'json'" @click="view = 'json'">JSON</button>
          </div>
          <!-- 裁决：宿主「复制结果 JSON」（resp 全量串，含 total/took 元信息）
 与内核 列头右键「复制整表 JSON」（矩阵、所见即所复）能力重复——宿主钮
 退役换内核同函数快捷钮（expose copyTableJson 同一收口，右键菜单项与 bar 快捷钮
 同源），保住 bar 上一键可达（内核入口在右键菜单、可发现性弱）；文案随内核口径。
 语义取舍：复制面从「resp 全量串」收口为「表格所见矩阵」——与 
 copy-table-json「所见即所复」口径一致，total/took 元信息本就在计数条/徽标可见。
 原宿主 copyResp（天罗W6 kw 快滤退役判据同款）随之退役。 -->
          <button class="btn ghost sm" style="margin-left:auto" @click="resQrt?.copyTableJson()"><Braces :size="11" /> 复制整表 JSON</button>
        </template>
      </QueryResultTable>
      <div v-show="view === 'json'" class="scroll-y" style="max-height:calc(100vh - var(--vh-offset) + 190px);padding:var(--sp-3) var(--sp-4)">
        <pre class="json-view" v-html="jsonHtml"></pre>
      </div>
    </div>
    <!-- 初始引导裸 .empty 迁 EmptyState compact（自绘图标 div 退役） -->
    <EmptyState v-else-if="!running && !loadErr" compact :icon="DatabaseZap"
      text="查询 starter 自家系统索引（目前仅剩分布式锁）" hint="默认 match_all 全量列出" />
    <!-- G259：原始 IO 弹窗（宿主受控开关；rec=最近一条 /system-query 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { RefreshCw, Play, DatabaseZap, Info, Braces, Settings2, Terminal, Loader2 } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
import { isBrowserMode } from '../platform/browserApi';
/* 两处裸 .empty 迁 EmptyState compact */
import EmptyState from '../components/EmptyState.vue';
/* 天罗W6：结果网格整表换 QueryResultTable（漏斗/tfoot 聚合/列详情/复制矩阵/导出/行导航） */
import QueryResultTable from '../components/QueryResultTable.vue';
import { friendlyEsError } from '../utils/esError';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useScopedDraft } from '../composables/useScopedDraft';
import { fmtNum } from '../utils/format';
import { highlightJson } from '../utils/jsonc';
import { useUrlState } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：sys.edH 三件套合并 */
import { useRoute, useRouter } from 'vue-router';
import MonacoEditor from '../components/MonacoEditor.vue';
import RawIoModal from '../components/RawIoModal.vue'; /* G259：原始 IO 快查弹窗（777 G255 同构） */
import SkeletonBox from '../components/SkeletonBox.vue';
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* W-D：sy-meta 统一件 */
import TookBadge from '../components/TookBadge.vue'; /* ：裸 took ms 统一耗时徽标 */
import type { BodyKind } from '../utils/dslCompletionContext';
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检 */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P0-1：划线防抖统一件 */

const store = useAppStore();

const WHICHS = [
  { k: 'lock', t: '分布式锁', sort: '' },
] as const;

/* 阶段⑤：job（重建作业）/ audit（写操作审计）两张系统索引随 SPI 重建路径退役，
 后端 systemIndexName() 只认 lock，传其余值返回 400 BAD_REQUEST（实测，非推定）。
 老书签 ?which=job|audit 必须就地回落到 lock，不能原样透传——那只会换来一条看不懂的 400。 */
const RETIRED_WHICHS: Record<string, string> = { job: '重建作业', audit: '写操作审计' };
const LIVE_WHICHS = WHICHS.map(w => w.k) as readonly string[];

const route = useRoute();
const router = useRouter();
/* 当前系统索引 tab 进 URL（?which=）——刷新/分享后停留同一张系统索引（可重入） */
const which = useUrlState('which', 'lock') as unknown as import('vue').Ref<typeof WHICHS[number]['k']>;

/* 退役视图的老书签回落：?which=job|audit 进来时就地改写为 lock 并留一条说明。
 文案只陈述事实（该视图已退役），不说「加载失败」——它没有失败，是不存在了。 */
const retiredNote = ref('');
/* 返回 true 表示发生了回落（调用方据此决定要不要重拉数据）。 */
function coerceWhich(): boolean {
  const v = String(which.value);
  if (LIVE_WHICHS.includes(v)) return false;
  const label = RETIRED_WHICHS[v];
  retiredNote.value = label
    ? `「${label}」系统索引已在 2.0.0 退役，已为你切到「分布式锁」。`
    : `系统索引「${v}」不存在，已为你切到「分布式锁」。`;
  which.value = 'lock';
  return true;
}
coerceWhich();

/* 为什么闸门锚在「导航事件」而不是任何一个「值」：
 本缺陷两次栽在同一个坑上 —— 先锚 which（回落后 lock→job→lock 绕回原值，不触发），
 再锚 route.fullPath（连点同一书签是 duplicated 导航，fullPath 压根没变，同样不触发）。
 两次都在找「哪个值会变」，而当修正会把值还原成原样时，根本不存在可观测的值变化。

 <b>触发条件是「任何一次落到本视图的导航」，与由何种方式发起无关</b> ——
 push / replace / back / 地址栏 / 书签点击 / hash 变更都算，也不论目标与当前路由是否相同
 （相同即 vue-router 的 duplicated 导航，push() 返回 NavigationFailureType.duplicated(16)，
 此时任何基于「值变了」的 watcher 全哑，但 afterEach 照常触发 —— 实测有回调）。
 <b>不要把它窄读成「只有连点 push 需要防」</b>：afterEach 锚的是「导航落定」这个事件本身，
 这正是它强于锚 which、锚 fullPath 的原因。

 还要对账 retiredNote：回落后 writeBack 会把 which=lock 从 URL 删掉（值等于默认值），
 故此后 URL 常是裸 /system。若只在「有退役值」时更新提示，用户显式回到活视图时
 上一次的提示会一直挂着 —— 界面「有提示」但数据是陈的，比空白更误导。 */
function syncFromRoute() {
  const raw = route.query.which;
  const asked = raw == null ? '' : String(raw);
  if (asked && !LIVE_WHICHS.includes(asked)) {
    /* 这里明知 asked 非法仍先赋值，是为了让 coerceWhich 成为判定与文案的唯一出处。
 代价：赋值会触发 useUrlState 的 writeBack，把死值<b>瞬时写回 URL 一拍</b>，
 随后 coerceWhich 改回 lock 时再被抹掉。功能上收敛（最终 URL 不含死值），
 但若你在此处打断点或观察 history，会看到那一瞬的 ?which=job —— 不是 bug。
 想消掉这个中间态得改成 coerceTo(asked) 形态，属重构，不做。 */
    which.value = asked as typeof which.value;
    if (coerceWhich()) { reloadAll(); return; }
  }
  /* 用户显式回到活着的视图（或裸路径）时，上一次的退役提示必须撤掉，否则会一直挂着 */
  if (!asked || LIVE_WHICHS.includes(asked)) retiredNote.value = '';
}
const stopAfterEach = router.afterEach(() => { syncFromRoute(); });
onUnmounted(stopAfterEach);
/* 只兜底判定与文案，<b>不</b>重拉：数据重载已由上面的 afterEach 全量覆盖（消融实证：
 摘掉这里的 reloadAll() 后 push/replace/dup/back 四类导航一律回到 2 发，13 条仍全绿）。
 两条路径并存不会报错，只会默默把每次退役导航做成 4 发 —— 功能上看起来完全正常。
 保留 coerceWhich() 是纵深防御：今天 WHICHS 只剩 lock、switchWhich 传不进退役值，
 但日后若有非导航路径改 which，这里仍是最后一道判定。 */
watch(which, () => { coerceWhich(); });
const info = ref<any>(null);
const loading = ref(false);
const running = ref(false);
const resp = ref<any>(null);
const loadErr = ref('');
const view = ref<'table' | 'json'>('table');

const DEFAULT_DSL: Record<string, string> = {
  lock: '{\n  "size": 50,\n  "query": { "match_all": {} }\n}',
};
/* 草稿治理补全(w24):查询 DSL 草稿(按集群目标隔离);切 which 不覆写,reset 才回默认 */
const dsl = useScopedDraft('dsl', { route: 'system',},
  DEFAULT_DSL[which.value] || DEFAULT_DSL.lock).text;

/* DSL 编辑器弹性档 + usePref 记忆（sys.edH，ubq.scriptH「高」钮三档循环同款；
 首档沿用原 max(150px,28vh) 口径零变化，档值均保 150px 下限）。
 TIERS+usePref+手写 cycle 三件套合并 useTierCycle 单源
 （sys.edH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const SYS_ED_H_TIERS = ['max(150px, 28vh)', 'max(150px, 42vh)', 'max(150px, 56vh)'];
const { v: sysEdH, cycle: cycleSysEdH } = useTierCycle('sys.edH', SYS_ED_H_TIERS);

const whichIndex = computed(() => WHICHS.find(w => w.k === which.value)?.t || '');

/* W-D：sy-meta 手写 chip 行的 MetaStrip items——文案逐字（索引/文档/mapping 读取失败），
 mapping 读取失败走 err 语义档（原 pill r 同 token 收敛） */
const syMeta = computed<MetaStripItem[]>(() => [
  { value: info.value?.name || whichIndex.value, label: '索引' },
  { value: fmtNum(info.value?.docCount ?? 0), label: '文档' },
  ...(info.value?.mappingsError ? [{ value: 'mapping 读取失败', tone: 'err' as const }] : []),
]);
/* QRT 补 fieldTypes——分布式锁索引 mapping 实地核自 EsAdhocJobStore
 MAPPING_PROPERTIES（唯一写入方，建索引即此形态）：job_id/status_name/index_name/
 target_id/target_name/target_es_version=keyword、created_ts/updated_ts=long（epoch 毫秒）、
 payload_json=text（index:false 无谓入列）。只喂显示/交互档位（数值右对齐+千分位+数值区间
 漏斗；epoch 毫秒展示层恒走 epochMsText 既有链不受影响），数据/复制/导出恒 raw */
const SY_TYPES: Record<string, string> = {
  job_id: 'keyword', status_name: 'keyword', index_name: 'keyword',
  target_id: 'keyword', target_name: 'keyword', target_es_version: 'keyword',
  created_ts: 'long', updated_ts: 'long',
};
/* lint ctx 字段表——SY_TYPES 固定表派生（系统索引 mapping 不读，
 建索引 MAPPING_PROPERTIES 即事实源）。此前 lintDsl fields 缺省=类型错配规则全跳过；
 补上后 keyword-range / range-type / unknown-field 等规则白得启用 */
const SY_LINT_FIELDS = Object.entries(SY_TYPES).map(([path, type]) => ({ path, type }));
/* ux2 ：系统索引查询窗挂 search 档（root/query-type 照出；field 档空——系统索引 mapping 不读） */
const sysAssist = { fields: (): { path: string; type: string }[] => [], bodyKind: (): BodyKind => 'search' };

/* switchWhich 已随 seg 控件退役（WHICHS 只剩 lock，没有可切换的对象） */
const inspectErr = ref('');

/* body lint 静态体检——查询窗固定 search 语义（sysAssist 同口径）；
 补 fields ctx（SY_LINT_FIELDS 固定表派生）；JSON 解析失败静默 */
const sysLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: SY_LINT_FIELDS }); } catch { return []; }
});
const sysLintErrors = computed(() => sysLint.value.filter(f => f.severity === 'error'));
const sysLintWarns = computed(() => sysLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));

/* P0-1：banner→划线双通道（既有 banner 提示条保留）——SearchSandboxView 
 范式逐字：useDebounceFn 250ms + info 降级 hint；sysLint 非法 JSON 静默返 []，setMarkers([])
 即清旧划线。 */
const sysDslMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueSysLintMarkers = useDebounceFn(() => {
  sysDslMonaco.value?.setMarkers?.(sysLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queueSysLintMarkers(); }, { immediate: true });

async function loadInspect() {
  loading.value = true;
  inspectErr.value = '';
  try { info.value = await api.systemInspect(which.value); }
  catch (e: any) {
    /* C12：失败即清旧 chip（陈旧数据比空白更误导），内联提示 + 重试承接，原 toast 保留
 A：ES 错误友好化——内联与 toast 同走 friendly 口径 */
    inspectErr.value = friendlyEsError(String(e?.message ?? e));
    info.value = null;
    store.notify('error', 'inspect: ' + friendlyEsError(String(e?.message ?? e)));
  }
  finally { loading.value = false; }
}
/* 首次挂载与回落重载走同一组动作，避免两处各自演化 */
function reloadAll() { loadInspect(); run(); }
/* 1125：/system-inspect 与 /system-query 在身份落地前拉会带旧 target；路由变化仍直调 reloadAll */
const systemBoot = useGatedBootRead('system', reloadAll);
onMounted(() => systemBoot.run());

async function run() {
  /* 在途一律忽略（闸收进函数本体才覆盖全部触发通道）：按钮 disabled 只护住钮面，
   编辑器 Ctrl+回车与表格刷新钮直达此处——并发双发交错完成时，旧包慢到会覆写新包，
   旧包失败落在后还会把新包的成功结果清成错误条 */
  if (running.value) return;
  let parsed: any;
  try { parsed = JSON.parse(dsl.value); } catch (e: any) { store.notify('error', 'DSL JSON 非法: ' + e.message); return; }
  const size = Math.min(parsed.size || 50, 100);
  running.value = true;
  loadErr.value = ''; // 入口清旧错误条：避免重试进行中与 running 骨架同屏
  try {
    resp.value = await api.systemQuery(which.value, dsl.value, size);
    loadErr.value = '';
  } catch (e: any) {
    loadErr.value = '查询失败：' + friendlyEsError(String(e?.message ?? e));
    store.notify('error', loadErr.value);
    resp.value = null;
  } finally { running.value = false; }
}
function reset() { dsl.value = DEFAULT_DSL[which.value]; }

/* G259：原始 IO 快查（777 G255 同构）——按本页查询通道端点取记录环最近一条；
 '/system-query?' 含查询串前缀，与 /system-inspect 读端点互不混淆；
 判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/system-query?');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先执行一次查询（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* 天罗W6：列推导/排序/kw 过滤/单击复制随手写网格退役——QRT hit 型自行抽列（_id + _source
 键并集）、自足排序与漏斗；：「复制结果 JSON」亦退役（换内核 copyTableJson
 快捷钮，见模板 bar-prepend 裁决注），JSON 视图高亮保留 */

const resQrt = ref<InstanceType<typeof QueryResultTable> | null>(null);

const jsonHtml = computed(() => {
  if (!resp.value) return '';
  return highlightJson(JSON.stringify(resp.value, null, 2));
});
</script>

<style scoped>
.sy { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 退役说明条：与 intro 同形制、中性色——它不是错误，不该染成 err 的红。
 margin-bottom 已删：父级 .sy 的 flex gap 已承担间距，叠加会成 22px */
.sy-retired {
  display: flex; gap: var(--sp-2); align-items: flex-start; padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs); color: var(--tx1); line-height: 1.5;
  background: var(--ac-soft); border: 1px solid var(--ac-line); border-radius: var(--r-m);
}
/* .sy-bar 随 seg 切换器退役删除（刷新按钮并入 页头） */
/* .sy-inspect-err 字排（fs-xs）与 err 色随挂 .il-hint.il-err 单源退役，
 本地只留 flex 布局锚（文本+重试钮行内排布）；margin-top 中和 il-hint 自带上距保原落位 */
.sy-inspect-err { display: flex; align-items: center; gap: var(--sp-2); margin-top: 0; }
/* W-D：.sy-meta 手写行规则随 MetaStrip 改用退役（flex/gap/值字重归组件）；查询卡 inline padding 归 token 类 */
.sy-qcard { padding: var(--sp-3) var(--sp-4); }
/* 编辑器外框退役（约定③， sq-editor/be-card-editor 同语言视图侧
 独立追加）；本卡仅 DSL 编辑器一处 Monaco，上方无卡头由卡片 padding 自承分界 */
.sy-qcard > :deep(.monaco-host) { border: none; border-radius: 0; }
/* 结果分节（原全局 .card 壳 + padding:0/overflow:hidden 内联）→ border-top 分节，
 systemQrt 锚 .sy-res-bar 与 QRT max-height 定高字面零变动 */
.sy-res { border-top: 1px solid var(--border); }
.sy-run-row { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3); }
/* lint 体检提示条样式随 561 改用 theme.css 单源 .lint-bar（原 .sy-lint 三条
 与单源逐字同值退役；err 红档 / warn+hint 黄档语义不变） */
/* G262：.sy-run-row 第二份逐字重复规则整删（772 G245 .ell/.dim 双份同族；
 本注释行占位说明，规则本体见上方唯一份） */
/* .sy-res-bar 随 seg/复制钮寄居 QRT bar-prepend 退役（scoped 规则与 900 档
 对应行同迁；结果分节 .sy-res border-top 分节保留） */
/* 天罗W6：手写网格样式（.sy-kw/.sy-cell/排序表头 hover）随换 QRT 退役——表格皮归 QRT 内建 */

/* 响应式顺带（responsive900Sweep529 口径：只加 CSS 零结构动、档内非空）——
 本页 .sy 为单列 flex 无分栏堆叠诉求（1100 档无落点，不造空壳档），900 紧凑档只收查询卡/
 结果条侧距 */
.sy-browser-note { display: flex; align-items: flex-start; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx1); font-size: var(--fs-xs); line-height: 1.6; margin-bottom: var(--sp-3); }
@media (max-width: 900px) {
  .sy-qcard { padding: var(--sp-2) var(--sp-3); }
}
</style>
