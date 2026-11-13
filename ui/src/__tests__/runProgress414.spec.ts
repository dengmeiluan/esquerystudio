/**
 * 四百一十四批：DevTools 执行中局部进度条——对齐 DslQuery dq-progress 范式，
 * 执行反馈不再只有按钮文字变化；进度条贴页面顶部（ind-bar 全局语言）。
 * ⚠cur 守卫：tabs 异步恢复前 cur 为 undefined，进度条必须 v-if="cur"（挂载级用例抓获）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('执行进度条范式统一（414 批）', () => {
  it('DevTools 局部进度条接入且带 cur 守卫', () => {
    expect(dt).toMatch(/<div v-if="cur" class="dt-progress ind-bar" :class="\{ on: cur\.busy \}"><\/div>/);
    expect(dt).toMatch(/\.dt-progress \{ position: absolute; top: 0; left: 0; right: 0; color: var\(--ac\); \}/);
    expect(dt).toMatch(/\.dt-page \{ padding: 0; position: relative; display: flex; flex-direction: column; min-height: calc\(100vh - var\(--vh-offset\)\); \}/);
  });

  it('DslQuery 同款在场（范式双锚）', () => {
    expect(dq).toContain('<div class="dq-progress ind-bar" :class="{ on: running }"></div>');
  });
});
