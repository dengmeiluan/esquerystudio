/**
 * 五百六十一批（RA 面）：ReindexAdvancedView 三件收口看守（源码级静态锚）。
 *  A 五参数（slices / requests_per_second / scroll / timeout / wait_for_active_shards）
 *    裸 input+useInputLint 失焦校验形态已随批退役换 naive 组件——档位/单位枚举走
 *    NSelect（options 常量），数值走 NInputNumber（min/precision/validator 内建约束
 *    替代 SLICES_RE/RPS_RE/TIME_RE 正则 hint 档）；label/控件 :title 中文释义双挂
 *    口径保持（随迁锁：每参数恰好 2 处同文）；
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

/* 五参数 → naive 组件接线锚（title 双挂文案 + 模式/数值/单位三形） */
const PARAMS: { model: string; title: string; mode?: string; opts?: string; num?: string; unit?: string }[] = [
  { model: 'slices', title: 'slices：并行切片数——auto 交 ES 自定，或正整数', mode: 'slicesMode', opts: 'SLICES_MODE_OPTS', num: 'slicesNum' },
  { model: 'requestsPerSecond', title: 'requests_per_second：每秒限流——-1 不限，或数字（可小数）', num: 'requestsPerSecondNum' },
  { model: 'scroll', title: 'scroll：滚动快照保活时长——数字+单位（ms/s/m/h/d），如 5m', num: 'scrollNum', unit: 'scrollUnit' },
  { model: 'timeout', title: 'timeout：请求超时时长——数字+单位（ms/s/m/h/d），如 1m', num: 'timeoutNum', unit: 'timeoutUnit' },
  { model: 'waitForActiveShards', title: 'wait_for_active_shards：执行前须活跃的分片数——all 或整数，如 1', mode: 'wfasMode', opts: 'WFAS_MODE_OPTS', num: 'wfasNum' },
];

describe('A 五参数 naive 组件接线（561 批裸 input+失焦校验形态随迁）', () => {
  it('NSelect/NInputNumber 组件导入在场', () => {
    expect(src).toMatch(/import \{ NSelect, NInputNumber \} from 'naive-ui';/);
  });

  it('五参数 label/控件 :title 中文释义双挂（每参数同文恰 2 处）', () => {
    for (const p of PARAMS) {
      expect(count(src, `title="${p.title}"`), `${p.model} 的 :title 释义须 label/控件双挂`).toBe(2);
    }
  });

  it('模式档参数（slices/wfas）：NSelect 档位 + 条件 NInputNumber（min=1 整数内建）', () => {
    for (const p of PARAMS.filter(x => x.mode)) {
      expect(src, `${p.model} 档位 select 必须接线`).toContain(`v-model:value="${p.mode}" :options="${p.opts}"`);
      expect(src, `${p.model} 自定义整数框必须条件渲染`).toContain(`v-if="${p.mode} === 'custom'" v-model:value="${p.num}" :min="1" :precision="0"`);
    }
    expect(src).toContain("{ label: 'auto（ES 自定）', value: 'auto' },");
    expect(src).toContain("{ label: 'all（全部活跃）', value: 'all' },");
  });

  it('requests_per_second：NInputNumber min=-1 + validator 排除 (-1,0) 开区间（RPS_RE 值域随迁）', () => {
    expect(src).toContain('v-model:value="requestsPerSecondNum" :min="-1" :validator="numOrMinusOne"');
    expect(src).toContain('const numOrMinusOne = (v: number): boolean => v === -1 || v >= 0;');
  });

  it('时间参数（scroll/timeout）：数值+单位双控件（min=-1 整数 + 五单位 NSelect，TIME_RE 值域随迁）', () => {
    for (const p of PARAMS.filter(x => x.unit)) {
      expect(src, `${p.model} 数值框必须接线`).toContain(`v-model:value="${p.num}" :min="-1" :precision="0" :validator="numOrMinusOne"`);
      expect(src, `${p.model} 单位下拉必须接线`).toContain(`v-model:value="${p.unit}" :options="TIME_UNIT_OPTS"`);
    }
    for (const u of ['ms', 's', 'm', 'h', 'd']) {
      expect(src, `TIME_UNIT_OPTS 须含 ${u} 档`).toContain(`{ label: '${u}', value: '${u}' },`);
    }
  });

  it('串域桥在场（五参数真相仍是字符串域，finalQs/submit/草稿链零变化）', () => {
    expect(src).toMatch(/const slices = computed<string>\(\{/);
    expect(src).toMatch(/const requestsPerSecond = computed<string>\(\{/);
    expect(src).toMatch(/const waitForActiveShards = computed<string>\(\{/);
    expect(src, "scroll/timeout 经 raTimeParam 同构桥（'-1' 无单位分支钦定）").toContain("num.value === -1 ? '-1' : num.value + unit.value");
    /* 旧裸 input+失焦校验形态不回潮（备案注释可留，import/调用/CSS 形态必须清零） */
    expect(src, '@blur 校验档退役').not.toContain('@blur=');
    expect(src, '.il-hint 行内提示档退役').not.toContain('il-hint');
    expect(src, 'useInputLint import 退役').not.toMatch(/from '\.\.\/composables\/useInputLint/);
    expect(src, 'useInputLint 调用点退役').not.toMatch(/useInputLint\(\[/);
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
