/**
 * 六百零三批 轨3：useSortChain 排序状态机单源下沉（560 备案大件落地）。
 * 背景：RT（'asc'|'desc' 字符串）与 QRT（1|-1 数字）各自维护一套排序状态机——
 * 三态循环/Shift 次键链/右键直选/远端意图镜像/syncSort 回填/维度落盘，语义经
 * 535/543/552/561/565/567 各批已逐字节对齐，唯内部方向编码与落点分叉。
 * 把全机合并 composables/tableSort.ts 单一出处，内部编码归一字符串
 * （公共 emit 契约 'asc'|'desc' 本形，QRT M2 写侧已归一字符串，RT 读侧已兼容双格式）；
 * RT/QRT 只留薄壳守卫（拖拽抑制/sortableGuard/sortable 开关）与排序应用点。
 * 同批裁决：僵尸壳 useTableSort 退役（558b ③ 防误删锁随语义升格，384 spec 同车）。
 * 锁定：三态循环/换键升序起步/Shift 链≤3+链满提示/直选/远端意图/回填/落盘双格式/通道守卫。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSortChain } from '../composables/tableSort';

type Intent = { f: string; d: 'asc' | 'desc' } | null;

function mk(opts?: { remote?: boolean; wired?: boolean; lsBase?: string | null }) {
  const intents: Intent[] = [];
  const notes: string[] = [];
  let localChanges = 0;
  const chain = useSortChain({
    lsBase: () => (opts?.lsBase === undefined ? 'es_tbl_sort:ut603' : opts.lsBase),
    isRemote: () => !!opts?.remote,
    syncWired: () => opts?.wired !== false,
    emitIntent: (s) => intents.push(s),
    onLocalChange: () => { localChanges++; },
    notify: (m) => notes.push(m),
  });
  return { chain, intents, notes, Was: () => localChanges };
}

describe('useSortChain 本地三态与次键链（603）', () => {
  beforeEach(() => localStorage.clear());

  it('三态循环：新键升序起步 → 同键降序 → 第三击取消（回原始序）', () => {
    const { chain } = mk();
    chain.sortBy('a');
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'asc' }]);
    chain.sortBy('a');
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'desc' }]);
    chain.sortBy('a');
    expect(chain.sortSpec.value).toEqual([]);
  });

  it('换键重置为单键升序（头键不同 → 全新链）', () => {
    const { chain } = mk();
    chain.sortBy('a');
    chain.sortBy('a'); // desc
    chain.sortBy('b');
    expect(chain.sortSpec.value).toEqual([{ f: 'b', d: 'asc' }]);
  });

  it('Shift 追加次键（升序起步）→ Shift 翻转链内方向 → 链满 3 提示且不改态', () => {
    const { chain, notes } = mk();
    chain.sortBy('a');
    chain.sortBy('b', undefined, true);
    chain.sortBy('c', undefined, true);
    expect(chain.sortSpec.value).toEqual([
      { f: 'a', d: 'asc' }, { f: 'b', d: 'asc' }, { f: 'c', d: 'asc' },
    ]);
    chain.sortBy('d', undefined, true);
    expect(notes).toEqual(['最多支持 3 个排序键']);
    expect(chain.sortSpec.value).toHaveLength(3);
    chain.sortBy('b', undefined, true); // 链内翻转
    expect(chain.sortSpec.value[1]).toEqual({ f: 'b', d: 'desc' });
  });

  it('右键直选：不同态单键直设；等值单键 no-op', () => {
    const { chain } = mk();
    chain.sortBy('a', 'desc');
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'desc' }]);
    chain.sortBy('a', 'desc'); // 等值 no-op
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'desc' }]);
    chain.sortBy('a', 'asc');
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'asc' }]);
  });

  it('落盘：写侧字符串格式 :m/:f/:d 同步链态；清空移除键', () => {
    const { chain } = mk();
    chain.sortBy('sz', 'desc');
    expect(localStorage.getItem('es_tbl_sort:ut603:m')).toBe(JSON.stringify([{ f: 'sz', d: 'desc' }]));
    expect(localStorage.getItem('es_tbl_sort:ut603:f')).toBe('sz');
    expect(localStorage.getItem('es_tbl_sort:ut603:d')).toBe('desc');
    chain.sortBy('sz'); // desc → 取消
    expect(localStorage.getItem('es_tbl_sort:ut603:m')).toBe(null);
    expect(localStorage.getItem('es_tbl_sort:ut603:f')).toBe(null);
  });

  it('读侧双格式兼容：QRT 遗留数字载荷（1/-1）归一字符串链；旧 :f/:d 键回落', () => {
    localStorage.setItem('es_tbl_sort:ut603:m', JSON.stringify([{ f: 'age', d: -1 }, { f: 'nm', d: 1 }]));
    const { chain } = mk();
    expect(chain.sortSpec.value).toEqual([{ f: 'age', d: 'desc' }, { f: 'nm', d: 'asc' }]);
    localStorage.clear();
    localStorage.setItem('es_tbl_sort:ut603:f', 'legacy');
    localStorage.setItem('es_tbl_sort:ut603:d', 'desc');
    const c2 = mk().chain;
    expect(c2.sortSpec.value).toEqual([{ f: 'legacy', d: 'desc' }]);
  });

  it('pruneTo 剔除隐藏列键并落盘；无变化零写', () => {
    const { chain } = mk();
    chain.sortBy('a');
    chain.sortBy('b', undefined, true);
    chain.pruneTo(['b', 'c']); // a 被列选隐藏
    expect(chain.sortSpec.value).toEqual([{ f: 'b', d: 'asc' }]);
    expect(JSON.parse(localStorage.getItem('es_tbl_sort:ut603:m')!)).toEqual([{ f: 'b', d: 'asc' }]);
  });

  it('onLocalChange 钩子：本地变更触发（远端意图不触发；等值 no-op 不触发）', () => {
    const { chain, Was } = mk();
    chain.sortBy('a');
    expect(Was()).toBe(1);
    chain.sortBy('a', 'asc'); // 等值 no-op
    expect(Was()).toBe(1);
    const { chain: rc, Was: rWas } = mk({ remote: true });
    rc.sortBy('a');
    expect(rWas()).toBe(0);
  });
});

describe('useSortChain 远端意图与回填（603）', () => {
  beforeEach(() => localStorage.clear());

  it('远端档：升→降→取消三态循环只发意图，本地链与落盘零触碰', () => {
    const { chain, intents } = mk({ remote: true });
    chain.sortBy('h');
    expect(intents[0]).toEqual({ f: 'h', d: 'asc' });
    chain.sortBy('h');
    expect(intents[1]).toEqual({ f: 'h', d: 'desc' });
    chain.sortBy('h');
    expect(intents[2]).toBe(null);
    expect(chain.sortSpec.value).toEqual([]);
    expect(localStorage.getItem('es_tbl_sort:ut603:m')).toBe(null);
  });

  it('远端档 directDir 直选跳过循环直发；换键重启升序', () => {
    const { chain, intents } = mk({ remote: true });
    chain.sortBy('h', 'desc');
    expect(intents[0]).toEqual({ f: 'h', d: 'desc' });
    chain.sortBy('h'); // 镜像已 desc → 取消
    expect(intents[1]).toBe(null);
    chain.sortBy('k');
    expect(intents[2]).toEqual({ f: 'k', d: 'asc' });
  });

  it('applySync 回填：1|-1 归一 asc/desc、null 清态；dispChain 镜像单键', () => {
    const { chain } = mk({ remote: true });
    chain.applySync({ f: 'v', d: -1 });
    expect(chain.dispChain.value).toEqual([{ f: 'v', d: 'desc' }]);
    chain.applySync({ f: 'v', d: 1 });
    expect(chain.dispChain.value).toEqual([{ f: 'v', d: 'asc' }]);
    chain.applySync(null);
    expect(chain.dispChain.value).toEqual([]);
  });

  it('dispChain 分轨：本地档=sortSpec；remote 未回填=空（箭头/aria 恒无）', () => {
    const { chain } = mk({ remote: true });
    chain.applySync(null); // 接线但无态
    expect(chain.dispChain.value).toEqual([]);
    const local = mk();
    local.chain.sortBy('a');
    expect(local.chain.dispChain.value).toEqual([{ f: 'a', d: 'asc' }]);
  });

  it('链辅助：chainCount/chainHas/chainDir/chainOrd（aria 单值语义锁）', () => {
    const { chain } = mk();
    chain.sortBy('a');
    chain.sortBy('b', undefined, true);
    expect(chain.chainCount.value).toBe(2);
    expect(chain.chainHas('b')).toBe(true);
    expect(chain.chainDir('a')).toBe('asc');
    expect(chain.chainOrd('b')).toBe(1);
    expect(chain.chainDir('zz')).toBe('asc'); // 链外缺省
  });
});

describe('useSortChain 通道守卫（603）', () => {
  beforeEach(() => localStorage.clear());

  it('lsBase=null（QRT 无 storageKey 档）：不读不写落盘，机内状态照常', () => {
    const { chain } = mk({ lsBase: null });
    chain.sortBy('a');
    expect(chain.sortSpec.value).toEqual([{ f: 'a', d: 'asc' }]);
    expect(localStorage.getItem('es_tbl_sort:ut603:m')).toBe(null);
  });

  it('reload：换维度重读该键落盘（远端档恒空，538 口径）', () => {
    localStorage.setItem('es_tbl_sort:dim2:m', JSON.stringify([{ f: 'x', d: 'desc' }]));
    let base = 'es_tbl_sort:dim1';
    const intents: Intent[] = [];
    const chain = useSortChain({
      lsBase: () => base,
      isRemote: () => false,
      syncWired: () => false,
      emitIntent: (s) => intents.push(s),
    });
    expect(chain.sortSpec.value).toEqual([]);
    chain.sortBy('tmp');
    base = 'es_tbl_sort:dim2';
    chain.reload();
    expect(chain.sortSpec.value).toEqual([{ f: 'x', d: 'desc' }]);
  });
});
