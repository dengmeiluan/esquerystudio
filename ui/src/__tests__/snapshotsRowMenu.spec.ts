/**
 * R130 一百九十三批：SnapshotsView 快照行右键菜单（E 组逐表过 dbx 清单收尾）。
 * 锁定：行 contextmenu 接 CellContextMenu——复制快照名/快照信息/恢复/删除直达
 * （IN_PROGRESS 快照不出现恢复/删除项，与时间线按钮禁用语义一致）。
 * 二百二十一批演进：恢复/删除 rank3 档（canOps）——低权角色菜单只留复制项。
 * 判定：时间线形态非列式表格，列管理/冻结列不适配（记录防重扫）。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SnapshotsView.vue'), 'utf-8');

describe('SnapshotsView 快照行右键菜单（一百九十三批）', () => {
  it('行接 contextmenu；菜单项齐备（复制名/信息/恢复/删除）', () => {
    expect(src).toMatch(/@contextmenu\.prevent="openSnapMenu\(\$event, s\)"/);
    expect(src).toMatch(/<CellContextMenu v-if="snapMenu" :x="snapMenu\.x" :y="snapMenu\.y" :title="snapMenu\.s\.snapshot"/);
    expect(src).toContain("key: 'copy-name', label: '复制快照名'");
    expect(src).toContain("key: 'copy-row', label: '复制快照信息'");
    expect(src).toContain("key: 'restore', label: '恢复此快照…'");
    expect(src).toContain("key: 'delete', label: '删除快照…'");
  });

  it('IN_PROGRESS 或低权（!canOps）不出现恢复/删除项；事实串含仓库与分片', () => {
    expect(src).toMatch(/const inProgress = s\.state === 'IN_PROGRESS';/);
    expect(src).toMatch(/const ops = inProgress \|\| !canOps\.value \? \[\] : \[/);
    expect(src).toContain('repo=${currentRepo.value} state=${s.state || \'-\'}');
    expect(src).toContain('shards=${s.shards ? s.shards.successful + \'/\' + s.shards.total : \'-\'}');
  });
});
