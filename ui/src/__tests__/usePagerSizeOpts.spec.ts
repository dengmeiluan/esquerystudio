/**
 * 遗留清零二批：usePagerSize 参数化（opts.legacyKey/def per-view 种子）行为锁。
 * 读回落链=共享键 es_pager_size → legacyKey（缺省 ihub.docsSize）→ def（缺省 20），
 * 全程钳制档位 [10,20,50,100]（越档/坏值按坏值处理）；写入恒落共享键——
 * 「共享键一次调节全站一致」是站内契约，per-view 只影响首次种子默认、不碎共享键。
 * （此前仅 docsPager262/luceneQueryView521 源码锁盖读口径，composable 行为无直接锁。）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readPagerSize, usePagerSize } from '../composables/usePagerSize';

beforeEach(() => {
  localStorage.clear();
});

describe('usePagerSize 参数化（遗留清零二批）', () => {
  it('legacyKey 回落：共享键未设置 → 读 legacyKey 有效档', () => {
    localStorage.setItem('lucene.size', '50');
    expect(readPagerSize({ legacyKey: 'lucene.size', def: 50 })).toBe(50);
  });

  it('def 回落：共享键与 legacyKey 均无/越档 → def（lucene 起档 50 种子）', () => {
    expect(readPagerSize({ legacyKey: 'lucene.size', def: 50 })).toBe(50);
    localStorage.setItem('lucene.size', '15'); // 越档值=坏值（档位钳制 [10,20,50,100]）
    expect(readPagerSize({ legacyKey: 'lucene.size', def: 50 })).toBe(50);
  });

  it('共享键优先于 legacyKey（per-view 键只是种子，不夺共享记忆）', () => {
    localStorage.setItem('es_pager_size', '20');
    localStorage.setItem('lucene.size', '50');
    expect(readPagerSize({ legacyKey: 'lucene.size', def: 50 })).toBe(20);
  });

  it('写入落共享键不改 legacyKey（不碎共享键契约）', () => {
    localStorage.setItem('lucene.size', '50');
    const { size, set } = usePagerSize({ legacyKey: 'lucene.size', def: 50 });
    expect(size.value).toBe(50);
    set(100);
    expect(size.value).toBe(100);
    expect(localStorage.getItem('es_pager_size')).toBe('100');
    expect(localStorage.getItem('lucene.size'), 'legacyKey 只读不写').toBe('50');
  });

  it('无参默认行为不回归：ihub.docsSize 兼容读 + 默认 20（IndexHub/DslQuery 无参调用）', () => {
    expect(readPagerSize()).toBe(20);
    localStorage.setItem('ihub.docsSize', '50');
    expect(readPagerSize()).toBe(50);
    localStorage.setItem('es_pager_size', '10');
    expect(readPagerSize()).toBe(10);
  });
});
