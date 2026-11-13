/**
 * ：TemplateGallery 首刀=G39+G40「代码区可达+动线落点」
 * （ 裁决表两 P2；G41 收藏卡面回显+G42 史志注释修正随刀）。
 * - G39：卡片代码区 max-height:130px 截断 18/23 卡（最长 32 行仅可见 ~7 行，铁律 F）
 *   → 单卡双态展开钮（ChevronDown↔ChevronUp 双态同钮，铁律 C；aria-expanded+键盘可达），
 *   展开态 .tg-card.open 覆盖 max-height:none（紧凑默认 130px 零触，flattenWave551 锁不破）。
 * - G40：toQuery 落点受 QueryHub mode 记忆扰动（上次停留沙盒 tab 时 DSL 钮落地
 *   #/search?mode=sandbox， 读数实证；QueryHub:194 无 ?mode= 时吃 lastMode 记忆）
 *   → 显式 query { mode: 'dsl' } 落点钉死（深链 mode 优先于记忆；toSandbox 对称件范式）。
 * - G41：收藏写侧（ templateFav）上线后卡面无回显、无取消通道
 *   → Star 双态（aria-pressed+fill 态+再点取消 removeFavorite，收藏交互闭环）。
 * - G42： §8.3 史志注释「关键词/分类进 URL」与实现不符（useScopedDraft=sessionStorage
 *   草稿，无深链）→ 注释如实化。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api', async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, api: { ...orig.api } };
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useAppStore } from '../stores/app';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);
let pushSpy: ReturnType<typeof vi.spyOn> | null = null;

async function mountView() {
  const View = (await import('../views/TemplateGalleryView.vue')).default;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, { path: '/search', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  pushSpy = vi.spyOn(router, 'push');
  const app = createApp({ render: () => h(View) });
  app.use(createPinia());
  app.use(router);
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
  return app;
}

async function flush(n = 4) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  pushSpy = null;
});

describe('G40：toQuery 显式 mode 落点钉死（铁律 B 位置/落点恒定）', () => {
  it('点 DSL 钮 → router.push 带 { path: /search, query: { mode: dsl } }，dsl.body 落 sessionStorage', async () => {
    await mountView();
    const dslBtns = [...host.querySelectorAll('.tg-c-actions button')].filter(b => (b.textContent || '').includes('DSL')) as HTMLButtonElement[];
    expect(dslBtns.length).toBe(23);
    dslBtns[0].click();
    await flush();
    expect(pushSpy, 'push 已调用').toHaveBeenCalled();
    const arg = pushSpy!.mock.calls[pushSpy!.mock.calls.length - 1][0] as any;
    expect(typeof arg).toBe('object');
    expect(arg.path).toBe('/search');
    expect(arg.query?.mode).toBe('dsl');
    expect(sessionStorage.getItem('esquerystudio.dsl.body'), 'DSL 体仍走 sessionStorage 契约').toBeTruthy();
  });

  it('源码锁：toSandbox 对称件原样（mode sandbox），两动线均显式带 mode', () => {
    const s = read('../views/TemplateGalleryView.vue');
    expect(s, 'toSandbox 对称件零触').toMatch(/toSandbox[\s\S]{0,200}mode: 'sandbox'/);
    /* 窗口 400（612-C1 余量 ≥50%：toQuery 体内含 708 史志注释三行） */
    expect(s, 'toQuery 显式 dsl').toMatch(/toQuery[\s\S]{0,400}mode: 'dsl'/);
    expect(s, '裸 push \x27/search\x27 退役').not.toMatch(/router\.push\(\x27\/search\x27\)/);
  });
});

describe('G39：卡片代码区单卡双态展开（铁律 F 信息可达+铁律 C 双态同钮）', () => {
  it('每卡有展开钮：点击 → 卡 .open + aria-expanded=true；再点收起', async () => {
    await mountView();
    const cards = [...host.querySelectorAll('.tg-card')] as HTMLElement[];
    const exBtns = [...host.querySelectorAll('button.tg-c-expand')] as HTMLButtonElement[];
    expect(exBtns.length).toBe(23);
    expect(cards[0].classList.contains('open')).toBe(false);
    expect(exBtns[0].getAttribute('aria-expanded')).toBe('false');
    exBtns[0].click();
    await flush();
    expect(cards[0].classList.contains('open'), '展开态类').toBe(true);
    expect(exBtns[0].getAttribute('aria-expanded')).toBe('true');
    exBtns[0].click();
    await flush();
    expect(cards[0].classList.contains('open'), '再点收起').toBe(false);
    expect(exBtns[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('源码锁：紧凑默认 130px 零触；展开态覆盖规则 max-height:none 在场', () => {
    const s = read('../views/TemplateGalleryView.vue');
    expect(s, '紧凑默认保留（flattenWave551 bg2 锁同块零触）').toMatch(/\.tg-c-code \{[^}]*max-height: 130px;/);
    expect(s, '展开覆盖规则').toMatch(/\.tg-card\.open \.tg-c-code \{[^}]*max-height: none;/);
  });
});

describe('G41：收藏 Star 双态回显+取消通道（templateFav 写侧契约不破）', () => {
  it('首击收藏（favorites +1、aria-pressed=true）；再击取消（回落、aria-pressed=false）', async () => {
    await mountView();
    const store = useAppStore();
    const starBtns = [...host.querySelectorAll('.tg-c-actions button[aria-pressed]')] as HTMLButtonElement[];
    expect(starBtns.length).toBe(23);
    expect(starBtns[0].getAttribute('aria-pressed')).toBe('false');
    starBtns[0].click();
    await flush();
    expect(store.favorites.length, '首击收藏').toBe(1);
    expect(store.favorites[0].kind).toBe('template');
    expect(starBtns[0].getAttribute('aria-pressed')).toBe('true');
    starBtns[0].click();
    await flush();
    expect(store.favorites.length, '再击取消收藏').toBe(0);
    expect(starBtns[0].getAttribute('aria-pressed')).toBe('false');
  });
});

describe('G42：史志注释如实化（kw/cat 实为 sessionStorage 草稿，无深链）', () => {
  it('源码锁：失实注释退役，如实注释在场', () => {
    const s = read('../views/TemplateGalleryView.vue');
    expect(s, '「进 URL」失实表述退役').not.toContain('关键词/分类进 URL');
    /* 855 清洗随迁：原锁「§8.3」锚字样（批史前缀已全仓清洗），改锁如实注释本体
       （URL 化未实施+sessionStorage 草稿说明），锁语义不变 */
    expect(s, '如实注释放线（sessionStorage 草稿+无深链说明）').toMatch(/URL 化未实施[\s\S]{0,80}sessionStorage/);
  });
});
