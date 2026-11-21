<template>
  <div class="fs" :class="{ 'fs-has-nos': runtimeNoScript }" ref="rootEl">
    <input
      ref="inpEl"
      class="inp fs-inp mono" :value="modelValue" :placeholder="placeholder || '选字段…'"
      spellcheck="false" autocomplete="off" role="combobox" aria-autocomplete="list"
      :aria-expanded="open ? 'true' : 'false'" :aria-controls="listId"
      :aria-activedescendant="open && flat[cursor] ? itemId(cursor) : undefined"
      @input="onInput" @focus="onFsFocus" @mousedown="pointerFocus = true" @keydown="onFsKey"
    />
    <!-- 987 未知字段护栏：mapping 在场时手输不在 mapping 的字段给黄点提示（ClauseNode
     .cn-owarn 同语言）。零降级：无 mapping（fields 空）不提示——自由手输是既有合法路径 -->
    <i v-if="unknownField" class="fs-unk" role="img" aria-label="字段不在 mapping"
       title="字段不在当前索引 mapping：可能是嵌套路径、别名或脚本字段；若非刻意请核对拼写或切换索引" />
    <!-- 1069 续：运行时字段缺 script（排序/高亮/聚合等字段位）——点击展开该字段的 type/script 编辑 -->
    <button v-if="runtimeNoScript" type="button" class="fs-nos"
      :title="`运行时字段「${modelValue}」尚无 script，查询期不会产出值——点击编辑 type/script`"
      @mousedown.prevent @click.stop="editRuntime">无 script</button>
    <!-- 弹层 teleport 到 body + fixed 定位——构建器面板（.dq-tree）带 overflow-y:auto，
 absolute 弹层会被面板边界裁剪。骨架（↑↓/Enter/Home/End 键盘导航、IME isComposing 守卫、
 防溢出钳位 place()、点击外部关闭）由 usePopupList 承载——与 FieldPicker 同一代体验；
 本组件只留数据源（rank 排序/类型分组/mark 切分收口 src/utils/fieldSearch.ts）与行渲染 -->
    <Teleport to="body">
      <div v-if="open" class="fs-pop float-pop" :style="popStyle" @mousedown.prevent.stop>
        <div v-if="!fields.length" class="fs-hint">暂无字段清单，可自由手输</div>
        <div v-else-if="!flat.length" class="fs-hint">没有匹配「{{ modelValue }}」的字段（仍可手输）</div>
        <div v-else class="fs-list" ref="listEl" role="listbox" :id="listId" @scroll="onScroll">
          <!-- 1004：候选虚拟列表——超大索引几千字段时全量进 DOM 会卡死弹层。
               统一行高（ROW_H）+ 上下占位垫片 + 可视区窗口渲染：rank/分组/键盘导航/aria
               语义不变（aria-setsize/posinset 补全窗口化下的列表盒语义），光标移动时
               窗口跟随（见 watch(cursor)），小列表窗口全覆盖=DOM 与旧全量渲染一致 -->
          <div :style="{ height: winStart * ROW_H + 'px' }" aria-hidden="true"></div>
          <!-- 类型分组标签行不进候选集（cursor/Enter 按 flat 索引导航，标签混进候选集会错位高亮） -->
          <template v-for="r in winRows" :key="r.gh !== undefined ? 'gh' + r.gh + r.first : r.hit!.path">
            <div v-if="r.gh !== undefined" class="fs-gh mono" role="presentation">{{ r.gh }}</div>
            <div
              v-else class="fs-item" :class="{ act: r.hit!.i === cursor }"
              role="option" :id="itemId(r.hit!.i)" :aria-selected="r.hit!.i === cursor"
              :aria-setsize="flat.length" :aria-posinset="r.hit!.i + 1" tabindex="-1"
              @mouseenter="cursor = r.hit!.i" @click="pick(r.hit!)" @keydown.enter.prevent="pick(r.hit!)"
              @contextmenu.prevent="openRowMenu($event, r.hit!)"
            >
              <!-- 类型徽标挂全站色卡 .mft-type（theme.css），删局部四类型撞色规则 -->
              <span v-if="r.hit!.type" class="fs-ty mono mft-type" :data-t="r.hit!.type">{{ r.hit!.type }}</span>
              <!-- 输入命中 <mark>：按切分片段渲染，不开 v-html 注入面（同 MarkText 手法） -->
              <span class="fs-nm mono"><template v-for="(sg, si) in r.hit!.segs" :key="si"><mark v-if="sg.m">{{ sg.t }}</mark><template v-else>{{ sg.t }}</template></template></span>
              <!-- 近似候选徽标（548 C fuzzy 零命中纠错标记，与 LuceneInput 同文案） -->
              <i v-if="r.hit!.fuzzy" class="fs-fuzzy">近似</i>
              <!-- 1045：中文业务词扩展命中（主体/公告/研报/债券/舆情 → 真实字段词根）。
                   只在行尾留一个字标，权重低于字段名；完整说明走 title 与 footer 计数。 -->
              <i v-if="r.hit!.alias" class="fs-alias" title="按业务词扩展匹配到的真实字段（非新建字段）">词</i>
            </div>
          </template>
          <div :style="{ height: Math.max(0, (rows.length - winStart - winRows.length) * ROW_H) + 'px' }" aria-hidden="true"></div>
        </div>
        <div v-if="flat.length" class="fs-ft">
          <span>{{ flat.length }} 个匹配<template v-if="aliasCount"> · 业务词扩展 {{ aliasCount }}</template></span>
          <span class="fs-keys"><kbd class="kbd">↑↓</kbd> 选择 <kbd class="kbd">Enter</kbd> 确认 <kbd class="kbd">Esc</kbd> 关闭</span>
        </div>
      </div>
    </Teleport>
    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y" :title="rowMenuTitle"
      :items="rowMenuItems" @close="rowMenu = null" />
  </div>
