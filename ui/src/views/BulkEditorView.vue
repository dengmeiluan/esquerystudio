<template>
  <div class="be-page">
    <!-- 统一页头：PageHeader 组件（.ph 系列），本地 .be-hd-* 族删除（右侧动作组由 #actions 槽承接） -->
    <PageHeader :icon="Rows3" title="Bulk 批量文档编辑器" subtitle="NDJSON 直编 · index / create / update / delete 一次性 · 500ms 语法预校验 · 结果分组">
        <template #actions>
<!-- 手写 be-stat 串改用 MetaStrip 统一件（值亮+标签暗+·分隔；ops 数/行结构错全保留，结构错走 err 档） -->
<MetaStrip v-if="opsCount > 0" :items="beStatItems" />
  <button class="btn ghost sm" @click="body = ''" :disabled="!body.trim()" title="清空编辑器内容"><Trash2 :size="12" /> 清空</button>
  <button class="btn ghost sm" @click="doGenerate">
    <Wand2 :size="12" /> 生成范例
  </button>
  <button class="btn ghost sm" @click="doFav" :disabled="!body.trim()">
    <Star :size="12" /> 收藏
  </button>
  <button v-if="canOps" class="btn primary sm" @click="doSubmit" :disabled="submitting || opsCount === 0">
    <Send :size="12" :class="{ spinning: submitting }" /> {{ submitting ? '执行中…' : `执行 (${opsCount})` }}
  </button>
  <span v-else class="dim" style="font-size: var(--fs-xs);align-self:center">执行需 REBUILD_OP/ADMIN 角色</span>
        </template>
      </PageHeader>

    <!-- 接统一可调工作台（继 SqlBridge/ConfigDrift/BoostTuner 后第四视图）——参数栏可折叠+拖拽调宽+偏好记忆 -->
    <WorkbenchLayout :scope="beScope" :panes="BE_PANES" axis="vertical" mode="bulkedit">
      <template #pane-bulkeditor-params>
      <!-- 轨4：.be-card 壳退役（四刀约定③④）——pane 即容器内容直贴；
 因 rp-title「参数」在场而删的卡头文案随竖排轨退役落回横排 be-card-hd（刀②语义承接） -->
      <div class="be-params">
        <div class="be-card-hd"><span>参数</span></div>
        <div class="be-card-bd">
          <div class="be-field">
            <label>目标索引（可留空，NDJSON 内可各行指定）</label>
            <div class="be-idx-row">
              <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（「选索引」唯一入口收敛顶栏）；
 写类页不开 useIdxState follow（ 口径），「用当前索引」回填钮保留（AdhocRebuild 范式） -->
              <CurrentIdxChip />
              <!-- 「用当前索引」一键回填：写类页不开 useIdxState follow（ 口径），统一件把
 顶栏全局选中带入目标；有稿时钮仍在，点击显式覆盖，不自动执行。
 内联钮合并 PickCurrentIdxBtn 统一件（图标/样式/data-test/title
 随件内聚，本页只接 @pick 显式覆盖口） -->
              <PickCurrentIdxBtn @pick="index = store.pickedIdx" />
            </div>
          </div>
          <div class="be-field">
            <label>refresh</label>
            <select v-model="refresh" class="inp">
              <option value="">默认（不刷新）</option>
              <option value="true">true（立即可见）</option>
              <option value="wait_for">wait_for（等下一次 refresh）</option>
              <option value="false">false</option>
            </select>
          </div>
          <div class="be-field">
            <label>pipeline（可选）</label>
            <input v-model="pipeline" class="inp" placeholder="ingest pipeline ID（可选）" /><!-- ：placeholder 中文化并标可选 -->
          </div>
          <div class="be-field">
            <label>wait_for_active_shards</label>
            <input v-model="waitForActiveShards" class="inp" placeholder="留空 / all / 数字" />
          </div>
          <div class="be-field">
            <label>timeout</label>
            <input v-model="timeout" class="inp" placeholder="如 1m / 30s" />
          </div>
          <div class="be-hint">
            <AlertCircle :size="12" />
            <span>NDJSON 一行动作 + 一行文档（delete 只需 1 行）。行尾会自动补换行。</span>
          </div>
        </div>
      </div>
      </template>
      <template #pane-bulkeditor-editor>
      <!-- 编辑器卡补 flex 链（be-card-editor，SqlBridgeView 同款链路）——
 卡 height:100% 吃满工作台 pane，Monaco 100% 随 pane 弹性（原 330px 定高下方留白退役）。
 轨4：.be-card 壳退役，be-card-editor 保留（flex 链本体，selectorUnify532 锚） -->
      <div class="be-card-editor" :class="{ 'be-h-fixed': editorH !== 'full' }">
        <div class="be-card-hd">
          <span>NDJSON body</span>
          <div class="be-card-hd-r">
            <!-- 编辑器高度四档钮（editorTiers 统一件 + usePref bulk.edH，
 SearchTemplates st.editorH 同款范式）——满档沿既有 pane 弹性 flex 链不变 -->
            <div class="be-eh" role="group" aria-label="编辑器高度档位" title="编辑器高度档位：S/M/L/满">
              <button v-for="eh in EDITOR_H_TIERS" :key="eh.k" type="button" class="be-eh-btn"
                :class="{ on: editorH === eh.k }" :aria-pressed="editorH === eh.k"
                :title="'编辑器高度：' + eh.t" @click="editorH = eh.k">{{ eh.t }}</button>
            </div>
            <button class="btn ghost xs" @click="format" title="逐行校验并对齐">
              <AlignLeft :size="11" /> 校验
            </button>
          </div>
        </div>
        <!-- 挂 dsl-assist 白得通道——none 档补全静音，字段 hover 白得（fields 见 beDslAssist）。
 高度四档（EDITOR_HEIGHTS[editorH]，满档='100%' 沿既有弹性） -->
        <MonacoEditor v-model="body" language="ndjson" :height="EDITOR_HEIGHTS[editorH]" :dsl-assist="beDslAssist" @execute="doSubmit" />
        <!-- NDJSON 配对即时校验——动作行/文档行计数不符时执行前就提示（高频失败源前移拦截）。
 warn 态改用 theme.css .lint-bar 单源（；be-lint-warn 锚并存，
 scoped 琥珀私档退役）；info 态保 .be-hint 静默灰基础档（用途不同勿动）。
 ⚠warn 态不并挂 be-hint：其 code-bg 底/muted 色以 scoped 权重压过 lint-bar-warn 单源档 -->
        <div v-if="ndjsonLint" :class="ndjsonLint.level === 'warn' ? 'be-lint-warn lint-bar lint-bar-warn' : 'be-hint'">
          <AlertCircle :size="12" />
          <span>{{ ndjsonLint.msg }}</span>
        </div>
      </div>

      <!-- B1 修复：提交失败走全文内联面板（重试重发 doSubmit），与结果卡互斥——
 不再让上一次成功的「✓ 全部成功」在新失败之后残留伪装 -->
      <div v-if="submitErr" role="alert" class="err-bar rise-in be-err">
        Bulk 提交失败：{{ submitErr }}
        <button v-if="canOps" class="btn sm" @click="doSubmit" :disabled="submitting || opsCount === 0"><RefreshCw :size="12" :class="{ spinning: submitting }" /> 重试</button>
      </div>
      <div class="be-result-card" v-else-if="result">
        <div class="be-card-hd">
          <span>执行结果</span>
          <div class="be-card-hd-r">
            <!-- 原始 IO 快查——最近一次 /cluster/bulk 请求/响应原文（ioRecorder 记录环） -->
            <button class="btn ghost xs" data-test="raw-io" aria-label="查看原始 IO（Bulk 执行）" title="最近一次 bulk 请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo">
              <Terminal :size="11" /> 原始 IO
            </button>
            <!-- be-badge 别名着色退役（--success/--danger 与 .pill.g/.r 已做的语义色重复），模板只留 pill 系 -->
            <!-- W-D：结果徽标改用 StatusPill 统一件（g/r 语义档，文案逐字） -->
            <StatusPill v-if="!result.errors" tone="g" label="✓ 全部成功" />
            <StatusPill v-else tone="r" label="× 存在失败" />
            <!-- 裸 took ms → TookBadge 四档语义徽标 -->
            <span class="be-stat">took <TookBadge :ms="result.took" /></span>
          </div>
        </div>
        <div class="be-result-row">
          <div class="be-result-b">
            <div class="be-result-num ok">{{ fmtNum(result.okCount) }}</div>
            <div>成功</div>
          </div>
          <div class="be-result-b">
            <div class="be-result-num err">{{ fmtNum(result.errCount) }}</div>
            <div>失败</div>
          </div>
          <div class="be-result-b">
            <div class="be-result-num">{{ fmtNum(result.total) }}</div>
            <div>总计</div>
          </div>
        </div>
        <div v-if="result.failedSample && result.failedSample.length" class="be-fail">
          <div class="be-fail-tt">前 20 条失败样例：</div>
          <details v-for="(f, i) in result.failedSample" :key="i" class="be-fail-item" tabindex="0"
            @contextmenu.prevent="openFailMenu($event, f, i)" @keydown="onFailMenuKey($event, f, i)" data-row-nav @keydown.self="rowArrowNav">
            <!-- W4c：f.status 裸渲染 → W-D 改用 StatusPill（<300 g/<500 y/其余 r，RestView HTTP 状态徽标同款） -->
            <summary>#{{ i + 1 }} — <StatusPill :tone="statusPillCls(f.status)" :label="String(f.status)" /> — {{ (f.error && f.error.type) || 'error' }}</summary>
            <div class="be-fail-body"><JsonTree :data="f" /></div>
          </details>
        </div>
        <!-- 下钻联动——执行完就地验证写入结果（对齐 24 批 Adhoc/Xmigrate「去查询验证」先例） -->
        <div v-if="index" style="margin-top:var(--sp-2h)">
          <button class="btn sm" @click="router.push({ path: '/search', query: { mode: 'dsl', idx: index } })">
            <Search :size="11" /> 去查询验证 →
          </button>
        </div>
      </div>
      </template>
    </WorkbenchLayout>

    <!-- 1370：失败样例右键菜单（项目统一 CellContextMenu）。
     运营拿到失败清单第一件事就是「把这条错误拿去搜/贴给同事」，此前只能手动选中文本。 -->
    <CellContextMenu
      v-if="failMenu"
      :x="failMenu.x" :y="failMenu.y" :title="failMenu.title"
      :items="failMenuItems"
      @close="failMenu = null"
    />

    <!-- 原始 IO 弹窗（宿主受控开关；rec 取该页最近一条 /cluster/bulk 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Trash2, Rows3, Wand2, Star, Send, AlertCircle, AlignLeft, RefreshCw, Search, Terminal, Copy, Braces, ChevronsUpDown } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, ioRecorder, type RawIoRec } from '../api';
