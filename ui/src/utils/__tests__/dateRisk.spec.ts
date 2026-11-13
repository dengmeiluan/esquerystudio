/* 本文件的期望值逐格来自 R94 实测矩阵（历史记录见 git 提交）：
   探针可复跑：cd esquerystudio && mvn -o test -Dtest='DateConversionMatrixProbe+DateFixMatrixProbe'
   ⚠️ 改这里的任何期望值之前，先复跑探针确认矩阵没变。矩阵是事实，断言只是它的镜像。 */

import { describe, it, expect } from 'vitest';
import {
  assessDateRisks, assessFieldNameMismatch, mergeRiskRows, STORED_FORMS,
  COMPAT_DATE_CONVERTERS_KEY, type StoredForm,
} from '../dateRisk';

/* 字段行的形状与 Task 15 的 payload row 逐键对齐（EntityFieldScanner 8 键）。
   esFormat 由后端从 mapping 取（Task 17 裁定四）——前端不解析 mapping。 */
const F = (over: Partial<any> = {}) => ({
  name: 't', declaredName: 't', javaType: 'java.sql.Timestamp',
  esType: 'date', esFormat: null, annType: null, annFormat: null, annPattern: null, ...over,
});
/* 默认入参：mappingParsed=true（mapping 读懂了），这是最常见的正常路径 */
const IN = (over: Partial<any> = {}) => ({
  mappingParsed: true,
  fields: [F()], forms: { t: { epoch_millis: 10 } }, sdesVersion: '4.0.9.RELEASE', ...over,
});
const only = (rows: any[], code: string) => rows.filter(r => r.code === code);

/* ════════════════════════════════════════════════════════════════════
   阻断一：StoredForm 词表与 Task 16 采样器实际产出对齐
   ════════════════════════════════════════════════════════════════════ */

