/* 1038 批：脚本源码多行编辑——GenericParams 的 source 键（Painless/脚本体：
   script 查询、script_score、script_fields、function_score.script_score…全部
   汇流在 source 键下）从单行输入升多行 textarea（等宽、三行起、纵向伸缩、关
   拼写检查）。长脚本单行挤排是脚本密集查询的最大编辑痛点；多行值经
   JSON.stringify 转义往返无损（AST 零改动）。其余标量键维持单行输入零增量。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree } from '../utils/queryAst';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

const srcOf = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

describe('1038 source 多行编辑接线', () => {
  it('GenericParams：source 键 textarea 分支（等宽+关拼写+纵向伸缩）', () => {
    const src = srcOf('components/builder/GenericParams.vue');
    expect(src).toMatch(/v-else-if="row\.key === 'source'"/);
    expect(src).toContain('gp-src');
    expect(src).toContain('spellcheck="false"');
  });
  it('多行值 CSS：textarea 行顶对齐（:has 门控，居中基线不复用）', () => {
    const src = srcOf('components/builder/GenericParams.vue');
    expect(src).toContain(':has(.gp-src)');
  });
});

describe('1038 多行往返无损（AST 零改动回归）', () => {
  roundTrip('script 查询多行 source', {
    query: { script: { script: { source: "if (doc['amount'].size() > 0) {\n  return doc['amount'].value * 2;\n}\nreturn 0;", lang: 'painless' } } },
  });
  roundTrip('script_fields 多行 source', {
    script_fields: { doubled: { script: { source: "emit(doc['amount'].value * 2);\n// comment line", lang: 'painless' } } },
  });
});

describe('1038 挂载动线', () => {
  it('source 键渲染 textarea 且多行值保真；其余键维持单行输入', async () => {
    const { createApp, h } = await import('vue');
    const GenericParams = (await import('../components/builder/GenericParams.vue')).default;
    const multiline = "if (doc['amount'].size() > 0) {\n  return 1;\n}";
    let last: any = null;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(GenericParams as any, {
      value: { source: multiline, lang: 'painless' },
      'onUpdate': (v: Record<string, unknown>) => { last = v; },
    }) });
    app.mount(host);
    // source=textarea + 多行值保真
    const ta = host.querySelector('textarea.gp-src') as HTMLTextAreaElement;
    expect(ta, 'source 行 textarea 在场').toBeTruthy();
    expect(ta.value).toBe(multiline);
    expect(ta.getAttribute('spellcheck')).toBe('false');
    // 其余键维持单行输入
    const langInp = host.querySelector('input[data-path="lang"]') as HTMLInputElement;
    expect(langInp, 'lang 维持单行输入').toBeTruthy();
    expect(langInp.value).toBe('painless');
    // 编辑 textarea → emit 保留换行
    ta.value = multiline + '\nreturn 2;';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 30));
    expect(last && (last.source as string).includes('\nreturn 2;'), '多行编辑回写保真').toBe(true);
    expect(last && last.lang).toBe('painless');
    app.unmount();
    host.remove();
  });
});
