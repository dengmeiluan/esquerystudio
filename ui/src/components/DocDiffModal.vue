<template>
  <!-- P2-8：文档对比弹窗（RT 多选 2-3 篇右键直达；Kibana Compare selected 语义）——
 基准可换（chips 切换纯前端重算）、格级 kind 着色（红=值冲突/琥珀=单侧独有/弱化=一致）、
 统计条 + 复制 Markdown 联动。值超长截断 + title 全量 + 点击复制。 -->
  <!-- v-if 根部短路：show=false 不留任何 DOM（happy-dom/KeepAlive 下 tbody 会污染宿主页面级查询） -->
  <n-modal v-if="show" :show="show" preset="card" :title="title" style="width:920px;max-width:96vw" :bordered="false" @update:show="emit('update:show', $event)">
    <div class="ddm">
      <!-- 索引名芯片——对比的是哪个索引一目了然，点击直达索引工作区 -->
      <div class="ddm-top" v-if="index">
        <button type="button" class="ddm-idx mono" :title="index + '（点击打开索引工作区）'" @click="gotoIndex">
          {{ index }} <ExternalLink :size="11" />
        </button>
      </div>
      <!-- 基准切换：换基准即重算，零请求 -->
      <div class="ddm-base" v-if="hits.length > 2">
        <span class="ddm-lbl">基准：</span>
        <button v-for="(h, i) in hits" :key="h._id" type="button" class="ddm-chip" :class="{ on: baseIdx === i }" @click="emit('base', i)">
          #{{ i + 1 }} · {{ shortId(h._id) }}
        </button>
      </div>
      <div class="ddm-stat">
        <!-- 只看差异——大字段表 diff 聚焦冲突/独有行，一致行默认噪音 -->
        <label class="ddm-only-diff"><input type="checkbox" v-model="onlyDiff" /> 只看差异</label>
        <!-- 字段路径过滤——大字段表快速聚焦目标字段（含子路径命中） -->
        <input v-model="pathKw" class="ddm-filter mono" placeholder="按字段路径过滤…" aria-label="按字段路径过滤" />
        <span class="s s-same" v-if="!onlyDiff">{{ stat.same }} 一致</span>
        <span class="s s-chg">{{ stat.changed }} 不同</span>
        <span class="s s-ob" v-if="stat.onlyBase">{{ stat.onlyBase }} 仅基准</span>
        <span class="s s-ot" v-if="stat.onlyTarget">{{ stat.onlyTarget }} 仅目标</span>
        <button class="btn ghost sm ddm-copy" @click="copyMd"><ClipboardList :size="12" /> 复制 Markdown</button>
      </div>
      <div class="ddm-tbl-wrap scroll-y">
        <table class="ddm-tbl">
          <thead>
            <tr>
              <th class="p">字段</th>
              <th class="v"><span class="th-tag base">基准</span><span class="th-id mono" :title="hits[baseIdx]?._id">{{ shortId(hits[baseIdx]?._id) }}</span></th>
              <th v-for="(h, ti) in targetHits" :key="ti" class="v">
                <span class="th-tag">#{{ targetNo(ti) }}</span><span class="th-id mono" :title="h?._id">{{ shortId(h?._id) }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.path" :class="'k-' + r.status">
              <td class="p mono" :title="r.path" tabindex="0" @contextmenu.prevent="openCellMenu($event, r, -1)" @keydown="onCellMenuKey($event, r, -1)"><MarkText :text="r.path" :kw="pathKw" /></td>
              <td class="v mono cell" :title="fmt(r.base)" tabindex="0" role="button" :aria-label="'复制基线值 ' + r.path" @contextmenu.prevent="openCellMenu($event, r, 0)" @keydown="onCellMenuKey($event, r, 0)" @keydown.enter.prevent="copyCell(r.path, r.base)" @keydown.space.prevent="copyCell(r.path, r.base)" @click="copyCell(r.path, r.base)">{{ fmt(r.base) }}<Copy v-if="r.base !== undefined" :size="10" class="c-ic" /></td>
              <td v-for="(tv, ti) in r.targets" :key="ti" class="v mono cell" :class="cellCls(r.kinds[ti])" :title="fmt(tv)" tabindex="0" role="button" :aria-label="'复制目标值 ' + r.path" @contextmenu.prevent="openCellMenu($event, r, ti + 1)" @keydown="onCellMenuKey($event, r, ti + 1)" @keydown.enter.prevent="copyCell(r.path, tv)" @keydown.space.prevent="copyCell(r.path, tv)" @click="copyCell(r.path, tv)">
                {{ fmt(tv) }}<Copy v-if="tv !== undefined" :size="10" class="c-ic" />
              </td>
            </tr>
            <tr v-if="!rows.length"><td class="empty" :colspan="2 + targetHits.length">文档无字段可对比</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <!-- 差异表右键（1209）：此前这张表只有左键逐格复制，没有任何右键。
         一级只留最高频两项 + 分组父行，其余收二级（与项目右键约定一致）。 -->
    <CellContextMenu v-if="cellMenu" :x="cellMenu.x" :y="cellMenu.y" :title="cellMenu.title"
      :items="cellMenuItems" @close="cellMenu = null" />
  </n-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ClipboardList, Copy, ExternalLink, Filter } from 'lucide-vue-next';
