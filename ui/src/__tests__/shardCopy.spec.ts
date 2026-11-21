/**
 * R130 一百三十三批：IndexHub shards tab 分片分布复制（运维贴工单/群聊高频）。
 * IndexHubView 挂载依赖重（路由+多 API+详情链），沿用 confirmAudit 的源码级锁形态：
 * 1) copyShardTable 函数存在且 Markdown 表头列齐（节点/分片/主副/状态/文档/存储）；
 * 2) 「复制分布表」按钮接线（unassigned 时与诊断按钮并存不互斥）；
 * 3) 分片块单击复制定位（@click 接线 + title 提示更新，悬停可知可复制）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('shards 分布复制（133 批）', () => {
  it('copyShardTable 产出 Markdown 表：六列头+按节点展开行+复制通知', () => {
    expect(src).toMatch(/async function copyShardTable\(\)/);
    expect(src).toMatch(/shardsByNode\.value\.flatMap/);
    expect(src).toMatch(/\| 节点 \| 分片 \| 主\/副 \| 状态 \| 文档 \| 存储 \|/);
    expect(src).toMatch(/已复制 \$\{rows\.length\} 条分片分布（Markdown）/);
  });

  it('「复制分布表」按钮接线且不挤掉诊断按钮', () => {
    expect(src).toMatch(/<button class="btn sm ghost" title="复制分片分布表（Markdown）" @click="copyShardTable">/);
    expect(src).toMatch(/诊断未分配原因/);
  });

  it('分片块单击复制定位：@click 接线+title 提示', () => {
    expect(src).toMatch(/@click="copyShardLocate\(grp\.node, s\)"/);
    expect(src).toMatch(/点击复制分片定位/);
    expect(src).toMatch(/async function copyShardLocate\(node: string, s: any\)/);
    expect(src).toMatch(/已复制分片定位/);
  });
});
