<template>
  <div class="ixp" ref="rootEl" :style="{ width: width || undefined }">
    <div class="ixp-box" :class="{ focus: open }">
      <Database :size="12" class="ixp-ic" />
      <input
        ref="inputEl"
        class="ixp-inp"
        :value="modelValue"
        :placeholder="placeholder || store.pickedIdx || 'my-index'"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-controls="listId"
        :aria-activedescendant="open && items[cursor] ? itemId(cursor) : undefined"
        @input="onInput"
        @focus="openPanel"
        @keydown="onKey"
      />
      <!-- v5 回归实测：.stop 必须带——clear 会同步移除本钮（v-if="modelValue"），mousedown 冒泡到
 document 时 target 已 detach，onDocDown 的 contains(detached)=false 会误判「点外」关掉刚开的弹层 -->
      <button aria-label="清空" v-if="modelValue" class="ixp-x" title="清空" tabindex="-1" @mousedown.prevent.stop="clear">
        <X :size="11" />
      </button>
    </div>

    <Teleport :to="teleportTo" :disabled="inplace">
      <!-- 弹层默认 Teleport 在 body 下：mousedown 需 .stop，否则 document 层 onDocDown 会先关面板导致 click 选项丢失。
 to="false" 时 Teleport disabled → 就地渲染在 .ixp 根内（嵌 naive popover 场景：弹层与 popover 同子树，
 clickoutside 不再误判关 popover 导致 click 丢失） -->
      <transition name="pop">
        <div v-if="open" class="ixp-pop float-pop" :class="{ inplace }" :style="popStyle" @mousedown.prevent.stop>
        <!-- 全局选中联动：一键带入当前侧栏选中的索引 -->
        <div v-if="store.pickedIdx && store.pickedIdx !== modelValue" class="ixp-cur" role="button" tabindex="0" @click="choose(store.pickedIdx)" @keydown.enter.prevent="choose(store.pickedIdx)" @keydown.space.prevent="choose(store.pickedIdx)">
          <MousePointerClick :size="12" />
          <span>使用当前选中：<b class="mono">{{ store.pickedIdx }}</b></span>
          <kbd class="kbd">Tab</kbd>
        </div>

        <div v-if="loading" class="ixp-hint">正在加载索引清单…</div>
        <div v-else-if="loadFailed" class="ixp-hint">索引清单加载失败，请检查集群连接（仍可手输）<button class="btn ghost sm" @click="fetchIndices(true)">重试</button></div>
        <div v-else-if="!items.length" class="ixp-hint">
          <template v-if="!store.indices.length">当前集群暂无索引数据（检查连接）</template>
          <template v-else-if="wildcardish">「{{ modelValue }}」将按通配符/多目标直接使用（Enter 确认；如需精确匹配，候选层列不出虚拟目标，以实际执行结果为准）</template>
          <template v-else>没有匹配「{{ modelValue }}」的索引/别名<template v-if="allowWildcard">，通配符/逗号多目标可直接回车</template></template>
        </div>

        <div v-else class="ixp-list" ref="listEl" role="listbox" :id="listId">
          <div
            v-for="(it, i) in items" :key="it.kind + ':' + it.name"
            class="ixp-item" :class="{ act: i === cursor }"
            role="option" :id="listId + '-' + i" :aria-selected="i === cursor" tabindex="-1"
            @mouseenter="cursor = i" @click="choose(it.name)" @keydown.enter.prevent="choose(it.name)"
          >
            <IndexOptionRow
              :kind="it.kind" :name="it.name" :health="it.health" :meta="it.meta"
              :hl="modelValue" :aliases="it.aliases"
              @select-alias="choose"
            />
          </div>
        </div>

        <div class="ixp-ft">
          <span>{{ idxCount }} 索引 · {{ aliasCount }} 别名</span>
          <span class="ixp-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
