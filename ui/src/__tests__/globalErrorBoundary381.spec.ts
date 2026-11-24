/**
 * 三百八十一批：全局异常兜底——此前 app.config.errorHandler 零配置，
 * 渲染异常=白屏+控制台裸奔；未捕获 Promise 拒绝无任何痕迹。
 * 修：errorHandler（完整堆栈进控制台+经 store.notify 弹一次，R85 风暴抑制防轰炸）
 * + unhandledrejection 监听（留痕）。挂载点在 pinia/router 之后（store 可用）。
 * 附：localStorage 键命名空间两代并存（esquerystudio.* 草稿/日志 vs es_ 偏好键）
 * 定性为历史分层不统一——统一会砸存量用户偏好，迁移成本大于收益，明确不动。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../main.ts'), 'utf-8');

describe('全局异常兜底（381 批）', () => {
  it('errorHandler：控制台堆栈+notify 弹一次+store 防护', () => {
    expect(s).toMatch(/app\.config\.errorHandler = \(err: unknown, _inst, info\) => \{/);
    expect(s).toMatch(/console\.error\('\[esquerystudio\] 渲染异常', err, '\\n处理链:', info\)/);
    expect(s).toMatch(/useAppStore\(\)\.notify\('error', `页面渲染异常：/);
    expect(s).toMatch(/\} catch \{ \/\* store 不可用时不二次炸 \*\/ \}/);
  });

  it('unhandledrejection 留痕监听在场', () => {
    expect(s).toMatch(/window\.addEventListener\('unhandledrejection'/);
  });

  it('挂载顺序：errorHandler 在 use(pinia)/use(router) 之后、mount 之前', () => {
    const iErr = s.indexOf('app.config.errorHandler');
    const iPinia = s.indexOf('app.use(createPinia())');
    const iMount = s.indexOf("app.mount('#app')");
    expect(iErr).toBeGreaterThan(iPinia);
    expect(iErr).toBeLessThan(iMount);
  });
});
