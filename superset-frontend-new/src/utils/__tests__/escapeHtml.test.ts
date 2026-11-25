/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { expect, test } from "vitest";
import { escapeHtml } from "@/utils/escapeHtml";

test("escapes HTML metacharacters without double-escaping ampersands", () => {
  expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  expect(escapeHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
});

test("renders untrusted markup as text instead of creating elements", () => {
  const input = `<img src=x onerror="alert('xss')"><script>alert(1)</script>&`;
  const template = document.createElement("template");
  template.innerHTML = escapeHtml(input);

  expect(template.content.querySelector("img, script")).toBeNull();
  expect(template.content.textContent).toBe(input);
});

test("keeps trusted marker HTML separate from escaped untrusted text", () => {
  const marker = '<span style="background:#20a7c9"></span>';
  const input = `<img src=x onerror="alert(1)">`;
  const template = document.createElement("template");
  template.innerHTML = `${marker}${escapeHtml(input)}`;

  expect(template.content.querySelector("span")).not.toBeNull();
  expect(template.content.querySelector("img")).toBeNull();
  expect(template.content.textContent).toBe(input);
});

test("stringifies values and treats nullish values as empty text", () => {
  expect(escapeHtml(0)).toBe("0");
  expect(escapeHtml(false)).toBe("false");
  expect(escapeHtml(null)).toBe("");
  expect(escapeHtml(undefined)).toBe("");
});
