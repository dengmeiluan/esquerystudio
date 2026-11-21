/**
 * 四百九十批：useUrlState 行为单测——URL 深链核心（读 location.hash 非
 * route.query 的特殊机制）。三契约：初值读 hash query/状态变化写回 hash
 * （默认值时删除键）/键删除后 URL 干净。useRoute 需组件上下文，挂载式测试。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, defineComponent, ref, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useUrlState } from '../urlState';

function setHash(qs: string) {
  (window as any).location.hash = qs;
}
function getHash(): string {
  return (window as any).location.hash || '';
}

const apps: ReturnType<typeof createApp>[] = [];

/** 在组件 setup 内调用 useUrlState（useRoute 注入需要），暴露 ref 供断言 */
async function mountWith(key: string, defVal = '') {
  const exposed: Record<string, any> = {};
  const Host = defineComponent({
    setup() {
      const state = useUrlState(key, defVal);
      exposed.state = state;
      return () => h('div', String(state.value));
    },
  });
  const app = createApp(Host);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
  app.use(router);
  apps.push(app);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await nextTick();
  return { host, state: exposed.state as ref };
}
type ref = { value: string };
afterEach(() => { apps.splice(0).forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); document.body.innerHTML = ''; });

describe('useUrlState 行为契约（490 批）', () => {
  it('初值读 hash query；hash 无键回落默认且不写回', async () => {
    setHash('#/indices?idx=my-index&x=1');
    const { state } = await mountWith('idx');
    expect(state.value).toBe('my-index');
    expect(getHash()).toContain('idx=my-index');
  });

  it('hash 无键回落默认，默认值不写回 URL', async () => {
    setHash('#/indices');
    const { state } = await mountWith('tab', 'overview');
    expect(state.value).toBe('overview');
    await nextTick();
    expect(getHash(), '默认值不写回（URL 干净）').not.toContain('tab=');
  });

  it('状态变化写回 hash；设回默认值时删除键', async () => {
    setHash('#/indices');
    const { state } = await mountWith('tab', 'overview');
    state.value = 'shards';
    await nextTick();
    expect(getHash()).toContain('tab=shards');
    state.value = 'overview';
    await nextTick();
    expect(getHash(), '回到默认值时键删除').not.toContain('tab=');
  });
});
