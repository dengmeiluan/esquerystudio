import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayFavorite } from '../utils/favReplay';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const hub = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');

/* 1086：SQL 收藏=完整现场（SQL + 索引 + 参数）。
 * 旧收藏只存 SQL/fetchSize：换索引后回放会在当前顶栏索引上跑；参数化 SQL 回放丢参数。
 * 复用既有 prefill 键（与 1071 跨模式回放同通道），无新增存储。 */
describe('1086 SQL 收藏回放索引与参数', () => {
  beforeEach(() => sessionStorage.clear());

  it('收藏写入当前语句索引与合法参数', () => {
    expect(view).toContain('const idx = indexOf();');
    expect(view).toContain("const params = paramParse.value.ok && paramParse.value.value.length ? paramsText.value.trim() : '';");
    expect(view).toContain('...(idx ? { index: idx } : {}), ...(params ? { params } : {})');
  });

  it('回放投递索引/参数键，并清掉上一条 SQL 的残留', () => {
    sessionStorage.setItem('esquerystudio.sql.prefill.params', '["old"]');
    sessionStorage.setItem('esquerystudio.sql.prefill.index', 'old-idx');
    const push = vi.fn();
    replayFavorite(
      { kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT * FROM "bond_issuer"', index: 'bond_issuer', params: '["B-1"]' } },
      { push } as any,
      () => {},
    );
    expect(sessionStorage.getItem('esquerystudio.sql.prefill')).toContain('bond_issuer');
    expect(sessionStorage.getItem('esquerystudio.sql.prefill.index')).toBe('bond_issuer');
    expect(sessionStorage.getItem('esquerystudio.sql.prefill.params')).toBe('["B-1"]');
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { mode: 'sql' } });  });

  it('无参数/索引的旧收藏清掉旧键（不让上一条上下文串入）', () => {
    sessionStorage.setItem('esquerystudio.sql.prefill.params', '["old"]');
    sessionStorage.setItem('esquerystudio.sql.prefill.index', 'old-idx');
    replayFavorite(
      { kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT 1' } },
      { push: vi.fn() } as any,
      () => {},
    );
    expect(sessionStorage.getItem('esquerystudio.sql.prefill.params')).toBeNull();
    expect(sessionStorage.getItem('esquerystudio.sql.prefill.index')).toBeNull();
  });

  it('SQL 控制台挂载消费索引键（先切源再自动执行）', () => {
    expect(view).toContain("const prefillIdx = sessionStorage.getItem('esquerystudio.sql.prefill.index');");
    expect(view).toContain("if (prefillIdx && prefillIdx !== store.pickedIdx) store.pick(prefillIdx);");
    expect(view).toContain("removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.index');");
  });

  it('宿主 KeepAlive 回页时按预填键重挂对应模式（SQL/Lucene/沙盒/PIT 不只 DSL）', () => {
    expect(hub).toContain("sessionStorage.getItem('esquerystudio.sql.prefill') != null) next = 'sql'");
    expect(hub).toContain("sessionStorage.getItem('esquerystudio.lucene.q') != null) next = 'lucene'");
    expect(hub).toContain("sessionStorage.getItem('esquerystudio.sandbox.body') != null || sessionStorage.getItem('ss_dsl_body') != null) next = 'sandbox'");
    expect(hub).toContain("sessionStorage.getItem('esquerystudio.pit.filter') != null || sessionStorage.getItem('esquerystudio.pit.prefill') != null) next = 'pit'");
    expect(hub).toMatch(/if \(next\) \{\r?\n\s*mode\.value = next;\r?\n\s*stamp\.value\+\+;/);
  });
});
