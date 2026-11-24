/**
 * 1233：DSL→Lucene 翻译缺失提示要**常驻**，不能一刷新就没。
 *
 * 上一批把 `lossy`（query_string 表达不了的子句名）写进 sessionStorage + 弹一次 toast。
 * 问题：toast 看完就散、刷新之后连 sessionStorage 也被别的流程覆盖，
 * 用户会拿着「少了条件」的 query_string 去跑还以为等价——静默丢条件比报错更危险。
 *
 * 本批：Lucene 页进站时把 lossy 读成页面状态（读走即删存储，但状态留到用户手动关闭），
 * 渲染成常驻告警条，逐条列名 + 换通道指引 + 关闭钮。
 *
 * 真浏览器实测（DSL 页灌入含 nested 的查询 → 点「DSL→Lucene」）：
 * 告警条文案 = 「这份查询从 DSL 翻译而来，但有 1 处 query_string 表达不了：nested」
 * ＋「这些条件当前缺失——需要完整语义请回查询工作台用 DSL 通道执行。」，
 * 且 sessionStorage 里 `esquerystudio.lucene.lossy` 已被读走清空（stored: null）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lucene = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('1233 翻译缺失提示常驻', () => {
  it('进站读取 lossy 成页面状态，并清掉存储键（一次性 carry）', () => {
    expect(lucene).toContain("sessionStorage.getItem('esquerystudio.lucene.lossy')");
    expect(lucene).toContain("removeStoredRaw(sessionStorage, 'esquerystudio.lucene.lossy')");
    expect(lucene).toContain('const carriedLossy = ref<string[]>([]);');
  });

  it('坏数据当没有（宁少提示也不显示乱码清单）', () => {
    expect(lucene).toContain('Array.isArray(arr)');
    expect(lucene).toContain("filter((x: unknown) => typeof x === 'string')");
  });

  it('渲染成常驻告警条：列名 + 换通道指引 + 可关闭', () => {
    expect(lucene).toMatch(/<div v-if="carriedLossy\.length" class="lc-lossy" role="status">/);
    expect(lucene).toContain('query_string 表达不了');
    expect(lucene).toContain('回查询工作台用 DSL 通道执行');
    expect(lucene).toContain('aria-label="关闭翻译缺失提示"');
    expect(lucene).toContain('@click="carriedLossy = []"');
  });

  it('两个生产方（DSL 页 / 命令面板）都写这个键（只修一端等于没修）', () => {
    for (const rel of ['views/DslQueryView.vue', 'components/CmdPalette.vue']) {
      const s = readFileSync(join(__dirname, '..', rel), 'utf-8');
      expect(s, rel).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.lucene.lossy'");
    }
  });
});
