<!-- 同构确认弹窗双实现——数值改动必须两边同步(另一半:GuardedActionButton.vue)。
 W10 备注：dismissable「本次会话不再询问」仅本组件承担——GuardedActionButton
 是 critical 守卫形态，永不参与会话级跳过，无需同步此能力。
 mask+box 壳层合并 ModalShell 共享件（结构+CSS 单源），
 本组件只余业务体；焦点陷阱/Enter 接管仍走本组件 boxRef 容器（含 foot，语义逐字不变） -->
<template>
  <ModalShell :show="show" :label="title" width="460px" :line="mskLine" @close="cancel">
    <div ref="boxRef" class="cf" :class="'lv-' + effLevel">
      <div class="cf-head">
        <component :is="levelIcon" :size="16" class="cf-icon" />
        <span class="cf-title">{{ title }}</span>
      </div>
      <div class="cf-body">
        <slot>{{ message }}</slot>
      </div>
      <!-- facts：高危确认的关键标识符具名行（快照名/别名→索引/taskId）——
 正文只留动作语句，标识符逐行加粗 mono 强调；critical 档值随守卫同色 -->
      <div v-if="facts.length" class="cf-facts">
        <div v-for="(f, i) in facts" :key="i" class="cf-fact">
          <span class="cf-fact-k">{{ f.label }}</span>
          <b class="mono cf-fact-v" :class="{ 'cf-fact-err': effLevel === 'critical' }">{{ f.value }}</b>
        </div>
      </div>
      <div v-if="level === 'critical' && guardText" class="cf-guard">
        <div class="cf-guard-tip">输入 <b class="mono">{{ guardText }}</b> 以确认操作：</div>
        <input ref="guardRef" v-model="guardInput" class="inp mono" :placeholder="guardText" @keydown.enter="ok" />
      </div>
      <!-- W10：会话级防呆——仅调用方显式 dismissable 且非 critical/无守卫时给
 checkbox；勾选并确认后按 title 哈希写 sessionStorage，askConfirm 命中即直接放行 -->
      <label v-if="canDismiss" class="cf-skip">
        <input v-model="skipForever" type="checkbox" />
        <span>本次会话不再询问</span>
      </label>
      <div class="cf-foot">
        <button class="btn" @click="cancel">取消</button>
        <button ref="okBtnRef" class="btn" :class="okCls" :disabled="level === 'critical' && !!guardText && guardInput !== guardText" @click="ok">
          {{ okText }}
        </button>
      </div>
    </div>
  </ModalShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { AlertTriangle, AlertOctagon, Info } from 'lucide-vue-next';
import { trapTabKey } from '../utils/focusTrap';
/* W10：跳过键写入（isConfirmSkipped 在 confirm.ts 的 askConfirm 入口消费） */
import { rememberConfirmSkip } from '../composables/confirm';
/* mask+box 壳层共享件（同构确认弹窗双实现合流） */
import ModalShell from './ModalShell.vue';

const props = withDefaults(defineProps<{
  show: boolean;
  title: string;
  message?: string;
  level?: 'info' | 'warn' | 'critical';
  guardText?: string;
  okText?: string;
  facts?: { label: string; value: string }[];
  /** W10：会话级「不再询问」开关（仅 warn/info 语义）；critical/guardText 永不生效 */
  dismissable?: boolean;
}>(), {
  level: 'warn',
  okText: '确认执行',
  message: '',
  guardText: '',
  facts: () => [],
  dismissable: false,
});

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'confirm'): void;
}>();

const guardInput = ref('');
const guardRef = ref<HTMLInputElement>();
const okBtnRef = ref<HTMLButtonElement>();
const boxRef = ref<HTMLElement>();
/* W10：checkbox 状态每次弹出新置 false——跳过必须是用户逐次显式勾选的意图 */
const skipForever = ref(false);
/* critical/guardText 永不带 checkbox：不可逆操作的守卫不允许被会话级跳过短路 */
const canDismiss = computed(() => !!props.dismissable && props.level !== 'critical' && !props.guardText);
watch(() => props.show, async (v) => {
  if (v) {
    guardInput.value = '';
    skipForever.value = false;
    await nextTick();
    /* critical 聚焦守卫输入框（有原生 @keydown.enter）；warn/info 聚焦确认按钮——
 此前 warn 弹出不移动焦点，外部表单 input 焦点下 Enter 落空
 （中性焦点判断失效、按钮又没焦点），用户必须鼠标点确认。聚焦按钮后
 原生 Enter=点击，Tab 循环也从确认钮开始（无障碍改进）。 */
    (props.guardText ? guardRef : okBtnRef).value?.focus();
  }
}, { immediate: true });

