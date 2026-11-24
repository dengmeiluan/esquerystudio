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

package io.github.dengmeiluan.esquerystudio.console.boot.auth;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/** Host-authenticated identity for the unified console. */
public final class ConsolePrincipal {

    private final String username;
    private final String displayName;
    private final String role;
    private final Set<String> grantedPages;

    public ConsolePrincipal(String username, String displayName, String role, Set<String> grantedPages) {
        this.username = username;
        this.displayName = displayName;
        this.role = role;
        this.grantedPages = grantedPages == null ? null
                : Collections.unmodifiableSet(new LinkedHashSet<>(grantedPages));
    }

    public String username() {
        return username;
    }

    public String displayName() {
        return displayName;
    }

    public String role() {
        return role;
    }

    /** Null means "no page-level restriction"; empty means "no pages". */
    public Set<String> grantedPages() {
        return grantedPages;
    }
}
