/**
 * 二百八十五批：索引工作区→查询工作台带词跳转（?q= 深链预填 query_string DSL）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hub = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('跨页带词跳转（285 批）', () => {
  it('IndexHub：docsQ 非空经 ?q= 跳转', () => {
    expect(hub).toMatch(/goto\(docsQ\.trim\(\) \? '\/search\?q=' \+ encodeURIComponent\(docsQ\.trim\(\)\) : '\/search'\)/);
  });
  it('DslQuery：?q= 深链预填 query_string DSL+消费即清', () => {
    expect(dq).toMatch(/const qLink = useUrlState\('q'\);/);
    expect(dq).toMatch(/JSON\.parse\(buildDocsDsl\(kw, 20\)\)/);
    expect(dq).toMatch(/qLink\.value = '';/);
  });
});
