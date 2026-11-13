<template>
  <div class="cv-page">
    <div class="cv-hd">
      <PageHeader :icon="ShieldCheck" title="索引配置校验器" subtitle="L1 静态 Lint · L2 临时索引 Dry-run（ES 原生裁决，零副作用）· L3 最佳实践 Advisor —— 发上服务器前把配置错误拦下来">
      <template #actions>
<button class="btn ghost sm" :aria-pressed="showGallery" @click="showGallery = !showGallery">
  <BookOpen :size="12" /> 模板画廊
</button>
<button class="btn ghost sm" :aria-pressed="showImport" @click="showImport = !showImport">
  <Download :size="12" /> 从现有索引导入
</button>
<button v-if="canValidate" class="btn ghost sm" @click="doValidate(false)" :disabled="busy">
  <Loader2 v-if="busy && !lastDryRun" :size="12" class="spinning" />
  <Play v-else :size="12" />
  {{ busy && !lastDryRun ? '校验中…' : '快速 Lint' }}
</button>
<button v-if="canValidate" class="btn primary sm" @click="doValidate(true)" :disabled="busy">
  <Loader2 v-if="busy && lastDryRun" :size="12" class="spinning" />
  <FlaskConical v-else :size="12" />
  {{ busy && lastDryRun ? '校验中…' : '校验 + Dry-run' }}
</button>
<!-- G249：原始 IO 快查（557/757 同款三件套）——本页最近一次校验
 （POST config-lab/validate）请求/响应原文（ioRecorder 记录环）；页头恒渲染位 -->
<button class="btn ghost sm" data-test="raw-io" aria-label="查看原始 IO（索引配置校验）" title="最近一次校验（config-lab/validate）请求/响应原文（复制/回放/语义分档高亮）" @click="openRawIo"><Terminal :size="12" /> 原始 IO</button>
      </template>
      </PageHeader>
