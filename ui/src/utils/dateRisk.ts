/* date 存储形态 × Java 类型的兼容风险判定。纯函数、零 Vue 依赖，规则可穷举单测
 —— 与 dslLint / docDiff / configDiff 同范式。

 === 判定的两个输入从哪来 ===
 ① 存储形态（forms）： 的 GET /internal/es/index/cluster/date-forms 随机采样得出，
 零业务侧依赖。端点另有一棵 samples 树装样例值（string[]），与 forms（计数，number）
 是**两棵分开的树**，不可混淆——本函数只吃 forms。
 ② Java 类型与注解（fields）： 的 desired-state payload，业务侧反射得出。

 两者交叉查 实测的 30 格矩阵即可判定红/绿，零猜测。

 === 贯穿本文件的一条原则：ok 是一个结论，缺席不是 ===
 信息不足时必须**明确说出「测不出」**，不许静默给 ok，也不许拿一个我们没有的结论去吓人。
 本文件有两处降级路径，都遵守这条：
 · mappingParsed === false → 规则 {1,6,7} 不可判，发 MAPPING_UNPARSED_UNKNOWN（info）
 · javaType === null → 规则 {3,4,5} 不可判，发 JAVA_TYPE_UNKNOWN（info）

 === 为什么 assessDateRisks 不解析 mappingJson ===
 规则 1 需要 mapping 里该字段的 format，它由后端 EntityFieldScanner 随 esType 一并产出
 （esFormat）。前端若自己再解析一次，仓库里就有两个 mapping 解析器：此刻一致，从此各自演化；
 且「后端 mappingParsed=false 而前端解析成功读出了 format」这种错位在类型上完全合法。
 故 assessDateRisks **连 mappingJson 入参都不收** —— 它需要的每一项后端都已逐字段给了。

 assessFieldNameMismatch 是正当的例外：它要回答「mapping 里有没有这个键」，
 需要看见**孤儿键**（mapping 有、实体没有），那不是逐字段事实，后端补 flag 补不出来。
 但它的**把关仍落在 mappingParsed 这个值上**，不落在「解析出的键集是否为空」——
 后者会把「mapping 合法但 properties 为空」（每个字段都真走 dynamic，该报）
 与「mappingJson 坏掉」（一个都不该报）混为一谈，两者在键集为空上同形。 */

/** DateFormSampler 的观测值域，逐一对应其 9 个常量（EPOCH_MILLIS…OTHER）。

 先声明为「值」再派生类型，而不是直接写 union type：TS 的 type 在运行期不存在、
 不可被断言，词表只有是值才落得下判据（否则 加了形态而这边没跟上，无人会红）。

 ⚠ 刻意**不含** 'mixed'：mixed 是判定层的 code（MIXED_STORED_FORMS），不是采样器的观测。
 把它塞进本词表会让同一事实有两个表示位置——`{epoch_millis:5, mixed:5}` 究竟是几种形态？
 规则 2 就此自我指涉。 */
export const STORED_FORMS = ['epoch_millis', 'epoch_seconds', 'iso8601', 'space_sep',
  'date_only', 'ambiguous_small', 'null_value', 'absent', 'other'] as const;
export type StoredForm = typeof STORED_FORMS[number];

type RiskLevel = 'error' | 'warning' | 'info' | 'ok';

/** 的 starter 开关属性名。抽成常量以便两处对齐——改名时不会只改一半。 */
export const COMPAT_DATE_CONVERTERS_KEY = 'esquerystudio.elasticsearch.compat.date-converters';

interface DateFieldRisk {
  field: string;
  /** 形态 -> 样本计数（原样回填 forms[field]，供界面展示判定依据） */
  storedForms: Partial<Record<StoredForm, number>>;
  javaType: string | null;
  esType: string | null;
  /** mapping 里该字段有 format（由后端 esFormat 得出，本函数不解析 mapping） */
  hasExplicitFormat: boolean;
  level: RiskLevel;
  code: string;
  reason: string;
  fix: string;
}

interface DateRiskField {
  name: string;
  declaredName: string;
  javaType: string | null;
  esType: string | null;
  /** mapping 里该字段的 format 原文（多 format 以 || 连写）；无则 null */
  esFormat: string | null;
  /** null = 整个 @Field 没写；'Auto' / 'none' = 注解在但该项未指定（哨兵值，不是缺席） */
  annType: string | null;
  annFormat: string | null;
  annPattern: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════
 READ 矩阵：30 格（5 存储形态 × 6 Java 类型），只有 7 格可读。

