<template>
  <div class="cd-page" ref="rootEl">
    <div class="cd-hd">
      <PageHeader :icon="GitCompareArrows" title="配置漂移检测" subtitle="代码 @Setting/@Mapping vs 线上索引实际配置 —— 双侧归一化后逐键对比，防止「代码已改、线上没动」两张皮" /><button class="btn ghost sm" @click="loadKeys" :disabled="loadingKeys">
        <RefreshCw :size="12" :class="{ spinning: loadingKeys }" /> 刷新
      </button><!-- 原始 IO 快查入口——
 漂移检测 drift?indexKey= 请求/响应原文直达；无记录不开空弹窗（toast 引导） -->
      <button class="btn ghost sm" title="最近一次漂移检测（drift?indexKey=）请求/响应原文（复制/curl 回放）" @click="openRawIo">
        <Terminal :size="12" /> 原始 IO
      </button>
    </div>

    <div v-if="isBrowserMode" class="cd-browser-note">
      <AlertTriangle :size="14" />
      <span>浏览器模式没有代码 provider：这里的「代码/期望」是本机首次检测时采集的基线；线上配置变化会显示为漂移。</span>
      <button v-if="picked" class="btn ghost xs" :disabled="driftBusy" @click="resetBaseline">重采基线</button>
    </div>

    <!-- G6-B4：err-bar 独立于数据互斥链顶置（G2/ 教训）——原「失败 EmptyState」困在链内：
 有旧 keys 刷新失败时 body 分支获胜，loadErr 无渲染出口退化为仅 toast；现与旧清单并存 -->
    <div v-if="loadErr" role="alert" class="err-bar rise-in">
      对象清单拉取失败：{{ loadErr }}
      <button class="btn sm" @click="loadKeys" :disabled="loadingKeys"><RefreshCw :size="12" :class="{ spinning: loadingKeys }" /> 重试</button>
    </div>

    <!-- /加载中 / 真无 provider 两态（失败态由上方 err-bar 承担）——失败绝不伪装成「无 provider」。
 W-D：42px 手写 spinner 换 SkeletonBox circle 统一件（loading 占位归骨架屏单源），文案逐字保留 -->
    <div v-if="keys.length === 0 && loadingKeys" class="cd-loading">
      <SkeletonBox circle :width="42" :height="42" class="cd-loading-sk" />
      <div class="cd-loading-tt">正在拉取对象清单…</div>
    </div>
    <EmptyState v-else-if="keys.length === 0 && !loadErr" :icon="GitCompareArrows"
                text="当前宿主没有注册 ManagedEsIndex"
                hint="漂移检测对比宿主代码里的 @Setting/@Mapping 与线上索引；纯控制台宿主无对比对象" />

    <!-- 双栏接统一可调工作台——清单栏可折叠/拖拽调宽/偏好记忆（此前固定 minmax(200px,260px) grid） -->
    <WorkbenchLayout v-else-if="keys.length" :scope="cdScope" :panes="CD_PANES" axis="vertical" mode="drift">
      <template #pane-configdrift-list>
      <!-- 左：对象清单（轨4：竖排轨退役，语义落行首横排 cd-list-tt——刀②）。
 G210：容器补 role=group 语义（G47/G142/G154 族） -->
      <div class="cd-list" role="group" aria-label="对象清单">
        <div class="cd-list-head">
          <span class="cd-list-tt">对象清单</span>
          <!-- 手写过滤框改用 SearchFilterBar 统一件（过滤词源 kw 绑定原样零触；
 Esc 清空内建、Enter 定向转出 @enter=onHitKey 与 Favorites/TemplateGallery/Watcher
 三消费方同契约；胶囊壳三件套归组件单源，cd-kw-inp 落位类挂根只留 flex/高度内衬） -->
          <SearchFilterBar v-model="kw" class="cd-kw-inp" placeholder="搜 indexKey / 别名…" @enter="onHitKey" />
          <!-- 搜索定位：命中计数 + 上/下一个（Enter/Shift+Enter 在搜索框接线） -->
          <HitNav :count="filteredKeys.length" :current="hitCur" compact @next="hitNext" @prev="hitPrev" />
          <button class="btn sm" :disabled="scanningAll" @click="scanAllVerdicts">
            <GitCompareArrows :size="12" /> {{ scanningAll ? '检测中…' : '检测全部' }}
          </button>
        </div>
        <div
          v-for="(k, i) in filteredKeys" :key="k.indexKey"
          class="cd-item" :class="{ on: picked === k.indexKey, hasv: !!verdicts[k.indexKey] }"
          :data-hit-idx="i + 1"
          :aria-current="picked === k.indexKey || undefined"
          @click="loadDrift(k.indexKey)"
          @contextmenu.prevent="openKeyMenu($event, k)"
         role="button" tabindex="0"
         @keydown="onKeyMenuKey($event, k)" data-row-nav @keydown.self="rowArrowNav">
          <div class="cd-item-key" :title="k.indexKey"><MarkText :text="k.indexKey" :kw="kw" /></div>
          <div class="cd-item-alias" :title="k.alias"><MarkText :text="k.alias" :kw="kw" /></div>
          <!-- 清单角标改用 StatusPill 统一件（558b 回滚件解禁重做——525:210 逐字锁
 已同步更新；tone 走 cdVerdictPill 映射消费，文案逐字；.cd-verdict 外挂定位壳保留） -->
          <StatusPill v-if="verdicts[k.indexKey]" class="cd-verdict" :tone="cdVerdictPill(verdicts[k.indexKey])"
            :label="verdicts[k.indexKey] === 'clean' ? '一致' : verdicts[k.indexKey] === 'drift' ? '漂移' : '缺失'" />
        </div>
        <!-- 过滤致空：对象在但被关键字全部藏掉（真无对象/失败态由上方互斥链承担） -->
        <div v-if="!filteredKeys.length && keys.length" class="cd-item cd-none">
          无匹配对象（共 {{ keys.length }} 个，被当前关键字隐藏）
          <button class="btn sm ghost" style="margin-left:var(--sp-1h)" @click="kw = ''">清除过滤</button>
        </div>
      </div>
      </template>
      <template #pane-configdrift-detail>
      <!-- 右：漂移详情（ 检测中 / 失败可重试 / 未点选 三态） -->
      <div class="cd-detail">
        <div v-if="driftBusy" class="cd-progress">
          <RefreshCw :size="28" class="spinning" />
          <div>正在检测 <b class="mono">{{ picked }}</b> …</div>
        </div>
        <div v-else-if="driftErr" class="cd-progress">
          <AlertTriangle :size="28" />
          <div>检测失败：{{ driftErr }}</div>
          <button class="btn sm" @click="loadDrift(picked)" :disabled="driftBusy"><RefreshCw :size="12" :class="{ spinning: driftBusy }" /> 重试</button>
        </div>
        <!-- 只有这一支是真空态（未点选、无内容），交给 EmptyState 统一留白；
 上面两支是进行态 / 失败态（动态错误原因 + 重试），语义上不是空态，
 故保留自有 class，仅把 60px 大留白压到仓库惯例的 24px -->
        <EmptyState v-else-if="!drift" :icon="MousePointer" text="点选左侧索引开始检测" />
        <template v-else>
          <div v-if="!drift.liveExists" class="cd-missing">
            <AlertTriangle :size="14" />
            线上不存在物理索引（alias={{ drift.alias }}）——代码有配置、集群无索引，启动 ensureIndex 或重建后再对比
          </div>
          <template v-else>
            <!-- 结论与行动 -->
            <div v-if="verdictInfo" class="cd-verdict-bar" :class="verdictInfo.tone">
              <component :is="verdictInfo.icon" :size="15" class="cd-vb-ic" />
              <div class="cd-vb-tx">
                <b>{{ verdictInfo.title }}</b>
                <span>{{ verdictInfo.desc }}</span>
              </div>
              <button v-if="verdictInfo.cta" class="btn pri sm" @click="goRebuild">
                <Wrench :size="12" /> 去重建
              </button>
            </div>

            <!-- settings 漂移摘要（轨4：.cd-card 壳退役——pane 即容器内容直贴，
 分界由 cd-card-hd border-bottom 承接，刀③④） -->
            <div class="cd-sec">
              <div class="cd-card-hd">
                <span>settings 漂移 <em>{{ drift.physicalIndex }}</em></span>
                <div class="cd-hd-acts">
                  <button class="btn ghost xs" @click="copyStr(drift.codeSettings, '代码 settings')"><Copy :size="10" /> 代码</button>
                  <button class="btn ghost xs" @click="copyStr(drift.liveSettings, '线上 settings')"><Copy :size="10" /> 线上</button>
                  <!-- W-D：settings 结论徽标改用 StatusPill（ok/err 文字档=g/r 语义档同 token 收敛，
 cd-badge 锚保留；文案逐字）。清单角标一枚因 useCurrentIdxWritePages525 源码锁绕开不换 -->
                  <StatusPill class="cd-badge" :tone="drift.settingsDiff.clean ? 'g' : 'r'"
                    :label="drift.settingsDiff.clean ? '完全一致' : '存在漂移'" />
                </div>
              </div>
              <div v-if="!drift.settingsDiff.clean" class="cd-sd">
                <div v-if="drift.settingsDiff.different.length" style="display:flex;justify-content:flex-end;margin-bottom:var(--sp-1)">
                  <!-- 一键复制修复 DSL（按代码侧值组装 PUT _settings body） -->
                  <button class="btn sm ghost" @click="copyFixDsl" title="按代码侧值组装 PUT _settings 请求体">
                    <FileDown :size="11" /> 复制修复 DSL（{{ drift.settingsDiff.different.length }} 键）
                  </button>
                </div>
                <!-- settings 差异裸表换 QRT rows 型（qrtRowsSwap529 先例）——
 键排序/右键/导出归内核；行级「复制差异」走 #row-actions 槽（aria 保真）；
 代码/线上值 c-add/c-del 色档经 #cell- 槽保真 -->
                <QueryResultTable
                  v-if="drift.settingsDiff.different.length"
                  :cols="SD_COLS" :rows="sdRows" sortable
                  storage-key="config-drift:settings"
                  export-name="settings-drift"
                >
                  <template #cell-键="{ value }"><span class="mono">{{ value }}</span></template>
                  <template #cell-代码值="{ value }"><span class="mono c-add">{{ value }}</span></template>
                  <template #cell-线上值="{ value }"><span class="mono c-del">{{ value }}</span></template>
                  <template #row-actions="{ row }">
                    <button class="btn xs ghost" :aria-label="'复制差异：' + row[0]" title="复制差异（key/代码/线上三行）" @click="copyStr(`${row[0]}\n代码: ${row[1]}\n线上: ${row[2]}`, row[0])"><Copy :size="11" /></button>
                  </template>
                </QueryResultTable>

                <!-- 仅代码有：结构性漂移，需重建生效 -->
                <div v-if="drift.settingsDiff.onlyInCode.length" class="cd-bucket">
                  <div class="cd-bucket-hd">
                    <span class="cd-bucket-tt add">仅代码有 · {{ drift.settingsDiff.onlyInCode.length }} 项</span>
                    <span class="cd-bucket-note">代码已声明、线上索引缺失——settings 属创建期配置，需重建后生效</span>
                    <button class="btn ghost xs" @click="copyKeys(drift.settingsDiff.onlyInCode, '仅代码有')"><Copy :size="10" /> 全部键</button>
                  </div>
                  <NsGroups :keys-list="drift.settingsDiff.onlyInCode" tone="add" @copy="k => copyStr(k, k)" />
                </div>

                <!-- 仅线上有：拆结构性 / 运维态两桶 -->
                <div v-if="liveStructural.length" class="cd-bucket">
                  <div class="cd-bucket-hd">
                    <span class="cd-bucket-tt del">仅线上有（结构性）· {{ liveStructural.length }} 项</span>
                    <span class="cd-bucket-note">线上存在但代码未声明——确认是否应回填到代码合约</span>
                    <button class="btn ghost xs" @click="copyKeys(liveStructural, '仅线上有（结构性）')"><Copy :size="10" /> 全部键</button>
                  </div>
                  <NsGroups :keys-list="liveStructural" tone="del" @copy="k => copyStr(k, k)" />
                </div>
                <div v-if="liveOps.length" class="cd-bucket dim">
                  <div class="cd-bucket-hd">
                    <span class="cd-bucket-tt ops">仅线上有（运维态参数）· {{ liveOps.length }} 项</span>
                    <span class="cd-bucket-note">副本数 / 慢日志 / translog / merge 等动态参数，通常由运维热更所致，一般无需重建</span>
                    <button class="btn ghost xs" @click="copyKeys(liveOps, '仅线上有（运维态）')"><Copy :size="10" /> 全部键</button>
                  </div>
                  <NsGroups :keys-list="liveOps" tone="ops" @copy="k => copyStr(k, k)" />
                </div>
              </div>
              <div v-else class="cd-clean-tx">系统键已剔除，业务 settings 逐键一致</div>
            </div>

            <!-- mapping 漂移（轨4：.cd-card 壳退役，同 settings 节口径） -->
            <div class="cd-sec">
              <div class="cd-card-hd">
                <span>mapping 漂移</span>
                <div class="cd-hd-acts">
                  <button class="btn ghost xs" @click="copyStr(drift.codeMapping, '代码 mapping')"><Copy :size="10" /> 代码</button>
                  <button class="btn ghost xs" @click="copyStr(drift.liveMapping, '线上 mapping')"><Copy :size="10" /> 线上</button>
                  <button v-if="!drift.mappingEqual" class="btn ghost xs" @click="copyDiff"><Copy :size="10" /> diff</button>
                  <!-- W-D：mapping 结论徽标改用 StatusPill（同上，差异数文案逐字） -->
                  <StatusPill class="cd-badge" :tone="drift.mappingEqual ? 'g' : 'r'"
                    :label="drift.mappingEqual ? '完全一致' : ('+' + diffStat.add + ' / −' + diffStat.del)" />
                </div>
              </div>
              <div v-if="!drift.mappingEqual" class="cd-diff">
                <div class="cd-diff-legend">
                  <span class="c-add">+ 仅代码有</span><span class="c-del">− 仅线上有</span>
                  <span class="cd-diff-note">已按 LCS 对齐，仅展示差异行（含 2 行上下文）</span>
                </div>
                <template v-for="(l, i) in diffHunks" :key="i">
                  <div v-if="l.op === 'gap'" class="cd-diff-gap">··· 省略 {{ l.n }} 行一致内容 ···</div>
                  <div v-else class="cd-diff-line" :class="l.op">
                    <span class="cd-diff-op">{{ l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' ' }}</span>
                    <span class="cd-diff-tx">{{ l.tx }}</span>
                  </div>
                </template>
              </div>
              <div v-else class="cd-clean-tx">按键名归一化排序后逐字符一致</div>
            </div>
          </template>
        </template>
      </div>
      </template>
    </WorkbenchLayout>
    <!-- G206：原始 IO 快查弹窗（ModalShell 壳，Esc/遮罩关闭随壳） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
    <CellContextMenu v-if="keyMenu" :x="keyMenu.x" :y="keyMenu.y" :title="keyMenuTitle"
      :items="keyMenuItems" @close="keyMenu = null" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineComponent, h, type PropType } from 'vue';
