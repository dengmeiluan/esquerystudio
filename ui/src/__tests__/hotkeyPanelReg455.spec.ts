/**
 * 四百五十五批：速查面板登记补全——421 分页器 ←/→ 翻页与 445 聚焦面 Esc 层级
 * 已实现但未进 HotkeyPanel（173/296 批「有功能没人知道」防重演原则）。
 * 「查询与编辑」组补两行：分页器内翻页 / 聚焦面层级退出。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/HotkeyPanel.vue'), 'utf-8');

describe('速查面板登记补全（455 批）', () => {
  it('分页器 ←/→ 与聚焦面 Esc 两行在场', () => {
    expect(s).toMatch(/\{ keys: \['←', '→'\], desc: '分页器内翻页/);
    expect(s).toMatch(/\{ keys: \['Esc'\], desc: '退出结果区聚焦全屏/);
  });

  /* INTERACTION.md：新增键盘交互必须同步登记速查面板——右键菜单键盘入口两行 */
  it('右键菜单键盘入口登记：模式条/候选列表/索引 chip、Boost 字段行、工作台配置行与 RT/QRT 列头', () => {
    expect(s).toMatch(/模式条 \/ 字段与值候选 \/ 当前索引 chip 开右键菜单（↑\/↓ 选择，Home\/End 首末，Shift\+F10 同效）/);
    expect(s).toMatch(/Boost 调参字段行：复制 \/ 启停 \/ 删除右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/工作台配置行：显隐 \/ 列宽 \/ 排序右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/配置漂移对象行：检测 \/ 复制 indexKey \/ 深链右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/集群切换器连接行：切换 \/ 复制连接信息右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/概览索引 \/ 健康 \/ 作业行：打开 \/ 复制右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/监控屏节点卡 \/ 活动告警：诊断 \/ 定位 \/ 复制右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/结果卡片（alt 视图）：打开文档 \/ 复制 _id\/JSON 右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/DSL 聚合桶行：下钻 \/ 排除 \/ 复制桶键右键菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/列头打开列管理菜单（Shift\+F10 同效）/);
    expect(s).toMatch(/QRT 结果表：焦点行打开单元格菜单（含「用户操作…」等宿主组，Shift\+F10 同效）/);
    expect(s).toMatch(/RT 结果表：焦点行打开单元格菜单（Shift\+F10 同效）/);
  });
});
