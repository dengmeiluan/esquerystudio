/**
 * 五百四十三批·W4（工蚁 W4）：壳退役约定第四波（SqlConsoleView sq-card 全族 9 卡）· 契约备案。
 *
 * 仿 flattenWave540 静态源码断言范式（happy-dom 不挂载）：
 * ① 壳退役负锁（538 §6v 约定①语言）：sq-card 模板类全形态清零 + CSS 规则（bg/border/radius 壳）
 *    清零；sq-card-hd/-hd-r 连字类保留作模板锚（pt-card-hd 538 先例：壳死 hd 类名不陪葬）。
 * ② 正锁（承接形态在场）：
 *    - sq-editor 约定③编辑器外框退役（内容直贴）：分界由 sq-card-hd 既有 border-bottom 承接；
 *      Monaco 100% 高容器防撑破 overflow 承接保留（rd/sy 540 先例：overflow 是结构语义非
 *      chrome），sqlLint534 锁行逐字不动、overflow 单列一条零触锁。
 *    - sq-sec 分节类（dslPreview/结果卡）：538 pt-sec/uq-sec 同语言 border-top 分节 + wide
 *      网格占位同步更新（grid-column: 1 / -1）。
 *    - sq-blank 空态直贴占位：busy/初始空态 EmptyState 不套空框（约定④「空态不留整块空框」），
 *      仅留 wide 网格占位，无壳无线。
 *    - sq-card-hd 行首横排档（538 .uq-script-hd→约定② 同语言）：border-bottom 分界 + 650。
 * ③ 豁免正锁（保留面防误退）：sq-alert/sq-warn 语义卡（err/warn 语义边框保留约定）→ sq-panel
 *    语义面板完整壳（bg+border+radius+overflow）在场，视觉零变化；sq-sql-lint banner 双源核对。
 * ④ 恒高字面冻结（纯视觉降层零高度改动，锁现状防回潮）：sq-grid 42vh 弹性行 /
 *    sq-editor flex 骨架 + monaco-host flex 链（sqlLint534 双源核对）/ sq-err-body 200 /
 *    sq-code 内容面 overflow-x 自持。
 * ⑤ sq-samples 降层备案：li:hover 交互态与 role=button 键盘交互是行级语义（不在壳上，wt/fv
 *    540 先例的 hover 在壳级）→ 壳降层、行级交互态逐字保留。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const sql = read('../views/SqlConsoleView.vue');

/* ═══════════ ① 壳退役负锁 ═══════════ */

