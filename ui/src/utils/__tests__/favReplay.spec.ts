import { describe, it, expect, vi, beforeEach } from 'vitest';
import { draftStorageKey } from '../../composables/useScopedDraft';
import { replayFavorite, replayTarget } from '../favReplay';
import type { Router } from 'vue-router';

/* R57：R54/R56 收藏重放核心逻辑的单测矩阵——此前只有 e2e 覆盖（2 分钟/轮且依赖部署链），
   分发是纯逻辑，这里秒级锁死：8 分支 × 正常/损坏两态 + replayTarget 同源一致性契约。 */

let pushed: any[] = [];
let notices: { type: string; msg: string }[] = [];
const router = { push: (to: any) => { pushed.push(to); } } as unknown as Router;
const notify = (type: 'success' | 'warning', msg: string) => { notices.push({ type, msg }); };

beforeEach(() => {
  pushed = [];
  notices = [];
  sessionStorage.clear();
});

/** push 参数（string | {path}）归一成 path 字符串 */
const pushedPath = () => (typeof pushed[0] === 'string' ? pushed[0] : pushed[0]?.path);

describe('replayFavorite 正常分发矩阵', () => {
  it('dsl → carry 键 + 查询工作台 DSL 模式', () => {
    replayFavorite({ kind: 'dsl', payload: { body: '{"query":{}}', index: 'idx1' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.dsl.carry')).toBe('{"query":{}}');
    expect(sessionStorage.getItem('esquerystudio.dsl.carry.index')).toBe('idx1');
    expect(pushed[0]).toEqual({ path: '/search', query: { mode: 'dsl' } });
    expect(notices[0].type).toBe('success');
  });

  it('rest+sql → prefill 键 + 工作台 SQL 模式自动执行', () => {
    replayFavorite({ kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT 1' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.sql.prefill')).toBe('SELECT 1');
    expect(pushed[0]).toEqual({ path: '/search', query: { mode: 'sql' } });
  });

  it('rest+lucene → q/index 键 + 排序参数随 mode 走 query（R55/R64）', () => {
    replayFavorite({ kind: 'rest', tags: ['lucene'], payload: { q: 'a:1', index: 'i1', sortField: 'ts', sortOrder: 'desc' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.lucene.q')).toBe('a:1');
    expect(pushed[0].query).toEqual({ mode: 'lucene', sort: 'ts', order: 'desc' });
  });

  it('rest+bulk → carry 键（视图挂载消费）+ idx query（八十二批改一次性 carry）', () => {
    replayFavorite({ kind: 'rest', tags: ['bulk'], payload: { body: '{"index":{}}', index: 'i1' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.bulk.carry')).toBe('{"index":{}}');
    expect(pushed[0]).toEqual({ path: '/bulk', query: { idx: 'i1' } });
  });

  it('rest+ubq → carry 键（视图挂载解析 query）+ mode/idx（八十二批）', () => {
    replayFavorite({ kind: 'rest', tags: ['ubq'], payload: { body: '{"query":{"term":{"a":1}}}', index: 'i1', mode: 'preview' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.ubq.carry')).toBe('{"query":{"term":{"a":1}}}');
    expect(pushed[0].query).toEqual({ idx: 'i1', mode: 'preview' });
  });

  it('rest+doc → carry.source + idx/id query（R55）', () => {
    replayFavorite({ kind: 'rest', tags: ['doc'], payload: { index: 'i1', id: 'd1', source: '{"a":1}' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.doc-diff.carry.source')).toBe('{"a":1}');
    expect(pushed[0]).toEqual({ path: '/doc-diff', query: { idx: 'i1', id: 'd1' } });
  });

  /* 一百一十四批：route 收藏 path 缺失防御——push("undefined") 会落 404 */
  it('route 收藏：有 path 直跳；缺 path 回概览并警告（不 push 坏路由）', () => {
    replayFavorite({ kind: 'route', payload: { path: '/ilm' } }, router, notify);
    expect(pushed[0]).toBe('/ilm');
    replayFavorite({ kind: 'route', payload: {} }, router, notify);
    expect(pushed[1]).toBe('/overview');
    expect(notices[notices.length - 1].type).toBe('warning');
  });

  it('rest 兜底 → R53 草稿键 + /rest', () => {
    replayFavorite({ kind: 'rest', payload: { method: 'PUT', path: '/_settings', body: '{}' } }, router, notify);
    const sc = { route: 'rest', target: () => '' };
    expect(sessionStorage.getItem(draftStorageKey(sc, 'method'))).toBe('PUT');
    expect(sessionStorage.getItem(draftStorageKey(sc, 'path'))).toBe('/_settings');
    expect(pushedPath()).toBe('/rest');
  });

  it('template → sandbox 键 + 工作台沙盒模式', () => {
    replayFavorite({ kind: 'template', payload: '{"query":{}}' }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.sandbox.body')).toBe('{"query":{}}');
    expect(pushed[0]).toEqual({ path: '/search', query: { mode: 'sandbox' } });
  });

  it('页面门拒绝时不写 carry/不跳转/不报已恢复', () => {
    replayFavorite({ kind: 'dsl', payload: { body: '{"query":{}}' } }, router, notify, () => false);
    expect(pushed).toHaveLength(0);
    expect(sessionStorage.getItem('esquerystudio.dsl.carry')).toBeNull();
    expect(notices[0].type).toBe('warning');
    expect(notices[0].msg).toContain('无');
  });
});

describe('replayFavorite 损坏 payload 容错（R56：不再静默假成功）', () => {
  it('sql 缺 p.sql → warning + 仍跳工作台 SQL 模式 + 不写 prefill + 不污染 rest 草稿', () => {
    replayFavorite({ kind: 'rest', tags: ['sql'], payload: {} }, router, notify);
    expect(pushedPath()).toBe('/search');
    expect(sessionStorage.getItem('esquerystudio.sql.prefill')).toBeNull();
    expect(sessionStorage.getItem(draftStorageKey({ route: 'rest', target: () => '' }, 'method'))).toBeNull();
    expect(notices[0].type).toBe('warning');
    expect(notices[0].msg).toContain('不完整');
  });

  it('doc 缺 id → warning + 跳 /doc-diff 不带残缺 query', () => {
    replayFavorite({ kind: 'rest', tags: ['doc'], payload: { index: 'i1' } }, router, notify);
    expect(pushedPath()).toBe('/doc-diff');
    expect(pushed[0]).toBe('/doc-diff'); // 纯字符串 push，无 query 对象
    expect(notices[0].type).toBe('warning');
  });

  it('ubq body 非法 JSON → 原文透传 carry（视图侧容错入草稿）+ 提醒核对（八十二批）', () => {
    replayFavorite({ kind: 'rest', tags: ['ubq'], payload: { body: '{broken', index: 'i1' } }, router, notify);
    expect(sessionStorage.getItem('esquerystudio.ubq.carry')).toBe('{broken');
    expect(notices[0].type).toBe('success');
    expect(notices[0].msg).toContain('再次核对');
  });

  it('bulk 缺 body → warning + 仍跳转', () => {
    replayFavorite({ kind: 'rest', tags: ['bulk'], payload: {} }, router, notify);
    expect(pushedPath()).toBe('/bulk');
    expect(notices[0].type).toBe('warning');
  });

  it('reindex 缺 body → warning', () => {
    replayFavorite({ kind: 'rest', tags: ['reindex'], payload: {} }, router, notify);
    expect(pushedPath()).toBe('/reindex-advanced');
    expect(notices[0].type).toBe('warning');
  });
});

describe('replayTarget 与 replayFavorite 同源一致性契约', () => {
  /* 注释里的「同源维护」约定在这里变成机器保证：徽章标注的去向必须等于实际跳转路径 */
  const cases: { name: string; it: any }[] = [
    { name: 'dsl', it: { kind: 'dsl', payload: { body: '{}' } } },
    { name: 'sql', it: { kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT 1' } } },
    { name: 'sql-broken', it: { kind: 'rest', tags: ['sql'], payload: {} } },
    { name: 'lucene', it: { kind: 'rest', tags: ['lucene'], payload: { q: 'a:1' } } },
    { name: 'bulk', it: { kind: 'rest', tags: ['bulk'], payload: { body: 'x' } } },
    { name: 'ubq', it: { kind: 'rest', tags: ['ubq'], payload: { body: '{"query":{}}' } } },
    { name: 'dbq', it: { kind: 'rest', tags: ['dbq'], payload: { body: '{"query":{}}' } } },
    { name: 'reindex', it: { kind: 'rest', tags: ['reindex'], payload: { body: '{}' } } },
    { name: 'doc', it: { kind: 'rest', tags: ['doc'], payload: { index: 'i', id: 'd' } } },
    { name: 'doc-broken', it: { kind: 'rest', tags: ['doc'], payload: {} } },
    { name: 'rest', it: { kind: 'rest', payload: { path: '/x' } } },
    { name: 'template', it: { kind: 'template', payload: '{}' } },
  ];
  for (const c of cases) {
    it(`${c.name}：徽章去向 === 实际跳转`, () => {
      replayFavorite(c.it, router, notify);
      expect(pushedPath()).toBe(replayTarget(c.it).path);
    });
  }
});
