import { createPrefixedIdRegex } from '../shared/random/ids';

export const FOLDER_ID_PREFIX = 'fld';
export const FOLDER_ID_REGEX = createPrefixedIdRegex({ prefix: FOLDER_ID_PREFIX });

export const FOLDER_NAME_MAX_LENGTH = 255;
export const FOLDER_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
