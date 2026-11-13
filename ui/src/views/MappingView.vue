<template>
  <div class="mp">
    <!-- 只读身份的前置说明：写钮隐藏时不让页面变成无解释的空壳（RestView 只读说明条同款） -->
    <div v-if="auth.probed && !canOps && !canSettings" class="mp-perm-note" role="status">
      <Shield :size="13" /> 当前身份只读：添加字段需 mapping 写权限，动态设置需 mapping/index-settings 写权限。
    </div>
    <!-- 交互修复：空态补「最近使用」chips——store.recentIdx 即全站最近工作索引（切集群自动清空），
 过滤出当前集群仍存在的取前 5；点击 store.pick 即选中进入（本页 follow + watch pickedIdx 自动加载）。
 条件插槽：chips 为空时 default 插槽整个缺席，EmptyState 不渲染 es-extra 空容器 -->
    <EmptyState v-if="!store.pickedIdx" :icon="Braces" text="先在顶栏选择一个索引" centered>
      <template v-if="recentPicks.length" #default>
        <span class="mp-recent-label">最近使用：</span>
        <button v-for="n in recentPicks" :key="n" class="mp-recent-chip mono" :title="'选中并打开：' + n" @click="store.pick(n)">{{ n }}</button>
      </template>
    </EmptyState>

    <template v-else>
      <!-- 统一页头：图标 + 页面名 + 索引名入 PageHeader #subtitle（.mono-trunc 截断 + title 全名），本地 .mp-head/.mp-title/.mp-sub 删除 -->
      <PageHeader :icon="Braces" title="Mapping">
        <template #subtitle>
          <span class="mono mono-trunc" :title="store.pickedIdx">{{ store.pickedIdx }}</span>
          · {{ fmtNum(docCount) }} 条文档 · {{ fieldRows.length }} 个字段
        </template>
        <template #actions>
          <button class="btn sm" @click="load" :disabled="loading"><RefreshCw :size="12" :class="{ spinning: loading }" /> 刷新</button>
          <!-- 任何面板都可能有取舍，原始 JSON 是最终「看全」兜底 -->
          <button class="btn sm" :disabled="!data" @click="rawOpen = true"><FileJson :size="12" /> 原始 JSON</button>
          <button v-if="canOps" class="btn sm" @click="addOpen = true"><Plus :size="12" /> 添加字段</button>
          <button v-if="canSettings" class="btn sm" @click="settingsOpen = true"><Settings2 :size="12" /> 动态设置</button>
        </template>
      </PageHeader>

      <!-- 三态契约 loading 位：SkeletonBox 骨架（照 IndexSettingsView 范式），不再用圆环。
 骨架壳（card + padding:var(--sp-4) 内联）退役——骨架裸置
 （SystemView:65 先例）；.mp flex gap 承担与页头间距 -->
      <div v-if="loading && !data">
        <SkeletonBox v-for="i in 8" :key="i" height="34px" round style="margin-bottom:var(--sp-2)" />
      </div>

      <!-- 拉取失败不渲染空壳表格，给出原因与重试
 裸 .empty 迁 EmptyState compact，重试按钮改 actionText 等价保留 -->
      <EmptyState v-else-if="loadErr" compact :icon="AlertTriangle"
        :text="'mapping 拉取失败：' + loadErr" action-text="重试" @action="load" />

      <!-- v-else 合并 template 包裹（栅格+Settings 折叠节同分支——折叠节
 不得在 loading/错误态渲染空壳） -->
      <template v-else>
      <div class="mp-grid">
        <!-- 字段表： 改用统一折叠树——深嵌套可折叠、搜索显全路径、DSL 污染警示。
 pane 壳三件套（border/bg/radius）退役（535 SqlBridge pane 直贴约定
 续扫）——自带 padding/overflow 原样，摘 .card 摘壳不搬内容 -->
        <div class="mp-fields">
          <!-- vh-offset fallback 删除（theme.css :root 已定义，死 fallback 与 BrowserView 同步清） -->
          <MappingFieldTree :properties="mergedProps" :index="store.pickedIdx" v-model:keyword="kw"
            max-height="calc(100vh - var(--vh-offset) + 90px)" @analyze="quickAnalyze" />
        </div>

        <!-- 右列。：Settings 迁出窄右栏（240–300px 内长键 indexing.slowlog.*
 折 2–3 行不可读，实报「右边 setting 太小了看不清」）→ 字段树下方全宽
 折叠节（用户「上下」选项终审）。本列只留类型分布（体量小、窄栏适配）。 -->
        <div class="mp-side">
          <!-- 类型分布 donut。：右列 .card 壳退役（约定④；左栏 mp-fields 547 已裸，
 同页双标根治）→ border-top 分节（mp-sec 同锚） -->
          <div class="mp-sec">
            <div class="card-t"><PieChart :size="13" /> 类型分布</div>
            <div class="mp-donut-wrap">
              <svg :width="120" :height="120" viewBox="0 0 42 42" role="img"
                :aria-label="'字段类型分布，共 ' + fieldRows.length + ' 个字段'">
                <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--bg2)" stroke-width="5"></circle>
                <circle v-for="s in donutSegs" :key="s.type" cx="21" cy="21" r="15.9" fill="none"
                  :stroke="s.color" stroke-width="5"
                  :stroke-dasharray="`${s.pct} ${100 - s.pct}`" :stroke-dashoffset="s.offset"
                  transform="rotate(-90 21 21)" class="mp-arc">
                  <!-- G215：图例/弧段 tooltip 走 fieldTypeZh 单源（esEnumZh 表） -->
                  <title>{{ fieldTypeZh(s.type) }}: {{ s.count }}</title>
                </circle>
                <text x="21" y="21" text-anchor="middle" dominant-baseline="central" class="mp-donut-num">{{ fieldRows.length }}</text>
              </svg>
              <div class="mp-legend">
                <div v-for="s in donutSegs" :key="s.type" class="mp-leg-row">
                  <span class="mp-leg-dot" :style="{ background: s.color }"></span>
                  <span class="mono mp-leg-t" :title="fieldTypeZh(s.type) + ' · ' + s.count + ' 个字段'">{{ s.type }}</span>
                  <span class="mono mp-leg-n">{{ s.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings 全宽折叠节（迁出窄右栏的落点）——节头+摘要+chevron
 =全站折叠节范式（usePref 记忆缺省展开：用户诉求是「看见」；对照 DslQuery
 buildCollapsed 缺省 true 因构建区体量大）；含默认值钮置节头右侧兄弟位
 （规避 button 嵌套 button）。设计稿 docs/design-mapping-settings-562.html
 （visual-judge 五点通过在档）。
 settings 内容： 全站统一 SettingsGrid（dot-key 断点/复制/过滤/默认值灰显
 内置）不动——全宽下长键单行零折行，值右对齐一眼可读。 -->
      <div class="mp-set-sec">
        <div class="mp-set-head">
          <button type="button" class="mp-set-tg" :class="{ closed: setCollapsed }"
            :aria-expanded="!setCollapsed" title="索引 Settings：展开/收起（记忆保留）"
            @click="setCollapsed = !setCollapsed">
            <SlidersHorizontal :size="13" />
            Settings
            <span class="mp-set-n" :class="{ zero: settingsRows.length === 0 }"
              :title="'当前 ' + settingsRows.length + ' 行' + (showDefaults ? '（含集群默认值，灰显行=未显式设置）' : '（仅显式设置，开「含默认值」看全量）')">{{ settingsRows.length }}</span>
            <span v-if="staticCount" class="mp-set-static">静态 {{ staticCount }}</span>
            <ChevronDown :size="13" class="mp-set-chev" :style="{ transform: setCollapsed ? 'rotate(-90deg)' : '' }" />
          </button>
          <span class="mp-set-sp"></span>
          <!-- 高度四档循环（IndexHub settingsH 同款；usePref 记忆，
 满=''=不设上限吃满页面滚动） -->
          <button aria-label="Settings 区高度档位" class="btn sm ghost" :title="'Settings 区高度：' + (settingsH || '满') + '（点击循环 四档）'" @click="cycleSettingsH"><ArrowUpDown :size="11" /></button>
          <button class="btn sm" :class="{ pri: showDefaults }" :disabled="defaultsLoading"
            title="叠加集群默认值（include_defaults），灰显区分显式设置" @click="toggleDefaults">
            <span v-if="defaultsLoading" class="spinning"></span> 含默认值
          </button>
        </div>
        <div v-show="!setCollapsed" class="mp-set-body">
          <SettingsGrid :rows="settingsRows" strip-prefix="index." :filterable="showDefaults"
            :analyze-index="store.pickedIdx || ''"
            :max-height="settingsH" />
        </div>
      </div>
      </template>
    </template>

    <!-- 添加字段 -->
    <n-modal v-model:show="addOpen" preset="card" title="添加字段（PUT _mapping）" style="width:640px;max-width:94vw" :bordered="false">
      <div class="mp-modal-tip">
ES 仅允许<b>新增</b>字段；修改已有字段类型需走零停机重建。
        <a class="mp-link" role="link" tabindex="0" @click="gotoDesigner" @keydown.enter.prevent="gotoDesigner">用可视化设计器加字段 →</a>
        <a class="mp-link" role="link" tabindex="0" @click="gotoRebuild" @keydown.enter.prevent="gotoRebuild">改类型 → 零停机重建</a>
      </div>
      <!-- 220px 定高改视口档 min(60vh,220px)（ Ilm 策略弹窗 min(60vh,358px) 范式）——矮屏不再顶出弹窗滚两层 -->
      <MonacoEditor ref="mpMappingMonaco" v-model="newMapping" height="min(60vh,220px)" :dsl-assist="mpMappingAssist" />
      <div v-if="!newMappingValid" class="mp-modal-bad">JSON 不合法，修正后才可提交</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="addOpen = false">取消</button>
          <button v-if="canOps" class="btn pri" :disabled="!newMappingValid || putting" :title="newMappingValid ? '' : 'JSON 不合法'" @click="askPutMapping">{{ putting ? '提交中…' : '提交' }}</button>
        </div>
      </template>
    </n-modal>

    <!-- 动态设置 -->
    <n-modal v-model:show="settingsOpen" preset="card" title="热更新动态 settings" style="width:640px;max-width:94vw" :bordered="false">
      <div class="mp-modal-tip">仅动态设置可热更新（如 <span class="mono">index.refresh_interval</span>、<span class="mono">index.number_of_replicas</span>、<span class="mono">index.blocks.*</span>）。</div>
      <!-- 180px 定高改视口档 min(60vh,180px)（同上范式，原值兜底） -->
      <MonacoEditor ref="mpSettingsMonaco" v-model="newSettings" height="min(60vh,180px)" :dsl-assist="mpSettingsAssist" />
      <div v-if="!newSettingsValid" class="mp-modal-bad">JSON 不合法，修正后才可提交</div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="settingsOpen = false">取消</button>
          <button v-if="canSettings" class="btn pri" :disabled="!newSettingsValid || putting" :title="newSettingsValid ? '' : 'JSON 不合法'" @click="askPutSettings">{{ putting ? '提交中…' : '提交' }}</button>
        </div>
      </template>
    </n-modal>

    <!-- 原始 JSON 兜底——mappings + settings 完整原文，可复制 -->
    <n-modal v-model:show="rawOpen" preset="card" :title="'原始 JSON — ' + store.pickedIdx" style="width:760px;max-width:94vw" :bordered="false">
      <!-- 点击 JSON 即全选——复制按钮万一被浏览器策略拦（iframe 剪贴板权限），
 手动 Ctrl+C 是零门槛兜底，不再「看得见复制不上」 -->
      <!-- rawJson 走 highlightJson 高亮（转义安全 v-html；rawJson 本身已是 JSON.stringify(_,null,2) pretty 串） -->
      <pre ref="rawPreEl" class="mono mp-raw scroll-y" role="button" tabindex="0" title="点击全选，Ctrl+C 复制" @click="selectAllRaw" @keydown.enter.prevent="selectAllRaw" @keydown.space.prevent="selectAllRaw" v-html="highlightJson(rawJson)"></pre>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <!-- 跨页直通——复制 JSON 的最高频目的地是托管重建改分词，sessionStorage
 契约直传（零剪贴板参与、必然成功），落地自动解析拆填审编框 -->
          <button class="btn" :disabled="!store.pickedIdx" :title="store.pickedIdx ? '直达托管重建审编步，自动解析拆填' : '需先选中索引'" @click="sendToRebuild"><Hammer :size="12" /> 发送到托管重建</button>
          <button class="btn" @click="copyRaw"><Copy :size="12" /> 复制全部</button>
          <button class="btn" @click="rawOpen = false">关闭</button>
        </div>
      </template>
    </n-modal>

    <!-- PUT mapping / PUT settings 两个本地 ConfirmModal 宿主退役，收敛全局 askConfirm（App.vue 唯一宿主） -->
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { NModal } from 'naive-ui';
import { Shield, Braces, RefreshCw, Plus, Settings2, PieChart, SlidersHorizontal, FileJson, Copy, Hammer, AlertTriangle, ChevronDown, ArrowUpDown } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import { useIdxState, usePref } from '../composables/urlState';
import { useTierCycle } from '../composables/useTierCycle';
import { useScopedDraft } from '../composables/useScopedDraft';
import { fmtNum, copyText } from '../utils/format';
import { flattenMapping } from '../utils/mappingTree';
import { useModalEnter } from '../composables/useModalEnter';
import { toSettingRows, mergeDefaultRows, isStaticSettingKey, type SettingRow } from '../utils/settingsView';
import MonacoEditor from '../components/MonacoEditor.vue';
import { lintMappingBody, lintSettingsBody } from '../utils/dslLint'; /* P1-1：档路由静态 lint */
import { useDebounceFn } from '../composables/useDebounceFn'; /* P1-1：划线防抖统一件 */
/* 本地 ConfirmModal 宿主退役，改全局确认服务 */
import { askConfirm } from '../composables/confirm';
import { friendlyEsError } from '../utils/esError';
import { fieldTypeZh } from '../utils/esEnumZh'; /* G215：donut 图例/弧段 tooltip 中文释义单源（只读消费） */
import { highlightJson } from '../utils/jsonc';
import MappingFieldTree from '../components/MappingFieldTree.vue';
import SettingsGrid from '../components/SettingsGrid.vue';
import type { BodyKind } from '../utils/dslCompletionContext';
import { writeStoredRaw } from '../utils/safeJson';

const store = useAppStore();
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/put-mapping', store.target));
/* 热 Setting 的两个入口同权（后端 SHARED_WRITE 同源）：/cluster/update-settings 的归属页集是
   mapping/index-settings/indices/optimizer。动态设置提交必须按它判权——复用 put-mapping 的
   canOps 会把「持 mapping 读 + index-settings 写」的人挡在保存按钮外（有权限的人被拦）。 */
const canSettings = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/cluster/update-settings', store.target));
const router = useRouter();
/* analyzer 快验联动——带字段路径深链跳分析实验室（verifyField 同语义） */
function quickAnalyze(f: any) {
  if (!f?.path) return;
  router.push({ path: '/analyzer-lab', query: { analyzerField: f.path } });
}
/* 加字段弹层联动：可视化设计器 / 零停机重建（携带当前索引上下文） */
function gotoDesigner() { router.push({ path: '/mapping-designer', query: { idx: store.pickedIdx } }); }
function gotoRebuild() { router.push({ path: '/adhoc-rebuild', query: { index: store.pickedIdx } }); }
/* ux2 ：两个 n-modal 编辑器挂 dslAssist（mapping 骨架/settings 键，W6 现成分档）。
 +1：mpMappingAssist 增 analyzers 值位通道——「添加字段」弹层打开时拉一次
 analysisSettings（按索引记忆，失败零降级=不出值位候选），把自定义 analyzer 组件名注入。
 1439：normalizer 单列通道（mapping 的 normalizer 键只应出 normalizer 名，
 不再把 analyzer/tokenizer 名混进来）。 */
const analyzerCandidates = ref<string[]>([]);
const normalizerCandidates = ref<string[]>([]);
const mpMappingAssist = {
  fields: (): { path: string; type: string }[] => [],
  bodyKind: (): BodyKind => 'mapping',
  analyzers: () => analyzerCandidates.value,
  normalizers: () => normalizerCandidates.value,
};
const mpSettingsAssist = { fields: (): { path: string; type: string }[] => [], bodyKind: (): BodyKind => 'settings' };
const data = ref<any>(null);
const loading = ref(false);
const loadErr = ref('');
/* 字段过滤词 → 改会话草稿：本页不在路由 KeepAlive 白名单，
 useUrlState 的值只活在 URL query 里，SPA 切走(导航改写 hash)即丢、切回重新挂载读到裸路径——
 产线实测「切页签过滤词必丢」。sessionStorage 草稿(按索引作用域)刷新/切页双向保留；
 深链分享 kw 的场景让位于持久性(过滤词无分享价值)。换索引即清，防 A 索引词串 B。 */
const kwDraft = useScopedDraft('filter', { route: 'indices-mapping', index: () => store.pickedIdx || '' }, '');
const kw = kwDraft.text;
watch(() => store.pickedIdx, () => kwDraft.clear());
/* 接入全局工作索引（ 收敛时本页遗漏）——此前深链 ?idx= 永远落在
 「先在顶栏选择一个索引」空态；只读视图，开启 follow 顶栏切换即跟随 */
useIdxState({ follow: true });

/* 空态「最近使用」chips：store.recentIdx 即全站最近工作索引（es_recent_idx，切集群自动清空），
 过滤出当前集群仍存在的索引取前 5，避免点到已删除索引；点击仅 store.pick——
 本页 follow 深链同步 + watch(pickedIdx)→load 现成接手，不新增任何请求逻辑 */
const recentPicks = computed<string[]>(() =>
  store.recentIdx
    .map(n => store.indices.find(i => i.index === n)?.index)
    .filter((x): x is string => !!x)
    .slice(0, 5),
);

async function load() {
  if (!store.pickedIdx) return;
  const idx = store.pickedIdx;
  loading.value = true;
  loadErr.value = '';
  try { const r = await api.clusterInspect(idx, 0); if (idx !== store.pickedIdx) return; data.value = r; }
  catch (e: any) {
    if (idx !== store.pickedIdx) return;
    /* 裸错误串改 friendlyEsError（inspect 失败的操作上下文前缀由其内部保留） */
    loadErr.value = friendlyEsError(e?.message || String(e));
    data.value = null;
    store.notify('error', 'inspect 失败: ' + loadErr.value);
  }
  finally { if (idx === store.pickedIdx) loading.value = false; }
}
onMounted(load);
watch(() => store.pickedIdx, load);

/* 文档数：inspect docCount 优先；集群偶发 docCountError 时兜底 _cat 口径（顶栏同源），不显示 '-' 误导 */
const docCount = computed(() => {
  const d = data.value?.docCount;
  if (d != null && d >= 0) return d;
  const row: any = store.indices.find(i => i.index === store.pickedIdx);
  return row?.['docs.count'] ?? null;
});

/* 多物理索引（别名）properties 合并，首见优先——重建窗口期不漏字段；
 拍平/折叠/污染检测全部收敛到 utils/mappingTree，与索引工作区 Mapping Tab 同一口径 */
const mergedProps = computed<Record<string, any>>(() => {
  const maps = data.value?.mappings || {};
  const out: Record<string, any> = {};
  for (const m of Object.values(maps) as any[]) {
    for (const [k, v] of Object.entries(m?.properties || {})) {
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
});
const fieldRows = computed(() => flattenMapping(mergedProps.value));

/* 类型统计 donut */
const PALETTE = ['var(--dv-indigo)', 'var(--dv-violet)', 'var(--dv-blue)', 'var(--ok)', 'var(--warn)', 'var(--dv-pink)', 'var(--err)', 'var(--dv-cyan)', 'var(--dv-lime)', 'var(--dv-orange)'];
const typeStats = computed(() => {
  const c: Record<string, number> = {};
  fieldRows.value.forEach(f => { c[f.type] = (c[f.type] || 0) + 1; });
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
});
const donutSegs = computed(() => {
  const total = Math.max(1, fieldRows.value.length);
  let acc = 0;
  return typeStats.value.map(([type, count], i) => {
    const pct = (count / total) * 100;
    const seg = { type, count, pct, offset: 25 - acc, color: PALETTE[i % PALETTE.length] };
    acc += pct;
    return seg;
  });
});

/* settings 拍平（多物理索引合并展示） */
const flatSettings = computed<Record<string, string>>(() => {
  const s = data.value?.settings || {};
  const out: Record<string, string> = {};
  for (const v of Object.values(s)) Object.assign(out, v || {});
  return out;
});

/* 行构建收敛到 settingsView 纯函数，过滤/复制/灰显交给 SettingsGrid */
const showDefaults = ref(false);
const defaultsLoading = ref(false);
const defaultsMap = ref<Record<string, unknown> | null>(null);
async function toggleDefaults() {
  showDefaults.value = !showDefaults.value;
  /* 折叠态点「含默认值」原样无可见反馈（节体隐藏）=交互死路——
 开启时自动展开节；关闭时不强行动作（用户可能就想先关掉） */
  if (showDefaults.value && setCollapsed.value) { setCollapsed.value = false; }
  if (!showDefaults.value || defaultsMap.value || !store.pickedIdx) return;
  defaultsLoading.value = true;
  try {
    const r = await api.indexSettingsDefaults(store.pickedIdx);
    const parsed = JSON.parse(r.body || '{}');
    const out: Record<string, unknown> = {};
    for (const node of Object.values(parsed) as any[]) Object.assign(out, node?.defaults || {});
    defaultsMap.value = out;
  } catch (e: any) {
    showDefaults.value = false;
    store.notify('error', '默认值拉取失败: ' + (e?.message || e));
  } finally { defaultsLoading.value = false; }
}
watch(() => store.pickedIdx, () => { defaultsMap.value = null; showDefaults.value = false; });
const settingsRows = computed<SettingRow[]>(() => {
  const explicit = toSettingRows(flatSettings.value);
  if (showDefaults.value && defaultsMap.value) {
    return mergeDefaultRows(explicit, toSettingRows(defaultsMap.value));
  }
  return explicit;
});
/* 全宽折叠节——收展态 usePref 记忆（缺省展开：用户诉求是「看见」）；
 节头摘要「静态 M」与 SettingsGrid 行内徽标共用 isStaticSettingKey 单源 */
const setCollapsed = usePref('mp.settingsCollapsed', false);
const staticCount = computed(() => settingsRows.value.filter(r => isStaticSettingKey(r.k)).length);
/* 高度四档循环（useTierCycle 统一件）——S/M/L/满（''=SettingsGrid
 不设 maxHeight 上限自然吃满页面滚动）；563 showDefaults 双档绑定退役，档位循环
 是唯一高度真源（双档与手调档互相覆盖必然打架，手调优先=可调节的本意） */
const { v: settingsH, cycle: cycleSettingsH } = useTierCycle(
  'mp.settingsH', ['min(42vh, 380px)', 'min(60vh, 520px)', 'min(76vh, 680px)', ''], 'min(42vh, 380px)');

/* 原始 JSON 兜底——数据已在 inspect 响应里，零额外请求 */
const rawOpen = ref(false);
const rawPreEl = ref<HTMLElement | null>(null);
const rawJson = computed(() => JSON.stringify(
  { mappings: data.value?.mappings ?? {}, settings: data.value?.settings ?? {} }, null, 2));
async function copyRaw() {
  /* v3：失败必须出声，且错误 toast 直接带「全选内容」动作——一键选中后
 Ctrl+C 走系统剪贴板，不受任何 JS 权限/焦点约束，兜底零门槛 */
  if (await copyText(rawJson.value)) { store.notify('success', '原始 JSON 已复制'); return; }
  store.notify('error', '浏览器拦下了剪贴板——内容还在弹窗里，全选后 Ctrl+C 即可', {
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
/* 跨页直通——原始 JSON 经 sessionStorage 契约直达托管重建审编步（零剪贴板，
 必然成功）。落地端 AdhocRebuildView 在 mounted/activated 消费并自动解析拆填。 */
const REBUILD_HANDOFF_KEY = 'esquerystudio.rebuild-paste';
function sendToRebuild() {
  writeStoredRaw(sessionStorage, REBUILD_HANDOFF_KEY, rawJson.value);
  rawOpen.value = false;
  router.push('/adhoc-rebuild');
}

/* 点击 JSON 区全选：兜底复制路径的第一步（后续 Ctrl+C 走系统剪贴板，不受 JS 权限约束）
 v3.0.0：Enter 键盘路径同入口——e 兼容 MouseEvent|KeyboardEvent（只读 currentTarget）。
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

/* 添加字段 */
const addOpen = ref(false);
/* G213：PUT mapping/settings 提交在途守卫（同页两写端点共享一个在途位——
 在途窗两弹窗提交钮同禁+「提交中…」文案〔纯文本钮文案通道= 口径〕；确认门
 askConfirm 关闭弹窗后用户可再开弹窗重复触发〔759 S-G213 实锚 calls 双发〕，
 doPut* 起手守卫同时挡住 Enter 通道〔useModalEnter 直达 askPut*〕） */
const putting = ref(false);
/* +1：弹层打开时拉一次 analysisSettings，收集自定义 analyzer/normalizer/
 tokenizer 组件名（按索引记忆一次；失败静默空=值位通道关闭，键位档不受影响） */
let analyzerLoadedFor = '';
async function loadAnalyzerNames() {
  if (!store.pickedIdx || analyzerLoadedFor === store.pickedIdx) return;
  analyzerLoadedFor = store.pickedIdx;
  try {
    const r: any = await api.analysisSettings(store.pickedIdx);
    const a = r?.analysis || {};
    analyzerCandidates.value = Object.keys(a.analyzer || {});
    normalizerCandidates.value = Object.keys(a.normalizer || {});
  } catch { analyzerCandidates.value = []; normalizerCandidates.value = []; }
}
watch(addOpen, v => { if (v) loadAnalyzerNames(); });
const newMapping = ref('{\n  "properties": {\n    "new_field": {\n      "type": "keyword"\n    }\n  }\n}');
/* putOpen 本地确认弹层状态删除——askConfirm Promise 化取代 */
/* 合法性前置——非法 JSON 直接禁用提交+行内提示，不让用户点了才知道 */
const newMappingValid = computed(() => { try { JSON.parse(newMapping.value); return true; } catch { return false; } });

/* ═══ P1-1：档路由静态 lint（弹窗编辑器划线通道） ═══
 lintMappingBody/lintSettingsBody 直接 import 纯函数消费（DevTools dtLint 档路由同源）；
 非法 JSON 静默返 []，setMarkers([]) 即清旧划线（DevTools 同契约）。零请求、零阻塞，
 提交门仍是既有 newMappingValid/newSettingsValid 合法性链路。 */
const mpMappingMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueMpMappingMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintMappingBody> = [];
  try { findings = lintMappingBody(JSON.parse(newMapping.value || '')); } catch { findings = []; }
  mpMappingMonaco.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(newMapping, () => { queueMpMappingMarkers(); }, { immediate: true });
async function askPutMapping() {
  if (!canOps.value) { store.notify('warning', 'mapping 变更需专项角色'); return; }
  try { JSON.parse(newMapping.value); } catch (e: any) { store.notify('error', 'JSON 非法: ' + e.message); return; }
  addOpen.value = false;
  /* 原本地 ConfirmModal（title/level=warn/okText 等价迁移；富文本索引名改纯文本句式） */
  const ok = await askConfirm({
    title: '提交 mapping 变更',
    level: 'warn',
    okText: '提交',
    message: `将向 ${store.pickedIdx} PUT 新字段 mapping。字段一旦创建不可删除/改类型。`,
  });
  if (ok) await doPutMapping();
}
async function doPutMapping() {
  if (!canOps.value) { store.notify('warning', 'mapping 变更需专项角色'); return; }
  if (putting.value) return;
  putting.value = true;
  try {
    await api.putMapping(store.pickedIdx, newMapping.value);
    store.notify('success', 'mapping 已更新');
    load();
  } catch (e: any) { store.notify('error', 'PUT mapping 失败: ' + friendlyEsError(String(e?.message ?? e))); } /* ：裸错误串 → friendlyEsError（w80 先例全站兜底） */
  finally { putting.value = false; }
}

/* 动态设置 */
const settingsOpen = ref(false);
const newSettings = ref('{\n  "index": {\n    "refresh_interval": "1s"\n  }\n}');
/* putSetOpen 本地确认弹层状态删除——askConfirm Promise 化取代 */
const newSettingsValid = computed(() => { try { JSON.parse(newSettings.value); return true; } catch { return false; } });
/* P1-1：settings 弹窗静态 lint（mpMapping 同款，置 newSettings 声明后防 TDZ） */
const mpSettingsMonaco = ref<InstanceType<typeof MonacoEditor> | null>(null);
const queueMpSettingsMarkers = useDebounceFn(() => {
  let findings: ReturnType<typeof lintSettingsBody> = [];
  try { findings = lintSettingsBody(JSON.parse(newSettings.value || '')); } catch { findings = []; }
  mpSettingsMonaco.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
}, 250);
watch(newSettings, () => { queueMpSettingsMarkers(); }, { immediate: true });
async function askPutSettings() {
  if (!canSettings.value) { store.notify('warning', 'settings 变更需专项角色'); return; }
  try { JSON.parse(newSettings.value); } catch (e: any) { store.notify('error', 'JSON 非法: ' + e.message); return; }
  settingsOpen.value = false;
  /* 原本地 ConfirmModal（title/level=warn/okText 等价迁移；富文本索引名改纯文本句式） */
  const ok = await askConfirm({
    title: '提交 settings 变更',
    level: 'warn',
    okText: '提交',
    message: `将热更新 ${store.pickedIdx} 的动态 settings。`,
  });
  if (ok) await doPutSettings();
}
async function doPutSettings() {
  if (!canSettings.value) { store.notify('warning', 'settings 变更需专项角色'); return; }
  if (putting.value) return;
  putting.value = true;
  try {
    await api.updateSettings(store.pickedIdx, newSettings.value);
    store.notify('success', 'settings 已热更新');
    load();
  } catch (e: any) { store.notify('error', 'settings 更新失败: ' + friendlyEsError(String(e?.message ?? e))); } /* G214：与 doPutMapping 同标准——先过 friendlyEsError 再拼前缀（修前 e?.message 直拼=同页两标准） */
  finally { putting.value = false; }
}

/* 表单弹窗 Enter=提交——等价点击「提交变更」钮，JSON 校验与二次确认原样生效；
   权限闸与主按钮 v-if 同源（canOps 缺席时 Enter 也不提交） */
useModalEnter(addOpen, askPutMapping, () => canOps.value);
useModalEnter(settingsOpen, askPutSettings, () => canSettings.value);
</script>

<style scoped>
.mp { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 页头已收敛 PageHeader 组件（本地 .mp-head/.mp-title/.mp-sub 删除）；
 长索引名截断走全局 .mono-trunc + title 全名 */
.mp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); gap: var(--sp-3); align-items: start; }
/* pane 壳（.card 三件套）退役——布局语义（padding/overflow）原样保留在本类 */
.mp-fields { padding: var(--sp-3) var(--sp-4); overflow: hidden; }
.mp-side { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 右列两张 .card 壳退役 → border-top 分节（约定④；原卡 padding 14px var(--sp-4)
 等值迁入，盒模型零变动——左栏 mp-fields 自带 padding 同语言） */
.mp-sec { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }
/* Settings 全宽折叠节（迁出窄右栏）——节头行=左折叠钮（图标+标题+
 共 N 项 chip+静态 M 摘要+chevron）右「含默认值」钮兄弟位；v-show 收展 */
.mp-set-sec { border-top: 1px solid var(--border); margin-top: var(--sp-3); }
.mp-set-head { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-2) var(--sp-4) 0; }
.mp-set-tg {
  display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-sm);
  font-weight: 600; color: var(--tx1); background: transparent; border: 0; border-radius: var(--r-s);
  padding: var(--sp-1) var(--sp-2); margin-left: calc(-1 * var(--sp-2)); cursor: pointer;
}
.mp-set-tg:hover { color: var(--tx0); background: var(--bg2); }
.mp-set-n { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--ac-hi); background: rgba(31, 200, 180, .12); border-radius: 99px; padding: 1px var(--sp-2); }
.mp-set-n.zero { color: var(--tx2); background: var(--bg2); }
.mp-set-static { font-family: var(--mono); font-size: var(--fs-2xs); color: var(--warn); }
.mp-set-chev { color: var(--tx2); transition: transform var(--tr); }
.mp-set-sp { flex: 1; }
.mp-set-body { padding: 0 var(--sp-4) 14px; }
.mp-donut-wrap { display: flex; align-items: center; gap: var(--sp-4); }
.mp-arc { transition: stroke-dasharray 400ms ease-out; }
.mp-donut-num { fill: var(--tx0); font: 600 6px var(--mono); }
.mp-legend { flex: 1; display: flex; flex-direction: column; gap: var(--sp-1); }
.mp-leg-row { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-xs); }
.mp-leg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; } /* ：图例色键圆点归一（全站 dot 语言=MetaStrip/ms-dot 同构；donut 色键非弧形镜像） */
.mp-leg-t { color: var(--tx1); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-leg-n { color: var(--tx0); font-weight: 600; }
/* mp-set-* kv 行已合并进 SettingsGrid 统一组件 */
/* 代码面 border 摘除（ dg-alloc-pre/pl-code 同语言）——bg2 底+radius
 保留作代码面语言；role=button 的可点 affordance 由 cursor 承担不动 */
.mp-raw { max-height: 62vh; margin: 0; padding: var(--sp-3); font-size: var(--fs-sm); line-height: 1.6; background: var(--bg2); border-radius: var(--r-m); white-space: pre-wrap; word-break: normal; overflow-wrap: anywhere; }
.mp-modal-tip { font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-3); }
.mp-link { color: var(--ac-hi); cursor: pointer; margin-left: var(--sp-2); }
.mp-link:hover { text-decoration: underline dotted; }
.mp-modal-bad { font-size: var(--fs-xs); color: var(--err); margin-top: var(--sp-2); }
/* (b)：新建弹窗两处 Monaco 直挂编辑器外框退役（ ST 面 .st-ed-wrap
 先例同语言）——n-modal 卡头 + mp-modal-tip 自承分界；monaco-host 是 MonacoEditor 根、
 携本视图 scope id，本模板仅弹窗两处直挂 Monaco（主区零 Monaco 零误伤），
 scoped 类规则直接命中；组件本体零触，纯视觉 */
.monaco-host { border: none; border-radius: 0; }

/* 空态「最近使用」chips（渲染在 EmptyState 的 es-extra 行内，横向居中换行由其统一管理） */
.mp-recent-label { font-size: var(--fs-xs); color: var(--tx2); }
.mp-recent-chip {
  max-width: 220px; padding: var(--sp-0) var(--sp-2h); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer;
  background: var(--bg2); border: 1px solid var(--line); border-radius: 99px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mp-recent-chip:hover { border-color: var(--ac-hi); color: var(--ac-hi); }

/* 窄容器塌单栏，断点归一 标准值 1100（ 实测 iframe 可用宽 ~866px） */
@media (max-width: 1100px) {
  .mp-grid { grid-template-columns: minmax(0, 1fr); }
}

/* 900 紧凑微调档（ 口径；q 遗留补齐，W-D）——字段表/侧栏堆叠已由
 1100 档合并，此处收字段卡侧距 + 类型分布环形图行允许换行（图例窄卡不再与图形硬挤） */
@media (max-width: 900px) {
  .mp-fields { padding: var(--sp-3); }
  .mp-donut-wrap { flex-wrap: wrap; }
}

/* 只读身份说明条（RestView .rt-perm-note 同款形态） */
.mp-perm-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin: 0 0 var(--sp-3); }
</style>
