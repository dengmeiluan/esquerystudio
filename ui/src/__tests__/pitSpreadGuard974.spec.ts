/**
 * PIT 缓冲增量分块——batchSize 输入框的 max 属性只约束步进控件，键盘直输不拦截；
 * PIT search_after 深分页亦无服务端单批硬顶：单批 hits 达数万级时
 * buffer.push(...hits) 的 spread 展开撞引擎参数上限（RangeError: Maximum call
 * stack size exceeded），异常冒出 while 循环整轮拉取中断、当前批次计数丢失。
 * 分块进栈后单批任意大小安全。锁定（静态）：spread 直推退役、分块循环在场。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pitSrc = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT 缓冲增量分块（spread 越引擎参数上限防御）', () => {
  it('buffer 增量分块进栈，spread 直推形态退役', () => {
    expect(pitSrc, 'spread 直推形态退役').not.toMatch(/buffer\.value\.push\(\.\.\.hits\)/);
    /* 单行同步循环形态已随块间让出退役（pitYield980 锁让出形态），本锁放宽为
       分块调用在场——分块防御语义保持，让出维度由 pitYield980 承接 */
    expect(pitSrc, '分块进栈在场').toMatch(
      /buffer\.value\.push\(\.\.\.hits\.slice\(i, i \+ \d+\)\)/,
    );
  });
});
