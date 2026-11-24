import { ref, computed, watch, type Ref } from 'vue';

/* P0-4：列值筛选下沉共享（dbx ColumnFilterPopover 对位）。
 此前筛选漏斗只在 QRT（「RT 待合并」欠账）——抽 composable 后 QRT 回归锁
 行为零变化、RT 接入补齐。相对 QRT 原实现的增强：
 — 每值计数（filterVals 返回 {v, n}）；
 — 值内搜索（kw 参数，labelOf/normVal 双口径）；
 — 基数降级（无搜索词且去重值 > maxUnique 时按计数降序取前 N + hasMore 标记，
 防 _id/URL 类全异值列渲染上千 checkbox）；
 — 暗状态守卫内置（传 cols 时被隐藏列的筛选自动清，onAutoClear 供调用方连带清理）。 */

export interface ColFilterVal { v: any; n: number }

/** 区间筛选端点（col -> {min,max}，原始输入文本；空串=该端不设限） */
interface ColRangeFilter { min: string; max: string }

/* ═══ ：过滤管线纯函数单源（531 遗留件①收口）═══
 归一键/区间/包含命中契约与 OR/AND 双档语义自 composable 闭包出位成模块级纯函数——
 filterRows 委托 filterRowsPure（534 源码锁 filterRows 签名行保真；552/556 contains
 与三档 OR 运行时锚零变），语义面从此一处可锁（kernelFilterOrMode563 全锁双档）。 */

