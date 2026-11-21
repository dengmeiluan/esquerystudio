/* R99：TimeCell 接线看守。判据落在**渲染结果**上——
 * title 必须带时区、正文必须是相对时间，二者错一个这个组件就没有存在意义。
 * 范式同 cmdPalette.spec：项目无 @vue/test-utils，用 createApp 手工 mount。 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import TimeCell from '../TimeCell.vue';

/* props 类型取组件自身的 props，而非 Record<string, unknown>——
 * 后者是被 widen 的索引类型，不满足 h() 的重载签名，vue-tsc 会报 TS2769。
 * 测试值一个未改，仅收窄这个形参的类型。 */
type TimeCellProps = InstanceType<typeof TimeCell>['$props'];

function render(props: TimeCellProps): HTMLElement {
  const host = document.createElement('div');
  createApp({ render: () => h(TimeCell, props) }).mount(host);
  return host.firstElementChild as HTMLElement;
}

describe('TimeCell', () => {
  const TS = 1785811977130;

  it('title 带绝对时间与时区', () => {
    expect(render({ ts: TS }).getAttribute('title')).toBe('2026-08-04 10:52:57 (UTC+8)');
  });

  it('正文是相对时间，不是绝对时间', () => {
    expect(render({ ts: Date.now() - 3 * 60000 }).textContent).toContain('m 前');
  });

  it('abs=true 时正文直接是绝对时间', () => {
    expect(render({ ts: TS, abs: true }).textContent).toBe('2026-08-04 10:52:57');
  });

  it('ts 为 null 时显示 -', () => {
    expect(render({ ts: null }).textContent).toBe('-');
  });

  /* 接线看守：组件必须消费 useNow 的心跳值，否则「Xm 前」冻结在渲染瞬间
   * （format.ts:44 / useNow.ts:3 自陈的病灶，也是本组件的存在理由）。
   * 判据：推进共享心跳 ref 后，正文的相对时间必须跟着变。
   * ts 锚在 now.value 而非 Date.now()：useNow 的 ref 在模块导入时取值后
   * 只由 30s 定时器推进，此刻已比真实时钟落后若干毫秒，用 Date.now() 定基准
   * 会让首个断言偶发落到「2m 前」。锚在心跳上则两个断言都是精确值。
   * useNow 是模块级单例，改动后复原，避免污染同文件后续测试。 */
  it('正文随 useNow 心跳自更新（不是冻结在渲染瞬间）', async () => {
    const { useNow } = await import('../../composables/useNow');
    const now = useNow();
    const saved = now.value;
    try {
      const ts = now.value - 3 * 60000;
      const el = render({ ts });
      expect(el.textContent).toBe('3m 前');
      now.value = ts + 9 * 60000;   // 心跳前进
      await nextTick();
      expect(el.textContent).toBe('9m 前');   // 删掉 now.value 这里必红
    } finally {
      now.value = saved;
    }
  });
});
