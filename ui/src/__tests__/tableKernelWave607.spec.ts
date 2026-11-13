/**
 * 六百零七批（轨3 表格内核）：QRT 内建视图档 opt-in（viewSeg）——dbx 差距 #2 合并
 * （「展示形式统一在表格头」内核化：RT 541/QRT 547 hideBody 壳层此前只服务消费方自造
 * seg（DQ/IH 两份重复实现），把 seg+alt 体收进内核 opt-in，与 pagerInHead 同范式）。
 *
 * 五件套：
 *  ① viewSeg opt-in（缺省 false 保底 DOM 契约零变）：true 时工具行 bar-left 最前内建
 *     表格/JSON/Tree/卡片 分段——数据驱动出档（jsonHtml/treeData/cardHits 提供哪档出
 *     哪档，表格档恒在），aria-pressed 可达。
 *  ② 非表格档表格体隐藏（561 退聚焦 watch 源升 bodyHidden=hideBody ∪ 内建非表格档，
 *     hideBody 单独流转行为等值）+ 内建 alt 体区渲染 AltHitsViews（565 共享件单源，
 *     勿再造壳；卡片 @open-doc 透传宿主）。
 *  ③ viewPrefKey 提供时 usePref 落盘（跨会话记忆，esquerystudio.pref.* 命名空间）；数据
 *     缺席的持久化档位诚实回落表格（偏好保留不回写）。
 *  ④ 独立壳分支条件扩 viewSegOn（无 storageKey 通道 seg 同样可达，pagerInHead 同口径）。
 *  ⑤ 首消费面 SearchTemplatesView 接线源码锁（571-C1：约定批必须自带首个消费面；
 *     DQ/IH 既有实现迁移与 RT 对称件待 ihUnify554 冻结面解锁，接线下批）。
 *  同步更新（同车）：rtFix552 ④/tableKernelWave547 ③ 的 QRT 守卫字面 !hideBody→
 *  !bodyHidden、tableKernelWave561 ③ QRT watch 字面（RT 半边不动）。
 *
 * 挂载样板照抄 tableKernelWave562（裸 createApp + pinia，叠挂勿先 unmount（T39），
 * happy-dom 口径：点击一律 dispatchEvent(new MouseEvent('click'))（el.click 不可靠））。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const stSrc = readFileSync(join(__dirname, '../views/SearchTemplatesView.vue'), 'utf-8');

/* hit 型样例（_index 在场保列序稳定；treeData 同构 {_id,..._source} 行集） */
const K607_HITS = [
  { _id: 'a', _index: 'h', _source: { title: 'alpha', tag: 'x' } },
  { _id: 'b', _index: 'h', _source: { title: 'beta', tag: 'y' } },
] as any;
const K607_TREE = K607_HITS.map((h: any) => ({ _id: h._id, ...h._source }));
const K607_JSON_HTML = '<span>K607-JSON-ENVELOPE</span>';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/* 挂载辅助勿先 unmount（T39 卸载链断裂）——叠挂，卸载统一放钩子（547 同款）；
   extraProps 供 onOpenDoc 等事件监听注入（h props 形态 onOpenDoc→open-doc） */
