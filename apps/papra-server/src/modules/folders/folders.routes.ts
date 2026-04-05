import type { RouteDefinitionContext } from '../app/server.types';
import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization, ensureUserHasOrganizationRole } from '../organizations/organizations.usecases';
import { ORGANIZATION_ROLES } from '../organizations/organizations.constants';
import { validateJsonBody, validateParams } from '../shared/validation/validation';
import { createFolderNotFoundError } from './folders.errors';
import { createFoldersRepository } from './folders.repository';
import { folderColorSchema, folderIdSchema, folderNameSchema } from './folders.schemas';
import { createFolder, deleteFolder, moveFolder, renameFolder, updateFolderColor } from './folders.usecases';

export function registerFoldersRoutes(context: RouteDefinitionContext) {
  setupCreateFolderRoute(context);
  setupGetOrganizationFoldersRoute(context);
  setupGetFolderRoute(context);
  setupRenameFolderRoute(context);
  setupMoveFolderRoute(context);
  setupDeleteFolderRoute(context);
}

function setupCreateFolderRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/folders',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.CREATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateJsonBody(z.object({
      name: folderNameSchema,
      parentFolderId: folderIdSchema.nullable().optional(),
      color: folderColorSchema.nullable().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');
      const { name, parentFolderId, color } = context.req.valid('json');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserHasOrganizationRole({ userId, organizationId, minimumRole: ORGANIZATION_ROLES.ADMIN, organizationsRepository });

      const { folder } = await createFolder({
        name,
        organizationId,
        parentFolderId: parentFolderId ?? null,
        color: color ?? null,
        createdBy: userId,
        foldersRepository,
      });

      return context.json({ folder }, 201);
    },
  );
}

function setupGetOrganizationFoldersRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/folders',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folders } = await foldersRepository.getOrganizationFolders({ organizationId });

      return context.json({ folders });
    },
  );
}

function setupGetFolderRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.READ] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, folderId } = context.req.valid('param');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folder } = await foldersRepository.getFolderById({ folderId, organizationId });

      if (!folder) {
        throw createFolderNotFoundError();
      }

      return context.json({ folder });
    },
  );
}

function setupRenameFolderRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    validateJsonBody(z.object({
      name: folderNameSchema.optional(),
      color: folderColorSchema.nullable().optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, folderId } = context.req.valid('param');
      const { name, color } = context.req.valid('json');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserHasOrganizationRole({ userId, organizationId, minimumRole: ORGANIZATION_ROLES.ADMIN, organizationsRepository });

      let currentFolder: Awaited<ReturnType<typeof renameFolder>>['folder'] | null = null;

      if (name !== undefined) {
        const result = await renameFolder({ folderId, organizationId, name, foldersRepository });
        currentFolder = result.folder;
      }

      if (color !== undefined) {
        const result = await updateFolderColor({ folderId, organizationId, color, foldersRepository });
        currentFolder = result.folder;
      }

      if (!currentFolder) {
        throw new Error('At least one field to update must be provided');
      }

      return context.json({ folder: currentFolder });
    },
  );
}

function setupMoveFolderRoute({ app, db }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/folders/:folderId/move',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    validateJsonBody(z.object({
      // null = move to root; omitting keeps current parent (not allowed — must be explicit)
      parentFolderId: folderIdSchema.nullable(),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, folderId } = context.req.valid('param');
      const { parentFolderId } = context.req.valid('json');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { folder } = await moveFolder({ folderId, organizationId, parentFolderId, foldersRepository });

      return context.json({ folder });
    },
  );
}

function setupDeleteFolderRoute({ app, db }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/folders/:folderId',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.FOLDERS.DELETE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      folderId: folderIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, folderId } = context.req.valid('param');

      const foldersRepository = createFoldersRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserHasOrganizationRole({ userId, organizationId, minimumRole: ORGANIZATION_ROLES.ADMIN, organizationsRepository });

      await deleteFolder({ folderId, organizationId, userId, foldersRepository });

      return context.body(null, 204);
    },
  );
}
