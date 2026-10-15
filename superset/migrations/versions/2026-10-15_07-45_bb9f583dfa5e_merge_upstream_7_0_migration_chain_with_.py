# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""merge upstream 7.0 migration chain with custom channel migrations

Revision ID: bb9f583dfa5e
Revises: ('add_channel_region_key', 'c179af013f48')
Create Date: 2026-10-15 07:45:41.656690

"""

# revision identifiers, used by Alembic.
revision = "bb9f583dfa5e"
down_revision = ("add_channel_region_key", "c179af013f48")


def upgrade():
    pass


def downgrade():
    pass
