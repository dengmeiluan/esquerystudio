/**
 * R91b 守门契约：Mapping 设计器空态文案不许误导。
 * 事故现场：产线 bond_sentiment_news 的 mapping 本身为空（6.x type 层是 {}），
 * 加载成功后 tree=[]，但 empty 区仍显示「未加载 · 输入 index 并点击「加载」」——
 * 用户明明点了加载却被告知未加载。
 *
 * 契约：
 *   1) 存在 loaded 标记，doLoad 成功路径置 true；
 *   2) 模板里「加载成功但无字段」分支（!tree.length && loaded）必须排在
 *      兜底「未加载」分支之前（v-else-if 顺序即优先级）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '..', 'views', 'MappingDesignerView.vue'), 'utf8');

/* #86 五轮：本文件全部断言都对源文本做匹配，注释里的字面同样会命中。
   实测：把真正的 `loaded.value = true` 注释掉、字面仍在时，:22 的 toMatch 照绿
   （加载成功却永不置位 → 回归 R91b 事故本体，而断言漏过）。
   故对"必须真的执行"的断言先剥注释再匹配。顺序类断言（:30 indexOf 比较先后）
   与分支内文案断言（:37 从 `>...<` 提取）不受注释影响，保持原样。 */
const CODE = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('R91b MappingDesigner 空态语义', () => {
  it('doLoad 成功路径置位 loaded 标记', () => {
    expect(src).toMatch(/const loaded = ref\(false\)/);
    // 成功分支（try 内）置 true —— 在剥注释文本上匹配，注释掉的赋值不算数
    expect(CODE).toMatch(/loaded\.value = true/);
  });

  it('「索引无字段」分支存在且排在「未加载」兜底分支之前', () => {
    const emptyLoaded = src.indexOf('!tree.length && loaded');
    const emptyNever = src.indexOf('未加载 · 输入 index 并点击「加载」');
    expect(emptyLoaded).toBeGreaterThan(-1);
    expect(emptyNever).toBeGreaterThan(-1);
    expect(emptyLoaded).toBeLessThan(emptyNever);
  });

  it('「索引无字段」分支文案不含「未加载」字样（不误导）', () => {
    /* 五百二十四批同步更新：分支由裸 div 换 EmptyState compact，文案进 text="…" 属性
       （原 >文本< 提取只适配裸 div 形态），契约不变：含「索引无字段」、不含「未加载」。
       五百二十五批同步更新：分支补 action-text 后原贪婪 [^>]* 会吃进 action-text——
       改非贪婪 [\s\S]*? 锚定首个 text 属性 */
    const m = src.match(/!tree\.length && loaded[\s\S]*?\btext="([^"]*)"/);
    expect(m).toBeTruthy();
    expect(m![1]).toContain('索引无字段');
    expect(m![1]).not.toContain('未加载');
  });
});
