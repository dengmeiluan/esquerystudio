/**
 * 四百二十七批：BulkEditor NDJSON 配对即时校验——「一行动作 + 一行文档」配对错
 * 是 bulk 执行最高频失败源，此前只有执行后报错。修：编辑器下方即时 lint 条——
 * 非法 JSON 行提示/动作与文档行数不匹配提示（delete 自带不需要文档）/配对正常
 * 静默灰。空 body 不出条。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/BulkEditorView.vue'), 'utf-8');

describe('NDJSON 配对即时校验（427 批）', () => {
  it('lint 消费纯函数（443 批抽至 utils/bulkNdjson，行为单测在彼处）', () => {
    /* body 是 Ref：模板外必须 .value 解引用——旧锁 String(body || '') 恒收
       "[object Object]" 一行，配对 lint 永久报「1 行不是合法 JSON」且真实内容永不参与校验 */
    expect(v).toMatch(/const ndjsonLint = computed\(\(\) => ndjsonLintOf\(String\(body\.value \|\| ''\)\)\);/);
    expect(v).toContain("import { ndjsonLint as ndjsonLintOf } from '../utils/bulkNdjson';");
  });

  it('校验条 UI：Monaco 下方、warn 态琥珀样式', () => {
    /* 五百六十二批同步更新：warn 态改用 theme.css .lint-bar-warn 单源（561 约定，be-lint-warn
       锚并存，scoped 琥珀私档退役）；info 态保 .be-hint 基础档。⚠warn 态不并挂 be-hint：
       其 code-bg 底/muted 色以 scoped 权重压过 lint-bar-warn 单源档 */
    expect(v).toMatch(/<div v-if="ndjsonLint" :class="ndjsonLint\.level === 'warn' \? 'be-lint-warn lint-bar lint-bar-warn' : 'be-hint'">/);
    expect(v).not.toMatch(/\.be-hint\.be-lint-warn/);
    expect(v).toContain("<div class=\"be-hint\">");
  });
});
