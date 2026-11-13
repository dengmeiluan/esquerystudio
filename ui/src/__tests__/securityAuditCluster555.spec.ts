/**
 * 五百五十五批：审计维度丰富——「所属集群」列 + 线缆 {records} 契约 + 宿主贡献动作 HOST_OP +
 * 详情查看器富维度元信息（集群/IP/耗时/归属）。产线权限审计定案（20260921）的配套前端件：
 * 审计行从此可答「发生在哪个集群、从哪个 IP、耗时多少、控制台还是宿主」。
 *
 * 锁定（源码锚——与 exportNameGuard380 同语言）：
 * 1) AUDIT_COLS 列序：集群位于 URI 与 HTTP 之间（9 列）；
 * 2) 线缆解析 r?.records（旧 hits?.hits 不回潮）；
 * 3) kw 快滤覆盖 connName/connId；
 * 4) 详情查看器重建含 cluster: row[6]（列序契约）；
 * 5) 动作词表：HOST_OP 中文映射 + 色调 + 筛选选项；
 * 6) 详情弹层富维度元信息行（集群/IP/耗时/宿主贡献）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

describe('五百五十五批：审计维度丰富（集群列/records 线缆/HOST_OP/富详情）', () => {
  it('AUDIT_COLS 十二列做全（IP/耗时/来源 从详情弹层升列）', () => {
    const m = sec.match(/const AUDIT_COLS = \[([^\]]+)\]/);
    expect(m, 'AUDIT_COLS 声明存在').toBeTruthy();
    const cols = m![1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
    expect(cols).toEqual(['时间', '用户', '角色', '来源', '动作', '方法', 'URI', '集群', 'IP', 'HTTP', '耗时(ms)', '详情']);
  });

  it('矩阵集群列取 connName 优先 connId 回退', () => {
    expect(sec).toContain('r.connName || r.connId || \'\'');
  });

  it('线缆解析改为 records（旧 hits.hits._source 不回潮）', () => {
    expect(sec).toContain('r?.records');
    expect(sec, '旧 ES hits 包装解析不回潮').not.toContain('r?.hits?.hits');
  });

  it('kw 快滤覆盖集群实名与连接 ID', () => {
    expect(sec).toContain("String(r.connName ?? '').toLowerCase().includes(k)");
    expect(sec).toContain("String(r.connId ?? '').toLowerCase().includes(k)");
  });

  it('详情查看器重建按 12 列新序（兜底位）+ 原始记录行尾 12 位附挂', () => {
    expect(sec).toContain("row[12] && typeof row[12] === 'object'");
    expect(sec).toContain('httpStatus: row[9]');
    expect(sec).toContain('costMs: row[10]');
    expect(sec).toContain('detail: row[11]');
  });

  it('HOST_OP 动作词表齐备（中文映射/色调/筛选选项）', () => {
    expect(sec).toMatch(/HOST_OP: '宿主操作'/);
    expect(sec).toMatch(/ACT_TONE[^}]*HOST_OP: 'b'/s);
    expect(sec).toContain('<option value="HOST_OP">宿主操作（HOST_OP）</option>');
  });

  it('详情弹层富维度元信息行（集群/IP/耗时/宿主贡献）——五百五十七批 MetaStrip 合并锚同步更新', () => {
    /* 五百五十七批：模板手写「·」插值随 MetaStrip items 化迁移（dvRichItems 计算属性逐段条件），
       四维语义锚按新形态字面化（行为零变：逐段 v-if 条件同步更新） */
    expect(sec).toContain("value: String(r.cluster), label: '集群'");
    expect(sec).toContain("value: String(r.ip), label: 'IP'");
    expect(sec).toContain("value: String(r.costMs), unit: 'ms', label: '耗时'");
    expect(sec).toContain("r.source === 'host' ? '宿主贡献' : '控制台'");
  });

  it('集群列单元模板存在（空档显示 -）', () => {
    expect(sec).toContain('<template #cell-集群="{ value }">');
  });
});

/* ═══ R17 导出列名带单位一致性：TSV/MD 复制走 QRT getCsvBlock 单源——表头=列标签，
   AUDIT_COLS 的耗时(ms) 改名自动继承到导出表头（所见即所复构造性保证） ═══ */
it('审计导出走 QRT getCsvBlock 单源（表头自动继承列名带单位改名）', () => {
  expect(sec).toContain('getCsvBlock()');
  expect(sec).toContain("'耗时(ms)'");
});
