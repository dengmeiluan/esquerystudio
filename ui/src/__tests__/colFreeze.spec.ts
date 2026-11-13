/**
 * R130 一百九十七批/207 批：RT/QRT 冻结窗格（宽表横向滚动时行身份不丢）。
 * 二百三十六批 P2-4：升级前缀多列冻结——「冻结到此列」保持列序冻结 0..idx；
 * es_tbl_freeze_n:<dim> 持久化（旧 es_tbl_freeze:'1' 迁移读作 1）；
 * sticky left 由 frozenStyle 内联按前缀宽度动态计算（150 批铁律：冻结列强制 min-width）；
 * 冻结列底色不透明三态（常态/hover/选中·焦点）。源码锁+行为锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const prefs = readFileSync(join(__dirname, '../composables/useTablePrefs.ts'), 'utf-8');

describe('useTablePrefs 前缀冻结模型（236 批 P2-4）', () => {
  it('freezeN 状态+setFreezeN+旧键迁移+维度重读', () => {
    expect(prefs).toMatch(/const freezeN = ref\(readFreezeN\(dimension\.value\)\);/);
    expect(prefs).toMatch(/const freezeFirst = computed\(\(\) => freezeN\.value > 0\);/);
    expect(prefs).toMatch(/es_tbl_freeze_n:' \+ dimension\.value/);
    expect(prefs).toMatch(/es_tbl_freeze:' \+ d\b.*=== '1' \? 1 : 0/); // 旧键迁移
    expect(prefs).toMatch(/freezeN\.value = readFreezeN\(d\);/); // 维度重读
  });

  it('RT：右键「冻结到此列/取消冻结（前 N 列）」+th/td 冻结类+frozenStyle 动态 left', () => {
    expect(rt).toMatch(/key: 'freeze-col', label: '冻结到此列'/);
    expect(rt).toMatch(/label: freezeN\.value > 1 \? `取消冻结（前 \$\{freezeN\.value\} 列）` : '取消冻结'/);
    expect(rt).toMatch(/'rt-col-frozen': isFrozenCol\(c\)/);
    expect(rt).toMatch(/:style="frozenStyle\(c\)"/);
    /* 五百六十批锚同步更新：装配合并 useColFit.frozenStyleOf 单源（锁意图不变——基数 98=标识列
       勾选 46+序号 52 以常参注入；FROZEN_DEFAULT_W=180 共用常量同步更新单源，组件本地声明退役） */
    expect(rt).toMatch(/frozenStyleOf\(visibleCols\.value, colWidths\.value, col, freezeN\.value, 98, true\)/);
    expect(rt).toMatch(/import \{[^}]*frozenStyleOf[^}]*\} from '\.\.\/composables\/useColFit'/);
  });

  it('QRT：右键冻结项（barOn 门控）+th/td 冻结类+frozenStyle（基数 52px）', () => {
    /* 1141：门控从 prefsOn 放宽到 barOn（内存态工具行也可冻结，冻结数只存内存） */
    expect(qrt).toMatch(/'qrt-col-frozen': isFrozenCol\(c\)/);
    expect(qrt).toMatch(/'qrt-col-frozen': isFrozenCol\(shownCols\[ci\]\)/);
    expect(qrt).toMatch(/:style="barOn \? frozenStyle\(c\) : colStyle\(c\)"/);
    /* 五百六十批锚同步更新：装配合并 useColFit.frozenStyleOf 单源（锁意图不变——基数 52=序号列
       常参注入、1141 起门控透传 barOn） */
    expect(qrt).toMatch(/frozenStyleOf\(visibleCols\.value, colWidths\.value, col, freezeN\.value, 52, barOn\.value\)/);
    expect(qrt).toContain("key: 'freeze-col', label: '冻结到此列'");
  });

  it('冻结列底色不透明三态（bg1 常态/bg2 hover/ac-soft 选中·焦点）', () => {
    expect(rt).toMatch(/\.rt-tbl td\.rt-col-frozen \{ background: var\(--bg1\); \}/);
    expect(rt).toMatch(/\.rt-tbl tbody tr:hover td\.rt-col-frozen \{ background: var\(--bg2\); \}/);
    expect(rt).toMatch(/\.rt-tbl tr\.sel td\.rt-col-frozen/);
    expect(qrt).toMatch(/\.qrt-tbl td\.qrt-col-frozen \{ background: var\(--bg1\); \}/);
    expect(qrt).toMatch(/\.qrt-tbl tbody tr:hover td\.qrt-col-frozen \{ background: var\(--bg2\); \}/);
  });

  it('CSS 不再硬编码 left（236 批起由 frozenStyle 内联动态提供）', () => {
    expect(rt).not.toMatch(/rt-col-frozen[^}]*left: 98px/);
    expect(qrt).not.toMatch(/qrt-col-frozen[^}]*left: 52px/);
  });
});
