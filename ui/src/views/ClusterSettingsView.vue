<template>
  <div class="cs">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps" class="cs-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：集群设置的持久/动态下发不可用；需要集群设置写权限。
    </div>
    <PageHeader :icon="GaugeCircle" title="集群设置" subtitle="persistent / transient 两档集群级设置" />
    <div class="cs-bar lr-bar freeze">
      <div class="cs-bar-l lr-bar-l">
        <!-- 头部待下发 pill 换 StatusPill 统一件（530 W-D 范式）——
 tone 语义档不变（0 项 g / 有待下发 y），全局 .pill.g 挂载锚由组件内 .pill 承接 -->
        <StatusPill :tone="countDirty === 0 ? 'g' : 'y'" :label="countDirty + ' 项待下发'" />
        <!-- 手写过滤框改用 SearchFilterBar 统一件（全站第 11 胞收官；558 cd-kw-inp
 先例：v-model 接原 ref 零触、placeholder 逐字保留、Esc 清空内建对齐——本框无 Enter
 语义不接 @enter；cs-filter 落位类挂根，min() 极窄钳制同步更新） -->
        <SearchFilterBar v-model="filter" class="cs-filter" placeholder="按 key 过滤…只显示白名单 & 已改" />
        <label class="cs-chk"><input v-model="showDefaults" type="checkbox" />显示 defaults 一列</label>
        <!-- 整表复制（matrixText 内核）——TSV Excel/飞书直贴、MD 群聊直贴；
 列 Key/Persistent/Transient/Dirty（有改动标 Y），行集=当前过滤视图（所见即所复制） -->
        <button class="btn sm ghost" :disabled="busy || !groups.length" @click="copyTable('tsv')" title="复制设置表为 TSV（Excel/飞书直贴）"><Copy :size="12" /> TSV</button>
        <button class="btn sm ghost" :disabled="busy || !groups.length" @click="copyTable('md')" title="复制设置表为 Markdown（群聊/工单直贴）"><ClipboardCopy :size="12" /> MD</button>
      </div>
      <div class="cs-bar-r lr-bar-r">
        <!-- G171：下发钮在途文案切「下发中…」（busy 两钮共享同窗切换；
 纯文本钮无图标=722 spinning 口径不适用走文案通道，747 G161 族） -->
        <button v-if="canOps" class="btn sm" :disabled="!countDirty || busy" @click="apply(false)">{{ busy ? '下发中…' : '下发 persistent' }}</button>
        <button v-if="canOps" class="btn sm" :disabled="!countDirty || busy" @click="apply(true)">{{ busy ? '下发中…' : '下发 transient' }}</button>
        <button class="btn sm ghost" :disabled="busy" @click="reset">丢弃改动</button>
        <!-- 原始请求/响应快查弹窗（RawIo 第六波，558b 先例同形态；
 路径子串 '/cluster/settings'=本页 GET 读取 + PUT /put 下发同前缀，本页独占调用者） -->
        <button class="btn sm ghost" data-test="raw-io" aria-label="查看原始 IO（集群设置）" title="最近一次集群设置读取/下发请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
        <!-- G170：刷新钮守卫改绑 busy||loading——load() 只置 loading，原绑
 busy 在途零守卫可连点重入（748 S-G170 实锚 dis=false），一行刀防重入 -->
        <button class="btn sm ghost" :disabled="busy || loading" @click="load">刷新</button>
      </div>
    </div>

    <div v-if="loading" class="cs-loading">加载集群设置中…</div>
    <!-- -A2：拉取失败不渲染空壳表格，给原因与重试（对齐 MappingView 范式） -->
    <EmptyState v-else-if="loadErr" :icon="AlertTriangle" text="集群设置拉取失败" :hint="loadErr" action-text="重试" @action="load" />
    <div v-else class="cs-body">
      <!-- 设置裸表换 QRT rows 型（qrtRowsSwap529 先例，先列锚清单再动手）——
 排序/列漏斗/右键/导出归内核；分组上下文=「分组」列（分组行 .cs-grp 随壳退役，
 sweep524 锚同步更新）；编辑输入经 #cell- 槽保真（onE/revert 写路径零改）；
 脏行走 rowClass 契约；设置值 free-text 校验经 useInputLint 出 .il-hint 提示条 -->
      <QueryResultTable
        v-if="groups.length"
        :cols="csCols" :rows="csRows" sortable
        storage-key="cluster-settings"
        export-name="cluster-settings"
        :row-class="csRowClass"
      >
        <!-- cs-grp-chip 改用 StatusPill b 统一件（ac→b 映射，锚类保留落位；
 sweep524/ 字面锁同步更新） -->
        <template #cell-分组="{ value }"><StatusPill class="cs-grp-chip" tone="b" :label="String(value)" /></template>
        <template #cell-Key="{ value }">
          <span class="cs-k">
            <span class="cs-key-txt"><DotKey :k="value" :kw="filter" /></span>
            <button v-if="isDirty(value)" class="btn xxs revert" @click="revert(value)">还原</button>
          </span>
        </template>
        <template #cell-Persistent="{ row }">
          <!-- 裸 input 接集群目录——悬停 :title 出中文释义+示例（英文参数不知作用根治） -->
          <input class="cs-in mono" :value="editP[row[1]] ?? ''" @input="onE('P', row[1], ($event.target as HTMLInputElement).value)" :placeholder="pOri[row[1]] || '—'" :title="csHint(row[1])" />
          <div v-if="csLint('P', row[1])" class="il-hint" :class="csLint('P', row[1])!.level === 'err' ? 'il-err' : 'il-warn'">{{ csLint('P', row[1])!.hint }}</div>
        </template>
        <template #cell-Transient="{ row }">
          <input class="cs-in mono" :value="editT[row[1]] ?? ''" @input="onE('T', row[1], ($event.target as HTMLInputElement).value)" :placeholder="tOri[row[1]] || '—'" :title="csHint(row[1])" />
          <div v-if="csLint('T', row[1])" class="il-hint" :class="csLint('T', row[1])!.level === 'err' ? 'il-err' : 'il-warn'">{{ csLint('T', row[1])!.hint }}</div>
        </template>
        <template v-if="showDefaults" #cell-Default="{ value }"><span class="cs-def">{{ value }}</span></template>
      </QueryResultTable>
      <!-- G1-C7：白名单恒定非空，空只会是过滤致空——给提示与逃生口 -->
      <EmptyState v-if="!groups.length" compact :icon="SearchX" text="无匹配设置项" hint="设置项被关键字隐藏"
        action-text="清除过滤" @action="filter = ''" />
    </div>

    <div v-if="countDirty" class="cs-preview">
      <div class="cs-preview-hd sec-t">下发 body 预览</div>
      <!-- D：裸 JSON 换 highlightJson（previewBody 已是 pretty 串，着色 + json-view 全局范式） -->
      <pre class="mono json-view" v-html="highlightJson(previewBody)"></pre>
    </div>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /cluster/settings 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Shield, GaugeCircle, AlertTriangle, SearchX, Copy, ClipboardCopy, Terminal } from 'lucide-vue-next';