/* 原始请求/响应快查弹窗（数据源=api.ts ioRecorder 记录环） */
import RawIoModal from '../components/RawIoModal.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useIdxState, usePref } from '../composables/urlState';
import { copyText } from '../utils/format';
import { useScopedDraft } from '../composables/useScopedDraft';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件 */
/* 编辑器高度四档（editorTiers 统一件，st.editorH 同源） */
import { EDITOR_HEIGHTS, EDITOR_H_TIERS, type EditorHKey } from '../utils/editorTiers';
import JsonTree from '../components/JsonTree.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1370：失败样例右键 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：页头 stat 串统一件 */
import TookBadge from '../components/TookBadge.vue'; /* ：took 四档语义徽标 */
import StatusPill from '../components/StatusPill.vue'; /* W-D：状态徽标统一件 */
import { askConfirm } from '../composables/confirm';
import { fmtTime, fmtNum } from '../utils/format';
import { permDeniedAdvice } from '../utils/esErrorAdvice'; /* W4c：三视图同构 403 建议收敛单一出处 */
import { ndjsonLint as ndjsonLintOf } from '../utils/bulkNdjson';
import MonacoEditor from '../components/MonacoEditor.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();

/* ═══ 1370：失败样例右键菜单 ═══
 批量写入后「前 20 条失败样例」是排查起点。此前只能手选文本复制；
 这里按项目右键约定给一级「复制这条（JSON）」+「复制错误原因」，
 二级放「复制全部失败」——错误原因要能直接粘进搜索/工单，JSON 要能贴给同事复现。 */
