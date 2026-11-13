/**
 * 一千三百二十八批：SQL 页头「转 DSL / 收藏」两个钮既无 title 也无 aria-label。
 *
 * 真机（1440，填入 SQL 后逐个读 `.ph-r button` 的属性）：
 *   示例     title=null            ← 也有问题（见下）
 *   字段体检 title="探测当前索引字段…"
 *   转 DSL   title=null  aria=null  ← 用户只能靠猜
 *   收藏     title=null  aria=null  ← 同上
 *   历史     title="查询历史"
 *   执行     title="执行（Ctrl+⏎）"
 *
 * 一排六个按钮，四个有说明、两个没有 —— 这不是风格差异，是**信息缺口**：
 * 「转 DSL」到底转到哪、「收藏」存到哪，字面都答不出来。
 *
 * 本 spec 锁：
 *  - 「转 DSL」「收藏」必须有可读 title 或 aria-label；
 *  - 文案要写清**前置条件**（禁用态浏览器不弹 title，所以「先写一条 SQL」必须写在文案里）；
 *  - 「转 DSL」在 busy 时的文案要说明为什么现在不能点。
 * 负控：把 title 绑成静态常量（不随状态变）→ 第三条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

function btnBlock(label: string): string {
  /* 用模板里的 <button …>标签行定位（注释里也会出现「转 DSL」这类文字，
     直接 indexOf 文案会命中注释，取到空块并让断言假红） */
  const re = new RegExp(`<button[^>]*>[\\s\\S]{0,40}?${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const m = src.match(re);
  expect(m, `必须存在按钮「${label}」`).toBeTruthy();
  const start = m!.index!;
  const end = src.indexOf('</button>', start);
  return src.slice(start, end);
}

describe('1328 SQL 页头按钮的可发现性', () => {
  it('「转 DSL」「收藏」都带可读说明', () => {
    for (const lb of ['转 DSL', '收藏']) {
      const blk = btnBlock(lb);
      const hasName = /:title=|title=/.test(blk) || /aria-label=/.test(blk);
      expect(hasName, `按钮「${lb}」必须有 title 或 aria-label`).toBe(true);
    }
  });

  it('禁用原因写在文案里（禁用态不弹 title，所以不能只靠 title）', () => {
    expect(btnBlock('转 DSL'), '转 DSL 要说明「先写一条 SQL」').toContain('先写一条 SQL');
    expect(btnBlock('收藏'), '收藏要说明「先写一条 SQL」').toContain('先写一条 SQL');
  });

  it('「转 DSL」的文案随执行态变化（busy 要给理由，不能只是变灰）', () => {
    const blk = btnBlock('转 DSL');
    expect(blk, '必须有 busy 分支文案').toMatch(/busy\s*\?/);
    expect(blk, 'busy 时要说明「执行中」').toMatch(/执行中/);
  });
});