 写成显式数据表而非一串 if —— 矩阵是从实测来的事实，必须一眼能与 notes 对照。
 复跑：mvn -o test -Dtest='DateConversionMatrixProbe+DateFixMatrixProbe'
 ══════════════════════════════════════════════════════════════════════════ */

const T = 'java.sql.Timestamp', SD = 'java.sql.Date', UD = 'java.util.Date',
  LONG = 'java.lang.Long', INST = 'java.time.Instant', LDT = 'java.time.LocalDateTime';

/** 每种存储形态下**能读出来**的 Java 类型。不在集合里 = 的 ✗。 */
const READABLE: Partial<Record<StoredForm, ReadonlySet<string>>> = {
  // Timestamp sql.Date util.Date Long Instant LocalDateTime
  epoch_millis: new Set([/*✗*/ /*✗*/ UD, LONG /*✗ ✗*/]),
  epoch_seconds: new Set([/*✗ ✗ ✗*/ LONG /*✗ ✗*/]),
  iso8601: new Set([/*✗ ✗ ✗ ✗*/ INST, LDT]),
  space_sep: new Set([T /*✗ ✗ ✗ ✗ ✗*/]),
  date_only: new Set([/*✗*/ SD /*✗ ✗ ✗ ✗*/]),
};

/** 参与矩阵判定的形态。其余（ambiguous_small / null_value / absent / other）不查矩阵。 */
const MATRIX_FORMS = Object.keys(READABLE) as StoredForm[];

/** 真实的「存储形态」。null_value / absent 是缺席的两种记法，不是形态，不算入多样性。
 ambiguous_small / other 是真实存在的值，只是判不出语义，仍算一种形态。 */
const REAL_FORMS: ReadonlySet<StoredForm> = new Set<StoredForm>([
  'epoch_millis', 'epoch_seconds', 'iso8601', 'space_sep', 'date_only',
  'ambiguous_small', 'other',
]);

/** 数字存储：在 sdes 4.0.9 上注解路线**完全无效**，唯一出路是 Converter（ 推论）。 */
const NUMERIC_FORMS: ReadonlySet<StoredForm> = new Set<StoredForm>(['epoch_millis', 'epoch_seconds']);

/** 无时区的 Java 类型：按系统默认时区折算，跨时区服务写入会静默错位（。 */
const TZ_NAIVE = LDT;
/** TemporalAccessor 类型：无 @Field 日期注解且无 Converter 时读不出（ 自伤闭环）。 */
const TEMPORAL_TYPES: ReadonlySet<string> = new Set([INST, LDT]);

/** sdes `FieldType` 里的日期类型。规则 0 的第一个合取项。 */
const DATE_FIELD_TYPES: ReadonlySet<string> = new Set(['Date', 'Date_Nanos']);

/**
 * 规则 0 的第三个合取项：javaType 是 `TemporalAccessor` 或 `java.util.Date` **可赋值**。
 *
 * 判据必须落在**完整**条件上：`initDateConverter()` 的 offsets 58-64 先做这个可赋值性检查，
 * 不满足就整个跳过 —— 故 `@Field(type=Date)` 打在 `String` 字段上**不会**抛。
 * 只看 annType/annFormat 而漏掉这一项，会对一个完全正常的 String 字段报 error。
 *
 * `java.sql.Timestamp` / `java.sql.Date` 都是 `java.util.Date` 的子类，故一并在内。
 */
const CONSTRUCT_FAILING_TYPES: ReadonlySet<string> = new Set([T, SD, UD, INST, LDT]);

/** sdes 的 DateFormat 枚举加入 epoch_millis / epoch_second 的版本（javap 实测 4.0.9 没有）。 */
const EPOCH_FORMAT_SINCE = { major: 4, minor: 2 };

const LEVEL_RANK: Record<RiskLevel, number> = { error: 0, warning: 1, info: 2, ok: 3 };

/* ══════════════════════════════════════════════════════════════════════════
 辅助判定
 ══════════════════════════════════════════════════════════════════════════ */

/** 该形态在样本里真的出现过（计数 > 0）。后端可能吐出 0 计数的桶，0 不算出现。 */
const seen = (forms: Partial<Record<StoredForm, number>>, f: StoredForm) => (forms[f] ?? 0) > 0;

/** 实际出现过的「真实存储形态」列表，用于规则 2 的多样性判定。 */
function realFormsPresent(forms: Partial<Record<StoredForm, number>>): StoredForm[] {
  return STORED_FORMS.filter(f => REAL_FORMS.has(f) && seen(forms, f));
}

/**
 * 注解是否**足以**让该形态读出来。
 *
 * 实测：注解路线**只对字符串存储有效**（C 行 OK）；对 epoch 数字存储无效
 * （A / D 两行 FAIL）——「加了注解就没事」是本题最常见的误判，故数字形态一律返回 false。
 *
 * `annType`/`annFormat` 为 'Auto'/'none' 是 sdes 枚举默认值（哨兵值，表示「注解在但该项未指定」），
 * 对读取毫无帮助，等同于没写日期注解。把「!= null」当成「有日期注解」会漏掉这一格。
 */
function annotationRescues(field: DateRiskField, form: StoredForm): boolean {
  if (NUMERIC_FORMS.has(form)) return false;
  return hasDateAnnotation(field);
}

/** 写了 @Field 且**显式**指定了日期 type/format（排除 Auto / none 两个哨兵值）。 */
function hasDateAnnotation(field: DateRiskField): boolean {
  const typeOk = field.annType != null && field.annType !== 'Auto';
  const fmtOk = field.annFormat != null && field.annFormat !== 'none';
  return typeOk && fmtOk;
}

/**
 * 规则 0：`@Field(type = Date|Date_Nanos)` 而 `format` 未指定，且 javaType 是时间类型。
 *
 * **这不是「可能有问题」，是确定的构造期硬失败**（字节码给的，见
 * sdes `initDateConverter()` 构建路径的字节码反编译）：
 * `DateFormat.none` 是注解默认值，sdes 4.0.9 在**首次构建该 persistent entity** 时
 * 直接抛 `MappingException`，早于任何读、写、转换器。
 *
 * 三个合取项缺一不可，对应字节码的三处跳转：
 * · `type() ∈ {Date, Date_Nanos}`（offsets 34-55）
 * · javaType 为 TemporalAccessor / Date 可赋值（offsets 58-64）—— String 字段不抛
 * · `format() == DateFormat.none`（offsets 67-80）
 */
function isInvalidDateAnnotation(field: DateRiskField): boolean {
  return field.annType != null && DATE_FIELD_TYPES.has(field.annType)
    && field.annFormat === 'none'
    && field.javaType != null && CONSTRUCT_FAILING_TYPES.has(field.javaType);
}

/**
 * 该字段带**日期类注解**（`@Field(type = Date|Date_Nanos)`），无论 format 写没写。
 *
 * 与 {@link hasDateAnnotation} 是**两个不同的问题**，不可合并：
 * · `hasDateAnnotation` —— 注解**足以让值读出来**吗（要求 format 也显式给了）
 * · `hasAnyDateAnnotation` —— 该字段**归属性级日期转换器管**吗
 *
 * 后者才是「兼容开关对它有没有用」的判据： 实测，带 `@Field(type=Date, format=…)`
 * 的属性由 sdes 安装**属性级**日期转换器，它**抢在** `ElasticsearchCustomConversions`
 * 之前生效 —— 打开 `esquerystudio.elasticsearch.compat.date-converters` **什么也不会发生，而且不报错**。
 */
function hasAnyDateAnnotation(field: DateRiskField): boolean {
  return field.annType != null && DATE_FIELD_TYPES.has(field.annType);
}

/** 解析 sdes 版本的 major.minor；解析不了返回 null（按未知处理，两套方案都给）。 */
function parseSdes(v: string | null): { major: number; minor: number } | null {
  if (!v) return null;
  const m = /^(\d+)\.(\d+)/.exec(v.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** sdes >= 4.2 才有 DateFormat.epoch_millis 枚举，才允许推荐那个更轻的注解方案。 */
function supportsEpochFormatEnum(sdesVersion: string | null): boolean {
  const p = parseSdes(sdesVersion);
  if (!p) return false;
  return p.major > EPOCH_FORMAT_SINCE.major
    || (p.major === EPOCH_FORMAT_SINCE.major && p.minor >= EPOCH_FORMAT_SINCE.minor);
}

/* ══════════════════════════════════════════════════════════════════════════
 修复建议生成
 ══════════════════════════════════════════════════════════════════════════ */

const CONVERTER_SNIPPET =
  `@Bean\npublic ElasticsearchCustomConversions elasticsearchCustomConversions() {\n`
  + `    return new ElasticsearchCustomConversions(Arrays.asList(\n`
  + `        new LongToTimestampConverter(), new TimestampToLongConverter()));\n}`;

/** 数字存储（epoch_millis / epoch_seconds）读不出来时的修法，按 sdes 版本分叉。
 *
 * ⚠ **只对「不带日期注解」的字段成立**。带 `@Field(type=Date…)` 的字段由属性级转换器接管，
 * 兼容开关对它们完全无效（ 实测）—— 那条路走 {@link fixForAnnotatedNumeric}。
 * 调用方一律经 {@link fixForUnreadable} 分流，不要直接调本函数。 */
function fixForNumeric(sdesVersion: string | null): string {
  const head = `首推：配 \`${COMPAT_DATE_CONVERTERS_KEY}=true\`（一行，starter 自动注册读写转换器）。`;
  if (supportsEpochFormatEnum(sdesVersion)) {
    return `${head}\n或：@Field(type = FieldType.Date, format = DateFormat.epoch_millis)`
      + `（sdes ${sdesVersion} >= 4.2，该枚举存在）。\n不想用开关时也可自行注册：\n${CONVERTER_SNIPPET}`;
  }
  const known = parseSdes(sdesVersion) != null;
  const tail = known
    ? `当前 sdes ${sdesVersion} < 4.2，DateFormat 枚举里**没有** epoch 相关值，注解路线编译都过不了（字节码实测）。`
    : `sdes 版本未知：4.2 以下只能用转换器；4.2 及以上还可用注解 format。两套都列出，不赌。`;
  return `${head}\n${tail}\n不想用开关时自行注册：\n${CONVERTER_SNIPPET}`;
}

/**
 * **带日期注解**的字段遇上 epoch 数字存储时的修法。
 *
 * 本函数存在的唯一理由：**不许给这类字段推荐兼容开关**。 实测，属性级日期转换器
 * 抢在 `ElasticsearchCustomConversions` 之前生效，打开开关**什么也不会发生、而且不报错**
 * —— 使用者会以为已经修好了。**一个照着做了却没效果且不声张的建议，比不给建议更糟。**
 *
 * 那么真正可行的是什么？两条路，且**都有 划定的边界**：
 *
 * · **Path A（改 `@Field(format=…)`）**：只在**存量宽度单一**时成立。
 * 实测：10 位与 13 位在数值上**不可区分**，`epoch_second` 前置则 13 位飞到公元 57000 年、
 * 后置则 10 位掉回 1970 —— **mapping 侧结构上无解**。故混合宽度下 Path A **不可能**，
 * 不是「不推荐」而是「做不到」。且它依赖「存量宽度从此不再变化」这个前提。
 *
 * · **Path B（换 `Long` 自行转换）**：把歧义搬到 **Java 读侧**，那里 `abs(v) >= 1e12` 可判定
 * （`EpochDateConverters.toMillis` 做的正是这件事）。**混合宽度下这是唯一结构上成立的路。**
 *
 * · **`ambiguous_small` 的额外边界**：`< 1e9` 的值 Path B **也判不了**（1970 年附近，
 * 秒/毫秒两种解释都成立）。此时必须说出来，否则又是一条「照着做仍会错却不报错」的路。
 *
 * 当没有干净方案时，本函数**如实这么说**并给出需要人工决策的点，
 * **不为了让 `fix` 非空而编一条听起来可行的建议**。
 */
function fixForAnnotatedNumeric(
  field: DateRiskField, forms: Partial<Record<StoredForm, number>>, sdesVersion: string | null,
): string {
  const mixedWidth = seen(forms, 'epoch_millis') && seen(forms, 'epoch_seconds');
  /* ⚠ 本函数的产出**一个字都不许出现** COMPAT_DATE_CONVERTERS_KEY。
 即便是「不要用它」这种否定措辞也不行 —— 单测用的是 `not.toContain(KEY)` 这条
 强判据，理由：否定措辞与推荐措辞只差几个字，一次好意的改写就能把「别用」变成「可用」，
 而宽松的判据（如「不含 `=true`」）看不出这个漂移。故这里改述其效果，不写键名。 */
  const head = `⚠ 该字段带 @Field(type = FieldType.Date${field.annFormat && field.annFormat !== 'none'
    ? `, format = ${field.annFormat}` : ''})，`
    + `属性级日期转换器抢在 CustomConversions 之前生效 —— `
    + `**starter 的 epoch 兼容开关对它完全无效，且不会报任何错**（实测）。`
    + `不要走那条路：打开了什么也不会发生，你会以为已经修好了。`;

  const body = mixedWidth
    ? `**本字段没有干净的修法**，如实告知：样本中 10 位（秒）与 13 位（毫秒）**并存**，`
      + `而两者在数值上不可区分。改 @Field(format=…) 属于 mapping 侧方案，`
      + `epoch_second 前置则 13 位值被解析到公元 57000 年、后置则 10 位值掉回 1970 —— `
      + `**结构上不可能**同时正确（字节码实测）。\n`
      + `唯一结构上成立的路：把实体字段类型换成 \`Long\`，在 Java 读侧自行换算`
      + `（\`abs(v) >= 1e12\` 判毫秒，否则判秒 —— 歧义只能在读写侧消解，mapping 侧消解不了）。\n`
      + `需要人工决策的点：是接受改类型，还是先 reindex 把存量统一成一种宽度。`
    : supportsEpochFormatEnum(sdesVersion)
      ? `存量宽度单一，可改注解：@Field(type = FieldType.Date, format = DateFormat.epoch_millis)`
        + `（sdes ${sdesVersion} >= 4.2，该枚举存在）。\n`
        + `⚠ 该方案依赖「存量宽度从此不再变化」这个前提 —— 一旦将来混入另一种宽度，它会再次失效。\n`
        + `更稳妥：换成 \`Long\` 在 Java 读侧自行换算，宽度变化对它无影响。`
      : `存量宽度单一，但当前 sdes ${sdesVersion ?? '版本未知'} < 4.2，`
        + `DateFormat 枚举里**没有** epoch 相关值，注解路线编译都过不了（字节码实测）—— `
        + `**Path A 在这个版本上不可用**。\n`
        + `可行的是：把实体字段类型换成 \`Long\`，在 Java 读侧自行换算。`;

  const tail = seen(forms, 'ambiguous_small')
    ? `\n⚠ 样本中还有 abs(v) < 1e9 的值：这个区间**秒与毫秒都解释得通**，`
      + `换 \`Long\` 自行换算**也判不了**（\`toMillis\` 对该区间一律原样透出，不猜）。`
      + `需人工确定这批数据的原始语义。`
    : '';

  return `${head}\n${body}${tail}`;
}

/** 字符串存储读不出来时的修法：注解路线有效（ C 行实测 OK）。 */
function fixForString(form: StoredForm): string {
  const pattern = form === 'space_sep' ? 'yyyy-MM-dd HH:mm:ss'
    : form === 'date_only' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ssXXX";
  return `字符串存储可用注解修复：@Field(type = FieldType.Date, `
    + `format = DateFormat.custom, pattern = "${pattern}")。\n`
    + `或改用与该形态匹配的 Java 类型（与字段存储形态、javaType 与 format 三者的兼容矩阵一致）。`;
}

/** 读不出来时的修法总入口。**数字存储必须先按「带不带日期注解」分流** ——
 * 带注解的字段兼容开关无效（给它推开关是一条静默失效的假建议。 */
function fixForUnreadable(
  field: DateRiskField, form: StoredForm,
  forms: Partial<Record<StoredForm, number>>, sdesVersion: string | null,
): string {
  if (!NUMERIC_FORMS.has(form)) return fixForString(form);
  return hasAnyDateAnnotation(field)
    ? fixForAnnotatedNumeric(field, forms, sdesVersion)
    : fixForNumeric(sdesVersion);
}

const FIX_SECONDS_IN_FORMATLESS =
  `两条路径，取舍不同：\n`
  + `① 重建索引，给该字段 mapping 加 "format": "strict_date_optional_time||epoch_millis||epoch_second"`
  + `（format 不可原地改，必须重建索引）；\n`
  + `② reindex 时用 script 把秒统一改成毫秒：ctx._source.<field> = ctx._source.<field> * 1000。\n`
  + `⚠ 开转换器救不了这条 —— 它是 ES 侧的错，不是客户端读取的错。`
  + `转换器只影响 Java 端怎么读，改不了 ES 已经算错的排序、范围与聚合。`;

/* ══════════════════════════════════════════════════════════════════════════
 主判定
 ══════════════════════════════════════════════════════════════════════════ */

export function assessDateRisks(input: {
  /** 的 payload row 级判别位。false = mappingJson 未能解析，此时依赖 mapping 的
 * 规则 {1, 6} 全部不可判（规则 7 归 assessFieldNameMismatch）。
 *
 * ⚠ 本函数**刻意不接收 mappingJson**：规则 1 需要的 format 由后端随 esType 一并给成
 * 逐字段的 esFormat，本函数需要的每一项后端都已逐字段提供，没有任何理由在这里解析 mapping。
 * 留一个「声明了却从不消费」的 mappingJson 入参，等于在签名上摆一个
 * 「这里可以解析 mapping」的路标 —— 下一个人照着走进去，第二份解析器就诞生了。 */
  mappingParsed: boolean;
  fields: DateRiskField[];
  /** 形态**计数**树，名字与 date-forms 端点的 `forms` 一致。
 * 端点另有一棵 `samples` 树装样例值（string[]），两者不可混淆。 */
  forms: Record<string, Partial<Record<StoredForm, number>>>;
  sdesVersion: string | null;
}): DateFieldRisk[] {
  const { mappingParsed, fields, forms, sdesVersion } = input;
  const out: DateFieldRisk[] = [];

  for (const field of fields ?? []) {
    /* 非 date 字段不评。esType == null 时无从得知它是不是 date，仍要评——
 那正是规则 6 / MAPPING_UNPARSED_UNKNOWN 要说的话。 */
    if (field.esType != null && field.esType !== 'date') continue;

    const storedForms = (forms ?? {})[field.name] ?? {};
    const hasExplicitFormat = field.esFormat != null;
    const javaType = field.javaType;
    const rows: DateFieldRisk[] = [];
    const emit = (level: RiskLevel, code: string, reason: string, fix: string) =>
      rows.push({
        field: field.name, storedForms, javaType, esType: field.esType,
        hasExplicitFormat, level, code, reason, fix,
      });

    /* ---- 规则 0：INVALID_DATE_ANNOTATION（error）· 构造期硬失败，排在规则 1 之前 ----

 编号从 0 起是刻意的：**不重排既有规则编号**（spec 条号被多处引用，不改动）。
 它必须最先判 —— 一旦成立，该字段上其它一切关于「存储形态怎么读」的判定都是无意义的：
 实体根本装不起来，先说这个，再谈别的没有意义。

 判据来自字节码而非行为探测（行为探测是死仪器，
 阳性对照抛同样异常，只能证明没走到转换器）。 */
    if (isInvalidDateAnnotation(field)) {
      emit('error', 'INVALID_DATE_ANNOTATION',
        `该字段写了 @Field(type = FieldType.${field.annType}) 但**没有指定 format**，`
        + `而 javaType ${javaType} 是时间类型 —— sdes 4.0.9 在**首次构建该实体**时`
        + `直接抛 MappingException("...but has no DateFormat defined")，`
        + `早于任何读、写、转换器（initDateConverter 字节码实测）。`
        + `**这与存储形态无关**：无论 ES 里存的是什么，这个实体都装不起来。\n`
        + `⚠ 应用能正常启动、也能上报本 payload（字段扫描走普通反射，不构建 persistent entity；`
        + `sdes 是惰性构建的），**会在第一次访问该实体的 ES 操作时才炸** —— 这是个潜伏的硬失败。`,
        `补上 format：@Field(type = FieldType.${field.annType}, format = DateFormat.<与存量数据匹配的格式>)；`
        + `\n或把实体字段类型换成 \`Long\` 自行换算（epoch 数值存储时更稳，见本字段其它建议）。`
        + `\n⚠ 不要指望 starter 的 epoch 兼容开关 —— 实体构建就失败了，转换器根本没机会运行。`
        /* 本条不是「根因」，同字段的其它判定不是它的派生。补 format 只让实体装得起来，
 读取层面的错（矩阵红格 / 时区漂移 / 形态混杂）**一条都不会因此消失**。
 不说这句，使用者会修完就不管，重跑一遍才发现还有第二个错 ——
 变成「修一个、冒一个」。两条一起看全，他才能一次决定怎么改。
 抑制其余判定换来的「清爽」，代价是隐藏一个他迟早要撞上的问题。 */
        + `\n⚠ 修好本条**不会**连带修好该字段的其它判定：补 format 只是让实体能构建，`
        + `本字段列出的其它风险（存储形态读不出、时区漂移等）**依然成立，需一并处理**。`);
    }

    /* ---- 规则 1：SECONDS_IN_FORMATLESS_DATE（error）· 依赖 mapping，未解析时降级 ---- */
    if (seen(storedForms, 'epoch_seconds') && mappingParsed
      && !(field.esFormat ?? '').includes('epoch_second')) {
      emit('error', 'SECONDS_IN_FORMATLESS_DATE',
        `样本中出现 epoch_seconds（10 位秒），而该字段 mapping 无 epoch_second format。`
        + `ES 默认 format 为 strict_date_optional_time||epoch_millis，不含 epoch_second，`
        + `秒值会被解析成 1970 年附近 —— 该字段的范围查询、排序、date_histogram 聚合`
        + `从写入第一天起就是错的（字节码路径实测）。这不是迁移风险，是存量 bug。`,
        FIX_SECONDS_IN_FORMATLESS);
    }

    /* ---- 规则 2：MIXED_STORED_FORMS（error）· 不依赖 mapping / javaType ---- */
    const present = realFormsPresent(storedForms);
    if (present.length > 1) {
      emit('error', 'MIXED_STORED_FORMS',
        `同一字段并存 ${present.length} 种存储形态：${present.join(' / ')}。`
        + `任何单一转换器都只能对其中一半正确。`,
        `先查明形态是何时改变的（通常是某次发版换了写入方式），`
        + `再 reindex 把存量数据统一成一种形态；统一之前不要注册转换器。`);
    }

    /* ---- 规则 3：UNREADABLE_COMBINATION（error）· 输入全不来自 mapping，未解析时不降级 ---- */
    if (javaType != null) {
      for (const form of MATRIX_FORMS) {
        if (!seen(storedForms, form)) continue;
        if (READABLE[form]!.has(javaType)) continue;
        if (annotationRescues(field, form)) continue;
        emit('error', 'UNREADABLE_COMBINATION',
          `存储形态 ${form} 读进 ${javaType} 在类型兼容实测矩阵里是红格 —— 读取会抛异常`
          + `（数字→时间类型报 ConverterNotFoundException，字符串报 DateTimeParseException）。`
          + (NUMERIC_FORMS.has(form)
            ? `注解路线对数字存储无效（兼容矩阵 A/D 行实测 FAIL），只能注册转换器。` : ``),
          fixForUnreadable(field, form, storedForms, sdesVersion));
      }
    }

    /* ---- 规则 4：SELF_INFLICTED_LOOP（error）· 依赖 javaType + 注解 ----

 建议侧同样要过注解闸门：`!hasDateAnnotation` 是**严格**谓词（要求 type 与 format 都显式给了），
 故 `annType='Date', annFormat='none'` 的字段**能走进**本分支 —— 而它带日期注解，
 兼容开关对它无效（且规则 0 已判定该实体构造即失败）。
 直接调 fixForNumeric 会给它推开关，那正是移交三要禁的那条静默失效建议。 */
    if (javaType != null && TEMPORAL_TYPES.has(javaType) && !hasDateAnnotation(field)) {
      emit('error', 'SELF_INFLICTED_LOOP',
        `${javaType} 没有 @Field 日期注解：写入时能落成 epoch_millis 数字，`
        + `读回同一份数据却抛 ConverterNotFoundException —— 自己写进去的自己读不出来`
        + `（结构使然，与是否迁移、与 ES 版本都无关）。`,
        hasAnyDateAnnotation(field)
          ? fixForAnnotatedNumeric(field, storedForms, sdesVersion)
          : fixForNumeric(sdesVersion));
    }

    /* ---- 规则 5：LOCALDATETIME_TZ_DRIFT（warning）· 只依赖 javaType ---- */
    if (javaType === TZ_NAIVE) {
      emit('warning', 'LOCALDATETIME_TZ_DRIFT',
        `LocalDateTime 无时区，sdes 按**系统默认时区**折算 epoch。`
        + `实测比其余五种类型少 8 小时（CST 偏移）；源数据若由不同时区的服务写入，`
        + `迁移后会静默错位 —— 不报错，只是数据不对。`,
        `改用 Instant + @Field(type = FieldType.Date, format = DateFormat.date_optional_time)，`
        + `或显式注册带固定时区的转换器，把时区从「运行环境」变成「代码里写死的事实」。`);
    }

    /* ---- 规则 6：esType == null 且 mapping 可用 → dynamic mapping 警告 ----
 w26：mappingParsed=false 的「测不出」不再逐字段发（旧形态 80 字段=80 条同文案
 噪音,淹没真差异）——改为函数尾 per-index 单条汇总,与 assessFieldNameMismatch 口径对齐。 */
    if (field.esType == null && mappingParsed) {
      emit('warning', 'DYNAMIC_MAPPED_FIELD',
        `mapping 解析成功但其中没有 "${field.name}" 这个键 —— 该字段走 dynamic mapping，`
        + `类型由 ES 按首个写入值猜。迁移后若目标集群的 dynamic 策略或 date_detection 不同，`
        + `该字段类型可能漂移。`,
        `在 mapping 里显式声明 "${field.name}" 的类型；`
        + `若 mapping 里已有形似的键（如下划线写法），见 FIELD_NAME_MISMATCH。`);
    }

    /* ---- 规则 8：AMBIGUOUS_SMALL_INT（info）· 不依赖 mapping / javaType ---- */
    if (seen(storedForms, 'ambiguous_small')) {
      emit('info', 'AMBIGUOUS_SMALL_INT',
        `样本中有 abs(v) < 1e9 的整数，落在 1970 年附近，无法判定它是秒还是毫秒。`
        + `请对照端点返回的 samples 样例值人工判读。`,
        `查明该字段的写入方，确认这些小整数是真实的 1970 年附近时间，`
        + `还是被误当成时间戳的业务编号。`);
    }

    /* ---- javaType 缺失：规则 3/4/5 不可判，明确说出「测不出」而不是静默给 ok ---- */
    if (javaType == null) {
      emit('info', 'JAVA_TYPE_UNKNOWN',
        `业务侧未提供该字段的 Java 类型，读取兼容性（矩阵红格 / 自伤闭环 / 时区漂移）`
        + `**测不出** —— 需业务侧 desired-state payload 才能精确判定。`
        + `这不表示没风险，只表示本次缺少判定所需的输入。`,
        `让业务应用升级到 ESQueryStudio 1.0.0 并上报 desired-state，`
        + `payload 会带上每个字段的 javaType 与 @Field 注解值。`);
    }

    if (rows.length === 0) {
      emit('ok', 'OK', `未发现 date 兼容风险（基于 ${Object.values(storedForms)
        .reduce((a, b) => a + b, 0)} 条样本）。`, '');
    }
    out.push(...rows);
  }

  /* w26：mapping 不可判时 per-index 单条汇总（替代旧的逐字段刷屏 —— 80 字段索引
 曾因此挂 80 条同文案 info,把真差异淹没）。field 留空与 assessFieldNameMismatch
 的 per-index 结论口径一致。只在本函数确有产出面（fields 非空）时挂,空索引不挂。 */
  if (!mappingParsed && (fields ?? []).length > 0) {
    out.push({
      field: '', storedForms: {}, javaType: null, esType: null, hasExplicitFormat: false,
      level: 'info', code: 'MAPPING_UNPARSED_UNKNOWN',
      reason: `mappingJson 未能解析，依赖 mapping 的判定（无 format 的秒值、dynamic mapping）本次**测不出** —— `
        + `这是「我们不知道」，不是「已确认没问题」：修好 mappingJson 后需要重新评估。`,
      fix: `检查该索引的 mappingJson 是否为合法 JSON 且含对象型 properties。`
        + `client 模式下它无人校验（IndexConfigValidator 只在 console 模式装配），坏 JSON 不会报错。`,
    });
  }

  /* 稳定排序：field 升序，同字段内按严重度降序。可 diff、可回归比对。
 Array.prototype.sort 在 ES2019+ 保证稳定，故同级内保留规则的既定优先级顺序
 —— 规则是按 1..9 的顺序 emit 的，这正是修订四要钉住的那个次序。 */
  return out.sort((a, b) =>
    a.field < b.field ? -1 : a.field > b.field ? 1 : LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

/* ══════════════════════════════════════════════════════════════════════════
 信号⑤：实体与 mapping 字段名对不齐
 ══════════════════════════════════════════════════════════════════════════ */

/**
 * 判据是「mapping 的 properties 里**没有** `name` 这个键」，**不是**「name 与 declaredName 不一致」。
 *
 * 的病理：`@Field("updateTime")` 而 mapping 写的是 `update_time`，
 * 问题在于**那条 mapping 从未生效**，跟驼峰/下划线像不像毫无关系。
 * 「名字不一致」只是这个 bug 最常见的**外观**，不是它的**定义** ——
 * 拿外观当判据会漏掉「name 与 declaredName 一致、但 mapping 里压根没这个键」的情形。
 * `declaredName` 只进文案，不参与判定。
 *
 * <b>本函数解析 mappingJson 是正当的</b>，与 assessDateRisks 的禁令不冲突：
 * 它要回答的是「mapping 里有没有这个键」，需要看见**孤儿键**（mapping 有、实体没有），
 * 那不是逐字段事实，后端补一个逐字段 flag 补不出来。
 *
 * <b>但把关必须落在 mappingParsed 这个值上，而不是「解析出来的键集非空」</b>：
 * 后者会在「mapping 合法但 properties 为空」时误判 —— 那种情况下每个字段都**确实**
 * 走 dynamic mapping，该报；而 mappingJson 坏掉时一个都不该报。
 * 两种情形在「键集为空」上同形，只有 mappingParsed 分得开。
 *
 * 若不把关，一次解析失败会被渲染成「你所有字段的 mapping 都没生效」——
 * 一个**响亮而全错**的结论，比不报警糟得多。
 */
export function assessFieldNameMismatch(input: {
  mappingJson: string | null;
  /** 的 payload row 级判别位。**判据落在这个值上**，不落在解析结果是否为空上。 */
  mappingParsed: boolean;
  fields: Array<{ name: string; declaredName: string }>;
}): Array<{ code: string; level: RiskLevel; field: string; reason: string; fix: string }> {
  const out: Array<{ code: string; level: RiskLevel; field: string; reason: string; fix: string }> = [];

  if (!input.mappingParsed) {
    /* 「业务方没写 @Mapping」是**正常路径**，不是异常（后端 EntityFieldScanner.mappingParsed
 的 javadoc 明写这一点）。此时根本没有 mapping 可比，静默返回空是正确的 ——
 若也发「测不出」，每个未声明 mapping 的索引都会挂一条噪音，
 而噪音会让真正的那条坏 JSON 提示被淹没。
 两者靠 mappingJson 是否为 null 分辨，与后端 row 级的判别口径一致。 */
    if (input.mappingJson == null) return out;

    /* 到这里 = mappingJson 有内容但没解析成功（坏 JSON / 无 properties / properties 非对象）。
 发一条「测不出」，而不是 N 条「你所有字段的 mapping 都没生效」。
 field 留空表示这是 per-index 结论而非某个字段的结论。 */
    out.push({
      code: 'MAPPING_UNPARSED_UNKNOWN', level: 'info', field: '',
      reason: `mappingJson 未能解析，**测不出**实体字段名与 mapping 键是否对得齐 —— `
        + `本次跳过字段名一致性检查。这是「我们不知道」的状态，缺少判定所需的输入；`
        + `修好 mappingJson 后需要重新评估。`,
      fix: `检查该索引的 mappingJson 是否为合法 JSON 且含对象型 properties。`
        + `client 模式下它无人校验（IndexConfigValidator 只在 console 模式装配），坏 JSON 不会报错。`,
    });
    return out;
  }

  /* mappingParsed 为 true 时 properties 必然解析得出；这里的 null 分支在契约上不可达，
 兜底成空集而非提前返回 —— 提前返回会让「后端说解析成功、前端却解析失败」这种
 不一致状态静默变成「零风险」，那正是本函数要防的那类假绿。 */
  const keys = parseMappingKeys(input.mappingJson) ?? new Set<string>();

  for (const f of input.fields ?? []) {
    if (keys.has(f.name)) continue;
    const declaredNote = f.declaredName === f.name ? ''
      : `（Java 字段名 ${f.declaredName}）`;
    out.push({
      code: 'FIELD_NAME_MISMATCH', level: 'warning', field: f.name,
      reason: `实体以 "${f.name}" 写入${declaredNote}，而 mapping 的 properties 里没有这个键 —— `
        + `该字段实际走 dynamic mapping，mapping 里那条同类定义**从未生效**。`
        + `迁移后若目标集群 dynamic 策略不同，类型可能漂移。`,
      fix: `两个方向选一：① 改实体 @Field 名对齐 mapping 里已有的键；`
        + `② 改 mapping 键名对齐实体的 "${f.name}"。`
        + `注意 mapping 改键名需要重建索引，而改实体注解会改变新数据的写入字段名 —— `
        + `存量数据仍在旧键下，两者都需要 reindex 才能真正统一。`,
    });
  }
  return out.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
}

/** mapping 的 properties 键集；解析不出（非法 JSON / 无 properties / properties 非对象）返回 null。 */
function parseMappingKeys(mappingJson: string | null): Set<string> | null {
  if (!mappingJson || !mappingJson.trim()) return null;
  try {
    const root = JSON.parse(mappingJson);
    const props = root?.properties;
    if (!props || typeof props !== 'object' || Array.isArray(props)) return null;
    return new Set(Object.keys(props));
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 合并展示（ / 移交一）
 ══════════════════════════════════════════════════════════════════════════ */

/** 界面消费的统一行形状。两个判定函数的产出在这几个键上同构，故可合并渲染。 */
export interface RiskRow {
  code: string;
  level: RiskLevel;
  field: string;
  reason: string;
  fix: string;
}

/**
 * 合并 {@link assessDateRisks} 与 {@link assessFieldNameMismatch} 的产出。
 *
 * <b>移交一：两个函数都必须调</b>。`FIELD_NAME_MISMATCH` **只由** `assessFieldNameMismatch`
 * 产出（ 已把它从 `assessDateRisks` 的优先级序列里移除，否则同一 code 出两条）。
 * 只调 `assessDateRisks` 会让该 code **整类**不出现在界面上 —— 而它对应的是 的
 * **原始案例**（`@Field("updateTime")` 而 mapping 写 `update_time`，那条 mapping 从未生效），
 * 整个 调查就是从这个案例开始的。
 *
 * <h3>★ 排序口径（移交二要求写明）★</h3>
 *
 * **`level` 升序（error → warning → info → ok），同级内 `field` 升序，同字段内 `code` 升序。**
 *
 * 与 `assessDateRisks` 内部的口径（field 优先、级别其次）**不同**：那里是「同一字段的诸条聚在一起」，
 * 这里是「最严重的先看见」—— 合并后跨字段同屏，读者要的是先看到 error。
 *
 * ⚠ 因此 ** 那条按 `LEVEL_RANK` 的看守不覆盖本函数**，本函数自带看守。
 * 且看守必须挑「本排序口径分辨不出」的两个对象来构造 —— 用同 level 同 field 的两条，
 * 否则钉住的是排序键而不是「两类 code 都在」这个目标性质。
 *
 * `code` 作为最后一级排序键是为了**确定性**：没有它，同 level 同 field 的两条顺序
 * 取决于两个数组的拼接次序，是个不稳定的实现细节。
 */
export function mergeRiskRows(dateRisks: RiskRow[], nameMismatches: RiskRow[]): RiskRow[] {
  return [...(dateRisks ?? []), ...(nameMismatches ?? [])].sort((a, b) =>
    LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    || (a.field < b.field ? -1 : a.field > b.field ? 1 : 0)
    || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
