import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveContextPath } from '../api';

/* 2.0 静态入口从 {ctx}/console/ 迁到 {ctx}/esquerystudio/；API 基址必须跟着入口目录走。
   只认 /console/ 时嵌入宿主（context-path=/quotehub）的请求会打到域名根，
   反代回宿主 SPA 的 HTML → Setup 向导误弹（产线实报）。 */
describe('deriveContextPath', () => {
  it('2.0 入口 {ctx}/esquerystudio/ 取到宿主 context-path', () => {
    expect(deriveContextPath('/quotehub/esquerystudio/index.html')).toBe('/quotehub');
    expect(deriveContextPath('/ops/esquerystudio/index.html')).toBe('/ops');
  });

  it('根部署无 context-path', () => {
    expect(deriveContextPath('/esquerystudio/index.html')).toBe('');
    expect(deriveContextPath('/esquerystudio/')).toBe('');
  });

  it('1.x 旧入口 {ctx}/console/ 保持兼容', () => {
    expect(deriveContextPath('/quotehub/console/index.html')).toBe('/quotehub');
    expect(deriveContextPath('/console/index.html')).toBe('');
  });

  it('非控制台页面不误取 context-path', () => {
    expect(deriveContextPath('/quotehub/esquerystudio.html')).toBe('');
    expect(deriveContextPath('/operations/es-console')).toBe('');
  });
});

describe('SetupWizard 状态门', () => {
  it('只对显式 bound=false 弹窗，非 JSON 响应不得误判为未绑定', () => {
    const s = readFileSync(join(__dirname, '../components/SetupWizard.vue'), 'utf-8');
    expect(s).toContain("if (!s || typeof s !== 'object') return;");
    expect(s).toContain('if (s.bound === false) show.value = true;');
  });
});