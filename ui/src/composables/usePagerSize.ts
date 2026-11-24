import { ref, type Ref } from 'vue';
import { writeStoredRaw } from '../utils/safeJson';

/* 页大小共享记忆统一件——es_pager_size 全站同键（ IndexHub docs 表 /
 查询 tab 已用此键；DslQueryView 、LuceneQueryView 遗留清、
 BrowserView（browser.pageSize→legacyKey 种子）先后合并，全站分页同键）。
 读侧钳制到 Pagination 默认档位（10/20/50/100），越档/坏值回落默认 20；
 旧维度键 ihub.docsSize 保留兼容读（迁移读口径平移），写入只落共享键。
 遗留清：opts 参数化 per-view 种子——legacyKey/def 只作用于「共享键未命中时的读」
 （LuceneQueryView lucene.size→50 这类视图历史默认）；写入恒落共享键 es_pager_size，
 「共享键一次调节全站一致」是站内契约，per-view 只影响首次种子默认、不碎共享键。 */

const KEY = 'es_pager_size';
const LEGACY_KEY = 'ihub.docsSize';
/* Pagination 组件 sizes 默认档（paginationArrows421 锁 [10,20,50,100]），越档值按坏值处理。
 导出 PAGER_SIZES：DslQuery 执行窗口同步（DSL 顶层档内 size 反向驱动分页档）
 与读侧钳制共用同一档位判据，档位增减单源。 */
export const PAGER_SIZES = [10, 20, 50, 100];
const SIZES = PAGER_SIZES;
const DEF = 20;

type PagerSizeOpts = { legacyKey?: string; def?: number };

/** 读共享页大小：共享键越档/坏值 → legacyKey（缺省 ihub.docsSize）兼容读 → def（缺省 20） */
export function readPagerSize(opts?: PagerSizeOpts): number {
  const g = Number(localStorage.getItem(KEY));
  if (SIZES.includes(g)) return g;
  const legacy = Number(localStorage.getItem(opts?.legacyKey ?? LEGACY_KEY));
  return SIZES.includes(legacy) ? legacy : opts?.def ?? DEF;
}

/** 写共享页大小（一次调节全站生效；per-view 的 legacyKey/def 不参与写侧） */
export function writePagerSize(v: number): void {
  writeStoredRaw(localStorage, KEY, String(v || DEF));
}

/** 页大小记忆 Ref：set 时同步落共享键，翻页/重查副作用由调用方按表接线 */
export function usePagerSize(opts?: PagerSizeOpts): { size: Ref<number>; set: (v: number) => void } {
  const size = ref(readPagerSize(opts));
  function set(v: number) {
    size.value = v;
    writePagerSize(v);
  }
  return { size, set };
}