</template>

<script setup lang="ts">
/* 换代：字段选择器对齐 FieldPicker 同一代骨架（usePopupList）+ 同源搜索内核（fieldSearch.ts）——
 rank 排序（精确>前缀>包含）、类型分组+组头、data-t 三色类型徽标、输入 <mark> 高亮、
 候选计数与 cap 提示。零降级保留：mapping 缺失 fields 为空时输入框仍可自由手输。
 最近使用升级 per-index（key 拼当前索引，读不到回退全局），且选中字段回写记忆。 */
import { computed, nextTick, ref, watch, onBeforeUnmount, onDeactivated, inject } from 'vue';
import { getActivePinia } from 'pinia';
import { Copy, CornerDownLeft } from 'lucide-vue-next';
import { RUNTIME_FIELD_CTX } from './runtimeFieldContext';
import { usePopupList } from '../../composables/usePopupList';
import { useTermsSuggest } from '../../composables/useTermsSuggest';
import { useAppStore } from '../../stores/app';
import CellContextMenu, { type CcmItem } from '../CellContextMenu.vue';
import { copyText } from '../../utils/format';
import {
  searchFields, groupByLabel, type FieldHit,
  loadRecentFields, rememberRecentField, curFieldSearchIndex,
  getFieldSearchUsedFields,
} from '../../utils/fieldSearch';
import { KEYWORD_VALUE_TYPES } from '../../utils/sqlCompletion';
import { fieldRoleOf, type FieldRole } from '../../utils/fieldRole';

/* 补 typeFilter/typePriority 两个可选 props 透传 fieldSearch.searchFields
 （类型过滤/智能置顶排序，与 FieldPicker 同名语义对齐）；默认 undefined = 现状零增量 */
const props = defineProps<{
  modelValue: string; fields: string[]; types: Record<string, string>; placeholder?: string;
  /** 只列这些类型；空/缺省 = 全部 */
  typeFilter?: string[];
  /** 命中这些类型的字段分组排前；空/缺省 = 纯 rank+字母序 */
  typePriority?: string[];
  /** 1045：业务角色优先序（同类型组内再按角色排序），空/缺省 = 不干预 */
  rolePriority?: FieldRole[];
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'picked', v: string): void }>();

/* 宿主 store 可选：builder 裸挂载测试无 pinia 时复制动作仍执行，只是没有 toast 出口。
   显式传 activePinia（而非依赖 inject）——裸挂载不装 pinia 时也不会打 injection 警告 */
const activePinia = getActivePinia();
const store = activePinia ? useAppStore(activePinia) : null;
const inpEl = ref<HTMLInputElement>();

/* 1004：候选虚拟列表——扫描上限放大到全量（超大索引几千字段可滚动浏览全部匹配），
   DOM 只渲染可视区窗口（统一行高 ROW_H + 上下垫片）；rank/分组/键盘导航语义不变。
   小列表窗口全覆盖 = DOM 与旧全量渲染一致（既有契约零变化） */