/* -e 统一索引选择器——全站禁止裸 index input。
 自动补全集群真实索引+别名、与全局选中(pickedIdx)联动、键盘导航、docs/size 元信息。 */
import { ref, computed, watch } from 'vue';
import { Database, X, MousePointerClick } from 'lucide-vue-next';
import { useAppStore } from '../stores/app';
import { fmtNum, fmtSize } from '../utils/format';
import IndexOptionRow from './IndexOptionRow.vue';
import { ensureAliases, aliasEntries, aliasesOf } from '../composables/useAliases';
import { usePopupList } from '../composables/usePopupList';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  /** 允许通配符/逗号多目标（reindex 源、profile 等场景），仅影响空匹配提示 */
  allowWildcard?: boolean;
  /** 选中时是否同步全局 pickedIdx（默认不同步，避免意外改侧栏上下文） */
  syncGlobal?: boolean;
  width?: string;
  /** 弹层挂载点：默认 'body'（Teleport 现状，全体既有消费方零影响）；
 传 false 就地渲染在 .ixp 根内（absolute 随根定位，不跑 place() 的 fixed 坐标计算） */
  to?: string | false;
}>(), { allowWildcard: false, syncGlobal: false, to: 'body' });

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'picked', v: string): void; (e: 'enter'): void }>();

const store = useAppStore();
const inputEl = ref<HTMLInputElement>();
const loading = ref(false);

type Item = { kind: 'index' | 'alias'; name: string; health?: string; meta: string; aliases: string[] };

/* 弹层骨架下沉 usePopupList（与 FieldPicker 同款）：open/cursor/place/onKey/onDocDown/listId/to 双模式。
 place 参数保留本组件原数值（300/280/300，与骨架默认 280/260/280 不同，须显式传）；
 Tab 联动「使用当前选中」是本组件特有分支，骨架不含，见下方 onKey wrapper。 */
const {
  open, cursor, popStyle, teleportTo, inplace, listId, itemId,
  rootEl, listEl, openPanel, close, onKey: popupOnKey,
} = usePopupList<Item>({
  items: () => items.value,
  onChoose: it => choose(it.name),
  onEnter: () => emit('enter'),
  onOpen: () => { fetchIndices(); ensureAliases(clusterKey.value); },
  to: () => props.to,
  idPrefix: 'ixp',
  activeSelector: '.ixp-item.act',
  place: { minWidth: 300, flipBelow: 280, flipTop: 300 },
});

/* W3：别名清单收敛到 useAliases 共享缓存（与 TopBar 同源），key = 集群目标 */
const clusterKey = computed(() => store.target || '@host');

const idxCount = computed(() => store.indices.length);
const aliasCount = computed(() => aliasEntries(clusterKey.value).length);

/* v3.0.0 提示纠错：通配符/逗号多目标形态（仅 allowWildcard 场景合法）——
 此前候选空时主线文案仍是「没有匹配」，用户以为输入非法；实际这类输入
 不走候选层、Enter 直接交给 ES 解析。识别为 wildcardish 后换中性口径。 */
const wildcardish = computed(() =>
  props.allowWildcard && /[*?,]|^_all$/.test((props.modelValue || '').trim()),
);

const items = computed<Item[]>(() => {
  const kw = (props.modelValue || '').trim().toLowerCase();
  const rank = (n: string) => n.toLowerCase() === kw ? 0 : n.toLowerCase().startsWith(kw) ? 1 : 2;
  const match = (n: string) => !kw || n.toLowerCase().includes(kw);
  const idx: Item[] = store.indices
    .filter(i => match(i.index))
    .map(i => ({ kind: 'index' as const, name: i.index, health: i.health, meta: fmtMeta(i), aliases: aliasesOf(i.index, clusterKey.value) }));
  const ali: Item[] = aliasEntries(clusterKey.value)
    .filter(a => match(a.name))
    .map(a => ({ kind: 'alias' as const, name: a.name, meta: '→ ' + (a.to.length > 2 ? a.to.slice(0, 2).join(', ') + ` +${a.to.length - 2}` : a.to.join(', ')), aliases: [] }));
  return [...ali, ...idx].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)).slice(0, 50);
});