describe('五百四十三批①：sq-card 壳全形态清零（§6v 约定①防回潮）', () => {
  it('模板壳类清零（class 属性任意段；sq-card-hd 连字类不误伤）', () => {
    expect(sql, 'sq-card 壳类必须退役（border-top 分节/直贴承接）').not.toMatch(/class="[^"]*\bsq-card(?!-)/);
  });

  it('CSS 壳规则清零（bg/通栏 border/radius 不回流；hd 连字选择器不误伤）', () => {
    expect(sql, '.sq-card 规则不回流').not.toMatch(/\.sq-card \{/);
    expect(sql, '.sq-card.wide 占位规则不回流').not.toMatch(/\.sq-card\.wide/);
    expect(sql, 'hd 连字类保留作模板锚（pt-card-hd 538 先例）').toMatch(/\.sq-card-hd \{/);
  });
});

/* ═══════════ ② 正锁（承接形态在场） ═══════════ */

describe('五百四十三批②：约定③④承接形态在场', () => {
  it('sq-editor 约定③内容直贴：overflow 防撑破承接 + flex 骨架逐字（sqlLint534 双源）', () => {
    expect(sql, 'Monaco 100% 高容器 overflow 承接（rd/sy 540 先例）').toMatch(/\.sq-editor \{ overflow: hidden; \}/);
    expect(sql, '高度链骨架逐字（sqlLint534 锁双源核对）').toMatch(/\.sq-editor \{ display: flex; flex-direction: column; min-height: 0; \}/);
    expect(sql).toMatch(/\.sq-editor > :deep\(\.monaco-host\) \{ flex: 1 1 0; min-height: 0; \}/);
  });

  it('sq-sec 分节类（dslPreview/结果卡）：pt-sec 538 同语言 border-top 分节 + wide 同步更新', () => {
    expect(sql).toMatch(/\.sq-sec \{ border-top: 1px solid var\(--border\); padding-top: var\(--sp-1h\); \}/);
    expect(sql, 'wide 网格占位同步更新（pt-sec.wide 同款）').toMatch(/\.sq-sec\.wide \{ grid-column: 1 \/ -1; \}/);
    expect((sql.match(/class="sq-sec wide"/g) || []).length, 'dslPreview + 结果卡两处消费').toBe(2);
  });

  it('sq-blank 空态直贴：busy/初始空态 EmptyState 不套空框（约定④空态不留整块空框）', () => {
    expect(sql, '空态占位类在场').toMatch(/\.sq-blank \{ grid-column: 1 \/ -1; \}/);
    const blanks = sql.match(/class="sq-blank">[\s\S]*?<\/div>/g) || [];
    expect(blanks.length, 'busy + 初始空态两处').toBe(2);
    for (const b of blanks) {
      expect(b, 'EmptyState 直贴（壳/内衬不回流）').toContain('<EmptyState');
      expect(b, '空态内无卡壳内衬').not.toMatch(/class="[^"]*(card|panel|sec)[^"]*"/);
    }
  });

  it('sq-card-hd 行首横排档（538 .uq-script-hd→约定② 同语言）：border-bottom 分界 + 650', () => {
    expect(sql, '分界由 hd border-bottom 承接 + 行首 650（pt-card-hd 同语言）').toMatch(
      /\.sq-card-hd \{ display: flex; align-items: center; justify-content: space-between; padding: var\(--sp-2\) var\(--sp-3\); border-bottom: 1px solid var\(--border\); font-size: var\(--fs-sm\); font-weight: 650; \}/);
  });
});

/* ═══════════ ③ 豁免正锁（保留面防误退） ═══════════ */

describe('五百四十三批③：sq-alert/sq-warn 语义面板豁免在场（err/warn 语义边框保留约定）', () => {
  it('sq-panel 语义面板完整壳在场（bg+border+radius+overflow，视觉零变化）', () => {
    expect(sql).toMatch(
      /\.sq-panel \{ background: var\(--card-bg\); border: 1px solid var\(--border\); border-radius: var\(--r-m\); overflow: hidden; \}/);
    expect(sql).toMatch(/\.sq-panel\.wide \{ grid-column: 1 \/ -1; \}/);
  });

  it('模板三处消费：sq-alert ×2（unavailable/runErr）+ sq-warn ×1（schemaWarnings）', () => {
    expect((sql.match(/class="sq-panel wide sq-alert"/g) || []).length, 'err 语义卡两张').toBe(2);
    expect((sql.match(/class="sq-panel wide sq-warn"/g) || []).length, 'warn 语义卡一张').toBe(1);
    expect(sql, 'warn 语义边框覆盖在场').toMatch(/\.sq-warn \{[^}]*border-color: var\(--warn-line\);/);
  });

  it('sq-sql-lint banner 双源核对（sqlLint534 锁，壳退役不碰 lint 通道；562 批同步更新 lint-bar 改用）', () => {
    expect(sql).toContain('class="lint-bar sq-sql-lint lint-bar-warn" role="status"');
  });
});

/* ═══════════ ④ 恒高字面冻结（零高度改动，锁现状防回潮） ═══════════ */

describe('五百四十三批④：所触视图恒高字面冻结（2.9.115/119 事故面口径）', () => {
  it('sq-grid 42vh 弹性行 + monaco-host flex 链逐字（sqlLint534 双源核对）', () => {
    /* 1136：结果网格优先——42vh→34vh（1440/1024 真机测得 Monaco 高度链正常） */
    expect(sql).toContain('.sq-grid { grid-template-rows: minmax(150px, 34vh); }');
    expect(sql).toContain('.sq-editor { display: flex; flex-direction: column; min-height: 0; }');
    expect(sql).toContain('.sq-editor > :deep(.monaco-host) { flex: 1 1 0; min-height: 0; }');
  });

  it('sq-err-body 200 封顶 + sq-code 内容面 overflow-x 自持逐字在场', () => {
    expect(sql).toMatch(/\.sq-err-body \{[^}]*max-height: 200px; overflow: auto;/);
    expect(sql).toMatch(/\.sq-code \{[^}]*overflow-x: auto;/);
  });
});

/* ═══════════ ⑤ sq-samples 降层备案（行级交互态保留） ═══════════ */

describe('五百四十三批⑤：sq-samples 壳降层（li:hover 在行不在壳，wt/fv 先例不适用）', () => {
  it('行级交互态逐字保留：hover 反馈 + role=button 键盘可达（降层不降交互）', () => {
    expect(sql).toMatch(/\.sq-tpl li:hover \{ background: var\(--code-bg\); \}/);
    expect(sql).toMatch(/role="button" tabindex="0"/);
  });
});
