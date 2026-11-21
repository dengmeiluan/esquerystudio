import { ref, computed } from 'vue';
import { typeTierSuppressed } from '../utils/semanticGuard';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';

/* 横切设施——通用表格列排序。
 numeric()：把 "1.2gb" / "95%" / "3,943" 等展示值还原为可比较数值；非数值返回 NaN。
 compareVals：通用值比较单源——numeric() 双试（任一成功即数值比较；null/undefined/''
 沉底，返回值恒 1/-1/0 方向无关，调用方须对沉底档跳过方向系数），否则 String
 localeCompare 兜底。RT sortedHits 与 QRT sortedRows 双内核消费（接线，
 numeric() 补科学计数 1e6 与时长单位 ms|s）。
 sortableGuard：显式非语义列排序抑制出口（——binary/_source 等抑制列
 toggle 档短路，fieldType 缺省恒放行。

 useSortChain（·「排序状态机下沉大件」落地）：排序状态机
 单一出处——RT（原 'asc'|'desc' 字符串机）与 QRT（原 1|-1 数字机）双机合并，内部方向
 编码归一字符串（=emit 公共契约本形；QRT M2 写侧已归一字符串载荷、RT 读侧
 已兼容双格式，合并零落盘格式漂移）。全机语义：
 · 本地三态循环：新键升序起步 → 同键降序 → 第三击取消（；
 · Shift 次键链：链内翻转/链外追加（≤3，链满 notify）；
 · 右键 directDir 直选：等值单键 no-op，否则单键直设（ dbx 语义）；
 · 远端意图镜像（535 契约）：isRemote 档只 emit 不落本地/落盘，升→降→取消循环，
 directDir 跳过循环直发（；
 · syncSort 回填（五百四十三/）：1|-1 归一 asc/desc、null 清态，只动
 显示镜像（dispChain 分轨：接线档=镜像单键，本地档=sortSpec）；
 · 维度落盘：:m JSON 字符串载荷 + :f/:d 旧键兼容，读侧双格式容忍（RT/QRT 同键空间
 互读，M2）；lsBase 返回 null=通道不读不写（QRT 无 storageKey 档零增量）；
 · pruneTo 列隐藏剔除（/reload 换维度重读（远端档恒空）。
 RT/QRT 只留薄壳守卫（拖拽点击抑制/sortableGuard/sortable 开关/展开态清理钩子）与
 行序应用点（sortedHits/sortedRows 经 compareVals）。
 同步裁决：僵尸壳 useTableSort 退役——(b) 其零生产消费（各表换壳
 QRT rows 型后宿主胶水全退役），防误删锁随语义升格为退役锁，384 spec 同车退役。 */

interface SortChainKey { f: string; d: 'asc' | 'desc' }

interface UseSortChainOpts {
  /* 维度落盘键 getter；返回 null=该通道不读不写落盘 */
  lsBase: () => string | null;
  /* 远端档 true：只发意图不落本地/落盘（535 契约） */
  isRemote: () => boolean;
  /* syncSort 是否接线（!==undefined 判别，543/552 显示分轨口径） */
  syncWired: () => boolean;
  /* 远端意图出口（=内核 emit('sort-change', …)，载荷 'asc'|'desc' 公共契约） */
  emitIntent: (s: SortChainKey | null) => void;
  /* 本地链变更后钩子（QRT 坐标键展开态清零；RT 无需不传。远端意图/等值 no-op 不触发） */
  onLocalChange?: () => void;
  /* 链满提示（两内核同文案 store.notify('warning', …)） */
  notify?: (msg: string) => void;
}

