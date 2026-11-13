<template>
  <div class="rd-page">
    <div class="rd-hd">
      <PageHeader :icon="SearchCheck" title="排名侦探" subtitle="_explain 单文档诊断 · 「为什么它没排上去」 + A/B 文档打分对决">
      <template #actions>
<CurrentIdxChip />
<!-- G154：模式组容器补语义+双钮动态 pressed（739 G142 六模式钮同族） -->
<div class="rd-tabs" role="group" aria-label="诊断模式">
  <button class="rd-tab" :class="{ act: mode === 'why' }" :aria-pressed="mode === 'why'" @click="mode = 'why'; abErr = ''">
    <HelpCircle :size="12" /> Why-Not 诊断
  </button>
  <button class="rd-tab" :class="{ act: mode === 'ab' }" :aria-pressed="mode === 'ab'" @click="mode = 'ab'; whyErr = ''">
    <Swords :size="12" /> A/B 对决
  </button>
        </div>
      </template>
      </PageHeader>
      <LabNav current="/rank-debug" />
    </div>

    <div class="rd-card rd-card-ed" :style="{ height: edH }">
      <div class="rd-card-hd"><FileJson :size="12" /> Query（只需 query 部分，形如 {"query":{...}}）
        <!-- 编辑框高度三档循环钮（ra.script-h 同款形态），useTierCycle('rd.edH') 跨会话记忆 -->
        <button class="btn ghost xs" style="margin-left:auto" data-test="rd-ed-h"
          :title="'Query 编辑框高度档：' + edH" @click="cycleEdH">高</button>
        <!-- 原始 IO 快查——本页最近一次 _explain 请求/响应原文（ioRecorder 记录环；
 A/B 对决双发 Promise.all，last 取到的是后完成者——通常 B 文档，A 文档原文在环内更早记录） -->
        <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（排名侦探）" title="最近一次 _explain 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="11" /> 原始 IO</button>
      </div>
      <JsonArea ref="rdJaRef" v-model="dsl" :dsl-assist="dslAssist" :rows="6" fill @submit="runActive" />
      <!-- lintDsl 静态体检提示条（SearchSandboxView join 串形态同款，随输入实时重估，
 零阻塞不拦执行）——error 红条单列（结构必错 ES 直接拒绝），warning/hint 黄条并列；
 JSON 非法静默（JsonArea 圆点已报）。
 .rd-lint 私造三条随 561 lint-bar 单源约定改用（纯类名替换 DOM 保形，
 rd-lint 原类保留作锚与 lint-bar 并存） -->
      <div v-if="rdLintErrors.length" role="alert" class="rd-lint lint-bar lint-bar-err">
        <span>DSL 检查（错误）：{{ rdLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
      <div v-else-if="rdLintWarns.length" role="status" class="rd-lint lint-bar lint-bar-warn">
        <span>DSL 检查：{{ rdLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
      </div>
    </div>

    <!-- Why-Not 模式 -->
    <template v-if="mode === 'why'">
      <div class="rd-row">
        <label class="rd-inp grow"><span>doc _id</span>
          <input v-model="whyId" class="rd-ii wide" placeholder="要审问的文档 _id" @keyup.enter="runWhy" />
        </label>
        <!-- G153：审问钮在途窗图标旋转（disabled 既有=半合规补全；737 G132/741 G147 同族） -->
        <button class="btn primary sm" @click="runWhy" :disabled="!index || !whyId || busy">
          <Play :size="12" :class="{ spinning: busy }" /> 审问它
        </button>
      </div>
      <!-- 审问中骨架屏 -->
      <div v-if="busy" class="rd-loading">
        <SkeletonBox height="48px" round />
        <SkeletonBox height="160px" round />
      </div>
      <!-- 失败内联留存（同 verdict bad 风格）：toast 一闪而过，错误现场要可回看可重试。
 role=alert 在场（vrErr/tvErr/al-fld-err 558/561 红壳合并波同口径，
 失败反馈可被读屏播报） -->
      <div v-if="!busy && whyErr" role="alert" class="rd-verdict bad">
        <XCircle :size="16" />
        <div>
          <b>诊断失败</b>
          <div class="rd-verdict-sub">{{ whyErr }}</div>
          <div class="rd-verdict-acts">
            <button class="btn sm" @click="runWhy" :disabled="!index || !whyId || busy">重试</button>
          </div>
        </div>
      </div>
      <div v-if="!busy && whyResult" class="rd-verdict" :class="whyResult.matched ? 'ok' : 'bad'">
        <component :is="whyResult.matched ? CheckCircle2 : XCircle" :size="16" />
        <div>
          <b v-if="whyResult.matched">命中了！得分 {{ fmt(whyResult.explanation?.value) }}</b>
          <b v-else>没命中 —— 这就是它不在结果里的原因</b>
          <div class="rd-verdict-sub">
            {{ whyResult.matched
              ? '往下看打分树：哪个因子拖了后腿（贡献 % 低的就是嫌疑人）'
              : (whyResult.explanation?.description || '查询条件与该文档不匹配，检查分词/字段名/值') }}
          </div>
          <div class="rd-verdict-acts">
            <!-- 诊断结果 Markdown 复制（群聊/工单讨论直贴） -->
            <button class="btn sm ghost" @click="copyWhyMd"><ClipboardList :size="11" /> 复制诊断</button>
          </div>
        </div>
      </div>
      <div v-if="!busy && whyResult?.explanation" class="rd-card">
        <div class="rd-card-hd"><Microscope :size="12" /> 打分树</div>
        <div class="rd-tree"><ExplainTree :node="whyResult.explanation" :total="whyResult.explanation.value || 1" :depth="0" /></div>
      </div>
    </template>

    <!-- A/B 对决模式 -->
    <template v-else>
      <div class="rd-row">
        <label class="rd-inp grow"><span class="rd-a">A</span>
          <input v-model="idA" class="rd-ii wide" placeholder="文档 A 的 _id（如：排在前面的）" @keyup.enter="runAb" />
        </label>
        <label class="rd-inp grow"><span class="rd-b">B</span>
          <input v-model="idB" class="rd-ii wide" placeholder="文档 B 的 _id（如：想让它上位的）" @keyup.enter="runAb" />
        </label>
        <!-- G153：开战钮在途窗图标旋转（审问钮同款） -->
        <button class="btn primary sm" @click="runAb" :disabled="!index || !idA || !idB || busy">
          <Swords :size="12" :class="{ spinning: busy }" /> 开战
        </button>
      </div>
      <!-- 对决检索中骨架屏 -->
      <div v-if="busy" class="rd-loading">
        <SkeletonBox height="200px" round />
      </div>
      <!-- 失败内联留存（同 verdict bad 风格），与 Why-Not 路径行为一致（role=alert 562 同步） -->
      <div v-if="!busy && abErr" role="alert" class="rd-verdict bad">
        <XCircle :size="16" />
        <div>
          <b>对决失败</b>
          <div class="rd-verdict-sub">{{ abErr }}</div>
          <div class="rd-verdict-acts">
            <button class="btn sm" @click="runAb" :disabled="!index || !idA || !idB || busy">重试</button>
          </div>
        </div>
      </div>
      <div v-if="!busy && abA && abB" class="rd-duel">
        <div class="rd-duel-hd">
          <div class="rd-duel-side a" :class="{ win: scoreA >= scoreB }">
            <span class="rd-duel-tag">A</span> {{ idA }}
            <b>{{ fmt(scoreA) }}</b>
            <Trophy v-if="scoreA >= scoreB" :size="13" class="rd-trophy" />
          </div>
          <div class="rd-duel-vs">VS</div>
          <div class="rd-duel-side b" :class="{ win: scoreB > scoreA }">
            <Trophy v-if="scoreB > scoreA" :size="13" class="rd-trophy" />
            <b>{{ fmt(scoreB) }}</b>
            {{ idB }} <span class="rd-duel-tag">B</span>
          </div>
        </div>
        <div class="rd-duel-delta">
          分差 <b>{{ fmt(Math.abs(scoreA - scoreB)) }}</b>
          （{{ scoreA >= scoreB ? 'A 领先' : 'B 领先' }}
          {{ (Math.abs(scoreA - scoreB) / Math.max(scoreA, scoreB, 1e-9) * 100).toFixed(1) }}%）
          · 提示：并排对比两棵树里同名 weight(...) 节点，idf 差 → 词频分布不同；tf 差 → 出现次数不同；norm 差 → 文档长度不同
        </div>
        <div class="rd-duel-body">
          <div class="rd-card">
            <div class="rd-card-hd a-hd"><span class="rd-duel-tag">A</span> {{ abA.matched ? '打分树' : '未命中' }}</div>
            <div class="rd-tree">
              <ExplainTree v-if="abA.explanation" :node="abA.explanation" :total="abA.explanation.value || 1" :depth="0" />
              <div v-else class="rd-miss">A 未命中该查询</div>
            </div>
          </div>
          <div class="rd-card">
            <div class="rd-card-hd b-hd"><span class="rd-duel-tag">B</span> {{ abB.matched ? '打分树' : '未命中' }}</div>
            <div class="rd-tree">
              <ExplainTree v-if="abB.explanation" :node="abB.explanation" :total="abB.explanation.value || 1" :depth="0" />
              <div v-else class="rd-miss">B 未命中该查询</div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <!-- 本页原先没有任何空态：一进来只有编辑框，下方一大片空白且不告诉用户下一步做什么。
 flex:1 让它吃掉编辑器下方的剩余高度，margin:auto 只负责在其中居中。 -->
    <EmptyState v-if="!busy && !whyResult && !(abA && abB) && !whyErr && !abErr" :icon="SearchCheck" class="rd-empty-fill"
                text="尚无诊断结果"
                hint="填 doc _id 与 query 后点「审问它」；A/B 模式可并排比同一 query 对两个文档的打分" />

  <!-- 原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 explain-doc 记录） -->
  <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { SearchCheck, HelpCircle, Swords, FileJson, Play, CheckCircle2, XCircle, Microscope, Trophy, ClipboardList, Terminal } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';
import LabNav from '../components/LabNav.vue';import ExplainTree from '../components/ExplainTree.vue';
import EmptyState from '../components/EmptyState.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError'; /* ：whyErr/abErr 人话化 */
import { useIdxState } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle'; /* ：rd.edH 三件套合并 */
import { useScopedDraft } from '../composables/useScopedDraft';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest'; /* ：值位动态候选（660 范式） */
import { useLinkCarry } from '../composables/useLinkCarry'; /* ：跨页一次性值携带统一件 */
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useDebounceFn } from '../composables/useDebounceFn'; /* ：lint 划线防抖统一件 */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import JsonArea from '../components/JsonArea.vue';
import { lintDsl } from '../utils/dslLint'; /* ：DSL 静态体检 */
import SkeletonBox from '../components/SkeletonBox.vue';

const store = useAppStore();
/* 目标索引进 URL，诊断现场链接可分享 */
const index = useIdxState({ follow: true });
/* Query 接 dsl-assist——fields 闭包现调现读（DslQueryView 同范式）。
 fields() 侧惰性 ensure：补全触发才拉 mapping（挂载零请求），cache 命中后直读；
 不 await 零降级，失败仅无候选 */
const { fields: assistFields, ensure: ensureAssistFields } = useIndexFields(() => index.value);
/* fields() 惰性 ensure 退役为纯读——挂载/切索引即 ensure 已由下方 watch immediate
 承担（约定），纯读消除双通道 */
/* terms 闭包接线——索引源=index 与 fields 同源现调现读 */
const rdTerms = useTermsSuggest(() => index.value);
const dslAssist = { fields: () => assistFields.value, terms: (f: string, p: string) => rdTerms.suggestAsync(f, p) };
/* lint ctx 字段表与 dsl-assist 同源——挂载即 ensure（UpdateByQueryView immediate
 范式，只读 mapping 请求、失败零降级），fields 空=类型系规则自动跳过，零 ctx 规则始终生效 */
watch(index, () => { void ensureAssistFields(); }, { immediate: true });
/* lintDsl 静态体检（UpdateByQueryView 最简接线同款）——JSON 解析失败静默不阻塞 */
const rdLint = computed(() => {
  try { return lintDsl(JSON.parse(dsl.value || ''), { fields: assistFields.value }); }
  catch { return []; }
});
const rdLintErrors = computed(() => rdLint.value.filter(f => f.severity === 'error'));
const rdLintWarns = computed(() => rdLint.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));
const mode = ref<'why' | 'ab'>('why');
const busy = ref(false);
/* DSL 进 sessionStorage 草稿——刷新不丢稿（可重入） */
/* 草稿：DSL 草稿迁 useScopedDraft（按 集群/索引 隔离），行为不变 */
const dsl = useScopedDraft('dsl', {
  route: 'rank-debug',

  index: () => index.value,
}, JSON.stringify({ query: { match: { your_field: '关键词' } } }, null, 2)).text;

/* lint findings 注入编辑器划线（SearchSandboxView 范式：debounce 250ms 防每敲一键
 全量 findMatches；info 降级 hint——MonacoEditor marker 档只收 warning/hint/error；
 下方 banner 提示条保留，双通道并存）。 */
const rdJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const queueLintMarkers = useDebounceFn(() => {
  rdJaRef.value?.setMarkers?.(rdLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(dsl, () => { queueLintMarkers(); }, { immediate: true });

/* Query 编辑框高度三档循环 + 跨会话记忆（ra.scriptH 同款形态；
 起档=原 max(260px, 42vh) 弹性档，不引入 height:100% 结构）。
 TIERS+usePref+手写 cycle 三件套合并 useTierCycle 单源
 （rd.edH 键不变=已存档位零迁移；默认档=首位，defVal 缺省；cycle 语义等值） */
const RD_ED_H_TIERS = ['max(260px, 42vh)', 'max(340px, 56vh)', 'max(440px, 72vh)'];
const { v: edH, cycle: cycleEdH } = useTierCycle('rd.edH', RD_ED_H_TIERS);

/* 原始 IO 快查（546 六页同款三件套）——/cluster/explain-doc 本页独占；
 判空 rec=null 时 notify 引导，不开空弹窗。已知限制：A/B 对决（runAb）双发同端点，
 last 只见后完成者（通常 B 文档），A 文档原文在环内更早记录 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/explain-doc');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

const whyId = ref('');
const whyResult = ref<any>(null);
const whyErr = ref(''); // 审问失败全文，内联错误条留存

const idA = ref('');
const idB = ref('');
const abA = ref<any>(null);
const abB = ref<any>(null);
const abErr = ref(''); // 对决失败全文，内联错误条留存
const scoreA = computed(() => Number(abA.value?.explanation?.value) || 0);
const scoreB = computed(() => Number(abB.value?.explanation?.value) || 0);

function fmt(v: any) {
  const n = Number(v);
  return isFinite(n) ? n.toFixed(4) : '-';
}

/* ═══ ：诊断结果复制（Markdown）——「这个文档为什么排第一」的讨论发生在群里，
 打分树缩进文本 + verdict 一次带走。 ═══ */
function explainTreeMd(node: any, depth = 0): string[] {
  const lines: string[] = [];
  if (!node) return lines;
  const indent = '　'.repeat(depth);
  const pct = node.value != null ? `（${fmt(node.value)}）` : '';
  lines.push(`${indent}- ${node.description || '因子'} ${pct}`.trim());
  for (const d of node.details || []) lines.push(...explainTreeMd(d, depth + 1));
  return lines;
}
async function copyWhyMd() {
  if (!whyResult.value) return;
  const w = whyResult.value;
  const head = w.matched
    ? `**命中** · 得分 ${fmt(w.explanation?.value)} · 文档 \`${whyId.value}\``
    : `**未命中** · 文档 \`${whyId.value}\``;
  const tree = w.explanation ? ['', '打分树：', ...explainTreeMd(w.explanation)] : [];
  const ok = await copyText([`排序诊断（${index.value}）：`, head, ...tree].join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? '诊断结果已复制（Markdown）' : '复制失败');
}

function parseBody(): string | null {
  try {
    const b = JSON.parse(dsl.value);
    if (!b.query) { store.notify('error', 'body 里必须有 "query" 字段'); return null; }
    return JSON.stringify({ query: b.query }); // _explain 只吃 query
  } catch (e: any) {
    store.notify('error', 'Query JSON 解析失败：' + e.message);
    return null;
  }
}

async function runWhy() {
  const body = parseBody();
  if (!body) return;
  busy.value = true;
  whyResult.value = null;
  whyErr.value = '';
  try {
    const r: any = await api.explainDoc(index.value, whyId.value.trim(), body);
    if (r?.error) throw new Error(r.message);
    whyResult.value = r;
  } catch (e: any) {
    /* ES 错误友好化（实验面板同款口径）。本错误条为单段结构（无原文 pre 区），
 只做 friendly 化不重构结构；toast 与错误条同源并轨 */
    whyErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '诊断失败：' + whyErr.value);
  } finally { busy.value = false; }
}

async function runAb() {
  const body = parseBody();
  if (!body) return;
  busy.value = true;
  abA.value = abB.value = null;
  abErr.value = '';
  try {
    const [ra, rb] = await Promise.all([
      api.explainDoc(index.value, idA.value.trim(), body),
      api.explainDoc(index.value, idB.value.trim(), body),
    ]);
    if ((ra as any)?.error) throw new Error('A: ' + (ra as any).message);
    if ((rb as any)?.error) throw new Error('B: ' + (rb as any).message);
    abA.value = ra;
    abB.value = rb;
  } catch (e: any) {
    /* ES 错误友好化（whyErr 同款口径），toast 与错误条同源并轨 */
    abErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '对决失败：' + abErr.value);
  } finally { busy.value = false; }
}

/* 主编辑器 Ctrl+Enter（JsonArea submit 透传）——按当前模式分发既有执行函数。
 busy 期间与 id 未填时静默 no-op（与执行按钮 :disabled 语义一致，不另弹 toast 打扰） */
function runActive() {
  if (busy.value) return;
  if (mode.value === 'why') { if (whyId.value.trim()) void runWhy(); }
  else if (idA.value.trim() && idB.value.trim()) void runAb();
}

/* 接收「打分解剖」送来的文档 —— 自动填入并开审。
 手写 sessionStorage getItem→removeItem→JSON.parse 三连换 useLinkCarry 统一件
 （key='rankdebug'，键名前缀由统一件拼装，payload {index,id,query} 与旧稿逐字保持；
 receive 先焚再解，语义等价，消费端零感），其余解析分支原样。 */
const rankDebugCarry = useLinkCarry<{ index?: string; id?: string; query?: string }>('rankdebug');
/* 1125：联动的文档可能来自上一账号的现场——身份未落地就 runWhy 会把旧 target 的
   explain 结果拉进新会话。payload 先暂存，门放行才消费；未放行等身份落地补跑。 */
let rankDebugPendingCarry: { index?: string; id?: string; query?: string } | null = null;
function applyRankDebugCarry(p: { index?: string; id?: string; query?: string }) {
  if (p.index) index.value = p.index;
  if (p.query) {
    try {
      const b = JSON.parse(p.query);
      if (b.query) dsl.value = JSON.stringify({ query: b.query }, null, 2);
    } catch { /* query 不合法就用默认模板 */ }
  }
  if (p.id) {
    mode.value = 'why';
    whyId.value = p.id;
    if (index.value) runWhy();
  }
}
const rankDebugBootGate = useGatedBootRead('rank-debug', () => {
  const p = rankDebugPendingCarry;
  if (!p) return;
  rankDebugPendingCarry = null;
  applyRankDebugCarry(p);
});
onMounted(() => {
  const p = rankDebugCarry.receive();
  if (!p) return;
  if (!rankDebugBootGate.allowed()) { rankDebugPendingCarry = p; rankDebugBootGate.run(); return; }
  applyRankDebugCarry(p);
});
</script>

<style scoped>
/* min-height:100% 让页面吃满 .page 可滚区（默认只有内容高，实测下方空出 662px 纯死白） */
.rd-page { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 100%; }
.rd-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
/* 删页头旧壳标题/副题两条死规则（页头已由 PageHeader 接管，模板 0 引用）；
 G152：旧壳左组/图标/右组三死规则随批清收（PageHeader 合并族漏删
 第 13 演，模板 0 引用；713 G53/737 G131/739 G140 先例链） */
/* rd-tabs 容器框退役（约定④，dq-sw 先例：去 bg2+border+radius 容器条框，
 内容直贴）；tab 本身控件语义/act 态保留 */
.rd-tabs { display: flex; gap: var(--sp-1); }
.rd-tab { display: inline-flex; align-items: center; gap: 5px; border: none; background: transparent; color: var(--tx1); font-size: var(--fs-xs); padding: 5px var(--sp-3); border-radius: var(--r-s); cursor: pointer; transition: all var(--tr); font-family: var(--font); }
.rd-tab:hover { color: var(--tx0); }
.rd-tab.act { background: var(--bg3); color: var(--tx0); font-weight: 600; box-shadow: var(--shadow-s); }
.rd-inp { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-xs); }
.rd-inp.grow { flex: 1; min-width: 220px; }
.rd-ii { padding: var(--sp-1) var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-s); background: transparent; color: inherit; font-size: var(--fs-sm); width: 160px; }
.rd-ii.wide { flex: 1; width: auto; }
/* 字重 800→600（控件强调档）；-soft 并入 var()——原 var(--x)-soft 非法、
 整条声明被解析器丢弃，徽标实际无底色 */
.rd-a, .rd-b { font-weight: 600; padding: 1px 7px; border-radius: var(--r-xs); }
.rd-a { background: var(--dv-blue-soft); color: var(--dv-blue); }
.rd-b { background: var(--dv-pink-soft); color: var(--dv-pink); }
.rd-row { display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; }
/* 工作台分节壳（border+radius）退役（四刀约定③④）——内容直贴，分界由 .rd-card-hd
 既有 border-bottom 承接（SqlBridge 535 先例）；A/B 对比两子卡嵌套随之根治；overflow 防撑破
 骨架保留（结构语义非 chrome） */
.rd-card { overflow: hidden; }
/* flex:1 吃掉编辑器下方的剩余高度（margin:auto 只负责在其中居中）——
 只写 margin:auto 时空态仍是内容高，下方留一大片死白。 */
.rd-empty-fill { flex: 1; margin: auto; }
/* 只有 Query 卡片吃剩余高度：.rd-card 也用于打分树卡片，那些必须按内容高，
 否则未命中时一张空卡被拉成整屏。原编辑框 123px、下方 662px 死白。
 min-height:200px 让打分树出现后编辑框被压缩也仍可用。 */
/* 复盘：只写 flex:1 会让编辑器吃掉整屏富余高度 —— 实测 747px，
 内容仅 7 行、框内 17% 是空白。DSL 通常十几行，420px 足够；
 上限之外的高度回流给下方结果区，这才是「编辑框够用 + 页面不留死白」的平衡。 */
/* 编辑器高度跟随内容、不固定撑高：flex:none + min-height 保底 + max-height 封顶。
 实测 flex:1 会把它钉在上限（354px）而 DSL 只有 7 行，框内约 200px 是空白——
 那是把「框太小」换成了「框内虚高」。余量交给下方结果区/空态。 */
/* 固定 260px：flex:none 会让外层卡片收缩，而内层 :deep(.ja-ta) 带 min-height:0，
 两者打架时 textarea 跌到 134px（比 min-height:200px 还小）。给定高度消除歧义，
 内容更长时编辑器内部滚动；下方结果区/空态用 flex:1 吃掉余量。 */
/* 定高改弹性档——max() 保留 260px 实测下限（见上），42vh 跟随视口，矮窗口不再局促。
 弹性档升三档循环（RD_ED_H_TIERS，useTierCycle('rd.edH') 记忆），高度经模板 :style
 内联，本规则只留布局骨架——不引入 height:100% 结构 */
.rd-card-ed { display: flex; flex-direction: column; flex: none; }
/* JsonArea 自身已是 flex 纵向容器；只在本视图内接线让它随卡片长高，不改共享组件 */
.rd-card-ed :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }
.rd-card-hd { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-2) var(--sp-2h); font-size: var(--fs-xs); font-weight: 650; border-bottom: 1px solid var(--border); }
/* 删 .rd-ta 死定高规则（模板已用 JsonArea，0 引用） */
.rd-loading { display: flex; flex-direction: column; gap: var(--sp-2); }
.rd-verdict { display: flex; align-items: flex-start; gap: var(--sp-2h); padding: var(--sp-3) 14px; border-radius: var(--r-m); font-size: var(--fs-sm); }
.rd-verdict.ok { background: var(--ok-soft); color: var(--ok); border: 1px solid var(--ok-line); }
.rd-verdict.bad { background: var(--err-soft); color: var(--err); border: 1px solid var(--err-line); }
.rd-verdict-sub { font-size: var(--fs-xs); opacity: .8; margin-top: 3px; color: var(--fg); white-space: pre-wrap; word-break: break-word; } /* ：删死 fallback */
.rd-verdict-acts { margin-top: var(--sp-2); }
/* 480px 定高改弹性档——42vh 跟随视口（.rd-card-ed 同款 max() 口径），
 矮窗口保 280px 下限不扁塌、高屏多吃空间；打分树超限内滚不变 */
