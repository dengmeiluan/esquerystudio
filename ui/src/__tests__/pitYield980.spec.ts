/**
 * PIT 拉取大批次单拍主线程占用——批次大小输入框的 max 只约束步进控件，
 * 键盘直输不拦截，深分页单批可达数万条：分块进栈解决了 spread 展开的引擎
 * 参数上限，但全部分块的 push 仍在同一个宏任务里同步执行，15 万条单批实测
 * 约 2s 全程冻结 UI（进度/日志/计时器/暂停全部无响应）。块间让出主线程把
 * 长任务切片，每片 8192 条毫秒级，拉取期间界面保持可渲染、控制可响应。
 * 锁定（静态）：单行同步 push 循环退役、块间让出在场。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pitSrc = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT 拉取拍内让出（大批次单拍长任务切片）', () => {
  it('push 分块循环块间让出主线程，单行同步形态退役', () => {
    expect(pitSrc, '无让出的单行同步 push 循环退役').not.toMatch(
      /for \(let i = 0; i < hits\.length; i \+= \d+\) buffer\.value\.push\(\.\.\.hits\.slice\(i, i \+ \d+\)\);/,
    );
    expect(pitSrc, '分块进栈保持在场').toMatch(
      /buffer\.value\.push\(\.\.\.hits\.slice\(i, i \+ \d+\)\)/,
    );
    expect(pitSrc, '块间让出在场（多块批次片间交出主线程）').toMatch(
      /if \(i \+ \d+ < hits\.length\) await new Promise\(res => setTimeout\(res, 0\)\);/,
    );
  });
});
