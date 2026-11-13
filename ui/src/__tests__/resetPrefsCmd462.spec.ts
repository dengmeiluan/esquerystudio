/**
 * 四百六十二批：命令面板「重置全部显示偏好」——调乱行高/列宽/布局后的救急入口。
 * 只清显示类键（es_tbl_* / es_density / es_pager_size / esquerystudio.layout.v2 /
 * esquerystudio_qb_split）；草稿（draft2/dsl.body）/历史/收藏/主题不动；
 * 提示「刷新页面后生效」（诚实告知，不伪装即时生效）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');

describe('重置全部显示偏好命令（462 批）', () => {
  it('命令注册在「设置」组+清显示类键', () => {
    expect(s).toContain("id: 'act-reset-prefs', title: '重置全部显示偏好");
    expect(s).toContain("k.startsWith('es_tbl_')");
    expect(s).toContain("k === 'es_density'");
    expect(s).toContain("k.startsWith('esquerystudio.layout.v2')");
  });

  it('用户数据豁免：不清草稿/历史/收藏/主题', () => {
    const actionBody = s.slice(s.indexOf("id: 'act-reset-prefs'"), s.indexOf("id: 'act-reset-prefs'") + 700);
    expect(actionBody).not.toContain('draft2');
    expect(actionBody).not.toContain('es_theme');
    expect(actionBody).toContain('刷新页面后生效');
  });
});
