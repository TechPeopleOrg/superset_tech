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
import { render, screen } from 'spec/helpers/testing-library';
import { UserWithPermissionsAndRoles } from 'src/types/bootstrapTypes';
import { canUpload, canDelete } from './permissions';
import FileUploader from './index';

const roleWith = (
  perms: string[],
): Pick<UserWithPermissionsAndRoles, 'roles'> => ({
  roles: { Custom: perms.map(p => [p, 'FileUploader']) },
});

test('canUpload true only with upload permission', () => {
  expect(canUpload(roleWith(['upload']))).toBe(true);
  expect(canUpload(roleWith(['view']))).toBe(false);
});

test('canDelete reflects delete permission', () => {
  expect(canDelete(roleWith(['delete']))).toBe(true);
  expect(canDelete(roleWith(['view']))).toBe(false);
});

test('renders the page title', () => {
  render(<FileUploader />, { useRedux: true });
  expect(screen.getByText('Files')).toBeInTheDocument();
});

test('hides the upload button when user lacks upload permission', () => {
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['view']) },
  });
  expect(screen.queryByTestId('upload-btn')).not.toBeInTheDocument();
});

test('shows the upload button when user has upload permission', () => {
  render(<FileUploader />, {
    useRedux: true,
    initialState: { user: roleWith(['upload']) },
  });
  expect(screen.getByTestId('upload-btn')).toBeInTheDocument();
});