</div>

    <!-- cv-import 横幅容器框退役（bg+border+radius+框 padding 整块消除，v 约定①）
 ——工具行直贴页面流，类名保留作模板锚（900 档 wrap 规则继续生效） -->
    <div v-if="showImport" class="cv-import">
      <!-- 页内 IndexPicker 退役换 CurrentIdxChip 只读件（「选索引」唯一入口收敛顶栏）；
 写类页不开 useIdxState follow（统一件口径），「用当前索引」回填钮保留（AdhocRebuild 范式） -->
      <CurrentIdxChip />
      <!-- 「用当前索引」一键回填：写类页不开 follow（统一件口径），统一件把顶栏全局选中带入
 导入起点；拉取仍由用户点「拉取」触发。：内联钮合并 PickCurrentIdxBtn
 统一件（图标/样式/data-test/title 随件内聚，本页只接 @pick 显式覆盖口） -->
      <PickCurrentIdxBtn @pick="importIndex = store.pickedIdx" />
      <button class="btn ghost sm" @click="doImport" :disabled="!importIndex.trim() || importing">
        <Loader2 v-if="importing" :size="12" class="spinning" />
        <Download v-else :size="12" />
        {{ importing ? '拉取中…' : '拉取 settings + mapping' }}
      </button>
      <span class="cv-import-tip">拉取后自动剔除 uuid/creation_date 等系统键，可直接改造复用</span>
    </div>

    <!-- 模板画廊 -->
    <div v-if="showGallery" class="cv-gallery">
      <div v-for="t in TEMPLATES" :key="t.name" class="cv-tpl" @click="applyTemplate(t)" role="button" tabindex="0" @keydown.enter.prevent="applyTemplate(t)" @keydown.space.prevent="applyTemplate(t)">
        <div class="cv-tpl-nm">{{ t.name }}</div>
        <div class="cv-tpl-desc">{{ t.desc }}</div>
        <div class="cv-tpl-tags">
          <!-- tag chip 改用 StatusPill 统一件（同语言）——模板 tag 全中性
 n 档；.cv-tag 私造皮退役，色板/胶囊形态归 .pill 单源 -->
          <StatusPill v-for="tag in t.tags" :key="tag" tone="n" :label="tag" />
        </div>
      </div>
    </div>

    <!-- 双栏编辑器（W2 批：比例可调——中缝 SplitHandle 拖拽，cvLeftW 落 usePref；0=自动等分 1fr） -->
    <div class="cv-grid" :style="cvLeftW > 0 ? { '--cv-left-w': cvLeftW + 'px' } : undefined">
      <div class="cv-card">
        <div class="cv-card-hd">
          <span>settings <em>（可空；顶层扁平 / index 嵌套 / index. 前缀均可）</em></span>
          <button class="btn ghost xs" @click="settingsDraft.clear()">清空</button>
          <input v-model="settingsFind.kw.value" class="inp mono cv-find" aria-label="搜 settings" placeholder="搜 settings…" @input="settingsFind.run()"
            @keydown.enter.prevent="settingsFind.kw.value.trim() && ($event.shiftKey ? settingsFind.prev() : settingsFind.next())" />
          <span class="mono cv-find-mc">{{ settingsFind.current.value }}/{{ settingsFind.count.value }}</span>
          <button type="button" class="btn ghost xs" :disabled="!settingsFind.count.value" title="上一个 (Shift+Enter)" @click="settingsFind.prev()">↑</button>
          <button type="button" class="btn ghost xs" :disabled="!settingsFind.count.value" title="下一个 (Enter)" @click="settingsFind.next()">↓</button>
        </div>
        <MonacoEditor ref="cvSettingsMonaco" v-model="settingsText" height="100%" :dsl-assist="cvSettingsAssist" @execute="doValidate(true)" />
      </div>
      <SplitHandle axis="vertical" :size="cvLeftW > 0 ? cvLeftW : 420" :min="220" :max="2000"
        label="settings/mapping 分栏" class="cv-split"
        @resize-end="(s: number) => cvLeftW = clampCvW(s)" @reset="cvLeftW = 0" />
      <div class="cv-card">
        <div class="cv-card-hd">
          <span>mapping <em>（可空；properties 结构，无需 6.x type 包裹）</em></span>
          <button class="btn ghost xs" @click="mappingDraft.clear()">清空</button>
          <input v-model="mappingFind.kw.value" class="inp mono cv-find" aria-label="搜 mapping" placeholder="搜 mapping…" @input="mappingFind.run()"
            @keydown.enter.prevent="mappingFind.kw.value.trim() && ($event.shiftKey ? mappingFind.prev() : mappingFind.next())" />
          <span class="mono cv-find-mc">{{ mappingFind.current.value }}/{{ mappingFind.count.value }}</span>
          <button type="button" class="btn ghost xs" :disabled="!mappingFind.count.value" title="上一个 (Shift+Enter)" @click="mappingFind.prev()">↑</button>
          <button type="button" class="btn ghost xs" :disabled="!mappingFind.count.value" title="下一个 (Enter)" @click="mappingFind.next()">↓</button>
        </div>
        <MonacoEditor ref="cvMappingMonaco" v-model="mappingText" height="100%" :dsl-assist="cvMappingAssist" @execute="doValidate(true)" />
      </div>
    </div>

    <!-- G6-B7：校验失败 err-bar 独立于互斥链顶置（ 同构修复）——不再仅 toast 后落回引导空态；
 有旧报告重试失败时与旧报告并存；重试重跑同模式（lastDryRun），不绕过任何确认门 -->
    <div v-if="validateErr" role="alert" class="err-bar rise-in">
      {{ validateErr }}
      <button v-if="canValidate" class="btn sm" @click="doValidate(lastDryRun)" :disabled="busy"><RefreshCw :size="12" :class="{ spinning: busy }" /> 重试</button>
    </div>

    <!-- 校验报告（cv-report 整卡壳退役 → border-top 分节；rp-hd 工具条与
 issues 行分隔原样同步更新） -->
    <div v-if="report" class="cv-report">
      <div class="cv-rp-hd">
        <!-- 报告头条自绘 ok/err 状态徽标改用 StatusPill 统一件（同页 cv-iss-sev
 五主档先例同款；tone 映射 valid→g / 未过→r，文案逐字。对勾/叉圈呼吸图标随统一件化
 退役——StatusPill 无图标位，pt-badge/ld-al-badge 改用先例同口径） -->
        <StatusPill :tone="report.valid ? 'g' : 'r'" :label="report.valid ? '校验通过' : '校验未通过'" />
        <!-- cv-rp-meta 手写计数串改用 MetaStrip 统一件（err/warn/info 走组件 tone 档，
 原手写 .c-err/.c-warn/.c-info 色档退役）；TookBadge 段走组件默认插槽（SearchSandboxView 先例，
 sep 自动化归组件），校验耗时语义不变 -->
        <MetaStrip class="cv-rp-meta" :items="cvRpMeta">
          <span class="ms-i ms-t"><TookBadge :ms="report.elapsedMs" title="校验耗时" /></span>
        </MetaStrip>
        <!-- W2 批：问题清单高度档（usePref configvalidator.issuesH，默认 380=原写死值） -->
        <button class="btn ghost xs" data-cv-issues-h :title="'问题清单高度档：' + cvIssuesH + 'px'" @click="cycleIssuesH">高</button>
        <div class="cv-rp-act" v-if="report.valid && report.dryRunPassed">
          <input v-model="createName" class="inp sm-inp" placeholder="新索引名" />
          <div v-if="createNameHint" class="il-hint" :class="'il-' + createNameLevel">{{ createNameHint }}</div>
          <button v-if="canOps" class="btn primary sm" @click="askCreate" :disabled="!createName.trim() || creating">
            <Hammer :size="12" /> {{ creating ? '创建中…' : '通过校验，建索引' }}
          </button>
        </div>
      </div>

      <div v-if="report.issues.length" class="cv-issues" role="status" :style="{ maxHeight: cvIssuesH + 'px' }">
        <div v-for="(iss, i) in report.issues" :key="i" class="cv-issue" :class="iss.severity.toLowerCase()" tabindex="0"
          @contextmenu.prevent="openIssueMenu($event, iss)" @keydown="onIssueMenuKey($event, iss)" data-row-nav @keydown.self="rowArrowNav">
          <!-- severity 裸英文枚举换 StatusPill+sevZh（档位 sevPill 五主档已接，
 524 锚 cv-iss-sev pill 形态随组件化改锁 :tone 同源调用） -->
          <StatusPill class="cv-iss-sev" :tone="cvSevPill(iss.severity)" :label="cvSevZh(iss.severity)" />
          <span class="cv-iss-layer">{{ LAYER_NAMES[iss.layer] || iss.layer }}</span>
          <span class="cv-iss-code">{{ iss.code }}</span>
          <div class="cv-iss-body">
            <div class="cv-iss-msg"><span v-if="iss.path" class="cv-iss-path">{{ iss.path }}</span>{{ iss.message }}</div>
            <div v-if="iss.suggestion" class="cv-iss-sug"><Lightbulb :size="11" /> {{ iss.suggestion }}</div>
          </div>
        </div>
      </div>
      <div v-else class="cv-clean">配置零问题，可放心投产 🎉</div>
    </div>

    <EmptyState v-else-if="!validateErr" :icon="ShieldCheck"
      text="粘贴 settings / mapping，或从模板画廊、现有索引起步"
      hint="「校验 + Dry-run」会用临时索引在 ES 上真实试建（建成即删），比任何静态检查都可靠" />

    <!-- 建索引确认收敛全局 askConfirm（ 后果前置语义不变，本地 ConfirmModal 宿主退役；
 目标集群/索引名以 facts 具名行补偿原 <b> 强调） -->

    <!-- G249：原始 IO 弹窗（宿主受控开关；rec 取本页最近一条 config-lab/validate 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />

    <!-- 1317：问题行右键（校验出的每条问题都是要贴进工单/群聊的待办，
 此前只能一条条手抄） -->
    <CellContextMenu v-if="issueMenu" :x="issueMenu.x" :y="issueMenu.y"
      :title="'问题 · ' + (LAYER_NAMES[issueMenu.iss.layer] || issueMenu.iss.layer)"
      :items="issueMenuItems" @close="issueMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  ShieldCheck, Play, FlaskConical, BookOpen, Download,
  Lightbulb, Hammer, Loader2, RefreshCw, Terminal, ClipboardList, Copy, Braces, Info,
} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import MonacoEditor from '../components/MonacoEditor.vue';
/* 建索引确认收敛全局 askConfirm（本地 ConfirmModal 宿主退役） */
import { askConfirm } from '../composables/confirm';
/* W4：sev 徽标 pill 档收口 utils/esEnumZh 的 sevPill（别名保模板
 cvSevPill 字面量）。档名从 err/warn/info 别名档归正五主档 r/y/b——theme.css 两套
 选择器同 token（--err/--warn/--info），展示等价；本地显式映射实现退役。
 severity 裸英文枚举标签收口 sevZh（别名 cvSevZh——critical→严重 /
 warn→警告 / 其余→建议），改用 StatusPill 消费。 */
