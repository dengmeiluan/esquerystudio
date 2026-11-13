/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.platform.branding;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * 平台层配置（前缀 {@code esquerystudio.console}）：品牌与功能包选择。
 *
 * <p>与引擎层 {@code esquerystudio.elasticsearch.*} 分离：这里只描述「产品长什么样、暴露哪些模块」，
 * 不影响重建/迁移/存储等运行参数。宿主可以用 {@link ConsoleHostIntegration} Bean
 * 提供默认值，再用本配置覆盖。</p>
 *
 * @author aicoding
 */
@ConfigurationProperties(prefix = "esquerystudio.console")
public class PlatformUiProperties {

    private Features features = new Features();
    private Branding branding = new Branding();

    public Features getFeatures() {
        if (features == null) features = new Features();
        return features;
    }
    public void setFeatures(Features features) { this.features = features; }
    public Branding getBranding() {
        if (branding == null) branding = new Branding();
        return branding;
    }
    public void setBranding(Branding branding) { this.branding = branding; }

    /** 功能包选择：空 packs = 全部启用；exclude-pages 在包之上再隐藏单页。 */
    public static class Features {
        private List<String> packs = new ArrayList<>();
        private List<String> excludePages = new ArrayList<>();

        public List<String> getPacks() { return packs; }
        public void setPacks(List<String> packs) { this.packs = packs; }
        public List<String> getExcludePages() { return excludePages; }
        public void setExcludePages(List<String> excludePages) { this.excludePages = excludePages; }
    }

    /** 品牌：默认即开源产品身份；宿主集成名作为副标题。 */
    public static class Branding {
        private String productName = "ESQueryStudio";
        private String tagline = "为 Spring Boot 而生的 Elasticsearch 查询工作台";
        private String integrationId = "generic";
        private String integrationName = "";
        private String docsUrl = "";

        public String getProductName() { return productName; }
        public void setProductName(String productName) { this.productName = productName; }
        public String getTagline() { return tagline; }
        public void setTagline(String tagline) { this.tagline = tagline; }
        public String getIntegrationId() { return integrationId; }
        public void setIntegrationId(String integrationId) { this.integrationId = integrationId; }
        public String getIntegrationName() { return integrationName; }
        public void setIntegrationName(String integrationName) { this.integrationName = integrationName; }
        public String getDocsUrl() { return docsUrl; }
        public void setDocsUrl(String docsUrl) { this.docsUrl = docsUrl; }
    }
}
