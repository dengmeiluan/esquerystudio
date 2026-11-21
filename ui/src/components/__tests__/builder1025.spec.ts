/* 1025 批组件契约：CurrentIdxChip 所在行冻结注入（全站 26 视图推广）——
   ① 普通行：挂载后父行获得 .cic-row-sticky（theme.css 全局 sticky/实底/负边距）
   ② lr-bar-l（左右布局左段）：上提一层注入整行
   ③ 父已 sticky/fixed（如查询工作台页头）：跳过不叠加 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, type App } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import CurrentIdxChip from '../../components/CurrentIdxChip.vue';
import { useAppStore } from '../../stores/app';

const apps: App[] = [];
function mountIn(wrapperRender: () => ReturnType<typeof h>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: wrapperRender });
  apps.push(app);
  app.use(createPinia());
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] }));
  app.mount(host);
  const store = useAppStore();
  return { host, store };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); sessionStorage.clear();
  for (const a of apps.splice(0)) a.unmount();
});

describe('1025 行冻结注入', () => {
  it('普通行：父行获得注入类', async () => {
    const { store } = mountIn(() => h('div', { class: 'plain-row' }, [h(CurrentIdxChip)]));
    store.pickedIdx = 'demo-logs';
    await tick();
    const row = document.querySelector('.plain-row') as HTMLElement;
    expect(row.classList.contains('cic-row-sticky'), '注入到位').toBe(true);
  });

  it('lr-bar-l 左段：上提一层注入整行', async () => {
    const { store } = mountIn(() => h('div', { class: 'outer-bar lr-bar' }, [
      h('div', { class: 'seg-l lr-bar-l' }, [h(CurrentIdxChip)]),
      h('div', { class: 'seg-r lr-bar-r' }, 'right'),
    ]));
    store.pickedIdx = 'demo-logs';
    await tick();
    const outer = document.querySelector('.outer-bar') as HTMLElement;
    const seg = document.querySelector('.seg-l') as HTMLElement;
    expect(outer.classList.contains('cic-row-sticky'), '整行注入').toBe(true);
    expect(seg.classList.contains('cic-row-sticky'), '左段不被注入').toBe(false);
  });

  it('父已 sticky：跳过不叠加', async () => {
    const style = document.createElement('style');
    style.textContent = '.already-sticky { position: sticky; top: 0; }';
    document.head.appendChild(style);
    const { store } = mountIn(() => h('div', { class: 'already-sticky' }, [h(CurrentIdxChip)]));
    store.pickedIdx = 'demo-logs';
    await tick();
    const row = document.querySelector('.already-sticky') as HTMLElement;
    expect(row.classList.contains('cic-row-sticky'), '已冻结不叠加').toBe(false);
    style.remove();
  });

  it('未选索引整件不渲染（根 v-if 既有契约不破）', async () => {
    const { store } = mountIn(() => h('div', { class: 'plain-row' }, [h(CurrentIdxChip)]));
    store.pickedIdx = '';
    await tick();
    expect(document.querySelector('.cic')).toBeNull();
    expect((document.querySelector('.plain-row') as HTMLElement).classList.contains('cic-row-sticky')).toBe(false);
  });
});
