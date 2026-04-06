import { createErrorFactory } from '../shared/errors/errors';

export const FOLDER_NOT_FOUND_ERROR_CODE = 'folder.not_found' as const;
export const createFolderNotFoundError = createErrorFactory({
  message: 'Folder not found.',
  code: FOLDER_NOT_FOUND_ERROR_CODE,
  statusCode: 404,
});

export const FOLDER_CIRCULAR_NESTING_ERROR_CODE = 'folder.circular_nesting' as const;
export const createFolderCircularNestingError = createErrorFactory({
  message: 'Moving this folder would create a circular nesting.',
  code: FOLDER_CIRCULAR_NESTING_ERROR_CODE,
  statusCode: 409,
});

export const FOLDER_PARENT_NOT_IN_ORGANIZATION_ERROR_CODE = 'folder.parent_not_in_organization' as const;
export const createFolderParentNotInOrganizationError = createErrorFactory({
  message: 'Parent folder does not belong to this organization.',
  code: FOLDER_PARENT_NOT_IN_ORGANIZATION_ERROR_CODE,
  statusCode: 400,
});
