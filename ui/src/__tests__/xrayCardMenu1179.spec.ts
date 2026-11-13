/**
 * 1179：查询透视页「Lucene 实际执行」卡片右键。
 *
 * 排障现场：看到 `MatchNoDocsQuery` 说明这条子句永远查不到东西，用户往往要
 * 「只抄那几行」贴给同事，或「只抄索引名」去另开任务；此前卡片只有一个
 * 「复制解释全文」按钮（整段复制再手删）。
 *
 * 锁：① 卡片挂 contextmenu；② 一级两项 + 分组父行（不平铺）；③ 二级出低频项；
 * ④ 只读安全；⑤ 「只抄 MatchNoDocs 子句」这个动作真按行筛，而不是复制全文。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/QueryXrayView.vue'), 'utf-8');

describe('1179 查询透视「实际执行」卡片右键', () => {
  it('卡片挂 contextmenu，菜单组件在位', () => {
    expect(src).toContain('@contextmenu.prevent="openExMenu($event, ex)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toContain('<CellContextMenu v-if="exMenu"');
  });

  it('两级收口：一级两项 + 分组父行，低频项住二级', () => {
    const seg = src.slice(src.indexOf('const exMenuItems = computed'), src.indexOf('const exMenuItems = computed') + 1600);
    expect(seg).toContain("label: '复制解释全文'");
    expect(seg).toContain("label: '只复制索引名'");
    expect(seg).toMatch(/key: 'ex-more', label: '更多…',[\s\S]{0,120}children: \[/);
    expect(seg).toContain("label: '只复制「永远查不到」的子句'");
    expect(seg).toContain("label: '复制整条解释 JSON'");
  });

  it('只抄「永远查不到」是真按行筛，不是复制全文', () => {
    const seg = src.slice(src.indexOf('const exMenuItems = computed'), src.indexOf('const exMenuItems = computed') + 1600);
    expect(seg).toMatch(/noDocs = full\.split\(\/\\r\?\\n\/\)/);
    expect(seg).toContain('MatchNoDocsQuery|MatchAllDocsQuery');
    expect(seg).toContain("noDocs ? copyEx(noDocs");
  });

  it('只读安全：菜单里不得出现写动作', () => {
    const seg = src.slice(src.indexOf('const exMenuItems = computed'), src.indexOf('const exMenuItems = computed') + 1600);
    for (const bad of ['api.reindex', 'deleteIndex', 'askConfirm', 'putSettings', 'ilmMove']) {
      expect(seg, `卡片右键不得含写动作：${bad}`).not.toContain(bad);
    }
  });
});
