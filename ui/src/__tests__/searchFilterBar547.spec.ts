/**
 * 五百四十七批·轨4（工蚁）：任务 4 页头过滤胶囊组件化 SearchFilterBar · 契约备案。
 *
 * 三处同场景（页头过滤输入胶囊）：WatcherView .wt-search-head / FavoritesView .fv-search /
 * TemplateGalleryView .tg-search——三份手写同构（Search 图标 + 裸 input + 右挂附加件）。
 * 新建 components/SearchFilterBar.vue 统一件：
 *   props { modelValue, placeholder, inputClass? } + emit update:modelValue + 默认插槽
 *   （右挂 HitNav/全选 label 附加件）+ 根元素 v-bind="$attrs"（class 透传保 wt-search-head/
 *   fv-search/tg-search 落位）+ Search 图标内置 + Esc 清空内建（update:modelValue('')，
 *   三消费方原行为等价；Enter/HitNav 接线留在视图侧走 keydown 冒泡，接线不动）。
 * 胶囊形态统一为 wt/fv 同值（bg:var(--panel) + border-subtle + radius 8px）；
 * tg 值漂移（bg1/line/6px）归一，min-width:320px → min(320px,100%)；
 * padding/gap 留在视图落位类（「padding 对齐现行」，高度结构语义零变动）。
 * 异形不收（豁免备案）：IndexHubView .ih-search（Esc 两级语义）/BrowserView .bw-search/
 * SideNav .nav-search/ResultTable .rt-qsearch。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const sfb = read('../components/SearchFilterBar.vue');
const wt = read('../views/WatcherView.vue');
const fv = read('../views/FavoritesView.vue');
const tg = read('../views/TemplateGalleryView.vue');

/* ═══════════ 组件源码锚 ═══════════ */

describe('五百四十七批：SearchFilterBar 统一件（组件源码锚）', () => {
  it('props/emit/attrs 透传/图标内置/Esc 内建 契约在场', () => {
    expect(sfb, 'v-model 契约：modelValue prop').toMatch(/modelValue:/);
    expect(sfb, 'placeholder prop').toMatch(/placeholder:/);
    expect(sfb, 'inputClass 可选 prop').toMatch(/inputClass\?/);
    expect(sfb, 'update:modelValue emit').toMatch(/update:modelValue/);
    expect(sfb, '根元素 class 透传（inheritAttrs 关闭 + 显式 v-bind）')
      .toMatch(/inheritAttrs: false/);
    expect(sfb).toMatch(/v-bind="\$attrs"/);
    expect(sfb, 'Search 图标内置').toMatch(/<Search :size="12"/);
    expect(sfb, 'Esc 清空内建（三消费方原行为等价承接）').toMatch(/@keydown\.esc\.prevent/);
    expect(sfb, 'Enter 由组件 input 定向转 emit（不走根冒泡：HitNav 按钮键击不误触）')
      .toMatch(/@keydown\.enter\.prevent="\$emit\('enter', \$event\)"/);
    expect(sfb, '默认插槽（右挂 HitNav/全选附加件）').toMatch(/<slot \/>/);
  });

  it('胶囊形态统一为 wt/fv 同值：panel 底 + border-subtle + radius 8px（gap/padding 留视图）', () => {
    expect(sfb, '统一底色').toMatch(/\.sfb \{[^}]*background: var\(--panel\);/);
    expect(sfb, '统一弱边').toMatch(/\.sfb \{[^}]*border: 1px solid var\(--border-subtle\);/);
    expect(sfb, '统一 8px 圆角（654 批同步更新：8px→var(--r-m) 阶梯等值合并）').toMatch(/\.sfb \{[^}]*border-radius: var\(--r-m\);/);
    expect(sfb, 'input 裸形态内建（flex:1 透明无边框）').toMatch(/\.sfb-i \{[^}]*flex: 1;/);
  });

  it('挂载行为锁：v-model 双向 / Esc 清空 / 插槽渲染 / class 透传落根', async () => {
    const { default: SearchFilterBar } = await import('../components/SearchFilterBar.vue');
    let kw = 'abc';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () => h(SearchFilterBar as any, {
        modelValue: kw,
        'onUpdate:modelValue': (v: string) => { kw = v; },
        placeholder: '过滤 watch id / trigger / metadata…',
        class: 'wt-search-head',
        inputClass: 'wt-search-i',
        onKeydown: () => { /* Enter 冒泡落点（视图侧接线同路径） */ },
      }, { default: () => h('span', { class: 'sfb-slot-probe' }, 'HITNAV') }),
    });
    app.mount(host);
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    const root = host.firstElementChild as HTMLElement;
    expect(root?.className, 'class 透传落根（wt-search-head 落位保住）').toContain('wt-search-head');
    const inp = host.querySelector('input.wt-search-i') as HTMLInputElement;
    expect(inp, 'inputClass 落 input').toBeTruthy();
    expect(inp?.placeholder).toBe('过滤 watch id / trigger / metadata…');
    expect(host.querySelector('.sfb-slot-probe')?.textContent, '默认插槽渲染').toBe('HITNAV');
    inp.value = 'xyz';
    inp.dispatchEvent(new Event('input'));
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(kw, 'input → update:modelValue 双向').toBe('xyz');
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
    expect(kw, 'Esc 内建清空（原 kw=\'\' 行为等价）').toBe('');
    app.unmount();
  });
});

