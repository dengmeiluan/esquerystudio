<template>
  <div class="ja" :class="{ fill }">
    <div class="ja-bar">
      <span class="ja-dot" :class="'ja-' + validity" :title="validity === 'ok' ? 'JSON 合法' : validity === 'bad' ? 'JSON 非法' : '空'" />
      <span v-if="validity === 'bad'" class="ja-err">{{ errMsg }}</span>
      <span style="flex:1" />
      <!-- W2：readonly 态格式化/压缩（编辑动作）隐藏、复制保留——缺省分支零改动，
 既有消费方（不传 readonly）渲染逐字节不变 -->
      <button v-if="!readonly" class="ja-btn" title="格式化（2 空格缩进）" @click="fmt"><WrapText :size="11" /> 格式化</button>
      <button v-if="!readonly" class="ja-btn" title="压缩为单行" @click="minify"><FoldVertical :size="11" /> 压缩</button>
      <button class="ja-btn" title="复制全文" @click="copy"><Copy :size="11" /> 复制</button>
    </div>
    <!-- submit = MonacoEditor 既有 Ctrl+Enter（es-execute action）透传。
 纯新增 emit：不监听的既有消费方行为零变化（Ctrl+Enter 此前在 JsonArea 内即
 emit('execute') 无人接，透传后同样无人接）。 -->
    <MonacoEditor
      ref="meRef"
      :model-value="modelValue"
      language="json"
      :height="fill ? '100%' : `${rows * 19 + 16}px`"
      :readonly="readonly"
      :dsl-assist="dslAssist"
      :font-size="fontSize"
      @update:model-value="emit('update:modelValue', $event)"
      @execute="emit('submit')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Copy, WrapText, FoldVertical } from 'lucide-vue-next';
import { copyText } from '../utils/format';
import { useAppStore } from '../stores/app';
import MonacoEditor from './MonacoEditor.vue';
import type { BodyKind } from '../utils/dslCompletionContext';

/* placeholder 保留签名仅为 15 处调用零改动：Monaco 无 placeholder 概念，
 空态语义由 validity 圆点（ja-empty）承担 */
const props = withDefaults(defineProps<{
  modelValue: string;
  rows?: number;
  placeholder?: string;
  fill?: boolean;
  /* v3.0.1:透传 MonacoEditor dslAssist——DSL 编辑器统一字段智能补全(IndexHub 查询 tab 等),默认关不影响既有调用方
 契约补 analyzers 可选字段(MonacoEditor.vue 同名契约此前分叉——Monaco 侧 524+1 已扩,
 本统一件漏跟),对象整体透传内层 Monaco,缺席=analyzer 值位通道关,15 处既有调用零改动
 契约再补 terms 可选字段(533 同款对齐——Monaco 侧 658 已扩,值位动态候选
 top20 经整体透传直达内层 Monaco,缺席=零注册行为逐字节现状) */
  dslAssist?: { fields: () => { path: string; type: string }[]; bodyKind?: () => BodyKind; analyzers?: () => string[]; terms?: (field: string, prefix: string) => Promise<string[]> };
  /* W2：readonly 通道——薄透传内层 Monaco readOnly（MonacoEditor 契约既有，含运行时
 watch 追随），缺省 false=既有行为逐字节不变、既有消费方零感知。readonly 态最小确定解：
 格式化/压缩（编辑动作）隐藏、复制保留；高度模型不动（rows 换算/fill 原样）——消费方要
 「随内容生长至封顶」用 rows=min(内容行数,封顶行数) 表达（纯内容函数，无 DOM 测量回路，
 Xmigrate 源配置预览即此消费形态） */
  readonly?: boolean;
  /* 字号薄透传——内层 Monaco 既有可选 prop（同步补 watch 响应缺角），
 缺席=undefined 透传、内层 withDefaults 缺省档 12.5 承接，既有 21 处消费方零感知；
 IH 查询 tab 编辑器（ih.font）首消费 */
  fontSize?: number;
}>(), { rows: 10, placeholder: '', fill: false, readonly: false });
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  /* Ctrl+Enter 提交透传（来源 MonacoEditor 既有 execute action），可选监听零影响 */
  (e: 'submit'): void;
}>();
const store = useAppStore();
const errMsg = ref('');

