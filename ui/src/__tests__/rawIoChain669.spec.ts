/**
 * 六百六十九批 件A：IH openRawIo 特征链扩容（②-4 末项本体落地）。
 *
 * 还原备案（667-C1/668 三演纪律）：551 头注 ②③④=IH 判空补齐（当时单特征）、565 原文=
 * 「DQ openRawIo 特征链扩容五写路径（IH 侧被 track2Wave551 黑名单锁冻结备案）」——IH 侧
 * 同款扩容即欠账本体。DQ 现状（550 双特征+565 五写路径）=六特征链；IH 写路径清单实锚=
 * update-document（:1757 编辑保存）/delete-by-id（:1799 单删+:1822 批量删）/profile（554
 * Profile 通道）三特征欠账；IH 无新建文档/delete-by-query/PIT 面=负锚备案（DQ 特征链三
 * 成员本页不适用）。ops 档 560 双参语义零触。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('669 A：IH openRawIo query 档特征链扩容（DQ 550/565 口径本页平移）', () => {
  it('A1 query 档四特征回退链（query→profile→update-document→delete-by-id）', () => {
    expect(ih).toMatch(/function openRawIo\(scope: 'query' \| 'ops' = 'query'\) \{\s*const rec = scope === 'ops'\s*\? \(ioRecorder\.last\('\/cluster\/raw'\) \?\? ioRecorder\.last\('\/cluster\/query'\)\)\s*: \(ioRecorder\.last\('\/cluster\/query'\)\s*\?\? ioRecorder\.last\('\/cluster\/profile'\)\s*\?\? ioRecorder\.last\('\/cluster\/update-document'\)\s*\?\? ioRecorder\.last\('\/cluster\/delete-by-id'\)\);/);
  });
  it('A2 判空 notify scope 分档文案零触（551 约定面）', () => {
    expect(ih).toContain('暂无运维原始 IO 记录，先在本页执行一次运维操作（记录环近 30 条）再查看');
    expect(ih).toContain('暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看');
    expect(ih).toMatch(/if \(!rec\) \{ store\.notify\('info', scope === 'ops' \? '[^']+' : '[^']+'\); return; \}/);
  });
  it('A3 ops 档语义零触（raw 优先回退 query，560 约定面）', () => {
    expect(ih).toMatch(/\? \(ioRecorder\.last\('\/cluster\/raw'\) \?\? ioRecorder\.last\('\/cluster\/query'\)\)/);
  });
});

describe('669 B：DQ 六特征链回归锚（565 本体零触防过收）', () => {
  it('B1 DQ 特征链六成员在场（565 扩容态保持）', () => {
    for (const f of ['/cluster/query', '/cluster/profile', '/cluster/update-document', '/cluster/doc', '/cluster/delete-by-id', '/cluster/delete-by-query', '/cluster/pit/']) {
      expect(dq).toContain(`ioRecorder.last('${f}')`);
    }
  });
});

describe('669 C：IH 负锚——本页不存在面的特征不入链（669 还原备案）', () => {
  it('C1 IH 全文无新建文档/delete-by-query/PIT 特征（负锚）', () => {
    expect(ih).not.toContain("ioRecorder.last('/cluster/doc')");
    expect(ih).not.toContain("ioRecorder.last('/cluster/delete-by-query')");
    expect(ih).not.toContain("ioRecorder.last('/cluster/pit/')");
  });
});
