import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* 文档编辑直达能力矩阵（934）：两个工作台（查询/索引）的 JSON/Tree 档导航条全接线，
 「编辑文档」钮只在宿主真接线 edit-doc-at 时渲染（editable 开关）——无编辑链的宿主
 不渲染点了没反应的按钮；tree 行集（_id 与源字段平铺）重组回 SearchHit 时把行首 _id
 剥出 _source（元数据字段写回文档体会被 ES 拒收），保存链不受影响。 */

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const ah = read('../components/AltHitsViews.vue');
const dq = read('../views/DslQueryView.vue');
const ih = read('../views/IndexHubView.vue');
const rt = read('../components/ResultTable.vue');

describe('934 文档编辑直达矩阵（源码锁）', () => {
  it('AltHitsViews：编辑文档钮受 editable 开关（缺省关）', () => {
    expect(ah).toContain('editable?: boolean;');
    expect(ah).toMatch(/<button v-if="editable"[^>]*@click="emit\('edit-doc-at', docCursor\)">编辑文档<\/button>/);
  });

  it('DslQueryView：tree 档 editable 直达 + 重组剥行首 _id', () => {
    /* 2.1.3：tree 档新增 ref="treeBox"（滚动位归零打包裹层 parentElement）——
       编辑直达契约（editable/open-doc-at/edit-doc-at 三件）逐字不变 */
    expect(dq).toContain(':editable="canWrite" @open-doc-at="i => openTreeDocAt(i)" @edit-doc-at="i => openTreeDocAt(i, true)" ref="treeBox" />');
    expect(dq).toContain('<AltHitsViews view="tree"');
    expect(dq).toMatch(/function openTreeDocAt\(i: number, goEdit = false\)/);
    expect(dq, '行首 _id 剥出 _source（元数据字段不可写回文档体）').toMatch(/const \{ _id, \.\.\.src \} = row;/);
    expect(dq).toContain("openDoc({ _id: String(_id ?? ''), _index: '', score: 1, _score: 1, _source: src } as SearchHit, goEdit)");
  });

  it('IndexHubView：openDoc goEdit 签名 + 四档 edit-doc-at 全接线 + tree editable 直达两处', () => {
    expect(ih).toMatch(/function openDoc\(hit: SearchHit, goEdit = false\)/);
    expect(ih).toContain('docEditMode.value = goEdit;');
    expect(ih).toMatch(/function openAltDocAt\(rows: Array<Record<string, any>>, i: number, goEdit = false\)/);
    expect(ih, '行首 _id 剥出 _source').toMatch(/const \{ _id, \.\.\.src \} = row;/);
    expect(ih.match(/@edit-doc-at=/g)?.length ?? 0, 'docs/qry 的 json+tree 四档接线数').toBe(4);
    expect(ih.match(/:editable="canWrite" @open-doc-at="i => openAltDocAt\(/g)?.length ?? 0, 'tree editable 直达两处（963：editable 随 canWrite）').toBe(2);
  });

  it('ResultTable：行内编辑钮受 editable 开关（edit-doc emit），内建 alt 档仅打开链', () => {
    expect(rt).toMatch(/editable\?: boolean;/);
    /* 1364：编辑钮收进行尾「更多 ⋯」菜单，门禁条件不变（editable && canWrite） */
    expect(rt).toMatch(/props\.editable && canWrite\.value[\s\S]{0,24}key: 'act-edit', label: '编辑文档'/);
    expect(rt).toContain("(e: 'edit-doc', hit: SearchHit): void;");
    /* 内建 alt 档（无编辑链宿主经 RT 消费的 JSON/Tree）不传 editable=不渲染编辑钮 */
    expect(rt, '内建 alt 档仅打开链').toMatch(/@open-doc-at="i => \{ const h = props\.hits\[i\]; if \(h\) emit\('open-doc', h\) \}"/);
  });

  it('渲染数据直达（935 续）：JsonTree 行挂 data-jid，AltHitsViews 三档委托单击开；971 双击编辑退役（选词回归原生，编辑=导航条钮+抽屉链）', () => {
    const jt = read('../components/JsonTree.vue');
    expect(jt, '树行携带点分路径（委托按首段定位文档）').toContain("'data-jid': id");
    /* 2.1.3：树体新增 ref="treeEl"（宿主据此归零包裹层滚动位），手势三件逐字不变 */
    expect(ah).toContain('class="ah-tree-body" ref="treeEl" @mousedown="onTreeDown" @click="onTreeClick" @dblclick="onTreeDblClick"');
    expect(ah).toMatch(/function treeDocIndexOf\(e: MouseEvent\): number/);
    expect(ah).toMatch(/\/\^\(\\d\+\)\(\?:\\\._id\)\?\$\/\.exec\(row\.getAttribute\('data-jid'\)/);
    expect(ah).toMatch(/<pre v-if="view === 'json'" ref="preEl" class="json-view" v-html="[^"]*" @mousedown="onPreDown" @click="onPreClick" @dblclick="onPreDblClick"/);
    /* 971 手势仲裁：双击处理器只做取消仲裁，cards 编辑 emit 退役 */
    expect(ah).toContain('@mousedown="onCardDown" @click="onCardClick($event, h)" @dblclick="onCardDblClick"');
    expect(ah, 'cards 档编辑 emit 退役').not.toContain("emit('edit-doc'");
    /* 宿主表格行内编辑直达接线（两工作台 + RT 行钮） */
    expect(dq).toMatch(/:editable="canWrite" @edit-doc="h => openDoc\(h, true\)"/);
    expect(ih.match(/:editable="canWrite" @edit-doc="h => openDoc\(h, true\)"/g)?.length ?? 0, 'IH 两处 ResultTable 行内编辑接线（963：editable 随 canWrite）').toBe(2);
    expect(dq).toContain('<AltHitsViews view="cards" :hits="cardHits" @open-doc="openDoc" />');
    /* IH json 信封逐文档块化（j-doc-block 与查询工作台同款） */
    expect(ih).toContain('`<span class="j-doc-block" data-doc-i="${i}">`');
  });
});