import EmptyState from '../components/EmptyState.vue';
import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环，546/548 同款） */
import RawIoModal from '../components/RawIoModal.vue';
import PageHeader from '../components/PageHeader.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：工具条过滤胶囊统一件 */
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
/* G175：showDefaults 偏好落盘（urlState usePref——esquerystudio.pref.* 键） */
import { usePref } from '../composables/urlState';

import { askConfirm } from '../composables/confirm';
import { friendlyEsError } from '../utils/esError';
import { highlightJson } from '../utils/jsonc';
import { matrixText } from '../utils/copyMatrix';
import { copyText } from '../utils/format';
import DotKey from '../components/DotKey.vue';
/* 设置裸表换 QRT rows 型 + 头部 pill 换 StatusPill 统一件（530 W-D 范式） */
import QueryResultTable from '../components/QueryResultTable.vue';
import StatusPill from '../components/StatusPill.vue';
/* 设置值 free-text 校验（现成内核 TIME_RE/patternRule，warn 级 .il-hint 提示条） */
import { useInputLint, patternRule, TIME_RE, type LintRule } from '../composables/useInputLint';
/* 集群设置键中文目录——设置行 input 悬停释义单源（零请求） */
import { CLUSTER_SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';

const store = useAppStore();
/* 权限门禁——集群 settings 下发=/cluster/settings/put=CLUSTER 档（rank3+）；
 读取/diff 预览全角色可用，编辑框对低权只读化由下发钮收口（编辑不产生副作用） */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/settings/put', store.target));
const loading = ref(true);

/* 原始 IO 三件套（RemoteClusters 557 同款）；判空不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/settings');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
const loadErr = ref('');
const busy = ref(false);
/* →749 修订（G176 注释对齐）：设置项过滤词经会话草稿保留——刷新/重进本页可复原；
 不写入 URL query，分享链接不含过滤现场（useScopedDraft 实现为 sessionStorage 草稿，
 原注释宣称 URL 深链可分享复原与实现不符已对齐，真深链留增强裁决） */
const filter = useScopedDraft('q', { route: 'cluster-settings' }, '').text;
/* G175：defaults 列开关 usePref 落盘（铁律 B 状态落盘弱形态——
 reload 后勾选保留；低频开关默认关语义不变） */
const showDefaults = usePref('cs.showDefaults', false);
const raw = ref<any>({});
const pOri = ref<Record<string, string>>({});
const tOri = ref<Record<string, string>>({});
const dfl = ref<Record<string, string>>({});
/* 草稿：两档编辑值草稿（按集群目标隔离；清空到默认 {} 即自动清稿）
 修复：此前 load() 用线上值整表覆盖 editP/editT，草稿恢复必被冲掉。
 改为草稿只存「相对线上值的编辑 diff」，load 后叠加 diff 复原编辑现场——
 线上值更新时未编辑键跟随新值，不产生假 dirty。 */
const diffP = useScopedDraftState<Record<string, string>>('edit-persistent', {
  route: 'cluster-settings',}, {}).state;
const diffT = useScopedDraftState<Record<string, string>>('edit-transient', {
  route: 'cluster-settings',}, {}).state;
const editP = ref<Record<string, string>>({});
const editT = ref<Record<string, string>>({});
function syncDiff() {
  const dp: Record<string, string> = {};
  for (const k of Object.keys(editP.value)) if ((editP.value[k] ?? '') !== (pOri.value[k] ?? '')) dp[k] = editP.value[k] ?? '';
  const dt: Record<string, string> = {};
  for (const k of Object.keys(editT.value)) if ((editT.value[k] ?? '') !== (tOri.value[k] ?? '')) dt[k] = editT.value[k] ?? '';
  diffP.value = dp; diffT.value = dt;
}

/** 高价值 key 白名单，按业务分组 */
const GROUPS = [
  {
    name: '路由与分配',
    items: [
      'cluster.routing.allocation.enable',
      'cluster.routing.allocation.disk.watermark.low',
      'cluster.routing.allocation.disk.watermark.high',
      'cluster.routing.allocation.disk.watermark.flood_stage',
      'cluster.routing.allocation.awareness.attributes',
      'cluster.routing.rebalance.enable',
    ],
  },
  {
    name: '索引级',
    items: [
      'indices.recovery.max_bytes_per_sec',
      'indices.breaker.total.limit',
      'indices.breaker.fielddata.limit',
      'indices.breaker.request.limit',
      'indices.queries.cache.size',
    ],
  },
  {
    name: '搜索与断路器',
    items: [
      'search.max_buckets',
      'search.default_search_timeout',
      'action.destructive_requires_name',
      'action.auto_create_index',
    ],
  },
  {
    name: '日志与慢查询',
    items: [
      'logger.org.elasticsearch',
      'logger.org.elasticsearch.discovery',
    ],
  },
];

/* 设置行 input 悬停 :title=目录中文释义+示例（CLUSTER_SETTINGS_CATALOG
 单源精确匹配；白名单外键回落空串零扰动。可挂 datalist 键名候选不落：本页键=行本身，
 值输入上挂键名候选语义错位，见 .spec 头注） */
function csHint(k: string): string {
  const s = CLUSTER_SETTINGS_CATALOG.find(e => e.key === k);
  return s ? `${s.desc}｜示例：${s.example}` : '';
}

function flatten(obj: any, prefix = '', out: Record<string, string> = {}) {
  if (obj == null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? prefix + '.' + k : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = String(v);
  }
  return out;
}
function setDeep(obj: any, path: string, v: any) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = v;
}
function coerce(v: string): any {
  const t = v.trim();
  if (t === '') return null;                                // null 语义 → reset
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

let loadSeq = 0;
async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const r = await api.clusterSettings();
    if (seq !== loadSeq) return;
    raw.value = r;
    pOri.value = flatten(r.persistent);
    tOri.value = flatten(r.transient);
    dfl.value = flatten(r.defaults);
    editP.value = { ...pOri.value, ...(diffP.value || {}) };
    editT.value = { ...tOri.value, ...(diffT.value || {}) };
    lintHits.value = {}; /* ：重读后编辑值回到线上值，lint 提示条一并清 */
    loadErr.value = '';
  } catch (e: any) {
    if (seq !== loadSeq) return;
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '加载失败：' + loadErr.value);
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function isDirty(k: string): boolean {
  return (editP.value[k] ?? '') !== (pOri.value[k] ?? '')
    || (editT.value[k] ?? '') !== (tOri.value[k] ?? '');
}
function onE(scope: 'P' | 'T', k: string, v: string) {
  const target = scope === 'P' ? editP.value : editT.value;
  if (v === '') delete target[k]; else target[k] = v;
  runLint(scope, k, v);
  syncDiff();
}
function revert(k: string) {
  if (pOri.value[k] !== undefined) editP.value[k] = pOri.value[k]; else delete editP.value[k];
  if (tOri.value[k] !== undefined) editT.value[k] = tOri.value[k]; else delete editT.value[k];
  delete lintHits.value['P:' + k];
  delete lintHits.value['T:' + k];
  syncDiff();
}

