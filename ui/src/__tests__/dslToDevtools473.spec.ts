/**
 * 四百七十三批：DslQuery「在 DevTools 打开」——快速联动补漏：查询工作台调好的
 * DSL 此前无法带到多标签控制台（需手动复制→开 DevTools→新建→粘贴四步）。
 * 通道复用 _prefill 会话契约（Snapshots/Ilm 同款）：当前索引+DSL 组装
 * POST /{index}/_search，pretty 后 run:true 直达结果；resp 存在才启用。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('DslQuery → DevTools 直达（473 批）', () => {
  it('工具行按钮存在且 resp 门控', () => {
    expect(v).toMatch(/<button class="btn sm" @click="openInDevTools" :disabled="!resp" title="把当前索引与 DSL 带到 DevTools 多标签控制台[^"]*">/);
    expect(v).toContain('<TerminalSquare :size="13" /> DevTools');
  });

  it('openInDevTools：_prefill 会话契约+索引路径组装+run 直达', () => {
    expect(v).toMatch(/function openInDevTools\(\) \{/);
    const body = v.slice(v.indexOf('function openInDevTools()'), v.indexOf('function openInDevTools()') + 700);
    expect(body).toContain("'esquerystudio.devtools.open'");
    expect(body).toContain("'/_search'");
    expect(body).toContain('run: true');
    expect(body).toContain("router.push('/devtools')");
  });
});