describe('STORED_FORMS · 词表 = Task 16 DateFormSampler 的观测值域', () => {
  /* 这 9 个字面量抄自 DateFormSampler.java 的常量（EPOCH_MILLIS…OTHER）。
     TS 的 type 在运行期不存在、不可断言，故词表必须是「值」才落得下判据。 */
  it('恰为采样器的 9 个形态常量，逐一对应', () => {
    expect([...STORED_FORMS].sort()).toEqual([
      'absent', 'ambiguous_small', 'date_only', 'epoch_millis', 'epoch_seconds',
      'iso8601', 'null_value', 'other', 'space_sep',
    ]);
  });

  /* 'mixed' 是判定层的 code（MIXED_STORED_FORMS），不是采样器的观测形态。
     把它放进 StoredForm 会让同一事实有两个表示位置：forms.t={epoch_millis:5,mixed:5}
     到底是几种形态？规则 2 就此自我指涉。 */
  it('不含 mixed —— 它是结论不是观测', () => {
    expect(STORED_FORMS).not.toContain('mixed' as unknown as StoredForm);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 1：SECONDS_IN_FORMATLESS_DATE（R94 §5b，ERROR）
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 1：SECONDS_IN_FORMATLESS_DATE（R94 §5b，ERROR）', () => {
  it('epoch_seconds + 无 format → error，且理由点明 ES 侧排序/范围/聚合已错', () => {
    const rows = assessDateRisks(IN({ forms: { t: { epoch_seconds: 10 } } }));
    const hit = only(rows, 'SECONDS_IN_FORMATLESS_DATE');
    expect(hit).toHaveLength(1);
    expect(hit[0].level).toBe('error');
    expect(hit[0].reason).toMatch(/1970/);
    expect(hit[0].reason).toMatch(/排序|范围|聚合/);
  });

  it('epoch_seconds + esFormat 含 epoch_second → 不报这条', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ esFormat: 'strict_date_optional_time||epoch_millis||epoch_second' })],
      forms: { t: { epoch_seconds: 10 } },
    }));
    expect(only(rows, 'SECONDS_IN_FORMATLESS_DATE')).toHaveLength(0);
  });

  /* 有 format 但那个 format 里没有 epoch_second —— ES 照样解析不了秒。
     一个「只要 esFormat != null 就放行」的实现能过上一条，过不了这条。 */
  it('epoch_seconds + esFormat 有值但不含 epoch_second → 仍报', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ esFormat: 'strict_date_optional_time||epoch_millis' })],
      forms: { t: { epoch_seconds: 10 } },
    }));
    expect(only(rows, 'SECONDS_IN_FORMATLESS_DATE')).toHaveLength(1);
  });

  it('修复建议必须同时给出两条路径且说明开转换器救不了', () => {
    const hit = only(assessDateRisks(IN({ forms: { t: { epoch_seconds: 3 } } })),
      'SECONDS_IN_FORMATLESS_DATE')[0];
    expect(hit.fix).toMatch(/format/);
    expect(hit.fix).toMatch(/\* 1000|reindex/);
    expect(hit.fix).toMatch(/救不了|不是客户端|无法通过开关/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 2：MIXED_STORED_FORMS
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 2：MIXED_STORED_FORMS', () => {
  it('同字段秒与毫秒并存 → error', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ esFormat: 'strict_date_optional_time||epoch_millis||epoch_second' })],
      forms: { t: { epoch_millis: 5, epoch_seconds: 5 } },
    }));
    expect(only(rows, 'MIXED_STORED_FORMS')[0].level).toBe('error');
  });

  it('null_value / absent 不算入形态多样性（它们不是存储形态）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.util.Date' })],
      forms: { t: { epoch_millis: 5, null_value: 3, absent: 2 } },
    }));
    expect(only(rows, 'MIXED_STORED_FORMS')).toHaveLength(0);
  });

  /* 计数为 0 的桶不该让字段变成「多形态」——后端可能吐出 0 计数的键。 */
  it('计数为 0 的形态不算并存', () => {
    const rows = assessDateRisks(IN({ forms: { t: { epoch_millis: 5, iso8601: 0 } } }));
    expect(only(rows, 'MIXED_STORED_FORMS')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 3：UNREADABLE_COMBINATION（R94 §1 矩阵 30 格）
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 3：UNREADABLE_COMBINATION（R94 §1 矩阵 30 格）', () => {
  const RED: Array<[string, string]> = [
    ['epoch_millis', 'java.sql.Timestamp'], ['epoch_millis', 'java.sql.Date'],
    ['epoch_millis', 'java.time.Instant'], ['epoch_millis', 'java.time.LocalDateTime'],
    ['epoch_seconds', 'java.sql.Timestamp'], ['epoch_seconds', 'java.sql.Date'],
    ['epoch_seconds', 'java.util.Date'], ['epoch_seconds', 'java.time.Instant'],
    ['epoch_seconds', 'java.time.LocalDateTime'],
    ['iso8601', 'java.sql.Timestamp'], ['iso8601', 'java.sql.Date'],
    ['iso8601', 'java.util.Date'], ['iso8601', 'java.lang.Long'],
    ['space_sep', 'java.sql.Date'], ['space_sep', 'java.util.Date'],
    ['space_sep', 'java.lang.Long'], ['space_sep', 'java.time.Instant'],
    ['space_sep', 'java.time.LocalDateTime'],
    ['date_only', 'java.sql.Timestamp'], ['date_only', 'java.util.Date'],
    ['date_only', 'java.lang.Long'], ['date_only', 'java.time.Instant'],
    ['date_only', 'java.time.LocalDateTime'],
  ];
  const GREEN: Array<[string, string]> = [
    ['epoch_millis', 'java.util.Date'], ['epoch_millis', 'java.lang.Long'],
    ['epoch_seconds', 'java.lang.Long'],
    ['iso8601', 'java.time.Instant'], ['iso8601', 'java.time.LocalDateTime'],
    ['space_sep', 'java.sql.Timestamp'], ['date_only', 'java.sql.Date'],
  ];

  /* 30 格 = 5 存储形态 × 6 Java 类型；23 红 + 7 绿。
     R94 §1 表里 6 格打勾，第 7 格 (epoch_seconds × Long) 同样是 ✅ —— 见表第二行第四列。 */
  it('红绿两表合计恰好覆盖 30 格且无重叠', () => {
    const all = [...RED, ...GREEN].map(([f, j]) => `${f}|${j}`);
    expect(new Set(all).size).toBe(30);
    expect(RED).toHaveLength(23);
    expect(GREEN).toHaveLength(7);
  });

  it.each(RED)('红格 %s x %s → 报 UNREADABLE_COMBINATION 或更高优先级的 error', (form, javaType) => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType, esFormat: 'strict_date_optional_time||epoch_millis||epoch_second' })],
      forms: { t: { [form]: 10 } },
    }));
    expect(rows.some(r => r.level === 'error')).toBe(true);
  });

  it.each(GREEN)('绿格 %s x %s → 不该报 UNREADABLE_COMBINATION', (form, javaType) => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType, esFormat: 'strict_date_optional_time||epoch_millis||epoch_second' })],
      forms: { t: { [form]: 10 } },
    }));
    expect(only(rows, 'UNREADABLE_COMBINATION')).toHaveLength(0);
  });

  /* 上面的红格断言只看 level==='error'，可被任意一条 error 满足。
     这一条钉死 code 本身：矩阵红格必须由 UNREADABLE_COMBINATION 这条规则报出，
     而不是碰巧被别的规则盖住。选 util.Date 是因为它不触发规则 4/5。 */
  it('红格 epoch_seconds x java.util.Date 确实由 UNREADABLE_COMBINATION 报出（而非被他条盖住）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.util.Date', esFormat: 'strict_date_optional_time||epoch_second' })],
      forms: { t: { epoch_seconds: 10 } },
    }));
    expect(only(rows, 'UNREADABLE_COMBINATION')).toHaveLength(1);
    expect(only(rows, 'UNREADABLE_COMBINATION')[0].level).toBe('error');
  });

  /* 裁定三：规则 3 的输入是 storedForm × javaType × 注解，全不来自 mapping，
     故 mappingParsed=false 时它信息完备、照常判定，不降级。 */
  it('mappingParsed=false 时规则 3 不降级（输入不依赖 mapping）', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: false,
      fields: [F({ javaType: 'java.util.Date', esType: null, esFormat: null })],
      forms: { t: { iso8601: 10 } },
    }));
    expect(only(rows, 'UNREADABLE_COMBINATION')).toHaveLength(1);
    expect(only(rows, 'UNREADABLE_COMBINATION')[0].level).toBe('error');
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 4：SELF_INFLICTED_LOOP（R94 §3 自伤闭环）
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 4：SELF_INFLICTED_LOOP（R94 §3 自伤闭环）', () => {
  it('Instant 无日期注解 + epoch_millis → error，理由点明写得进读不出', () => {
    const hit = only(assessDateRisks(IN({
      fields: [F({ javaType: 'java.time.Instant' })],
    })), 'SELF_INFLICTED_LOOP')[0];
    expect(hit.level).toBe('error');
    expect(hit.reason).toMatch(/写.*读|自己.*读不/);
  });

  it('Instant + annType=Date & annFormat=date_optional_time + ISO 存储 → 不报（R94 §4 C 行实测 OK）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.time.Instant', annType: 'Date', annFormat: 'date_optional_time',
      })],
      forms: { t: { iso8601: 10 } },
    }));
    expect(rows.every(r => r.level !== 'error')).toBe(true);
  });

  it('注解救不了数字存储（R94 §4 A/D 行实测 FAIL）—— 有注解仍报 error', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.time.Instant', annType: 'Date', annFormat: 'date_optional_time',
      })],
    }));
    expect(rows.some(r => r.level === 'error')).toBe(true);
  });

  /* 哨兵值不是缺席：annType='Auto' / annFormat='none' 意味着「@Field 写了但没指定」，
     它对读取毫无帮助，等同于没写日期注解 —— 必须仍判自伤闭环。
     一个把「annType != null」当成「有日期注解」的实现会漏掉这一格。 */
  it('annType=Auto / annFormat=none 是哨兵值不是日期注解 → 仍报 SELF_INFLICTED_LOOP', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.time.Instant', annType: 'Auto', annFormat: 'none' })],
      forms: { t: { iso8601: 10 } },
    }));
    expect(only(rows, 'SELF_INFLICTED_LOOP')).toHaveLength(1);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 5：LOCALDATETIME_TZ_DRIFT（R94 §2）
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 5：LOCALDATETIME_TZ_DRIFT（R94 §2）', () => {
  it('LocalDateTime 即使组合可读也要 warning 时区漂移', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.time.LocalDateTime', annType: 'Date', annFormat: 'date_optional_time',
      })],
      forms: { t: { iso8601: 10 } },
    }));
    const hit = only(rows, 'LOCALDATETIME_TZ_DRIFT')[0];
    expect(hit.level).toBe('warning');
    expect(hit.fix).toMatch(/Instant/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 6：DYNAMIC_MAPPED_FIELD 与 修订一的 (a)/(b) 互斥
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 6：DYNAMIC_MAPPED_FIELD', () => {
  it('mappingParsed=true 且 esType 为 null → warning', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: true,
      fields: [F({ esType: null })],
    }));
    expect(only(rows, 'DYNAMIC_MAPPED_FIELD')[0].level).toBe('warning');
  });
});

