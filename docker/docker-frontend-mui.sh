#!/usr/bin/env bash
#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
set -e

echo "Starting Superset MUI frontend (Vite dev server)"

cd /app/superset-frontend-new

echo "Checking MUI frontend dependencies"
# npm ci (not npm install): it never rewrites package-lock.json, so the
# bind-mounted working tree stays clean. `npm install` here used to prune
# peer-only @esbuild/* platform entries from the lock, which then broke
# `npm ci` in the Docker build stages.
#
# node_modules lives on the bind-mounted host directory, so re-running `npm ci`
# on every start would delete and re-download ~700MB of packages. Skip it while
# the installed tree still matches package-lock.json: the stamp is written into
# node_modules (git-ignored) and is invalidated whenever the lock changes.
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
STAMP="node_modules/.ci-stamp"
if [ ! -d node_modules ] || [ ! -f "${STAMP}" ] || \
   [ "$(cat "${STAMP}" 2>/dev/null)" != "${LOCK_HASH}" ]; then
  npm ci
  echo "${LOCK_HASH}" > "${STAMP}"
else
  echo "node_modules already matches package-lock.json; skipping npm ci"
fi

# The Pi agent service runs as its own compose service (`pi-agent`); the
# Vite dev server proxies /agent/ws to it via PI_AGENT_WS_TARGET.

echo "Start Vite dev server"
npm run dev-server
