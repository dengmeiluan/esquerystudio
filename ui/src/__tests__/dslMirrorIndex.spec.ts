/**
 * R130 第七十五批：DSL 镜像 index 契约——跨页联动上下文不再错配。
 * 背景：R54 的 DSL 实时镜像只写 body（esquerystudio.dsl.body），命令面板三个消费命令
 * （收藏当前 DSL / 送火焰图 / 翻译 Lucene）的 index 全取 store.pickedIdx——用户在
 * 别的页面触发时 pickedIdx 可能已切到别的索引，DSL 会收藏/执行到错误索引上。
 * 修：镜像同时写 esquerystudio.dsl.index（所属索引），三命令 index 优先取镜像值。
 * 锁定（静态）：写侧两键同写；消费侧三命令均「镜像优先、pickedIdx 兜底」。
 * 行为由 cmdPalette 既有挂载测试与 favReplay 契约兜底。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const dslSrc = readFileSync(join(SRC, 'views/DslQueryView.vue'), 'utf-8');
const cmdSrc = readFileSync(join(SRC, 'components/CmdPalette.vue'), 'utf-8');

describe('DSL 镜像 index 契约（七十五批）', () => {
  it('写侧：DslQueryView 镜像 body 与 index 同写', () => {
    expect(dslSrc).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.dsl\.body', v\)/);
    expect(dslSrc).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.dsl\.index', store\.pickedIdx\)/);
  });

  it('消费侧：三命令 index 均镜像优先、pickedIdx 兜底（防错配回潮）', () => {
    expect(cmdSrc).toContain('esquerystudio.dsl.index');
    /* 三处消费统一形态：镜像 || pickedIdx */
    const uses = cmdSrc.match(/sessionStorage\.getItem\('esquerystudio\.dsl\.index'\) \|\| store\.pickedIdx/g) ?? [];
    expect(uses.length, '三个命令都应走「镜像优先」形态').toBe(3);
    /* 收藏 payload 与火焰图/lucene 写入不得再直用 pickedIdx 当 DSL 上下文 */
    expect(cmdSrc).not.toMatch(/payload: \{ body, index: store\.pickedIdx \}/);
    expect(cmdSrc).not.toMatch(/flame\.index', store\.pickedIdx/);
    expect(cmdSrc).not.toMatch(/lucene\.index', store\.pickedIdx/);
  });
});