/* ═══ ：QRT rows 型数据映射（换壳后分组上下文=「分组」列）═══
 行序=白名单分组原序（排序/漏斗归内核只动视图）；Persistent/Transient 落当前编辑值
 （排序列所见即所排），Default 列随 showDefaults 开关同步增减（矩阵列数恒=cols 数）。 */
const csCols = computed<string[]>(() => ['分组', 'Key', 'Persistent', 'Transient', ...(showDefaults.value ? ['Default'] : [])]);
const csRows = computed<any[][]>(() =>
  groups.value.flatMap(g => g.items.map(k => showDefaults.value
    ? [g.name, k, editP.value[k] ?? '', editT.value[k] ?? '', dfl.value[k] || '—']
    : [g.name, k, editP.value[k] ?? '', editT.value[k] ?? ''])));
/* 脏行色档走 rowClass 契约（527 W-D）：tr 挂 cs-dirty，:deep 样式接管（原 .cs-row.dirty td） */
function csRowClass(row: any[]): string | undefined {
  return isDirty(row[1]) ? 'cs-dirty' : undefined;
}

/* ═══ ：设置值 free-text 校验（useInputLint 现成内核）═══
 按 key 形态路由规则（时间型键 TIME_RE / 百分比·字节 / 枚举 / 布尔），全部 warn 级——
 不阻断下发（ES 侧才是权威），只在编辑行出 .il-hint 提示条，错写值下发前可见。 */
