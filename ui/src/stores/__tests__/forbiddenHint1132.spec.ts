/**
 * 1132：403 提示必须说对「缺什么」——环境限制 ≠ 页面授权。
 *
 * 后端有两种 403 会带 `page`：
 * ① `PAGE_DENIED`：账号没有被授予该页面 → 找管理员勾菜单；
 * ② `ENV_PAGE_DENIED`：页面授权有，但当前连接的 env 模板没开放该页 →
 *    找管理员勾菜单**白跑一趟**，真正要做的是调整连接的 env 模板或改连别的环境。
 *
 * 两者都带 page 字段，若只按 `page` 分支渲染，②会被写成①的文案——用户按提示去申请，
 * 申请完依然被拒，属于「提示与原因不一致」。
 *
 * 观测方式：app store 的 notify 会把消息写入 notifyLog（并持久化），直接断言日志内容，
 * 不去 mock notify——监听器在模块闭包里调用它，替换 store 上的属性无法拦截。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAppStore } from '../app';

function fire(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('esquerystudio:forbidden', { detail }));
}

function lastError(): string {
  const store = useAppStore();
  const hit = store.notifyLog.find(n => n.kind === 'error');
  return hit ? hit.msg : '';
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  /* store 实例化时才会挂上 forbidden 监听器 */
  useAppStore();
});

describe('1132 403 提示按原因区分', () => {
  it('ENV_PAGE_DENIED 讲环境模板，不讲「去申请页面权限」', () => {
    fire({
      method: 'POST', path: '/internal/es/index/cluster/raw',
      page: 'rest', denied: 'ENV_PAGE_DENIED',
      message: '当前连接环境未开放该页面',
    });
    const msg = lastError();
    expect(msg, '环境拒绝必须落通知').toBeTruthy();
    expect(msg).toContain('运行环境');
    expect(msg).toContain('env 模板');
    expect(msg, '不能把环境限制说成账号没授权').not.toContain('暂无「rest」页面权限');
  });

  it('PAGE_DENIED 仍讲页面授权（不被环境文案覆盖）', () => {
    fire({
      method: 'POST', path: '/internal/es/index/cluster/raw',
      page: 'rest', denied: 'PAGE_DENIED',
    });
    const msg = lastError();
    expect(msg).toContain('暂无「rest」页面权限');
    expect(msg).not.toContain('env 模板');
  });

  it('客户端硬门拒绝讲「请求未发出」', () => {
    fire({ method: 'POST', path: '/internal/es/index/cluster/raw', denied: 'CLIENT_WRITE_DENIED' });
    expect(lastError()).toContain('客户端拦截');
  });

  it('读请求拒绝保持静默（不刷通知历史）', () => {
    fire({ method: 'GET', path: '/internal/es/index/cluster/indices', page: 'indices', denied: 'PAGE_DENIED' });
    expect(lastError(), '读拒绝不该弹').toBe('');
  });
});
