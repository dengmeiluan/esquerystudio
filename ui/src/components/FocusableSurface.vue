<template>
  <section
    ref="rootEl"
    class="fs"
    :class="{ 'fs-active': enabled }"
    :data-focused-pane="enabled ? paneId : undefined"
    :role="enabled ? 'dialog' : undefined"
    :aria-modal="enabled ? 'true' : undefined"
    :aria-label="enabled ? `${title}（聚焦）` : undefined"
    :tabindex="enabled ? -1 : undefined"
  >
    <div v-if="!headless" class="fs-head" :class="{ on: enabled }">
      <!-- 同钮双态根治「放大后缩小不了」——此前聚焦后按钮仍是「聚焦」，
 点击无效果，唯一退出路径是 Esc（鼠标用户无路可退）；现聚焦态按钮切换为
 「还原」图标，点击即退出，Esc 双保险保留 -->
      <button
        type="button"
        class="fs-btn"
        :data-focus-pane="paneId"
        :aria-label="enabled ? `还原${title}` : `聚焦${title}`"
        :title="enabled ? `还原${title}（Esc 也可退出）` : `聚焦${title}`"
        @click="enabled ? deactivate() : activate()"
      >
        <Maximize2 v-if="!enabled" :size="12" />
        <Minimize2 v-else :size="12" />
      </button>
      <slot name="actions" />
    </div>
    <div class="fs-body"><slot /></div>
  </section>
</template>

<script setup lang="ts">
/* P1 聚焦面（plan ）：Esc 退出 + 焦点恢复 + 焦点陷阱最小集。
 关键取舍：聚焦用「同一 DOM 加 fs-active 定位样式」而非 Teleport 搬运——
 slot 内是 Monaco/表格等重组件，搬运即重挂载丢状态；只变视觉容器，
 业务状态零复制（plan 红线）。激活时锁 body 滚动，卸载强制还回。 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { Maximize2, Minimize2 } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  paneId: string;
  title: string;
  enabled?: boolean;
  /** v3.0.1 实报「放大钮不应独占一行」:headless 模式不渲染 fs-head 行,
 放大/还原钮由调用方放进既有工具栏(触发外部切换 enabled),Esc 退出与焦点管理保留 */
  headless?: boolean;
}>(), { enabled: false, headless: false });

const emit = defineEmits<{ (e: 'update:enabled', value: boolean): void }>();

const rootEl = ref<HTMLElement | null>(null);
let triggerEl: HTMLElement | null = null;

function activate() {
  emit('update:enabled', true);
}

function deactivate() {
  emit('update:enabled', false);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    /* 输入控件内 Esc 先由其自消费（Monaco 查找栏关闭、输入撤销），
 不直接关聚焦面——二次 Esc 才退出（此时焦点已不在输入控件） */
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.stopPropagation();
    emit('update:enabled', false);
  }
}

watch(() => props.enabled, on => {
  if (on) {
    /* 触发时焦点存档统一上移到此（569 ModalShell 同范式单源）——原 activate()
 存档只覆盖 fs-btn 点击路径，headless（RT/QRT/LiveDashboard/SearchSandbox 外部工具钮
 直切）与 focusPaneId（DevTools 等五视图）全站 9+ 消费面绕过它，Esc 退出后焦点滞留
 fs 根=键盘用户丢位置；emit→watch 同步链内 activeElement 仍是触发钮，fs-btn 路径
 语义等价（focusSurfaceEsc570 ②） */
    triggerEl = (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    document.addEventListener('keydown', onKeydown, true);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => rootEl.value?.focus());
  } else {
    document.removeEventListener('keydown', onKeydown, true);
    document.body.style.overflow = '';
    if (triggerEl && document.contains(triggerEl)) triggerEl.focus();
    triggerEl = null;
  }
}, { immediate: true });

onBeforeUnmount(() => {
  if (props.enabled) {
    document.removeEventListener('keydown', onKeydown, true);
    document.body.style.overflow = '';
    if (triggerEl && document.contains(triggerEl)) triggerEl.focus();
  }
});
</script>

<style scoped>
.fs { display: flex; flex-direction: column; min-width: 0; min-height: 0; position: relative; }
/* 终态=工具行一体化——hover-reveal(507)仍保留「浮角」形态被批反复;
 fs-head 定格为文档流首行工具行(可换行),聚焦钮作为行首元素与 actions slot 的
 业务按钮同排,聚焦态整行提级;从结构上不存在「浮在面板上的孤钮」。 */
.fs-head { display: flex; align-items: center; flex-wrap: wrap; row-gap: var(--sp-1); gap: var(--sp-1); position: relative; padding: var(--sp-1) var(--sp-2); z-index: 3; background: var(--bg1); border-bottom: 1px solid var(--line); }
/* 聚焦钮恒靠右(有 actions 时工具钮居左,无 actions 时钮独占右缘)——
 双 pane 钮位对称,消除「左上孤钮」 */
.fs-btn { margin-left: auto; }
.fs-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border: 1px solid var(--line); border-radius: 5px;
  background: var(--bg0); color: var(--tx2); cursor: pointer; font-size: var(--fs-xs);
}
.fs-btn:hover, .fs-btn:focus-visible { color: var(--ac); border-color: var(--ac); outline: none; }
/* 聚焦态下还原钮必须一眼可见——底色提级+主色描边（此前小灰钮浮在 Monaco 上不可辨） */
.fs-head.on .fs-btn {
  background: var(--bg1); color: var(--ac); border-color: var(--ac);
  box-shadow: var(--shadow-m);
  width: 26px; height: 26px;
}
/* fs-body 转纵向 flex——slot 内容（工具行+输出区）需要「工具行自然高+
 输出区 flex:1 吸收 pane 高」的分布；此前 block 流里输出区的 flex 拉伸失效，
 pane 拉高后输出区下方留大片空白。 */
.fs-body { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.fs-body > :deep(*) { flex: 0 0 auto; }
.fs-body > :deep(.dt-out), .fs-body > :deep(*[data-flex-fill]) { flex: 1 1 auto; min-height: 0; }
/* 聚焦态：同一 DOM 提升为全屏面（无 Teleport 搬运），背景蒙层 + 层级置顶 */
.fs-active {
  /* W8：z 收 --z-focus 档（theme.css 阶梯聚焦面=300，等价旧裸值） */
  position: fixed; inset: 12px; z-index: var(--z-focus);
  background: var(--bg0); border: 1px solid var(--ac);
  border-radius: var(--r-m); box-shadow: var(--shadow-pop, var(--shadow-m));
  outline: none;
}
</style>