const failMenu = ref<{ x: number; y: number; f: any; i: number; title: string } | null>(null);
function openFailMenu(e: MouseEvent, f: any, i: number) {
  const type = (f && f.error && f.error.type) || 'error';
  failMenu.value = { x: e.clientX, y: e.clientY, f, i, title: `第 ${i + 1} 条 · ${type}` };
}
function onFailMenuKey(e: KeyboardEvent, f: any, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  const type = (f && f.error && f.error.type) || 'error';
  failMenu.value = { ...menuKeyAnchor(e), f, i, title: `第 ${i + 1} 条 · ${type}` };
}
async function failCopy(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
/* 失败样例的错误对象形状有两种：后端扁平 `{status,error}`，以及 ES 原生
   `{index:{status,error}}`（用户直接贴 ES 响应时）。两种都认，否则「复制错误原因」
   在一种形状下会静默复制空串——真机实测踩到过。 */
function failErr(f: any): any {
  return (f && (f.error || (f.index && f.index.error))) || null;
}
const failMenuItems = computed<CcmItem[]>(() => {
  const m = failMenu.value;
  if (!m) return [];
  return [
    { key: 'fail-copy-json', label: '复制这条（JSON）', icon: Braces, run: () => void failCopy(JSON.stringify(m.f, null, 2), `已复制第 ${m.i + 1} 条失败明细`) },
    {
      key: 'fail-copy-reason', label: '复制错误原因', icon: Copy,
      run: () => {
        const e = failErr(m.f);
        const reason = (e && (e.reason || e.type)) || '';
        void failCopy(String(reason), reason ? '已复制错误原因' : '这条没有错误原因字段');
      },
    },
    {
      key: 'fail-more', label: '更多…', icon: ChevronsUpDown, sep: true, children: [
        {
          key: 'fail-copy-all', label: '复制全部失败样例（JSON）', icon: Copy,
          run: () => void failCopy(JSON.stringify(failSampleAll.value, null, 2), '已复制全部失败样例'),
        },
      ],
    },
  ];
});
/* 全部失败样例：结果里有几次失败就复制几条（超过 20 条也只复制被采样的这批，与页面所见一致） */
const failSampleAll = computed<any[]>(() => {
  const r: any = result.value;
  return Array.isArray(r?.failedSample) ? r.failedSample : [];
});

/* 参数+编辑区可调工作台声明（参数栏可折叠，拖拽/预设/记忆由 WorkbenchLayout 统一负责） */


const beScope = { target: store.target || 'host', route: '/bulk-editor', mode: 'bulkedit', profile: 'standard' as const };
/* 轨4：竖排标题轨退役（v 刀①）——「参数」落回 be-card-hd 横排（因
 rp-title 在场而删，轨退役后语义回归卡头）；编辑区由「NDJSON body」卡头承接 */
const BE_PANES: WorkbenchPaneSpec[] = [
  { id: 'bulkeditor.params', role: 'request', title: '', minSize: 220, defaultSize: 260, collapsible: true },
  { id: 'bulkeditor.editor', role: 'response', title: '', minSize: 360, defaultSize: 'flex' },
];
/* 权限门禁——bulk 执行=/cluster/bulk=REBUILD 档（rank3+）；编辑/预校/范例/收藏全角色可用 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/bulk', store.target));
/* 目标索引进 URL——刷新/分享链接可复原（可重入） */
const index = useIdxState();
/* 编辑器高度四档记忆（usePref bulk.edH，st.editorH 同款范式；默认满档=既有
 100% 随 pane 弹性行为零变化；S/M/L 定高直传，be-h-fixed 档停用 flex 拉伸、260px 兜底让位定高） */
const editorH = usePref<EditorHKey>('bulk.edH', 'full');
const router = useRouter();
/* NDJSON body 白得字段 hover——fields 源吃生效索引（本页 idx 优先、全局选中兜底，
 与 body 草稿隔离维度同源）。bodyKind 'none'：_bulk NDJSON 体非查询面，补全静音（DevTools
 _bulk 端点同档），字段 hover「type · path」零扰白得。ensure 挂载即预热+索引变化重拉
 （DevToolsView W6 同范式；幂等+缓存，失败零降级=hover 静默） */
const beFieldsCtx = useIndexFields(() => index.value || store.pickedIdx || '');
watch([index, () => store.pickedIdx], () => { void beFieldsCtx.ensure(); }, { immediate: true });
/* assist 闭包在 setup 作用域声明（模板内联对象箭头函数经 _ctx 代理，T14 渗透红灯实证） */
const beDslAssist = { fields: () => beFieldsCtx.fields.value, bodyKind: () => 'none' as const };
const refresh = ref('');
const pipeline = ref('');
const waitForActiveShards = ref('');
const timeout = ref('');
/* →草稿：手写批量体草稿迁 useScopedDraft——按 集群/索引 维度隔离，
 A 索引的 NDJSON 稿不再串到 B；行为不变（刷新/误导航复原，清空即清稿） */
const body = useScopedDraft('body', {
  route: 'bulk-editor',

  index: () => index.value || store.pickedIdx,
}).text;
/* 收藏回放 carry——favReplay 写一次性键，挂载即消费转入自身草稿
 （旧 esquerystudio.draft.bulk-editor.body 是草稿治理前命名空间，无人消费，「已恢复」提示是假的） */
const bulkCarry = sessionStorage.getItem('esquerystudio.bulk.carry');
if (bulkCarry) {
  body.value = bulkCarry;
  removeStoredRaw(sessionStorage, 'esquerystudio.bulk.carry');
}
const submitting = ref(false);
const result = ref<any>(null);
/* B1：提交失败全文——内联错误面板的数据源，与 result 互斥（失败即清旧结果） */
const submitErr = ref('');

const opsCount = computed(() => {
  const lines = body.value.split('\n').filter(l => l.trim());
  let n = 0;
  for (const l of lines) {
    try {
      const obj = JSON.parse(l);
      if (obj.index || obj.create || obj.update || obj.delete) n++;
    } catch { /* 非法行不计数，行级错误由 lineErr 单独统计提示 */ }
  }
  return n;
});
/* 配对校验消费纯函数（utils/bulkNdjson）——body 是 Ref，模板外必须 .value 解引用
 （String(ref) 恒 "[object Object]"，校验对象永久失真） */
const ndjsonLint = computed(() => ndjsonLintOf(String(body.value || '')));
const lineErr = computed(() => {
  let n = 0;
  for (const l of body.value.split('\n')) {
    if (!l.trim()) continue;
    try { JSON.parse(l); } catch { n++; }
  }
  return n;
});

/* 页头 stat 串 → MetaStrip items（ops 数与行结构错全保留，行结构错走 err 档） */
const beStatItems = computed<MetaStripItem[]>(() => {
  const items: MetaStripItem[] = [{ value: opsCount.value, label: '条操作' }];
  if (lineErr.value > 0) items.push({ value: lineErr.value, label: '行结构错', tone: 'err' });
  return items;
});

/* W4c：失败样例 HTTP 状态 → pill 色档（<300 g/<500 y/其余 r）——与 RestView 响应状态
 pill 同款范式（RestView 禁改，此处映射最小复制）；非法/缺失状态归 r（失败样例常态即异常） */
function statusPillCls(s: any): 'g' | 'y' | 'r' {
  const n = Number(s);
  if (!Number.isFinite(n)) return 'r';
  return n < 300 ? 'g' : n < 500 ? 'y' : 'r';
}

function doGenerate() {
  const idx = index.value || store.pickedIdx || 'my-index';
  body.value = `{ "index": { "_index": "${idx}", "_id": "1" } }
{ "title": "hello", "score": 100, "ts": "${new Date().toISOString()}" }
{ "index": { "_index": "${idx}", "_id": "2" } }
{ "title": "world", "score": 60, "ts": "${new Date().toISOString()}" }
{ "update": { "_index": "${idx}", "_id": "1" } }
{ "doc": { "score": 200 } }`;
}
function format() {
  const errs: string[] = [];
  body.value.split('\n').forEach((l, i) => {
    if (!l.trim()) return;
    try { JSON.parse(l); } catch (e: any) { errs.push(`第 ${i + 1} 行：${e.message}`); }
  });
  if (errs.length === 0) store.notify('success', '所有行 JSON 合法');
  else store.notify('error', errs.slice(0, 3).join('\n') + (errs.length > 3 ? `\n…共 ${errs.length} 处` : ''));
}
function doFav() {
  store.addFavorite({
    kind: 'rest', title: `Bulk @${fmtTime(Date.now())}`,
    subtitle: `${opsCount.value} 条操作 → ${index.value || '<no-index>'}`,
    payload: { index: index.value, refresh: refresh.value, body: body.value }, tags: ['bulk'],
  });
  store.notify('success', '已收藏当前 Bulk 配置');
}
/* z5 轮：403 补下一步建议——W4c 起收敛 utils/esErrorAdvice 单一出处（三视图文案逐字等价） */
async function doSubmit() {
  /* 权限执行体首行门（按钮 v-if 之外的 Ctrl+Enter/重试通道）：批量写需专项或 ADMIN */
  if (!canOps.value) { store.notify('warning', '批量写需专项或 ADMIN 角色'); return; }
  /* ux2 quality：@execute(Ctrl+Enter) 不经按钮 :disabled——入口补上按钮原有双门（submitting/opsCount），
 防在途重入（confirm 间隙连发）与空档提交（0 条空调用 api.bulk）。同构先例：PainlessLab run 的 busy 门。 */
  if (submitting.value || opsCount.value === 0) return;
  if (lineErr.value > 0 && !await askConfirm({
    title: '存在结构错误行',
    message: `当前内容有 ${lineErr.value} 行 JSON 结构错，提交后这些行会被 ES 拒绝或引发部分失败，建议先修复。`,
    okText: '仍要提交',
  })) return;
  // 真实写入前强制确认：讲清目标索引与操作数，避免范例/误点直接落库
  const target = index.value || store.pickedIdx || '（按行内 _index）';
  if (!await askConfirm({
    title: '提交 Bulk 写操作',
    message: `将向「${target}」提交 ${opsCount.value} 条 Bulk 操作，其中 index/update/delete 会真实落库且无法批量撤销。`,
    okText: `提交 ${opsCount.value} 条`,
  })) return;
  submitting.value = true;
  submitErr.value = '';
  try {
    const r = await api.bulk(body.value, {
      index: index.value || undefined,
      refresh: refresh.value || undefined,
      pipeline: pipeline.value || undefined,
      timeout: timeout.value || undefined,
      waitForActiveShards: waitForActiveShards.value || undefined,
    });
    result.value = r;
    store.notify(r.errors ? 'warning' : 'success',
      `Bulk 完成：成功 ${r.okCount} / 失败 ${r.errCount} / 总 ${r.total}`);
  } catch (e: any) {
    submitErr.value = permDeniedAdvice(e);
    result.value = null;
    store.notify('error', 'Bulk 失败：' + submitErr.value);
  } finally { submitting.value = false; }
}

/* 原始 IO 快查（545 四页同款）——特征 /cluster/bulk；判空 rec=null（本页还没
 执行过提交）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/cluster/bulk');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
.be-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
/* 页头已收敛 PageHeader 组件，本地 .be-hd/.be-hd-l/.be-hd-ic/.be-hd-tt/.be-hd-sub/.be-hd-r 删除 */
/* .be-stat 保留（结果卡头 took 包装仍在用）；.be-stat-err 随页头 stat 串
 MetaStrip 化退役（结构错走 MetaStrip tone:'err'） */
.be-stat { font-size: var(--fs-xs); color: var(--muted); }
.be-err { grid-column: 1 / -1; margin-bottom: 0; }
/* 编辑器卡弹性链（SqlBridgeView .br-card 同款）——卡吃满 pane 高，
 monaco-host 吸收剩余高并保留 260px 兜底；stacked 档 pane 自然高，100% 回落 auto 由 min-height 兜底。
 S/M/L 定高档（be-h-fixed）停用 flex 拉伸——flex-basis 0 会吃掉内联定高，
 定高自身可解析不再需要 260px 下限（full 档兜底保留不动）。
 轨4：.be-card 壳规则（bg+border+radius+overflow）退役——pane 即容器，
 内容直贴；区块分界由 be-card-hd border-bottom 承接（v 刀③④），高度链零变动 */
.be-card-editor { height: 100%; display: flex; flex-direction: column; }
.be-card-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }
.be-card-editor.be-h-fixed > :deep(.monaco-host) { flex: 0 0 auto; min-height: 0; }
/* 轨4：编辑器外框退役（约定③，558(b) av-left/br-pane 同语言）——组件
 .monaco-host 自带 1px line 框+radius（MonacoEditor.vue 黑名单零触），视图侧同选择器
 独立规则追加（CSS 声明合并语义等价）；be-card-hd 既有 border-bottom 承接分界 */
