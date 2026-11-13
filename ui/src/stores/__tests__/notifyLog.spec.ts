import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from '../app';

/* R80：通知历史契约锁——toast 转瞬即逝，历史面板（NotifyCenter）是错过失败提醒的唯一回看途径。
   锁死：留档/上限/未读口径/已读/清空/跨 store 重建持久化。 */

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('notifyLog 通知历史（R80）', () => {
  it('notify 即留档，最新在前，kind/msg 原样', () => {
    const store = useAppStore();
    store.notify('success', '第一条');
    store.notify('warning', '第二条');
    expect(store.notifyLog).toHaveLength(2);
    expect(store.notifyLog[0]).toMatchObject({ kind: 'warning', msg: '第二条' });
    expect(store.notifyLog[1]).toMatchObject({ kind: 'success', msg: '第一条' });
  });

  it('上限 50 条，最旧被挤出', () => {
    const store = useAppStore();
    for (let i = 1; i <= 55; i++) store.notify('info', 'm' + i);
    expect(store.notifyLog).toHaveLength(50);
    expect(store.notifyLog[0].msg).toBe('m55');
    expect(store.notifyLog.some(n => n.msg === 'm5')).toBe(false);
  });

  it('未读只计 error/warning，success/info 不亮红点', () => {
    const store = useAppStore();
    store.notify('success', 'ok');
    store.notify('info', 'fyi');
    expect(store.notifyUnread).toBe(0);
    store.notify('error', 'boom');
    store.notify('warning', 'careful');
    expect(store.notifyUnread).toBe(2);
  });

  it('markNotifySeen 后未读清零，新错误再计', () => {
    vi.useFakeTimers();
    try {
      const store = useAppStore();
      store.notify('error', 'boom');
      expect(store.notifyUnread).toBe(1);
      store.markNotifySeen();
      expect(store.notifyUnread).toBe(0);
      vi.advanceTimersByTime(1000); // seen 时间戳按毫秒比较，推进后新通知必然在其后
      store.notify('error', 'boom2');
      expect(store.notifyUnread).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('清空后历史与存储都干净', () => {
    const store = useAppStore();
    store.notify('error', 'boom');
    store.clearNotifyLog();
    expect(store.notifyLog).toHaveLength(0);
    expect(localStorage.getItem('esquerystudio.notify.log')).toBeNull();
  });

  it('localStorage 持久化，重建 store 后历史与已读位都恢复', () => {
    const store = useAppStore();
    store.notify('error', 'boom');
    store.notify('success', 'ok');
    store.markNotifySeen();
    setActivePinia(createPinia());
    const fresh = useAppStore();
    expect(fresh.notifyLog).toHaveLength(2);
    expect(fresh.notifyLog[0].msg).toBe('ok');
    expect(fresh.notifyUnread).toBe(0); // 已读位一并持久化，刷新不复燃红点
  });

  it('坏值静默回落空历史', () => {
    localStorage.setItem('esquerystudio.notify.log', '{oops');
    const store = useAppStore();
    expect(store.notifyLog).toEqual([]);
  });

  /* R85：起因——服务重启期 inspect 轮试风暴，同一条「inspect 失败: Failed to fetch」
     刷满整个通知历史面板，真正有价值的通知被挤出 50 条上限 */
  it('R85：连发同类消息历史聚合为一条 ×N，不同文案不聚合', () => {
    const store = useAppStore();
    for (let i = 0; i < 5; i++) store.notify('error', 'boom');
    expect(store.notifyLog).toHaveLength(1);
    expect(store.notifyLog[0].count).toBe(5);
    store.notify('error', 'other');
    expect(store.notifyLog).toHaveLength(2);
    expect(store.notifyLog[0].msg).toBe('other');
    expect(store.notifyLog[0].count).toBeUndefined();
    /* 中间隔了别的消息后同文案再来，新开一条而非跨条目合并（时序语义不能乱） */
    store.notify('error', 'boom');
    expect(store.notifyLog).toHaveLength(3);
    /* 聚合计数一并持久化 */
    const raw = JSON.parse(localStorage.getItem('esquerystudio.notify.log')!);
    expect(raw[2].count).toBe(5);
  });

  /* R86：风暴从何时开始、持续多久是排障关键线索——聚合只更新 ts 会把起点吃掉 */
  it('R86：聚合时首见时间 firstTs 留住，ts 滑到最近一次', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000000);
      const store = useAppStore();
      store.notify('error', 'boom');
      const born = store.notifyLog[0].ts;
      expect(store.notifyLog[0].firstTs).toBeUndefined(); // 单条无聚合，不多存字段
      vi.advanceTimersByTime(60000);
      store.notify('error', 'boom');
      vi.advanceTimersByTime(60000);
      store.notify('error', 'boom');
      const head = store.notifyLog[0];
      expect(head.count).toBe(3);
      expect(head.firstTs).toBe(born);       // 风暴起点可追溯
      expect(head.ts).toBe(born + 120000);   // 最近一次保持鲜活
      /* firstTs 一并持久化，重建 store 后时间线证据不丢 */
      const raw = JSON.parse(localStorage.getItem('esquerystudio.notify.log')!);
      expect(raw[0].firstTs).toBe(born);
    } finally {
      vi.useRealTimers();
    }
  });

  it('R85：异常 toast 窗口期内只弹一次，窗口过后再弹；success 不抑制', () => {
    vi.useFakeTimers();
    try {
      const store = useAppStore();
      store.notify('error', 'boom');
      store.notify('error', 'boom');
      store.notify('error', 'boom');
      expect(store.notifyQueue).toHaveLength(1); // 风暴只轰炸一次
      vi.advanceTimersByTime(8001);
      store.notify('error', 'boom');
      expect(store.notifyQueue).toHaveLength(2); // 窗口过后允许再提醒
      /* 用户连续复制的成功反馈不能静音，否则误导“没生效” */
      store.notify('success', '已复制');
      store.notify('success', '已复制');
      expect(store.notifyQueue.filter(n => n.kind === 'success')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
