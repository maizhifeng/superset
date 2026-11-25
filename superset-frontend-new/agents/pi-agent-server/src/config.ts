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

export interface AppConfig {
  wsPort: number;
  llmModel: string;
  llmBaseUrl: string;
  llmMaxTokens: number;
  reasoningLevel: string;
  flaskInternalUrl: string;
  datasetId: number;
}

export function loadConfig(): AppConfig {
  return {
    wsPort: parseInt(process.env.WS_PORT || "3001", 10),
    llmModel: process.env.LLM_MODEL || "gemma-4-e2b-it",
    llmBaseUrl:
      process.env.LLM_BASE_URL || "http://host.docker.internal:1234/v1",
    llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS || "8192", 10),
    reasoningLevel: process.env.AGENT_REASONING_LEVEL || "low",
    flaskInternalUrl:
      process.env.FLASK_INTERNAL_URL || "http://superset-light:8088",
    datasetId: parseInt(process.env.SUPERSET_DATASET_ID || "26", 10),
  };
}