const validity = computed<'ok' | 'bad' | 'empty'>(() => {
  const s = (props.modelValue || '').trim();
  if (!s) return 'empty';
  try { JSON.parse(s); errMsg.value = ''; return 'ok'; }
  catch (e: any) { errMsg.value = String(e?.message || '').slice(0, 60); return 'bad'; }
});

function fmt() {
  try { emit('update:modelValue', JSON.stringify(JSON.parse(props.modelValue), null, 2)); }
  catch { store.notify('warning', 'JSON 非法，无法格式化'); }
}
function minify() {
  try { emit('update:modelValue', JSON.stringify(JSON.parse(props.modelValue))); }
  catch { store.notify('warning', 'JSON 非法，无法压缩'); }
}
async function copy() {
  const ok = await copyText(props.modelValue || '');
  store.notify(ok ? 'success' : 'error', ok ? '已复制' : '复制失败');
}

/* 外部聚焦入口（粘贴导入弹窗打开即聚焦，替代原裸 textarea 的 autofocus）。
 MonacoEditor 已 expose getEditor，此处仅转发——未挂载/已销毁/测试 stub 无该能力时
 双可选链静默，不抛错。 */
const meRef = ref<InstanceType<typeof MonacoEditor> | null>(null);
function focus() { meRef.value?.getEditor?.()?.focus(); }
/* setMarkers 透传——父面把 lint findings 注入内层 Monaco 划线
 （MonacoEditor 已 expose setMarkers，此前全站仅 DslQueryView 直挂 Monaco 消费；
 JsonArea 统一件包了内层 Monaco，父面拿不到实例，此处补同签名出口）。
 severity 结构类型与 MonacoEditor.setMarkers 泛型约束同形（info 由调用方降级 hint 后再喂，
 DslQueryView 同口径）；未挂载/测试 stub 时可选链静默返回 undefined。 */
type MarkerFinding = { message: string; suggestion: string; severity: 'warning' | 'hint' | 'error'; anchor: string; nth: number; rule?: string };
function setMarkers(findings: MarkerFinding[]) {
  return meRef.value?.setMarkers?.(findings);
}
/* getEditor 透传——父面拿内层 Monaco 实例（IndexHub Ctrl+I 补全接线等
 useMonacoLocate/DevToolsView registerFormatKeybind 同通道；MonacoEditor :931 已 expose
 getEditor，此处仅转发）。全站多宿主（AR/IH/Doc）共用本组件，expose 纯增量：
 未挂载/已销毁/测试 stub 无该能力时双可选链静默，不抛错。 */
function getEditor() { return meRef.value?.getEditor?.(); }
defineExpose({ focus, setMarkers, getEditor });
</script>

<style scoped>
.ja { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-s); overflow: hidden; background: var(--bg0); }
.ja:focus-within { border-color: var(--ac); }
.ja-bar { display: flex; align-items: center; gap: var(--sp-1h); padding: 3px var(--sp-2); border-bottom: 1px solid var(--line); background: var(--bg1); }
.ja-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
/* 状态类带 ja- 前缀：裸 empty 会被 theme.css 全局空态类 .empty 的 padding 撑成大椭圆 */
.ja-dot.ja-ok { background: var(--ok); }
.ja-dot.ja-bad { background: var(--err); }
.ja-dot.ja-empty { background: var(--tx2); opacity: .5; }
.ja-err { font-size: var(--fs-xs); color: var(--err); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
.ja-btn {
  display: inline-flex; align-items: center; gap: 3px; font-size: var(--fs-xs);
  background: none; border: none; cursor: pointer; color: var(--tx2);
  padding: var(--sp-0) 5px; border-radius: var(--r-xs); font-family: inherit;
}
.ja-btn:hover { color: var(--tx0); background: var(--bg2); }
/* MonacoEditor 的 .monaco-host 自带 border/radius，与 .ja 外壳叠加出双层边框——组件内统一剥掉 */
.ja :deep(.monaco-host) { border: none; border-radius: 0; }
/* fill：调用方卡片给定高度/flex 容器时编辑器吃满剩余高度。
 内联 height 由 !important 接管，MonacoEditor automaticLayout 跟随容器尺寸 */
.ja.fill { flex: 1; min-height: 0; }
.ja.fill :deep(.monaco-host) { height: auto !important; flex: 1; min-height: 0; }
</style>
