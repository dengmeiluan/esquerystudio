import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/* 键闭环对账（横切第十一轮·存储键读写闭环域）：
 esquerystudio.dsl.body 的写侧全站恒 sessionStorage（DslQueryView 实时镜像 watch +
 TemplateGallery「送 DSL 工作台」），命令面板三个消费命令（收藏当前 DSL/送火焰图/
 翻译 Lucene）读 sessionStorage——localStorage 变体全站零写者，`||` 兜底恒 null
 =死读通道（647-C1 死键类；874-C1「|| 短路第二通道」高发位）。刀面=退役死读
 兜底，sessionStorage 读取通道与写侧镜像契约原样保留。 */

const paletteSrc = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf8');

describe('storage key closure: esquerystudio.dsl.body（878）', () => {
  it('死读通道退役：命令面板不再从 localStorage 读 esquerystudio.dsl.body（零写者恒 null）', () => {
    expect(paletteSrc).not.toContain("localStorage.getItem('esquerystudio.dsl.body')");
  });

  it('现役通道保留：sessionStorage 读取恰三处（收藏/送火焰图/翻译 Lucene 不受刀面波及）', () => {
    const reads = paletteSrc.split("sessionStorage.getItem('esquerystudio.dsl.body')").length - 1;
    expect(reads, 'sessionStorage 读取通道数量').toBe(3);
  });
});
