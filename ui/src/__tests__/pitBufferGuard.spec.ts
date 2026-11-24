/**
 * R130 一百九十七批：KeepAlive/常驻内存审计 + PIT 缓冲上限保护。
 * 审计结论（防重扫）：KeepAlive 六页定时器/监听配对健康；liveMonitor 序列全部
 * pushCapped(120)+nodeSeries 未见键清理；PitScroll 拉取计时器 finally 清理。
 * 唯一真实风险：PIT buffer 深分页全量驻内存无上限——加 BUFFER_MAX(20 万条)
 * 达限自动暂停（不 reset），导出清空后可继续。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT 缓冲上限保护（一百九十七批）', () => {
  it('BUFFER_MAX 常量 + 循环内达限自动暂停（不 reset 保留已拉数据）', () => {
    expect(src).toMatch(/const BUFFER_MAX = 200_000;/);
    expect(src).toMatch(/if \(buffer\.value\.length >= BUFFER_MAX\) \{/);
    expect(src).toContain('已自动暂停——请先导出');
    expect(src).toMatch(/pause\.value = true/);
  });
});