const SCAN_CAP = 20000;
const ROW_H = 28;        /* 统一行高（候选项与组头一致——虚拟滚动偏移计算前提） */
const VIEW_H = 240;      /* 与 .fs-list max-height 同值 */
const WIN_PAD = 8;       /* 窗口上下缓冲行数（滚动方向预渲染，避免快速滚动闪白） */

/* 未知字段护栏判定：mapping 有字段集、输入非空、且不在集内。typing 中间态也会亮——
 黄点是弱提示不阻断（仍可手输提交），比「候选空但仍可手输」的纯静默多一层护栏 */
const unknownField = computed(() =>
  !!props.modelValue && props.fields.length > 0 && !props.fields.includes(props.modelValue));
/* 1069 续：排序/高亮/折叠/聚合等字段位共用——运行时字段只有 type、缺 script 时查询不产出值。
   上下文由 RootExtrasPane provide；不在检索参数面板内的 FieldSelect（其它页面）零提示。 */
const rtCtx = inject(RUNTIME_FIELD_CTX, null);
const runtimeNoScript = computed(() =>
  !!props.modelValue && !!rtCtx?.noScript.value.has(props.modelValue));
function editRuntime() {
  if (!props.modelValue) return;
  open.value = false;
  rtCtx?.edit(props.modelValue);
}

/* 1336：容器（object/nested）被点中时记下它的路径——面板只显示该容器的子字段，
   但**不改 modelValue**（改了就写坏 DSL）。输入框仍显示用户原本的字段值。 */
const expandPath = ref('');
/* 用户重新打字/重新聚焦字段框即退出展开态 */
watch(() => props.modelValue, () => { if (expandPath.value) expandPath.value = ''; });

/* 过滤+rank 排序+cap 收口 fieldSearch；最近使用（per-index）中命中当前搜索的置顶 */
const res = computed(() => {
  /* typeFilter/typePriority 透传 searchFields；prio 空数组必须归一为 null
 （groupByLabel 里 [] 是 truthy，会把全部类型打成「其他」） */
  const prio = props.typePriority?.length ? props.typePriority : null;
  const s = searchFields({
    fields: props.fields.map(f => ({ path: f, type: props.types[f] || '' })),
    query: expandPath.value || props.modelValue || '',
    cap: SCAN_CAP,
    typeFilter: props.typeFilter,
    typePriority: props.typePriority,
    /* 1410：此前 rolePriority 仅在「已选字段」时生效（props.modelValue 有值），
       于是**新加条件、字段还空**时角色排序完全不参与——候选退化成字母序，正是
       用户说的「字段自动匹配排序」没做到的地方。角色序本就与输入无关，空输入同样成立；
       已有选择时保留原行为（输入过滤后再精排）。 */
    rolePriority: props.rolePriority,
  });
  /* recent 段之后再前置「树内已用」命中段——上下文智能排序：
 recent 段式全前置（既有行为不动）；used 在其余候选里做「rank 不变、同 rank 内前置」
 （稳定排序不打乱 rank 档与字母序，只把 used 提到同档最前——输入过滤时不让包含命中
 压过精确命中）。prio 模式下 used 只在所属类型分组的组内前置（组键=分组段+类型序），
 typePriority 组序完整性不破（任务四口径）。段间去重不重复出项。
 重排后统一重编 i：cursor/act/aria-activedescendant 按 flat 数组下标导航，i 必须与下标
 一致（recent/used 段插入后原 i 会错位高亮）。 */
  const rec = loadRecentFields(curFieldSearchIndex());
  const used = getFieldSearchUsedFields();
  const isUsed = (h: FieldHit) => used.includes(h.path);
  const prioSeg = (h: FieldHit) => (prio && !prio.includes(h.type) ? 1 : 0);
  const prioIdx = (h: FieldHit) => (prio ? prio.indexOf(h.type) : 0);
  const rp = props.rolePriority?.length ? props.rolePriority : null;
  const roleIdx = (h: FieldHit) => {
    if (!rp) return 0;
    const i = rp.indexOf(fieldRoleOf(h.path, h.type));
    return i < 0 ? rp.length : i;
  };
  const rest = s.flat
    .filter(h => !rec.includes(h.path))
    .slice()
    .sort((a, b) =>
      prioSeg(a) - prioSeg(b)
      || (prio ? prioIdx(a) - prioIdx(b) : a.rank - b.rank)
      || roleIdx(a) - roleIdx(b)
      || (isUsed(b) ? 1 : 0) - (isUsed(a) ? 1 : 0));
  const flat = [
    ...rec.map(f => s.flat.find(h => h.path === f)).filter((h): h is FieldHit => !!h),
    ...rest,
  ].map((h, i) => (h.i === i ? h : { ...h, i }));
  /* 1336：展开态只留子字段——容器自身不是可查叶子，留在列表里会再被点到 */
  const shown = expandPath.value ? flat.filter(h => h.path !== expandPath.value) : flat;
  return { total: s.total, capped: s.capped, flat: shown, groups: groupByLabel(shown, prio) };
});
const flat = computed(() => res.value.flat);
const aliasCount = computed(() => flat.value.filter(h => h.alias).length);

