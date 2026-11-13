# 实体 Mapping 写法

以下示例使用本仓父 BOM 的 Spring Data Elasticsearch `4.0.9.RELEASE` API，可以直接编译。显式注解业务语义，不要让动态 mapping 替你做不可逆的决定。

## 常用字段

```java
package com.example.order;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.DateFormat;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

@Document(indexName = "trade_order")
public class TradeOrderES {
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String orderNo;

    @Field(type = FieldType.Keyword, normalizer = "lowercase", ignoreAbove = 256)
    private String counterpartyCode;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String description;

    @Field(type = FieldType.Date, format = DateFormat.date_optional_time)
    private LocalDateTime tradeTime;

    @Field(type = FieldType.Nested)
    private List<TradeLeg> legs;
}
```

```java
package com.example.order;

import java.math.BigDecimal;

import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

public class TradeLeg {
    @Field(type = FieldType.Keyword)
    private String bondCode;

    @Field(type = FieldType.Double)
    private BigDecimal amount;
}
```

`List<Pojo>` 只表达 Java 集合，不能自动表达 ES nested 查询语义。Spring Data Elasticsearch 4.0.9 的 `MappingBuilder` 会省略普通、未注解的 `List<Pojo>`，starter 的注解推导不会推导出 `object`。但是后续业务文档写入时，Elasticsearch dynamic mapping 可能根据实际 JSON 把它创建成 `object`。需要 nested 时必须提前写 `@Field(type = FieldType.Nested)`；一旦实际索引已动态形成 object，后续 object -> nested 不能原地修改，必须重建。

同理，没有 `@Mapping` 或 `@Field` 时，starter 不从 `String` 推断 `keyword`，也不猜全文检索 analyzer、大小写 normalizer、日期 format 或任何业务语义。无法推导出有效 properties 时会记录 `NO_MAPPING_SOURCE` 并跳过。

## 外部 mapping 文件优先

复杂 mapping 可放在 classpath，并通过 `@Mapping.mappingPath` 声明：

```java
package com.example.order;

import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Mapping;

@Document(indexName = "trade_order")
@Mapping(mappingPath = "mappings/trade-order.json")
public class TradeOrderFromFileES {
}
```

只要 `@Mapping.mappingPath` 能读取到内容，该 JSON 原文就优先于字段注解推导。它不是与 `@Field` 的合并层；修改文件后应以期望配置页展示的 mapping 为准。JSON 中引用的 analyzer 或 normalizer 还必须在目标索引 settings 中存在，否则 宿主应用 校验或 ES 写入会拒绝。
