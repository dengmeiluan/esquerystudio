/**
 * R130 第一百零三批：Pagination 翻页/改每页条数后自动滚回表头——长列表翻页后
 * 视线丢失（尤其 IndexHub 359 索引、Browser 深翻页）。零 props 侵入：组件挂载即生效，
 * 就近（.rt-wrap/.qrt-wrap/.scroll-y/.page 容器）找 thead smooth 滚回。
 * 锁定（静态）：翻页两钮与 onSize 均接线 scrollToHead + 就近容器判定。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/Pagination.vue'), 'utf-8');

describe('Pagination 翻页回表头（一百零三批）', () => {
  it('翻页两钮与 onSize 均接线 scrollToHead', () => {
    expect(src.match(/scrollToHead\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toMatch(/function scrollToHead\(\)/);
  });

  it('就近容器判定（不依赖调用方传 ref）', () => {
    expect(src).toMatch(/closest\('\.rt-wrap, \.qrt-wrap, \.scroll-y, \.page'\)/);
    expect(src).toMatch(/scrollIntoView\(\{ block: 'start', behavior: 'smooth' \}\)/);
  });
});
