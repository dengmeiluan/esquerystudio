/**
 * 六百八十八批：审计流水可读性（用户实报「安全审计列表字体人眼视觉非常难受，模糊不清楚」）。
 *
 * 根因：QRT 单元格恒用 --mono（JetBrains Mono 11px），中文用户名/角色/动作/集群/详情
 * 落到 CJK 回退字形，行内字面参差发虚；时间/URI/IP/数值等列又确实需要等宽。
 *
 * 锁定：
 * 1) QRT 新增 textCols（正文字体列）+ readable（整表 12px、线盒 16.5px 保持 25.5px 行距）；
 * 2) 审计表接线：中文列登记进 textCols，时间/方法/URI/IP/HTTP/耗时保持等宽；
 * 3) 用户/集群槽位不再套 .mono（派生展示跟随列字体档）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

describe('QRT 阅读增强档（688）', () => {
  it('Props 契约：textCols / readable 缺省零增量', () => {
    expect(qrt).toMatch(/textCols\?: string\[\];/);
    expect(qrt).toMatch(/readable\?: boolean;/);
    expect(qrt).toMatch(/textCols: undefined,\s*\n\s*readable: false,/);
  });
  it('单元格命中 textCols 挂 qrt-cell-text；table 挂 readable 类', () => {
    expect(qrt).toContain("'qrt-cell-text': textColSet.has(shownCols[ci] ?? '')");
    expect(qrt).toContain("readable: props.readable");
  });
  it('文本列走正文字体、line-height 锁 16.5px（行距与默认 25.5px 同高）', () => {
    expect(qrt).toMatch(/\.qrt-tbl \.qrt-cell\.qrt-cell-text \{[^}]*font-family:\s*var\(--font\);[^}]*font-size:\s*var\(--fs-sm\);[^}]*line-height:\s*16\.5px/s);
    expect(qrt).toMatch(/\.qrt-tbl\.readable \{[^}]*font-size:\s*var\(--fs-sm\)/s);
    expect(qrt).toMatch(/\.qrt-tbl\.readable th, \.qrt-tbl\.readable \.qrt-cell \{[^}]*line-height:\s*16\.5px/s);
  });
});

describe('审计表接线（688）', () => {
  it('中文列清单单调派生（单一出处），与 AUDIT_COLS 同域', () => {
    expect(sec).toMatch(/const AUDIT_TEXT_COLS = \['用户', '角色', '来源', '动作', '集群', '详情'\];/);
    expect(sec).toMatch(/:text-cols="AUDIT_TEXT_COLS"\s*\n\s*readable/);
  });
  it('用户/集群槽位不再套 .mono（跟随列字体档）', () => {
    expect(sec).toMatch(/<template #cell-用户="\{ value \}"><span>\{\{ value \}\}<\/span><\/template>/);
    expect(sec).toMatch(/<template #cell-集群="\{ value \}"><span v-tip="value" style="color: var\(--tx2\)">\{\{ value \|\| '-' \}\}<\/span><\/template>/);
  });
  it('等宽列保持等宽（时间/方法/URI/IP/耗时）', () => {
    expect(sec).toMatch(/<TimeCell :ts="value" abs \/>/);
    expect(sec).toMatch(/<span class="mono" :class="'m-' \+ String\(value \|\| ''\)\.toLowerCase\(\)">/);
    expect(sec).toContain('class="mono uri"');
    expect(sec).toMatch(/<span class="mono" style="color: var\(--tx2\)">\{\{ value \|\| '-' \}\}<\/span>/); /* IP */
    expect(sec).toMatch(/<span class="mono" :style="Number\(value\) > 1000/); /* 耗时 */
  });
});
