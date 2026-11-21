<template>
  <n-drawer :show="show" :width="drawerW" placement="right" @update:show="v => emit('update:show', v)">
    <n-drawer-content title="启动期 Mapping 对账报告" closable>
      <template #footer>
        <button class="btn sm ghost" @click="load"><RefreshCw :size="12" :class="{ spin: loading }" /> 刷新</button>
      </template>

      <!-- .rr-err 私造红壳（err 色/err-soft 底/radius/padding）合并全局 .err-bar
 形态（theme.css :554 单源，558b pf-err 先例；err-bar 自带 margin-bottom 与原值同档），
 rr-err 锚保留；重试钮走 .err-bar .btn 右靠档 + role=alert 语义补齐 -->
      <div v-if="loadErr" role="alert" class="err-bar rr-err">
{{ loadErr }}
        <button class="btn sm ghost" @click="load">重试</button>
      </div>

      <!-- 手写 rr-tbl 换壳 QRT rows 型——自造状态漏斗/kw 过滤门控/手写 copyMatrix
 全退役，过滤收口内核 quickFilter（显示与导出同源走 sortedRows，viewRows「所见即所复制」
 锁语义天然继承）；导出 CSV/MD/XLSX/PNG 与右键复制矩阵归内核（状态列导出人话值与旧
 copyMatrix 同口径，说明列恒 raw 原文）。空态/骨架走内核 empty-text/empty-hint/loading。 -->
      <template v-else>
        <div v-if="isBrowserMode" class="rr-tip">
          浏览器模式没有服务端代码 provider 的 <span class="mono">@Mapping</span> 来源，启动期自动补全对账不适用。
          可在 <router-link to="/config-drift">配置漂移</router-link> 页保存本机基线，对比线上 mapping/settings 差异。
        </div>
        <div v-if="rows.length" class="rr-tip">
          只补新增字段,绝不修改/删除既有映射;类型冲突 fail-closed,需走
          <b>托管重建</b>。字段级明细见启动日志 <span class="mono">[MappingReconcile]</span>。
        </div>
        <div v-if="rows.length" class="rr-tools">
          <input v-model="kw" class="ipt rr-kw" placeholder="过滤：状态 / 索引 / 说明…" aria-label="过滤对账记录" />
          <button v-if="kw" class="btn xs ghost" @click="kw = ''" title="清除过滤，恢复完整清单">清除</button>
        </div>
        <QueryResultTable
          :cols="RR_COLS" :rows="rrMatrix" sortable
          storage-key="rr"
          :quick-filter="kw"
          export-name="reconcile-report"
          max-height="none"
          :loading="loading"
          empty-text="暂无对账记录"
          :empty-hint="RR_EMPTY_HINT"
        >
          <!-- 状态列 #cell- 槽保 StatusPill 语义：rows 携人话状态值（quickFilter 中文可命中、
 导出与旧 copyMatrix 同口径），tone 由 STATUS_TONE 反查（STATUS_TEXT 值全站唯一） -->
          <template #cell-状态="{ value }">
            <StatusPill :tone="STATUS_TONE[value] ?? 'n'" :label="value" />
          </template>
          <!-- 索引列：原纯 MarkText 断链 → 补 goHub 跳转芯片（XmigrateView 目标索引芯片同范式，
 /indices?idx= 直达索引工作区；IndexHub 经 useIdxState 消费 ?idx=，无携带键需求） -->
          <template #cell-索引="{ value }">
            <span class="mono" :title="value">{{ value }}</span>
            <button class="rr-go" :aria-label="'打开索引工作区：' + value" title="打开索引工作区" @click.stop="gotoHub(value)"><ExternalLink :size="11" /></button>
          </template>
          <!-- 说明列：显示 shortReason 人话化，td title/导出/复制恒 raw（内核契约，与旧表 title 原文同口径） -->
          <template #cell-说明="{ value }">
            <span class="rr-reason">{{ shortReason(value) }}</span>
          </template>
        </QueryResultTable>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw, ExternalLink } from 'lucide-vue-next';
import { NDrawer, NDrawerContent } from 'naive-ui';
import { api } from '../api';
import { isBrowserMode } from '../platform/browserApi';
import { friendlyEsError } from '../utils/esError';
import { useAppStore } from '../stores/app';
import QueryResultTable from './QueryResultTable.vue';
import StatusPill from './StatusPill.vue';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ (e: 'update:show', v: boolean): void }>();

const store = useAppStore();

/* 620 固定宽无视口钳制（≤620px 视口整条溢出）——按视口 94% 收口，
 上限仍 620（大屏观感不变）；视口宽走 app store 响应式单源
 （非响应式直读在嵌入容器挂载早期会读到 0 并永久缓存） */
