/**
 * 四百四十五批：聚焦面 Esc 层级细化——capture 阶段 Esc 直接关聚焦面会吞掉
 * Monaco 查找栏（Ctrl+F 唤起的内嵌输入）的自关闭语义：用户按 Esc 想收查找栏，
 * 结果整个聚焦面被关。修：target 为 INPUT/TEXTAREA 时放行（输入控件自消费），
 * 二次 Esc（焦点已回到面）才退出聚焦。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/FocusableSurface.vue'), 'utf-8');

describe('聚焦面 Esc 层级（445 批）', () => {
  it('输入控件内 Esc 放行自消费；其余关闭聚焦面', () => {
    expect(s).toMatch(/const t = e\.target as HTMLElement \| null;\s*\n\s*if \(t && \(t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA'\)\) return;/);
    expect(s).toMatch(/e\.stopPropagation\(\);\s*\n\s*emit\('update:enabled', false\);/);
  });
});