.be-card-editor > :deep(.monaco-host) { border: none; border-radius: 0; }
/* 高度四档钮组（SearchTemplates .st-eh 同款视觉，档位单源 editorTiers） */
.be-eh { display: flex; gap: var(--sp-0); flex-shrink: 0; }
.be-eh-btn { border: 1px solid var(--border); background: var(--bg1); color: var(--tx2); font-size: var(--fs-xs); line-height: 1; padding: var(--sp-1) var(--sp-2); cursor: pointer; border-radius: 3px; }
.be-eh-btn:hover { color: var(--tx1); border-color: var(--ac-line); }
.be-eh-btn.on { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* W-F：卡头 400 失序归位 650（口径 B 卡头档；条状壳保留，仅字重对齐）。
 卡头并 fs-head 行首横排档（uq-card-hd 538 已改先例同语言：fs-xs/650/tx1/.02em +
 5px--sp-2 行距，border-bottom 分界保留；模板 span+hd-r 先例结构不动） */
.be-card-hd { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2); border-bottom: 1px solid var(--border); font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }
.be-card-hd-r { display: flex; gap: var(--sp-2); }
.be-card-bd { padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
.be-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.be-field label { font-size: var(--fs-xs); color: var(--muted); }
/* 索引选择+回填钮行（UpdateByQueryView .uq-idx-row 同款形态）。
 > .ixp 满宽规则随 IndexPicker 退役清零（chip 自带胶囊观感不满宽） */
.be-idx-row { display: flex; align-items: center; gap: var(--sp-1h); }
.inp { background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-xs); padding: var(--sp-1) var(--sp-2); font-size: var(--fs-sm); color: var(--fg); }
.be-hint { display: flex; gap: var(--sp-2); padding: var(--sp-2); background: var(--code-bg); border-radius: var(--r-xs); font-size: var(--fs-xs); color: var(--muted); }
/* 配对校验 warn 态琥珀私档（be-lint-warn 变体选择器）随改用 theme.css
 .lint-bar-warn 单源退役；be-hint 基础档（info 静默灰，:64 用途）保留勿动 */
