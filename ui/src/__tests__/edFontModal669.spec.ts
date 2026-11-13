/**
 * 六百六十九批 件B：文档弹窗字号档铺开（⑥668 建议件 2 低优——「同页同键」约定收尾）。
 *
 * 还原备案：668 定案=主编辑面先行（DQ 主 DSL 编辑器 dq.font/IH query tab 编辑器 ih.font），
 * 弹窗查看面备案待扩；随「全干」令收尾。铺开形态=DevTools dt.font 约定先例（560：请求
 * 体 Monaco 与响应只读面同键）——**同页所有 Monaco 同键**：DQ 编辑弹窗+新建文档弹窗复用
 * dqFont、IH 文档弹窗复用 ihFont，零新 usePref 键（668-C1 渲染真值判据在 668 probe 已真机
 * 实证同键机制，弹窗面同机制零新风险）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('669 D：DQ 文档弹窗双 Monaco 复用 dqFont', () => {
  it('D1 编辑弹窗 :font-size="dqFont"（docH 邻位）', () => {
    expect(dq).toContain('<MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" />');
  });
  it('D2 新建/克隆弹窗 :font-size="dqFont"（docHNew 邻位）', () => {
    expect(dq).toContain('<MonacoEditor v-model="newDocText" :height="docHNew" :font-size="dqFont" />');
  });
  it('D3 零新键：dq.font usePref 全文恰 1 处（668 约定键复用）', () => {
    expect((dq.match(/usePref<number>\('dq\.font', 12\.5\)/g) ?? []).length).toBe(1);
  });
});

describe('669 E：IH 文档弹窗查看态复用 ihFont', () => {
  it('E1 查看 Monaco :font-size="ihFont"（dsl-assist 邻位）', () => {
    expect(ih).toMatch(/<MonacoEditor :model-value="docEditText" language="json" :readonly="true" height="min\(60vh,420px\)"\s*:dsl-assist="\{ fields: ihDslAssist\.fields, bodyKind: \(\) => 'doc' \}" :font-size="ihFont" \/>/);
  });
  it('E2 零新键：ih.font usePref 全文恰 1 处（668 约定键复用）', () => {
    expect((ih.match(/usePref<number>\('ih\.font', 12\.5\)/g) ?? []).length).toBe(1);
  });
});
