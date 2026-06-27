import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

function ensureDirectory(directoryPath: string) {
  if (!existsSync(directoryPath)) {
    mkdirSync(directoryPath, { recursive: true });
  }
}

export function createUploadStorage(targetFolder: string) {
  return diskStorage({
    destination: (_req, _file, callback) => {
      const destinationPath = join(process.cwd(), 'uploads', targetFolder);
      ensureDirectory(destinationPath);
      callback(null, destinationPath);
    },
    filename: (_req, file, callback) => {
      const extension = extname(file.originalname || '').toLowerCase();
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      callback(null, uniqueName);
    },
  });
}

export function buildUploadUrl(
  baseUrl: string,
  targetFolder: string,
  fileName: string,
) {
  return `${baseUrl.replace(/\/$/, '')}/uploads/${targetFolder}/${fileName}`;
}

export function resolveUploadPath(fileUrl: string) {
  const relativePath = fileUrl
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split('/')
    .join('\\');
  return join(process.cwd(), relativePath);
}

export function safeDeleteFile(filePath?: string | null) {
  if (!filePath) {
    return;
  }

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors so main request flow stays safe.
  }
}