export function useSortChain(opts: UseSortChainOpts) {
  const MAX_CHAIN = 3;
  /* 审计修复口径：远端档挂载不读排序落盘（「远端档本地仍排」违 535 契约） */
  const sortSpec = ref<SortChainKey[]>(opts.isRemote() ? [] : readLs());
  const remoteSortCur = ref<SortChainKey | null>(null);

  function readLs(): SortChainKey[] {
    const base = opts.lsBase();
    if (!base) return [];
    const m = localStorage.getItem(base + ':m');
    if (m) {
      try {
        const arr = JSON.parse(m);
        if (Array.isArray(arr)) {
          /* M2：双格式兼容读——RT 字符串载荷/QRT 数字载荷同键空间互读 */
          return arr
            .map((k: any): SortChainKey | null => {
              if (!k || typeof k.f !== 'string') return null;
              if (k.d === 'asc' || k.d === 'desc') return { f: k.f, d: k.d };
              if (k.d === 1) return { f: k.f, d: 'asc' };
              if (k.d === -1) return { f: k.f, d: 'desc' };
              return null;
            })
            .filter((k): k is SortChainKey => !!k)
            .slice(0, MAX_CHAIN);
        }
      } catch { /* 坏值回落旧键 */ }
    }
    const f = localStorage.getItem(base + ':f');
    return f ? [{ f, d: localStorage.getItem(base + ':d') === 'desc' ? 'desc' : 'asc' }] : [];
  }

  /* 布局分享导入（RT applyLayout）直设链后的落盘出口 */
  function persist() {
    const base = opts.lsBase();
    if (!base) return;
    if (sortSpec.value.length) {
      writeStoredRaw(localStorage, base + ':m', JSON.stringify(sortSpec.value));
      writeStoredRaw(localStorage, base + ':f', sortSpec.value[0].f);
      writeStoredRaw(localStorage, base + ':d', sortSpec.value[0].d);
    } else {
      removeStoredRaw(localStorage, base + ':m');
      removeStoredRaw(localStorage, base + ':f');
      removeStoredRaw(localStorage, base + ':d');
    }
  }

  function changed() { persist(); opts.onLocalChange?.(); }

  /* 模板辅助：链内方向/序号（aria-sort 仅链首——HTML aria-sort 单值语义）。
 显示与数据分轨：行序/落盘只认 sortSpec（远端档恒空），箭头/aria 认 dispChain。 */
  const dispChain = computed<SortChainKey[]>(() =>
    (opts.isRemote() && opts.syncWired())
      ? (remoteSortCur.value ? [remoteSortCur.value] : [])
      : sortSpec.value);
  const chainCount = computed(() => dispChain.value.length);
  function chainHas(c: string) { return dispChain.value.some(k => k.f === c); }
  function chainDir(c: string): 'asc' | 'desc' { return dispChain.value.find(k => k.f === c)?.d ?? 'asc'; }
  function chainOrd(c: string) { return dispChain.value.findIndex(k => k.f === c); }

  /* 单一入口：表头点击/键盘 Enter·Space/右键直选/Shift 次键四路共用（内核薄壳守卫后
 委托至此）；远端档只推导意图镜像并 emit。 */
  function sortBy(key: string, directDir?: 'asc' | 'desc', shift = false) {
    if (opts.isRemote()) {
      if (directDir) { remoteSortCur.value = { f: key, d: directDir }; opts.emitIntent({ ...remoteSortCur.value }); return; }
      const cur = remoteSortCur.value;
      const next = cur && cur.f === key ? (cur.d === 'asc' ? { f: key, d: 'desc' as const } : null) : { f: key, d: 'asc' as const };
      remoteSortCur.value = next;
      opts.emitIntent(next ? { ...next } : null);
      return;
    }
    /* directDir 直选（dbx 语义）；列头点击仍走三态循环 */
    if (directDir) {
      if (sortSpec.value.length === 1 && sortSpec.value[0].f === key && sortSpec.value[0].d === directDir) return;
      sortSpec.value = [{ f: key, d: directDir }];
      changed(); return;
    }
    if (shift) {
      /* Shift+点=次键操作——链内则翻转方向，不在链则追加（≤3 键） */
      const i = chainOrd(key);
      if (i >= 0) {
        sortSpec.value = sortSpec.value.map((k, ki) => ki === i ? { ...k, d: k.d === 'asc' ? 'desc' as const : 'asc' as const } : k);
      } else if (sortSpec.value.length < MAX_CHAIN) {
        sortSpec.value = [...sortSpec.value, { f: key, d: 'asc' }];
      } else { opts.notify?.('最多支持 3 个排序键'); return; }
      changed(); return;
    }
    const head = sortSpec.value[0];
    if (head && head.f === key) {
      if (head.d === 'asc') sortSpec.value = [{ f: key, d: 'desc' }];
      else sortSpec.value = []; /* ：第三击取消排序——回原始序，persist 移除键 */
    } else { sortSpec.value = [{ f: key, d: 'asc' }]; }
    changed();
  }

  /* 五百四十三/：syncSort 回填——宿主权威态镜像（1|-1 归一 asc/desc，
 null 清态+循环基点同清）；只动显示镜像，sortSpec/行序/落盘零触碰。内核 watch
 守卫 undefined/非远端后委托；immediate 由内核侧持（宿主携态挂载首渲即回显）。 */
  function applySync(s: { f: string; d: 1 | -1 } | null) {
    remoteSortCur.value = s ? { f: s.f, d: s.d === 1 ? 'asc' : 'desc' } : null;
  }

  /* 换维度重读该维度排序记忆（内核 watch 委托；远端档恒空=538 口径） */
  function reload() { sortSpec.value = opts.isRemote() ? [] : readLs(); }

  /* 排序列被列选隐藏→从链剔除（单键=清空）并落盘，避免「排序仍在生效
 但箭头不可见」暗状态；无变化零写（immediate watch 挂载复检友好） */
  function pruneTo(cols: string[]) {
    if (sortSpec.value.some(k => !cols.includes(k.f))) {
      sortSpec.value = sortSpec.value.filter(k => cols.includes(k.f));
      changed();
    }
  }

  return { sortSpec, dispChain, chainCount, chainHas, chainDir, chainOrd, sortBy, applySync, reload, pruneTo, persist };
}

