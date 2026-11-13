package io.github.dengmeiluan.example.demo;

import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

/**
 * 演示实体：声明即托管——starter 的 mapping 自动注册会在启动时把这里的
 * @Field 定义与线上 mapping 对账（新增字段自动补齐，冲突转 Adhoc 重建建议）。
 */
@Document(indexName = "demo-article", createIndex = false)
public class Article {

    @Id
    private String id;

    /** keyword 精确过滤示例字段。 */
    @Field(type = FieldType.Keyword)
    private String author;

    /** text 全文检索示例字段。 */
    @Field(type = FieldType.Text)
    private String title;

    /** 期望后续「加字段不停机」时，在这里加一个 @Field 再重启即可体会 desired-state 流程。 */
    @Field(type = FieldType.Integer)
    private Integer readingCount;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public Integer getReadingCount() { return readingCount; }
    public void setReadingCount(Integer readingCount) { this.readingCount = readingCount; }
}
