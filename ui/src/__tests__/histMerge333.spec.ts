/**
 * 三百三十三批：查询历史导入合并（导出闭环消费方）——
 * store.mergeFrom 按 mode+query+index 去重（已有保留/新增 genId+原 ts），合并后按 ts 降序裁上限；
 * 面板隐藏 file input + 导入完成计数反馈；95 批 title 诚实化解封。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api } };
});

import { useQueryHistoryStore } from '../stores/queryHistory';

const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setActivePinia(createPinia());
});

describe('历史导入合并（333 批）', () => {
  it('新增/去重/无效项计数正确，合并后按 ts 降序', () => {
    const st = useQueryHistoryStore();
    st.push('dsl', 'match_all', 'idx-a', 5);
    const r = st.mergeFrom([
      { mode: 'dsl', query: 'match_all', index: 'idx-a', ts: 1 },      // 重复 → skip
      { mode: 'lucene', query: 'status:open', index: 'idx-b', ts: 2 }, // 新增
      { mode: 'sql', query: 'SELECT 1', ts: 3 },                        // 新增
      { garbage: true },                                                // 无效 → skip
      { mode: 'dsl', query: '', index: 'idx-c', ts: 4 },                // 空查询 → skip（isItem 过 query 校验）
    ]);
    expect(r).toEqual({ added: 2, skipped: 3 });
    /* 预置条目（push 时 ts=Date.now()）按降序排最前，导入两条按原 ts 跟随 */
    expect(st.items[0].query).toBe('match_all');
    expect(st.items[1].query).toBe('SELECT 1');
    expect(st.items[2].query).toBe('status:open');
    expect(st.items.length).toBe(3);
  });
  it('超上限裁剪', () => {
    const st = useQueryHistoryStore();
    const many = Array.from({ length: 150 }, (_, i) => ({ mode: 'dsl', query: 'q' + i, ts: i }));
    const r = st.mergeFrom(many);
    expect(r.added, 'added 为裁剪前插入数').toBe(150);
    expect(st.items.length, '裁到上限 100').toBe(100);
  });
  it('面板源码锁：隐藏 file input+导入按钮+mergeFrom 调用', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const v = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');
    expect(v).toMatch(/ref="importFileEl" type="file" accept="\.json/);
    expect(v).toMatch(/hist\.mergeFrom\(list\)/);
    expect(v).toContain('跳过重复/无效');
    await flush();
  });
});
