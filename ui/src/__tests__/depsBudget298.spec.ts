/**
 * 二百九十八批：依赖预算守卫（供应链门禁）——runtime dependencies 白名单只减不增。
 * 新增依赖必须走用户裁决立项（如 235 批 html-to-image），防「顺手 npm i」失控。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
/* 运行时依赖白名单（2026-09-11 基线）；新增须用户裁决并更新本清单 */
const ALLOW = ['vue', 'pinia', 'vue-router', 'naive-ui', 'lucide-vue-next', 'html-to-image', 'monaco-editor', '@fontsource-variable/inter', '@fontsource-variable/jetbrains-mono'].sort();

describe('依赖预算守卫（298 批）', () => {
  it('runtime dependencies ⊆ 白名单', () => {
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    const extra = deps.filter(d => !ALLOW.includes(d));
    expect(extra, '白名单外新增依赖:\n' + extra.join('\n')).toEqual([]);
  });
  it('白名单依赖一个不少（砍依赖应同步收缩本清单）', () => {
    const deps = Object.keys(pkg.dependencies ?? {}).sort();
    const missing = ALLOW.filter(d => !deps.includes(d));
    expect(missing, '白名单依赖缺失:\n' + missing.join('\n')).toEqual([]);
  });
});