describe('assessDateRisks · 修订一：esType==null 的两个成因必须可分辨', () => {
  /* 同一个 esType:null 的字段，只切换 mappingParsed 这一个变量。
     两条断言互斥：任一 code 出现在错误的那一侧都会红。 */
  const field = F({ esType: null, esFormat: null, javaType: 'java.util.Date' });

  it('(a) mappingParsed=true → DYNAMIC_MAPPED_FIELD，且不发未解析码', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: true,
      fields: [field], forms: { t: { epoch_millis: 10 } },
    }));
    expect(only(rows, 'DYNAMIC_MAPPED_FIELD')).toHaveLength(1);
    expect(only(rows, 'MAPPING_UNPARSED_UNKNOWN')).toHaveLength(0);
  });

  it('(b) mappingParsed=false → MAPPING_UNPARSED_UNKNOWN，且绝不发 DYNAMIC_MAPPED_FIELD', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: false,
      fields: [field], forms: { t: { epoch_millis: 10 } },
    }));
    expect(only(rows, 'MAPPING_UNPARSED_UNKNOWN')).toHaveLength(1);
    expect(only(rows, 'DYNAMIC_MAPPED_FIELD')).toHaveLength(0);
  });

  it('(b) 的 level 是 info，且 reason 说清「测不出」而非「没风险」', () => {
    const hit = only(assessDateRisks(IN({
      mappingParsed: false,
      fields: [field], forms: { t: { epoch_millis: 10 } },
    })), 'MAPPING_UNPARSED_UNKNOWN')[0];
    expect(hit.level).toBe('info');
    expect(hit.reason).toMatch(/测不出|无法判定|不可用/);
    /* 「没风险 / 无风险」这类措辞会把「信息缺失」讲成「已确认安全」，是本条要防的那句话 */
    expect(hit.reason).not.toMatch(/没风险|无风险|安全/);
  });

  /* 降级名单 = {1, 6, 7}（裁定三）。规则 1 依赖 esFormat，未解析时不可判。 */
  it('mappingParsed=false 时规则 1 降级：不发 error 版 SECONDS_IN_FORMATLESS_DATE', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: false,
      fields: [F({ esType: null, esFormat: null, javaType: 'java.lang.Long' })],
      forms: { t: { epoch_seconds: 10 } },
    }));
    expect(only(rows, 'SECONDS_IN_FORMATLESS_DATE')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════
   优先级 8：AMBIGUOUS_SMALL_INT
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 优先级 8：AMBIGUOUS_SMALL_INT', () => {
  it('ambiguous_small 出现 → info', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.lang.Long' })],
      forms: { t: { ambiguous_small: 4 } },
    }));
    expect(only(rows, 'AMBIGUOUS_SMALL_INT')[0].level).toBe('info');
  });
});

/* ════════════════════════════════════════════════════════════════════
   修订四：优先级顺序本身要有测试
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 修订四：优先级顺序（同时满足多条时取最高）', () => {
  /* 该字段同时满足：
       规则 1（epoch_seconds + 无 format）
       规则 2（epoch_seconds 与 iso8601 并存）
       规则 3（两种形态 × LocalDateTime 皆为矩阵红格）
       规则 4（LocalDateTime 无日期注解）
       规则 5（LocalDateTime 时区漂移）
     产出的首条必须是优先级最高的规则 1。
     没有这条，把顺序打乱的实现照样能过「每条规则各自的测试」。 */
  const multi = () => assessDateRisks(IN({
    fields: [F({ javaType: 'java.time.LocalDateTime', esFormat: null })],
    forms: { t: { epoch_seconds: 5, iso8601: 5 } },
  }));

  it('前提：这五条规则确实都被满足（否则本测试测的是空气）', () => {
    const codes = multi().map(r => r.code);
    expect(codes).toContain('SECONDS_IN_FORMATLESS_DATE');
    expect(codes).toContain('MIXED_STORED_FORMS');
    expect(codes).toContain('UNREADABLE_COMBINATION');
    expect(codes).toContain('SELF_INFLICTED_LOOP');
    expect(codes).toContain('LOCALDATETIME_TZ_DRIFT');
  });

  it('首条是优先级最高的 SECONDS_IN_FORMATLESS_DATE', () => {
    expect(multi()[0].code).toBe('SECONDS_IN_FORMATLESS_DATE');
  });

  /* 逐位钉死相对次序，而不只看第一条 —— 只断言首条的话，
     把 2~5 打乱的实现照样全绿。 */
  it('五条按 1<2<3<4<5 的既定次序排列', () => {
    expect(multi().map(r => r.code)).toEqual([
      'SECONDS_IN_FORMATLESS_DATE', 'MIXED_STORED_FORMS', 'UNREADABLE_COMBINATION',
      'SELF_INFLICTED_LOOP', 'LOCALDATETIME_TZ_DRIFT',
    ]);
  });

  /* ⚠ 上面那条的看守有个盲区，是变异实测发现的（M7）：
     它命中的五条恰好是 4 个 error + 1 个 warning，而结果按 level 排序 ——
     于是把规则 5 挪到规则 3 之前，输出顺序**纹丝不动**（warning 照样被排到最后），
     测试全绿。它实际钉住的是 level，不是优先级。

     本条专挑**同为 warning 的规则 5 与规则 6**：LEVEL_RANK 对它们无分辨力，
     两者的先后**只能**由 emit 的顺序决定。这才是「优先级」真正落在值上的位置。
     字段同时满足 4(error) / 5(warning) / 6(warning) / 8(info)，跨级与同级各覆盖一段。 */
  const crossLevel = () => assessDateRisks(IN({
    mappingParsed: true,
    fields: [F({ javaType: 'java.time.LocalDateTime', esType: null, esFormat: null })],
    forms: { t: { ambiguous_small: 5 } }, sdesVersion: null,
  }));

  it('前提：规则 5 与规则 6 同为 warning（故 level 排序对二者无分辨力）', () => {
    const byCode = new Map(crossLevel().map(r => [r.code, r.level]));
    expect(byCode.get('LOCALDATETIME_TZ_DRIFT')).toBe('warning');
    expect(byCode.get('DYNAMIC_MAPPED_FIELD')).toBe('warning');
  });

  it('同为 warning 的规则 5 必须排在规则 6 之前（此处只有 emit 顺序说了算）', () => {
    const codes = crossLevel().map(r => r.code);
    expect(codes.indexOf('LOCALDATETIME_TZ_DRIFT'))
      .toBeLessThan(codes.indexOf('DYNAMIC_MAPPED_FIELD'));
  });

  it('跨级与同级合起来的完整次序 4 < 5 < 6 < 8', () => {
    expect(crossLevel().map(r => r.code)).toEqual([
      'SELF_INFLICTED_LOOP', 'LOCALDATETIME_TZ_DRIFT',
      'DYNAMIC_MAPPED_FIELD', 'AMBIGUOUS_SMALL_INT',
    ]);
  });
});