const TIMEISH_KEY_RE = /timeout|interval|ttl|delay|duration|_time($|\.)/i;
const CS_LINT_RULES: Array<[RegExp, RegExp, string]> = [
  [/^cluster\.routing\.(allocation|rebalance)\.enable$/, /^(all|primaries|new_primaries|replicas|balanced|none)$/, '应为枚举值：all / primaries / new_primaries / replicas / balanced / none'],
  [/^logger\./, /^(TRACE|DEBUG|INFO|WARN|ERROR|OFF)$/i, '应为日志级别：TRACE / DEBUG / INFO / WARN / ERROR / OFF'],
  [/destructive_requires_name$/, /^(true|false)$/, '应为布尔值：true / false'],
  [/(watermark|breaker|queries\.cache\.size)/, /^(\d{1,3}%|\d*\.?\d+|\d+(b|kb|mb|gb|tb))$/i, '应为百分比（如 85%）、比率（如 0.85）或字节量（如 600mb）'],
  [/max_bytes_per_sec$/, /^(0|\d+(b|kb|mb|gb|tb))$/i, '应为字节量：如 50mb / 200mb（0 = 不限）'],
  [/max_buckets$/, /^-1$|^\d+$/, '应为非负整数（或 -1 不限）'],
];
/* warn 级包装（patternRule 缺省 err 档；校验器只提示不阻断） */
function csWarnRule(re: RegExp, msg: string): LintRule {
  const base = patternRule(re, msg);
  return (v) => (base(v) ? { msg, level: 'warn' } : null);
}
function csLintRulesFor(k: string): LintRule[] {
  if (TIMEISH_KEY_RE.test(k)) return [csWarnRule(TIME_RE, '时间型设置应为时长值：如 30s / 5m / 1h / 7d / -1')];
  for (const [keyRe, valRe, msg] of CS_LINT_RULES) {
    if (keyRe.test(k)) return [csWarnRule(valRe, msg)];
  }
  return [];
}
const lintHits = ref<Record<string, { hint: string; level: 'err' | 'warn' }>>({});
function runLint(scope: 'P' | 'T', k: string, v: string) {
  const key = scope + ':' + k;
  if (!v.trim()) { delete lintHits.value[key]; return; }
  const lint = useInputLint(csLintRulesFor(k));
  lint.check(v);
  if (lint.hint.value) lintHits.value[key] = { hint: lint.hint.value, level: lint.level.value || 'warn' };
  else delete lintHits.value[key];
}
function csLint(scope: 'P' | 'T', k: string) {
  return lintHits.value[scope + ':' + k];
}

