import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick, type Ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { useIdxState } from '../urlState';
import { useAppStore } from '../../stores/app';

/* R60：全局工作索引单一真相的契约锁。
   此前 20 个「目标索引」语义视图各自拿 useUrlState('idx')，深链打开顶栏不同步、
   视图内切换不上行——这里锁死 useIdxState 的三条契约，防回退。
   R61：追加 follow 下行跟随契约（白名单 opt-in + guard 可暂停）。 */

async function mountWith(hash: string, opts?: Parameters<typeof useIdxState>[0]) {
  location.hash = hash;
  let state!: Ref<string>;
  let store!: ReturnType<typeof useAppStore>;
  const Comp = defineComponent({
    setup() {
      store = useAppStore();
      state = useIdxState(opts);
      return () => h('div');
    },
  });
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: Comp }],
  });
  const app = createApp(Comp);
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  app.mount(document.createElement('div'));
  return { state, store, app };
}

beforeEach(() => {
  localStorage.clear();
  location.hash = '';
});

describe('useIdxState 全局工作索引单一真相（R60）', () => {
  it('深链 ?idx= 显式指定 → 上行 store.pick（分享链接打开即全站就位）', async () => {
    const { store, state, app } = await mountWith('#/lab?idx=deep-link-idx');
    expect(state.value).toBe('deep-link-idx');
    expect(store.pickedIdx).toBe('deep-link-idx');
    app.unmount();
  });

  it('无 ?idx= 时默认继承全局 picked，不额外写 URL', async () => {
    localStorage.setItem('es_picked', 'global-picked');
    const { store, state, app } = await mountWith('#/lab');
    expect(state.value).toBe('global-picked');
    expect(store.pickedIdx).toBe('global-picked');
    expect(location.hash).not.toContain('idx=');
    app.unmount();
  });

  it('视图内切换索引 → 上行 store.pick + 写回 URL（顶栏即时跟随，可分享可重入）', async () => {
    localStorage.setItem('es_picked', 'old-idx');
    const { store, state, app } = await mountWith('#/lab');
    state.value = 'new-idx';
    await nextTick();
    expect(store.pickedIdx).toBe('new-idx');
    expect(location.hash).toContain('idx=new-idx');
    app.unmount();
  });

  /* #86 五轮：上面 :49「无 ?idx= 默认不写 URL」那条**恒真**——它的 state 从初始化后
     从不改变，writeBack 只在 watch(state) 里触发，故该用例走不到写 URL 的路径。
     实测：去掉「默认值不占 URL」守卫（v!==defVal 改成 v），全仓 625 条无一变红。
     整条「默认值不占 URL」契约在测试层无看守 —— 补一条真正触发 writeBack 的用例：
     深链带 idx=X 进入（URL 已含 idx=X），再把 state 改回等于 picked 的默认值，
     此时 writeBack 触发且 v===defVal，URL 必须清掉 idx=。 */
  it('改回默认值时 URL 清掉 idx=（默认值不占 URL，经真实 writeBack 路径）', async () => {
    localStorage.setItem('es_picked', 'picked-def');
    const { state, app } = await mountWith('#/lab?idx=explicit');
    expect(location.hash).toContain('idx=explicit'); // 深链进入时 URL 有值
    state.value = 'picked-def';                       // 改回 == defVal
    await nextTick();
    expect(location.hash).not.toContain('idx=');       // writeBack 走 delete 分支
    app.unmount();
  });

  it('清空目标（置空）不清全局 picked（避免误伤别处的工作现场）', async () => {
    localStorage.setItem('es_picked', 'keep-me');
    const { store, state, app } = await mountWith('#/lab');
    state.value = '';
    await nextTick();
    expect(store.pickedIdx).toBe('keep-me');
    app.unmount();
  });

  it('R61 follow 视图：顶栏切换 → 视图与 URL 即时跟随', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    const { store, state, app } = await mountWith('#/lab', { follow: true });
    store.pick('idx-b');
    await nextTick();
    expect(state.value).toBe('idx-b');
    expect(location.hash).toContain('idx=idx-b');
    app.unmount();
  });

  it('R61 follow guard 返回 false（如 PIT 会话中）→ 不跟随，会话目标不被顶栏冲掉', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    const { store, state, app } = await mountWith('#/lab', { follow: () => false });
    store.pick('idx-b');
    await nextTick();
    expect(state.value).toBe('idx-a');
    app.unmount();
  });

  it('R61 默认不跟随（表单/写类视图安全：防 A 的表单保存到 B）', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    const { store, state, app } = await mountWith('#/lab');
    store.pick('idx-b');
    await nextTick();
    expect(state.value).toBe('idx-a');
    app.unmount();
  });
});