/* ════════════════════════════════════════════════════════════════════
   修订三：javaType 缺失时降级但不猜
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · javaType 缺失时降级但不猜', () => {
  it('javaType 为 null：1/2 仍判 error，3~7 降为 info 且注明需要 desired-state', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: null })], forms: { t: { epoch_seconds: 10 } }, sdesVersion: null,
    }));
    expect(only(rows, 'SECONDS_IN_FORMATLESS_DATE')[0].level).toBe('error');
    expect(only(rows, 'UNREADABLE_COMBINATION')).toHaveLength(0);
  });

  it('javaType 为 null 且形态无问题 → 给 info 且文案提示需业务侧 payload', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: null })], forms: { t: { epoch_millis: 10 } }, sdesVersion: null,
    }));
    expect(rows.some(r => r.level === 'info' && /desired-state|业务侧/.test(r.reason))).toBe(true);
  });

  /* 规则 2 不依赖 javaType，javaType 缺失时它必须照常判 error（不许一并降级）。 */
  it('javaType 为 null 时规则 2 仍判 error', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: null, esFormat: 'epoch_second||epoch_millis' })],
      forms: { t: { epoch_millis: 5, epoch_seconds: 5 } }, sdesVersion: null,
    }));
    expect(only(rows, 'MIXED_STORED_FORMS')[0].level).toBe('error');
  });

  it('javaType 为 null 时不发规则 4/5（不猜 Instant / LocalDateTime）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: null })], forms: { t: { iso8601: 10 } }, sdesVersion: null,
    }));
    expect(only(rows, 'SELF_INFLICTED_LOOP')).toHaveLength(0);
    expect(only(rows, 'LOCALDATETIME_TZ_DRIFT')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════
   修复建议按 sdes 版本分叉（R94 §4 关键版本事实）
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 修复建议按 sdes 版本分叉（R94 §4 关键版本事实）', () => {
  const numeric = (sdesVersion: string | null) => assessDateRisks(IN({
    fields: [F()], forms: { t: { epoch_millis: 10 } }, sdesVersion,
  })).find(r => r.level === 'error')!;

  it('sdes 4.0.9 + 数字存储 → 首推开关，且绝不提 DateFormat.epoch_millis', () => {
    const hit = numeric('4.0.9.RELEASE');
    expect(hit.fix).toMatch(/esquerystudio\.elasticsearch\.compat\.date-converters/);
    expect(hit.fix).not.toMatch(/DateFormat\.epoch_millis/);
  });

  it('sdes 4.3.0 + 数字存储 → 可以提 DateFormat.epoch_millis', () => {
    expect(numeric('4.3.0').fix).toMatch(/epoch_millis/);
  });

  it('sdes 版本未知 → 两套都给，不赌', () => {
    const hit = numeric(null);
    expect(hit.fix).toMatch(/esquerystudio\.elasticsearch\.compat\.date-converters/);
    expect(hit.fix).toMatch(/版本|未知/);
  });

  /* 4.2 是 DateFormat.epoch_millis 枚举加入的版本（R94 §4）——边界两侧各钉一格。 */
  it('4.1.x 在阈值下方：不提 DateFormat.epoch_millis', () => {
    expect(numeric('4.1.9').fix).not.toMatch(/DateFormat\.epoch_millis/);
  });

  it('4.2.0 在阈值上（含）：提 DateFormat.epoch_millis', () => {
    expect(numeric('4.2.0').fix).toMatch(/DateFormat\.epoch_millis/);
  });

  it('版本串解析不了 → 按未知处理，两套都给', () => {
    const hit = numeric('banana');
    expect(hit.fix).toMatch(/esquerystudio\.elasticsearch\.compat\.date-converters/);
    expect(hit.fix).toMatch(/版本|未知/);
  });

  /* 配置键名抽成常量，与 Task 18 的属性名对齐。
     旁边这条字面量锚中和「常量比自己」：断言两端若都派生自 COMPAT_DATE_CONVERTERS_KEY，
     把常量改成 'banana' 照样全绿。 */
  it('配置键常量就是 Task 18 的属性名字面量', () => {
    expect(COMPAT_DATE_CONVERTERS_KEY).toBe('esquerystudio.elasticsearch.compat.date-converters');
    expect(numeric('4.0.9.RELEASE').fix).toContain(COMPAT_DATE_CONVERTERS_KEY);
  });

  /* 字符串存储走注解路线（R94 §4 C 行），与数字存储的修法不同。 */
  it('字符串存储 → 给注解 pattern 方案，而非 Converter 开关独占', () => {
    const hit = assessDateRisks(IN({
      fields: [F({ javaType: 'java.sql.Date' })], forms: { t: { space_sep: 10 } },
    })).find(r => r.code === 'UNREADABLE_COMBINATION')!;
    expect(hit.fix).toMatch(/pattern|DateFormat\.custom/);
  });
});

/* ════════════════════════════════════════════════════════════════════
   非 date 字段与容错
   ════════════════════════════════════════════════════════════════════ */

