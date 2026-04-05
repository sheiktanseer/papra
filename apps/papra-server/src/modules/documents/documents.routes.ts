import type { RouteDefinitionContext } from '../app/server.types';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../api-keys/api-keys.constants';
import { requireAuthentication } from '../app/auth/auth.middleware';
import { getUser } from '../app/auth/auth.models';
import { createCustomPropertiesRepository } from '../custom-properties/custom-properties.repository';
import { organizationIdSchema } from '../organizations/organization.schemas';
import { createOrganizationsRepository } from '../organizations/organizations.repository';
import { ensureUserIsInOrganization } from '../organizations/organizations.usecases';
import { createPlansRepository } from '../plans/plans.repository';
import { getOrganizationPlan } from '../plans/plans.usecases';
import { getFileStreamFromMultipartForm } from '../shared/streams/file-upload';
import { validateJsonBody, validateParams, validateQuery } from '../shared/validation/validation';
import { createUsersRepository } from '../users/users.repository';
import { createSubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import { createTagsRepository } from '../tags/tags.repository';
import { searchOrganizationDocuments } from './document-search/document-search.usecase';
import { createForbiddenError } from '../app/auth/auth.errors';
import { createDocumentIsNotDeletedError, createDocumentNotFoundError } from './documents.errors';
import { formatDocumentForApi, formatDocumentsForApi, isDocumentSizeLimitEnabled } from './documents.models';
import { createDocumentsRepository } from './documents.repository';
import { documentIdSchema } from './documents.schemas';
import { createDocumentCreationUsecase, deleteAllTrashDocuments, deleteTrashDocument, enrichAndFormatDocumentForApi, enrichAndFormatDocumentsForApi, ensureDocumentExists, getDocumentOrThrow, restoreDocument, trashDocument, updateDocument } from './documents.usecases';
import { ORGANIZATION_ROLES } from '../organizations/organizations.constants';
import { ensureUserHasOrganizationRole } from '../organizations/organizations.usecases';
import { folderIdSchema } from '../folders/folders.schemas';
import { createFoldersRepository } from '../folders/folders.repository';
import { getFolderOrThrow } from '../folders/folders.usecases';

export function registerDocumentsRoutes(context: RouteDefinitionContext) {
  setupCreateDocumentRoute(context);
  setupGetDocumentsRoute(context);
  setupRestoreDocumentRoute(context);
  setupGetDeletedDocumentsRoute(context);
  setupGetOrganizationDocumentsStatsRoute(context);
  setupGetDocumentRoute(context);
  setupDeleteTrashDocumentRoute(context);
  setupDeleteAllTrashDocumentsRoute(context);
  setupDeleteDocumentRoute(context);
  setupGetDocumentFileRoute(context);
  setupUpdateDocumentRoute(context);
  setupUpdateDocumentFolderRoute(context);
}

function setupCreateDocumentRoute({ app, ...deps }: RouteDefinitionContext) {
  const { config, db } = deps;

  app.post(
    '/api/organizations/:organizationId/documents',
    requireAuthentication({ apiKeyPermissions: ['documents:create'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(z.object({
      // Optional folder to place the uploaded document in (passed as ?folderId=fld_xxx)
      folderId: folderIdSchema.optional(),
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId } = context.req.valid('param');
      const { folderId } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      // Verify the target folder belongs to this org BEFORE streaming the file
      if (folderId) {
        const foldersRepository = createFoldersRepository({ db });
        await getFolderOrThrow({ folderId, organizationId, foldersRepository });
      }

      // Get organization's plan-specific upload limit
      const plansRepository = createPlansRepository({ config });
      const subscriptionsRepository = createSubscriptionsRepository({ db });

      const { organizationPlan } = await getOrganizationPlan({ organizationId, plansRepository, subscriptionsRepository });
      const { maxFileSize } = organizationPlan.limits;

      const { fileStream, fileName, mimeType } = await getFileStreamFromMultipartForm({
        body: context.req.raw.body,
        headers: context.req.header(),
        maxFileSize: isDocumentSizeLimitEnabled({ maxUploadSize: maxFileSize }) ? maxFileSize : undefined,
      });

      const createDocument = createDocumentCreationUsecase({ ...deps });
      const { document: createdDocument } = await createDocument({ fileStream, fileName, mimeType, userId, organizationId });

      // Assign to folder post-creation (keeps documents.usecases.ts unchanged)
      let document = createdDocument;
      if (folderId) {
        const documentsRepository = createDocumentsRepository({ db });
        const { document: movedDocument } = await documentsRepository.updateDocumentFolder({
          documentId: createdDocument.id,
          organizationId,
          folderId,
        });
        document = movedDocument;
      }

      return context.json({ document: formatDocumentForApi({ document }) });
    },
  );
}


function setupGetDeletedDocumentsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/deleted',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(
      z.object({
        pageIndex: z.coerce.number().min(0).int().optional().default(0),
        pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');
      const { pageIndex, pageSize } = context.req.valid('query');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const [
        { documents },
        { documentsCount },
      ] = await Promise.all([
        documentsRepository.getOrganizationDeletedDocuments({ organizationId, pageIndex, pageSize }),
        documentsRepository.getOrganizationDeletedDocumentsCount({ organizationId }),
      ]);

      return context.json({
        documents: formatDocumentsForApi({ documents }),
        documentsCount,
      });
    },
  );
}

function setupGetDocumentRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });
      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const tagsRepository = createTagsRepository({ db });
      const usersRepository = createUsersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });
      const { enrichedDocument } = await enrichAndFormatDocumentForApi({ document, tagsRepository, customPropertiesRepository, usersRepository });

      return context.json({ document: enrichedDocument });
    },
  );
}

function setupDeleteDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:delete'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });
      const { member } = await organizationsRepository.getOrganizationMemberByUserId({ userId, organizationId });

      const { document } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });

      if (member!.role === ORGANIZATION_ROLES.MEMBER && document.createdBy !== userId) {
        throw createForbiddenError();
      }

      await trashDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
      });

      return context.json({
        success: true,
      });
    },
  );
}

function setupRestoreDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.post(
    '/api/organizations/:organizationId/documents/:documentId/restore',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, organizationId, documentsRepository });

      if (!document.isDeleted) {
        throw createDocumentIsNotDeletedError();
      }

      await restoreDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
      });

      return context.body(null, 204);
    },
  );
}

function setupGetDocumentFileRoute({ app, db, documentsStorageService }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/:documentId/file',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { document } = await getDocumentOrThrow({ documentId, documentsRepository, organizationId });

      const { fileStream } = await documentsStorageService.getFileStream({
        storageKey: document.originalStorageKey,
        fileEncryptionAlgorithm: document.fileEncryptionAlgorithm,
        fileEncryptionKekVersion: document.fileEncryptionKekVersion,
        fileEncryptionKeyWrapped: document.fileEncryptionKeyWrapped,
      });

      return context.body(
        Readable.toWeb(fileStream),
        200,
        {
          // Prevent XSS by serving the file as an octet-stream
          'Content-Type': 'application/octet-stream',
          // Always use attachment for defense in depth - client uses blob API anyway
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
          'Content-Length': String(document.originalSize),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      );
    },
  );
}

function setupGetDocumentsRoute({ app, db, documentSearchServices }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    validateQuery(
      z.object({
        searchQuery: z.string().optional().default(''),
        pageIndex: z.coerce.number().min(0).int().optional().default(0),
        pageSize: z.coerce.number().min(1).max(100).int().optional().default(100),
        // folderId filters to direct children of that folder.
        // Use 'null' (string literal) to explicitly request root-level documents.
        // Omit entirely to return documents across all folders.
        folderId: folderIdSchema.optional(),
        showRootOnly: z.enum(['true', 'false']).optional(),
      }),
    ),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');
      const { searchQuery, pageIndex, pageSize, folderId, showRootOnly } = context.req.valid('query');

      const organizationsRepository = createOrganizationsRepository({ db });
      const customPropertiesRepository = createCustomPropertiesRepository({ db });
      const tagsRepository = createTagsRepository({ db });
      const documentsRepository = createDocumentsRepository({ db });
      const usersRepository = createUsersRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const { documents: searchResults, documentsCount: searchCount } = await searchOrganizationDocuments({
        organizationId,
        searchQuery,
        pageIndex,
        pageSize,
        documentSearchServices,
      });

      let documents = searchResults;
      let documentsCount = searchCount;

      // Apply folder filter on top of FTS results when requested
      if (folderId !== undefined || showRootOnly === 'true') {
        const targetFolderId = showRootOnly === 'true' ? null : (folderId ?? null);
        const searchResultIds = searchResults.map(d => d.id);
        const { documents: folderDocs } = await documentsRepository.getDocumentsByIdsInFolder({
          documentIds: searchResultIds,
          organizationId,
          folderId: targetFolderId,
        });
        documents = folderDocs;
        documentsCount = folderDocs.length;
      }

      const { enrichedDocuments } = await enrichAndFormatDocumentsForApi({ documents, tagsRepository, customPropertiesRepository, usersRepository });

      return context.json({ documents: enrichedDocuments, documentsCount });
    },
  );
}