type FsRow = { gh?: string; hit?: FieldHit; first?: number };
const rows = computed<FsRow[]>(() => {
  const out: FsRow[] = [];
  res.value.groups.forEach(g => {
    out.push({ gh: g.label, first: g.hits[0]?.i });
    g.hits.forEach(h => out.push({ hit: h }));
  });
  return out;
});

/* ═══ 1004：可视区窗口渲染 ═══ 垫片撑总高、窗口切片出 DOM；光标移动时窗口跟随并滚动，
   键盘 ↑↓/Home/End 与 hover 全走 cursor 单源（watch 收敛，不逐键位挂钩） */
const scrollTop = ref(0);
function onScroll(e: Event) { scrollTop.value = (e.target as HTMLElement).scrollTop; }
const winStart = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - WIN_PAD));
const winRows = computed(() =>
  rows.value.slice(winStart.value, winStart.value + Math.ceil(VIEW_H / ROW_H) + WIN_PAD * 2));
const rowOfItem = computed(() => {
  const m = new Map<number, number>();
  rows.value.forEach((r, ri) => { if (r.hit) m.set(r.hit.i, ri); });
  return m;
});

const {
  open, cursor, popStyle, listId, itemId, rootEl, listEl, openPanel, close, onKey,
} = usePopupList<FieldHit>({
  items: () => res.value.flat,
  onChoose: h => pick(h),
  to: () => 'body',
  idPrefix: 'fs',
  activeSelector: '.fs-item.act',
  place: { minWidth: 280, flipBelow: 240, flipTop: 260 },
});

/* 1045：KeepAlive 切通道/路由后弹层仍 teleport 在 body 上（实机：DSL→ES-SQL 后
   字段候选浮在 SQL 页面上）。离开当前组件作用域即关闭，避免跨页残留。 */
onDeactivated(() => close());
onBeforeUnmount(() => close());

/* 1033：指针聚焦全选现值——点进字段框即打字=替换（「改字段」的用户心智：原值是要被
   换掉的，追加只会拼出零匹配的怪字段名）；Tab 键盘聚焦保持尾部追加语义（a11y 惯例，
   键盘用户预期在原文尾部续打）。全选同步执行（rAF 在后台页签恒不触发，异步全选
   会静默失效）；打字首字符自然覆盖，弹层过滤随 modelValue 收敛。 */
const pointerFocus = ref(false);
function onFsFocus(e: FocusEvent) {
  openPanel();
  if (!pointerFocus.value) return;
  pointerFocus.value = false;
  (e.target as HTMLInputElement).select();
}

/* 1004：光标窗口跟随——键盘 ↑↓/Home/End 与 hover 全走 cursor 单源，在此收敛：
   目标行在缓冲带外 → 居中滚动（scrollTop 变更驱动 winRows 重算）→ 渲染后再滚屏到位 */
watch(cursor, async ri => {
  const row = rowOfItem.value.get(ri);
  if (row === undefined) return;
  const top = row * ROW_H;
  const st = scrollTop.value;
  if (top < st + ROW_H * 2 || top + ROW_H > st + VIEW_H - ROW_H * 2) {
    if (listEl.value) listEl.value.scrollTop = Math.max(0, top - Math.floor((VIEW_H - ROW_H) / 2));
    scrollTop.value = listEl.value?.scrollTop ?? 0;
  }
  await nextTick();
  scrollCur();
});

