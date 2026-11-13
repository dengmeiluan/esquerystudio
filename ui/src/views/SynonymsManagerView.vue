<template>
  <div class="sy-page">
    <div class="sy-hd">
      <PageHeader :icon="BookText" title="同义词字典" subtitle="ES 7.10 走 index-level inline synonym_graph filter · 支持逗号/箭头两种语法">
      <template #actions>
<!-- 页内 IndexPicker 退役换只读 CurrentIdxChip（W1 件：无 props 自读 store、空不渲染）——
 选索引入口收敛 TopBar 唯一处；useIdxState follow 档零改（index 跟随顶栏，watch 照常自动 doLoad） -->
<CurrentIdxChip />
<button class="btn ghost sm" @click="doLoad" :disabled="!index || busy">
  <RefreshCw :size="12" :class="{ spinning: busy }" /> 加载
</button>
<!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串取写通道 '/cluster/synonyms-upsert'——GET analysis-settings 被
 Analysis/Mapping/Analyze 三页污染，548 MappingDesigner '/cluster/mapping-put' 同先例勿用） -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（同义词下发）" title="最近一次同义词字典下发请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
  <Terminal :size="12" /> 原始 IO
</button>
      </template>
      </PageHeader>
</div>

    <!-- 只读身份的前置说明：下发/热重载钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps && !canReload" class="sy-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：同义词的下发/热重载不可用；需要集群同义词写权限。
    </div>

    <div class="sy-note">
      <Info :size="12" />
      <div>
        <b>ES 7.10 限制：</b>暂无独立 <code>_synonyms</code> API（8.10+ 才有）。此处走 <b>index-level inline filter</b>，
        更新后自动 <code>close→PUT→open</code>，如果字段用 <code>search_analyzer</code> 引用了本 filter，可以点「热重载」立即生效。
      </div>
    </div>

    <!-- 1fr 1fr 双栏等分 → 中缝 11px SplitHandle 占位列（TemplatesView 范式），
 左宽走 --sy-left-w（默认两栏等分，0=自动），pref 键 synonyms.leftW 跨会话记忆 -->
    <div class="sy-grid" :style="syLeftW > 0 ? { '--sy-left-w': syLeftW + 'px' } : undefined">
      <div class="sy-card">
        <div class="sy-card-hd">
          <span>字典配置</span>
        </div>
        <div class="sy-form">
          <label class="sy-lb"><span>filter 名</span>
            <!-- 裸 input 挂 datalist——候选=本次加载 settings 里的同义词 filter id
 清单（doLoad 原本只回填首个，多 filter 时可下拉直选；未加载/无候选零扰动） -->
            <input v-model="filterName" class="sy-ii" placeholder="custom_synonyms" list="sy-filter-ids" />
            <datalist id="sy-filter-ids">
              <option v-for="fid in loadedFilterIds" :key="fid" :value="fid" />
            </datalist>
            <span v-if="filterNameErr" role="alert" class="sy-lint-err">{{ filterNameErr }}</span>
          </label>
          <label class="sy-lb"><span>展开模式 (expand)</span>
            <select v-model="expand" class="sy-ii">
              <option :value="true">true（双向：a=b 时 a→b 且 b→a）</option>
              <option :value="false">false（只保留左边）</option>
            </select>
          </label>
          <label class="sy-lb"><span>词典规则（每行一条）</span>
            <MonacoEditor ref="ruleEdRef" v-model="raw" language="synonyms" height="100%" class="sy-rule-ed" />
          </label>
          <!-- +1：坏行 lint 提示挂统计条旁（warn 档）——有坏行时「下发」禁用 -->
          <div class="sy-stat">
            已解析 <b>{{ parsed.length }}</b> 条 · 忽略 <b>{{ skipped }}</b> 行
            <span v-if="badLines.length" role="status" class="sy-lint">
              <AlertTriangle :size="11" /> {{ badLines.length }} 行有问题：<span v-for="(b, i) in badLines" :key="i" class="sy-lint-item">第 {{ b.line }} 行 {{ b.reason }}</span>
            </span>
            <!-- 坏行纠错建议（「怎么改」与 badLines「哪错了」互补；只对确定
 可修形态说话——全角标点给半角改写结果/=> 右项缺失给补法/分隔符混用给裁决
 口径；拿不准不说话，纯函数单源 utils/inputAdvice.synonymFixHint） -->
            <span v-if="badFixHints.length" role="status" class="sy-lint">
              <Lightbulb :size="11" /> 纠错建议：<span v-for="(f, i) in badFixHints" :key="i" class="sy-lint-item">第 {{ f.line }} 行{{ f.hint }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 分栏拖拽柄（TemplatesView 同范式：双击/R 键重置回等分，窄屏柄隐堆叠） -->
      <SplitHandle axis="vertical" :size="syLeftW > 0 ? syLeftW : 340" :min="220" :max="2000"
        label="配置/预览分栏" class="sy-split"
        @resize-end="(s: number) => syLeftW = clampSyW(s)" @reset="syLeftW = 0" />

      <div class="sy-card">
        <div class="sy-card-hd">
          <span>预览（下发 body）</span>
          <div class="sy-hd-r">
            <button v-if="canReload" class="btn ghost sm" @click="doReload" :disabled="!index || busy">
              <Zap :size="12" :class="{ spinning: busy }" /> 热重载
            </button>
            <button v-if="canOps" class="btn primary sm" :disabled="!index || !parsed.length || busy || saveBlockReason !== ''"
                    :title="saveBlockReason || '下发并热重载'" @click="doSave">
              <Send :size="12" /> 下发 & 重载
            </button>
          </div>
        </div>
        <!-- D：裸 JSON 换 highlightJson（previewBody 已是 pretty 串，着色 + json-view 全局范式） -->
        <pre class="sy-preview json-view" v-html="highlightDslJson(previewBody)"></pre>

        <div class="sy-tips">
          <div class="sy-tips-tt">怎么在字段上用它？</div>
          <pre class="sy-hint">{
  "properties": {
    "content": {
      "type": "text",
      "analyzer": "ik_max_word",
      "search_analyzer": "my_search_analyzer"
    }
  }
}

<span class="sy-comment">// analysis 里定义 analyzer 引用本 filter</span>
{
  "analysis": {
    "analyzer": {
      "my_search_analyzer": {
        "tokenizer": "ik_max_word",
        "filter": ["lowercase", "{{ filterName }}"]
      }
    }
  }
}</pre>
        </div>
      </div>
    </div>

    <div v-if="log.length" class="sy-card">
      <div class="sy-card-hd">操作日志</div>
      <div class="sy-log">
        <div v-for="(l, i) in log" :key="i" :class="['sy-log-r', 'lv-' + l.lv]">
          <span class="sy-log-t">{{ l.t }}</span>
          <span class="sy-log-m">{{ l.m }}</span>
          <a v-if="l.retry" class="sy-log-retry" href="#" @click.prevent="doLoad">重试</a>
        </div>
      </div>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/synonyms-upsert 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { BookText, RefreshCw, Info, Send, Zap, AlertTriangle, Terminal, Lightbulb, Shield } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import { useAppStore } from '../stores/app';
import { useGatedBootRead } from '../composables/usePageIdentityGate';
import { useAuthStore } from '../stores/auth';
import { useIdxState, usePref } from '../composables/urlState';
import { useScopedDraft } from '../composables/useScopedDraft';
import { askConfirm } from '../composables/confirm';
import { fmtTime } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
/* 下发 body 语义分档高亮（analysis/filter/type 等 ANALYSIS_PARAM_ZH
 语义键命中 j-clause 档；textContent 与 highlightJson 逐字一致零扰动） */
import { highlightDslJson } from '../utils/jsonc';
/* 坏行纠错建议单源（见 badFixHints） */
import { synonymFixHint } from '../utils/inputAdvice';
/* IndexPicker 退役换只读 CurrentIdxChip + 分栏 SplitHandle（pref 走 urlState） */
import CurrentIdxChip from '../components/CurrentIdxChip.vue';
import SplitHandle from '../components/SplitHandle.vue';
import MonacoEditor from '../components/MonacoEditor.vue';

const store = useAppStore();
/* 权限门禁——同义词下发/热重载=/cluster/synonyms-upsert|reload-analyzers=CLUSTER 档（rank3+）；
 编辑/解析/预览全角色可用 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/synonyms-upsert', store.target));
/* 热重载实调 /cluster/reload-analyzers（属 analysis-settings 页）——与下发分属两端点，各自判门 */
const canReload = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/reload-analyzers', store.target));

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/synonyms-upsert');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState({ follow: true });
/* 双栏比例可调（synonyms.leftW，0=两栏等分）——中缝 SplitHandle 拖拽 +
 usePref 跨会话记忆（TemplatesView 同范式） */
const syLeftW = usePref('synonyms.leftW', 0);
function clampSyW(s: number) { return Math.round(Math.min(2000, Math.max(220, s))); }
const filterName = ref('custom_synonyms');
/* 已加载的同义词 filter id 清单（datalist 候选源，doLoad 随载随填、加载前清空） */
const loadedFilterIds = ref<string[]>([]);
const expand = ref(true);
/* 同义词全集进草稿——多行手工维护的内容切页/刷新不丢（空串恢复示例稿） */
const raw = useScopedDraft('raw', { route: 'synonyms' }, `# 示例
elasticsearch, es, elastic search
数据库, database, db
car, auto, automobile
# 单向替换
苹果 => apple, iphone`).text;
const busy = ref(false);
const skipped = ref(0);
const log = ref<{ t: string; lv: string; m: string; retry?: boolean }[]>([]);

function pushLog(lv: string, m: string, retry = false) {
  log.value.unshift({ t: fmtTime(Date.now()), lv, m, retry });
  if (log.value.length > 20) log.value.pop();
}

const parsed = computed(() => {
  const lines = raw.value.split(/\r?\n/);
  let sk = 0;
  const out: string[] = [];
  for (const ln of lines) {
    const s = ln.trim();
    if (!s || s.startsWith('#')) { sk++; continue; }
    out.push(s);
  }
  skipped.value = sk;
  return out;
});

/* +1：规则行级 lint——坏行列表（行号 1 基 + 原因），九类硬错（ 4→9）：
 ① 无「,」也无「=>」（ES 解析不了，close→PUT→open 失败会让索引停在关闭态）；
 ② 左侧词表为空；③ 整行重复；④ 超 80 字符的超长 token；
 ⑤ 中文标点（：或全角 ＝）——ES 语法分隔符只有半角，全角必解析失败；
 ⑥ 「=>」右侧词元为空（单向替换缺右项）；⑦ 空词元（连续或尾随逗号）；
 ⑧ 同一条规则混用「,」与「=>」分隔符（语义不明，ES 解析结果不可预期）；
 ⑨ 词元含保留字符（" [ ] ^ ~）——lucene 语法保留符进词元会导致解析漂移。
 有坏行 = 「下发」禁用（title 说明原因），提示条挂统计条旁 warn 档，
 并同步行号直射编辑器 Warning marker（setLineMarkers，owner 'es-syn-lint'）。 */
const badLines = computed<{ line: number; reason: string }[]>(() => {
  const lines = raw.value.split(/\r?\n/);
  const seen = new Map<string, number>();
  const out: { line: number; reason: string }[] = [];
  lines.forEach((ln, i) => {
    const s = ln.trim();
    if (!s || s.startsWith('#')) return;
    const reasons: string[] = [];
    if (!s.includes(',') && !s.includes('=>')) reasons.push('既无「,」也无「=>」分隔符');
    else if (s.startsWith(',') || s.startsWith('=>')) reasons.push('左侧词表为空');
    if (/[，、：＝]/.test(s)) reasons.push('含中文标点（：或全角 ＝）');
    if (s.includes('=>') && /=>\s*$/.test(s)) reasons.push('「=>」右侧词元为空');
    if (s.split(',').slice(1).some(t => t.trim() === '')) reasons.push('存在空词元（连续或尾随逗号）');
    if (s.includes(',') && s.includes('=>')) reasons.push('同一条规则混用「,」与「=>」分隔符');
    if (/["[\]^~]/.test(s)) reasons.push('词元含保留字符（" [ ] ^ ~）');
    const prev = seen.get(s);
    if (prev != null) reasons.push(`与第 ${prev} 行重复`);
    else seen.set(s, i + 1);
    if (s.split(/,|=>/).some(t => t.trim().length > 80)) reasons.push('存在超长词条（>80 字符）');
    if (reasons.length) out.push({ line: i + 1, reason: reasons.join('；') });
  });
  return out;
});

/* 坏行同步划进规则编辑器（MonacoEditor.setLineMarkers 行号直射 Warning marker，
 绕开 setMarkers 的 findMatches 锚点定位——规则行非 JSON、无锚点键名）。computed→watch 即时
 （规则行敲完即划，无 debounce 必要）；回调包 nextTick——immediate 在 setup 期同步跑时
 ruleEdRef 尚未挂载，挂载即带坏行的草稿（KeepAlive 恢复/刷新回填）会静默漏划；
 MonacoEditor 未挂载/测试 stub 时可选链静默。 */
const ruleEdRef = ref<InstanceType<typeof MonacoEditor> | null>(null);
watch(badLines, bl => {
  void nextTick(() => {
    ruleEdRef.value?.setLineMarkers?.(bl.map(b => ({ line: b.line, message: b.reason })), 'es-syn-lint');
  });
}, { immediate: true });

/* 坏行纠错建议——按 badLines 行号回取原行喂 synonymFixHint（纯函数只对
 确定可修形态说话：全角标点/=> 右项缺失/分隔符混用；badLines 检出的重复行/超长行等
 无单一改法，不出建议宁缺毋滥）。 */
const badFixHints = computed(() => {
  const lines = raw.value.split(/\r?\n/);
  return badLines.value
    .map(b => ({ line: b.line, hint: synonymFixHint(lines[b.line - 1] || '') }))
    .filter(x => x.hint);
});

/* filter 名合法性——ES 组件名仅允许小写字母/数字/下划线（大写或非法字符会被
 close→PUT→open 直接拒绝）；空值沿用 previewBody 的 'custom_synonyms' 回落，不算错 */
const FILTER_NAME_RE = /^[a-z0-9_]+$/;
const filterNameErr = computed(() => {
  const v = filterName.value.trim();
  if (!v) return '';
  return FILTER_NAME_RE.test(v) ? '' : 'filter 名仅允许小写字母、数字、下划线';
});
/* 「下发」禁用原因（title 展示）——坏行优先，filter 名其次 */
const saveBlockReason = computed(() => {
  if (badLines.value.length) return `存在 ${badLines.value.length} 行无法解析的规则行（见统计条旁提示），修正后再下发`;
  if (filterNameErr.value) return filterNameErr.value + '，修正后再下发';
  return '';
});

const previewBody = computed(() => {
  const body = {
    analysis: {
      filter: {
        [filterName.value || 'custom_synonyms']: {
          type: 'synonym_graph',
          expand: expand.value,
          synonyms: parsed.value,
        },
      },
    },
  };
  return JSON.stringify(body, null, 2);
});

async function doLoad() {
  if (!index.value.trim()) return;
  busy.value = true;
  loadedFilterIds.value = []; /* ：datalist 候选随本次加载重算 */
  try {
    const r: any = await api.analysisSettings(index.value.trim());
    const flt = r?.analysis?.filter || {};
    /* 收集全部同义词 filter id（synonym_graph/synonym 两型）——首个仍回填表单，
 全量进 datalist 候选（原 break 首个语义零变） */
    const ids = Object.keys(flt).filter(k => flt[k]?.type === 'synonym_graph' || flt[k]?.type === 'synonym');
    loadedFilterIds.value = ids;
    const found = ids[0] ?? '';
    if (found) {
      filterName.value = found;
      const f = flt[found];
      expand.value = f.expand !== false;
      raw.value = (f.synonyms || []).join('\n');
      pushLog('ok', `已加载 filter=${found}，共 ${(f.synonyms || []).length} 条`);
    } else {
      pushLog('warn', '索引未定义 synonym_graph filter，可从零开始编辑');
    }
  } catch (e: any) { /* A：ES 错误友好化 */ pushLog('err', '加载失败：' + friendlyEsError(String(e?.message ?? e)), true); }
  finally { busy.value = false; }
}

async function doSave() {
  if (!canOps.value) { store.notify('warning', '下发同义词字典需专项角色'); return; }
  /* 2.1.6：执行体防重 */
  if (busy.value) return;
  if (!index.value.trim() || !parsed.value.length) return;
  if (!await askConfirm({
    title: '下发同义词字典',
    message: `将对索引「${index.value}」执行 close → 更新 settings → open：期间索引短暂不可读写（通常几秒），线上流量高峰期谨慎操作。`,
    okText: '下发字典',
  })) return;
  busy.value = true;
  try {
    const r: any = await api.synonymsUpsert(index.value.trim(), filterName.value.trim() || 'custom_synonyms',
      expand.value, parsed.value);
    if (r?.ok) {
      pushLog('ok', `下发成功 · 步骤：${(r.steps || []).join(' → ')}`);
      store.notify('success', '同义词字典已下发');
      /* 顺手热重载 */
      await doReload();
    } else {
      pushLog('warn', `下发部分完成 · 步骤：${(r.steps || []).join(' → ')}`);
      store.notify('warning', '下发部分完成，检查日志');
    }
  } catch (e: any) {
    /* A：ES 错误友好化（下发失败原因可读化） */
    pushLog('err', '下发失败：' + friendlyEsError(String(e?.message ?? e)));
    store.notify('error', '下发失败 — 请检查目标集群连接与分词器插件是否就绪');
  } finally { busy.value = false; }
}

async function doReload() {
  if (!canReload.value) { store.notify('warning', '热重载搜索分词器需专项角色'); return; }
  if (!index.value.trim()) return;
  /* （ G66）：热重载在途守卫——起手 busy + finally 复位（与 doLoad/doSave 同款，
 修「在途窗钮不禁用、连点可重复触发 reload-analyzers」；doSave 内 await 本函数时 busy 已置位，
 复位幂等无扰动） */
  busy.value = true;
  try {
    await api.reloadAnalyzers(index.value.trim());
    pushLog('ok', '热重载 _reload_search_analyzers 完成');
    store.notify('success', '搜索分词器已热重载');
  } catch (e: any) {
    /* A：ES 错误友好化（热重载失败原因可读化） */
    pushLog('err', '热重载失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

/* 1125：索引/目标变化触发的分析配置读取同样过身份门 */
const synBoot = useGatedBootRead('synonyms', () => doLoad(), { targetId: () => index.value || null });
watch(index, v => { if (v) synBoot.run(); });
</script>

<style scoped>
/* 根元素不再自加 padding：外层全局 .page（App.vue）已带 var(--sp-4) var(--sp-5) var(--sp-6)，
 原 12px 16px 24px 与其叠加成双层 padding，移除与多数视图取齐（同步 11c ProfileFlameView 处理） */
.sy-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
.sy-hd-r { display: flex; gap: var(--sp-1h); align-items: center; }
/* 只读身份说明条（RestView .rt-perm-note 同款形态；sy-page 无 flex gap 自补下距） */
.sy-perm-note { display: flex; align-items: center; gap: var(--sp-2); margin: 0 0 var(--sp-3); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); }
/* （ G67）：页头合并 PageHeader 后遗留的左组标题四条死规则与表单壳合并
 后遗留的表单行修饰两条死规则删（模板零元素实证，713/715/717 同族清理）；
 .sy-hd 外距锚、.sy-hd-r 预览卡头钮组、.sy-ii 输入框为活规则保留 */
.sy-ii { background: var(--bg2); border: 1px solid var(--border); color: var(--fg); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs); font-family: var(--mono); font-size: var(--fs-sm); min-width: 180px; }
.sy-note { display: flex; gap: var(--sp-2); padding: var(--sp-2h) var(--sp-3); background: color-mix(in srgb, var(--dv-blue) 8%, transparent); border: 1px solid color-mix(in srgb, var(--dv-blue) 30%, transparent); border-radius: var(--r-s); margin-bottom: var(--sp-3); font-size: var(--fs-sm); }
.sy-note code { background: var(--bg2); padding: 1px var(--sp-1); border-radius: 3px; font-size: var(--fs-xs); }
/* 1fr 1fr 等分 → 三列（左可拖 + 11px 柄 + 右自适应）——默认两栏等分观感不变
 （左右都 minmax(0,1fr)），拖过之后 --sy-left-w 接管左宽（pref synonyms.leftW） */
.sy-grid { display: grid; grid-template-columns: var(--sy-left-w, minmax(0, 1fr)) 11px minmax(0, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-3); }
/* 工作台分节壳（bg+border+radius）退役（四刀约定③④）——内容直贴，分界由
 .sy-card-hd 既有 border-bottom 承接（SqlBridge 535 先例）；overflow 防撑破骨架保留
 （Monaco 100% 高容器的结构语义非 chrome） */
.sy-card { overflow: hidden; }
.sy-card-hd { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); display: flex; justify-content: space-between; align-items: center; }
.sy-form { padding: var(--sp-3); }
/* 词典规则编辑器弹性（原 290px 写死）：height:100% 在块流表单中不可解析，由 min-height 兜底——
 290px 原值保底，42vh 视口弹性档（与 SqlConsole/ConfigValidator 同口径），Monaco 内置 RO 自动 layout。
 (b)：编辑器外框退役并入本条（sy-card-hd 既有 border-bottom 承接分界；
 无源码锁安全并入；组件本体零触，纯视觉） */
.sy-form > .sy-lb > .sy-rule-ed { min-height: max(290px, 42vh); border: none; border-radius: 0; }
.sy-lb { display: block; margin-bottom: var(--sp-2h); font-size: var(--fs-sm); }
.sy-lb > span { display: block; color: var(--muted); margin-bottom: var(--sp-1); }
.sy-lb .sy-ii { min-width: 100%; box-sizing: border-box; }
.sy-stat { font-size: var(--fs-xs); color: var(--muted); }
/* 统计条计数数字徽标归 650（裸 b 默认 bold≈700 越过全站 650 上限约定） */
.sy-stat b { color: var(--fg); font-weight: 650; }
/* +1：规则行 lint（warn 档）与 filter 名非法（err 档）——走主题 token 体系 */
.sy-lint { display: inline-flex; align-items: baseline; gap: 3px; margin-left: var(--sp-2h); color: var(--warn); flex-wrap: wrap; }
.sy-lint svg { align-self: center; flex-shrink: 0; }
.sy-lint-item { margin-right: var(--sp-2); }
.sy-lint-item::before { content: '· '; opacity: .7; }
.sy-lint-err { display: block; margin-top: var(--sp-1); font-size: var(--fs-xs); color: var(--err); }
.sy-preview { padding: var(--sp-3); background: var(--bg2); font-family: var(--mono); font-size: var(--fs-xs); max-height: 260px; overflow: auto; margin: 0; }
.sy-tips { padding: var(--sp-2) var(--sp-3); border-top: 1px solid var(--border); background: var(--bg1); }
.sy-tips-tt { font-size: var(--fs-xs); color: var(--muted); margin-bottom: var(--sp-1); }
.sy-hint { font-family: var(--mono); font-size: var(--fs-xs); color: var(--fg); margin: 0; white-space: pre-wrap; }
.sy-comment { color: var(--ok); }
.sy-log { padding: var(--sp-2) var(--sp-3); max-height: 200px; overflow: auto; }
.sy-log-r { display: flex; gap: var(--sp-2); font-size: var(--fs-xs); padding: 3px 0; font-family: var(--mono); }
.sy-log-t { color: var(--muted); min-width: 126px; flex-shrink: 0; white-space: nowrap; }
.sy-log-r.lv-ok .sy-log-m { color: var(--ok); }
.sy-log-r.lv-warn .sy-log-m { color: var(--warn); }
.sy-log-r.lv-err .sy-log-m { color: var(--err); }
.sy-log-retry { margin-left: auto; flex-shrink: 0; color: var(--brand); cursor: pointer; }
.sy-log-retry:hover { text-decoration: underline; }

/* 窄屏塌单栏：断点值复用 IlmView/TemplatesView 既有的 1000px（柄隐藏照抄 TemplatesView） */
@media (max-width: 1100px) {
  .sy-grid { grid-template-columns: minmax(0, 1fr); }
  .sy-split { display: none; }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——双栏堆叠/柄隐藏已由
 1100 档合并，此处页头/卡头/提示条允许换行（标题+右上钮组、note 蓝条窄卡不再硬挤） */
@media (max-width: 900px) {
  .sy-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
  .sy-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }
  .sy-note { flex-wrap: wrap; }
}
</style>