.rd-tree { padding: var(--sp-2); max-height: max(280px, 42vh); overflow: auto; }
.rd-duel { display: flex; flex-direction: column; gap: var(--sp-2h); }
.rd-duel-hd { display: flex; align-items: center; gap: var(--sp-3); }
.rd-duel-side { flex: 1; display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2h) 14px; border-radius: var(--r-m); border: 1px solid var(--border); font-size: var(--fs-sm); font-family: var(--mono); } /* ：删死 fallback */
.rd-duel-side.a { justify-content: flex-start; }
.rd-duel-side.b { justify-content: flex-end; }
.rd-duel-side.win { border-color: var(--warn); background: var(--warn-soft); }
/* 15px 归档裁决=A/B 侧卡得分数字（mono 已由父级 .rd-duel-side 提供），视觉贴近小标题档
 取 --fs-lg(14px)；--fs-xl(16px) 是页头档会撑高侧卡。裸 b 默认 bold≈700 越过 650 上限，补显式 650。
 .rd-duel-delta b（分差数字徽标）同步归 650 */
.rd-duel-side b { font-size: var(--fs-lg); font-weight: 650; }
/* 字重 800→600（控件强调档）；-soft 并入 var()（同 .rd-a/.rd-b 修复） */
.rd-duel-vs { font-weight: 600; opacity: .5; font-size: var(--fs-md); }
.rd-duel-tag { font-weight: 600; padding: 1px 7px; border-radius: var(--r-xs); font-size: var(--fs-xs); }
.rd-duel-side.a .rd-duel-tag, .a-hd .rd-duel-tag { background: var(--dv-blue-soft); color: var(--dv-blue); }
.rd-duel-side.b .rd-duel-tag, .b-hd .rd-duel-tag { background: var(--dv-pink-soft); color: var(--dv-pink); }
.rd-trophy { color: var(--warn); }
.rd-duel-delta { font-size: var(--fs-xs); opacity: .75; line-height: 1.5; }
.rd-duel-delta b { font-weight: 650; } /* ：分差数字徽标归 650（裸 b 默认 bold≈700 越轨同步） */
.rd-duel-body { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2h); align-items: start; }
.rd-miss { padding: 20px; text-align: center; font-size: var(--fs-sm); opacity: .55; }
@media (max-width: 1100px) { .rd-duel-body { grid-template-columns: 1fr; } }

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——对擂双列堆叠已由 1100 档
 合并，此处对擂头与裁决条允许换行、侧卡/裁决条侧距收窄（工具行 .rd-row 已自带 wrap） */
@media (max-width: 900px) {
  .rd-duel-hd { flex-wrap: wrap; }
  .rd-verdict { padding: var(--sp-2) var(--sp-2h); } /* ：10px → var(--sp-2h) 精确等值收口 */
  .rd-duel-side { padding: var(--sp-2h) var(--sp-2h); } /* ：10px → var(--sp-2h) 精确等值收口 */
}
</style>
