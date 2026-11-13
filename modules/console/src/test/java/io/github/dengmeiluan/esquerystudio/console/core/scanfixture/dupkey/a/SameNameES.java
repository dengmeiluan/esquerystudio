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

package io.github.dengmeiluan.esquerystudio.console.core.scanfixture.dupkey.a;

import org.springframework.data.elasticsearch.annotations.Document;

/**
 * 撞 indexKey 的 fixture（A 包）。与 dupkey.b.SameNameES 同简名，
 * 两者都反推出 indexKey `sameName` —— 这是**自动发现才会出现**的冲突场景：
 * 手写注册时两个类摆在眼前一眼能看见，自动发现之后藏起来了。
 */
@Document(indexName = "dup_a_alias")
public class SameNameES {
}
