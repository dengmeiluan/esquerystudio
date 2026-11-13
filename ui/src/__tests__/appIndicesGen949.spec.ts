/**
 * 949 批 刀②：app store loadIndices 世代守卫（切连接在途慢拍跨集群污染根治）。
 *
 * 真矿：loadIndices 无互斥也无世代面，十几个触发通道（15 个视图懒载口/setTarget 切
 *   连接口/App 启动链）任两通道并发时，慢拍旧回包照常落袋——切集群后旧集群的索引
 *   清单写进新集群上下文（indices 与 target 语义分裂）、clusterOk/clusterHealth/
 *   clusterSelf 跟随面被旧集群态污染、旧拍 401/失败把新拍成功面改写成「连接失败」、
 *   loadingIndices 闸被旧拍 finally 提前收掉。
 *   修法口径=世代守卫：每拍入列即 ++indicesSeq（捕获前移到 await ensureSetup 之前），
 *   回包/失败/finally 三处都先核 seq 再动状态；懒载 reentry 与切连接 reentry 都必须
 *   放行，裸闸（if (loadingIndices) return）会吞 setTarget 的新拍，不可行。
 * 锁面：行为锚（真 pinia store+双 promise 袋手控回包次序）+源码锁。消费侧 spec
 *   （dataThreeState/pickedIdxSync528 等）对 loadIndices 只有 stub 无源码锁，零触。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const setupStatusFn = vi.fn();
const clusterIndicesFn = vi.fn();
const clusterHealthFn = vi.fn();
const overviewFn = vi.fn();

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: (...a: any[]) => setupStatusFn(...a) },
      clusterIndices: (...a: any[]) => clusterIndicesFn(...a),
      clusterHealth: (...a: any[]) => clusterHealthFn(...a),
      overview: (...a: any[]) => overviewFn(...a),
    },
  };
});

import { useAppStore } from '../stores/app';

async function settle(n = 10) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const idx = (name: string) => ({ index: name, health: 'green', status: 'open', uuid: 'u-' + name, docs: 1, sizeBytes: 10 });

type Bag = { res: (v: any) => void; rej: (e: any) => void };
let bags: Bag[] = [];
function holdFetch() {
  bags = [];
  clusterIndicesFn.mockImplementation(() => new Promise<any>((res, rej) => { bags.push({ res, rej }); }));
}
function release(i: number, value: any) {
  const b = bags[i];
  if (!b) throw new Error('no pending bag #' + i);
  b.res(value);
}
function reject(i: number, e: any) {
  const b = bags[i];
  if (!b) throw new Error('no pending bag #' + i);
  b.rej(e);
}

function makeStore(): ReturnType<typeof useAppStore> {
  return useAppStore(createPinia());
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  bags = [];
  setupStatusFn.mockReset().mockResolvedValue({ hostVisible: true });
  clusterHealthFn.mockReset().mockResolvedValue({ status: 'green', version: '7.10.0', unassigned_shards: '0' });
  overviewFn.mockReset().mockResolvedValue({ self: 'http://a:9200' });
});

describe('949 app store loadIndices 世代守卫（切连接慢拍跨集群污染）', () => {
  it('慢拍旧集群回包丢弃：indices 与 target 不再语义分裂', { timeout: 15000 }, async () => {
    holdFetch();
    const store = makeStore();
    store.setTarget('a', 'ClusterA');   /* 拍 A（旧集群）入列 */
    await settle(4);                    /* 泵微任务：让旧拍先落到 fetch 在途（真实竞态时序） */
    store.setTarget('b', 'ClusterB');   /* 拍 B（新集群）入列 */
    await settle(4);
    expect(bags.length).toBe(2);
    release(1, [idx('b-idx')]);         /* 新集群拍先落 */
    await settle(6);
    expect(store.indices.map(i => i.index)).toEqual(['b-idx']);
    release(0, [idx('a-idx')]);         /* 旧集群拍迟到——不得写回 */
    await settle(6);
    expect(store.target).toBe('b');
    expect(store.indices.map(i => i.index), '旧集群清单不得覆写新集群上下文').toEqual(['b-idx']);
    expect(store.clusterOk).toBe(true);
  });

  it('旧拍失败丢弃：不污染新拍成功面（clusterOk/错误通知）', { timeout: 15000 }, async () => {
    holdFetch();
    const store = makeStore();
    store.setTarget('a', 'ClusterA');
    await settle(4);
    store.setTarget('b', 'ClusterB');
    await settle(4);
    release(1, [idx('b-idx')]);         /* 新集群拍成功 */
    await settle(6);
    reject(0, new Error('stale conn reset')); /* 旧集群拍失败迟到——必须整拍丢弃 */
    await settle(6);
    expect(store.clusterOk, '新集群成功面不得被旧拍失败改写').toBe(true);
    expect(store.notifyLog.filter(n => n.kind === 'error'), '零错误通知').toHaveLength(0);
    expect(store.indices.map(i => i.index)).toEqual(['b-idx']);
  });

  it('loadingIndices 闸只归最新拍收：旧拍 finally 提前复位不得放行在途', { timeout: 15000 }, async () => {
    holdFetch();
    const store = makeStore();
    store.setTarget('a', 'ClusterA');
    await settle(4);
    store.setTarget('b', 'ClusterB');
    await settle(4);
    release(0, [idx('a-idx')]);         /* 旧拍先落——在途新拍持有闸 */
    await settle(6);
    expect(store.loadingIndices, '新拍在途闸不得被旧拍 finally 收掉').toBe(true);
    release(1, [idx('b-idx')]);         /* 新拍落位后闸才收 */
    await settle(6);
    expect(store.loadingIndices).toBe(false);
    expect(store.indices.map(i => i.index)).toEqual(['b-idx']);
  });

  it('对照绿锚+源码锁：单拍落位/单拍失败报真/世代三处弃拍形态', { timeout: 15000 }, async () => {
    holdFetch();
    const store = makeStore();
    store.setTarget('a', 'ClusterA');
    await settle(4);
    expect(bags.length).toBe(1);
    release(0, [idx('a-idx')]);
    await settle(6);
    expect(store.indices.map(i => i.index), '单拍正常落位不回退').toEqual(['a-idx']);
    expect(store.loadingIndices).toBe(false);
    expect(store.clusterOk).toBe(true);

    clusterIndicesFn.mockRejectedValueOnce(new Error('real down'));
    store.setTarget('a', 'ClusterA');   /* 单拍真失败照常报真 */
    await settle(8);
    expect(store.clusterOk, '真实失败必须落「连接失败」态').toBe(false);
    expect(store.notifyLog.filter(n => n.kind === 'error').length, '真实失败必须通知').toBeGreaterThan(0);

    const src = readFileSync(join(__dirname, '../stores/app.ts'), 'utf8');
    const body = src.slice(src.indexOf('async function loadIndices()'), src.indexOf('function loadConns()'));
    expect(src, '世代计数器声明').toContain('let indicesSeq = 0;');
    expect(body, '拍序捕获前移到首个 await 之前').toContain('const seq = ++indicesSeq;');
    expect((body.match(/if \(seq !== indicesSeq\) return(?: false)?;/g) || []).length, '回包与失败两支弃拍锚')
      .toBeGreaterThanOrEqual(2);
    expect(body, 'loadingIndices 闸只归最新拍收').toContain('if (seq === indicesSeq) loadingIndices.value = false;');
  });
});