/* ═══════════ 三视图改用（类名/placeholder/行为逐字保留——挂载型 spec 纪律） ═══════════ */

describe('五百四十七批：三视图改用（placeholder/类名/接线逐字保留）', () => {
  it('WatcherView：wt-search-head 落位透传 + placeholder 逐字 + Enter/HitNav 接线不动', () => {
    expect(wt).toMatch(/<SearchFilterBar v-model="kw" class="wt-search-head" input-class="wt-search-i" placeholder="过滤 watch id \/ trigger \/ metadata…" @enter="onHitKey">/);
    expect(wt, 'HitNav 附加件走默认插槽').toMatch(/<SearchFilterBar[\s\S]*?<HitNav :count="filteredWatches\.length"[\s\S]*?<\/SearchFilterBar>/);
    expect(wt, '旧手写胶囊退役').not.toMatch(/<input class="wt-search-i"/);
    expect(wt, 'Enter 接线保留（组件 enter 事件承接 onHitKey）').toMatch(/@enter="onHitKey"/);
  });

  it('FavoritesView：fv-search 落位透传 + placeholder 逐字 + 全选 label 附加件走插槽', () => {
    expect(fv).toMatch(/<SearchFilterBar v-model="kw" class="fv-search" input-class="fv-search-i" placeholder="搜索标题 \/ 副标题 \/ tag…" @enter="onHitKey">/);
    expect(fv, '全选 label 在插槽内').toMatch(/<SearchFilterBar[\s\S]*?class="fv-checkall"[\s\S]*?<\/SearchFilterBar>/);
    expect(fv, '旧手写胶囊退役').not.toMatch(/<input class="fv-search-i"/);
  });

  it('TemplateGalleryView：tg-search 落位透传 + placeholder 逐字 + 值漂移归一（min 钳制）', () => {
    expect(tg).toMatch(/<SearchFilterBar v-model="kw" class="tg-search" placeholder="搜索：match \/ date \/ agg \/ 中文关键词都可"/);
    expect(tg, '旧手写胶囊退役').not.toMatch(/<div class="tg-search">/);
    expect(tg, '值漂移（bg1/line/6px）归一：本地壳三件套退役').not.toMatch(/\.tg-search \{[^}]*background/);
    expect(tg, '裸 min-width:320px 不回流').not.toMatch(/min-width: 320px/);
    expect(tg, 'min(320px,100%) 钳制在场').toMatch(/min-width: min\(320px, 100%\)/);
    /* 挂载型纪律：.tg-search input DOM 形态保住（qualityThreeState G6 消费） */
    expect(tg, 'tg-search 落位类在组件根（input 后代选择器依赖）').toMatch(/class="tg-search"/);
  });

  it('异形不收（豁免备案）：四异形过滤框不在改用域', () => {
    expect(read('../views/IndexHubView.vue'), 'ih-search Esc 两级语义，异形豁免').toMatch(/ih-search/);
    expect(read('../views/BrowserView.vue'), 'bw-search 异形豁免').toMatch(/bw-search/);
    expect(read('../components/SideNav.vue'), 'nav-search 异形豁免').toMatch(/nav-search/);
    expect(read('../components/ResultTable.vue'), 'rt-qsearch 异形豁免').toMatch(/rt-qsearch/);
  });
});