import { useRouter } from 'vue-router';
import { GitCompareArrows, RefreshCw, MousePointer, AlertTriangle, Copy, Wrench, CheckCircle2, Info, FileDown, Terminal, Link2 } from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import EmptyState from '../components/EmptyState.vue';
import MarkText from '../components/MarkText.vue';
import HitNav from '../components/HitNav.vue';
import SkeletonBox from '../components/SkeletonBox.vue'; /* W-D：loading 占位统一件 */
import StatusPill from '../components/StatusPill.vue'; /* W-D：结论徽标统一件 */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：清单过滤胶囊统一件 */
import QueryResultTable from '../components/QueryResultTable.vue'; /* ：settings 差异表换壳 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import RawIoModal from '../components/RawIoModal.vue'; /* G206：原始 IO 快查弹窗（755 G200 同构） */
import { api, ioRecorder, type RawIoRec } from '../api';
import { isBrowserMode } from '../platform/browserApi';
import { useScopedDraft } from '../composables/useScopedDraft';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useUrlState } from '../composables/urlState';
import { useHitLocate } from '../composables/useHitNav';
import { copyText } from '../utils/format';
import { friendlyEsError } from '../utils/esError';
import { rowArrowNav } from '../utils/rowNav';

const store = useAppStore();
const auth = useAuthStore();