import { NModal } from 'naive-ui';
import { docDiffMulti, docDiffToMarkdown, type MultiDocDiffRow } from '../utils/docDiffMulti';
import { copyText } from '../utils/format';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import MarkText from './MarkText.vue';
import CellContextMenu, { type CcmItem } from './CellContextMenu.vue';
import { useAppStore } from '../stores/app';
import type { SearchHit } from '../types';

const store = useAppStore();

const props = defineProps<{
  show: boolean;
  /** 2~3 篇文档；baseIdx 指定谁是基准 */
  hits: SearchHit[];
  baseIdx: number;
  /** 所属索引名（RT 传入）——展示+芯片跳转索引工作区 */
  index?: string;
}>();

const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'base', i: number): void }>();

/* 索引芯片跳转——router 在无路由测试环境为 undefined，护栏 */
const router = useRouter();
function gotoIndex() {
  if (!props.index) return;
  emit('update:show', false);
  router?.push({ path: '/indices', query: { idx: props.index } });
}

const title = computed(() => `文档对比 — ${props.hits.length} 篇`);

/* 基准外的目标序号：展示「第几篇」而非数组下标（3 篇换基准后标签仍指原文档位次） */
function targetNo(ti: number): number {
  return ti < props.baseIdx ? ti + 1 : ti + 2;
}
const targetHits = computed(() => props.hits.filter((_, i) => i !== props.baseIdx));

const diff = computed(() => {
  const b = props.hits[props.baseIdx];
  if (!b) return { rows: [] as MultiDocDiffRow[], same: 0, changed: 0, onlyBase: 0, onlyTarget: 0 };
  return docDiffMulti(b._source ?? {}, targetHits.value.map(h => h._source ?? {}));
});
/* onlyDiff 过滤——只剩 changed/only-base/only-target 行（same 隐藏） */
const onlyDiff = ref(false);
/* 字段路径过滤（大小写不敏感子串，含嵌套子路径命中） */
const pathKw = ref('');
const rows = computed(() => {
  let rs = diff.value.rows;
  if (onlyDiff.value) rs = rs.filter(r => r.status !== 'same');
  const kw = pathKw.value.trim().toLowerCase();
  if (kw) rs = rs.filter(r => r.path.toLowerCase().includes(kw));
  return rs;
});
const stat = computed(() => ({ same: diff.value.same, changed: diff.value.changed, onlyBase: diff.value.onlyBase, onlyTarget: diff.value.onlyTarget }));

function shortId(id?: string): string {
  if (!id) return '—';
  return id.length > 14 ? id.slice(0, 14) + '…' : id;
}
function fmt(v: unknown): string {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}
function cellCls(kind: string): string {
  if (kind === 'changed') return 'c-chg';
  if (kind === 'added') return 'c-ot';
  if (kind === 'removed') return 'c-ob';
  return '';
}
async function copyCell(path: string, v: unknown) {
  if (v === undefined) return;
  const ok = await copyText(typeof v === 'object' ? JSON.stringify(v) : String(v));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${path}` : '复制失败：浏览器拦截了剪贴板');
}
async function copyMd() {
  const baseLabel = `#${props.baseIdx + 1} ${shortId(props.hits[props.baseIdx]?._id)}`;
  const tLabels = targetHits.value.map((h, i) => `#${targetNo(i)} ${shortId(h?._id)}`);
  const ok = await copyText(docDiffToMarkdown(baseLabel, tLabels, diff.value));
  store.notify(ok ? 'success' : 'error', ok ? '对比结果已复制（Markdown 表格）' : '复制失败：浏览器拦截了剪贴板');
}

