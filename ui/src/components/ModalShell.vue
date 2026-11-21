<!-- 同构确认弹窗共享壳（原 ConfirmModal/GuardedActionButton 双实现
 的 mask+box 结构与 CSS 合并单源——两组件首行「同构确认弹窗双实现」注释的壳层在此合流，
 业务体（图标/文案/守卫输入/facts/askConfirm 契约/foot 按钮组）仍归消费方；
 focusTrap/Enter 接管语义仍由消费方 window keydown 自持（boxRef 容器含 foot，逐块对照零回归）。
 语义边框（err 红/warn 琥珀档）走 --msk-bd 变量：prop 传入经内联样式落 box，CSS 变量
 免消费方 :deep（scoped 安全；命名避用 *-line 尾缀——pillSingleTrack 的 -soft/-line
 token 守卫要求该尾缀必须在 theme.css 双主题定义，壳内局部变量不属 token 族）。宽度档约定 --dlg-w：small 340 / info 460 / confirm 560 /
 large 640（档注见 theme.css --z-confirm 段），消费方经 width prop 传入，不迁散值。 -->
<template>
  <teleport to="body">
    <transition name="pop">
      <div v-if="show" ref="maskEl" class="msk-mask" role="presentation" @click.self="$emit('close')">
        <div ref="boxEl" class="msk-box" :style="boxStyle" role="dialog" aria-modal="true" :aria-label="label">
          <slot />
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue';
/* naive-ui 同款层计数器（naive-ui 自身依赖，深路径同源；无 exports 锁深导入合法） */
import zIndexManager from 'vdirs/es/zindexable/z-index-manager';

const props = withDefaults(defineProps<{
  show: boolean;
  /** box 的 aria-label（ConfirmModal=title 文案；GuardedActionButton=「影响预估」） */
  label: string;
  /** 弹层宽度档（--dlg-w 值）；缺省落壳内默认 460（info 档） */
  width?: string;
  /** box 语义边框色（如 var(--err-line)）；缺省常态 line-strong 档 */
  line?: string;
}>(), { width: '', line: '' });

const emit = defineEmits<{ (e: 'close'): void }>();

const boxStyle = computed<Record<string, string>>(() => {
  const s: Record<string, string> = {};
  if (props.width) s['--dlg-w'] = props.width;
  if (props.line) s['--msk-bd'] = props.line;
  return s;
});

/* Esc 收口升 document 捕获级（566 Pagination / 568 ColFilterPopover 约定推广；
 568 弹层台账 B 档头号——壳 mask 元素级修饰符依赖 mask 持焦点收键，第三消费方 RawIoModal
 零键盘接管，焦点在页面任意处按 Esc 关不掉=真缺陷）。本壳是常驻组件（prop 控显隐），
 与 CFP「挂载即开层」不同：开层（show→true）才存触发时焦点并挂捕获级监听，收 Escape 即
 stopPropagation+emit close（单源化：ConfirmModal/GAB 自持收键分支同步退役，其 @close
 与原分支调用的 cancel/close 是同一函数，语义逐字等价）；关层（show→false）摘监听+焦点
 回触发时焦点（还档=关层伴随效果，拒关场景如 GAB 执行中 close 自拒、show 不变则焦点
 不动）；卸载兜底摘监听（CellContextMenu 417 挂/摘配对同款）。
 源码锁 modalShellEsc569⑦：mask 可聚焦占位与元素级收键形态不得回流本文件。 */
let escPrevFocus: HTMLElement | null = null;
function onDocEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  emit('close');
}
/* z 序动态跟随：本壳常从 naive 弹层（集群连接管理等 preset=card 弹窗，vdirs 管理器 2000 起
 自增）内触发，静态档 --z-confirm 1300 永远压不过宿主弹层——开层把 mask 注册进 naive 同款
 计数器（后开者胜），关层/卸载反注册；全域无层时管理器自然回落 2000，与 naive 同拍。 */
const maskEl = ref<HTMLElement>();
watch(() => props.show, (v) => {
  if (v) {
    escPrevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('keydown', onDocEsc, true);
    nextTick(() => { if (maskEl.value) zIndexManager.ensureZIndex(maskEl.value); });
  } else {
    document.removeEventListener('keydown', onDocEsc, true);
    if (maskEl.value) zIndexManager.unregister(maskEl.value);
    const back = escPrevFocus;
    escPrevFocus = null;
    nextTick(() => back?.focus());
  }
}, { immediate: true });
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocEsc, true);
  if (maskEl.value) zIndexManager.unregister(maskEl.value);
  escPrevFocus = null;
});

/* 消费方焦点陷阱（trapTabKey）与 Enter 接管的 contains 判定仍以「含全部按钮的容器」为界——
 消费方自带内层容器 ref（语义与原 boxRef 逐字等价），boxEl 仅供对照/调试备用 */
const boxEl = ref<HTMLElement>();
defineExpose({ boxEl });
</script>

<style scoped>
/* 弹层宽度档位:small 340 / info 460 / confirm 560 / large 640(档约定见 theme.css --z-confirm 段档注) */
.msk-mask { position: fixed; inset: 0; z-index: var(--z-confirm); background: var(--mask); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; }
.msk-box { --dlg-w: 460px; --msk-bd: var(--line-strong); width: var(--dlg-w); max-width: 92vw; background: var(--bg1); border: 1px solid var(--msk-bd); border-radius: var(--r-l); box-shadow: var(--shadow-pop); overflow: hidden; }
</style>
