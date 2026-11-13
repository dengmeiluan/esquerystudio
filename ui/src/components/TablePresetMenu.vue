<template>
  <!-- 列布局方案共享件（轨3 preset 消费面，⑥ 652 头号候选落地）——
 ColPicker 同款「单钮+弹层」收纳范式（铁律 C：save/apply/delete 收进弹层，
 工具行不新增平铺枚举钮）；弹层壳按 raw+自绘四要素（白底/边框/阴影/圆角，
 .pgn-psize-pop 同配方）；Esc 收口按 566 范式两段（非空清词→空关层+焦点回触发钮，
 铁律 D1#5）。内核=useTablePrefs 652 三操作（受控：presets 名册由父传入，操作结果
 经父 ref 回写）。RT（btn-cls=rt-tool-btn）/QRT（qrt-tool-btn）双消费，位次=列宽后。 -->
  <n-popover trigger="click" placement="bottom-end" :show-arrow="false" raw :show="open" @update:show="open = $event">
    <template #trigger>
      <button ref="btnEl" type="button" class="btn sm ghost" :class="btnCls"
        :aria-expanded="open" aria-haspopup="true"
        :aria-label="`列布局方案（当前 ${presets.length} 个）`"
        title="列布局方案：保存/应用当前 列选·列宽·行高·转置·冻结 组合（按索引记忆）">
        <LayoutTemplate :size="13" />
        <span v-if="label" class="tpm-label">{{ label }}</span>
      </button>
    </template>
    <!-- v-if 随 open 即时摘除：raw+受控档下 naive 离场 transition 在 happy-dom 无
 transitionend，DOM 滞留会让「关层」语义不确定（653-B 行为锁实证） -->
    <div v-if="open" class="tpm-pop" aria-label="列布局方案">
      <div class="tpm-hd">列布局方案<b class="tpm-n mono">{{ presets.length }}</b><span class="tpm-hd-t">列选/列宽/行高/转置/冻结快照</span></div>
      <div class="tpm-save">
        <input v-model="name" class="inp tpm-inp" placeholder="方案名…" aria-label="方案名" @keydown.enter.prevent="doSave" />
        <button type="button" class="btn sm pri tpm-save-btn" :disabled="!name.trim()" @click="doSave">保存当前</button>
      </div>
      <div v-if="presets.length" class="tpm-list">
        <div v-for="p in presets" :key="p" class="tpm-item">
          <button type="button" class="tpm-name mono" :title="`应用方案「${p}」`" @click="doApply(p)">{{ p }}</button>
          <button type="button" class="btn xxs ghost tpm-del" :aria-label="`删除方案 ${p}`" title="删除方案（可重新保存恢复）" @click="doDel(p)">
            <X :size="11" />
          </button>
        </div>
      </div>
      <div v-else class="tpm-none">暂无方案——调整列选/行高/列宽后保存</div>
    </div>
  </n-popover>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue';
import { NPopover } from 'naive-ui';
import { LayoutTemplate, X } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  /** 名册（useTablePrefs presets 受控传入，操作经父 ref 回写） */
  presets: string[];
  /** 存当前布局为方案（652 内核 savePreset）——true=成功清词，false=保词可修正 */
  save: (name: string) => boolean;
  /** 应用方案（652 内核 applyPreset）——true=关层立即见表格变化，false=留层可另选 */
  apply: (name: string) => boolean;
  /** 删除方案（652 内核 deletePreset）——名册受控回写，弹层保留可连续管理 */
  del: (name: string) => boolean;
  /** 触发钮形制类（TableRefreshBtn 同款注入：RT rt-tool-btn / QRT qrt-tool-btn） */
  btnCls?: string;
  /** 触发钮文字（图标+文字语言；不传则纯图标） */
  label?: string;
}>(), { btnCls: '', label: '布局' });

const open = ref(false);
const name = ref('');
const btnEl = ref<HTMLButtonElement | null>(null);

function doSave() {
  const n = name.value.trim();
  if (!n) return;
  if (props.save(n)) name.value = '';
}
function doApply(p: string) {
  if (props.apply(p)) open.value = false;
}
function doDel(p: string) {
  props.del(p);
}

/* 范式：弹层 Esc 收口（宪法铁律 D1#5「开弹层→Esc→焦点回触发器」）——
 show 受控 naive 不自带关层；开层挂 document 捕获级监听，两段语义（输入非空先
 清词=输入框内 Esc 清词惯例，空则关层并还焦点触发钮）；卸载兜底摘监听。 */
function onEsc(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  if (name.value) { name.value = ''; return; }
  open.value = false;
  nextTick(() => btnEl.value?.focus());
}
watch(open, (v) => {
  if (v) {
    name.value = ''; /* ColPicker 同款：重开清陈旧草稿 */
    document.addEventListener('keydown', onEsc, true);
  } else {
    document.removeEventListener('keydown', onEsc, true);
  }
});
onBeforeUnmount(() => document.removeEventListener('keydown', onEsc, true));
</script>

<style scoped>
/* 浮层壳四要素：白底(bg1)+边框+阴影+圆角(r-m)——.pgn-psize-pop 同配方 */
.tpm-pop {
  display: flex; flex-direction: column; gap: var(--sp-1h); min-width: 252px;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  box-shadow: 0 6px 20px rgba(0, 0, 0, .12); padding: var(--sp-1); overflow: hidden;
}
.tpm-hd { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); font-weight: 650; color: var(--tx1); }
.tpm-n { color: var(--ac-hi); background: var(--ac-soft); border-radius: 99px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
.tpm-hd-t { margin-left: auto; font-size: var(--fs-xs); color: var(--tx2); font-weight: 400; }
.tpm-save { display: flex; gap: var(--sp-1h); }
.tpm-inp { flex: 1; min-width: 0; }
.tpm-list { display: flex; flex-direction: column; gap: var(--sp-0); max-height: 220px; overflow: auto; }
.tpm-item { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-1) var(--sp-1h); border-radius: var(--r-xs); }
.tpm-item:hover { background: var(--bg2); }
.tpm-name {
  flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0;
  cursor: pointer; color: var(--tx0); font-size: var(--fs-sm); font-family: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.tpm-name:hover { color: var(--ac); }
.tpm-del { flex: none; }
.tpm-none { padding: var(--sp-2h); text-align: center; color: var(--tx2); font-size: var(--fs-sm); }
.tpm-label { font-size: var(--fs-sm); }
</style>