/* ═══ 1209：差异表右键 ═══
 这张表此前只有"左键逐格复制"一条路。按项目右键约定补齐：一级只放最高频两项
 （复制值 / 复制路径），其余进「另存与筛选…」「复制整行…」两个分组，不做平铺。
 列号口径：-1=字段列，0=基准列，ti+1=第 ti 个目标列（与 targetNo 的展示位次一致）。 */
const cellMenu = ref<{ x: number; y: number; title: string; row: MultiDocDiffRow; ci: number } | null>(null);

function openCellMenu(e: MouseEvent, row: MultiDocDiffRow, ci: number) {
  const label = ci < 0 ? '字段' : ci === 0 ? '基准' : `#${targetNo(ci - 1)}`;
  cellMenu.value = { x: e.clientX, y: e.clientY, title: `${label} · ${row.path}`, row, ci };
}
function onCellMenuKey(e: KeyboardEvent, row: MultiDocDiffRow, ci: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  const label = ci < 0 ? '字段' : ci === 0 ? '基准' : `#${targetNo(ci - 1)}`;
  cellMenu.value = { ...menuKeyAnchor(e), title: `${label} · ${row.path}`, row, ci };
}

/** 槽位值取数：字段列没有"值"，返回 undefined 由调用方判空 */
function slotValue(row: MultiDocDiffRow, ci: number): unknown {
  if (ci < 0) return undefined;
  return ci === 0 ? row.base : row.targets[ci - 1];
}

const cellMenuItems = computed<CcmItem[]>(() => {
  const m = cellMenu.value;
  if (!m) return [];
  const v = slotValue(m.row, m.ci);
  const hasVal = m.ci >= 0 && v !== undefined;
  const asText = (x: unknown) => (typeof x === 'object' ? JSON.stringify(x) : String(x));
  const copyVal = async () => {
    if (!hasVal) return;
    const ok = await copyText(asText(v));
    store.notify(ok ? 'success' : 'error', ok ? `已复制 ${m.row.path}` : '复制失败：浏览器拦截了剪贴板');
  };
  const copyPath = async () => {
    const ok = await copyText(m.row.path);
    store.notify(ok ? 'success' : 'error', ok ? '已复制字段路径' : '复制失败：浏览器拦截了剪贴板');
  };
  /* 整行 TSV：字段 + 基准 + 各目标，粘进表格软件即得一行对比 */
  const rowTsv = () => [m.row.path, m.row.base, ...m.row.targets]
    .map(x => (x === undefined ? '' : asText(x)).replace(/[\t\r\n]/g, ' ')).join('\t');
  const copyRow = async () => {
    const ok = await copyText(rowTsv());
    store.notify(ok ? 'success' : 'error', ok ? '已复制整行（TSV）' : '复制失败：浏览器拦截了剪贴板');
  };
  const copyAllDiff = async () => {
    const baseLabel = `#${props.baseIdx + 1} ${shortId(props.hits[props.baseIdx]?._id)}`;
    const tLabels = targetHits.value.map((h, i) => `#${targetNo(i)} ${shortId(h?._id)}`);
    const ok = await copyText(docDiffToMarkdown(baseLabel, tLabels, diff.value));
    store.notify(ok ? 'success' : 'error', ok ? '对比结果已复制（Markdown 表格）' : '复制失败：浏览器拦截了剪贴板');
  };
  return [
    ...(hasVal ? [{ key: 'copy-val', label: '复制值', icon: Copy, run: copyVal }] : []),
    { key: 'copy-path', label: '复制字段路径', icon: Copy, run: copyPath },
    {
      key: 'row', label: '复制整行…', icon: ClipboardList, children: [
        { key: 'copy-row-tsv', label: '为 TSV（可直接贴表格）', icon: Copy, run: copyRow },
        { key: 'copy-all-md', label: '整张对比为 Markdown', icon: ClipboardList, run: copyAllDiff },
      ],
    },
    {
      key: 'filter', label: '筛选与定位…', icon: Filter, children: [
        { key: 'filter-path', label: `只看「${m.row.path}」`, icon: Filter, run: () => { pathKw.value = m.row.path; } },
        ...(onlyDiff.value
          ? [{ key: 'show-same', label: '显示一致行', icon: Filter, run: () => { onlyDiff.value = false; } }]
          : [{ key: 'only-diff', label: '只看差异行', icon: Filter, run: () => { onlyDiff.value = true; } }]),
        { key: 'clear-filter', label: '清除全部筛选', icon: Filter, run: () => { onlyDiff.value = false; pathKw.value = ''; } },
      ],
    },
  ];
});
</script>