import { sevPill as cvSevPill, sevZh as cvSevZh } from '../utils/esEnumZh';
import EmptyState from '../components/EmptyState.vue';
/* 裸 ms → TookBadge 统一耗时徽标 */
import TookBadge from '../components/TookBadge.vue';
/* cv-rp-meta 计数串 MetaStrip 统一件 + sev 徽标 StatusPill 统一件 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import StatusPill from '../components/StatusPill.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import { copyText } from '../utils/format';
import { api, ioRecorder, type RawIoRec } from '../api';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import CurrentIdxChip from '../components/CurrentIdxChip.vue'; /* ：页内选择器退役换只读 chip */
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件 */
import { friendlyEsError } from '../utils/esError';
import { useInputLint, indexNameRule, dupRule } from '../composables/useInputLint';
import type { BodyKind } from '../utils/dslCompletionContext';
import { lintSettingsBody, lintMappingBody } from '../utils/dslLint'; /* P1-1：档路由静态 lint */
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { useDebounceFn } from '../composables/useDebounceFn'; /* P1-1：划线防抖统一件 */

import { useScopedDraft } from '../composables/useScopedDraft';
import { useMonacoLocate } from '../composables/useMonacoLocate';
/* W2 批：双栏比例拖拽 + 问题清单高度档（usePref 跨会话记忆） */
import { usePref, useIdxState } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle';
import SplitHandle from '../components/SplitHandle.vue';
/* G249：原始请求/响应快查弹窗（557/757 同款三件套） */
import RawIoModal from '../components/RawIoModal.vue';
const store = useAppStore();
/* 权限写门——create-index 后端为 rank3（REBUILD_OP/CLUSTER_OP/ADMIN 皆可），VIEWER 不显示入口 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/create-index', store.target));
/* 校验端点=config-lab/validate（写档 OPERATOR）——按钮隐藏之外，Monaco Ctrl+Enter/错误重试同受执行体门 */
const canValidate = computed(() =>
  auth.canEndpoint('write', 'POST', '/internal/es/index/config-lab/validate', store.target)
  || auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
/* 草稿：两栏编辑稿迁 useScopedDraft（按集群目标隔离）；「清空」按钮改走 clear() */
const cvScope = { route: 'config-validator',};
const settingsDraft = useScopedDraft('settings', cvScope);
const mappingDraft = useScopedDraft('mapping', cvScope);
const settingsText = settingsDraft.text;
const mappingText = mappingDraft.text;
/* 搜索定位轮：两栏 Monaco 真定位（findMatches + revealLineInCenter） */
const cvSettingsMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const cvMappingMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const settingsFind = useMonacoLocate(() => cvSettingsMonaco.value?.getEditor());
const mappingFind = useMonacoLocate(() => cvMappingMonaco.value?.getEditor());
/* ux2 ：双栏挂 dslAssist 语义档（W6 现成 settings/mapping 分档；闭包常量 setup 作用域纪律） */
const cvSettingsAssist = { fields: (): { path: string; type: string }[] => [], bodyKind: (): BodyKind => 'settings' };
const cvMappingAssist = { fields: (): { path: string; type: string }[] => [], bodyKind: (): BodyKind => 'mapping' };

/* ═══ P1-1：档路由静态 lint（划线通道，banner 无此页形态不新增） ═══
 lintSettingsBody/lintMappingBody 直接 import 纯函数消费（DevToolsView dtLint 档路由同源）；
 非法 JSON 静默返 []，setMarkers([]) 即清旧划线（DevTools 同契约）。
 语义不重叠注记：「字段体检」（doSchema → schemaWarnings 面板）是 ES 侧真实校验——请求集群
 按 mapping 解析后给出 SQL 失能字段结论；此处为编辑期静态规则（键目录拼写/数值值型，零请求）。
 两者一动态一静态、一 ES 侧一本地侧，互不替代。 */
const cvSettingsLint = computed(() => {
  try { return lintSettingsBody(JSON.parse(settingsText.value || '')); } catch { return []; }
});
const cvMappingLint = computed(() => {
  try { return lintMappingBody(JSON.parse(mappingText.value || '')); } catch { return []; }
});
const queueCvSettingsMarkers = useDebounceFn(() => {
  cvSettingsMonaco.value?.setMarkers?.(cvSettingsLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
const queueCvMappingMarkers = useDebounceFn(() => {
  cvMappingMonaco.value?.setMarkers?.(cvMappingLint.value.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(settingsText, () => { queueCvSettingsMarkers(); }, { immediate: true });
watch(mappingText, () => { queueCvMappingMarkers(); }, { immediate: true });

const busy = ref(false);
const report = ref<any>(null);
const showGallery = ref(false);
const showImport = ref(false);
/* 全局工作索引单一真相（归并）：「从现有索引导入」起点接 useIdxState——
 原一次性回填升级为 URL 单一真相：?idx= 深链读侧直落起点、视图内改选上行 store.pick；
 写类页不开启 follow（521 归并批口径，防顶栏切索引悄悄改写用户手填值）；
 URL 无 idx 时初值仍= pickedIdx（行为等价）。
 页内 IndexPicker 退役换只读 chip（起点=当前索引），@picked 自动拉取随退役——
 导入由「拉取 settings + mapping」钮显式触发（useIdxState 状态本体不动） */
const importIndex = useIdxState();
/* W4：sev 徽标 pill 档映射退役（原 severity 字面 ERROR/WARN/INFO →
 err/warn/info 显式映射），改 import 共享 sevPill（上） */
const importing = ref(false);
const createName = ref('');
/* ux2 ：索引名规则 + 查重 err（建已存在索引硬失败 resource_already_exists），就地校验 */
const { hint: createNameHint, level: createNameLevel, check: createNameCheck } = useInputLint([
  indexNameRule(),
  dupRule(() => store.indices.map(i => i.index), '索引', 'err'),
]);
watch(createName, v => createNameCheck(v));
const creating = ref(false);
/* G6-B7：校验失败 err-bar 状态位 + 重试记忆（快速 Lint / +Dry-run 重跑同模式） */
const validateErr = ref('');
const lastDryRun = ref(true);

/* W2 批：双栏比例拖拽（configvalidator.leftW，0=自动等分 1fr）+ 问题清单高度三档
 （configvalidator.issuesH，默认 380=原写死值），全走 usePref 跨会话记忆。
 W9：高度档循环三件套合并 useTierCycle 统一件（行为锁
 configValidatorAdjustW2：键名/档值序 240/380/560/钮 data-cv-issues-h 语义不变） */
const cvLeftW = usePref('configvalidator.leftW', 0);
function clampCvW(s: number) { return Math.round(Math.min(2000, Math.max(220, s))); }
const { v: cvIssuesH, cycle: cycleIssuesH } = useTierCycle('configvalidator.issuesH', [240, 380, 560], 380);

const LAYER_NAMES: Record<string, string> = { LINT: 'L1 Lint', DRYRUN: 'L2 Dry-run', ADVISOR: 'L3 建议' };

/* ═══ 1317：校验问题行右键 ═══
 每条问题都是要贴进工单/群聊的待办，此前只能一条条手抄「哪一层、哪个码、说什么」。
 一级两动作（整条 / 只要修正建议），其余进「更多…」——与全站菜单两级语言一致。
 文案里带层名人类可读名（L1 Lint 而非 LINT 裸码），贴出去对方不用回来问。 */
const issueMenu = ref<{ x: number; y: number; iss: any } | null>(null);
function openIssueMenu(e: MouseEvent, iss: any) {
  issueMenu.value = { x: e.clientX, y: e.clientY, iss };
}
function onIssueMenuKey(e: KeyboardEvent, iss: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  issueMenu.value = { ...menuKeyAnchor(e), iss };
}
async function copyIssueText(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const issueLine = (iss: any) =>
  `[${iss.severity}] ${LAYER_NAMES[iss.layer] || iss.layer} · ${iss.code}`
  + (iss.path ? ` @ ${iss.path}` : '') + `: ${iss.message}`;
const issueMenuItems = computed<CcmItem[]>(() => {
  const m = issueMenu.value;
  if (!m) return [];
  const iss = m.iss;
  return [
    { key: 'cv-iss-line', label: '复制此问题（级别+层+码+说明）', icon: ClipboardList,
      run: () => void copyIssueText(issueLine(iss), '问题已复制') },
    ...(iss.suggestion
      ? [{ key: 'cv-iss-sug', label: '只复制修正建议', icon: Info,
          run: () => void copyIssueText(String(iss.suggestion), '修正建议已复制') }]
      : []),
    { key: 'cv-iss-more', label: '更多…', icon: Copy, sep: true, children: [
      { key: 'cv-iss-msg', label: '只复制说明', icon: Info,
        run: () => void copyIssueText(String(iss.message ?? ''), '说明已复制') },
      { key: 'cv-iss-path', label: '只复制字段路径', icon: Copy,
        run: () => void copyIssueText(String(iss.path ?? ''), '路径已复制') },
      { key: 'cv-iss-json', label: '复制整条 JSON', icon: Braces,
        run: () => void copyIssueText(JSON.stringify(iss, null, 2), '问题 JSON 已复制') },
      { key: 'cv-iss-all', label: `复制全部问题（${report.value?.issues?.length ?? 0} 条）`, icon: ClipboardList,
        run: () => void copyIssueText((report.value?.issues ?? []).map(issueLine).join('\n'), '全部问题已复制') },
    ] },
  ];
});

/* 校验报告头计数串（MetaStrip 统一件 items）——err/warn/info 计数走组件 tone 档，
 Dry-run 结论收 text 段（文案逐字同步更新）；TookBadge 段走组件默认插槽（sep 自动化归组件） */
const cvRpMeta = computed<MetaStripItem[]>(() => {
  const r = report.value;
  if (!r) return [];
  return [
    ...(r.errorCount ? [{ value: r.errorCount, label: '错误', tone: 'err' as const }] : []),
    ...(r.warnCount ? [{ value: r.warnCount, label: '警告', tone: 'warn' as const }] : []),
    ...(r.infoCount ? [{ value: r.infoCount, label: '建议', tone: 'info' as const }] : []),
    ...(r.dryRunExecuted
      ? [{ text: 'Dry-run ' + (r.dryRunPassed ? '✔ ES 实测可建' : '✘ ES 拒绝') }]
      : r.valid ? [{ text: '未执行 Dry-run（仅静态 Lint）' }] : []),
  ];
});

/* 模板画廊：拿来即用的起步配置（前端静态，覆盖团队最高频场景） */
const TEMPLATES = [
  {
    name: '标准检索表', desc: 'keyword 精确 + text 全文（含 .keyword 子字段），dynamic strict 防脏字段', tags: ['通用', 'strict'],
    settings: { number_of_shards: 1, number_of_replicas: 1, refresh_interval: '1s' },
    mapping: {
      dynamic: 'strict',
      properties: {
        id: { type: 'long' },
        code: { type: 'keyword' },
        name: { type: 'text', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
        status: { type: 'integer' },
        update_time: { type: 'date', format: 'yyyy-MM-dd HH:mm:ss||epoch_millis' },
      },
    },
  },
  {
    name: '中文 IK 分词', desc: 'ik_max_word 建索引 + ik_smart 搜索（需 analysis-ik 插件，Dry-run 可实测）', tags: ['中文', 'IK 插件'],
    settings: { number_of_shards: 1, number_of_replicas: 1 },
    mapping: {
      dynamic: 'strict',
      properties: {
        title: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
        content: { type: 'text', analyzer: 'ik_max_word', search_analyzer: 'ik_smart' },
        publish_date: { type: 'date' },
      },
    },
  },
  {
    name: '自定义 analyzer', desc: '标准 tokenizer + lowercase/asciifolding 链，演示 analysis 段正确写法', tags: ['analysis', '自定义'],
    settings: {
      number_of_shards: 1, number_of_replicas: 1,
      analysis: {
        analyzer: { my_analyzer: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] } },
        normalizer: { my_normalizer: { type: 'custom', filter: ['lowercase'] } },
      },
    },
    mapping: {
      properties: {
        name: { type: 'text', analyzer: 'my_analyzer' },
        tag: { type: 'keyword', normalizer: 'my_normalizer' },
      },
    },
  },
  {
    name: '日志时序索引', desc: '@timestamp + 关键维度，副本 0 提示会被 Advisor 点名（演示 L3）', tags: ['日志', '时序'],
    settings: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '30s' },
    mapping: {
      dynamic: 'strict',
      properties: {
        '@timestamp': { type: 'date' },
        level: { type: 'keyword' },
        logger: { type: 'keyword' },
        message: { type: 'text' },
        trace_id: { type: 'keyword' },
      },
    },
  },
  {
    name: 'Nested 主子明细', desc: '订单 + nested 明细行，正确声明 nested 避免扁平化交叉命中', tags: ['nested'],
    settings: { number_of_shards: 1, number_of_replicas: 1 },
    mapping: {
      dynamic: 'strict',
      properties: {
        order_no: { type: 'keyword' },
        amount: { type: 'scaled_float', scaling_factor: 100 },
        items: {
          type: 'nested',
          properties: { sku: { type: 'keyword' }, qty: { type: 'integer' }, price: { type: 'scaled_float', scaling_factor: 100 } },
        },
      },
    },
  },
] as const;

function applyTemplate(t: any) {
  settingsText.value = JSON.stringify(t.settings, null, 2);
  mappingText.value = JSON.stringify(t.mapping, null, 2);
  showGallery.value = false;
  report.value = null;
  validateErr.value = '';
  store.notify('success', `已载入模板「${t.name}」，可直接校验或按需改造`);
}

async function doValidate(dryRun: boolean) {
  /* 键盘（Monaco Ctrl+Enter）/错误条重试与按钮同汇入本函数——执行体首行单源守卫 */
  if (!canValidate.value) { store.notify('warning', '配置校验需要配置校验页或托管重建写权限'); return; }
  busy.value = true;
  /* G6-B7：记录本次模式供 err-bar 重试重跑同模式；开始即清旧失败条 */
  lastDryRun.value = dryRun;
  validateErr.value = '';
  try {
    report.value = await api.configLab.validate(
      settingsText.value.trim() || undefined,
      mappingText.value.trim() || undefined,
      dryRun,
    );
  } catch (e: any) {
    /* G6-B7：失败进顶置 err-bar（读链路收敛），不清旧报告——有旧报告时并存；不再仅 toast 落回引导空态（ 同构） */
    validateErr.value = '校验请求失败：' + friendlyEsError(String(e?.message ?? e));
    store.notify('error', '校验请求失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { busy.value = false; }
}

/* 系统生成键：导入现有索引配置时剔除，产出可复用模板 */
const SYS_KEYS = ['index.uuid', 'index.creation_date', 'index.provided_name', 'index.version.created', 'index.version.upgraded'];

async function doImport() {
  importing.value = true;
  try {
    const r = await api.clusterInspect(importIndex.value.trim(), 0);
    const settingsByIdx = r.settings || {};
    const mappingsByIdx = r.mappings || {};
    const firstIdx = Object.keys(settingsByIdx)[0] || Object.keys(mappingsByIdx)[0];
    if (!firstIdx) throw new Error('未取到索引配置：' + (r.settingsError || r.mappingsError || '索引不存在'));
    const flat: Record<string, string> = settingsByIdx[firstIdx] || {};
    const cleaned: Record<string, string> = {};
    Object.entries(flat).forEach(([k, v]) => {
      if (!SYS_KEYS.some(s => k === s || k.startsWith(s + '.'))) cleaned[k.replace(/^index\./, '')] = v as string;
    });
    settingsText.value = JSON.stringify(cleaned, null, 2);
    mappingText.value = JSON.stringify(mappingsByIdx[firstIdx] || {}, null, 2);
    report.value = null;
    validateErr.value = '';
    showImport.value = false;
    store.notify('success', `已导入 ${firstIdx} 的配置（系统键已剔除）`);
  } catch (e: any) {
    store.notify('error', '导入失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { importing.value = false; }
}

/* 建索引确认收敛全局 askConfirm——后果前置 + facts 具名行（目标集群/索引名），
 确认后才进 doCreate（原 ConfirmModal @confirm 等价改写） */
async function askCreate() {
  if (!canOps.value) { store.notify('warning', '创建索引需要 REBUILD_OP/CLUSTER_OP/ADMIN 角色'); return; }
  const ok = await askConfirm({
    title: '创建索引',
    message: '将用当前已通过校验的配置真实创建索引（需写权限，REBUILD_OP/CLUSTER_OP/ADMIN 角色）。建错可在数据浏览器中删除。',
    level: 'warn',
    okText: '确认创建',
    facts: [
      { label: '目标集群', value: store.isRemote ? store.targetName : '宿主集群' },
      { label: '索引名', value: createName.value.trim() },
    ],
  });
  if (!ok) return;
  doCreate();
}

async function doCreate() {
  if (!canOps.value) { store.notify('warning', '创建索引需要 REBUILD_OP/CLUSTER_OP/ADMIN 角色'); return; }
  /* 2.1.6：执行体防重 */
  if (creating.value) return;
  creating.value = true;
  try {
    await api.createIndex(createName.value.trim(), settingsText.value.trim() || undefined, mappingText.value.trim() || undefined);
    store.notify('success', `索引 ${createName.value.trim()} 已创建`);
    store.loadIndices();
  } catch (e: any) {
    store.notify('error', '创建失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally { creating.value = false; }
}

/* G249：原始 IO 快查（557/757 同款三件套）——特征 /config-lab/validate
 （POST 校验本页唯一端点）；判空 rec=null（本页还没校验过）时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/config-lab/validate');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次校验（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}
</script>

<style scoped>
/* 搜索定位轮：栏内搜索行 */
.cv-find { width: 130px; padding: var(--sp-0) var(--sp-2); font-size: var(--fs-xs); margin-left: var(--sp-1h); }
.cv-find-mc { font-size: var(--fs-xs); color: var(--muted); min-width: 34px; text-align: center; }
/* G6-S1：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 亚阶梯(≤3px) / 行级密排不动 */
.cv-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
.cv-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); gap: var(--sp-3); flex-wrap: wrap; }
/* W-F：.cv-hd-l/.cv-hd-ic/.cv-hd-tt/.cv-hd-sub/.cv-hd-r 死规则删除（页头已迁 PageHeader） */

/* cv-import 横幅容器框退役（bg+border+radius+框 padding 整块消除）——工具行直贴 */
.cv-import { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
/* 宽度挂 min(260px,100%) 钳制（900 档 width:100% 覆盖的窄档前补 485/375 兜底，
 AnalysisSettings .as-ii 同步同款）——极窄容器不再横向溢出 */
.cv-import .inp { width: min(260px, 100%); }
.cv-import-tip { font-size: var(--fs-xs); color: var(--muted); }

.cv-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
.cv-tpl { padding: var(--sp-3); background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--r-m); cursor: pointer; transition: border-color var(--tr); }
.cv-tpl:hover { border-color: var(--brand); }
/* W-F：模板卡名 600 失序归位 650（口径 B 卡头档） */
.cv-tpl-nm { font-size: var(--fs-sm); font-weight: 650; margin-bottom: 3px; }
.cv-tpl-desc { font-size: var(--fs-xs); color: var(--muted); line-height: 1.35; margin-bottom: var(--sp-2); }
.cv-tpl-tags { display: flex; gap: var(--sp-1); flex-wrap: wrap; }
/* .cv-tag 私造 chip 皮随 StatusPill 改用退役（同语言，中性 n 档） */

/* W2 批：双栏比例可调——中缝 11px SplitHandle 占位列，左宽走 --cv-left-w（默认 1fr 等分） */
.cv-grid { display: grid; grid-template-columns: var(--cv-left-w, 1fr) 11px minmax(0, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-3); min-height: 0; }
/* 双编辑器弹性（原 300px 写死）：首行行高 minmax(300px, 42vh) 随视口伸缩、300px 兜底；
 页面需随校验报告滚动，故不能整页锁 100% 高，只弹编辑器行 */
.cv-grid { grid-template-rows: minmax(300px, 42vh); }
/* 轨4：cv-card 壳 chrome 退役（540 df/rd/sy 同语言）——内容直贴，分界由
 cv-card-hd 既有 border-bottom 承接；overflow+flex+min-height 骨架逐字保留（收缩防撑破
 是结构语义非 chrome；下方 monaco-host 260px 锚 selectorUnify532/ 双源在册） */
.cv-card { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
/* min-height:0 → 260px 塌缩兜底（AnalyzeView:546/BulkEditorView:331 同款范式）——
 ≤1100px stacked 档（cv-grid 单列）mapping 卡落隐式行（行高 auto），host height:100% 解析不到
 定高祖先=0 高坍缩；flex:1 1 0 吸收卡内剩余高、260px 下限兜底（桌面 minmax(300px,42vh) 定行不受影响） */
.cv-card > :deep(.monaco-host) { flex: 1 1 0; min-height: 260px; }
/* 轨4：编辑器外框退役（约定③，558(b) av-left/br-pane 同语言独立追加——
 上方 260px 锚行 selectorUnify532/ 双源逐字锁零触）；cv-card-hd 既有
 border-bottom 承接分界 */
.cv-card > :deep(.monaco-host) { border: none; border-radius: 0; }
/* W-F：卡头 400 失序归位 650（口径 B；条状壳保留，em 副文本 400 保留） */
.cv-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }
.cv-card-hd em { font-style: normal; font-weight: 400; font-size: var(--fs-xs); color: var(--muted); }

/* cv-report 整卡壳退役（bg+border+radius+overflow 整块消除）→ border-top 分节 */
.cv-report { border-top: 1px solid var(--border); padding-top: var(--sp-2); }
.cv-rp-hd { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border); flex-wrap: wrap; }
/* rp-hd 首位的自写状态徽标（pill n + ok/err 别名档 + 呼吸图标）改用 StatusPill
 统一件退役——色档/胶囊形态归组件 tone 单源（g/r），锚类随模板摘除清零 */
/* cv-rp-meta 基础形态（flex/b/i/mono/tone 色档）与 .c-err/.c-warn/.c-info 手配色
 随 MetaStrip 改用退役（形态归组件单源，metaStripAdoption 六视图先例）；类名保留作模板锚 */
.cv-rp-act { margin-left: auto; display: flex; gap: var(--sp-2); align-items: center; }
.sm-inp { width: min(200px, 100%); } /* ：200px 裸宽挂 min() 钳制（cv-import .inp 同步同款） */

/* W2 批：max-height 走内联 usePref（configvalidator.issuesH，默认 380=原写死值） */
.cv-issues { overflow: auto; }
.cv-issue { display: flex; gap: var(--sp-2); align-items: flex-start; padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); }
.cv-issue:last-child { border-bottom: 0; }
/* sev 徽标改用全局 .pill 语义档（W9 .pill.err/.warn/.info 已落 theme.css）——
 .cv-iss-sev 瘦身为布局壳（flex 行内防压缩+微下沉），字号/字重/胶囊形态归 .pill 单一出处；
 W-F：上方瘦身前旧声明残留整条删除（与布局壳规则重复，规格归注释） */
.cv-iss-sev { flex-shrink: 0; margin-top: 1px; }
.cv-iss-layer { flex-shrink: 0; font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-0); width: 68px; }
.cv-iss-code { flex-shrink: 0; font-family: var(--mono); font-size: var(--fs-xs); color: var(--muted); margin-top: var(--sp-0); }
.cv-iss-body { flex: 1; min-width: 0; }
.cv-iss-msg { line-height: 1.5; word-break: normal; overflow-wrap: anywhere; }
.cv-iss-path { font-family: var(--mono); font-size: var(--fs-xs); color: var(--brand); margin-right: var(--sp-1h); }
.cv-iss-sug { display: flex; gap: var(--sp-1); align-items: center; margin-top: 3px; font-size: var(--fs-xs); color: var(--success); }
.cv-clean { padding: var(--sp-4); text-align: center; font-size: var(--fs-md); color: var(--success); }


@media (max-width: 1100px) { .cv-grid { grid-template-columns: 1fr; } .cv-split { display: none; } }
/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——双栏堆叠已由 1100 档
 合并，此处收侧距 + 导入行换行（导入输入框独占一行，窄视口不再与导入钮挤一行） */
@media (max-width: 900px) {
  .cv-page { padding: var(--sp-2) var(--sp-2h) var(--sp-4); }
  .cv-import { flex-wrap: wrap; }
  .cv-import .inp { width: 100%; }
}
</style>
