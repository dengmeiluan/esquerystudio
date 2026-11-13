/**
 * 二百七十一/二百七十二批：kbd 提示统一+QRT 导出钮（波次 A 收尾）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const rt = read('../components/ResultTable.vue');
const qrt = read('../components/QueryResultTable.vue');

describe('波次 A 收尾（271-272 批）', () => {
  it('kbd 提示统一基段 ↑↓ Home/End · Ctrl+F（RT 追加 Enter/⌫ 差异段）', () => {
    expect(qrt).toContain('>↑↓ Home/End · Ctrl+F</span>');
    expect(rt).toContain('>↑↓ Home/End · Enter ⌫ · Ctrl+F</span>');
    expect(rt).toMatch(/title="表格已获焦：[^"]*Ctrl\+F 结果内查找/);
  });
  it('QRT 导出钮：工具条接线+函数共用（cmd 与钮同路径）', () => {
    /* 五百二十五批同步更新：导出钮文案「导出」→「CSV」（同排补 MD/XLSX/PNG 三档后按钮标格式名） */
    /* 835 批同步更新：CSV 钮合并「导出 ▾」聚合菜单（aria 逐字保留，525/560 锁面同源） */
    /* 1345：导出钮 aria 升级为「导出当前视图（N 行，格式…）」——本锁守的是
       「这个钮有可访问名称且走同一函数」，不是「它必须只叫导出」。 */
    expect(qrt).toMatch(/:aria-label="`导出当前视图（\$\{sortedRows\.length\} 行/);
    expect(qrt).toMatch(/@click="exportCsv\(\); closeMenus\(\)"/);
    expect(qrt).toMatch(/function exportCsv\(\)/);
    expect(qrt).toMatch(/else if \(cmd === 'export'\) exportCsv\(\);/);
  });
});