describe('assessDateRisks · 非 date 字段与容错', () => {
  it('esType 不是 date 的字段一律不评', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ esType: 'long', javaType: 'java.lang.Long' })],
    }));
    expect(rows).toHaveLength(0);
  });

  it('forms 为空 / fields 为空 都不抛', () => {
    expect(() => assessDateRisks({
      mappingParsed: false, fields: [F()], forms: {}, sdesVersion: null,
    })).not.toThrow();
    expect(() => assessDateRisks({
      mappingParsed: false, fields: [], forms: {}, sdesVersion: null,
    })).not.toThrow();
  });

  it('字段在 forms 里没有对应条目 → 不抛且不虚报 error', () => {
    const rows = assessDateRisks(IN({ forms: {} }));
    expect(rows.every(r => r.level !== 'error')).toBe(true);
  });

  it('结果按 field 升序再按 level 严重度降序，稳定可 diff', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ name: 'b', declaredName: 'b' }), F({ name: 'a', declaredName: 'a' })],
      forms: { a: { epoch_seconds: 1 }, b: { epoch_seconds: 1 } }, sdesVersion: null,
    }));
    expect(rows[0].field).toBe('a');
  });

  /* 同一字段内按严重度降序：error 必须排在 warning / info 之前。 */
  it('同字段内 error 排在 warning 之前', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.time.LocalDateTime' })],
      forms: { t: { epoch_millis: 10 } },
    }));
    const levels = rows.map(r => r.level);
    expect(levels.indexOf('error')).toBeLessThan(levels.indexOf('warning'));
  });

  /* DateFieldRisk 的上下文字段要如实回填，界面（Task 20）要展示它们。 */
  it('回填 storedForms / javaType / esType / hasExplicitFormat 作为判定依据', () => {
    const r = assessDateRisks(IN({
      fields: [F({ esFormat: 'epoch_second' })], forms: { t: { epoch_seconds: 7 } },
    }))[0];
    expect(r.storedForms).toEqual({ epoch_seconds: 7 });
    expect(r.javaType).toBe('java.sql.Timestamp');
    expect(r.esType).toBe('date');
    expect(r.hasExplicitFormat).toBe(true);
  });

  it('esFormat 为 null 时 hasExplicitFormat 为 false', () => {
    const r = assessDateRisks(IN({ forms: { t: { epoch_millis: 1 } } }))[0];
    expect(r.hasExplicitFormat).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════
   assessFieldNameMismatch · 信号⑤（R94 §5）
   ════════════════════════════════════════════════════════════════════ */

describe('assessFieldNameMismatch · 信号⑤（R94 §5）', () => {
  it('实体 @Field 用驼峰、mapping 定义下划线 → warning，且点明 mapping 那条从未生效', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{"properties":{"update_time":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'updateTime', declaredName: 'updateTime' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe('warning');
    expect(rows[0].reason).toMatch(/从未生效|dynamic/);
  });

  it('name 与 mapping 键一致 → 不报', () => {
    expect(assessFieldNameMismatch({
      mappingJson: '{"properties":{"entry_time":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'entry_time', declaredName: 'entryTime' }],
    })).toHaveLength(0);
  });

  it('mappingJson 为 null → 不报（无从比对，不猜）', () => {
    expect(assessFieldNameMismatch({
      mappingJson: null, mappingParsed: false, fields: [{ name: 'x', declaredName: 'x' }],
    })).toHaveLength(0);
  });

  /* 阻断二：判据是「mapping 里没有 name 这个键」，与 name/declaredName 像不像无关。
     上面第一条 name===declaredName 却要报、第二条两者不等却不报，已经排除了
     「name != declaredName」这个字面条件；本条再从正面钉一次。 */
  it('name === declaredName 但 mapping 里无此键 → 照样报（判据不是名字不一致）', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{"properties":{"other":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'same', declaredName: 'same' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('same');
  });

  it('name !== declaredName 且 mapping 里有该键 → 不报（名字不一致本身不是缺陷）', () => {
    expect(assessFieldNameMismatch({
      mappingJson: '{"properties":{"snake_case":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'snake_case', declaredName: 'snakeCase' }],
    })).toHaveLength(0);
  });

  it('坏 JSON → 不报 FIELD_NAME_MISMATCH（解析不了就无从比对）', () => {
    expect(only(assessFieldNameMismatch({
      mappingJson: '{bad', mappingParsed: false, fields: [{ name: 'x', declaredName: 'x' }],
    }), 'FIELD_NAME_MISMATCH')).toHaveLength(0);
  });

  it('修复建议给出两个方向：改实体或改 mapping', () => {
    const hit = assessFieldNameMismatch({
      mappingJson: '{"properties":{"update_time":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'updateTime', declaredName: 'updateTime' }],
    })[0];
    expect(hit.fix).toMatch(/实体/);
    expect(hit.fix).toMatch(/mapping/);
  });

  it('code 恒为 FIELD_NAME_MISMATCH', () => {
    expect(assessFieldNameMismatch({
      mappingJson: '{"properties":{"a":{"type":"date"}}}', mappingParsed: true,
      fields: [{ name: 'b', declaredName: 'b' }],
    })[0].code).toBe('FIELD_NAME_MISMATCH');
  });
});

/* ════════════════════════════════════════════════════════════════════
   assessFieldNameMismatch · 坏 JSON 不得刷屏（评审二）

   失效模式：mappingJson 坏掉 → 解析出零个键 → 每个字段都「不在 mapping 里」
   → 刷出一屏 FIELD_NAME_MISMATCH。一次解析失败被渲染成
   「你所有字段的 mapping 都没生效」—— 一个响亮而全错的结论，比不报警糟得多。

   把关必须落在 mappingParsed 这个**值**上，不落在「解析出的键集是否为空」：
   后者会把下面两种在「键集为空」上同形的情形混为一谈。
   ════════════════════════════════════════════════════════════════════ */

describe('assessFieldNameMismatch · 坏 JSON 不刷屏，且与「合法但空 properties」可分辨', () => {
  const THREE = [
    { name: 'a', declaredName: 'a' },
    { name: 'b', declaredName: 'b' },
    { name: 'c', declaredName: 'c' },
  ];

  /* 正向对照：mappingParsed=true 且键确实全缺 → 恰好 3 条。
     没有这条，下面那条「零条」可能只是夹具或选择器写错了，而不是把关生效。 */
  it('正向对照：mappingParsed=true 且 properties 为空 → 恰好 3 条 FIELD_NAME_MISMATCH', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{"properties":{}}', mappingParsed: true, fields: THREE,
    });
    expect(only(rows, 'FIELD_NAME_MISMATCH')).toHaveLength(3);
    expect(rows.map(r => r.field)).toEqual(['a', 'b', 'c']);
  });

  it('坏 JSON + 3 个字段 → FIELD_NAME_MISMATCH 条数为 0', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{bad', mappingParsed: false, fields: THREE,
    });
    expect(only(rows, 'FIELD_NAME_MISMATCH')).toHaveLength(0);
  });

  it('坏 JSON 时改发一条「测不出」的 info，而不是静默返回空', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{bad', mappingParsed: false, fields: THREE,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('MAPPING_UNPARSED_UNKNOWN');
    expect(rows[0].level).toBe('info');
    expect(rows[0].reason).toMatch(/测不出/);
    /* 「已确认对得齐 / 没问题」这类措辞会把「信息缺失」讲成「已确认安全」 */
    expect(rows[0].reason).not.toMatch(/没问题|无风险|已确认对得齐/);
  });

  /* 两种情形在「解析出的键集为空」上完全同形，只有 mappingParsed 分得开 ——
     这正是判据必须落在该值上、而不能落在键集是否为空上的理由。 */
  it('「合法但空 properties」与「坏 JSON」产出必须不同（键集同为空也要分得开）', () => {
    const parsed = assessFieldNameMismatch({
      mappingJson: '{"properties":{}}', mappingParsed: true, fields: THREE,
    });
    const unparsed = assessFieldNameMismatch({
      mappingJson: '{bad', mappingParsed: false, fields: THREE,
    });
    expect(parsed.map(r => r.code)).not.toEqual(unparsed.map(r => r.code));
    expect(only(parsed, 'FIELD_NAME_MISMATCH').length)
      .toBeGreaterThan(only(unparsed, 'FIELD_NAME_MISMATCH').length);
  });

  /* mappingParsed 是唯一判据：mappingJson 合法但 payload 说没解析成功时，
     以 mappingParsed 为准（后端才是那个判别位的产出方）。 */
  it('mappingJson 看着合法但 mappingParsed=false → 仍不报（以判别位为准）', () => {
    const rows = assessFieldNameMismatch({
      mappingJson: '{"properties":{"zzz":{"type":"date"}}}', mappingParsed: false, fields: THREE,
    });
    expect(only(rows, 'FIELD_NAME_MISMATCH')).toHaveLength(0);
    expect(rows[0].code).toBe('MAPPING_UNPARSED_UNKNOWN');
  });

  /* mappingParsed=false 的两个成因要分开，与后端 EntityFieldScanner.mappingParsed
     的 javadoc 口径一致：「mappingJson 为 null」是业务方没写 @Mapping 的**正常路径**，
     不该挂提示（否则每个未声明 mapping 的索引都挂一条噪音，真正的坏 JSON 提示被淹没）；
     「有内容但解析不了」才是异常，要发「测不出」。
     两条断言互斥，缺任一条另一条都可能是假绿。 */
  it('mappingJson 为 null（没写 @Mapping，正常路径）→ 完全静默，一条都不发', () => {
    expect(assessFieldNameMismatch({
      mappingJson: null, mappingParsed: false, fields: THREE,
    })).toHaveLength(0);
  });

  it('mappingJson 有内容但解析不了（异常）→ 发 1 条，与上一条互斥', () => {
    const nullCase = assessFieldNameMismatch({
      mappingJson: null, mappingParsed: false, fields: THREE,
    });
    const badCase = assessFieldNameMismatch({
      mappingJson: '{bad', mappingParsed: false, fields: THREE,
    });
    expect(nullCase).toHaveLength(0);
    expect(badCase).toHaveLength(1);
    expect(badCase[0].code).toBe('MAPPING_UNPARSED_UNKNOWN');
  });
});

