/**
 * R130 一百四十五批：PluginsView 插件清单 CSV 导出（版本审计/升级盘点）。
 * 五百六十一批同步更新（表格头收口·导出走内核）：raw 表宿主「导出 CSV」钮与 exportPlugins
 * getCsvBlock 管道退役——QRT 内建 CSV 导出钮（bar-right 常驻）承接，审计文件名经
 * export-name="plugins-raw" 保形（前缀 es-plugins- → plugins-raw-<ts>.csv；BOM/转义/
 * 提示语归内核 exportCsv 单一口径）。RAW_COLS 四列契约不变（raw 表列名与内核同源）。
 * 矩阵表同步换 QRT rows 型（cols=nodeNames 直映射），export-name="plugins-matrix" 同范式。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/PluginsView.vue'), 'utf-8');

describe('Plugins 清单导出（145 批→561 导出走内核同步更新）', () => {
  it('RAW_COLS 四列契约保形；宿主 exportPlugins 管道退役（负锁防回潮）', () => {
    expect(src).toContain("const RAW_COLS = ['node', 'component', 'version', 'description'];");
    expect(src, '宿主管道退役（内核 exportCsv 单一口径）').not.toMatch(/function exportPlugins\(\)/);
    expect(src, '旧审计前缀退役（文件名经 export-name 传内核）').not.toContain('es-plugins-');
  });

  it('导出能力由 QRT 内建承接：raw 表 export-name=plugins-raw、矩阵表 export-name=plugins-matrix', () => {
    expect(src).toContain('export-name="plugins-raw"');
    expect(src).toContain('export-name="plugins-matrix"');
    expect(src, 'raw 表 QRT 在场（防空跑）').toContain('storage-key="plugins:raw"');
  });
});