/* Home/End 首尾跳（骨架不含，本组件补齐；滚屏用自家 activeSelector） */
function scrollCur() {
  nextTick(() => listEl.value?.querySelector('.fs-item.act')?.scrollIntoView({ block: 'nearest' }));
}
function onFsKey(e: KeyboardEvent) {
  const f = res.value.flat[cursor.value];
  if (!e.isComposing && open.value && f
    && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) {
    e.preventDefault();
    const r = inpEl.value?.getBoundingClientRect();
    showRowMenu(r ? r.left + 12 : 0, r ? r.bottom : 0, f);
    return;
  }
  if (!e.isComposing && open.value && (e.key === 'Home' || e.key === 'End')) {
    e.preventDefault();
    cursor.value = e.key === 'Home' ? 0 : Math.max(0, res.value.flat.length - 1);
    scrollCur();
    return;
  }
  onKey(e);
}

/* 候选行右键/键盘 ContextMenu —— 与全站 CellContextMenu 同一壳；选用/复制均为本地只读，
  不触发服务端写，无需权限门（容器字段的「选用」实际是展开子字段，按 pick 的现有语义）。 */
const rowMenu = ref<{ x: number; y: number; h: FieldHit } | null>(null);
const rowMenuTitle = computed(() => {
  const m = rowMenu.value;
  return m ? '字段 · ' + m.h.path + (m.h.type ? ' · ' + m.h.type : '') : '';
});
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value;
  if (!m) return [];
  const container = m.h.type === 'object' || m.h.type === 'nested';
  return [
    { key: 'field-pick', label: container ? '展开子字段' : '选用此字段', icon: CornerDownLeft, run: () => pick(m.h) },
    { key: 'field-copy', label: '复制字段名', icon: Copy, run: () => copyFieldName(m.h.path) },
  ];
});
function copyFieldName(path: string) {
  void copyText(path).then(ok => store?.notify(ok ? 'success' : 'error',
    ok ? '已复制字段名：' + path : '复制失败：浏览器拦截了剪贴板'));
}
function showRowMenu(x: number, y: number, h: FieldHit) {
  cursor.value = h.i;
  rowMenu.value = { x, y, h };
}
function openRowMenu(e: MouseEvent, h: FieldHit) {
  showRowMenu(e.clientX, e.clientY, h);
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
  cursor.value = 0;
  if (!open.value) openPanel();
}

/* keyword 族字段选中即空前缀预载 terms-agg top20（LuceneInput.choose 551 同范式；
 模块级 TTL 缓存被后续值位消费方白得——ClauseNode datalist prime / LuceneInput 值段任意
 前缀 548 A2 宽前缀本地滤）。护栏：useTermsSuggest 内部依赖 pinia——裸挂载无 pinia 静默闸
 关闭零动作（qhStore 同款形态）；索引语境读 fieldSearch 模块态 curFieldSearchIndex（本组件
 无 index prop，QueryTreePane/RootExtrasPane 写入既有先例），缺席时 suggest 空参早退零请求。
 第二参 types 接 props.types——候选展示值按 rankTermsByType 类型精化排序
 （ LuceneInput 等三处同范式；五消费面接线至此收口） */
const valSuggest = getActivePinia() ? useTermsSuggest(curFieldSearchIndex, () => props.types) : null;

function pick(h: FieldHit) {
  /* 1336：object / nested 这类**容器**字段不能直接写成查询字段。
     真机实证：选中 `publisher`(object) 后字段被清空，DSL 落成
     `{"match":{"":""}}` —— 一条永不命中、且没有任何报错的条件。
     容器本身不是叶子（查询要打它的子字段），所以这里不写回，而是把输入切成
     「容器.」前缀，让它的子字段立刻成为候选——点一下就能继续选，不用重新打字。 */
  /* 1336：object / nested 是**容器**，不能直接当查询字段。
     真机实证：选中 `publisher`(object) 后字段被清空，DSL 落成 `{"match":{"":""}}`
     —— 一条永不命中、且没有任何报错的条件。
     容器要查的是它的子字段。这里不写回字段（会写坏 DSL），改成把它「展开」：
     把子字段登记为最近使用并直接弹出子字段候选（输入框保持原值不动）。
     子字段从 props.fields 里按 `path + '.'` 前缀取——共享字段源本来就带着它们。 */
  if (h.type === 'object' || h.type === 'nested') {
    /* 1336：容器不能当查询字段。真机实证：选中 `publisher`(object) 后字段被清空，
       DSL 落成 `{"match":{"":""}}` —— 永不命中且零报错。
       这里不写回、也不 emit picked，只把它展开成子字段候选（输入框值保持不动）。 */
    expandPath.value = h.path;
    cursor.value = 0;
    return;
  }
  rememberRecentField(curFieldSearchIndex(), h.path);
  if (valSuggest && KEYWORD_VALUE_TYPES.includes(h.type)) valSuggest.suggest(h.path, '');
  emit('update:modelValue', h.path);
  /* 1124：明确「从候选选中」与「输入半截」分开——宿主只在选中时按类型换算子 */
  emit('picked', h.path);
  close();
}
</script>

