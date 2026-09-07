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
import { findPermission } from 'src/utils/findPermission';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';

// Distinct from the Files page permission, so report access can be granted
// without handing out the whole file storage.
export const STORAGE_REPORTS_VIEW = 'StorageReports';

type UserWithRoles = Pick<UserWithPermissionsAndRoles, 'roles'>;

export const canView = (user?: UserWithRoles): boolean =>
  findPermission('can_view', STORAGE_REPORTS_VIEW, user?.roles);

export const canEdit = (user?: UserWithRoles): boolean =>
  findPermission('can_edit', STORAGE_REPORTS_VIEW, user?.roles);

export const canDelete = (user?: UserWithRoles): boolean =>
  findPermission('can_delete', STORAGE_REPORTS_VIEW, user?.roles);
