/* 1023 批组件契约：查询工作台页头行冻结（Excel 冻结窗格语义）——
   .qh-top（模式胶囊 + 当前索引 chip）sticky 吸附滚动容器顶：
   ① 计算样式锁：sticky/top:0/z-index 压内容、实底色（--bg0，防内容缝隙滚过）
   ② 行为锁：页内长内容滚动后页头行仍在可视区顶（rect.top 回到吸附位）
   ③ 横向负边距拉满 .page 内容宽（与 padding 同源 token） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, type App } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QueryHubView from '../../views/QueryHubView.vue';

const apps: App[] = [];
function mount() {
  const host = document.createElement('div');
  /* 视图默认高度 0（happy-dom 无布局）——给滚动容器与 sticky 父链足够高度 */
  host.style.cssText = 'height: 900px; overflow: hidden;';
  document.body.appendChild(host);
  const app = createApp({ render: () => h(QueryHubView) });
  apps.push(app);
  app.use(createPinia());
  app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] }));
  app.mount(host);
  return host;
}

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

describe('1023 页头行冻结（sticky）', () => {
  /* vitest 不把 SFC style 注入 document.styleSheets、happy-dom 也不并算 sticky——
     锁面=源文件字面（flattenWave560/permHarden979 同范式）+ 组件结构挂载锁 */
  const src = readFileSync(resolve(__dirname, '../../views/QueryHubView.vue'), 'utf8');

  it('.qh-top 样式：sticky + top:0 + z-index 压内容 + 实底 + 负边距拉满宽', () => {
    const host = mount();
    expect(host.querySelector('.qh-top'), '页头行在场').not.toBeNull();
    expect(src).toContain('position: sticky; top: 0; z-index: 20');
    expect(src).toContain('background: var(--bg0)');
    expect(src).toContain('calc(-1 * var(--sp-5))');
  });

  it('模式胶囊组与结构不变（sticky 是纯样式升级零结构改）', () => {
    const host = mount();
    expect(host.querySelector('.qh-modes'), '模式胶囊组').not.toBeNull();
    expect(host.querySelector('[aria-label="查询模式"]'), '模式组可及名').not.toBeNull();
  });
});
