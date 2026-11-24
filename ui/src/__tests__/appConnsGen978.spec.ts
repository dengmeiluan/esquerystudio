/**
 * 978 批：app store loadConns 世代守卫（连接清单乱序回落链误触发根治）。
 *
 * 真矿：loadConns 无单飞也无世代面，触发通道有六个以上（App 启动竞态链/
 *   ClusterSwitcher 挂载与增删连接后/LoginOverlay 登录后/SqlConsole·Xmigrate
 *   挂载懒载口），任两拍并发且先发拍回包迟到时：①旧快照整体覆写 conns（新保存
 *   的连接从清单消失）；②回落链在陈旧快照上误触发——目标连接不在旧快照里即被
 *   判「已删除」，强制切回宿主/首连接 + 弹「目标集群连接已删除」假警告 +
 *   连锁 pick('')/loadIndices 清场；③旧拍 catch 的 conns=[[]] 兜底把新拍成功
 *   清单清空。
 *   修法口径=世代守卫（loadIndices indicesSeq 同构）：拍序捕获前移到首个 await
 *   之前，回包与失败两支先核 seq，迟到拍整拍丢弃（不写清单、不走回落链）；
 *   最新拍的单拍成功/失败语义保持不变。
 * 锁面：行为锚（真 pinia store+双 promise 袋手控回包次序，949-C1 微任务泵时序）
 *   +源码锁。appIndicesGen949 源码切片以「function loadConns()」为终点锚，
 *   本批不得改动 loadIndices 体与该签名。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const setupStatusFn = vi.fn();
const clustersListFn = vi.fn();
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
      clustersList: (...a: any[]) => clustersListFn(...a),
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

const conn = (id: string) => ({ id, name: 'Conn-' + id, kind: 'remote' });

type Bag = { res: (v: any) => void; rej: (e: any) => void };
let bags: Bag[] = [];
function holdList() {
  bags = [];
  clustersListFn.mockImplementation(() => new Promise<any>((res, rej) => { bags.push({ res, rej }); }));
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
  clustersListFn.mockReset().mockResolvedValue([]);
  clusterIndicesFn.mockReset().mockResolvedValue([]);
  clusterHealthFn.mockReset().mockResolvedValue({ status: 'green', version: '7.10.0', unassigned_shards: '0' });
  overviewFn.mockReset().mockResolvedValue({ self: 'http://a:9200' });
});

describe('978 app store loadConns 世代守卫（乱序回落链误触发）', () => {
  it('旧拍迟到整拍丢弃：清单不被旧快照覆写、回落链不误触发', { timeout: 15000 }, async () => {
    holdList();
    const store = makeStore();
    store.loadConns();                  /* 拍 A（旧）入列 */
    await settle(4);                    /* 泵微任务：让旧拍先落到 fetch 在途 */
    store.loadConns();                  /* 拍 B（新）入列 */
    await settle(4);
    expect(bags.length).toBe(2);
    release(1, [conn('c-new')]);        /* 新拍先落：清单含新连接 */
    await settle(6);
    expect(store.conns.map(c => c.id)).toEqual(['c-new']);
    store.setTarget('c-new', 'Conn-c-new');  /* 用户钉选新连接（真实动线） */
    await settle(4);
    release(0, [conn('c-old')]);        /* 旧拍迟到且快照里没有 c-new */
    await settle(6);
    expect(store.conns.map(c => c.id), '旧快照不得覆写新清单').toEqual(['c-new']);
    expect(store.target, '目标不得被旧拍打回宿主').toBe('c-new');
    expect(
      store.notifyLog.filter(n => n.kind === 'warning' && n.msg.includes('已删除')),
      '零「连接已删除」假警告',
    ).toHaveLength(0);
  });

  it('旧拍失败丢弃：conns 兜底清空不得吃掉新拍成功清单', { timeout: 15000 }, async () => {
    holdList();
    const store = makeStore();
    store.loadConns();
    await settle(4);
    store.loadConns();
    await settle(4);
    release(1, [conn('c-new')]);
    await settle(6);
    reject(0, new Error('stale conn reset')); /* 旧拍失败迟到——必须整拍丢弃 */
    await settle(6);
    expect(store.conns.map(c => c.id), '新拍成功清单不得被旧拍失败清空').toEqual(['c-new']);
  });

  it('对照绿锚：单拍成功落位/单拍失败清空照常（最新拍语义不变）', { timeout: 15000 }, async () => {
    holdList();
    const store = makeStore();
    store.loadConns();
    await settle(4);
    expect(bags.length).toBe(1);
    release(0, [conn('c-a'), conn('c-b')]);
    await settle(6);
    expect(store.conns.map(c => c.id), '单拍正常落位').toEqual(['c-a', 'c-b']);

    clustersListFn.mockRejectedValueOnce(new Error('real down'));
    store.loadConns();
    await settle(8);
    /* 失败分支语义已收编为「保留上次清单 + 告警」：清空会让用户无法区分
       网络/后端故障、连接被删与自己被撤权，与 loadIndices 同范式。 */
    expect(store.conns.map(c => c.id), '最新拍真实失败保留上次清单').toEqual(['c-a', 'c-b']);
  });

  it('对照绿锚：目标档案被删回落照走（最新拍内语义保持）', { timeout: 15000 }, async () => {
    setupStatusFn.mockResolvedValue({ hostVisible: false }); /* 宿主隐藏档：回落首个可见连接分支 */
    holdList();
    const store = makeStore();
    /* 直接置档复现「目标已被删」：target 在档而清单里没有 */
    (store as any).target = 'c-gone';
    (store as any).targetName = 'Gone';
    store.loadConns();
    await settle(8);
    release(0, [conn('c-alive')]);
    await settle(6);
    expect(store.target, '档案确被删时回落首个可见连接').toBe('c-alive');
    /* 回落全静默（1030 批裁决：后台目标纠正不弹不记——「已删除」对权限场景是
       错误表述，顶栏切换器如实呈现回落结果）；回落行为本身照走。 */
    expect(
      store.notifyLog.filter(n => n.kind === 'warning' && n.msg.includes('已删除')),
      '回落零警告（后台自愈静默裁决）',
    ).toHaveLength(0);
  });

  it('源码锁：世代计数器声明+拍序捕获前移+回包与失败两支弃拍锚', { timeout: 15000 }, async () => {
    const src = readFileSync(join(__dirname, '../stores/app.ts'), 'utf8');
    expect(src, '世代计数器声明').toContain('let connsSeq = 0;');
    const body = src.slice(src.indexOf('async function loadConns()'), src.indexOf('function setTarget('));
    expect(body, '拍序捕获前移到首个 await 之前').toContain('const seq = ++connsSeq;');
    expect(body.indexOf('const seq = ++connsSeq;'), '拍序捕获在 ensureSetup 之前')
      .toBeLessThan(body.indexOf('await ensureSetup()'));
    expect((body.match(/if \(seq !== connsSeq\) return;/g) || []).length, '回包与失败两支弃拍锚')
      .toBeGreaterThanOrEqual(2);
  });
});
