<template>
  <div class="agp" ref="rootEl">
    <div class="agp-box" :class="{ focus: open }">
      <input
        ref="inputEl"
        class="agp-inp mono"
        :value="draft"
        :placeholder="placeholder || '聚合类型'"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="listId"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKey"
      />
      <button v-if="modelValue" aria-label="清空聚合类型" class="agp-x" title="清空" tabindex="-1"
        @mousedown.prevent="choose('')"><X :size="11" /></button>
    </div>

    <Teleport to="body">
      <transition name="pop">
        <div v-if="open" class="agp-pop float-pop" :style="popStyle" @mousedown.prevent.stop>
          <!-- 一级：族（桶/指标/管道）。点哪个族就只列该族的算子——
 此前 68 项平铺在一个原生 datalist 里，用户要在长列表里逐项认名字。 -->
          <div class="agp-fams" role="tablist" aria-label="聚合族">
            <button
              v-for="f in familyTabs" :key="f.fam" role="tab" :aria-selected="fam === f.fam"
              class="agp-fam" :class="{ on: fam === f.fam, 'is-all': f.fam === 'all' }"
              @click="pickFam(f.fam)"
            >
              {{ f.label }}<span class="agp-fam-n mono">{{ f.count }}</span>
            </button>
          </div>

          <div class="agp-list" ref="listEl" role="listbox" :id="listId" aria-label="聚合类型">
            <div v-if="!rows.length" class="agp-hint">没有匹配「{{ draft }}」的聚合类型（仍可手输任意 ES 聚合名）</div>
            <template v-for="r in rows" :key="r.gh ?? r.op">
              <div v-if="r.gh" class="agp-gh mono" role="presentation">{{ r.gh }}</div>
              <div
                v-else
                class="agp-item" :class="{ act: r.i === cursor, on: r.op === modelValue }"
                role="option" :aria-selected="r.op === modelValue" tabindex="-1"
                :id="itemId(r.i!)"
                @mouseenter="cursor = r.i!" @click="choose(r.op!)"
              >
                <span class="agp-op mono">{{ r.op }}</span>
                <span class="agp-lb">{{ r.lb }}</span>
              </div>
            </template>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* 聚合类型二段式选择器（族 → 算子）。
 原实现是 <input list="…"> + 68 项 <datalist>：系统原生弹层里一长串平铺，
 既没有分组也没有「先选大类」这一层——用户得逐项认名字。
 本件保留**手输任意 ES 聚合名**的既有契约（未知聚合零降级），只把建议面改成分族两段式。 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { AGG_OPS } from '../../utils/queryAstOps';
import { aggFamilyOf, AGG_FAMILY_LABELS, type AggFamily } from '../../utils/aggFamilies';