function fmtMeta(i: any): string {
  const docs = i['docs.count'], size = i['store.size'];
  return [docs ? fmtNum(docs) + ' 文档' : '', size ? fmtSize(size) : ''].filter(Boolean).join(' · ');
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

/* 展开时补拉索引清单（store 无数据才拉；force = 失败重试钮强制重拉）。
 loadIndices 自吞错误不抛（finally 里 loading 必复位），失败的外部可见信号见 loadFailed */
async function fetchIndices(force = false) {
  if (force || (!store.indices.length && !store.loadingIndices)) {
    loading.value = true;
    try { await store.loadIndices(); } finally { loading.value = false; }
  }
}

/* 加载失败态：loadIndices 吞错不抛，非 401 失败的外部可见信号是 clusterOk===false
 （401 → null，走登录引导不判失败）；有旧数据时列表仍可显，不顶掉 */
const loadFailed = computed(() => store.clusterOk === false && !store.indices.length);

function choose(name: string) {
  emit('update:modelValue', name);
  emit('picked', name);
  if (props.syncGlobal) store.pick(name);
  close();
}

function clear() {
  emit('update:modelValue', '');
  inputEl.value?.focus();
  openPanel();
}

/* Tab 联动「使用当前选中」为本组件特有（骨架 onKey 不含），先行拦截后委托骨架 */
function onKey(e: KeyboardEvent) {
  if (e.key === 'Tab' && open.value && store.pickedIdx && store.pickedIdx !== props.modelValue) {
    e.preventDefault(); choose(store.pickedIdx); return;
  }
  popupOnKey(e);
}

/* 集群目标切换：别名缓存自然失效（key 不匹配），下次展开时重拉 */
watch(() => store.target, () => { close(); });
</script>

<style scoped>
.ixp { position: relative; display: inline-block; min-width: 170px; vertical-align: middle; }
.ixp-box { display: flex; align-items: center; gap: 5px; padding: var(--sp-1) var(--sp-1h) var(--sp-1) var(--sp-2); border: 1px solid var(--border); border-radius: var(--r-s); background: var(--bg2); transition: border-color .12s; }
.ixp-box.focus { border-color: var(--acc); }
.ixp-ic { color: var(--muted); flex: none; }
.ixp-inp { flex: 1; min-width: 60px; border: none; outline: none; background: transparent; color: inherit; font-size: var(--fs-sm); font-family: var(--mono, ui-monospace, monospace); }
.ixp-x { display: inline-flex; border: none; background: none; color: var(--muted); cursor: pointer; padding: 1px; border-radius: var(--r-xs); }
.ixp-x:hover { color: inherit; background: var(--hover); }

/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.ixp-pop { overflow: hidden; font-size: var(--fs-sm); }
/* 就地模式：absolute 随 .ixp 根（position:relative）定位；渲染在 popover 子树内天然随父 stacking context，无需 9000 z-index */
.ixp-pop.inplace { position: absolute; top: 100%; left: 0; min-width: 100%; z-index: 10; }
.ixp-cur { display: flex; align-items: center; gap: var(--sp-1h); padding: 7px var(--sp-2h); cursor: pointer; color: var(--acc); border-bottom: 1px solid var(--line); }
.ixp-cur:hover { background: var(--hover); }
.ixp-cur b { font-weight: 600; }
.ixp-cur .kbd { margin-left: auto; }
.ixp-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.ixp-list { max-height: 240px; overflow: auto; padding: 3px 0; }
.ixp-item { display: flex; align-items: center; gap: 7px; padding: 5px var(--sp-2h); cursor: pointer; }
.ixp-item.act { background: var(--hover); }
.ixp-ft { display: flex; align-items: center; justify-content: space-between; padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-xs); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
