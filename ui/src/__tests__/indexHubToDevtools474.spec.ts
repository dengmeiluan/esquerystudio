/**
 * 四百七十四批：IndexHub 查询 tab「在 DevTools 打开」（473 DslQuery 对称）——
 * 就地 DSL（dsl ref）+当前索引组装 POST /{index}/_search 经 _prefill 会话契约
 * 带到 DevTools 多标签控制台；qryResp 门控；TerminalSquare 无 import 改用已有
 * ExternalLink 图标。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('IndexHub → DevTools 直达（474 批）', () => {
  it('按钮接线：qryResp 门控+ExternalLink 图标', () => {
    expect(v).toMatch(/<button class="btn sm ghost" :disabled="!qryResp" @click="openQryInDevTools" title="把当前索引与 DSL 带到 DevTools 多标签控制台">/);
    expect(v).toContain('<ExternalLink :size="11" /> DevTools');
  });

  it('openQryInDevTools：_prefill 契约+当前索引路径+stripJsonComments 美化', () => {
    const body = v.slice(v.indexOf('function openQryInDevTools()'), v.indexOf('function openQryInDevTools()') + 700);
    expect(body).toContain("'esquerystudio.devtools.open'");
    expect(body).toContain('dsl.value');
    expect(body).toContain("router.push('/devtools')");
  });
});
