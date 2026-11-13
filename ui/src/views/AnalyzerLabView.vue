<template>
  <div class="al-page">
    <div class="al-hd">
      <PageHeader :icon="FlaskConical" title="分词实验室" subtitle="_analyze 试跑 · 多 analyzer 并排对比 · 字段一键验证（真实样本 + field 链路）">
      <template #actions>
<!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（W1 建件；选索引入口收敛
 TopBar 唯一处）。useIdxState follow 零改——顶栏换索引仍经 index ref 同步进本页，
 原 @update:model-value 清字段清单的语义由 watch(index) 承接 -->
<CurrentIdxChip />
<!-- G110：两钮在途可感知（spinning+文案切换，729 G95/731 G104 同款）；
 G113：analyzer 输入 Enter 直达该列试跑（高频两跳→一跳） -->
<button class="btn ghost sm" @click="loadFields" :disabled="!index.trim() || fieldsBusy">
  <FolderSearch :size="12" :class="{ spinning: fieldsBusy }" /> {{ fieldsBusy ? '加载中…' : '加载 text 字段' }}
</button>
<button class="btn primary sm" @click="doRunAll" :disabled="!text || busy">
  <Play :size="12" :class="{ spinning: busy }" /> {{ busy ? '试跑中…' : '全部试跑' }}
</button>
      </template>
      </PageHeader>
