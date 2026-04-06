import { z } from 'zod';
import { FOLDER_COLOR_REGEX, FOLDER_ID_REGEX, FOLDER_NAME_MAX_LENGTH } from './folders.constants';

export const folderIdSchema = z.string().regex(FOLDER_ID_REGEX);

export const folderNameSchema = z.string().trim().min(1).max(FOLDER_NAME_MAX_LENGTH);

export const folderColorSchema = z.string().regex(FOLDER_COLOR_REGEX, 'Invalid Color format, must be a hex color code like #000000').transform(c => c.toUpperCase());