const props = defineProps<{ modelValue: string; placeholder?: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

type FamKey = AggFamily | 'all';

const open = ref(false);
const fam = ref<FamKey>('bucket');
const cursor = ref(0);
const draft = ref(props.modelValue || '');
watch(() => props.modelValue, v => { draft.value = v || ''; });

const rootEl = ref<HTMLElement>();
const inputEl = ref<HTMLInputElement>();
const listEl = ref<HTMLElement>();
const popStyle = ref<Record<string, string>>({});

const allOps = Object.entries(AGG_OPS).map(([op, lb]) => ({ op, lb }));

/* 一级族签：三族 + 「全部」；数量是真实条数，不是装饰 */
const familyTabs = computed(() => {
  const cnt: Record<AggFamily, number> = { bucket: 0, metric: 0, pipeline: 0 };
  for (const { op } of allOps) { const f = aggFamilyOf(op); if (f) cnt[f]++; }
  return [
    { fam: 'bucket' as FamKey, label: AGG_FAMILY_LABELS.bucket, count: cnt.bucket },
    { fam: 'metric' as FamKey, label: AGG_FAMILY_LABELS.metric, count: cnt.metric },
    { fam: 'pipeline' as FamKey, label: AGG_FAMILY_LABELS.pipeline, count: cnt.pipeline },
    { fam: 'all' as FamKey, label: '全部', count: allOps.length },
  ];
});

/* 二级候选：先按输入词过滤（输入优先，跨族），无输入才按当前族切。
 这样「我知道名字想手打」和「我不知道叫什么想按类翻」两条路都顺。 */
const kw = ref('');
const filtered = computed(() => {
  const q = kw.value.trim().toLowerCase();
  if (q) {
    return allOps.filter(o => o.op.toLowerCase().includes(q) || o.lb.toLowerCase().includes(q));
  }
  if (fam.value === 'all') return allOps;
  return allOps.filter(o => aggFamilyOf(o.op) === fam.value);
});

/* 行模型：分组头不进 items（cursor/Enter 按 items 索引导航，混进标签会错位） */
type Row = { gh?: string; op?: string; lb?: string; i?: number };
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const list = filtered.value;
  const byFam = new Map<string, { op: string; lb: string }[]>();
  for (const o of list) {
    const f = aggFamilyOf(o.op);
    const key = f ? AGG_FAMILY_LABELS[f] : '自定义/其他';
    if (!byFam.has(key)) byFam.set(key, []);
    byFam.get(key)!.push(o);
  }
  let i = 0;
  for (const [gh, items] of byFam) {
    /* 「全部」或搜索态才出分组头；单族档下头是冗余（第一条就是该族） */
    if (fam.value === 'all' || !!kw.value.trim()) out.push({ gh });
    for (const o of items) out.push({ op: o.op, lb: o.lb, i: i++ });
  }
  return out;
});
const items = computed(() => rows.value.filter(r => r.op !== undefined) as Required<Pick<Row, 'op' | 'lb' | 'i'>>[]);

const listId = `agp-${Math.random().toString(36).slice(2, 9)}`;
const itemId = (i: number) => `${listId}-i${i}`;

function place() {
  const el = rootEl.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const H = Math.min(340, Math.max(180, filtered.value.length * 26 + 60));
  popStyle.value = below < H + 16 && r.top > H
    ? { left: r.left + 'px', top: Math.max(8, r.top - H - 4) + 'px', width: Math.max(r.width, 320) + 'px', maxHeight: H + 'px' }
    : { left: r.left + 'px', top: r.bottom + 4 + 'px', width: Math.max(r.width, 320) + 'px', maxHeight: H + 'px' };
}

function onFocus() {
  draft.value = props.modelValue || '';
  kw.value = '';
  /* 打开时把当前算子所在的族选好——用户看到的第一屏就是它所在的那一类。
     已经从弹层里切过族就别再抢回去（否则切族→focus→弹回原族，点了没用） */
  if (!open.value) {
    const f = aggFamilyOf(props.modelValue);
    fam.value = f ?? 'bucket';
    cursor.value = Math.max(0, items.value.findIndex(o => o.op === props.modelValue));
  }
  open.value = true;
  nextTick(place);
}

function onInput(e: Event) {
  draft.value = (e.target as HTMLInputElement).value;
  kw.value = draft.value;
  open.value = true;
  cursor.value = 0;
  /* 手输即生效（保持与原 datalist + input 的既有契约：未知聚合名零降级） */
  emit('update:modelValue', draft.value);
  nextTick(place);
}

function choose(op: string) {
  draft.value = op;
  emit('update:modelValue', op);
  close();
}

function pickFam(f: FamKey) {
  fam.value = f;
  /* 只清搜索词，不回填输入框：回填会把用户正在打的字冲掉 */
  kw.value = '';
  cursor.value = 0;
  nextTick(() => { place(); inputEl.value?.focus(); });
}

