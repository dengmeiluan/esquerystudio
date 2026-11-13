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

package io.github.dengmeiluan.esquerystudio.console.mapping;

public final class MappingConflict {

    private final String path;
    private final String actualSummary;
    private final String desiredSummary;
    private final String code;

    public MappingConflict(String path, String actualSummary, String desiredSummary, String code) {
        this.path = path;
        this.actualSummary = actualSummary;
        this.desiredSummary = desiredSummary;
        this.code = code;
    }

    public String getPath() {
        return path;
    }

    public String getActualSummary() {
        return actualSummary;
    }

    public String getDesiredSummary() {
        return desiredSummary;
    }

    public String getCode() {
        return code;
    }
}
