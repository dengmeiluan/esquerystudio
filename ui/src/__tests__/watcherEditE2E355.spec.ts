/**
 * 三百五十五批：Watcher PUT 编辑变体端到端契约验证——
 * sessionStorage 'esquerystudio.devtools.open' 契约（method=PUT/body=现定义/run=false）
 * 由 DevTools 消费（mkTab 三字段全落位）。锁跨视图契约防单侧漂移。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const watcher = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');
const devtools = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('Watcher PUT 编辑端到端契约（355 批）', () => {
  it('发送侧：PUT+body+run:false 契约字段齐备', () => {
    expect(watcher).toMatch(/function toDevToolsEdit\(w: any\)/);
    expect(watcher).toContain("method: 'PUT'");
    expect(watcher).toContain('body, run: false');
  });
  it('消费侧：DevTools 深链读取 body 字段（mkTab 第四参）', () => {
    expect(devtools).toMatch(/mkTab\(p\.title, p\.method \|\| 'GET', p\.path \|\| '\/', p\.body \|\| ''\)/);
  });
});
