/**
 * 五百三十五批 W9：useTierCycle 泛型档循环统一件——IlmView（宽度档）/ConfigValidatorView
 * （px 高度档）示范迁移的配套单测。行为口径：
 * ① 默认档 defVal 优先、缺省回 tiers[0]；
 * ② cycle 顺序循环、末档回首档；
 * ③ 越档脏值（存储里不在档内的历史值）读取侧回落默认档，cycle 一次把 tiers[0] 写回；
 * ④ 落盘走 usePref 键（esquerystudio.pref.<key>，JSON 序列化）；
 * ⑤ 泛型罩 string 档（vh 档形态）。
 * 键名/档值序的行为锁在 configValidatorAdjustW2.spec.ts（configvalidator.issuesH 240/380/560），
 * 此处只锁统一件自身语义。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useTierCycle } from '../composables/useTierCycle';

/* usePref 落盘走 watch（异步 flush），cycle 后让微任务排空再断言存储 */
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
});

describe('useTierCycle 泛型档循环统一件（W9 五百三十五批）', () => {
  it('① 默认档：defVal 优先，缺省回 tiers[0]', () => {
    expect(useTierCycle('tierc.def1', [10, 20, 30], 20).v.value).toBe(20);
    expect(useTierCycle('tierc.def2', [10, 20, 30]).v.value).toBe(10);
  });

  it('② cycle 顺序循环：380→560→240→380（ConfigValidator 档序同款）', () => {
    const { v, cycle } = useTierCycle('tierc.loop', [240, 380, 560], 380);
    expect(v.value).toBe(380);
    cycle();
    expect(v.value).toBe(560);
    cycle();
    expect(v.value).toBe(240);
    cycle();
    expect(v.value).toBe(380);
  });

  it('③ 越档脏值：读取侧回落默认档（不把坏值喂给 CSS/请求），cycle 一次写回 tiers[0]', async () => {
    localStorage.setItem('esquerystudio.pref.tierc.dirty', JSON.stringify(999));
    const { v, cycle } = useTierCycle('tierc.dirty', [10, 20, 30]);
    expect(v.value, '脏值读取即回默认档').toBe(10);
    cycle();
    await flush();
    expect(v.value).toBe(10);
    expect(localStorage.getItem('esquerystudio.pref.tierc.dirty')).toBe('10');
  });

  it('④ 落盘走 usePref 键（esquerystudio.pref.<key>，JSON 序列化）', async () => {
    const { cycle } = useTierCycle('tierc.persist', [240, 380, 560], 380);
    cycle();
    await flush();
    expect(localStorage.getItem('esquerystudio.pref.tierc.persist')).toBe('560');
  });

  it('⑤ 泛型罩 string 档（vh 档形态）', async () => {
    const { v, cycle } = useTierCycle<string>('tierc.vh', ['30vh', '42vh', '60vh'], '42vh');
    expect(v.value).toBe('42vh');
    cycle();
    await flush();
    expect(v.value).toBe('60vh');
    expect(localStorage.getItem('esquerystudio.pref.tierc.vh')).toBe('"60vh"');
  });
});
