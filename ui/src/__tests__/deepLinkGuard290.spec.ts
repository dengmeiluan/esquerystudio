/**
 * 二百九十批：URL 深链守卫——可分享性登记。
 * 全站 ?key= 深链（newdoc/q/create 等 useUrlState 消费）必须「消费即清」或幂等，
 * 防刷新重灌/重复弹窗；新深链须在本守卫登记。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const dq = read('../views/DslQueryView.vue');

describe('URL 深链守卫（290 批）', () => {
  it('已知深链登记：newdoc（弹窗直开）/ q（带词预填，285 批）', () => {
    expect(dq).toMatch(/const newDocLink = useUrlState\('newdoc'\)/);
    expect(dq).toMatch(/const qLink = useUrlState\('q'\)/);
  });
  it('q 深链消费即清（防刷新重灌）', () => {
    expect(dq).toMatch(/qLink\.value = '';/);
  });
});