/* 清单+详情可调工作台声明（清单可折叠，拖拽/预设/记忆由 WorkbenchLayout 统一负责）。
 轨4：竖排标题轨退役（v 刀①）——「对象清单」落 cd-list-head 行首横排、
 「漂移详情」由详情侧 cd-card-hd 横排头承接 */
const cdScope = { target: store.target || 'host', route: '/config-drift', mode: 'drift', profile: 'standard' as const };
const CD_PANES: WorkbenchPaneSpec[] = [
  { id: 'configdrift.list', role: 'request', title: '', minSize: 200, defaultSize: 260, collapsible: true },
  { id: 'configdrift.detail', role: 'response', title: '', minSize: 320, defaultSize: 'flex' },
];
const router = useRouter();
const keys = ref<any[]>([]);
/* G6-B5：loadingKeys 初值 true——首帧即「正在拉取」，不闪「真无 provider」空态 */
const loadingKeys = ref(true);
const loadErr = ref('');
/* 选中 indexKey 进 URL（?key=）——漂移结论可分享/刷新可复原（可重入） */
const picked = useUrlState('key');
const drift = ref<any>(null);
const driftBusy = ref(false);
const driftErr = ref('');
/* 每个 indexKey 的检测结论缓存：clean / drift / missing */
const verdicts = ref<Record<string, string>>({});
const scanningAll = ref(false);
/* W4：verdict pill 档归正 .pill 五主档单字母——原 drift→err / missing→warn
 是别名档越轨（theme.css .pill.err/.pill.warn 与 r/y 同 token，展示等价）；
 clean 走 .g 正面绿不变（pill 无 .ok 档）。 */
