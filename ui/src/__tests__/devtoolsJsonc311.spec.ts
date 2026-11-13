/**
 * 三百一十一批：DevTools 格式化/压缩走 JSONC 宽容解析（与 DslQuery/RestView 同口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonComments } from '../utils/jsonc';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('DevTools JSONC 宽容（311 批）', () => {
  it('format/minify 接 stripJsonComments', () => {
    expect(v).toMatch(/import \{ stripJsonComments \} from '\.\.\/utils\/jsonc';/);
    expect((v.match(/stripJsonComments\(cur\.value\.body\)/g) || []).length).toBe(2);
  });
  it('stripJsonComments 容忍注释（纯函数回归；尾逗号仍由 JSON.parse 拒绝——函数能力域不变）', () => {
    const out = JSON.parse(stripJsonComments('{\n // 注释\n "a": 1 /* 行尾注释 */\n}'));
    expect(out).toEqual({ a: 1 });
    expect(() => JSON.parse(stripJsonComments('{"a": 1,}'))).toThrow();
  });
});