const drawerW = computed(() => Math.min(620, Math.round(store.viewportW * 0.94)));

const router = useRouter();
/* 索引列 goHub 跳转（XmigrateView gotoIdx 同范式） */
function gotoHub(idx?: string) {
  if (!idx) return;
  router.push({ path: '/indices', query: { idx } });
}

const loading = ref(false);
const loadErr = ref('');
const rows = ref<Array<{ indexKey: string; index: string; status: string; reason?: string; action?: string; addedCount?: number; conflictCount?: number }>>([]);
const kw = ref('');

const STATUS_TEXT: Record<string, string> = {
  UPDATED: '已补全', NO_CHANGE: '无变化', CONFLICT: '类型冲突',
  FAILED_ES: 'ES 错误', FAILED_CONNECTIVITY: '连接失败', SKIPPED_INDEX_MISSING: '索引缺失',
  SKIPPED_NO_CLIENT: '未发现客户端', MAPPING_UNPARSED: 'mapping 解析失败',
  DISABLED: '对账未开启', FAILED_INDEX_MISSING: '索引缺失（强制档）',
};
function statusText(st: string) { return STATUS_TEXT[st] || st; }
function statusPill(st: string) {
  if (st === 'UPDATED') return 'g';
  if (st === 'CONFLICT' || st === 'FAILED_INDEX_MISSING') return 'r';
  if (st.startsWith('FAILED') || st === 'MAPPING_UNPARSED') return 'y';
  return 'n';
}
function shortReason(reason?: string) {
  if (!reason) return '—';
  return reason
    .replace(/^PUT_FAILED:\s*/, 'PUT 失败: ')
    .replace(/analyzer \[([^\]]+)\] has not been configured in mappings/, '缺分词器配置: $1')
    .slice(0, 120);
}

/* 换壳 QRT rows 型——列名与旧表头逐字同源；状态列携 statusText 人话值
 （quickFilter 中文可命中、内核导出与旧 copyMatrix「状态人话列」同口径）、
 索引/说明携原文（说明显示 shortReason 走 #cell- 槽，title/导出/复制恒 raw） */
const RR_COLS = ['状态', '索引', '说明'];
const RR_EMPTY_HINT = '本宿主以 client 模式接入且启动期对账开启时，每次应用启动会自动按 @Mapping/@Field 期望补全已有索引的新增字段，结果在这里汇总';
const rrMatrix = computed<(string)[][]>(() =>
  rows.value.map(r => [statusText(r.status), r.index, String(r.reason || '')]));
/* tone 反查表：rows 携人话值，StatusPill tone 由 statusText(statusPill 判据) 构建时定档；
 STATUS_TEXT 值两两互异（'索引缺失'/'索引缺失（强制档）' 亦不同串），未收录状态回落 'n' */
const STATUS_TONE = Object.fromEntries(
  Object.keys(STATUS_TEXT).map(k => [STATUS_TEXT[k], statusPill(k)]),
) as Record<string, 'g' | 'y' | 'r' | 'n'>;

async function load() {
  loading.value = true;
  loadErr.value = '';
  try {
    const r = await api.mappingReconcileReport();
    rows.value = (r?.reports || []).map((x: any) => ({
      indexKey: x.indexKey || '', index: x.index || '', status: x.status || '',
      reason: x.reason || '', action: x.action || '',
      addedCount: x.addedCount, conflictCount: x.conflictCount,
    }));
  } catch (e: any) {
    /* A：ES 错误友好化——裸 message 换全站 friendlyEsError 口径 */
    loadErr.value = friendlyEsError(String(e?.message ?? e));
  } finally {
    loading.value = false;
  }
}

/* 每次打开重拉并复位 kw（上一次的过滤现场不带入）；空态/骨架语义归内核 empty/loading */
watch(() => props.show, v => { if (v) { kw.value = ''; load(); } });
</script>

<style scoped>
.rr-tip { font-size: var(--fs-xs); color: var(--tx2); background: var(--bg2); border-radius: var(--r-s); padding: var(--sp-2) var(--sp-2h); margin-bottom: var(--sp-2h); line-height: 1.7; }
/* .rr-err 私造红壳随合并 .err-bar 单源退役（margin-bottom 与 err-bar 自带值同档） */
/* 漏斗 chips/rr-none 随换壳退役，工具行只留 quick-filter 输入（kernel 过滤收口） */
.rr-tools { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.rr-kw { width: 200px; height: 24px; }
.rr-reason { color: var(--tx2); }
/* 索引列 goHub 芯片（XmigrateView .xm-idx-go 同语言） */
.rr-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.rr-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
</style>
