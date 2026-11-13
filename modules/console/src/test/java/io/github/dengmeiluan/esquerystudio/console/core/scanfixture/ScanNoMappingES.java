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

package io.github.dengmeiluan.esquerystudio.console.core.scanfixture;

import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Setting;

/**
 * 扫描器 fixture：有 @Setting 但**没有 @Mapping**。
 *
 * <p>对齐生产里的真实形态 BondRepurchaseBasicInfoES（有 settingPath、无 mappingPath）。
 * 用来钉住「@Mapping 可选，无它照样登记成功」。</p>
 */
@Document(indexName = "scan_nomapping_alias")
@Setting(settingPath = "scanfixture/scan_setting.json")
public class ScanNoMappingES {
}