/* 阻断二裁定 2：FIELD_NAME_MISMATCH 只由 assessFieldNameMismatch 产出，
   assessDateRisks 不得重复发它 —— 否则 Task 20 的界面会显示两条。 */
describe('assessDateRisks · FIELD_NAME_MISMATCH 不由本函数产出（阻断二裁定 2）', () => {
  it('即使字段不在 mapping 里，assessDateRisks 也不发 FIELD_NAME_MISMATCH', () => {
    const rows = assessDateRisks(IN({
      mappingParsed: true,
      fields: [F({ name: 'updateTime', declaredName: 'updateTime', esType: null })],
      forms: { updateTime: { epoch_millis: 10 } },
    }));
    expect(only(rows, 'FIELD_NAME_MISMATCH')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════
   规则 0：INVALID_DATE_ANNOTATION（Task 20 / Q2 实测新增）

   判据来自**字节码**而非行为探测：SimpleElasticsearchPersistentProperty
   #initDateConverter()（sdes 4.0.9）在 format()==DateFormat.none 时直接抛
   MappingException，早于任何读/写/转换器。复现程序：
   src/test/java/.../probe/R94TypeOnlyAnnotationDrill.java（故意无 @Test，需活 ES）。
   ⚠ 本组就是那个演练在 CI 侧的看守 —— 它的字节码结论若被改坏，这里会红。
   ════════════════════════════════════════════════════════════════════ */

describe('规则 0 · INVALID_DATE_ANNOTATION（构造期硬失败）', () => {
  const TYPE_ONLY = { annType: 'Date', annFormat: 'none' };

  it('@Field(type=Date) 无 format + 时间类型 javaType → error', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ ...TYPE_ONLY, javaType: 'java.sql.Timestamp' })],
    }));
    const r = only(rows, 'INVALID_DATE_ANNOTATION');
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe('error');
  });

  /* 三个合取项对应字节码的三处跳转，逐个证明是承重的。
     ⚠ offsets 58-64 的可赋值性检查最容易漏：@Field(type=Date) 打在 String 上**不抛**。
     只看 annType/annFormat 会对一个完全正常的 String 字段报 error。 */
  it('javaType 非时间类型（String）→ 不报（offsets 58-64 那个合取项是承重的）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ ...TYPE_ONLY, javaType: 'java.lang.String' })],
    }));
    expect(only(rows, 'INVALID_DATE_ANNOTATION')).toHaveLength(0);
  });

  it('format 已显式给出 → 不报（DateFormat.none 才是触发值）', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ annType: 'Date', annFormat: 'date_optional_time' })],
    }));
    expect(only(rows, 'INVALID_DATE_ANNOTATION')).toHaveLength(0);
  });

  it('annType 非日期类型（Keyword）→ 不报', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ annType: 'Keyword', annFormat: 'none' })],
    }));
    expect(only(rows, 'INVALID_DATE_ANNOTATION')).toHaveLength(0);
  });

  /* 规则 0 是构造期失败，与存储形态无关 —— 采样全空也照报。
     这一条钉住「不许把它做成依赖 forms 的判定」。 */
  it('采样为空也照报 —— 它与存储形态无关', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ ...TYPE_ONLY, javaType: 'java.time.Instant' })],
      forms: {},
    }));
    expect(only(rows, 'INVALID_DATE_ANNOTATION')).toHaveLength(1);
  });

  /* 规则 0 不是「根因」，同字段其它判定不是它的派生 —— 修好它一条也不会连带修好。
     不说这句，使用者补完 format 就不管了，重跑才发现还有第二个错（「修一个、冒一个」）。

     ⚠ 判据落在**否定关系本身**上，正反各一半 —— 这是评审拿反例打掉第一版后改的。
     第一版钉的是「依然成立」+「一并处理」两个词，看着是两条断言，实则**不是两个维度**：
     两个词同在一行、同一个 `**…**` 粗体跨度内，是同一处文本的两个碎片。
     于是下面这句**语义完全相反**的文案能让它 111 全绿：

       「其它风险大多是本条的派生，补完 format 后通常自动消失；
         若仍有个别提示**依然成立**，可与本条**一并处理**。」

     ——中性词各自都能挂进相反的句子里（本波「差异型/弱语义断言」的又一实例）。
     故必须补**反向**那一半：禁掉「派生 / 自动消失」这类把规则 0 说成根因的措辞。
     正向那半只保证「说了点什么」，**反向那半才是真正拦住语义漂移的**。

     ⚠ 构造刻意让规则 0 与 UNREADABLE_COMBINATION **真的并存**（Instant + epoch_seconds
     是矩阵红格），否则这条提示是在描述一个不存在的情形，断言就成了空转。 */
  it('提示「修好本条不连带修好其它判定」，且该情形下其它判定确实并存', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ annType: 'Date', annFormat: 'none', javaType: 'java.time.Instant' })],
      forms: { t: { epoch_seconds: 6 } },
    }));
    const codes = rows.map(r => r.code);
    // 先证明「其它判定」真的在场 —— 否则下面那条提示无所指，测了个寂寞
    expect(codes).toContain('INVALID_DATE_ANNOTATION');
    expect(codes).toContain('UNREADABLE_COMBINATION');
    const r0 = only(rows, 'INVALID_DATE_ANNOTATION')[0];
    const text = r0.reason + r0.fix;
    // 正：必须明说「修好本条不会连带修好其它」。
    // 允许词间夹 markdown 强调符（实现里写的是「不会**连带**」），否则纯粹因为排版而红。
    expect(text).toMatch(/不会\**\s*连带|不是根因|并不会因此消失|依然成立，需一并处理/);
    // 反：不许把其它判定说成本条的派生 / 会自动消失 —— 拦语义反转的就是这一半
    expect(text).not.toMatch(/派生|自动消失|通常会?消失|随之消失/);
  });

  it('建议里不许出现兼容开关 —— 实体构建就失败了，转换器没机会运行', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ ...TYPE_ONLY, javaType: 'java.sql.Timestamp' })],
    }));
    const fix = only(rows, 'INVALID_DATE_ANNOTATION')[0].fix;
    expect(fix).not.toContain(`${COMPAT_DATE_CONVERTERS_KEY}=true`);
    expect(fix).toContain('format');
  });
});