.be-result-row { display: flex; gap: var(--sp-3); padding: var(--sp-3); }
/* be-result-b 项级小框退役（border+radius 整块消除）——三格留间距归
 be-result-row 的 flex gap，数字/文案排版原样（fs-num 展示数字档字面零变动） */
.be-result-b { flex: 1; text-align: center; padding: var(--sp-2) 0; font-size: var(--fs-xs); color: var(--muted); }
/* W-F：21px 大数字字面量归 --fs-num 展示数字档（注册三档 21/28/44） */
.be-result-num { font-size: var(--fs-num); font-weight: 650; color: var(--fg); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.be-result-num.ok { color: var(--success); }
/* --danger deprecated 别名退役，消费归 --err 本名 */
.be-result-num.err { color: var(--err); }
/* .be-badge / .be-badge.ok / .be-badge.err 别名着色退役——pill 系（.pill.g/.pill.r）
 已承担同语义色，模板只留 pill 类 */
.be-fail { padding: 0 var(--sp-3) var(--sp-3); }
.be-fail-tt { font-size: var(--fs-sm); color: var(--muted); margin: var(--sp-2) 0; }
/* be-fail-item 项级小框退役 → border-bottom 分条（去框留间距，条界由分界线承接；
 margin 间距随线退役，末条线由 be-fail 容器 padding-bottom 兜底不出血） */
.be-fail-item { padding: var(--sp-2) 0; border-bottom: 1px solid var(--border); font-size: var(--fs-xs); }
.be-fail-body { font-size: var(--fs-xs); background: var(--code-bg); padding: var(--sp-2); border-radius: var(--r-xs); margin: var(--sp-2) 0 0; overflow-x: auto; }

/* 1100px 自制断点退役——窄屏堆叠由 WorkbenchLayout stacked 档自动处理。 */

/* 900 紧凑微调档（Workbench 五视图之三）——页侧距 --sp-4 收 --sp-3（顶/底节奏不动）；
 卡头即工具行（标题+校验钮 / 执行结果+pill 徽标+took），窄容器补 wrap 防按钮组被右缘裁切 */
@media (max-width: 900px) {
  .be-page { padding: var(--sp-3) var(--sp-3) var(--sp-5); }
  .be-card-hd { flex-wrap: wrap; row-gap: var(--sp-1h); }
}
</style>