const onDocDown = (e: MouseEvent) => {
  if (!open.value) return;
  const t = e.target as Node;
  if (rootEl.value?.contains(t)) return;
  if (listEl.value?.parentElement?.contains(t)) return;
  if ((t as HTMLElement)?.closest?.('.agp-pop')) return;
  close();
};
const onDocKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open.value) { e.stopPropagation(); close(); } };
function close() { open.value = false; }
watch(open, v => {
  if (v) { document.addEventListener('mousedown', onDocDown, true); document.addEventListener('keydown', onDocKey, true); window.addEventListener('scroll', place, true); window.addEventListener('resize', place); }
  else { document.removeEventListener('mousedown', onDocDown, true); document.removeEventListener('keydown', onDocKey, true); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); }
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown, true);
  document.removeEventListener('keydown', onDocKey, true);
  window.removeEventListener('scroll', place, true);
  window.removeEventListener('resize', place);
});

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!open.value) { onFocus(); return; }
    const n = items.value.length;
    if (!n) return;
    cursor.value = e.key === 'ArrowDown' ? (cursor.value + 1) % n : (cursor.value - 1 + n) % n;
    nextTick(() => document.getElementById(itemId(cursor.value))?.scrollIntoView({ block: 'nearest' }));
    return;
  }
  if (e.key === 'Enter') {
    if (!open.value) return;
    const it = items.value[cursor.value];
    if (it) { e.preventDefault(); choose(it.op); }
    return;
  }
  if (e.key === 'Escape' && open.value) { e.preventDefault(); close(); }
}
</script>

<style scoped>
.agp { position: relative; min-width: 0; }
.agp-box {
  display: flex; align-items: center; gap: var(--sp-1); height: 26px; padding: 0 var(--sp-1h);
  border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1);
}
.agp-box.focus { border-color: var(--ac); }
.agp-inp {
  flex: 1; min-width: 0; border: 0; outline: 0; background: transparent;
  font-size: var(--fs-sm); color: var(--tx0); font-family: inherit;
}
.agp-x {
  display: inline-flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; border: 0; border-radius: var(--r-s);
  background: transparent; color: var(--tx2); cursor: pointer;
}
.agp-x:hover { background: var(--bg2); color: var(--tx0); }
.agp-pop {
  position: fixed; display: flex; flex-direction: column;
  background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m);
  box-shadow: var(--shadow-pop); overflow: hidden;
}
/* 一级：族签横排，当前族实底高亮 */
.agp-fams {
  display: flex; gap: var(--sp-0); padding: var(--sp-1) var(--sp-1) 0 0;
  border-bottom: 1px solid var(--line); margin: 0 0 var(--sp-1) 0;
  overflow-x: auto; flex: none;
}
.agp-fam {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  height: 24px; padding: 0 var(--sp-2); border: 0; border-radius: var(--r-s) var(--r-s) 0 0;
  background: transparent; color: var(--tx2); font-size: var(--fs-sm); font-family: inherit;
  cursor: pointer; white-space: nowrap;
}
.agp-fam:hover { background: var(--bg2); color: var(--tx0); }
.agp-fam.on { background: var(--ac-soft); color: var(--ac-hi); font-weight: 600; }
.agp-fam.is-all { margin-left: auto; }
.agp-fam-n { color: var(--tx3); font-size: var(--fs-xs); }
.agp-fam.on .agp-fam-n { color: var(--ac-hi); }
.agp-list { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-1); }
.agp-gh {
  padding: var(--sp-1) var(--sp-2) var(--sp-0); color: var(--tx3);
  font-size: var(--fs-xs); position: sticky; top: calc(-1 * var(--sp-1)); background: var(--bg1);
}
.agp-item {
  display: flex; align-items: baseline; gap: var(--sp-2);
  height: 26px; padding: 0 var(--sp-2); border-radius: var(--r-s); cursor: pointer;
}
.agp-item.act { background: var(--bg2); }
.agp-item.on { color: var(--ac-hi); background: var(--ac-soft); }
.agp-op { flex: none; font-size: var(--fs-sm); color: inherit; }
.agp-lb { color: var(--tx2); font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agp-hint { padding: var(--sp-2); color: var(--tx2); font-size: var(--fs-sm); }
</style>