/* ════════════════════════════════════════════════════════════════════
   移交三：带日期注解的字段**不许**拿到「打开兼容开关」的建议

   Task 18 实测：属性级日期转换器抢在 CustomConversions 之前，
   打开开关什么也不会发生**且不报错** —— 使用者会以为已经修好了。

   ⚠ 正向对照放在这里（单测）而**不是** e2e：DOM/源文本断言只能证明「写了」
   不能证明「跑了」，锚还可能落在别处的同形文本上。幕 6 只留一条 DOM 断言，
   定位是「它在界面上真的渲染出来了」，**不承载本性质**。删了这里，e2e 兜不住。
   ════════════════════════════════════════════════════════════════════ */

describe('移交三 · 兼容开关建议的注解闸门', () => {
  const KEY = COMPAT_DATE_CONVERTERS_KEY;

  /* 正向对照①：经**规则 3**（UNREADABLE_COMBINATION）到达 fixForNumeric。
     不带注解的 Timestamp + epoch_seconds 是矩阵红格。 */
  it('正向① 规则 3：无注解 + 数字存储 → 建议**含**兼容开关', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.sql.Timestamp', annType: null, annFormat: null })],
      forms: { t: { epoch_seconds: 8 } },
    }));
    const r = only(rows, 'UNREADABLE_COMBINATION');
    expect(r).toHaveLength(1);
    expect(r[0].fix).toContain(KEY);
  });

  /* 正向对照②：经**规则 4**（SELF_INFLICTED_LOOP）到达 fixForNumeric。
     与①是**不同的代码路径**通向同一个建议生成器 —— 只测一条，
     另一条的路由坏掉不会红。故两条都要。 */
  it('正向② 规则 4：Instant 无注解 → 建议**含**兼容开关', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.time.Instant', annType: null, annFormat: null })],
      forms: { t: { epoch_millis: 5 } },
    }));
    const r = only(rows, 'SELF_INFLICTED_LOOP');
    expect(r).toHaveLength(1);
    expect(r[0].fix).toContain(KEY);
  });

  /* 反向：带完整日期注解的字段，规则 3 的建议里不许有开关。 */
  it('反向 规则 3：带 @Field(type=Date, format=…) + 数字存储 → 建议**不含**兼容开关', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.sql.Timestamp', annType: 'Date', annFormat: 'date_optional_time',
      })],
      forms: { t: { epoch_seconds: 8 } },
    }));
    const r = only(rows, 'UNREADABLE_COMBINATION');
    expect(r).toHaveLength(1);
    expect(r[0].fix).not.toContain(KEY);
    // 不是空着了事：必须给出真正可行的路
    expect(r[0].fix).toContain('Long');
  });

  /* 反向：规则 4 的注解闸门。annFormat='none' 的字段能走进规则 4
     （!hasDateAnnotation 是严格谓词），但它带日期注解，开关同样无效。 */
  it('反向 规则 4：annType=Date/annFormat=none 的 Instant → 建议**不含**兼容开关', () => {
    const rows = assessDateRisks(IN({
      fields: [F({ javaType: 'java.time.Instant', annType: 'Date', annFormat: 'none' })],
      forms: { t: { epoch_millis: 5 } },
    }));
    const r = only(rows, 'SELF_INFLICTED_LOOP');
    expect(r).toHaveLength(1);
    expect(r[0].fix).not.toContain(KEY);
  });

  /* Task 19：10 位与 13 位在数值上不可区分，mapping 侧结构上无解。
     混合宽度下不许给 Path A（改 @Field(format=…)），只能给 Path B（换 Long）。 */
  it('Task 19 校验：混合宽度 + 带注解 → 如实说无干净方案，只给 Long 这条路', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.sql.Timestamp', annType: 'Date', annFormat: 'date_optional_time',
      })],
      forms: { t: { epoch_millis: 5, epoch_seconds: 5 } },
    }));
    const fix = only(rows, 'UNREADABLE_COMBINATION')[0].fix;
    expect(fix).toContain('没有干净的修法');
    expect(fix).toContain('Long');
    expect(fix).not.toContain(KEY);
    // 不许推荐 epoch_millis 注解 —— 混合宽度下它做不到
    expect(fix).not.toContain('DateFormat.epoch_millis');
  });

  /* ambiguous_small：<1e9 区间 Path B 也判不了，必须说出来，
     否则又是一条「照着做仍会错却不报错」的路。 */
  it('ambiguous_small 在场 → 追加说明 Long 方案也判不了该区间', () => {
    const rows = assessDateRisks(IN({
      fields: [F({
        javaType: 'java.sql.Timestamp', annType: 'Date', annFormat: 'date_optional_time',
      })],
      forms: { t: { epoch_seconds: 5, ambiguous_small: 2 } },
    }));
    expect(only(rows, 'UNREADABLE_COMBINATION')[0].fix).toContain('1e9');
  });
});

