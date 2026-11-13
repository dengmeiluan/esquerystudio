/**
 * 六百零九批（轨3 表格内核）：RT 内建视图档 viewSeg 对称件——QRT 607 同款平移
 * （dbx 差距 #2 合并续程：607 批交付 QRT 侧+首消费面 SearchTemplatesView，其提交信息
 * 立案「RT 对称件=接线下批」；RT 壳层 541 批 hideBody 注释明写「视图切换 seg 寄居
 * bar-prepend」——壳已留好， seg+alt 体收进内核 opt-in）。
 *
 * ⚠双实产披露：608 号已被监控 lane probe-608-viewports.mjs 占号在途（开工 mtime
 * <1min 活跃，575 让位先例），按指针顺延 609，功能名+文件名锚定双向披露。
 *
 * RT 与 QRT 结构差异（镜像时的契约落点）：
 *  ① RT 单壳（TableShell 恒在）——无 QRT 独立壳分支，seg 寄居 bar-left 最前（slot 前）；
 *  ② RT 体区/状态栏是 v-show（KeepAlive 友好）——「隐藏」断言=内联 display:none，
 *     非 QRT 的 v-if 元素缺席；
 *  ③ 561 退聚焦 watch 源升 bodyHidden（hideBody ∪ 内建非表格档；viewSeg=false 时
 *     bodyHidden≡hideBody 行为等值零回归）。
 *
 * 消费面：RT 消费侧 IH/DQ 双双自有实现且 ihUnify554 冻结面/DQ spec 锁面（607 批
 * 裁决维持），=内核本体增量（轨3「消费侧被占时只做内核本体增量，接线下批」），
 * 消费面接线锁随解锁批交付——故本 spec 无 SearchTemplates 式消费面锁。
 *
 * 挂载样板照抄 aggSelectScope606（裸 createApp + pinia + api mock；点击一律
 * dispatchEvent（el.click 不可靠）；叠挂勿先 unmount（T39））。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');

/* hit 型样例（_index 在场保列序稳定；treeData 同构 {_id,..._source} 行集） */
const K609_HITS = [
  { _id: 'a', _index: 'h', _source: { title: 'alpha', tag: 'x' } },
  { _id: 'b', _index: 'h', _source: { title: 'beta', tag: 'y' } },
] as any;
const K609_TREE = K609_HITS.map((h: any) => ({ _id: h._id, ...h._source }));
const K609_JSON_HTML = '<span>K609-JSON-ENVELOPE</span>';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/* 挂载辅助勿先 unmount（T39 卸载链断裂）——叠挂，卸载统一放钩子 */
async function mountTbl(propsFactory: () => Record<string, unknown>, extraProps?: Record<string, unknown>) {
  const app = createApp({ setup: () => () => h(ResultTable as any, { ...propsFactory(), ...(extraProps ?? {}) }) });
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
const segBtn = (t: string) => [...host.querySelectorAll('.rt-view-seg button')].find(b => b.textContent?.trim() === t) as HTMLElement | undefined;
const segLabels = () => [...host.querySelectorAll('.rt-view-seg button')].map(b => b.textContent?.trim());
const wrapEl = () => host.querySelector('.rt-wrap') as HTMLElement | null;
const statusEl = () => host.querySelector('.rt-status') as HTMLElement | null;

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

/* ═══════════ 一、缺省零增量+hideBody v-show 契约复锁（零回归锚，先行绿） ═══════════ */
describe('六百零九批一：缺省零增量+hideBody 契约复锁', () => {
  it('缺省不传 viewSeg：无内建 seg、表格体/状态栏照旧在场（v-show display 非 none）', async () => {
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609d' }));
    expect(host.querySelector('.rt-view-seg'), '缺省无内建 seg').toBeNull();
    expect(host.querySelector('.rt-alt-body'), '缺省无 alt 体区').toBeNull();
    expect(wrapEl(), '表格体在场').toBeTruthy();
    expect(wrapEl()!.style.display, '表格体可见（v-show 契约）').not.toBe('none');
    expect(statusEl()!.style.display, '状态栏可见').not.toBe('none');
  });
  it('hideBody=true 复锁：表格体/状态栏 display none（bodyHidden≡hideBody，viewSeg=false 等值）', async () => {
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609h', hideBody: true }));
    expect(wrapEl()!.style.display, 'hideBody=true 表格体隐（v-show 语义）').toBe('none');
    expect(statusEl()!.style.display, '状态栏随隐（365 行既有契约）').toBe('none');
  });
});

/* ═══════════ 二、seg 数据驱动出档+alt 体三档 ═══════════ */
describe('六百零九批二：viewSeg 分段出档与 alt 体', () => {
  it('viewSeg+三数据：seg 出四档（aria-pressed 表格档真）；点 JSON 档表格体隐+alt 体在场；点表格档回归', async () => {
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609s', viewSeg: true, jsonHtml: K609_JSON_HTML, treeData: K609_TREE, cardHits: K609_HITS }));
    expect(segLabels(), '数据驱动四档（表格恒在）').toEqual(['表格', 'JSON', 'Tree', '卡片']);
    expect(segBtn('表格')!.getAttribute('aria-pressed'), '表格档 aria-pressed 真').toBe('true');
    await clickIt(segBtn('JSON')!);
    expect(wrapEl()!.style.display, '非表格档表格体隐藏（v-show）').toBe('none');
    expect(statusEl()!.style.display, '状态栏随体隐（hideBody 同语义）').toBe('none');
    const alt = host.querySelector('.rt-alt-body');
    expect(alt, '内建 alt 体区在场').toBeTruthy();
    expect(alt!.querySelector('pre.json-view'), 'json 档=高亮 pretty pre（AltHitsViews 单源）').toBeTruthy();
    expect(alt!.textContent).toContain('K609-JSON-ENVELOPE');
    await clickIt(segBtn('表格')!);
    expect(wrapEl()!.style.display, '回表格档体回归').not.toBe('none');
    expect(host.querySelector('.rt-alt-body'), 'alt 体区移除').toBeNull();
  });
  it('Tree/卡片档体渲染+卡片 open-doc 透传宿主', async () => {
    const seen: any[] = [];
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609c', viewSeg: true, jsonHtml: K609_JSON_HTML, treeData: K609_TREE, cardHits: K609_HITS }), { onOpenDoc: (hit: any) => seen.push(hit) });
    await clickIt(segBtn('Tree')!);
    expect(host.querySelector('.rt-alt-body .jtree'), 'tree 档=JsonTree 统一件').toBeTruthy();
    await clickIt(segBtn('卡片')!);
    expect(host.querySelectorAll('.rt-alt-body .dq-card').length, '卡片行数=行集').toBe(2);
    await clickIt(host.querySelector('.rt-alt-body .dq-card')!);
    /* 971 手势仲裁：单击延迟开，泵过仲裁窗再断言（tick 是微任务不推进真时器） */
    await new Promise(r => setTimeout(r, 300));
    expect(seen.length, 'open-doc 透传恰一次').toBe(1);
    expect(seen[0]?._id, '载荷=所点行').toBe('a');
  });
});

/* ═══════════ 三、偏好落盘与数据缺席诚实回落 ═══════════ */
describe('六百零九批三：viewPrefKey 落盘与回落', () => {
  it('viewPrefKey：切档落盘+重挂载恢复持久化档', async () => {
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609p', viewSeg: true, jsonHtml: K609_JSON_HTML, treeData: K609_TREE, viewPrefKey: 'k609view' }));
    await clickIt(segBtn('Tree')!);
    expect(localStorage.getItem('esquerystudio.pref.k609view'), 'usePref 落盘（esquerystudio.pref.* 命名空间）').toBe(JSON.stringify('tree'));
    /* 重挂载（同 key）：持久化档恢复——非表格档直接生效（状态不重置） */
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609p', viewSeg: true, jsonHtml: K609_JSON_HTML, treeData: K609_TREE, viewPrefKey: 'k609view' }));
    expect(wrapEl()!.style.display, '重挂载恢复 Tree 档（表格体隐）').toBe('none');
    expect(host.querySelector('.rt-alt-body .jtree'), 'Tree 体直接在场').toBeTruthy();
  });
  it('数据缺席诚实回落：持久化档=tree 但 treeData 缺席 → 表格档照常出体，偏好保留不回写', async () => {
    localStorage.setItem('esquerystudio.pref.k609view2', JSON.stringify('tree'));
    await mountTbl(() => ({ hits: K609_HITS, total: 2, storageKey: 'k609f', viewSeg: true, jsonHtml: K609_JSON_HTML, viewPrefKey: 'k609view2' }));
    expect(segLabels(), '数据驱动只出两档').toEqual(['表格', 'JSON']);
    expect(wrapEl()!.style.display, '缺席档位回落表格（体可见）').not.toBe('none');
    expect(host.querySelector('.rt-alt-body'), '回落不渲染 alt 体').toBeNull();
    expect(localStorage.getItem('esquerystudio.pref.k609view2'), '偏好保留不回写').toBe(JSON.stringify('tree'));
  });
});

/* ═══════════ 四、源码锁（内核对称件全套；消费面接线锁随 ihUnify554 解锁批交付） ═══════════ */
describe('六百零九批四：源码锁', () => {
  it('源码锁：props/computed/watch/守卫改用/AltHitsViews 单源/seg 形态全套', () => {
    expect(rt).toContain('viewSeg?: boolean;');
    expect(rt).toContain('viewPrefKey?: string;');
    expect(rt).toContain('jsonHtml?: string;');
    expect(rt).toContain('treeData?: unknown;');
    expect(rt).toContain('cardHits?: SearchHit[];');
    expect(rt).toContain('viewSeg: false,');
    expect(rt).toContain("const bodyHidden = computed(() => props.hideBody === true || (viewSegOn.value && effView.value !== 'table'));");
    expect(rt).toContain('watch(bodyHidden, h => { if (h && focused.value) focused.value = false; });');
    /* 守卫改用双点齐换（rt-wrap+rt-status），一处不缺（566-C4：裸词全形态扫） */
    expect(rt.match(/v-show="!bodyHidden"/g)?.length, 'v-show 改用恰两处').toBe(2);
    expect(rt).not.toContain('v-show="!hideBody"');
    expect(rt).toContain("import AltHitsViews from './AltHitsViews.vue';");
    expect(rt).toContain('class="seg rt-view-seg"');
    expect(rt).toContain('aria-label="展示形式"');
    expect(rt).toMatch(/:aria-pressed="effView === 'table'"/);
    expect(rt).toContain("(e: 'open-doc', hit: SearchHit): void;");
  });
});
