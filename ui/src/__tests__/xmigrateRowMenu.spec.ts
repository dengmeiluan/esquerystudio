/**
 * R130 一百八十五批：Xmigrate 作业行菜单（E 组逐表过 dbx 清单）。
 * 五百二十九批 W-C 换壳 QRT 后的现状判定：行级 contextmenu 让位内核列管理（全站 QRT
 * 消费方一致口径）；菜单入口改行尾钮（左键/右键皆开）；「展开收起详情」条目退役——
 * 行展开由内核行尾钮/焦点行 E 键承接（TableExpandRow，宿主不可程序化控制）；列管理白得。
 * 锁定：行尾菜单钮接 CellContextMenu（复制 jobId/复制作业信息），内核展开钮在位。
 * 源码锁（菜单交互由 CellContextMenu 共享件行为覆盖，此处锁接线与条目语义）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('Xmigrate 作业行菜单（一百八十五批，529 随壳迁行尾入口）', () => {
  it('行尾菜单钮接 contextmenu；CellContextMenu 渲染标题与菜单项', () => {
    expect(src).toMatch(/@contextmenu\.stop\.prevent="openJobMenu\(\$event, rowJob\(row\)\)"/);
    expect(src).toMatch(/<CellContextMenu v-if="jobMenu" :x="jobMenu\.x" :y="jobMenu\.y" :title="jobMenu\.job\.destIndex \|\| jobMenu\.job\.jobId"/);
    expect(src).toContain("key: 'copy-id', label: '复制 jobId'");
    expect(src).toContain("key: 'copy-row', label: '复制作业信息'");
    /* 行展开由内核承接（宿主不可程序化控制，「展开详情」条目随壳退役） */
    expect(qrt).toContain('qrt-row-expand');
  });

  it('行信息事实串含迁移关键诊断字段', () => {
    expect(src).toContain('jobId=${j.jobId} status=${j.status} dest=${j.destIndex');
    expect(src).toContain('conflicts=${j.conflicts ?? 0} errors=${j.errors ?? 0}');
  });
});