/* ════════════════════════════════════════════════════════════════════
   移交一 / 移交二：mergeRiskRows

   移交一：FIELD_NAME_MISMATCH 只由 assessFieldNameMismatch 产出。
           若界面只调 assessDateRisks，该 code 会**整类**消失 ——
           而它正是 R94 §5 的原始案例。
   ⚠ 规则一自问：只调 assessDateRisks 的错误实现，什么断言照样绿？
     —— 「列表非空」会绿。故必须断言**这个具体 code 在列表里**。

   ★ 排序口径：level 升序 → field 升序 → code 升序 ★
   与 assessDateRisks 内部（field 优先）不同，故 Task 17 那条看守不覆盖这里。
   ════════════════════════════════════════════════════════════════════ */

describe('mergeRiskRows · 移交一（两类都要出现）与移交二（排序口径）', () => {
  /* 同时触发两类的输入：
     · updateTime 走 dynamic（esType=null，mappingParsed=true）→ DYNAMIC_MAPPED_FIELD
     · 同一字段不在 mapping 的 properties 里            → FIELD_NAME_MISMATCH */
  const MAPPING = '{"properties":{"update_time":{"type":"date"}}}';
  const FIELDS = [{
    name: 'updateTime', declaredName: 'updateTime', javaType: 'java.sql.Timestamp',
    esType: null, esFormat: null, annType: null, annFormat: null, annPattern: null,
  }];

  const merged = () => mergeRiskRows(
    assessDateRisks({
      mappingParsed: true, fields: FIELDS, forms: {}, sdesVersion: '4.0.9.RELEASE',
    }),
    assessFieldNameMismatch({ mappingJson: MAPPING, mappingParsed: true, fields: FIELDS }),
  );

  it('两类 code 都出现在最终列表里（断言具体 code，不是「非空」）', () => {
    const codes = merged().map(r => r.code);
    expect(codes).toContain('FIELD_NAME_MISMATCH');
    expect(codes).toContain('DYNAMIC_MAPPED_FIELD');
  });

  /* 反向：证明上一条的 FIELD_NAME_MISMATCH 断言确实靠 assessFieldNameMismatch 供给。
     只喂 assessDateRisks 的产出（模拟「只调一个函数」的错误实现）→ 该 code 必须缺席。
     没有这一条，上面那条可能被别处误供给而假绿。 */
  it('只喂 assessDateRisks 的产出 → FIELD_NAME_MISMATCH 缺席（证明它只来自另一个函数）', () => {
    const onlyDateRisks = mergeRiskRows(
      assessDateRisks({
        mappingParsed: true, fields: FIELDS, forms: {}, sdesVersion: '4.0.9.RELEASE',
      }), [],
    );
    expect(onlyDateRisks.map(r => r.code)).not.toContain('FIELD_NAME_MISMATCH');
  });

  /* 移交二：看守要挑「本排序口径分辨不出」的两个对象。
     两条都是 warning、同 field —— level 与 field 两级都无分辨力，
     故本条真正钉住的是**最后一级 code 排序**（确定性），而不是级别。
     若去掉 code 这级排序键，顺序将取决于数组拼接次序，本条会红。 */
  it('同 level 同 field 的两条 → 按 code 升序（level/field 两级对它们无分辨力）', () => {
    const rows = mergeRiskRows(
      [{ code: 'ZZZ_LATER', level: 'warning', field: 'same', reason: '', fix: '' }],
      [{ code: 'AAA_EARLIER', level: 'warning', field: 'same', reason: '', fix: '' }],
    );
    expect(rows.map(r => r.code)).toEqual(['AAA_EARLIER', 'ZZZ_LATER']);
  });

  it('error 排在 warning 之前，跨字段也如此（level 是第一级）', () => {
    const rows = mergeRiskRows(
      [{ code: 'W', level: 'warning', field: 'aaa', reason: '', fix: '' }],
      [{ code: 'E', level: 'error', field: 'zzz', reason: '', fix: '' }],
    );
    expect(rows.map(r => r.code)).toEqual(['E', 'W']);
  });
});

/* w26：mapping 不可判时聚合为 per-index 单条 —— 80 字段索引不得再刷 80 条同文案 */
it('w26 mappingParsed=false 且多字段 → 仅 1 条 MAPPING_UNPARSED_UNKNOWN（不逐字段刷）', () => {
  const base = F();
  const many = [1, 2, 3, 4, 5].map(i => ({ ...base, name: 'f' + i }));
  const rows = assessDateRisks(IN({ mappingParsed: false, fields: many, forms: {} }));
  const hits = only(rows, 'MAPPING_UNPARSED_UNKNOWN');
  expect(hits).toHaveLength(1);
  expect(hits[0].field).toBe('');
});
