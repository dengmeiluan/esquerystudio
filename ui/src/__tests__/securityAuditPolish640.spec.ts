/**
 * 六百四十批：安全中心「质感第二刀」——G24（危险等级色档隔离）+ G27（状态落盘）。
 *
 * G24（P1）：审计动作 tone 危险等级不隔离——HIGH_RISK≡LOGIN_FAIL（均 r 红）、
 *   PAGE_DENIED≡WRITE（均 y 黄），危险信号被稀释。收口为语义分层：
 *   红 r=高危操作（唯一）、黄 y=警告（登录失败/页面被拒）、蓝 b=动作信息（写/宿主）、
 *   绿 g=正常（登录/读取）。HIGH_RISK 独占红档、WRITE 与 PAGE_DENIED 分离。
 * G27（P1）：审计时间范围 fRange 是裸 ref，刷新即重置「全部时间」——收口 usePref
 *   落盘（与 LiveDashboardView mh2Range 同范式），重进页面还原。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const SEC = codeOf('views/SecurityView.vue');

describe('六百四十批① G24：危险等级色档隔离（ACT_TONE 语义分层）', () => {
  it('HIGH_RISK 独占红档；LOGIN_FAIL 降为警告黄；WRITE 与 PAGE_DENIED 分离', () => {
    expect(SEC, '语义分层映射表').toContain(
      "LOGIN: 'g', LOGIN_FAIL: 'y', WRITE: 'b', HIGH_RISK: 'r', PAGE_DENIED: 'y', READ: 'g',");
    expect(SEC, 'HIGH_RISK 不再是唯一之外的红').not.toContain("LOGIN_FAIL: 'r'");
    expect(SEC, 'WRITE 不再与 PAGE_DENIED 同黄').not.toContain("WRITE: 'y'");
    expect(SEC, 'HOST_OP 信息蓝保留').toMatch(/HOST_OP: 'b'/);
  });
});

describe('六百四十批② G27：审计时间范围 fRange 落盘（usePref）', () => {
  it('fRange 走 usePref 落盘（security.auditRange，默认 all），重进还原', () => {
    expect(SEC, 'fRange 落盘').toContain("usePref<'all' | '1h' | '24h' | '7d'>('security.auditRange', 'all')");
    expect(SEC, '不再裸 ref 恒重置').not.toMatch(/const fRange = ref<'all' \| '1h' \| '24h' \| '7d'>\('all'\);/);
  });
});
