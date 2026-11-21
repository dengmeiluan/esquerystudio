/**
 * 九百六十三批：查询工作台文档写门扫尾（编辑入口 + ResultTable 提交链）。
 *
 * 962 已给 DslQuery/IndexHub 的保存/写入按钮与 saveDoc/saveNewDoc 执行体加门；
 * 本批补两处残留通道：
 * ① DslQueryView 编辑入口——文档抽屉查看态「编辑」切换钮、ResultTable 行内编辑钮、
 *    AltHitsViews json/tree 编辑直达全接 canWrite（971 手势仲裁批：cards 编辑直达退役，
 *    编辑走导航条钮+抽屉链显式通道）；?newdoc=1 深链与命令面板
 *    new-doc 事件在执行体/分支首行前置写门（VIEWER 不再进入写表单）；
 * ② ResultTable 提交链——applyEdit（本地 pending 写入）与 commitPending
 *    （点提交/Ctrl+S/Ctrl+Enter/预览弹层提交四入口汇聚点）首行 canWrite 早退。
 * 删除三执行体（单删/批删/按查询删除）首行补 canOps 守卫，危险操作不经按钮旁路。
 *
 * 驱动方式=源码锁（同 permGating/docWriteGate962 的静态断言口径）：只锁通道与
 * 文案，不引运行时副作用；行为覆盖由 docWriteGate962 等既有行为锁承担。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const dq = read('../views/DslQueryView.vue');
const rt = read('../components/ResultTable.vue');
const ah = read('../components/AltHitsViews.vue');

const DENY_WRITE = "store.notify('warning', '当前身份无文档写权限')";
const DENY_OPS = "store.notify('warning', '删除文档需专项或 ADMIN 角色')";

describe('963 DslQueryView：文档编辑入口写门', () => {
  it('抽屉查看态「编辑」切换钮 = canWrite 门（VIEWER 只保留预览）', () => {
    expect(dq).toContain('<button v-if="canWrite" class="btn sm" @click="docEditMode = !docEditMode">{{ docEditMode ? \'预览\' : \'编辑\' }}</button>');
  });

  it('ResultTable 行内编辑 + AltHitsViews json/tree 编辑直达全部 :editable="canWrite"（共 3 处）', () => {
    expect(dq).toContain(':editable="canWrite" @edit-doc="h => openDoc(h, true)"');
    expect(dq.match(/:editable="canWrite"/g)?.length ?? 0, 'ResultTable 1 处 + AltHitsViews json/tree 2 处（971 cards 编辑退役，编辑=导航条钮+抽屉显式通道）').toBe(3);
    expect(dq).toContain('<AltHitsViews ref="jsonBox" view="json"');
    expect(dq).toContain(':editable="canWrite" @open-doc-at="i => resp && openDoc(resp.hits[i])"');
    expect(dq).toContain(':editable="canWrite" @open-doc-at="i => openTreeDocAt(i)"');
    expect(dq).toContain('<AltHitsViews view="cards" :hits="cardHits" @open-doc="openDoc"');
    /* 971 手势仲裁：cards 编辑直达退役（双击=选词原生手势），编辑入口不回潮 */
    expect(dq, 'cards 档编辑直达退役').not.toMatch(/view="cards"[^>]*@edit-doc/);
    /* 旧裸 editable 不回潮（宿主不传权限裁定=VIEWER 也渲染编辑入口） */
    expect(dq, ':editable 裸布尔形态退役').not.toMatch(/ editable @(?:edit-doc|open-doc)/);
  });
});

describe('963 DslQueryView：新建文档旁路通道写门', () => {
  it('openNewDocFromLink 首行 canWrite 早退（?newdoc=1 深链不再给只读用户开写表单）', () => {
    expect(dq).toContain(`async function openNewDocFromLink() {\n  if (!canWrite.value) { ${DENY_WRITE}; return; }`);
  });

  it('new-doc 事件分支：pickedIdx 判断前先拦 canWrite（命令面板跨页直达同门）', () => {
    expect(dq).toContain(`if (ev.name === 'new-doc') { if (!canWrite.value) { ${DENY_WRITE}; return; } if (store.pickedIdx)`);
    const branch = dq.indexOf("ev.name === 'new-doc'");
    expect(branch, '事件分支在场').toBeGreaterThanOrEqual(0);
    expect(dq.indexOf('!canWrite.value', branch)).toBeLessThan(dq.indexOf('store.pickedIdx', branch));
  });
});

describe('963 DslQueryView：删除执行体按端点归属守卫', () => {
  it('delete-by-id 与 delete-by-query 各用各的门 + 统一报真', () => {
    for (const sig of ['askDeleteDoc(hit: SearchHit)', 'askBatchDelete(ids: string[])']) {
      expect(dq).toContain(`async function ${sig} {\n  if (!canDeleteDoc.value) { ${DENY_OPS}; return; }`);
    }
    expect(dq).toContain(`async function askDeleteByQuery() {\n  if (!canOps.value) { ${DENY_OPS}; return; }`);
    expect(dq.match(/删除文档需专项或 ADMIN 角色/g)?.length ?? 0, '三执行体同文案').toBe(3);
  });
});

describe('963 ResultTable：行内编辑钮 + 本地写入/提交链', () => {
  it('「编辑文档」入口 = editable && canWrite（宿主开关再叠本组件连接写档）', () => {
    /* 1364：行内钮收进「更多 ⋯」菜单——门禁条件原样跟着搬，语义不变：
       非写权用户即使打开菜单也不出现「编辑文档」。 */
    expect(rt).toMatch(/props\.editable && canWrite\.value[\s\S]{0,24}key: 'act-edit', label: '编辑文档'/);
  });

  it('applyEdit 首行 canWrite 早退（双击/Enter/blur/Tab 的本地 pending 写入先拦）', () => {
    expect(rt).toMatch(/function applyEdit\(\) \{\n {2}if \(!canWrite\.value\) return;/);
  });

  it('commitPending 首行 canWrite 早退（点提交/Ctrl+S/Ctrl+Enter/预览弹层提交四入口汇聚同一执行体）', () => {
    expect(rt).toContain(`async function commitPending() {\n  if (!canWrite.value) { ${DENY_WRITE}; return; }`);
    expect(rt).toContain('if (pending.value.size) void commitPending();');
    expect(rt).toContain('@click="pendOpen = false; commitPending()"');
    expect(rt).toContain('@click="previewOpen = false; commitPending()"');
  });
});

describe('963 AltHitsViews：编辑入口无裸双击旁路（971 演进：双击编辑整体退役=旁路不复存在）', () => {
  it('双击处理器只做手势仲裁不发编辑；编辑=导航条编辑钮（editable 统辖）+抽屉链显式通道', () => {
    expect(ah, '双击编辑旁路整体退役（双击=选词原生手势）').not.toContain("emit('edit-doc'");
    expect(ah, '三档双击=取消待发单击（仲裁语义，非编辑）').toMatch(/function onPreDblClick\(\) \{ guard\.cancelPending\(\); \}/);
    expect(ah, '双击编辑的 editable 早退守卫随编辑一起退役').not.toContain('if (!props.editable) return;');
    expect(ah.match(/<button v-if="editable"/g)?.length ?? 0, 'json/tree 导航条编辑钮两处').toBe(2);
  });
});
