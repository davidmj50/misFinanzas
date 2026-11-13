import { Injectable } from '@angular/core';
import type { Worker as OcrWorker } from 'tesseract.js';
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import { parseReceipt, ReceiptSuggestions } from '../utils/receipt-parser';
export interface ReceiptReading { text: string; suggestions: ReceiptSuggestions; method: 'OCR' | 'PDF_TEXT'; warnings: string[]; }
export async function receiptFileType(file: File) {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Cada documento debe tener entre 1 byte y 5 MB.');
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if ([137,80,78,71,13,10,26,10].every((v, i) => b[i] === v)) return 'image/png';
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return 'image/webp';
  if (String.fromCharCode(...b.slice(0, 5)) === '%PDF-') return 'application/pdf';
  throw new Error('Selecciona un PDF o una imagen JPG, PNG o WebP.');
}
@Injectable({ providedIn: 'root' })
export class ReceiptReaderService {
  async read(file: File, dateFormat: 'DMY' | 'MDY', onProgress: (value: string) => void, signal: AbortSignal): Promise<ReceiptReading> {
    const timeout = AbortSignal.timeout(90000);
    const abort = AbortSignal.any([signal, timeout]);
    let worker: OcrWorker | undefined, loading: PDFDocumentLoadingTask | undefined, render: RenderTask | undefined;
    const asset = (path: string) => new URL(`assets/receipts/${path}`, document.baseURI).href;
    const stop = () => { if (worker) void worker.terminate().catch(() => {}); render?.cancel(); if (loading) void loading.destroy().catch(() => {}); };
    abort.addEventListener('abort', stop, { once: true });
    const waitFor = <T>(job: Promise<T>) => new Promise<T>((resolve, reject) => {
      const cancelled = () => reject(new Error('Lectura cancelada.'));
      abort.addEventListener('abort', cancelled, { once: true });
      if (abort.aborted) cancelled();
      job.then(resolve, reject).finally(() => abort.removeEventListener('abort', cancelled));
    });
    const recognize = async (canvas: HTMLCanvasElement) => {
      abort.throwIfAborted();
      if (!worker) {
        onProgress('Preparando lectura local...');
        const { default: tesseract } = await import('tesseract.js');
        abort.throwIfAborted();
        const created = await tesseract.createWorker('spa+eng', tesseract.OEM.LSTM_ONLY, { workerPath: asset('ocr/worker.min.js'), corePath: asset('ocr'), langPath: asset('languages'),
          cacheMethod: 'none', workerBlobURL: false, errorHandler: () => {},
          logger: info => { if (!abort.aborted && info.status === 'recognizing text') onProgress(`Leyendo texto: ${Math.round(info.progress * 100)}%`); } });
        if (abort.aborted) { await created.terminate(); abort.throwIfAborted(); }
        worker = created;
      }
      const result = await waitFor(worker.recognize(canvas)); abort.throwIfAborted(); return result.data.text;
    };
    const operation = async (): Promise<ReceiptReading> => {
      try {
        abort.throwIfAborted(); const mime = await receiptFileType(file); abort.throwIfAborted();
        let text = '', method: ReceiptReading['method'] = 'OCR'; const warnings: string[] = [];
        if (mime === 'application/pdf') {
          onProgress('Leyendo PDF...'); const pdfjs = await import('pdfjs-dist'); abort.throwIfAborted();
          pdfjs.GlobalWorkerOptions.workerSrc = asset('pdf/pdf.worker.min.mjs');
          loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: asset('pdf/cmaps/'), standardFontDataUrl: asset('pdf/standard_fonts/'),
            wasmUrl: asset('pdf/wasm/'), iccUrl: asset('pdf/iccs/'), maxImageSize: 16000000, enableXfa: false });
          const pdf = await waitFor(loading.promise); abort.throwIfAborted(); method = 'PDF_TEXT';
          if (pdf.numPages > 3) warnings.push(`Se analizaron las primeras 3 de ${pdf.numPages} páginas.`);
          for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 3); pageNumber++) {
            onProgress(`Leyendo página ${pageNumber}...`); const page = await pdf.getPage(pageNumber); abort.throwIfAborted();
            const content = await waitFor(page.getTextContent());
            const lines: string[] = []; let lastY: number | undefined;
            for (const item of content.items) {
              if (!('str' in item)) continue;
              const y = item.transform[5]; if (lastY !== undefined && Math.abs(y - lastY) > 3) lines.push('\n');
              lines.push(item.str + (item.hasEOL ? '\n' : ' ')); lastY = y;
            }
            let pageText = lines.join(''); const parsed = parseReceipt(pageText, dateFormat);
            if (!parsed.amount || !parsed.date || !parsed.merchant) {
              const base = page.getViewport({ scale: 1 }); const scale = Math.min(2.5, 2200 / base.width, Math.sqrt(4000000 / (base.width * base.height)));
              const viewport = page.getViewport({ scale }); const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              try { render = page.render({ canvas, viewport }); await waitFor(render.promise); abort.throwIfAborted(); pageText = await recognize(canvas); method = 'OCR'; }
              finally { canvas.width = 0; canvas.height = 0; render = undefined; }
            }
            text += pageText + '\n'; page.cleanup();
          }
        } else {
          const bitmap = await createImageBitmap(file);
          const canvas = document.createElement('canvas');
          try {
            abort.throwIfAborted();
            if (bitmap.width * bitmap.height > 24000000) throw new Error('La imagen supera 24 megapíxeles. Reduce su tamaño para analizarla.');
            const scale = Math.min(1.5, 2600 / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.ceil(bitmap.width * scale); canvas.height = Math.ceil(bitmap.height * scale);
            const context = canvas.getContext('2d'); if (!context) throw new Error('No se pudo preparar la imagen.');
            context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            text = await recognize(canvas);
          } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
        }
        abort.throwIfAborted(); return { text: text.slice(0, 50000), suggestions: parseReceipt(text, dateFormat), method, warnings };
      } finally { abort.removeEventListener('abort', stop); if (worker) await worker.terminate().catch(() => {}); if (loading) await loading.destroy().catch(() => {}); }
    };
    return new Promise<ReceiptReading>((resolve, reject) => {
      const interrupted = () => reject(new Error(timeout.aborted ? 'La lectura tardó demasiado. Puedes completar los datos manualmente.' : 'Lectura cancelada.'));
      abort.addEventListener('abort', interrupted, { once: true });
      if (abort.aborted) interrupted();
      operation().then(resolve, error => reject(error?.name === 'PasswordException' ? new Error('El PDF está protegido con contraseña. Adjunta una copia sin protección para analizarlo.') : error)).finally(() => abort.removeEventListener('abort', interrupted));
    });
  }
}