async function mountTbl(propsFactory: () => Record<string, unknown>, extraProps?: Record<string, unknown>) {
  const app = createApp({ setup: () => () => h(QueryResultTable, { ...propsFactory(), ...(extraProps ?? {}) }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const clickIt = async (el: Element) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(4);
};
const segBtn = (t: string) => [...host.querySelectorAll('.qrt-view-seg button')].find(b => b.textContent?.trim() === t) as HTMLElement | undefined;
const segLabels = () => [...host.querySelectorAll('.qrt-view-seg button')].map(b => b.textContent?.trim());

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* ═══════════ 一、缺省零增量+hideBody 契约复锁（零回归锚，先行绿） ═══════════ */
describe('六百零七批一：缺省零增量+hideBody 契约复锁', () => {
  it('缺省不传 viewSeg：无内建 seg、既有体链照旧（547 复锁）', async () => {
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607d' }));
    expect(host.querySelector('.qrt-view-seg'), '缺省无内建 seg').toBeNull();
    expect(host.querySelector('.qrt-wrap'), '表格体照旧在场').toBeTruthy();
  });
  it('hideBody=true 复锁：表格体隐藏（bodyHidden≡hideBody，viewSeg=false 等值）', async () => {
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607h', hideBody: true }));
    const wrap = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(wrap, 'hideBody=true 表格体保留（切档复用）').toBeTruthy();
    expect(wrap.style.display, 'hideBody=true 表格体隐').toBe('none');
  });
});

/* ═══════════ 二、seg 数据驱动出档+alt 体三档 ═══════════ */
describe('六百零七批二：viewSeg 分段出档与 alt 体', () => {
  it('viewSeg+三数据：seg 出四档（aria-pressed 表格档真）；点 JSON 档表格体隐+alt 体在场；点表格档回归', async () => {
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607s', viewSeg: true, jsonHtml: K607_JSON_HTML, treeData: K607_TREE, cardHits: K607_HITS }));
    expect(segLabels(), '数据驱动四档（表格恒在）').toEqual(['表格', 'JSON', 'Tree', '卡片']);
    expect(segBtn('表格')!.getAttribute('aria-pressed'), '表格档 aria-pressed 真').toBe('true');
    await clickIt(segBtn('JSON')!);
    expect((host.querySelector('.qrt-wrap') as HTMLElement).style.display, '非表格档表格体隐藏').toBe('none');
    const alt = host.querySelector('.qrt-alt-body');
    expect(alt, '内建 alt 体区在场').toBeTruthy();
    expect(alt!.querySelector('pre.json-view'), 'json 档=高亮 pretty pre（AltHitsViews 单源）').toBeTruthy();
    expect(alt!.textContent).toContain('K607-JSON-ENVELOPE');
    await clickIt(segBtn('表格')!);
    expect((host.querySelector('.qrt-wrap') as HTMLElement).style.display, '回表格档体回归').not.toBe('none');
    expect(host.querySelector('.qrt-alt-body'), 'alt 体区移除').toBeNull();
  });
  it('Tree/卡片档体渲染+卡片 open-doc 透传宿主', async () => {
    const seen: any[] = [];
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607c', viewSeg: true, jsonHtml: K607_JSON_HTML, treeData: K607_TREE, cardHits: K607_HITS }), { onOpenDoc: (hit: any) => seen.push(hit) });
    await clickIt(segBtn('Tree')!);
    expect(host.querySelector('.qrt-alt-body .jtree'), 'tree 档=JsonTree 统一件').toBeTruthy();
    await clickIt(segBtn('卡片')!);
    expect(host.querySelectorAll('.qrt-alt-body .dq-card').length, '卡片行数=行集').toBe(2);
    await clickIt(host.querySelector('.qrt-alt-body .dq-card')!);
    /* 971 手势仲裁：单击延迟开，泵过仲裁窗再断言（tick 是微任务不推进真时器） */
    await new Promise(r => setTimeout(r, 300));
    expect(seen.length, 'open-doc 透传恰一次').toBe(1);
    expect(seen[0]?._id, '载荷=所点行').toBe('a');
  });
});

/* ═══════════ 三、偏好落盘与数据缺席诚实回落 ═══════════ */
describe('六百零七批三：viewPrefKey 落盘与回落', () => {
  it('viewPrefKey：切档落盘+重挂载恢复持久化档', async () => {
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607p', viewSeg: true, jsonHtml: K607_JSON_HTML, treeData: K607_TREE, viewPrefKey: 'k607view' }));
    await clickIt(segBtn('Tree')!);
    expect(localStorage.getItem('esquerystudio.pref.k607view'), 'usePref 落盘（esquerystudio.pref.* 命名空间）').toBe(JSON.stringify('tree'));
    /* 重挂载（同 key）：持久化档恢复——非表格档直接生效（状态不重置） */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607p', viewSeg: true, jsonHtml: K607_JSON_HTML, treeData: K607_TREE, viewPrefKey: 'k607view' }));
    expect((host.querySelector('.qrt-wrap') as HTMLElement).style.display, '重挂载恢复 Tree 档（表格体隐）').toBe('none');
    expect(host.querySelector('.qrt-alt-body .jtree'), 'Tree 体直接在场').toBeTruthy();
  });
  it('数据缺席诚实回落：持久化档=tree 但 treeData 缺席 → 表格档照常出体，偏好保留不回写', async () => {
    localStorage.setItem('esquerystudio.pref.k607view2', JSON.stringify('tree'));
    await mountTbl(() => ({ hits: K607_HITS, storageKey: 'k607f', viewSeg: true, jsonHtml: K607_JSON_HTML, viewPrefKey: 'k607view2' }));
    expect(segLabels(), '数据驱动只出两档').toEqual(['表格', 'JSON']);
    expect(host.querySelector('.qrt-wrap'), '缺席档位回落表格（体在场）').toBeTruthy();
    expect(host.querySelector('.qrt-alt-body'), '回落不渲染 alt 体').toBeNull();
    expect(localStorage.getItem('esquerystudio.pref.k607view2'), '偏好保留不回写').toBe(JSON.stringify('tree'));
  });
});

/* ═══════════ 四、独立壳通道+源码锁+消费面接线锁 ═══════════ */
describe('六百零七批四：独立壳通道与源码锁', () => {
  it('viewSeg 无 storageKey 无槽：独立壳分支可达（qrt-bar+seg 在场，562 T3① 同口径扩条件）', async () => {
    await mountTbl(() => ({ hits: K607_HITS, viewSeg: true, jsonHtml: K607_JSON_HTML }));
    expect(host.querySelector('.qrt-bar'), '独立壳工具行在场').toBeTruthy();
    expect(host.querySelector('.qrt-view-seg'), 'seg 寄居独立壳').toBeTruthy();
  });
  it('源码锁：props/computed/watch/守卫改用/AltHitsViews 单源/独立壳条件全套', () => {
    expect(qrt).toContain('viewSeg?: boolean;');
    expect(qrt).toContain('viewPrefKey?: string;');
    expect(qrt).toContain('jsonHtml?: string;');
    expect(qrt).toContain('treeData?: unknown;');
    expect(qrt).toContain('cardHits?: Hit[];');
    expect(qrt).toContain('viewSeg: false,');
    expect(qrt).toContain("const bodyHidden = computed(() => props.hideBody === true || (viewSegOn.value && effView.value !== 'table'));");
    expect(qrt).toContain('watch(bodyHidden, h => { if (h && focused.value) focused.value = false; });');
    expect(qrt).toContain('<template v-if="loading && !bodyHidden">');
    expect(qrt).toContain('<EmptyState v-else-if="isEmpty && !bodyHidden"');
    expect(qrt).toContain('<div v-else v-show="!bodyHidden" ref="wrapRef" class="qrt-wrap"');
    expect(qrt).toContain('<div v-if="transposeOn && !bodyHidden" class="qrt-tr-bar"');
    expect(qrt).toContain('<div v-if="pagerOn && ((!loading && !isEmpty) || bodyHidden)" class="qrt-pgr">');
    expect(qrt).toContain("import AltHitsViews from './AltHitsViews.vue';");
    expect(qrt).toContain('class="seg qrt-view-seg"');
    expect(qrt).toContain('aria-label="展示形式"');
    expect(qrt).toMatch(/:aria-pressed="effView === 'table'"/);
    expect(qrt).toContain('v-else-if="hasPrepend || pagerHeadOn || viewSegOn"');
    expect(qrt).toContain("(e: 'open-doc', hit: Hit): void;");
  });
  it('消费面接线源码锁（571-C1）：SearchTemplatesView viewSeg+偏好键+双数据源', () => {
    expect(stSrc, '内建视图档开启').toContain('view-seg');
    expect(stSrc, '偏好键（usePref 落盘）').toContain('view-pref-key="tpl.result.view"');
    expect(stSrc, 'json 档数据源').toContain(':json-html="stJsonHtml"');
    expect(stSrc, 'tree 档数据源').toContain(':tree-data="stTreeData"');
  });
});
