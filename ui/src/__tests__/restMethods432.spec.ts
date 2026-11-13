/**
 * 四百三十二批：REST 方法全集常量收口——DevTools/RestView 各自定义
 * ['GET','POST','PUT','DELETE','HEAD']（CSS 重复收口 428-431 的 JS 同族）。
 * 合并 utils/esEndpoints.ts 导出 REST_METHODS（端点目录的天然归宿），两视图消费。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const ep = readFileSync(join(SRC, 'utils/esEndpoints.ts'), 'utf-8');
const dt = readFileSync(join(SRC, 'views/DevToolsView.vue'), 'utf-8');
const rest = readFileSync(join(SRC, 'views/RestView.vue'), 'utf-8');

describe('REST_METHODS 常量收口（432 批）', () => {
  it('esEndpoints 导出 REST_METHODS（as const 元组）', () => {
    expect(ep).toContain("export const REST_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'] as const;");
  });

  it('两视图消费收口后的常量，本地数组退役', () => {
    expect(dt).toContain('const METHODS = REST_METHODS;');
    expect(dt).not.toContain("const METHODS = ['GET', 'POST'");
    expect(rest).toContain('const METHODS = REST_METHODS;');
    expect(rest).not.toContain("const METHODS = ['GET', 'POST'");
  });
});