</div>

    <!-- 索引→text 字段清单→一键验证 -->
    <div class="al-card" v-if="fields.length">
      <div class="al-card-hd">
        <span>text 字段清单（{{ fields.length }} 个 · 点「一键验证」：拉真实样本填入 + 按 field/analyzer/search_analyzer 三链路并排）</span>
        <!-- 清单限高档位（usePref al.fieldsH，默认 280=原 CSS 写死值；
 数百 text 字段时 280px 只见一角，三档循环，al.toksH 同语言） -->
        <button class="btn ghost xs" data-al-flds-h :title="'字段清单高度档：' + alFieldsH + 'px'" @click="cycleFieldsH">高</button>
      </div>
      <div class="al-fields" :style="{ maxHeight: alFieldsH + 'px' }">
        <div v-for="f in fields" :key="f.path" class="al-field">
          <span class="al-fp">{{ f.path }}</span>
          <span class="al-fa">analyzer={{ f.analyzer || 'standard' }}</span>
          <span v-if="f.searchAnalyzer && f.searchAnalyzer !== f.analyzer" class="al-fa al-fa-s">search={{ f.searchAnalyzer }}</span>
          <button class="btn ghost xs" @click="verifyField(f)" :disabled="busy || fieldsBusy">
            <Zap :size="10" /> 一键验证
          </button>
        </div>
      </div>
    </div>

    <!-- 加载字段失败：内联错误行（原因 + 重试），不再只靠一闪而过的 toast
 （err 语义变体豁免保留——摘 al-card 类保原形，err 行内错误条非卡面）。
 补 role=alert（失败反馈可被读屏播报；类名/CSS 零触， 锚保形） -->
    <div v-else-if="fieldsError" role="alert" class="al-fld-err">
      <span class="al-fld-err-msg">加载字段失败：{{ fieldsError }}</span>
      <button class="btn ghost xs" @click="loadFields" :disabled="!index.trim() || fieldsBusy">
        <FolderSearch :size="10" /> 重试
      </button>
    </div>

    <!-- 字段清单加载/错误/空/有值四态互斥。 G111：补在途行——加载中不再
 误显「暂无字段清单」空态（ 三跑实锚在途窗空态在场=误导） -->
    <div v-else-if="fieldsBusy" class="al-busy"><span class="spinning"></span> 加载字段中…</div>

    <!-- 字段清单空态：引导先填索引再加载（ B：裸空态迁 EmptyState compact；
 空态卡整块空框纠正——「空态不留整块空框」，EmptyState 直贴） -->
    <EmptyState v-else compact :icon="FolderSearch" text="暂无字段清单" hint="填写索引后点「加载 text 字段」" />

    <div class="al-card">
      <div class="al-card-hd"><span>待分词文本</span></div>
      <!-- 高度 usePref('al.taH') 持久化——resize:vertical 拖拽结束（pointerup）读实高
 落盘，下次进页恢复；默认空串不设内联高，跟随 rows 行高（ rows 3→6：
 3 行放不下一条长句的折行，首屏信息量太薄；拖拽记忆键沿用 al.taH 不另立） -->
      <textarea v-model="text" class="al-txt" rows="6" :style="alTaH ? { height: alTaH } : undefined" @pointerup="saveTaH" placeholder="输入要分词的文本，例如 Elasticsearch 是分布式搜索引擎"></textarea>
    </div>

    <!-- C：工具行挂全局 .toolrow（theme.css），本地同构 flex 样式退役 -->
    <div class="al-toolbar toolrow">
      <span class="al-hint"><Info :size="11" /> 每列独立配置 analyzer 或自定义组合。点+加对比列</span>
      <button class="btn ghost sm" @click="addLane">
        <Plus :size="12" /> 新增对比列
      </button>
      <button class="btn ghost sm" @click="loadPresets">
        <Wand2 :size="12" /> 加载常用预设（standard/whitespace/keyword/ik*）
      </button>
      <!-- W2 批：结果区可调三件（usePref 跨会话记忆）——token 密度二档 / 结果区高度档 / lane 比例两档
 两档降为预设（点按回比例并清连续宽度），双栏日常调宽走 SplitHandle 拖拽 -->
      <span class="al-adj">
        <button class="btn ghost xs" data-al-dense :class="{ on: alDense }" :aria-pressed="alDense" title="token 紧凑密度（小字号）" @click="alDense = !alDense">紧凑</button>
        <button class="btn ghost xs" data-al-toks-h :title="'分词结果区高度档：' + alToksH + 'px'" @click="cycleToksH">高</button>
        <button class="btn ghost xs" data-al-split="half" :class="{ on: lanesClass === 'split-half' }" :aria-pressed="lanesClass === 'split-half'" title="对比列五五分（预设）" @click="presetLaneSplit('half')">五五</button>
        <button class="btn ghost xs" data-al-split="4060" :class="{ on: lanesClass === 'split-4060' }" :aria-pressed="lanesClass === 'split-4060'" title="对比列四六分（预设）" @click="presetLaneSplit('4060')">四六</button>
      </span>
    </div>

    <!-- analyzer 族四输入接原生 datalist 候选（零依赖方案）——候选源=共享表
 BUILTIN_ANALYZERS 只读消费（dslCompletionContext 单一出处，不另造漂移表）。
 自定义组合 tokenizer/char_filter/filter 三 input 改各指新 datalist
 （候选分表 BUILTIN_TOKENIZERS/CHAR_FILTERS/TOKEN_FILTERS 各归其位，不与 analyzer
 名混表）；analyzer 档 al-analyzer-opts 原名原内容保留不动。
 四表 option 挂中文释义 title（ANALYZER_COMPONENT_ZH 单源，
 表外键回落空串零扰动） -->
    <datalist id="al-analyzer-opts">
      <option v-for="a in BUILTIN_ANALYZERS" :key="a" :value="a" :title="ANALYZER_COMPONENT_ZH[a] || ''" />
    </datalist>
    <datalist id="al-tokenizer-opts">
      <option v-for="a in BUILTIN_TOKENIZERS" :key="a" :value="a" :title="ANALYZER_COMPONENT_ZH[a] || ''" />
    </datalist>
    <datalist id="al-charfilter-opts">
      <option v-for="a in BUILTIN_CHAR_FILTERS" :key="a" :value="a" :title="ANALYZER_COMPONENT_ZH[a] || ''" />
    </datalist>
    <datalist id="al-tokenfilter-opts">
      <option v-for="a in BUILTIN_TOKEN_FILTERS" :key="a" :value="a" :title="ANALYZER_COMPONENT_ZH[a] || ''" />
    </datalist>

    <!-- lane 比例连续可调——恰好双栏时 SplitHandle 纵缝拖拽（al.laneW px
 落盘，两档按钮留作预设回比例）；≥3 列改 auto-fit（split- 两档强 2 列会让第 3 列
 折行成半宽孤列）；1 列 auto-fit 不变 -->
    <div class="al-lanes" :class="lanesClass" :style="lanesStyle">
      <template v-for="(l, i) in lanes" :key="i">
      <div class="al-lane">
        <div class="al-lane-hd">
          <span class="al-lane-tt">对比列 #{{ i + 1 }}</span>
          <button aria-label="删除分词通道" class="btn ghost xs" @click="lanes.splice(i, 1)" :disabled="lanes.length <= 1">
            <X :size="11" />
          </button>
        </div>
        <div class="al-lane-form">
          <label class="al-lb"><span>模式</span>
            <select v-model="l.mode" class="al-ii sm">
              <option value="analyzer">指定 analyzer</option>
              <option value="field">按字段（field 真实写入链路）</option>
              <option value="custom">自定义组合</option>
            </select>
          </label>
          <label v-if="l.mode === 'analyzer'" class="al-lb"><span>analyzer</span>
            <input v-model="l.analyzer" class="al-ii" list="al-analyzer-opts" placeholder="standard / ik_max_word / whitespace" @keyup.enter="doRun(i)" />
          </label>
          <label v-else-if="l.mode === 'field'" class="al-lb"><span>field（需上方指定 index）</span>
            <!-- 分析字段场景 text 置顶（本页字段清单/验证链路全以 text 字段为对象） -->
            <FieldPicker :model-value="l.fieldName || ''" @update:model-value="(v: string) => l.fieldName = v" :index="index" placeholder="如 bondName / issuer.name" :type-priority="['text']" class="al-ii" />
          </label>
          <template v-else>
            <label class="al-lb"><span>tokenizer</span>
              <input v-model="l.tokenizer" class="al-ii" list="al-tokenizer-opts" placeholder="standard / whitespace / keyword / ngram" />
            </label>
            <label class="al-lb"><span>char_filter（逗号分隔）</span>
              <input v-model="l.charFilter" class="al-ii" list="al-charfilter-opts" placeholder="html_strip" />
            </label>
            <label class="al-lb"><span>filter（逗号分隔）</span>
              <input v-model="l.filter" class="al-ii" list="al-tokenfilter-opts" placeholder="lowercase, stop, asciifolding" />
            </label>
          </template>
          <!-- G110：lane 钮在途可感知（lane 级 busy 行本就在场，触发钮补 spinning 半缺） -->
          <button class="btn ghost xs" @click="doRun(i)" :disabled="!text || busy || l.busy">
            <Play :size="10" :class="{ spinning: l.busy }" /> {{ l.busy ? '分析中…' : '试跑' }}
          </button>
        </div>
        <div class="al-lane-result">
          <!-- lane 失败行补 role=alert（al-fld-err 同步口径） -->
          <div v-if="l.err" role="alert" class="al-err">{{ l.err }}</div>
          <!-- lane 级进行中态：err/busy/empty/结果四态互斥 -->
          <div v-else-if="l.busy" class="al-busy"><span class="spinning"></span> 分析中…</div>
          <!-- lane 级「尚未运行」占位合并 EmptyState compact（文案逐字保留，
 lane 窄容器走 compact 档） -->
          <EmptyState v-else-if="!l.tokens.length" compact :icon="Play" text="尚未运行 · 点「试跑」查看分词结果" />
          <!-- W2 批：token 区限高内滚（max-height 走 usePref al.toksH，默认 240=ik_max_word
 几百 token 不再撑出一两屏）+ 密度二档（紧凑=--fs-2xs）
 token 胶囊挂 tokTier type 色档（type 此前只进 :title 全列同色） -->
          <div v-else class="al-toks" :class="{ dense: alDense }" :style="{ maxHeight: alToksH + 'px' }">
            <!-- 1340：单个 token 右键——分词调试时最常干的事是「把这一个词拿走」
     （比对词表 / 贴进 term 查询 / 报给同事），此前只能整列导出 TSV 再手工挑。 -->
            <span v-for="(t, ti) in l.tokens" :key="ti" class="al-tok" :class="tokTier(t.type)" tabindex="0"
                  :title="`pos=${t.position} · offsets=${t.start_offset}-${t.end_offset} · type=${t.type}`"
                  @contextmenu.prevent.stop="openTokMenu($event, l, t)" @keydown="onTokMenuKey($event, l, t)">
              {{ t.token }}
            </span>
          </div>
          <!-- lane meta 行合并 MetaStrip 统一件（计数走 items，默认插槽承接双复制钮）。
 G112：tokens 段补中文 tip（G101 同族；铁律 F） -->
          <MetaStrip v-if="l.tokens.length" class="al-lane-meta"
            :items="[{ value: l.tokens.length, label: 'tokens', tip: '分词结果条数' }]">
            <!-- lane 结果复制（TSV=token+type 贴文档；JSON=全量 meta） -->
            <button class="btn ghost xs" style="margin-left:auto" @click="copyLaneTsv(l)" title="复制 token（TSV：token → type）">TSV</button>
            <button class="btn ghost xs" @click="copyLaneJson(l)" title="复制全量 meta JSON">JSON</button>
          </MetaStrip>
        </div>
      </div>
      <!-- 双栏纵缝（仅恰好 2 列渲染；窄屏断点 CSS 隐藏） -->
      <SplitHandle
        v-if="lanes.length === 2 && i === 0"
        axis="vertical"
        :size="alLaneW > 0 ? alLaneW : 420"
        :min="240"
        :max="1600"
        label="对比列宽度分配"
        @resize-end="(s: number) => alLaneW = clampLaneW(s)"
        @reset="alLaneW = 0"
      />
      </template>
    </div>
  </div>
  <!-- 1340：token 右键菜单（共享件；点外部/选完自关） -->
  <CellContextMenu v-if="tokMenu" :x="tokMenu.x" :y="tokMenu.y" :title="'token · ' + tokMenu.t.token"
    :items="tokMenuItems" @close="tokMenu = null" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { FlaskConical, Play, Plus, X, Info, Wand2, FolderSearch, Zap } from 'lucide-vue-next';