/** 把 "1.2gb" / "95%" / "3,943" 等展示值还原为可比较数值；非数值返回 NaN。
 * v3.0.0 起导出：ResultTable sortedHits 同口径复用（此前其比较器对数字型字符串
 * "100"/"20" 走 localeCompare 典序，100 排在 20 前——keyword 映射的数字字段实锤错序）
 * 正则补科学计数（1e6/2.5E-3）与时长单位（ms|s，归一秒基——semFormat
 * duration 显示语汇同基），千分位/单位档既有口径不动 */
export function numeric(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/,/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(b|kb|mb|gb|tb|pb|%|ms|s)?$/i);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  const mul: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4, pb: 1024 ** 5, ms: 0.001, s: 1 };
  return unit && unit !== '%' ? n * (mul[unit] || 1) : n;
}

/** 通用值比较单源（RT sortedHits / QRT sortedRows 双内核接线）。
 * numeric() 双试——任一成功即数值比较；null/undefined/'' 沉底（返回值恒 1/-1/0，
 * 方向无关——调用方须对沉底档跳过方向系数，保证降序也沉底）；否则 String localeCompare
 * 兜底（null 语义不进兜底，String() 仅对非空值调用）。 */
export function compareVals(a: unknown, b: unknown): number {
  const aBlank = a === null || a === undefined || a === '';
  const bBlank = b === null || b === undefined || b === '';
  if (aBlank || bBlank) {
    if (aBlank && bBlank) return 0;
    return aBlank ? 1 : -1;
  }
  const an = numeric(a); const bn = numeric(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a).localeCompare(String(b));
}

/** 显式非语义列排序抑制出口（531 遗留件③消费面）——binary/_source 等
 * 抑制列 toggle 档短路（排序语义 VOID：raw doc/密文比较无意义）；fieldType 缺省恒放行
 * （零增量缺省）。产出口径给双内核 sortGuard 直连。 */
export function sortableGuard(fieldType?: (col: string) => string | undefined): (key: string) => boolean {
  return (key) => !typeTierSuppressed(key, fieldType?.(key));
}