const groups = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return GROUPS.map(g => ({
    name: g.name,
    items: g.items.filter(k => {
      if (q) return k.toLowerCase().includes(q);
      return true;
    }),
  })).filter(g => g.items.length);
});

const dirtyKeys = computed(() => {
  const all = new Set<string>();
  GROUPS.forEach(g => g.items.forEach(k => { if (isDirty(k)) all.add(k); }));
  return Array.from(all);
});
const countDirty = computed(() => dirtyKeys.value.length);

const previewBody = computed(() => {
  const body: any = { persistent: {}, transient: {} };
  for (const k of dirtyKeys.value) {
    if ((editP.value[k] ?? '') !== (pOri.value[k] ?? '')) {
      setDeep(body.persistent, k, coerce(editP.value[k] ?? ''));
    }
    if ((editT.value[k] ?? '') !== (tOri.value[k] ?? '')) {
      setDeep(body.transient, k, coerce(editT.value[k] ?? ''));
    }
  }
  if (!Object.keys(body.persistent).length) delete body.persistent;
  if (!Object.keys(body.transient).length) delete body.transient;
  return JSON.stringify(body, null, 2);
});

async function apply(transientOnly: boolean) {
  if (!canOps.value) { store.notify('warning', '集群设置下发需要 CLUSTER_OP/ADMIN 角色'); return; }
  const body: any = {};
  const target = transientOnly ? 'transient' : 'persistent';
  body[target] = {};
  for (const k of dirtyKeys.value) {
    const src = transientOnly ? editT.value : editP.value;
    const ori = transientOnly ? tOri.value : pOri.value;
    if ((src[k] ?? '') !== (ori[k] ?? '')) setDeep(body[target], k, coerce(src[k] ?? ''));
  }
  if (!Object.keys(body[target]).length) {
    store.notify('warning', `没有${transientOnly ? ' transient ' : ' persistent '}层的改动`);
    return;
  }
  if (!await askConfirm({
    title: '下发集群级设置',
    message: `将向 _cluster/settings 的 ${target} 层下发以下变更（影响整个集群，可再次下发置 null 回退）：\n${JSON.stringify(body, null, 2)}`,
    okText: '下发设置',
  })) return;
  busy.value = true;
  try {
    await api.putClusterSettings(JSON.stringify(body));
    store.notify('success', `${target} 已下发，重新读取`);
    await load();
  } catch (e: any) {
    /* A：ES 错误友好化——裸 message 换全站 friendlyEsError 口径 */
    store.notify('error', `${target} 下发失败：` + friendlyEsError(String(e?.message ?? e)));
  } finally {
    busy.value = false;
  }
}
function reset() {
  editP.value = { ...pOri.value };
  editT.value = { ...tOri.value };
  lintHits.value = {}; /* ：丢弃改动连带清 lint 提示条 */
  syncDiff();
}

/* 整表复制（matrixText 内核）——Key/Persistent/Transient 三值列 + Dirty 标记列
 （相对线上值有改动标 Y），行集=当前过滤视图（所见即所复制，与 TasksView copyTasksMd 同口径） */