import { useRoute } from 'vue-router';

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import { copyText } from '../utils/format';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, ANALYZER_COMPONENT_ZH } from '../utils/dslCompletionContext'; /* ：analyzer 族四输入 datalist 候选源（共享表只读消费）；：自定义组合三件套分表同源；：组件名中文释义表（option title 单源） */
import { friendlyEsError } from '../utils/esError';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useIdxState, useUrlState, usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：al.toksH/fieldsH 三件套合并 */
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import FieldPicker from '../components/FieldPicker.vue';
import EmptyState from '../components/EmptyState.vue';
import SplitHandle from '../components/SplitHandle.vue';
import MetaStrip from '../components/MetaStrip.vue'; /* ：lane meta 行统一件 */
import { useLinkCarry } from '../composables/useLinkCarry'; /* ：跨页一次性值携带统一件 */

const store = useAppStore();

/* lane 结果复制（多列对比正是要贴文档的场景） */
async function copyLaneTsv(l: Lane) {
  const text = l.tokens.map(t => `${t.token}\t${t.type || '-'}`).join('\n');
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${l.tokens.length} tokens（TSV）` : '复制失败');
}
async function copyLaneJson(l: Lane) {
  const ok = await copyText(JSON.stringify(l.tokens, null, 2));
  store.notify(ok ? 'success' : 'error', ok ? '已复制全量 meta JSON' : '复制失败');
}

/* 1340：token 右键。一级只留最高频的「复制这个词」+ 分组父项（项目右键约定：
   一级 ≤2 个频繁动作 + 分组父项）。四个动作都只作用于**这一个 token**，
   与既有「整列 TSV / 全量 JSON」两个按钮互补而不重复。 */
const tokMenu = ref<{ x: number; y: number; t: any } | null>(null);
function openTokMenu(e: MouseEvent, _lane: any, t: any) {
  tokMenu.value = { x: e.clientX, y: e.clientY, t };
}
function onTokMenuKey(e: KeyboardEvent, _lane: any, t: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  tokMenu.value = { ...menuKeyAnchor(e), t };
}
const tokMenuItems = computed<CcmItem[]>(() => {
  const m = tokMenu.value;
  if (!m) return [];
  const t = m.t;
  const copy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    store.notify(ok ? 'success' : 'error', ok ? msg : '复制失败');
  };
  return [
    { key: 'tok-copy', label: '复制这个词', run: () => void copy(String(t.token), `已复制「${t.token}」`) },
    {
      key: 'tok-more', label: '更多…', sep: true, children: [
        { key: 'tok-meta', label: '复制词项信息（词 / 类型 / 位置 / 区间）', run: () => void copy(
          `${t.token}\t${t.type}\t${t.position}\t${t.start_offset}-${t.end_offset}`, '已复制词项信息') },
        { key: 'tok-offs', label: `复制位置区间（${t.start_offset}-${t.end_offset}）`, run: () => void copy(
          `${t.start_offset}-${t.end_offset}`, '已复制位置区间') },
        { key: 'tok-token-only', label: '复制为 JSON（{"token": "…"}）', run: () => void copy(
          JSON.stringify({ token: t.token }), '已复制 JSON') },
      ],
    },
  ];
});

/* token type → 色档 class（type 此前只进 :title 无视觉差）。
 档判据按 ES _analyze 常见 type 族：先剥 <>壳+小写，再**精确族匹配**——<ALPHANUM>
 含 'num' 字面，裸 includes 会把主流文本 token 误入数值档，故不裸 includes。
 数值族（<NUM>/number/arabic/ip/double 等）→ al-tok-num（info 档）、
 同义词族（synonym*）→ al-tok-syn（warn 档）、其余（文本/字母族主流）→ ''（默认档零迁）。 */
function tokTier(t?: string): string {
  const s = String(t ?? '').replace(/[<>]/g, '').toLowerCase();
  if (/^(num|number|pnumber|arabic|count|decimal|double|float|half_float|scaled_float|integer|long|unsigned_long|ip)$/.test(s)) return 'al-tok-num';
  if (s.includes('synonym')) return 'al-tok-syn';
  return '';
}
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
const route = useRoute();
/* →草稿：试验文本草稿迁 useScopedDraft（按集群目标隔离）——
 analyzer 可离索引跑（builtin），索引维不进 key，行为不变 */
const text = useScopedDraft('text', {
  route: 'analyzer-lab',}, 'Elasticsearch 是分布式搜索引擎').text;
/* 分词输入高度记忆（QueryXrayView qx.taH 同款 pointerup 落盘口径，偏好键 al.taH；
 默认空串不设内联高——rows=3 即历史现状，拖拽过才落盘） */
const alTaH = usePref<string>('al.taH', '');
function saveTaH(e: PointerEvent) {
  const h = Math.round((e.currentTarget as HTMLTextAreaElement).getBoundingClientRect().height);
  if (h > 0) alTaH.value = h + 'px';
}
/* W2 批：结果区可调三件（usePref 跨会话记忆）——
 密度二档（紧凑=--fs-2xs）/ token 区限高档（默认 240）/ lane 比例两档（五五/四六） */
const alDense = usePref('al.dense', false);
/* 两处三件套（TIERS+usePref+手写 cycle）合并 useTierCycle 单源（键不变=零迁移）。
 al.toksH 默认档 240 非首位（数组第二位）defVal 必显式传；al.fieldsH 默认 280 虽=首位，
 也按批次约定显式传（防档值数组前插档时默认档静默漂移）；cycle 语义等值 */
const TOKS_H_TIERS = [160, 240, 360];
const { v: alToksH, cycle: cycleToksH } = useTierCycle('al.toksH', TOKS_H_TIERS, 240);
const laneSplit = usePref<'half' | '4060'>('al.laneSplit', 'half');
/* 字段清单限高三档（usePref al.fieldsH，默认 280=原 CSS 写死值）；
 lane 双栏连续宽度（usePref al.laneW，px，0=未拖过跟随 laneSplit 预设） */
const FIELDS_H_TIERS = [280, 420, 600];
const { v: alFieldsH, cycle: cycleFieldsH } = useTierCycle('al.fieldsH', FIELDS_H_TIERS, 280);
const alLaneW = usePref('al.laneW', 0);
function clampLaneW(s: number) { return Math.round(Math.min(1600, Math.max(240, s))); }
/* 两档按钮留作预设：点按回比例档并清连续宽度（0=未拖），双栏即恢复五五/四六 */
function presetLaneSplit(v: 'half' | '4060') { laneSplit.value = v; alLaneW.value = 0; }
const busy = ref(false);

interface Lane {
  mode: 'analyzer' | 'custom' | 'field';
  analyzer: string;
  tokenizer: string;
  charFilter: string;
  filter: string;
  fieldName?: string;
  tokens: any[];
  err: string;
  busy?: boolean;
}

/* 通道配置进草稿——逐条调好的 analyzer/tokenizer 组合切页/刷新不丢（结果 tokens/err 不落盘） */
const LANES_DEF: Lane[] = [
  { mode: 'analyzer', analyzer: 'standard',    tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
  { mode: 'analyzer', analyzer: 'whitespace',  tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
  { mode: 'analyzer', analyzer: 'ik_max_word', tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
];
const lanesDraft = useScopedDraftState<Lane[]>('lanes', { route: 'analyzer-lab' }, LANES_DEF);
const lanes = computed({
  get: () => lanesDraft.state.value,
  set: (v: Lane[]) => { lanesDraft.state.value = v; },
});

/* lane 布局档——恰好 2 列：拖过（alLaneW>0）走 duo 连续宽度档（CSS 变量
 传第一列宽，窄屏断点可整条覆盖回单列），未拖走 split-half/4060 预设；1 或 ≥3 列回
 auto-fit（两档强 2 列在 ≥3 列时第 3 列折行成半宽孤列，此即孤列修正） */
const lanesClass = computed(() => {
  if (lanes.value.length !== 2) return '';
  return alLaneW.value > 0 ? 'duo' : 'split-' + laneSplit.value;
});
const lanesStyle = computed(() => (lanes.value.length === 2 && alLaneW.value > 0
  ? { '--al-lane-w': alLaneW.value + 'px' }
  : undefined));

function addLane() {
  lanes.value.push({ mode: 'analyzer', analyzer: 'keyword', tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' });
}

function loadPresets() {
  lanes.value = [
    { mode: 'analyzer', analyzer: 'standard',       tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'analyzer', analyzer: 'whitespace',     tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'analyzer', analyzer: 'keyword',        tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'analyzer', analyzer: 'simple',         tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'analyzer', analyzer: 'ik_max_word',    tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'analyzer', analyzer: 'ik_smart',       tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    { mode: 'custom',   analyzer: '',               tokenizer: 'standard', charFilter: '', filter: 'lowercase,stop,asciifolding', tokens: [], err: '' },
    { mode: 'custom',   analyzer: '',               tokenizer: 'ngram',    charFilter: '', filter: 'lowercase', tokens: [], err: '' },
  ];
  store.notify('info', '已加载 8 列常用预设');
}

async function doRun(i: number) {
  const l = lanes.value[i];
  l.err = ''; l.tokens = [];
  if (!text.value.trim()) return;
  const body: any = { text: text.value };
  if (l.mode === 'analyzer') {
    if (!l.analyzer.trim()) { l.err = '未指定 analyzer'; return; }
    body.analyzer = l.analyzer.trim();
  } else if (l.mode === 'field') {
    if (!l.fieldName?.trim()) { l.err = '未指定 field'; return; }
    if (!index.value.trim()) { l.err = 'field 模式需指定 index'; return; }
    body.field = l.fieldName.trim();
  } else {
    if (!l.tokenizer.trim()) { l.err = '未指定 tokenizer'; return; }
    body.tokenizer = l.tokenizer.trim();
    if (l.charFilter.trim()) body.char_filter = l.charFilter.split(',').map(s => s.trim()).filter(Boolean);
    if (l.filter.trim()) body.filter = l.filter.split(',').map(s => s.trim()).filter(Boolean);
  }
  l.busy = true;
  try {
    const r: any = await api.analyzeText(index.value.trim() || undefined, JSON.stringify(body));
    l.tokens = r.tokens || [];
  } catch (e: any) { /* A：ES 错误友好化（AnalyzeView 274 并轨范例同款） */ l.err = friendlyEsError(String(e?.message ?? e)); }
  finally { l.busy = false; }
}

async function doRunAll() {
  busy.value = true;
  try {
    await Promise.all(lanes.value.map((_, i) => doRun(i)));
    store.notify('success', `${lanes.value.length} 列试跑完成`);
  } finally { busy.value = false; }
}

/* ==================== ：索引→text 字段→一键验证 ==================== */
interface TextField { path: string; analyzer?: string; searchAnalyzer?: string }
const fields = ref<TextField[]>([]);
const fieldsBusy = ref(false);
const fieldsError = ref(''); // 加载失败原因，供字段卡位内联错误行展示
/* 改用 CurrentIdxChip 后页内选择器退役——「换索引清字段清单」语义由
 watch 承接（原 IndexPicker @update:model-value 内联；顶栏换索引经 follow 同步 index 即清） */
watch(index, () => { fields.value = []; fieldsError.value = ''; });

/** 从 mapping-detail 的 raw.properties 递归收集 text 字段（含 multi-field .xx） */
function collectTextFields(props: any, prefix: string, out: TextField[]) {
  if (!props) return;
  for (const [name, def] of Object.entries<any>(props)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (def?.type === 'text') {
      out.push({ path, analyzer: def.analyzer, searchAnalyzer: def.search_analyzer });
    }
    if (def?.fields) {
      for (const [sub, sdef] of Object.entries<any>(def.fields)) {
        if (sdef?.type === 'text') {
          out.push({ path: `${path}.${sub}`, analyzer: sdef.analyzer, searchAnalyzer: sdef.search_analyzer });
        }
      }
    }
    if (def?.properties) collectTextFields(def.properties, path, out);
  }
}

async function loadFields() {
  fieldsBusy.value = true;
  fieldsError.value = '';
  try {
    const r: any = await api.mappingDetail(index.value.trim());
    const out: TextField[] = [];
    collectTextFields(r?.raw?.properties, '', out);
    fields.value = out;
    if (!out.length) store.notify('info', '该索引没有 text 字段');
  } catch (e: any) {
    /* ES 错误友好化（doRun 223 行同款口径）——toast 与内联错误条同源并轨 */
    const msg = friendlyEsError(String(e?.message ?? e)) || '加载字段失败';
    store.notify('error', msg + '（可在控制台重试）');
    fieldsError.value = msg;
    fields.value = [];
  } finally {
    fieldsBusy.value = false;
  }
}

/** 从索引拉一条真实样本，取该字段值（支持 a.b.c 路径与 multi-field 父路径回退） */
async function fetchSample(fieldPath: string): Promise<string | null> {
  try {
    const dsl = JSON.stringify({ size: 5, query: { exists: { field: fieldPath } }, _source: true });
    const r: any = await api.clusterQuery(index.value.trim(), dsl, 5);
    const hits = r?.hits?.hits || [];
    for (const h of hits) {
      // multi-field（如 name.ik）取父字段值
      const segs = fieldPath.split('.');
      for (let cut = segs.length; cut >= 1; cut--) {
        let v: any = h._source;
        for (const s of segs.slice(0, cut)) v = v?.[s];
        if (v == null) continue;
        if (Array.isArray(v)) v = v.find(x => typeof x === 'string') ?? v[0];
        if (typeof v === 'string' && v.trim()) return v;
      }
    }
  } catch { /* 样本拉取失败不阻断验证 */ }
  return null;
}

/** 一键验证：真实样本填入 + field/analyzer/search_analyzer 三链路并排试跑 */
async function verifyField(f: TextField) {
  fieldsBusy.value = true;
  try {
    const sample = await fetchSample(f.path);
    if (sample) {
      text.value = sample.length > 500 ? sample.slice(0, 500) : sample;
    } else {
      store.notify('info', `未找到 ${f.path} 的真实样本，沿用当前文本`);
    }
    const ls: Lane[] = [
      { mode: 'field', analyzer: '', tokenizer: '', charFilter: '', filter: '', fieldName: f.path, tokens: [], err: '' },
      { mode: 'analyzer', analyzer: f.analyzer || 'standard', tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' },
    ];
    if (f.searchAnalyzer && f.searchAnalyzer !== f.analyzer) {
      ls.push({ mode: 'analyzer', analyzer: f.searchAnalyzer, tokenizer: '', charFilter: '', filter: '', tokens: [], err: '' });
    }
    lanes.value = ls;
    await doRunAll();
  } finally {
    fieldsBusy.value = false;
  }
}

/* 接收「查询X光」送来的词 —— 自动填入并全部试跑。
 字段级联动深链 /analyzer-lab?idx=<索引>&field=<a.b.c>——
 MappingFieldTree「字段验证」入口：加载 text 字段清单后对指定字段一键验证
 （真实样本 + field/analyzer/search_analyzer 三链路并排；嵌套 / multi-field 路径
 由 field 参数整体交给 ES 解析实际生效链，前端无需拆解） */
/* ?analyzerField=<path> 深链——MappingFieldTree 右键「analyzer 快验」落点
 （verifyField 同语义：真实样本填入+field/analyzer 三链路并排；消费即清防刷新重灌） */
const afLink = useUrlState('analyzerField');
/* 接收「查询X光」送词的手写 sessionStorage 键合并 useLinkCarry（发送侧由对方页负责） */
const analyzerCarry = useLinkCarry<{ index?: string; text?: string }>('analyzer');
/* 1125：字段快验会拉 mapping 与真实样本；身份未落地先跑会把上一账号的目标带进来。
   immediate watch 与 onMounted 的联动都改走同一门，未放行则挂起补跑。 */
const analyzerLinkBoot = useGatedBootRead('analyzer-lab', async () => {
  const path = (afLink.value || '').trim();
  if (!path) return;
  afLink.value = '';
  try {
    await verifyField({ path } as any);
    store.notify('info', '已从 Mapping 页带入字段快验：' + path);
  } catch { /* 快验失败走通道内 err 展示 */ }
});
watch(afLink, () => analyzerLinkBoot.run(), { immediate: true });

onMounted(() => {
  /* 手写「读→焚→解」接收侧换 useLinkCarry.receive() 统一件（语义等价：
 取后即焚、坏 JSON 吞掉返 null）；键名与 payload 结构逐字保持 esquerystudio.link.analyzer */
  const p = analyzerCarry.receive();
  if (p) {
    if (p.index) index.value = p.index;
    if (p.text) {
      text.value = p.text;
      doRunAll();
    }
  }
  const fq = String(route.query.field ?? '').trim();
  if (fq) {
    if (route.query.idx) index.value = String(route.query.idx);
    void consumeFieldLink(fq);
  }
});

/** 深链字段验证：加载字段清单 → 匹配 path → 走 verifyField（与「一键验证」同链路） */
async function consumeFieldLink(path: string) {
  await loadFields();
  const f = fields.value.find(x => x.path === path);
  if (!f) {
    store.notify('warning', `索引 ${index.value || '（未选）'} 没有 text 字段「${path}」，已列出全部可验证字段`);
    return;
  }
  await verifyField(f);
}
</script>

<style scoped>
.al-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
.al-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* G109：PageHeader 合并后页头左组/图标/标题/副题/右组五条死规则删
 （模板 0 引用 grep 实锚，713 G53/729 同族）——页头行活锚保留（模板唯一消费） */
/* .al-inp 壳层随 IndexPicker 退役删除（CurrentIdxChip 自带胶囊观感） */
.al-ii { background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); font-family: var(--mono); font-size: var(--fs-sm); min-width: 160px; }
.al-ii.sm { min-width: 100px; }
/* al-card 壳三件套退役 → border-top 分节（545 lc-panel 同语言；模板/高度链零动，
 分界由 al-card-hd 既有 border-bottom 承接；al-lane 对比列工作台卡豁免不在扫荡域） */
.al-card { border-top: 1px solid var(--line); padding-top: var(--sp-2); margin-bottom: var(--sp-3); }
/* 卡头 flex 化（右端可挂档位钮，如字段清单「高」档）——纯 span 卡视觉不变 */
.al-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; display: flex; align-items: center; gap: var(--sp-2); }
.al-card-hd > span { flex: 1 1 auto; }
.al-txt { width: 100%; box-sizing: border-box; background: var(--bg2); border: none; color: var(--fg); font-family: var(--mono); font-size: var(--fs-md); padding: var(--sp-2h); resize: vertical; }
/* C：.al-toolbar 基础 flex 样式由全局 .toolrow 承担，仅留与全局无关的下间距 */
.al-toolbar { margin-bottom: var(--sp-2h); }
.al-hint { display: flex; align-items: center; gap: var(--sp-1); color: var(--muted); font-size: var(--fs-xs); }
/* 孤列修正——minmax 240→320：≥3 列时 split- 两档强 2 列会让第 3 列折行成
 半宽孤列，≥3 列现统一回 auto-fit（320px 保 lane 表单/结果可读的最小宽） */
.al-lanes { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-3); }
/* lane 比例——双栏档：split-half/4060 两档按钮留作预设（中缝 11px 柄列），
 duo=SplitHandle 连续拖拽档（第一列宽走 --al-lane-w，CSS 变量让窄屏断点可整条覆盖） */
.al-lanes.split-half { grid-template-columns: minmax(0, 1fr) 11px minmax(0, 1fr); }
.al-lanes.split-4060 { grid-template-columns: minmax(0, 4fr) 11px minmax(0, 6fr); }
.al-lanes.duo { grid-template-columns: var(--al-lane-w, minmax(0, 1fr)) 11px minmax(0, 1fr); }
/* 强比例列在窄窗口（≤1100 全站标准断点）回单列堆叠——五五/四六在挤压布局里
 lane 内容不可读；auto-fit 基础档本就自适应，两档强列在堆叠断点让位；
 duo 档同让位 + 纵缝柄隐藏（单列流里竖柄无拖拽语义） */
@media (max-width: 1100px) {
  .al-lanes.split-half, .al-lanes.split-4060, .al-lanes.duo { grid-template-columns: minmax(0, 1fr); }
  .al-lanes :deep(.split-handle) { display: none; }
}
/* W2 批：结果区可调钮组 */
.al-adj { display: flex; gap: var(--sp-1); align-items: center; margin-left: auto; }
.al-adj .btn.on { background: var(--ac-soft); color: var(--ac-hi); border-color: var(--ac-line); }
/* lane 头/尾统一为「线」语言（取一）——原 .al-lane-hd「线+底色」、
 .al-lane-result「线+底色」双保险，同页 .al-card-hd 只有线；两处底色退役只留分隔线，
 与 .al-card-hd/.al-field 虚线同组（取舍：本页既有分隔语言以线为主，底色分组不保留）。
 lane 容器壳（border+card-bg+radius 三件套，豁免先例合并）
 退役 → border-top 分节承接（约定④， ar-sec 同刀）；布局骨架 overflow/flex
 保留，消费面（token 胶囊区/lane 表单）零语义变动 */
.al-lane { border-top: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; }
.al-lane-hd { display: flex; justify-content: space-between; align-items: center; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
.al-lane-tt { font-size: var(--fs-xs); color: var(--muted); font-weight: 600; }
.al-lane-form { padding: var(--sp-2) var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-1h); }
.al-lb { display: block; font-size: var(--fs-xs); }
.al-lb > span { color: var(--muted); display: block; margin-bottom: var(--sp-0); }
.al-lb .al-ii { min-width: 100%; box-sizing: border-box; }
.al-lane-result { padding: var(--sp-2h) var(--sp-3); border-top: 1px solid var(--border); min-height: 80px; }
.al-err { color: var(--err); font-size: var(--fs-xs); font-family: var(--mono); word-break: normal; overflow-wrap: anywhere; }
.al-busy { color: var(--muted); font-size: var(--fs-xs); display: flex; align-items: center; justify-content: center; gap: var(--sp-1h); }
/* .al-empty 裸占位随「尚未运行…」合并 EmptyState compact 退役，留白归组件 */
/* W2 批：token 区限高内滚（usePref al.toksH 内联 max-height，默认 240）——
 ik_max_word 几百 token 不再无限换行撑出一两屏；密度二档紧凑=全站最小字号 */
.al-toks { display: flex; flex-wrap: wrap; gap: var(--sp-1); overflow: auto; }
.al-toks.dense .al-tok { font-size: var(--fs-2xs); }
.al-tok { padding: var(--sp-0) var(--sp-1h); background: var(--ac-soft); color: var(--brand); border-radius: 3px; font-size: var(--fs-xs); font-family: var(--mono); cursor: help; }
/* token type 色档（tokTier）——数值族 info、同义词族 warn；
 只加 class 附加两档，默认档（ac-soft/brand）零迁 */
.al-tok.al-tok-num { background: var(--info-soft); color: var(--info); }
.al-tok.al-tok-syn { background: var(--warn-soft); color: var(--warn); }
.al-lane-meta { font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-2); }
/* lane meta 行合并 MetaStrip 统一件——计数 b 由统一件 .ms b（600）承担，
 原 `.al-lane-meta b` 650 局部规则随裸 b 退役（scoped 规则不命中统一件内部元素） */

/* 字段清单 */
/* 字段可能数百个：限高滚动，不全铺开顶出首屏； max-height 写死 280px 退役，
 改 useTierCycle('al.fieldsH') 档位（内联 style 绑定，默认 280=原值） */
.al-fields { display: flex; flex-direction: column; overflow: auto; }
/* B：.al-fld-empty 裸空态退役迁 EmptyState compact，本地样式同步更新删除 */
.al-fld-err { padding: var(--sp-2h) var(--sp-3); display: flex; align-items: center; gap: var(--sp-2h); font-size: var(--fs-xs); color: var(--err); }
.al-fld-err-msg { font-family: var(--mono); word-break: normal; overflow-wrap: anywhere; }
.al-fld-err .btn { margin-left: auto; flex-shrink: 0; }
.al-field { display: flex; align-items: center; gap: var(--sp-2h); padding: var(--sp-1h) var(--sp-3); border-bottom: 1px dashed var(--border); font-size: var(--fs-sm); }
.al-field:last-child { border-bottom: none; }
.al-fp { font-family: var(--mono); color: var(--fg); min-width: 200px; }
.al-fa { font-size: var(--fs-xs); color: var(--muted); font-family: var(--mono); }
.al-fa-s { color: var(--brand); }
.al-field .btn { margin-left: auto; }

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——页头/字段行窄视口
 允许换行不硬挤；lane auto-fit 的 320px 下限改 min() 钳制防极窄溢出（对比语义保留，
 900 以下随视口自然折列；强比例三档堆叠已由 1100 档合并，不在此重复） */
@media (max-width: 900px) {
  .al-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .al-hd { flex-wrap: wrap; }
  .al-lanes { grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); }
  .al-field { flex-wrap: wrap; }
}
</style>
