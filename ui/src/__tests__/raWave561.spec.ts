/**
 * 五百六十一批（RA 面）：ReindexAdvancedView 三件收口看守（源码级静态锚）。
 *  A 五参数裸 input（slices / requests_per_second / scroll / timeout / wait_for_active_shards）
 *    接 useInputLint 既有正则（SLICES_RE / RPS_RE / TIME_RE；wfas 无既有正则内联 all/整数）
 *    ——@blur 失焦校验出 .il-hint + 输入即清 watch + label/input :title 中文释义
 *    （UpdateByQueryView :52/:68 姊妹面先例口径，hint msg 逐字同源）；
 *  B .ra-result 双色横幅分档单源化——err 档挂 theme.css .err-bar（role=alert），
 *    ok 档素底（去 border/radius 双写，保 ok-soft 语义绿）；
 *  C .ra-lint 私有三件套退役 → theme.css 单源 .lint-bar/.lint-bar-warn/.lint-bar-err
 *    直接消费（DOM 结构保形）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/ReindexAdvancedView.vue'), 'utf-8');
const style = src.slice(src.indexOf('<style scoped>'));
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/* 五参数 → 校验接线三件套（v-model / check / clear）与既有正则 msg 口径 */
const PARAMS = [
  { model: 'slices', check: 'slicesCheck(slices)', clear: 'slicesClear', rule: "patternRule(SLICES_RE, 'slices：auto 或整数')", title: 'slices：并行切片数——auto 交 ES 自定，或正整数' },
  { model: 'requestsPerSecond', check: 'rpsCheck(requestsPerSecond)', clear: 'rpsClear', rule: "patternRule(RPS_RE, 'requests_per_second：-1 不限，或数字（可小数）')", title: 'requests_per_second：每秒限流——-1 不限，或数字（可小数）' },
  { model: 'scroll', check: 'scrollCheck(scroll)', clear: 'scrollClear', rule: "patternRule(TIME_RE, 'scroll：数字+单位（ms/s/m/h/d），如 5m')", title: 'scroll：滚动快照保活时长——数字+单位（ms/s/m/h/d），如 5m' },
  { model: 'timeout', check: 'timeoutCheck(timeout)', clear: 'timeoutClear', rule: "patternRule(TIME_RE, 'timeout：数字+单位（ms/s/m/h/d），如 1m')", title: 'timeout：请求超时时长——数字+单位（ms/s/m/h/d），如 1m' },
  { model: 'waitForActiveShards', check: 'wfasCheck(waitForActiveShards)', clear: 'wfasClear', rule: "patternRule(/^all$|^\\d+$/, 'wait_for_active_shards：all 或整数')", title: 'wait_for_active_shards：执行前须活跃的分片数——all 或整数，如 1' },
];

describe('A 五参数 il-hint 校验接线（561 批）', () => {
  it('useInputLint 既有正则单源导入在场（SLICES_RE/RPS_RE/TIME_RE + patternRule）', () => {
    expect(src).toMatch(/import \{ useInputLint, patternRule, SLICES_RE, RPS_RE, TIME_RE \} from '\.\.\/composables\/useInputLint'/);
  });

  it('五参数各自 @blur 失焦校验 + .il-hint 行内提示 + 输入即清 watch', () => {
    for (const p of PARAMS) {
      expect(src, `${p.model} 的 @blur 校验必须接线`).toContain(`@blur="${p.check}"`);
      const hintVar = p.clear.replace(/Clear$/, '');
      expect(src, `${p.model} 的 .il-hint 消费必须在场`).toContain(
        `<div v-if="${hintVar}Hint" class="il-hint" :class="'il-' + ${hintVar}Level">{{ ${hintVar}Hint }}</div>`);
      expect(src, `${p.model} 输入即清必须接线`).toContain(`watch(${p.model}, () => ${p.clear}());`);
    }
  });

  it('五条 patternRule 口径逐字（UBQ 姊妹面同参数 msg 同源；wfas 内联 all/整数）', () => {
    for (const p of PARAMS) {
      expect(src, `${p.model} 的校验口径必须逐字在册`).toContain(p.rule);
    }
  });

  it('label/input :title 中文释义双挂（每参数 label 与 input 各一处）', () => {
    for (const p of PARAMS) {
      expect(count(src, `title="${p.title}"`), `${p.model} 的 :title 释义须 label/input 双挂`).toBe(2);
    }
  });
});

describe('B ra-result 横幅分档单源（561 批）', () => {
  it('err 档挂 theme.css .err-bar + role=alert；ok 档 .ra-result（单节点三元改用）', () => {
    expect(src).toContain(`:class="result?.error ? 'err-bar' : 'ra-result'"`);
    expect(src).toContain(`:role="result?.error ? 'alert' : undefined"`);
  });

  it('ok 档素底（ok-soft 在场，border/radius 双写退役）；私造 .ra-result.err 规则退役', () => {
    const rule = src.match(/^\.ra-result \{[^}]*\}$/m);
    expect(rule, '.ra-result 规则必须在场').toBeTruthy();
    expect(rule![0]).toContain('var(--ok-soft)');
    expect(rule![0]).not.toMatch(/\bborder\b/);
    expect(rule![0]).not.toMatch(/\bradius\b/);
    expect(style).not.toContain('.ra-result.err');
  });
});

describe('C ra-lint 私有规则退役换 lint-bar 单源（561 批）', () => {
  it('四处体检条改用 lint-bar-err/-warn（err×2 warn×2，role 语义保形）', () => {
    expect(count(src, 'class="lint-bar lint-bar-err"')).toBe(2);
    expect(count(src, 'class="lint-bar lint-bar-warn"')).toBe(2);
    expect(count(src, 'class="ra-lint')).toBe(0);
  });

  it('.ra-lint 私有样式三件套退役（scoped style 零规则残留）', () => {
    expect(style).not.toMatch(/^\.ra-lint/m); /* 退役备案注释可留，CSS 规则必须清零 */
    expect(src).toContain('.lint-bar');
  });
});
