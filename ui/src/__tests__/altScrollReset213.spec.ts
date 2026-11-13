/**
 * 2.1.3：JSON/Tree 顶部回位（实报「JSON 从 }, "hits": 开始，顶部信封行不见」）。
 *
 * 根因：alt 视图真正滚动的是宿主包裹层（.dq-json-wrap/.ih-json-wrap/.qrt-alt-body
 * 的 scroll-y），AltHitsViews 的 <pre>/树体自身不滚。552 批的「滚动位归零」打在
 * preEl.scrollTop 上——对包裹层是静默 no-op，切视图/重跑后仍停在上次阅读位置。
 * 修法：归零打 preEl/treeEl.parentElement（=包裹层），DQ/IH/QRT 三处接线。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, ref } from 'vue';
import AltHitsViews from '../components/AltHitsViews.vue';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

/* ═══════════ 行为锁：组件根挂在宿主滚动包裹层里，归零父级即归零真实滚动容器 ═══════════ */

const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; document.body.innerHTML = ''; });

async function mountInScrollWrap(props: Record<string, unknown>) {
  const wrap = document.createElement('div');
  wrap.style.overflowY = 'auto';
  wrap.style.height = '60px';
  document.body.appendChild(wrap);
  const box = ref<any>(null);
  const app = createApp({ render: () => h(AltHitsViews as any, { ...props, ref: box }) });
  apps.push(app);
  app.mount(wrap);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return { wrap, box };
}

describe('2.1.3 alt 视图滚动位归零打在包裹层（行为锁）', () => {
  it('json：preEl.parentElement 就是宿主滚动包裹层，归零父级生效', async () => {
    const { wrap, box } = await mountInScrollWrap({ view: 'json', jsonHtml: '<p>' + 'x'.repeat(400) + '</p>' });
    const pre = wrap.querySelector('pre.json-view') as HTMLElement;
    expect(pre, 'pre.json-view 在场').toBeTruthy();
    expect(box.value.preEl, 'preEl expose').toBe(pre);
    expect(pre.parentElement, 'pre 的父级=宿主 scroll-y 包裹层').toBe(wrap);
    wrap.scrollTop = 240;
    expect(wrap.scrollTop).toBe(240);
    pre.parentElement!.scrollTop = 0;
    expect(wrap.scrollTop, '归零父级即归零真实滚动容器').toBe(0);
  });

  it('tree：treeEl.parentElement 是同一包裹层（tree 档归零同判据）', async () => {
    const { wrap, box } = await mountInScrollWrap({ view: 'tree', treeData: [{ _id: 'a', name: 'alpha' }] });
    const tree = wrap.querySelector('.ah-tree-body') as HTMLElement;
    expect(tree, '树体在场').toBeTruthy();
    expect(box.value.treeEl, 'treeEl expose').toBe(tree);
    expect(tree.parentElement, '树体父级=宿主 scroll-y 包裹层').toBe(wrap);
  });
});

/* ═══════════ 接线锁：三宿主都归零包裹层，不再打不滚动的根元素 ═══════════ */

describe('2.1.3 三宿主接线（源码锁）', () => {
  it('DSL：json/tree 切视图与新结果落定归零 parentElement；旧 pre 归零 no-op 退役', () => {
    expect(dq).toMatch(/view\.value === 'json'[^]*?jsonBox\.value\?\.preEl\?\.parentElement[^]*?scrollTop = 0/);
    expect(dq).toMatch(/!jsonKw\.value\.trim\(\)[^]*?scrollTop = 0/);
    expect(dq).toMatch(/view\.value === 'tree'[^]*?treeBox\.value\?\.treeEl\?\.parentElement[^]*?scrollTop = 0/);
    expect(dq).toContain('ref="treeBox"');
    expect(dq, '旧实现归零不滚动的 pre 本身（no-op）已退役').not.toMatch(/const el = jsonBox\.value\?\.preEl; if \(el\) el\.scrollTop = 0/);
  });

  it('索引工作区：docs/qry 两域的 json/tree 都挂 ref，切视图与新结果落定归零', () => {
    for (const r of ['docsJsonBox', 'docsTreeBox', 'qryJsonBox', 'qryTreeBox']) {
      expect(ih, `ref=${r} 接线`).toContain(`ref="${r}"`);
    }
    expect(ih).toMatch(/function resetAltScroll\([^)]*\)[^]*?preEl[^]*?treeEl[^]*?\.parentElement[^]*?scrollTop = 0/);
    expect(ih).toMatch(/watch\(\[docsView, docsHits\][^]*?resetAltScroll/);
    expect(ih).toMatch(/watch\(\[qryView, qryResp\][^]*?resetAltScroll/);
  });

  it('QRT：内建 alt 视图切档/新结果/单文档游标切换归零容器', () => {
    expect(qrt).toContain('ref="altJsonBox"');
    expect(qrt).toContain('ref="altTreeBox"');
    expect(qrt).toMatch(/watch\(\[effView, \(\) => props\.hits, altDocIdx\][^]*?preEl[^]*?treeEl[^]*?\.parentElement[^]*?scrollTop = 0/);
  });
});