/* Tab 焦点陷阱 + Enter 接管（仅本弹窗可见时响应）。：Esc 取消已由 ModalShell
 壳层 document 捕获级单源承接——本组件 @close 即 cancel，与原自持分支同一函数语义等价；
 Enter/Tab 不属壳层拦截面，自持路径保真。 */
function onKey(e: KeyboardEvent) {
  if (!props.show) return;
  /* Enter=确认（快捷性）。仅中性焦点（body/弹窗容器）才接管——
 焦点在按钮/输入框上时原生行为已表达用户意图，接管会造成双触发；
 guard 输入框有原生 @keydown.enter；critical 守卫未满足时 ok() 自身会拦。 */
  if (e.key === 'Enter') {
    const el = document.activeElement as HTMLElement | null;
    const inBox = el && (el === boxRef.value || boxRef.value?.contains(el));
    if (!el || el === document.body || (inBox && el.tagName !== 'BUTTON'
        && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) {
      ok();
      return;
    }
  }
  if (boxRef.value) trapTabKey(boxRef.value, e);
}
window.addEventListener('keydown', onKey);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

/* critical 但未传 guardText 时降级为 warn 视觉：守卫框不渲染，也不套 disabled/输入校验 */
const effLevel = computed(() => props.level === 'critical' && !props.guardText ? 'warn' : props.level);
const levelIcon = computed(() => effLevel.value === 'critical' ? AlertOctagon : effLevel.value === 'warn' ? AlertTriangle : Info);
const okCls = computed(() => props.level === 'info' ? 'pri' : 'danger');
/* box 语义边框走 ModalShell --msk-line 变量（原 .cf.lv-* border-color
 覆盖语义逐字等价；info 档空串落壳默认 line-strong） */
const mskLine = computed(() => effLevel.value === 'critical' ? 'var(--err-line)' : effLevel.value === 'warn' ? 'var(--warn-line)' : '');

function ok() {
  if (props.level === 'critical' && props.guardText && guardInput.value !== props.guardText) return;
  /* W10：勾选「本次会话不再询问」→ 按 title 哈希落 sessionStorage，
 askConfirm 入口命中同标题即直接 resolve true（机制契约见 composables/confirm.ts） */
  if (canDismiss.value && skipForever.value) rememberConfirmSkip(props.title);
  /* confirm 先于 update:show——全局确认服务宿主靠此区分「确认」与「取消关闭」 */
  emit('confirm');
  emit('update:show', false);
}
function cancel() { emit('update:show', false); }
</script>

<style scoped>
/* mask/box 壳 CSS（.cf-mask/.cf/.cf.lv-*）合并 ModalShell 单源，
 本地段只余业务体；foot（.cf-foot）为 confirmKeyboard/w10ReduceSteps525 DOM 锚保留自持 */
.cf-head { display: flex; align-items: center; gap: 9px; padding: 14px var(--sp-4) 0; }
.cf-icon { flex-shrink: 0; }
.lv-critical .cf-icon { color: var(--err); }
.lv-warn .cf-icon { color: var(--warn); }
.lv-info .cf-icon { color: var(--info); }
.cf-title { font-size: var(--fs-md); font-weight: 650; }
.cf-body { padding: var(--sp-2h) var(--sp-4) 14px; font-size: var(--fs-sm); color: var(--tx1); line-height: 1.6; }
.cf-guard { padding: 0 var(--sp-4) var(--sp-3); }
.cf-guard-tip { font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-1h); }
.cf-guard-tip b { color: var(--err); }
/* W10：会话级防呆 checkbox 行（facts 之后、foot 之前；仅 dismissable+非 critical 渲染） */
.cf-skip { display: flex; align-items: center; gap: var(--sp-1h); padding: 0 var(--sp-4) var(--sp-3); font-size: var(--fs-xs); color: var(--tx2); user-select: none; cursor: pointer; }
/* facts 具名标识符区：窄 label + 长值 word-break，形态克制不抢守卫框 */
.cf-facts { padding: 0 var(--sp-4) var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-1); }
.cf-fact { display: flex; align-items: baseline; gap: var(--sp-2h); font-size: var(--fs-sm); line-height: 1.5; }
.cf-fact-k { flex: none; color: var(--tx2); min-width: 72px; }
.cf-fact-v { color: var(--tx0); word-break: break-all; min-width: 0; }
.cf-fact-v.cf-fact-err { color: var(--err); }
.cf-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--line); background: var(--bg0); }
</style>
