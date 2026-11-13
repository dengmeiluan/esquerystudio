/**
 * 一千三百五十七批：工具行里同一个动作摊了两遍（行内图标钮 + 「更多 ⋯」菜单项）。
 *
 * 真机取证（DSL 工作台，1440×900 渲染出工具行后逐项读取）：
 *
 *   RT 工具行 14 项，其中「查看原始 IO（DSL 查询）」在**行内**有一个图标钮，
 *   点「更多 ⋯」菜单里**还有**一项「查看原始 IO（最近一次查询请求/响应）」——
 *   两者调用同一个 openRawIo。索引工作区的 docs / query 两个 tab 同款重复。
 *
 * 项目右键约定明写「never duplicate an action」：一个动作只应有一个入口。
 * 低频排查入口留在菜单里即可（菜单本来就是「一次看全」的地方），行内那格让出来。
 * 顺带：RT 工具行从 14 项降到 13 项，1024 档「平铺成两行」的压力同步减轻。
 *
 * 本 spec 锁：
 *  ① DSL 工作台 bar-extra 不再有行内「查看原始 IO」钮；
 *  ② 菜单项 dq-raw-io 仍在（能力不许跟着按钮一起消失）；
 *  ③ 索引工作区两个 tab 同款收口，且两条菜单项都在；
 *  ④ 失败态常驻的 RawIo 钮**不许**被误删（那是 resp=null 时唯一的取数入口）；
 *  ⑤ 负控：把行内钮加回去 → ① 必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

/** 取某个 `<template #bar-extra>` 块（只到最近的 </template>） */
function barExtra(src: string): string {
  const i = src.indexOf('<template #bar-extra>');
  expect(i, '必须有 bar-extra 插槽').toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('</template>', i));
}

describe('1357 工具行不许把同一动作摊两遍', () => {
  it('① DSL 工作台 bar-extra 无行内「查看原始 IO」钮', () => {
    expect(barExtra(dq), '行内钮必须退役').not.toContain('aria-label="查看原始 IO（DSL 查询）"');
  });

  it('② 菜单项仍在（能力不跟着按钮一起消失）', () => {
    expect(dq, '「更多」菜单里的原始 IO 项必须在').toContain("key: 'dq-raw-io'");
  });

  it('③ 索引工作区两个 tab 同款收口，两条菜单项都在', () => {
    const blocks = [...ih.matchAll(/<template #bar-extra>[\s\S]*?<\/template>/g)].map(m => m[0]);
    expect(blocks.length, '两个 tab 各一个 bar-extra').toBeGreaterThanOrEqual(2);
    for (const b of blocks) {
      expect(b, '行内原始 IO 钮必须退役').not.toContain('aria-label="查看原始 IO（文档检索）"');
      expect(b, '行内原始 IO 钮必须退役（DSL 查询）').not.toContain('aria-label="查看原始 IO（DSL 查询）"');
    }
    expect(ih, 'docs tab 菜单项在').toContain("key: 'ih-raw-io-docs'");
    expect(ih, 'query tab 菜单项在').toContain("key: 'ih-raw-io-query'");
  });

  it('④ 失败态常驻 RawIo 钮不许被误删（resp=null 时唯一取数入口）', () => {
    /* 失败态钮的识别方式：它带 `btn sm`（不是工具行的 rt-tool-btn），
       不靠换行位置判断（格式化一改就误报）。 */
    const failBtn = /<button class="btn sm" aria-label="查看原始 IO（DSL 查询）"/;
    expect(dq, 'DSL 失败行必须保留常驻原始 IO 钮').toMatch(failBtn);
    expect(ih, '索引失败行必须保留常驻原始 IO 钮').toContain('aria-label="查看原始 IO（检索行）"');
  });

  it('⑤ 负控：把行内钮加回 bar-extra → ① 必须红', () => {
    const injected = dq.replace('<template #bar-extra>',
      '<template #bar-extra>\n<button aria-label="查看原始 IO（DSL 查询）"></button>');
    expect(injected, '负控必须真的改掉模板').not.toBe(dq);
    expect(barExtra(injected), '加回后必须判不合格').toContain('aria-label="查看原始 IO（DSL 查询）"');
  });
});
