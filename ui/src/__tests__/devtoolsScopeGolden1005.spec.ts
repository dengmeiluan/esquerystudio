/**
 * 一千零五批·开发者工具作用域金标准（前端侧）。
 *
 * 与后端 `DevtoolsScopeGolden1005Test` 读**同一份** `fixtures/devtoolsScope.golden.json`：
 * 后端断言内核裁决 == allow，前端断言 UI 态 == ui。核心不变量：
 *
 *   **allow=true ⇒ 前端必须可执行**（有权限的人不能被拦）
 *   deny ⇒ 前端禁用（提前暴露，不留「点下去 403」）
 *   any  ⇒ 前端无法从 method/path/body 判定（如 bulk 动作行夹带），由内核兜底
 *
 * 任何一侧改规则未同步样例，该侧测试立刻红。
 */
import { describe, it, expect } from 'vitest';
import { nonAdminDataPlaneWriteAllowed } from '../utils/devtoolsScope';
import golden from './fixtures/devtoolsScope.golden.json';

interface GoldenCase {
  id: string;
  method: string;
  path: string;
  body: string | null;
  allow: boolean;
  ui: 'allow' | 'deny' | 'any';
  why: string;
}

const cases = (golden as { cases: GoldenCase[] }).cases;

describe('1005:开发者工具作用域金标准（前端侧）', () => {
  it('样例规模与结构自洽', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(cases.map((c) => c.id));
    expect(ids.size, 'id 不得重复').toBe(cases.length);
    for (const c of cases) {
      expect(['allow', 'deny', 'any'], c.id).toContain(c.ui);
      expect(c.why?.length, c.id).toBeGreaterThan(0);
      if (c.allow) expect(c.ui, `${c.id} allow=true 不应要求 UI 禁用`).not.toBe('deny');
    }
  });

  it('allow ⇒ 前端必须可执行（有权限的人不被拦）', () => {
    const falseNegatives = cases
      .filter((c) => c.allow)
      .filter((c) => !nonAdminDataPlaneWriteAllowed(c.method, c.path, c.body));
    expect(falseNegatives.map((c) => `${c.id} ${c.method} ${c.path}`)).toEqual([]);
  });

  it('ui=deny ⇒ 前端必须禁用（提前暴露，不留点下去 403）', () => {
    const overPromised = cases
      .filter((c) => c.ui === 'deny')
      .filter((c) => nonAdminDataPlaneWriteAllowed(c.method, c.path, c.body));
    expect(overPromised.map((c) => `${c.id} ${c.method} ${c.path}`)).toEqual([]);
  });

  it('ui=any 只做记录：前端放行是允许的，内核仍会兜底', () => {
    /* 这类是 body 依赖（bulk 动作行/msearch 头/mget docs/SQL FROM/脚本改写），
       前端不解析请求体——比的是「内核必须拒」，由后端侧断言。此处仅确认不抛错。 */
    for (const c of cases.filter((x) => x.ui === 'any')) {
      expect(() => nonAdminDataPlaneWriteAllowed(c.method, c.path, c.body)).not.toThrow();
    }
  });
});
