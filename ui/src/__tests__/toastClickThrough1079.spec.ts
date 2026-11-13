import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

/* 1079：toast 不吞页面点击。
 * 真实浏览器实测（SQL 控制台，分页响应形态异常）：错误 toast 落在右下角（App.vue
 * placement=bottom-right），正好盖住结果栏「下一页」；6s 停留期内真实鼠标点击被
 * toast 正文吃掉，一次断网即可让「cursor 已保留，可重试」变成点不到。
 * 裁决：toast 是瞬时瞥一眼层，整卡穿透，只保留动作按钮可点；完整消息回看走通知中心。 */
describe('1079 toast 点击穿透', () => {
  const css = srcOf('theme.css');

  it('容器与卡片本体穿透（不再截获下层控件点击）', () => {
    expect(css).toContain('.n-notification-container, .n-notification { pointer-events: none !important; }');
  });

  it('动作按钮与关闭钮保留可点（撤销/继续上次/复制原始不被穿透误伤）', () => {
    expect(css).toContain('.n-notification .toast-acts,');
    expect(css).toContain('.n-notification .toast-acts *,');
    expect(css).toContain('.n-notification .n-notification-close,');
    expect(css).toContain('.n-notification .n-notification-close * { pointer-events: auto !important; }');
    expect(css).toMatch(/\.toast-undo \{[^}]*cursor: pointer/);
  });

  it('无障碍兜底仍在：视觉 toast 穿透，读屏走 sr-only live region', () => {
    const app = srcOf('App.vue');
    expect(app).toContain('placement="bottom-right"');
    expect(app).toContain(`role: 'status', 'aria-live': 'polite'`);
    expect(app).toContain(`role: 'alert', 'aria-live': 'assertive'`);
  });
});