/** 归一键：空值统一 ''（展示为 ∅），对象 JSON 化——与调用方 fullText 同语义但 null 不给 '-'（label 用） */
function normVal(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 区间是否生效（双端皆空=未设限不过滤） */
function rangeOn(r: ColRangeFilter | undefined): boolean {
  return !!r && (r.min.trim() !== '' || r.max.trim() !== '');
}
/** 包含命中契约：空值（null/undefined）一律不命中；对象 JSON 串化后比对；
 大小写不敏感（与 quickFilter 跨列 contains 同口径）。kw 由调用方 trim+lower */
function containsHit(v: any, kw: string): boolean {
  if (v === null || v === undefined) return false;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.toLowerCase().includes(kw);
}
/** 区间命中契约：空值（null/undefined/''）一律不命中；比较口径三级回落——
 ①双方数值化成功→数值比较（数字字符串按值）；②日期化成功→时间戳比较
 （Date.parse 端点；行值 number 视为 epoch ms）；③否则字符串 localeCompare。
 闭区间（含端点）。输入文本口径由弹层占位说明交代（date 列可填 ISO/epoch）。 */
function rangeHit(v: any, r: ColRangeFilter): boolean {
  if (v === null || v === undefined || v === '') return false;
  const cmp = (raw: string): number => {
    const n = Number(raw);
    const nv = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (raw.trim() !== '' && Number.isFinite(n) && Number.isFinite(nv)) return nv < n ? -1 : nv > n ? 1 : 0;
    const t = Date.parse(raw);
    const tv = typeof v === 'number' ? v : Date.parse(String(v));
    if (raw.trim() !== '' && Number.isFinite(t) && Number.isFinite(tv)) return tv < t ? -1 : tv > t ? 1 : 0;
    return String(v).localeCompare(raw);
  };
  if (r.min.trim() !== '' && cmp(r.min.trim()) < 0) return false;
  if (r.max.trim() !== '' && cmp(r.max.trim()) > 0) return false;
  return true;
}

/** 三档筛选态快照（.value 解包后形态；filterRowsPure 纯消费不感知响应式） */
interface ColFilterState {
  colFilters: Record<string, string[]>;
  rangeFilters: Record<string, ColRangeFilter>;
  containsFilters: Record<string, string>;
}

/** 过滤管线纯函数（useColFilters.filterRows 委托单源）：多列组合档
 （mode 缺省 'AND'=每列命中全过，既有行为逐字节不变；
 P1-1：'OR'=任一筛选列命中即保留——跨列 OR 并集档）；
 每列空选集=该列不过滤；区间谓词与等值同档组合叠加；包含谓词尾部同构叠加
 （空白词列不出现在生效列集）；零生效列恒等回落（返回同引用，零增量语义保真）。 */
export function filterRowsPure<T>(
  rows: T[],
  st: ColFilterState,
  getVal: (row: any, col: string) => any,
  mode: 'AND' | 'OR' = 'AND',
): T[] {
  const cols = Object.keys(st.colFilters).filter(c => st.colFilters[c]?.length);
  const rCols = Object.keys(st.rangeFilters).filter(c => rangeOn(st.rangeFilters[c]));
  const cCols = Object.keys(st.containsFilters).filter(c => (st.containsFilters[c] ?? '').trim() !== '');
  if (!cols.length && !rCols.length && !cCols.length) return rows;
  const eqHit = (row: any, c: string) => {
    const set = new Set(st.colFilters[c]);
    return set.has(normVal(getVal(row, c)));
  };
  const rgHit = (row: any, c: string) => rangeHit(getVal(row, c), st.rangeFilters[c]);
  const ctHit = (row: any, c: string) => containsHit(getVal(row, c), (st.containsFilters[c] ?? '').trim().toLowerCase());
  if (mode === 'OR') return rows.filter(row => cols.some(c => eqHit(row, c)) || rCols.some(c => rgHit(row, c)) || cCols.some(c => ctHit(row, c)));
  return rows.filter(row => cols.every(c => eqHit(row, c)) && rCols.every(c => rgHit(row, c)) && cCols.every(c => ctHit(row, c)));
}

export function useColFilters(opts: {
  /** 当前过滤候选行集（通常=未过滤的原始行集） */
  rows: () => any[];
  /** (row, col) → 单元格原始值 */
  getVal: (row: any, col: string) => any;
  /** 值的展示文案（弹层清单用；QRT 传 fullText 口径） */
  labelOf: (v: any) => string;
  /** 可见列（传入则启用「被隐藏列的筛选自动清」暗状态守卫） */
  cols?: () => string[];
  /** 守卫自动清时的连带回调（QRT 清展开态、RT 清框选） */
  onAutoClear?: () => void;
}): {
  colFilters: Ref<Record<string, string[]>>;
  rangeFilters: Ref<Record<string, ColRangeFilter>>;
  /* 列内文本包含档（col -> kw；空/空白=该列不设限） */
  containsFilters: Ref<Record<string, string>>;
  activeFilterCount: Ref<number>;
  normVal: (v: any) => string;
  labelOf: (v: any) => string;
  filterVals: (col: string, kw?: string, maxUnique?: number) => { vals: ColFilterVal[]; hasMore: boolean; total: number };
  toggleFilterVal: (col: string, v: any) => void;
  setRangeFilter: (col: string, side: 'min' | 'max', v: string) => void;
  /** 区间生效判定出口（漏斗激活高亮并集口径消费） */
  rangeOn: (r: ColRangeFilter | undefined) => boolean;
  /** 包含档生效判定出口（漏斗激活高亮并集口径消费） */
  containsOn: (col: string) => boolean;
  setContainsFilter: (col: string, v: string) => void;
  clearFilter: (col: string) => void;
  clearAllFilters: () => void;
  filterRows: <T>(rows: T[], mode?: 'AND' | 'OR') => T[];
} {
  /** col -> 选中值 norm 集（数组存储便于整组替换触发响应式） */
  const colFilters = ref<Record<string, string[]>>({});
  /* 类型感知快捷过滤的区间态——与 colFilters 同列可并存，filterRows 尾部 AND 叠加 */
  const rangeFilters = ref<Record<string, ColRangeFilter>>({});
  /* 列内文本包含态——与 colFilters/rangeFilters 同列可并存，filterRows 尾部 AND 叠加 */
  const containsFilters = ref<Record<string, string>>({});

  /* 归一键 normVal 上提模块级（filterRowsPure 纯函数单源共用，返回面不变） */

  /** 该列当前行集内的去重值+计数（按首现序）；kw 对 label/norm 双口径包含匹配；
 * 无搜索词且基数超限时按计数降序取前 maxUnique（高频优先），hasMore 提示继续用搜索 */
  function filterVals(col: string, kw = '', maxUnique = 200): { vals: ColFilterVal[]; hasMore: boolean; total: number } {
    const counts = new Map<string, { v: any; n: number }>();
    for (const row of opts.rows()) {
      const v = opts.getVal(row, col);
      const n = normVal(v);
      const hit = counts.get(n);
      if (hit) hit.n++;
      else counts.set(n, { v, n: 1 });
    }
    const k = kw.trim().toLowerCase();
    let entries = [...counts.values()];
    const total = entries.length;
    if (k) entries = entries.filter(e => opts.labelOf(e.v).toLowerCase().includes(k) || normVal(e.v).toLowerCase().includes(k));
    else if (entries.length > maxUnique) entries.sort((a, b) => b.n - a.n);
    const hasMore = entries.length > maxUnique;
    if (hasMore) entries = entries.slice(0, maxUnique);
    return { vals: entries, hasMore, total };
  }

  function toggleFilterVal(col: string, v: any) {
    const n = normVal(v);
    const cur = new Set(colFilters.value[col] ?? []);
    if (cur.has(n)) cur.delete(n);
    else cur.add(n);
    colFilters.value = { ...colFilters.value, [col]: [...cur] };
  }

  /* 区间端点写入（min/max 独立输入框各写一边，整组替换触发响应式） */
  function setRangeFilter(col: string, side: 'min' | 'max', v: string) {
    const cur = { ...(rangeFilters.value[col] ?? { min: '', max: '' }), [side]: v };
    rangeFilters.value = { ...rangeFilters.value, [col]: cur };
  }
  /* rangeOn/containsHit/rangeHit 命中契约上提模块级（filterRowsPure 单源共用；
 rangeOn 返回面不变——返回键仍指向同签名模块级纯函数） */
  /* 包含档写入（整组替换触发响应式；空白=该列不设限） */
  function setContainsFilter(col: string, v: string) {
    containsFilters.value = { ...containsFilters.value, [col]: v };
  }
  /** 包含档是否生效（空白=未设限不过滤） */
  function containsOn(col: string): boolean {
    return (containsFilters.value[col] ?? '').trim() !== '';
  }

  function clearFilter(col: string) {
    if (!colFilters.value[col] && !rangeOn(rangeFilters.value[col]) && !containsOn(col)) return;
    const next = { ...colFilters.value };
    delete next[col];
    colFilters.value = next;
    const nextR = { ...rangeFilters.value };
    delete nextR[col];
    rangeFilters.value = nextR;
    /* 包含档同构清除（与区间同款三档一列同清） */
    const nextC = { ...containsFilters.value };
    delete nextC[col];
    containsFilters.value = nextC;
  }

  function clearAllFilters() {
    colFilters.value = {};
    rangeFilters.value = {};
    containsFilters.value = {};
  }

  /* 等值勾选列与区间列并集计数（同列只算一次）——「已筛选 N 列」提示条口径；
 包含档并入计数 */
  const activeFilterCount = computed(() => {
    const eq = new Set(Object.keys(colFilters.value).filter(c => colFilters.value[c]?.length));
    for (const c of Object.keys(rangeFilters.value)) if (rangeOn(rangeFilters.value[c])) eq.add(c);
    for (const c of Object.keys(containsFilters.value)) if (containsOn(c)) eq.add(c);
    return eq.size;
  });

  /** 过滤管线：多列组合档（mode 缺省 'AND' 既有行为逐字节不变；'OR' 跨列并集档——
 语义细则见模块级 filterRowsPure）。：本函数收窄为运行态委托——
 三档 .value 快照入纯函数单源（534 源码锁签名行保真；552/556 运行时锚零变）。 */
  function filterRows<T>(rows: T[], mode: 'AND' | 'OR' = 'AND'): T[] {
    return filterRowsPure(rows, {
      colFilters: colFilters.value,
      rangeFilters: rangeFilters.value,
      containsFilters: containsFilters.value,
    }, opts.getVal, mode);
  }

  /* 暗状态守卫：筛选拉了随后被列选隐藏的列 → 该列筛选自动清（「所见即所筛」T22 同源；
 QRT 88/守卫合并内置）。连带回调供调用方清坐标键状态 */
  if (opts.cols) {
    watch(opts.cols, (cols) => {
      const hidden = Object.keys(colFilters.value).filter(c => !cols.includes(c))
        .concat(Object.keys(rangeFilters.value).filter(c => !cols.includes(c)))
        .concat(Object.keys(containsFilters.value).filter(c => !cols.includes(c)));
      if (hidden.length) {
        const next = { ...colFilters.value };
        for (const c of hidden) delete next[c];
        colFilters.value = next;
        const nextR = { ...rangeFilters.value };
        for (const c of hidden) delete nextR[c];
        rangeFilters.value = nextR;
        /* 包含档同构清（三档一列同清） */
        const nextC = { ...containsFilters.value };
        for (const c of hidden) delete nextC[c];
        containsFilters.value = nextC;
        opts.onAutoClear?.();
      }
    }, { immediate: true });
  }

  return { colFilters, rangeFilters, containsFilters, activeFilterCount, normVal, labelOf: opts.labelOf, filterVals, toggleFilterVal, setRangeFilter, rangeOn, containsOn, setContainsFilter, clearFilter, clearAllFilters, filterRows };
}

/* ═══ ：filterMode 组合档三态循环下沉（RT 1002-1004 / QRT 938-940 逐字同构合并）═══
 prop 播种运行档（缺省 'AND'）；toggleFilterMode 就地翻转（AND↔OR 二态循环）；prop 变化
 跟随播种。管线仍在 useColFilters.filterRows（mode 参数收口）。双内核接线形态：
 const { filterModeLive, toggleFilterMode } = useFilterMode(props)。 */
export function useFilterMode(props: { filterMode?: 'AND' | 'OR' }): {
  filterModeLive: Ref<'AND' | 'OR'>;
  toggleFilterMode: () => void;
} {
  const filterModeLive = ref<'AND' | 'OR'>(props.filterMode ?? 'AND');
  watch(() => props.filterMode, (m) => { if (m) filterModeLive.value = m; });
  function toggleFilterMode() { filterModeLive.value = filterModeLive.value === 'AND' ? 'OR' : 'AND'; }
  return { filterModeLive, toggleFilterMode };
}

/* ═══ ：quickFilter 跨列 contains 快滤单源（RT 1076-1081 quickHits /
 QRT 958-963 quickRows 逐字同构合并）═══
 q=生效词（trim+小写包含匹配）；空白/未传=恒等回落（返回同引用，零增量语义保真）；
 getVal/fullOf 参数化——两内核匹配口径一处 getSourceVal+rtCellFullText、一处 qColVal+fullText，
 保行为不并值口径。 */
export function quickFilterRows<T>(
  rows: readonly T[],
  q: string | undefined,
  cols: readonly string[],
  getVal: (row: T, col: string) => unknown,
  fullOf: (v: unknown) => string,
): T[] {
  const kw = q?.trim().toLowerCase();
  if (!kw) return rows as T[];
  return (rows as T[]).filter(row =>
    cols.some(c => fullOf(getVal(row, c)).toLowerCase().includes(kw)));
}
