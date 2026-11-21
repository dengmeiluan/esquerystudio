/**
 * R130 一百八十四批：BrowserView 过 dbx 清单（E 组逐表盘点第一站）。
 * 现状判定（防重复建设）：右键菜单 132 批已有（含复制索引名）、CSV 导出 126 批已有、
 * 双层列头/冻结首列/列管理不适配（固定 8 列无横向滚动、无字段类型语义）。
 * 补：①索引清单 Markdown 复制（群聊直贴，与 134 批节点表双通道同口径）；
 * ②右键菜单「复制行信息」（health/status/docs/store/shards/created 单行事实串）。
 * 源码锁（视图级，无独立状态机可行为验证）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/BrowserView.vue'), 'utf-8');

describe('BrowserView 过 dbx 清单（一百八十四批）', () => {
  it('工具区双通道：CSV 下载 + Markdown 复制（九百四十七批合并「导出 ▾」菜单项形态）', () => {
    expect(src).toMatch(/@click="exportCsv\(\); closeBwExp\(\)"/);
    expect(src).toMatch(/@click="exportMd\(\); closeBwExp\(\)"/);
    expect(src).toMatch(/async function exportMd\(\)/);
    expect(src).toMatch(/\| 索引 \| 健康 \| 状态 \| 文档数 \| 存储 \| 分片 \|/);
  });

  it('「复制行信息」改走 QRT #row-actions 行尾注入位（单行事实串逐字保真）', () => {
    /* 五百二十九批锚同步更新：行右键菜单退役（CellContextMenu 随 QRT 换壳移除），
       复制行信息入口平移到 QRT 行尾注入位（与行复制/展开钮同排），事实串模板逐字不变 */
    expect(src).toMatch(/title="复制行信息" @click\.stop="copyRowInfo\(row\)"/);
    expect(src).toContain("health=${i.health} status=${i.status} docs=${i['docs.count'] || 0}");
  });
});
