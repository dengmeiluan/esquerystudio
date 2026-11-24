<template>
  <!-- 统一文本输入件：原生 input 的组件化承载（实现层豁免于原生控件禁令）。
       视觉基线 = theme.css .inp（同 token 同焦点环），在此之上补齐裸 input 缺位的
       状态表达（warn/err 边框+柔光）、一键清空、宿主皮肤类逃生舱（inputClass，
       迁移期视觉零变化的同款手法沿用 SuggestInput）。 -->
  <div class="ti" :class="[`ti-${size}`, `ti-${status}`]">
    <span v-if="$slots.prefix" class="ti-affix"><slot name="prefix" /></span>
    <input
      ref="inputEl"
      class="ti-inp"
      :class="inputClass"
      :value="shownValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :maxlength="maxlength"
      type="text"
      spellcheck="false"
      autocomplete="off"
      v-bind="$attrs"
      @input="onInput"
      @keydown="onKey"
      @focus="$emit('focus', $event)"
      @blur="onBlur"
    />
    <button
      v-if="clearable && ($slots.suffix || canClear)"
      v-show="canClear"
      type="button"
      class="ti-clear"
      :class="{ 'ti-inflow': $slots.suffix }"
      v-tip="'清空'"
      tabindex="-1"
      :aria-label="'清空输入'"
      @mousedown.prevent
      @click="clear"
    ><X :size="12" /></button>
    <span v-if="$slots.suffix" class="ti-affix"><slot name="suffix" /></span>
  </div>
</template>

<script setup lang="ts">
/* 单行文本输入统一件——迁移板块与全站裸 <input class="inp"> 的收敛目标。
 * 语义对齐原裸 input（v-model / enter / esc / blur / focus / data-test 等 attrs
 * 透传到真实 input，测试选择器零漂移）；type/spellcheck/autocomplete 的缺省值同样
 * 放行宿主覆盖——v-bind="$attrs" 置于静态绑定之后（Vue3 后绑定胜），凭据语义
 * （autocomplete="username"/"new-password"）可从宿主直达真实 input。并升级三件事：
 *  1) 状态色：status=warn/err 时边框+同色柔光（裸 input 只能靠宿主再包一层）；
 *  2) 清空钮：clearable 且有值时出现，v-tip 提示，点击后回焦输入框；
 *  3) 前后缀槽：prefix/suffix（单位、图标），裸 input 做不到的内联结构。 */
import { computed, ref } from 'vue';
import { X } from 'lucide-vue-next';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  /** 宿主输入框皮肤类（迁移期沿用原 input 的类名组合，视觉零变化） */
  inputClass?: string;
  disabled?: boolean;
  readonly?: boolean;
  maxlength?: number;
  mono?: boolean;
  size?: 'md' | 'sm';
  status?: 'default' | 'warn' | 'err';
  clearable?: boolean;
  /** v-model 修饰符（v-model.trim → { trim: true }）。必须声明为 prop：否则随 $attrs 落到真实
      input，DOM 上出 modelmodifiers="[object Object]"，组件也无从得知 trim 档是否开启 */
  modelModifiers?: Record<string, boolean>;
}>(), { placeholder: '', inputClass: '', disabled: false, readonly: false, mono: false, size: 'md', status: 'default', clearable: false, modelModifiers: () => ({}) });

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void;
  (e: 'enter'): void;
  /** Esc：清空语义归宿主（与被替换裸 input 的 Esc 约定一致） */
  (e: 'esc'): void;
  (e: 'focus', ev: FocusEvent): void;
  (e: 'blur', ev: FocusEvent): void;
}>();

const inputEl = ref<HTMLInputElement>();

const canClear = computed(() => !props.disabled && !props.readonly && (props.modelValue || '') !== '');

/* .trim 档的显示值：回写模型的值已去首尾空白，但输入过程中的真实 input 保留原样（含空格）——
   显示值直接绑模型的话，模型一变就重渲染，刚敲入的空格会立刻被吃掉（原生 v-model.trim 同样
   不动 DOM）。模型被外部改写（清空/回填）或失焦后，显示回落到模型值 */
const typedRaw = ref('');
const shownValue = computed(() =>
  props.modelModifiers.trim && typedRaw.value.trim() === props.modelValue ? typedRaw.value : props.modelValue);

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  if (props.modelModifiers.trim) {
    typedRaw.value = raw;
    emit('update:modelValue', raw.trim()); /* 只剪回写值，不动 DOM 显示 */
  } else emit('update:modelValue', raw);
}

function onBlur(e: FocusEvent) {
  /* 失焦后显示收敛到模型值（与原生 v-model.trim 失焦后重渲染回写同口径） */
  typedRaw.value = '';
  emit('blur', e);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') emit('enter');
  else if (e.key === 'Escape') emit('esc');
}

function clear() {
  typedRaw.value = '';
  emit('update:modelValue', '');
  inputEl.value?.focus();
}

/* focus/select 成对暴露：宿主快捷键聚焦（如 SideNav / 键聚焦并全选）经组件实例直达真实 input */
defineExpose({ focus: () => inputEl.value?.focus(), select: () => inputEl.value?.select() });
</script>

<style scoped>
.ti { position: relative; display: inline-flex; align-items: center; width: 100%; vertical-align: middle; }
/* 基线视觉与 theme.css .inp 同源（token 全等）；宿主传 .inp 类时全局样式与本样式叠加等值 */
.ti-inp {
  flex: 1; min-width: 0; width: 100%;
  padding: var(--sp-1h) var(--sp-2h); border-radius: var(--r-s); font-size: var(--fs-sm);
  background: var(--bg2); border: 1px solid var(--line); color: var(--tx0);
  outline: none; transition: border var(--tr), box-shadow var(--tr); font-family: var(--font);
}
.ti-inp::placeholder { color: var(--tx2); }
.ti-inp:focus { border-color: var(--ac-line); box-shadow: var(--focus-ring); }
.ti-inp:disabled { opacity: .55; cursor: not-allowed; }
.mono .ti-inp, .ti-inp.mono { font-family: var(--mono); }
/* 状态档：warn/err 边框同色柔光（theme.css --glow-m 消费惯例） */
.ti-warn .ti-inp { border-color: var(--warn-line); }
.ti-warn .ti-inp:focus { box-shadow: var(--glow-m) var(--warn); }
.ti-err .ti-inp { border-color: var(--err-line); }
.ti-err .ti-inp:focus { box-shadow: var(--glow-m) var(--err); }
/* 尺寸档：sm 供表格行内/窄卡使用 */
.ti-sm .ti-inp { padding: 2px var(--sp-1h); font-size: var(--fs-xs); }
/* 清空钮：不抢 Tab 序（tabindex=-1），mousedown.prevent 保住输入框焦点 */
.ti-clear {
  position: absolute; right: var(--sp-1h); display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border: 0; border-radius: 50%; padding: 0;
  background: transparent; color: var(--tx2); cursor: pointer; transition: color var(--tr), background var(--tr);
}
.ti-clear:hover { color: var(--tx0); background: var(--hover); }
/* 有后缀槽时清空钮转流内（input 与后缀之间）——绝对右置会叠在后缀内容上；
   流内恒占位（v-show 控制可见性），输入框宽度不随清空钮出现/消失跳动 */
.ti-clear.ti-inflow { position: static; flex: none; }
/* 前后缀槽：附着色弱化为 muted，与输入文本分层 */
.ti-affix { display: inline-flex; align-items: center; color: var(--tx2); font-size: var(--fs-xs); padding: 0 var(--sp-1h); flex: none; }
.ti-affix:first-child { padding-right: var(--sp-0); }
</style>