function setupGetOrganizationDocumentsStatsRoute({ app, db }: RouteDefinitionContext) {
  app.get(
    '/api/organizations/:organizationId/documents/statistics',
    requireAuthentication({ apiKeyPermissions: ['documents:read'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');

      const organizationsRepository = createOrganizationsRepository({ db });
      const documentsRepository = createDocumentsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      const {
        documentsCount,
        documentsSize,
        deletedDocumentsCount,
        deletedDocumentsSize,
        totalDocumentsCount,
        totalDocumentsSize,
      } = await documentsRepository.getOrganizationStats({ organizationId });

      return context.json({
        organizationStats: {
          documentsCount,
          documentsSize,
          deletedDocumentsCount,
          deletedDocumentsSize,
          totalDocumentsCount,
          totalDocumentsSize,
        },
      });
    },
  );
}

function setupDeleteTrashDocumentRoute({ app, db, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/trash/:documentId',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteTrashDocument({ documentId, organizationId, documentsRepository, documentsStorageService, eventServices });

      return context.json({
        success: true,
      });
    },
  );
}

function setupDeleteAllTrashDocumentsRoute({ app, db, documentsStorageService, eventServices }: RouteDefinitionContext) {
  app.delete(
    '/api/organizations/:organizationId/documents/trash',
    requireAuthentication(),
    validateParams(z.object({
      organizationId: organizationIdSchema,
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId } = context.req.valid('param');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });

      await deleteAllTrashDocuments({ organizationId, documentsRepository, documentsStorageService, eventServices });

      return context.body(null, 204);
    },
  );
}

function setupUpdateDocumentRoute({ app, db, eventServices }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/documents/:documentId',
    requireAuthentication({ apiKeyPermissions: ['documents:update'] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    validateJsonBody(z.object({
      name: z.string().min(1).max(255).optional(),
      content: z.string().optional(),
      documentDate: z.coerce.date().nullable().optional(),
    }).refine(data => data.name !== undefined || data.content !== undefined || data.documentDate !== undefined, {
      message: 'At least one of \'name\', \'content\', or \'documentDate\' must be provided',
    })),
    async (context) => {
      const { userId } = getUser({ context });
      const { organizationId, documentId } = context.req.valid('param');
      const changes = context.req.valid('json');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserHasOrganizationRole({ userId, organizationId, minimumRole: ORGANIZATION_ROLES.ADMIN, organizationsRepository });
      await ensureDocumentExists({ documentId, organizationId, documentsRepository });

      const { document } = await updateDocument({
        documentId,
        organizationId,
        userId,
        documentsRepository,
        eventServices,
        changes,
      });

      return context.json({ document: formatDocumentForApi({ document }) });
    },
  );
}

/**
 * PATCH /organizations/:orgId/documents/:docId/folder
 * Moves a document into a folder or to root (folderId: null).
 * Always verifies the target folder belongs to the same org.
 */
function setupUpdateDocumentFolderRoute({ app, db }: RouteDefinitionContext) {
  app.patch(
    '/api/organizations/:organizationId/documents/:documentId/folder',
    requireAuthentication({ apiKeyPermissions: [API_KEY_PERMISSIONS.DOCUMENTS.UPDATE] }),
    validateParams(z.object({
      organizationId: organizationIdSchema,
      documentId: documentIdSchema,
    })),
    validateJsonBody(z.object({
      // null = move to root; a folderId string = move into that folder
      folderId: folderIdSchema.nullable(),
    })),
    async (context) => {
      const { userId } = getUser({ context });

      const { organizationId, documentId } = context.req.valid('param');
      const { folderId } = context.req.valid('json');

      const documentsRepository = createDocumentsRepository({ db });
      const organizationsRepository = createOrganizationsRepository({ db });

      await ensureUserIsInOrganization({ userId, organizationId, organizationsRepository });
      await ensureDocumentExists({ documentId, organizationId, documentsRepository });

      // When targeting a folder, verify it's in the same org (IDOR protection)
      if (folderId !== null) {
        const foldersRepository = createFoldersRepository({ db });
        await getFolderOrThrow({ folderId, organizationId, foldersRepository });
      }

      const { document } = await documentsRepository.updateDocumentFolder({
        documentId,
        organizationId,
        folderId,
      });

      return context.json({ document: formatDocumentForApi({ document }) });
    },
  );
}
