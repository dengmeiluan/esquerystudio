import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exceedsResultWindow } from '../utils/resultWindow';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1107：from+size 深分页窗口在本地先拦（ES 默认 max_result_window=10000），
 * 并把当前 query/sort 接力到 PIT 通道，不再让用户吃一次必败请求。 */
describe('1107 深分页窗口守卫', () => {
  it('边界：from+size=10000 放行，10001 拦截', () => {
    expect(exceedsResultWindow(500, 20)).toBe(false); // (499*20)+20 = 10000
    expect(exceedsResultWindow(501, 20)).toBe(true);
    expect(exceedsResultWindow(100, 100)).toBe(false); // 9900+100
    expect(exceedsResultWindow(101, 100)).toBe(true);
  });

  it('视图接线：超窗即提示并可一键去 PIT（query/sort 接力）', () => {
    expect(dq).toContain('import { exceedsResultWindow } from \'../utils/resultWindow\';');
    expect(dq).toMatch(/if \(exceedsResultWindow\(np, pageSize\.value\)\) \{[\s\S]{0,260}action: \{ label: '去 PIT 分页', onClick: goPitDeep \}/);
    expect(dq).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.pit.filter', JSON.stringify(obj.query));");
    expect(dq).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.pit.prefill', JSON.stringify({ sort: sf, order: so }));");
    expect(dq).toContain("usp.set('mode', 'pit');");
  });
});
