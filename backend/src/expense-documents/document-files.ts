import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;
export const MAX_DOCUMENTS = 3;
export interface UploadedDocument { buffer: Buffer; originalname: string; mimetype: string; size: number; }
export function documentMime(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 5) === '%PDF-' && b.subarray(-1024).includes(Buffer.from('%%EOF'))) return 'application/pdf';
  return null;
}
export function prepareDocuments(files: UploadedDocument[] = []) {
  if (!files.length || files.length > MAX_DOCUMENTS) throw new BadRequestException('Selecciona entre 1 y 3 documentos');
  const prepared = files.map(file => {
    if (!file.buffer.length || file.buffer.length > MAX_DOCUMENT_SIZE) throw new BadRequestException('Cada documento debe tener entre 1 byte y 5 MB');
    const mimeType = documentMime(file.buffer);
    if (!mimeType) throw new BadRequestException('Solo se admiten documentos PDF e imágenes JPG, PNG o WebP válidos');
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const originalName = [...file.originalname].every(c => c.charCodeAt(0) <= 255) && !decoded.includes('\ufffd') ? decoded : file.originalname;
    let fileName = originalName.split(/[\\/]/).pop()!.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 180) || 'comprobante';
    const extensions = mimeType === 'image/jpeg' ? ['.jpg', '.jpeg'] : mimeType === 'image/png' ? ['.png'] : mimeType === 'image/webp' ? ['.webp'] : ['.pdf'];
    if (!extensions.some(ext => fileName.toLowerCase().endsWith(ext))) fileName = fileName.slice(0, 180 - extensions[0].length) + extensions[0];
    return { fileName, mimeType, size: file.buffer.length, sha256: createHash('sha256').update(file.buffer).digest('hex'), data: new Uint8Array(file.buffer) };
  });
  if (new Set(prepared.map(f => f.sha256)).size !== prepared.length) throw new BadRequestException('El mismo documento está repetido en la selección');
  return prepared;
}