const CD_VERDICT_PILL: Record<string, string> = { clean: 'g', drift: 'r', missing: 'y' };
/* fallback 未知档落 n 中性兜底；映射经 cdVerdictPill 消费进 StatusPill :tone
 （558b 曾按任务令改用因 525:210 黑名单锁互斥回滚，锁解禁同步更新后重做兑现）。 */
const cdVerdictPill = (v: string) => (CD_VERDICT_PILL[v] || 'n') as 'g' | 'r' | 'y' | 'n';

/* 搜索定位：对象清单关键字过滤走 useScopedDraft 会话草稿（不进 URL——刷新页即失、
 会话内切回页面恢复；本页进 URL 可重入的是 ?key= 选中键〔useUrlState〕，与过滤词
 是两条通道，754 G202/748 G176 同款注释诚实化）——
 命中口径：indexKey / 别名文本；当前已加载详情的对象额外匹配其「代码(期望) / 线上(实际)」
 配置全文（settings + mapping），键值级差异不用展开也能一击搜到所在对象 */
const kw = useScopedDraft('kw', { route: 'config-drift' }, '').text;
const driftHaystack = computed(() => {
  const d = drift.value;
  if (!d) return '';
  return [d.codeSettings, d.liveSettings, d.codeMapping, d.liveMapping]
    .map(x => String(x ?? '')).join('\n').toLowerCase();
});
const filteredKeys = computed(() => {
  const q = kw.value.trim().toLowerCase();
  if (!q) return keys.value;
  return keys.value.filter((k: any) =>
    String(k?.indexKey || '').toLowerCase().includes(q)
    || String(k?.alias || '').toLowerCase().includes(q)
    || (picked.value === k.indexKey && driftHaystack.value.includes(q)));
});
const rootEl = ref<HTMLElement | null>(null);
const { current: hitCur, next: hitNext, prev: hitPrev } = useHitLocate(() => filteredKeys.value.length, () => rootEl.value);
function onHitKey(e: KeyboardEvent) { if (e.shiftKey) hitPrev(); else hitNext(); }

/* 批量检测全部：fan-out 拉各 key 的 drift 结论上徽标（此前须逐个点击才知道谁漂移） */
async function scanAllVerdicts() {
  if (!keys.value.length) return;
  scanningAll.value = true;
  try {
    /* 单键失败静默跳过改计数——失败键名入册，M>0 换 warn 档「N 成功 / M 失败
 (首 3 键…)」；失败键 verdict 不写（保持无结论态，徽标 v-if 分支与三态消费方零动），
 全部成功仍走 success 原文案 */
    const failedKeys: string[] = [];
    await Promise.all(keys.value.map(async (k: any) => {
      try {
        const r = await api.configLab.drift(k.indexKey);
        verdicts.value[k.indexKey] = !r.liveExists ? 'missing'
          : (r.settingsDiff?.clean && r.mappingEqual) ? 'clean' : 'drift';
      } catch { failedKeys.push(String(k.indexKey)); /* 失败不阻断批量，verdict 留空 */ }
    }));
    const n = keys.value.length - failedKeys.length;
    if (failedKeys.length > 0) {
      store.notify('warning', `检测完成：${n} 成功 / ${failedKeys.length} 失败（首 3 键：${failedKeys.slice(0, 3).join('、')}）`);
    } else {
      store.notify('success', `已检测 ${keys.value.length} 个索引的漂移状态`);
    }
  } finally { scanningAll.value = false; }
}

async function loadKeys() {
  loadingKeys.value = true;
  loadErr.value = '';
  try {
    keys.value = await api.configLab.driftKeys();
  } catch (e: any) {
    /* G6-B4：读链路 friendlyEsError 收敛后进顶置 err-bar；toast 同源（ A：裸抛 toast 并轨 friendly） */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '加载失败：' + loadErr.value);
  } finally { loadingKeys.value = false; }
}

async function loadDrift(indexKey: string) {
  picked.value = indexKey;
  drift.value = null;
  driftErr.value = '';
  driftBusy.value = true;
  try {
    const r = await api.configLab.drift(indexKey);
    if (indexKey !== picked.value) return;
    drift.value = r;
    verdicts.value[indexKey] = !r.liveExists ? 'missing'
      : (r.settingsDiff?.clean && r.mappingEqual) ? 'clean' : 'drift';
  } catch (e: any) {
    if (indexKey !== picked.value) return;
    /* A：ES 错误友好化——driftErr 与下方 toast 同源走 friendly 口径 */
    driftErr.value = friendlyEsError(String(e?.message ?? e));
    store.notify('error', '检测失败：' + driftErr.value);
  } finally { if (indexKey === picked.value) driftBusy.value = false; }
}