<style scoped>
.fs { position: relative; display: inline-block; min-width: 130px; }
.fs-inp { width: 100%; height: 30px; font-size: var(--fs-sm); padding: 3px var(--sp-2); }
/* 未知字段护栏黄点（右缘内侧，弱提示不遮值）：warn 底圆点 + title 全语义（.cn-owarn 同语言）。
 1113：圆点内不再放可见文案（此前 8px 盒里的「字段不在 mapping」逐字竖排溢出，压住
 算子/值行）——语义只走 title/aria-label；overflow/font-size 双护栏防未来回填。 */
.fs-unk { position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
  width: 8px; height: 8px; border-radius: 50%; background: var(--warn);
  overflow: hidden; font-size: 0; line-height: 0;
  box-shadow: 0 0 0 3px var(--warn-soft); cursor: help; pointer-events: auto; }
.fs-inp:not(:placeholder-shown) { padding-right: 18px; }
/* 1069 续：无 script 运行时字段徽标（占输入右缘，与未知黄点互斥） */
.fs-has-nos .fs-inp, .fs-has-nos .fs-inp:not(:placeholder-shown) { padding-right: 58px; }
.fs-nos {
  position: absolute; right: var(--sp-1); top: 50%; transform: translateY(-50%);
  height: 16px; padding: 0 var(--sp-1); font-size: var(--fs-2xs); line-height: 16px; white-space: nowrap;
  border: 1px solid var(--warn-line); border-radius: var(--r-xs); background: var(--warn-soft); color: var(--warn);
  cursor: pointer;
}
.fs-nos:hover { background: var(--warn-line); color: var(--card-bg); }
/* v3.1: 聚焦品牌描边+3px 柔光（--brand/--card theme.css 均有定义，删永不生效的 fallback 字面） */
.fs-inp:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent); background: var(--card); }
/* 壳属性（fixed/--z-island/bg/border/shadow/圆角）合并 theme.css .float-pop，本类只留坐标外裁切与字号 */
.fs-pop { overflow: hidden; font-size: var(--fs-sm); }
.fs-list { max-height: 240px; overflow: auto; }
.fs-hint { padding: var(--sp-3); color: var(--muted); }
/* 类型分组标签行（与 FieldPicker .fxp-gh 同款）；1004 统一行高=虚拟滚动偏移前提 */
.fs-gh { display: flex; align-items: center; height: 28px; padding: 0 var(--sp-2h); font-size: var(--fs-2xs); color: var(--muted); letter-spacing: .04em; user-select: none; }
.fs-item { display: flex; align-items: center; gap: var(--sp-2); height: 28px; padding: 0 var(--sp-3); cursor: pointer; }
.fs-item:hover, .fs-item.act { background: var(--hover); }
/* 字段名吃满剩余宽度（业务词/近似徽标不再挤掉主名），超长才省略 */
.fs-nm { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fs-nm mark { background: none; color: var(--acc); font-weight: 600; }
/* 类型徽标色统一 theme.css 全站 .mft-type[data-t] 色卡（本文件原局部四类型规则已删）；
 冷门类型回落档走 :where（specificity 0），色卡命中时必胜（同 FieldPicker 口径） */
.fs-ty { flex: none; min-width: 52px; text-align: center; font-size: var(--fs-2xs); padding: 0 5px; border-radius: var(--r-xs); line-height: 16px; }
:where(.fs-ty) { color: var(--muted); background: var(--hl); }
/* 近似候选徽标（548 C fuzzy，FieldHit 经 flat 重排 spread 原样透传） */
.fs-fuzzy { font-size: var(--fs-2xs); color: var(--warn); font-style: normal; margin-left: var(--sp-1); }
/* 1045：业务词扩展徽标（info 语义，弱于近似纠错黄标） */
.fs-alias { flex: none; font-size: var(--fs-2xs); color: var(--info); background: var(--info-soft); border-radius: var(--r-xs); padding: 0 var(--sp-1); font-style: normal; margin-left: var(--sp-1); white-space: nowrap; }
.fs-ft { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-2xs); }
.mono { font-family: var(--mono, ui-monospace, monospace); }
</style>
