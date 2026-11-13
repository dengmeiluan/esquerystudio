/**
 * 1207：Lucene 查询页「文档 JSON」视图的命中行右键。
 *
 * 这张表是手写的三列表（_id/_score/_source + JsonTree 嵌套），表格内核的单元格右键
 * 覆盖不到——于是出现「表格视图能右键复制文档，切到 JSON 视图就没了」的落差。
 * 锁四件事：
 * 1) 命中行挂了 contextmenu；
 * 2) 两级菜单（一级高频两项，其余进「更多…」），不平铺；
 * 3) 只读安全（菜单里不得出现写动作）；
 * 4) 「用 _id 查此文档」这个跳转必须带 ids 查询体，不能跳过去是空 DSL。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('1207 Lucene JSON 视图命中行右键', () => {
  it('命中行挂 contextmenu，菜单组件在位', () => {
    expect(src).toContain('@contextmenu.prevent="openHitMenu($event, h)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toContain('<CellContextMenu v-if="hitMenu"');
  });

  it('两级收口：一级两项 + 分组父行，低频项住二级', () => {
    const body = src.slice(src.indexOf('const hitMenuItems = computed'), src.indexOf('function fmtScore('));
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain("label: '复制 _id'");
    expect(body).toContain("label: '复制文档 JSON（_id + _source）'");
    expect(body).toMatch(/key: 'hit-more', label: '更多…',[\s\S]{0,120}children: \[/);
    expect(body).toContain("label: '复制 _source（不含 _id）'");
    expect(body).toContain("label: '复制 _score'");
  });

  it('只读安全：只有复制/跳转，没有写动词', () => {
    const body = src.slice(src.indexOf('const hitMenuItems = computed'), src.indexOf('function fmtScore('));
    for (const bad of ['deleteDoc', 'updateDoc', 'api.reindex', 'askConfirm', 'clusterWrite', 'canEmitWrite']) {
      expect(body, `右键菜单不得含写动作：${bad}`).not.toContain(bad);
    }
  });

  it('「用 _id 查此文档」带 ids 查询体，落到 DSL 工作台', () => {
    const body = src.slice(src.indexOf('const hitMenuItems = computed'), src.indexOf('function fmtScore('));
    expect(body).toContain("mode: 'dsl'");
    expect(body).toContain('ids: { values: [String(h._id)] }');
  });
});