async function resetBaseline() {
  if (!picked.value) return;
  try {
    await api.configLab.resetBaseline(picked.value);
    store.notify('success', '已清除本机基线，重新检测时会以当前线上配置重采');
    await loadDrift(picked.value);
  } catch (e: any) {
    store.notify('error', '重采基线失败：' + friendlyEsError(String(e?.message ?? e)));
  }
}

/* G206：原始 IO 快查（755 G200/747 G162 三件套同构）——按本页
 检测端点取记录环最近一条；'/config-lab/drift?' 含查询串前缀，与
 /config-lab/drift/keys 清单端点互不混淆（755 '/cluster/tasks?' 前缀锚镜像）；
 判空 rec=null 时 notify 引导，不开空弹窗 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/config-lab/drift?');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页点选左侧对象检测一次（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* ============ 复制 ============ */
async function copyStr(s: string, label: string) {
  const ok = await copyText(String(s ?? ''));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${label}` : '复制失败');
}

/* 对象清单行右键/菜单键：检测、复制 indexKey/alias、复制深链——只读本地动作；
   Enter/Space 仍走原「检测此对象」键盘语义。 */
const keyMenu = ref<{ x: number; y: number; k: any } | null>(null);
const keyMenuTitle = computed(() => (keyMenu.value ? `配置对象 · ${keyMenu.value.k.indexKey}` : ''));
const keyMenuItems = computed<CcmItem[]>(() => {
  const m = keyMenu.value;
  if (!m) return [];
  const k = m.k;
  const items: CcmItem[] = [
    { key: 'cd-detect', label: '检测此对象', icon: GitCompareArrows, run: () => { void loadDrift(k.indexKey); } },
    { key: 'cd-copy-key', label: '复制 indexKey', icon: Copy, run: () => { void copyStr(k.indexKey, 'indexKey'); } },
  ];
  if (k.alias) items.push({ key: 'cd-copy-alias', label: '复制 alias', icon: Copy, run: () => { void copyStr(k.alias, 'alias'); } });
  items.push({ key: 'cd-copy-link', label: '复制深链', icon: Link2, sep: true, run: () => { void copyStr(keyDeepLink(k.indexKey), '深链'); } });
  return items;
});
function keyDeepLink(indexKey: string) {
  return window.location.origin + window.location.pathname + '#/config-drift?key=' + encodeURIComponent(indexKey);
}
function openKeyMenu(e: MouseEvent, k: any) {
  keyMenu.value = { x: e.clientX, y: e.clientY, k };
}
function onKeyMenuKey(e: KeyboardEvent, k: any) {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    keyMenu.value = { x: r.left + 12, y: r.bottom, k };
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void loadDrift(k.indexKey);
  }
}

/* ═══ ：settings 差异表 QRT rows 型数据映射 ═══
 列=中文键；行=键/代码值/线上值三标量（键排序/漏斗/右键/导出归内核，
 行级复制差异走 #row-actions 槽）。 */
const SD_COLS = ['键', '代码值', '线上值'];
const sdRows = computed<any[][]>(() =>
  (drift.value?.settingsDiff?.different ?? []).map((d: any) => [d.key, d.code, d.live]));

/* 一键复制修复 DSL——different 键按代码侧值组装 PUT /<idx>/_settings body
 （扁平 settings 键原样透传；结构性漂移仍由 verdictInfo.cta「去重建」承接，两者不冲突） */
function copyFixDsl() {
  const dv = drift.value;
  const d = dv?.settingsDiff;
  if (!d?.different?.length || !dv?.physicalIndex) return;
  const settings: Record<string, unknown> = {};
  for (const item of d.different) settings[item.key] = item.code;
  const body = JSON.stringify({ index: settings }, null, 2);
  const text = 'PUT /' + dv.physicalIndex + '/_settings\n' + body;
  copyStr(text, '修复 DSL');
}
async function copyKeys(list: string[], label: string) {
  await copyStr(list.join('\n'), `${label} ${list.length} 个键`);
}
async function copyDiff() {
  const lines = fullDiff.value
    .filter(l => l.op !== 'same')
    .map(l => (l.op === 'add' ? '+ ' : '- ') + l.tx);
  await copyStr(lines.join('\n'), `mapping diff ${lines.length} 行`);
}

/* ============ settings 分桶：运维态参数 vs 结构性 ============ */
/* 这些顶层命名空间是可热更的运维态参数，线上多出它们通常是运维调优，不代表代码漂移 */
const OPS_NS = new Set([
  'refresh_interval', 'number_of_replicas', 'auto_expand_replicas', 'translog',
  'indexing', 'search', 'codec', 'merge', 'max_result_window', 'routing',
  'unassigned', 'blocks', 'priority', 'lifecycle', 'recovery', 'gc_deletes',
]);
const topNs = (k: string) => (k.includes('.') ? k.slice(0, k.indexOf('.')) : k);
const liveOps = computed<string[]>(() =>
  (drift.value?.settingsDiff?.onlyInLive || []).filter((k: string) => OPS_NS.has(topNs(k))));
const liveStructural = computed<string[]>(() =>
  (drift.value?.settingsDiff?.onlyInLive || []).filter((k: string) => !OPS_NS.has(topNs(k))));

/* ============ 结论横幅 ============ */
const verdictInfo = computed(() => {
  const d = drift.value;
  if (!d || !d.liveExists) return null;
  const clean = d.settingsDiff?.clean && d.mappingEqual;
  if (clean) return { tone: 'ok', icon: CheckCircle2, title: '配置一致', desc: '代码合约与线上索引完全一致，无需处理', cta: false };
  const structural = !d.mappingEqual
    || (d.settingsDiff?.different?.length || 0) > 0
    || (d.settingsDiff?.onlyInCode?.length || 0) > 0
    || liveStructural.value.length > 0;
  if (!structural) return {
    tone: 'info', icon: Info, title: '仅运维态参数差异',
    desc: '差异均为副本数 / 慢日志 / merge 等可热更参数，通常由运维调整所致，一般无需重建', cta: false,
  };
  return {
    tone: 'warn', icon: AlertTriangle, title: '存在结构性漂移',
    desc: '线上索引由旧版合约创建，代码此后新增/修改了创建期配置（如 analysis 分词器、mapping 字段）——需零停机重建后生效',
    cta: true,
  };
});
/* -13：Ops 操作台已退役，漂移看完转「托管重建」；AdhocRebuildView 收 ?index=（索引名/别名），
 不是 indexKey —— 用 drift.alias 预填，拿不到就空手进页让用户自己选 */
function goRebuild() {
  const alias = drift.value?.alias;
  router.push(alias ? { path: '/adhoc-rebuild', query: { index: alias } } : '/adhoc-rebuild');
}

/* ============ 按命名空间归组的 chip 列表（可折叠，点击 chip 复制键名） ============ */
const NsGroups = defineComponent({
  props: {
    keysList: { type: Array as PropType<string[]>, required: true },
    tone: { type: String, default: 'add' },
  },
  emits: ['copy'],
  setup(props, { emit }) {
    const open = ref<Set<string>>(new Set());
    const groups = computed(() => {
      const m = new Map<string, string[]>();
      for (const k of props.keysList) {
        const ns = topNs(k);
        if (!m.has(ns)) m.set(ns, []);
        m.get(ns)!.push(k);
      }
      return [...m.entries()].map(([ns, ks]) => ({ ns, ks })).sort((a, b) => b.ks.length - a.ks.length);
    });
    /* G208：chip 键盘可达（cd-item 行同款 keydown.enter）——
 Enter 触发与鼠标点击同一动作；原 span onClick 仅鼠标可达 */
    const onChipKey = (fn: () => void) => (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); fn(); }
    };
    return () => h('div', { class: 'cd-ns' }, groups.value.map(g => {
      /* 少量键直接平铺；同命名空间 ≥4 个键折叠成组 */
      if (g.ks.length < 4) {
        return g.ks.map(k => h('span', {
          class: ['cd-chip', props.tone], role: 'button', tabindex: '0', title: '点击复制',
          onClick: () => emit('copy', k), onKeydown: onChipKey(() => emit('copy', k)),
        }, k));
      }
      const opened = open.value.has(g.ns);
      const toggle = () => { if (opened) open.value.delete(g.ns); else open.value.add(g.ns); };
      return h('div', { class: 'cd-ns-g' }, [
        h('span', {
          class: ['cd-chip', 'grp', props.tone], role: 'button', tabindex: '0',
          title: `展开/收起 ${g.ns}.* 分组（Enter 亦可）`,
          onClick: toggle, onKeydown: onChipKey(toggle),
        }, `${g.ns}.* ${g.ks.length} 项 ${opened ? '▾' : '▸'}`),
        opened ? h('div', { class: 'cd-ns-kids' }, g.ks.map(k => h('span', {
          class: ['cd-chip', props.tone], role: 'button', tabindex: '0', title: '点击复制',
          onClick: () => emit('copy', k), onKeydown: onChipKey(() => emit('copy', k)),
        }, k))) : null,
      ]);
    }));
  },
});

/* ============ mapping 真 diff（LCS 对齐，消除行偏移误报） ============ */
type DiffLine = { op: 'same' | 'add' | 'del'; tx: string };
function lcsDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length, m = b.length;
  /* 超大 mapping 兜底：退化为整体替换展示，避免 O(n*m) 卡死页面 */
  if (n * m > 4_000_000) {
    return [...a.map(tx => ({ op: 'add' as const, tx })), ...b.map(tx => ({ op: 'del' as const, tx }))];
  }
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = a[i] === b[j]
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: 'same', tx: a[i] }); i++; j++; }
    else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) { out.push({ op: 'add', tx: a[i] }); i++; }
    else { out.push({ op: 'del', tx: b[j] }); j++; }
  }
  while (i < n) out.push({ op: 'add', tx: a[i++] });
  while (j < m) out.push({ op: 'del', tx: b[j++] });
  return out;
}

const fullDiff = computed<DiffLine[]>(() => {
  if (!drift.value || drift.value.mappingEqual) return [];
  const a = String(drift.value.codeMapping || '').split('\n');
  const b = String(drift.value.liveMapping || '').split('\n');
  return lcsDiff(a, b);
});
const diffStat = computed(() => ({
  add: fullDiff.value.filter(l => l.op === 'add').length,
  del: fullDiff.value.filter(l => l.op === 'del').length,
}));
/* 只展示差异行 + 2 行上下文，其余折叠为 gap */
const diffHunks = computed<Array<DiffLine | { op: 'gap'; n: number; tx?: string }>>(() => {
  const CTX = 2;
  const lines = fullDiff.value;
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.op !== 'same') {
      for (let k = Math.max(0, i - CTX); k <= Math.min(lines.length - 1, i + CTX); k++) keep[k] = true;
    }
  });
  const out: Array<DiffLine | { op: 'gap'; n: number }> = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap > 0) { out.push({ op: 'gap', n: gap }); gap = 0; }
      out.push(l);
    } else gap++;
  });
  if (gap > 0) out.push({ op: 'gap', n: gap });
  return out;
});

/* 1125：挂载期读取（key 清单 + 分享现场漂移检测）同样过身份门——宿主换 token 的窗口里
   probed 未落地，旧 target 的漂移结果会先拉回来。不放行则挂起，身份落地补跑。 */
const driftReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('config-drift', store.target));
let driftPendingBoot = false;
async function bootDrift() {
  await loadKeys();
  /* URL 带 key 时自动加载对应漂移检测，还原分享现场 */
  if (picked.value) void loadDrift(picked.value);
}
onMounted(() => {
  if (driftReady()) void bootDrift();
  else driftPendingBoot = true;
});
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!driftPendingBoot || !driftReady()) return;
  driftPendingBoot = false;
  void bootDrift();
});
</script>

<style scoped>
/* G6-S1：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / 亚阶梯(≤3px) / 行级密排不动 */
.cd-page { padding: var(--sp-3) var(--sp-4) var(--sp-5); }
.cd-hd { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-3); }
/* W-F：.cd-hd-l/.cd-hd-ic/.cd-hd-tt/.cd-hd-sub 死规则删除（页头已迁 PageHeader） */

/* 加载中态专属样式（非空态）：与 EmptyState 视觉刻意区分——
 转圈图标 42px + 居中，不带 hint/行动按钮；padding 对齐仓库 24px 惯例，不再是 60px 大留白 */
.cd-loading { text-align: center; padding: var(--sp-5) var(--sp-4); color: var(--muted); }
/* W-D：SkeletonBox circle 占位居中（原 RefreshCw 块级随文本居中，.sk 是块级需 margin auto） */
.cd-loading-sk { margin: 0 auto; }

.cd-loading-tt { font-size: var(--fs-lg); margin: var(--sp-3) 0 var(--sp-1); color: var(--fg); }

/* 固定 minmax grid 退役——双栏布局交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠）；
 .cd-list/cd-detail 保持内容样式，宽度与堆叠由 pane spec + stacked 档接管。
 轨4：cd-list pane 内第一层壳三件套退役（①残面漏收补刀；540 df-card
 同语言）——pane 即容器内容直贴，类名保留作模板锚（qualityThreeState 挂载断言在册）；
 cd-list-head bg2 头条底色随壳退役（540 uq-script-hd 同语言：分界归既有 border-bottom 承接） */
.cd-list { overflow: hidden; }
.cd-list-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); }
/* 轨4：竖排轨「对象清单」语义落行首横排（fs-head 语言，DevTools .dt-pane-tt 同款） */
.cd-list-tt { font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; flex-shrink: 0; }
/* 类随改用挂 SearchFilterBar 根——手写输入框皮（bg1 底/line 边/6px 圆角/
 outline/:focus）退役归组件 .sfb 胶囊壳单源，本类只留落位（行内 flex:1）与高度内衬
 （24px 对齐现行；padding/字号对齐现行，FavoritesView「padding 留视图」同口径） */
.cd-kw-inp {
  flex: 1; min-width: 0; height: 24px; box-sizing: border-box; padding: 0 var(--sp-2);
  font-size: var(--fs-xs);
}
.cd-item { padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); cursor: pointer; position: relative; }
.cd-item:last-child { border-bottom: 0; }
.cd-item:hover { background: var(--hl-soft); }
.cd-item.on { background: var(--ac-soft); }
/* 当前命中对象行：柔底 + 左侧强调条 + 焦点环（.hit-cur 由 useHitScroll 运行时挂/摘） */
.cd-item.hit-cur { background: var(--ac-soft) !important; box-shadow: inset 3px 0 0 var(--ac-hi), var(--focus-ring); }
.cd-none { cursor: default; font-size: var(--fs-xs); color: var(--muted); display: flex; align-items: center; flex-wrap: wrap; }
/* G6-S3：清单项长键名/别名省略三件套 + :title 全名可达（；
 hasv 时右 padding 给 absolute 结论徽章让位，防压字 */
.cd-item-key, .cd-item-alias { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-item.hasv { padding-right: calc(var(--sp-6) + var(--sp-4)); }
.cd-item-key { font-size: var(--fs-sm); font-weight: 600; }
.cd-item-alias { font-size: var(--fs-xs); color: var(--muted); font-family: var(--mono); }
/* verdict 徽标挂全局 .pill 语义档；：改用 StatusPill 统一件（色板/胶囊
 形态/字号字重全归组件内 .pill 单源），.cd-verdict 只留角标定位壳（absolute right/top）；
 W-F：10px 字面量被 useCurrentIdxWritePages525 源码锁逐字锁定，豁免 --sp 合并 */
.cd-verdict { position: absolute; right: 10px; top: 10px; }

.cd-detail { min-width: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
/* 进行态 / 失败态专属（真空态已走 EmptyState）。
 原 .cd-hint 是 60px 20px 大留白，且类名不含 empty 而绕过了防回退看守的命名约定；
 这里对齐仓库惯例（IndexHubView 16px / BrowserView 与 IlmView 24px）压到 24px，
 并改名 .cd-progress 以免进行态再被误读成空态。 */
.cd-progress { text-align: center; padding: var(--sp-5) var(--sp-4); color: var(--muted); font-size: var(--fs-sm); display: flex; flex-direction: column; gap: var(--sp-3); align-items: center; }
.cd-missing { display: flex; gap: var(--sp-2); align-items: center; padding: var(--sp-3) var(--sp-4); font-size: var(--fs-sm); color: var(--warning); background: var(--warn-soft); border: 1px solid var(--warn-line); border-radius: var(--r-m); }

/* 结论横幅 */
.cd-verdict-bar { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-radius: var(--r-m); border: 1px solid; }
.cd-verdict-bar.ok { background: var(--ok-soft); border-color: var(--ok-line); color: var(--success); }
.cd-verdict-bar.info { background: var(--ac-soft); border-color: var(--ac-line); color: var(--brand); }
.cd-verdict-bar.warn { background: var(--warn-soft); border-color: var(--warn-line); color: var(--warning); }
.cd-vb-ic { flex-shrink: 0; }
.cd-vb-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-0); }
.cd-vb-tx b { font-size: var(--fs-sm); }
.cd-vb-tx span { font-size: var(--fs-xs); color: var(--muted); }

/* 轨4：.cd-card 壳规则（bg+border+radius+overflow）退役——pane 即容器，
 内容直贴；分界由 cd-card-hd border-bottom 承接（v 刀③④），cd-detail flex 链零变动。
 cd-verdict 徽标本体不动（useCurrentIdxWritePages525/ 锚面） */
/* W-F：卡头 400 失序归位 650（口径 B 卡头档；条状壳保留，em 副文本 400 保留） */
.cd-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }
.cd-card-hd em { font-style: normal; font-weight: 400; font-size: var(--fs-xs); color: var(--muted); font-family: var(--mono); margin-left: var(--sp-1h); }
.cd-hd-acts { display: flex; align-items: center; gap: var(--sp-2); }
/* W-F：.cd-badge 空规则删除； W-D：ok/err 子档色规则随 StatusPill 改用退役
 （g/r 语义档同 token 单源），类名保留作 pillSingleTrack/useCurrentIdxWritePages525 测试锚 */

.cd-sd { padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-3); }
/* .cd-tbl/.cd-row-cp 随差异表换 QRT 壳退役（表头/行语言归内核单一出处） */
.mono { font-family: var(--mono); }
.c-add { color: var(--success); }
.c-del { color: var(--err); }

/* 分桶。：三桶壳退役（约定④；ws-w 556 终态同语言）——border+radius 8 整块消除，
 border-top 分节承接（ ar-sec 同刀）；内容 padding 迁入盒模型等值；三桶均 v-if 门控，
 空态不留整块空框 */
.cd-bucket { border-top: 1px solid var(--border); padding: var(--sp-2) var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
.cd-bucket.dim { opacity: .92; background: var(--hl-soft); }
.cd-bucket-hd { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.cd-bucket-tt { font-size: var(--fs-xs); font-weight: 600; }
.cd-bucket-tt.add { color: var(--success); }
.cd-bucket-tt.del { color: var(--err); }
.cd-bucket-tt.ops { color: var(--muted); }
.cd-bucket-note { font-size: var(--fs-xs); color: var(--muted); flex: 1; min-width: 0; }

:deep(.cd-ns) { display: flex; gap: 5px; flex-wrap: wrap; align-items: flex-start; }
:deep(.cd-ns-g) { display: flex; flex-direction: column; gap: var(--sp-1); max-width: 100%; }
/* 轨4：子键组 dashed 盒退役（约定④）——gap/padding 缩进分组语义保留 */
:deep(.cd-ns-kids) { display: flex; gap: var(--sp-1); flex-wrap: wrap; padding: var(--sp-1h) var(--sp-2); }
:deep(.cd-chip) { font-size: var(--fs-xs); font-family: var(--mono); padding: 1px 7px; border-radius: var(--r-m); cursor: pointer; transition: background var(--tr); }
:deep(.cd-chip:hover) { background: var(--hl); }
:deep(.cd-chip.grp) { font-weight: 600; }
:deep(.cd-chip.add) { background: var(--ok-soft); color: var(--success); }
:deep(.cd-chip.del) { background: var(--err-soft); color: var(--err); }
:deep(.cd-chip.ops) { background: var(--bg3); color: var(--muted); }
.cd-clean-tx { padding: var(--sp-3); font-size: var(--fs-sm); color: var(--success); text-align: center; }

/* diff */
/* 420px 定高 → 42vh 弹性档（ProfileFlame 同口径），240px 超矮屏保底 */
.cd-diff { padding: var(--sp-2) var(--sp-3); font-family: var(--mono); font-size: var(--fs-xs); max-height: max(240px, 42vh); overflow: auto; }
.cd-diff-legend { display: flex; gap: var(--sp-3); align-items: center; font-size: var(--fs-xs); margin-bottom: var(--sp-2); font-family: inherit; }
.cd-diff-note { color: var(--muted); }
.cd-diff-gap { padding: var(--sp-0) var(--sp-1); color: var(--muted); font-size: var(--fs-xs); text-align: center; user-select: none; }
.cd-diff-line { padding: 1px var(--sp-1); white-space: pre; }
.cd-diff-line.add { background: var(--ok-soft); color: var(--success); }
.cd-diff-line.del { background: var(--err-soft); color: var(--err); }
.cd-diff-line.same { color: var(--muted); }
.cd-diff-op { display: inline-block; width: 12px; opacity: .6; }

/* 1100px 自制断点退役——窄屏堆叠由 WorkbenchLayout stacked 档自动处理。 */

/* 宿主 iframe 最窄 ~866px 档（ProfileFlame 524 同口径）——页头/结论横幅
 窄屏换行；档内禁 ≥300px 裸 width（仓规），全文禁 901px+ 倒挂 min-width 档 */
@media (max-width: 900px) {
  .cd-hd { flex-direction: column; align-items: stretch; gap: var(--sp-2); }
  .cd-verdict-bar { flex-wrap: wrap; }
}
.cd-browser-note { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx1); font-size: var(--fs-xs); line-height: 1.6; margin-bottom: var(--sp-3); }
</style>
