/**
 * R130 一百八十九批：纯宿主页横幅降级（用户截图——安全中心顶部的
 * 「此功能恒定作用于宿主集群，与当前所选目标无关」常驻警告横幅=信息架构错位：
 * 恒定事实不该以警告形态常驻页面顶部）。
 * 锁定：
 * 1) App.vue HOST_ONLY 不再含 /security（/system 同性质一并移出）；
 *    /config-drift 保留（目标选错时的真实防呆，误解成本高）；
 * 2) 宿主作用域语义降级为页面副标题自述（SecurityView/SystemView）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');
const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8');
const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('纯宿主页横幅降级（一百八十九批）', () => {
  it('HOST_ONLY 不含 /security（含 /config-drift /system 防呆与自述分工清晰）', () => {
    expect(app).toMatch(/const HOST_ONLY = new Set\(\['\/config-drift', '\/system'\]\)/);
    expect(app).toContain('/security');
    expect(app).toMatch(/横幅=每进一次页面就被「警告」一次的噪音/);
  });

  it('安全中心/系统索引：宿主作用域语义由副标题自述', () => {
    expect(read('../views/SecurityView.vue')).toContain('subtitle="页面授权 · 操作审计 · 内置账号（独立部署）"');
    expect(read('../views/SystemView.vue')).toContain('宿主集群系统索引 · 分布式锁');
  });
});

describe('安全中心骨架/空态状态机修复（一百八十九批补）', () => {
  it('usersLoading 状态位存在；骨架只在在途显示；空态条件含 !usersLoading', () => {
    expect(sec).toMatch(/const usersLoading = ref\(false\)/);
    expect(sec).toMatch(/v-if="usersLoading && !users\.length" class="sec-skel"/);
    /* 第十批收尾同步更新：裸 .dim.empty 迁 EmptyState compact，互斥链条件不变（空态仍只在「完成但为空」时出） */
    expect(sec).toMatch(/<EmptyState v-else-if="!usersLoading && !usersErr" compact :icon="UserPlus"/);
    expect(sec).toMatch(/usersLoading\.value = true;/);
    /* 2.1.6：复位按世代收口——过期包不得提前熄掉在途骨架 */
    expect(sec).toMatch(/finally \{ if \(seq === usersSeq\) usersLoading\.value = false; \}/);
  });

  it('委托账号长 SSO ID 截断显示（防撑破布局，hover 全量）', () => {
    expect(sec).toMatch(/auth\.me\.username\.length > 24/);
    expect(sec).toMatch(/:title="auth\.me\.username"/);
  });
});