<style scoped>
/* P2-8：文档对比——dbx 紧凑语言；状态色全走主题 token（暗色自动适配） */
.ddm { display: flex; flex-direction: column; gap: var(--sp-2); }
/* 只看差异 checkbox（与统计 chip 同行语言） */
.ddm-only-diff { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-xs); color: var(--tx1); cursor: pointer; user-select: none; }
.ddm-filter { width: 180px; padding: 3px var(--sp-2); font-size: var(--fs-xs); color: var(--tx0); background: var(--bg0); border: 1px solid var(--line); border-radius: var(--r-s); outline: none; }
.ddm-filter:focus { border-color: var(--ac); }
/* 索引名芯片——与基准 chips 同语言，专职跳转 */
.ddm-top { display: flex; align-items: center; }
.ddm-idx {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  font-size: var(--fs-xs); font-weight: 600; padding: var(--sp-0) 9px; border-radius: 999px;
  background: var(--ac-soft); border: 1px solid var(--ac-line); color: var(--ac-hi);
  cursor: pointer; transition: all .12s;
}
.ddm-idx:hover { background: var(--hl); }
.ddm-base { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; }
.ddm-lbl { font-size: var(--fs-xs); color: var(--tx2); }
.ddm-chip {
  display: inline-flex; align-items: center; height: 22px; padding: 0 var(--sp-2h); font-size: var(--fs-xs); font-family: inherit;
  background: var(--bg2); color: var(--tx1); border: 1px solid var(--line); border-radius: 999px; cursor: pointer;
  transition: background var(--tr), color var(--tr), border-color var(--tr);
}
.ddm-chip:hover { color: var(--tx0); border-color: var(--ac-line); }
.ddm-chip.on { background: var(--ac-soft); color: var(--ac-hi); border-color: var(--ac-line); font-weight: 600; }
.ddm-stat { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; }
.s { font-size: var(--fs-2xs); line-height: 1; padding: var(--sp-1) var(--sp-2); border-radius: 999px; white-space: nowrap; }
.s-same { color: var(--tx2); background: var(--bg2); }
.s-chg { color: var(--err); background: var(--err-soft); }
.s-ob { color: var(--warn); background: var(--warn-line); }
.s-ot { color: var(--ac-hi); background: var(--ac-soft); }
.ddm-copy { margin-left: auto; }
.ddm-tbl-wrap { max-height: 62vh; overflow: auto; border: 1px solid var(--line); border-radius: var(--r-s); }
.ddm-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.ddm-tbl th, .ddm-tbl td { padding: 5px var(--sp-2h); border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ddm-tbl thead th { position: sticky; top: 0; z-index: 1; background: var(--bg2); font-weight: 600; color: var(--tx2); font-size: var(--fs-2xs); letter-spacing: .04em; }
.th-tag { display: inline-block; padding: 1px var(--sp-1h); margin-right: var(--sp-1h); border-radius: 5px; font-size: var(--fs-2xs); background: var(--bg2); color: var(--tx2); }
.th-tag.base { background: var(--ac-soft); color: var(--ac-hi); font-weight: 650; }
.th-id { font-size: var(--fs-2xs); color: var(--tx2); }
td.p { width: 32%; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--tx1); }
td.v { min-width: 180px; word-break: break-all; color: var(--tx0); }
/* 格级状态：值冲突红底、单侧独有琥珀、基准独有弱琥珀；一致行整体弱化保对比重点 */
.c-chg { background: var(--err-soft); }
.k-only-target td.v.c-ot, td.v.c-ot { background: var(--warn-line); }
.k-only-base td.v.c-ob, td.v.c-ob { background: var(--warn-line); color: var(--tx1); }
tr.k-same td { color: var(--tx2); }
tr.k-same:hover td { color: var(--tx0); }
tr:hover td.p { color: var(--tx0); }
.cell { cursor: copy; position: relative; }
.cell .c-ic { opacity: 0; position: absolute; right: 6px; top: 7px; color: var(--tx2); transition: opacity var(--tr); }
.cell:hover .c-ic { opacity: .8; }
.empty { text-align: center; color: var(--tx2); padding: var(--sp-5) 0 !important; }
</style>
