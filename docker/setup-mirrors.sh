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
# Point every package manager in an image at the Aliyun mirrors and make the
# transfers resilient: builds sit behind an international link, where the
# default Debian and PyPI endpoints stall on large downloads while answering
# small requests instantly.
#
# Override the endpoints per build with APT_MIRROR / PIP_MIRROR when a
# different mirror is faster for the network in use.
#
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "This script must be run as root" >&2
  exit 1
fi

APT_MIRROR="${APT_MIRROR:-mirrors.aliyun.com}"
PIP_MIRROR="${PIP_MIRROR:-https://mirrors.aliyun.com/pypi/simple/}"
NET_TIMEOUT="${NET_TIMEOUT:-30}"
NET_RETRIES="${NET_RETRIES:-5}"

echo "Pointing apt at http://${APT_MIRROR} ..."
# Debian ships two source formats depending on the release: the one-line
# sources.list (bookworm and older) and the deb822 debian.sources (trixie and
# newer).  Rewrite whichever is present so the setup survives a base image bump.
for sources in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do
  if [[ -f "${sources}" ]]; then
    sed -i "s|deb\.debian\.org|${APT_MIRROR}|g; s|security\.debian\.org|${APT_MIRROR}|g" "${sources}"
  fi
done

# Small requests to the mirror answer instantly while bulk transfers stall, so
# cap every acquire and retry instead of hanging a build step indefinitely.
cat >/etc/apt/apt.conf.d/99-mirror-tuning <<EOF
Acquire::ForceIPv4 "true";
Acquire::http::Timeout "${NET_TIMEOUT}";
Acquire::https::Timeout "${NET_TIMEOUT}";
Acquire::ftp::Timeout "${NET_TIMEOUT}";
Acquire::Retries "${NET_RETRIES}";
EOF

echo "Pointing pip and uv at ${PIP_MIRROR} ..."
cat >/etc/pip.conf <<EOF
[global]
index-url = ${PIP_MIRROR}
timeout = ${NET_TIMEOUT}
retries = ${NET_RETRIES}
EOF

# uv reads UV_INDEX_URL on older releases and UV_DEFAULT_INDEX on newer ones,
# and it enforces its own timeout, so set all three.
if [[ -f /etc/environment ]]; then
  {
    echo "PIP_INDEX_URL=${PIP_MIRROR}"
    echo "UV_INDEX_URL=${PIP_MIRROR}"
    echo "UV_DEFAULT_INDEX=${PIP_MIRROR}"
  } >>/etc/environment
fi

echo "Mirror setup complete."
