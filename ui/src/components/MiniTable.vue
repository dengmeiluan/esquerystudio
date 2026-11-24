<template>
  <!-- 语义小表统一件：迁移/重建板块详情区「键值/清单/轮次」类表格的组件化收敛。
       视觉基线 = theme.css .tbl 全套（表头分层底、行 hover 左缘高亮、斑马罩），
       组件只补四件事：列声明式渲染、按列插槽 cell-<key>、表头富单元格槽
       head-cell-<key>、空态统一件 EmptyState。
       查询结果大表仍归 ResultTable/QueryResultTable（那是数据网格域，不是语义小表域）。 -->
  <div class="mt">
    <table class="tbl" :class="[tableClass, { zebra, 'mt-dense': dense }]">
      <caption v-if="caption" class="mt-cap">{{ caption }}</caption>
      <thead>
        <tr>
          <th
            v-for="col in columns" :key="col.key"
            :style="col.width ? { width: col.width } : undefined"
            :class="{ 'mt-th-r': col.align === 'right' || col.align === 'center' }"
          >
            <!-- 表头富单元格槽：胶囊/短 id/悬浮全文等富表头经 #head-cell-<key> 接管，
                 透传 { column, key }；无插槽时回落纯文本 label（既有宿主 DOM 零漂移） -->
            <slot :name="`head-cell-${col.key}`" :column="col" :key="col.key">{{ col.label }}</slot>
          </th>
        </tr>
      </thead>
      <tbody v-if="$slots.rows">
        <!-- 行自治模式：宿主经 #rows 槽自带整段行内容（行级右键菜单/键盘行导航/
             colspan 折叠行/tfoot 聚合等声明式 API 不承载的交互），表头与表格壳仍归本组件 -->
        <slot name="rows" />
      </tbody>
      <tbody v-else-if="rows.length">
        <tr v-for="(row, i) in rows" :key="rowKeyOf(row, i)">
          <td v-for="col in columns" :key="col.key" :class="cellClass(col)">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]" :index="i">{{ cellText(row[col.key], col) }}</slot>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="$slots.tfoot"><slot name="tfoot" /></tfoot>
    </table>
    <EmptyState v-if="!$slots.rows && !rows.length" :icon="emptyIcon" :text="emptyText" compact />
  </div>
</template>

<script setup lang="ts">
/* 声明式语义小表：columns 声明列（label/对齐/等宽字体），rows 喂数据，
 * 单元格默认渲染原始值（mono 列走等宽右对齐），需要富内容时按列插槽接管
 * （#cell-status 拿 { row, value, index } 渲染 StatusPill 等）。
 * 表头同理默认渲染纯文本 label，富表头（胶囊/短 id/悬浮全文）经
 * #head-cell-<key> 接管（拿 { column, key }），槽优先于 label 文本。
 * 行级交互（右键菜单/键盘行导航/colspan 折叠行）超出声明式表达力时走
 * #rows 行自治槽：宿主自带整段 tbody 行内容（此时 rows 声明式数据与统一空态让位），
 * #tfoot 同理自带聚合行。
 * rowKey 缺省用行号；行内容会变序/增删的宿主请传稳定键字段名。 */
import { computed, type Component } from 'vue';
import { Table2 } from 'lucide-vue-next';
import EmptyState from './EmptyState.vue';

export type MiniTableColumn = {
  key: string;
  label: string;
  /** right=等宽右对齐（数值），center=居中，缺省左对齐 */
  align?: 'left' | 'right' | 'center';
  /** 表头列宽（CSS width 值，如 '180px' / '20%'） */
  width?: string;
  /** 数值/代码语义列：等宽字体（对齐交给 align） */
  mono?: boolean;
};

const props = withDefaults(defineProps<{
  columns: MiniTableColumn[];
  /** 声明式行数据（行自治模式下经 #rows 槽自带，可不传） */
  rows?: Record<string, unknown>[];
  /** 稳定行键字段名（缺省行号） */
  rowKey?: string;
  caption?: string;
  /** 斑马罩默认关：换用本组件的存量表格原先均无斑马，视觉零漂移优先；长表扫读需要时显式开 */
  zebra?: boolean;
  dense?: boolean;
  emptyText?: string;
  emptyIcon?: Component;
  /** 宿主表格皮肤类（迁移期沿用原 table 的类名，如 xm-batch-tbl，视觉与选择器零变化） */
  tableClass?: string;
}>(), { rows: () => [], caption: '', zebra: false, dense: false, emptyText: '暂无数据', tableClass: '' });

const emptyIcon = computed(() => props.emptyIcon ?? Table2);

function rowKeyOf(row: Record<string, unknown>, i: number): string {
  const k = props.rowKey ? row[props.rowKey] : undefined;
  return k !== undefined && k !== null ? String(k) : String(i);
}

function cellClass(col: MiniTableColumn): string {
  if (col.align === 'right') return 'mt-num';
  if (col.align === 'center') return 'mt-ctr';
  return col.mono ? 'mt-mono' : '';
}

function cellText(v: unknown, col: MiniTableColumn): string {
  if (v === undefined || v === null) return '—';
  if (col.mono) return String(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
</script>

<style scoped>
.mt { width: 100%; }
/* 紧凑档：行内/弹层窄容器用（表头 padding 减半、行高收紧），默认档与 .tbl 全局值一致 */
.mt-dense th { padding: var(--sp-1) var(--sp-2); }
.mt-dense td { padding: 4px var(--sp-2); }
.mt-cap { caption-side: top; text-align: left; font-size: var(--fs-xs); color: var(--tx2); padding-bottom: var(--sp-1); letter-spacing: var(--ls-wide); }
.mt-num { font-family: var(--mono); text-align: right; }
.mt-ctr { text-align: center; }
.mt-mono { font-family: var(--mono); }
.mt-th-r { text-align: right; }
</style>
