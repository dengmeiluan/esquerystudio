/**
 * 三百零三批：QRT 增量渲染——截断行「继续渲染下 2000 行」按钮，浏览万级结果
 * 不必只能导出；行集变化自动回首批。
 * 五百二十八批 W-A 同步更新（TableShell 第二刀）：逻辑同构段抽至 useRenderMore——
 * 源码锚改指 composable 本体 + QRT 接线行，模板文案保位不动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rm = readFileSync(join(__dirname, '../composables/useRenderMore.ts'), 'utf-8');

describe('QRT 增量渲染（303 批）', () => {
  it('renderLimit 状态+按钮+自动回位（528 同步更新：逻辑在 useRenderMore）', () => {
    expect(rm).toMatch(/const renderLimit = ref\(MAX_RENDER\);/);
    expect(rm).toMatch(/watch\(\(\) => sorted\(\)\.length, \(\) => \{ renderLimit\.value = MAX_RENDER; \}\);/);
    expect(rm).toMatch(/function renderMore\(\) \{ renderLimit\.value \+= MAX_RENDER; \}/);
    expect(qrt).toContain('继续渲染下 {{ MAX_RENDER }} 行');
    /* QRT 接线行（528 批）：行源 sortedRows + IO 根 rootEl 惰性 getter */
    expect(qrt).toMatch(/useRenderMore\(\(\) => sortedRows\.value, \(\) => rootEl\.value\);/);
  });
  it('计数/查找提示随 renderLimit 联动', () => {
    expect(qrt).toMatch(/已渲染前 \{\{ renderRows\.length \}\} 行/);
    expect(qrt).toMatch(/≈ 前 \{\{ renderRows\.length \}\} 行/);
  });
});