async function copyTable(fmt: 'tsv' | 'md') {
  const rows = groups.value.flatMap(g => g.items);
  if (!rows.length) return;
  const text = matrixText({
    rows,
    cols: ['Key', 'Persistent', 'Transient', 'Dirty'],
    getVal: (k, c) =>
      c === 'Key' ? k
        : c === 'Persistent' ? (editP.value[k] ?? '')
        : c === 'Transient' ? (editT.value[k] ?? '')
        : (isDirty(k) ? 'Y' : ''),
  }, fmt);
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 项设置（${fmt.toUpperCase()}）` : '复制失败');
}

onMounted(load);
</script>

<style scoped>
/* G1-C12：区块级间距落梯 --sp token（控件内 padding 与亚阶梯微调不动） */
.cs { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; }
.cs-bar {padding: var(--sp-3) var(--sp-4);}
/* 下限挂 min(210px,100%) 钳制（AliasesView min(400px,100%) 同款先例）——
 485/375 窄档裸 210px 下限撑破工具行，min() 让输入框在极窄容器收缩到 100% */
/* 类随改用挂 SearchFilterBar 根——手写输入框皮（bg2 底/bd 边/6px 圆角）退役归
 组件 .sfb 胶囊壳单源，本类只留落位（min() 极窄钳制同步更新，smallScreenFloor547 锁面）与内衬 */
.cs-filter { padding: 3px var(--sp-2); font-size: var(--fs-sm); min-width: min(210px, 100%); }
.cs-chk { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; }
.cs-body { padding: 0; overflow: auto; flex: 1; }
/* 空态钮位移死规则删除——本页换 EmptyState/QRT 壳后模板 empty 类零引用 */
/* scoped 表格样式全家（旧 cs 表格类系/.cs-grp td/.cs-row 系）随换 QRT 壳退役
 （表头/行语言归内核单一出处）；分组上下文改「分组」列 chip（原分组行语言同步更新：650/ac 淡底） */
/* .cs-grp-chip 650/ac-soft 私造规则随 StatusPill b 改用退役（色档归 .pill 单源，锚类保留落位） */
/* 脏行色档随 rowClass 契约挂内核 tr（deep 穿透子组件；原 .cs-row.dirty td 同值同步更新） */
.cs-body :deep(tr.cs-dirty td) { background: color-mix(in oklab, var(--wn) 8%, transparent); }
.cs-k { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
/* break-all 词中撕裂改 DotKey 点后断行 */
.cs-key-txt { min-width: 0; }
.cs-in { width: 100%; background: var(--bg2); color: var(--tx0); border: 1px solid var(--bd); border-radius: 5px; padding: 3px var(--sp-1h); font-size: var(--fs-xs); }
.cs-in:focus { border-color: var(--ac); outline: none; }
.cs-def { color: var(--tx2); }
.cs-loading { padding: var(--sp-6); text-align: center; color: var(--tx2); }
/* 240px 定高 → 42vh 弹性档，max(240px,…) 保底不降 */
.cs-preview { padding: var(--sp-3) var(--sp-4); max-height: max(240px, 42vh); overflow: auto; }
/* W-F：弱分节标题挂全局 .sec-t（fs-sm/600/tx1 归位），本地排版本地声明退役（口径 B） */
.cs-preview-hd { margin-bottom: var(--sp-2); }
.cs-preview pre { margin: 0; font-size: var(--fs-xs); color: var(--tx0); white-space: pre-wrap; }

/* 900 紧凑微调档（529/531 两批「全量」叙事的真实漏网页补齐）——
 Key 单元格键值对（键文本+还原钮）窄列单列化，还原钮落到键下方。
 工具行换行无需本档处理：lr-bar 骨架已自带 flex-wrap+row-gap（theme.css .lr-bar 单轨），
 子栏/容器再写 wrap 属 lrBarSingleTrack 禁区（gap 重新分叉）。
 ⚠.cs-preview 的 max-height: max(240px, 42vh) 弹性档
 （字面锁 useCurrentIdxWritePages525:192-197）不属本档职责，永不在此覆写 */
@media (max-width: 900px) { /* 900 档（.cs-k 纵排）——批次补齐（全站唯一无单 900 档） */
  .cs-k { flex-direction: column; align-items: flex-start; gap: var(--sp-1); }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.cs-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
