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
from typing import Any

from flask import g
from flask_appbuilder.security.sqla.models import Role
from flask_babel import lazy_gettext as _
from sqlalchemy import and_, or_
from sqlalchemy.orm.query import Query

from superset import db, is_feature_enabled, security_manager
from superset.connectors.sqla.models import SqlaTable
from superset.models.core import Database
from superset.models.dashboard import Dashboard, is_uuid
from superset.models.embedded_dashboard import EmbeddedDashboard
from superset.models.slice import Slice
from superset.security.guest_token import GuestTokenResourceType, GuestUser
from superset.subjects.filters import (
    EditableFilter,
)
from superset.subjects.models import dashboard_editors
from superset.tags.filters import BaseTagIdFilter, BaseTagNameFilter
from superset.utils.core import get_user_id
from superset.utils.filters import (
    get_dataset_access_filters,
    guest_embedded_dashboard_filter,
)
from superset.views.base import BaseFilter
from superset.views.base_api import BaseFavoriteFilter
from superset.views.filters import BaseDeletedRecencyFilter, BaseDeletedStateFilter


class DashboardTitleOrSlugFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    name = _("Title or Slug")
    arg_name = "title_or_slug"

    def apply(self, query: Query, value: Any) -> Query:
        if not value:
            return query
        ilike_value = f"%{value}%"
        return query.filter(
            or_(
                Dashboard.dashboard_title.ilike(ilike_value),
                Dashboard.slug.ilike(ilike_value),
            )
        )


class DashboardCreatedByMeFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    name = _("Created by me")
    arg_name = "dashboard_created_by_me"

    def apply(self, query: Query, value: Any) -> Query:
        return query.filter(
            or_(
                Dashboard.created_by_fk  # pylint: disable=comparison-with-callable
                == get_user_id(),
                Dashboard.changed_by_fk  # pylint: disable=comparison-with-callable
                == get_user_id(),
            )
        )


class DashboardFavoriteFilter(  # pylint: disable=too-few-public-methods
    BaseFavoriteFilter
):
    """
    Custom filter for the GET list that filters all dashboards that a user has favored
    """

    arg_name = "dashboard_is_favorite"
    class_name = "Dashboard"
    model = Dashboard


class DashboardTagNameFilter(BaseTagNameFilter):  # pylint: disable=too-few-public-methods
    """
    Custom filter for the GET list that filters all dashboards associated with
    a certain tag (by its name).
    """

    arg_name = "dashboard_tags"
    class_name = "Dashboard"
    model = Dashboard


class DashboardTagIdFilter(BaseTagIdFilter):  # pylint: disable=too-few-public-methods
    """
    Custom filter for the GET list that filters all dashboards associated with
    a certain tag (by its ID).
    """

    arg_name = "dashboard_tag_id"
    class_name = "Dashboard"
    model = Dashboard


class DashboardAccessFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    """
    List dashboards with the following criteria:
        1. Those which the user owns
        2. Those which have been published (if they have access to at least one slice)
        3. Those that they have access to via a role (if `DASHBOARD_RBAC` is enabled)

    If the user is an admin then show all dashboards.
    This means they do not get curation but can still sort by "published"
    if they wish to see those dashboards which are published first.
    """

    def apply(self, query: Query, value: Any) -> Query:
        # Guests are scoped to their token's dashboards only, never widened by
        # the role paths below (mirrors ChartFilter).
        if (guest_condition := guest_embedded_dashboard_filter()) is not None:
            return query.filter(guest_condition)

        if security_manager.is_admin():
            return query

        owner_ids_query = (
            db.session.query(Dashboard.id)
            .join(Dashboard.owners)
            .filter(security_manager.user_model.id == get_user_id())
        )

        # Users with access to all datasources can view any published dashboard,
        # regardless of slice/datasource mappings.
        if security_manager.can_access_all_datasources():
            return query.filter(
                or_(
                    Dashboard.id.in_(owner_ids_query),
                    Dashboard.published.is_(True),
                )
            )

        is_rbac_disabled_filter = []
        dashboard_has_roles = Dashboard.roles.any()
        if is_feature_enabled("DASHBOARD_RBAC"):
            is_rbac_disabled_filter.append(~dashboard_has_roles)

        datasource_perm_query = (
            db.session.query(Dashboard.id)
            .join(Dashboard.slices, isouter=True)
            .join(SqlaTable, Slice.datasource_id == SqlaTable.id)
            .join(Database, SqlaTable.database_id == Database.id)
            .filter(
                and_(
                    Dashboard.published.is_(True),
                    *is_rbac_disabled_filter,
                    get_dataset_access_filters(
                        Slice,
                        security_manager.can_access_all_datasources(),
                    ),
                )
            )
        )

        feature_flagged_filters = []
        if is_feature_enabled("DASHBOARD_RBAC"):
            roles_based_query = (
                db.session.query(Dashboard.id)
                .join(Dashboard.roles)
                .filter(
                    and_(
                        Dashboard.published.is_(True),
                        dashboard_has_roles,
                        Role.id.in_([x.id for x in security_manager.get_user_roles()]),
                    ),
                )
            )

            feature_flagged_filters.append(Dashboard.id.in_(roles_based_query))

        if is_feature_enabled("EMBEDDED_SUPERSET") and security_manager.is_guest_user(
            g.user
        ):
            guest_user: GuestUser = g.user
            embedded_dashboard_ids = [
                r["id"]
                for r in guest_user.resources
                if r["type"] == GuestTokenResourceType.DASHBOARD.value
            ]

            # TODO (embedded): only use uuid filter once uuids are rolled out
            condition = (
                Dashboard.embedded.any(
                    EmbeddedDashboard.uuid.in_(embedded_dashboard_ids)
                )
                if any(is_uuid(id_) for id_ in embedded_dashboard_ids)
                else Dashboard.id.in_(embedded_dashboard_ids)
            )

            feature_flagged_filters.append(condition)

        query = query.filter(
            or_(
                Dashboard.id.in_(owner_ids_query),
                Dashboard.id.in_(datasource_perm_query),
                *feature_flagged_filters,
            )
        )

        return query


class DashboardEditableFilter(EditableFilter):  # pylint: disable=too-few-public-methods
    """Filter for dashboards the user can edit."""

    model = Dashboard
    editors_table = dashboard_editors
    editors_fk_column = "dashboard_id"


class DashboardCertifiedFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    """
    Custom filter for the GET list that filters all certified dashboards
    """

    name = _("Is certified")
    arg_name = "dashboard_is_certified"

    def apply(self, query: Query, value: Any) -> Query:
        if value is True:
            return query.filter(
                and_(
                    Dashboard.certified_by.isnot(None),
                    Dashboard.certified_by != "",
                )
            )
        if value is False:
            return query.filter(
                or_(
                    Dashboard.certified_by.is_(None),
                    Dashboard.certified_by == "",
                )
            )
        return query


class DashboardHasCreatedByFilter(BaseFilter):  # pylint: disable=too-few-public-methods
    """
    Custom filter for the GET list that filters all dashboards created by user
    """

    name = _("Has created by")
    arg_name = "dashboard_has_created_by"

    def apply(self, query: Query, value: Any) -> Query:
        if value is True:
            return query.filter(and_(Dashboard.created_by_fk.isnot(None)))
        if value is False:
            return query.filter(and_(Dashboard.created_by_fk.is_(None)))
        return query


class DashboardDeletedRecencyFilter(  # pylint: disable=too-few-public-methods
    BaseDeletedRecencyFilter
):
    """Archive time-range preset: rows archived within the last N days."""

    arg_name = "dashboard_deleted_recency"


class DashboardDeletedStateFilter(  # pylint: disable=too-few-public-methods
    BaseDeletedStateFilter
):
    """Rison filter for the GET list that exposes soft-deleted dashboards.

    Soft-deleted rows are scoped to the **restore audience** (editors or
    admins) by ``BaseDeletedStateFilter._scope_to_restore_audience`` — the
    cross-entity contract lives on the base, so this class is a pure
    declaration. Live rows keep their normal ``DashboardAccessFilter``
    visibility.
    """

    arg_name = "dashboard_deleted_state"
    model = Dashboard
