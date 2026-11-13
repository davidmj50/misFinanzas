import { prepareDocuments } from './document-files.js';
const png = Buffer.from([137,80,78,71,13,10,26,10]);
describe('Nombres de comprobantes', () => {
  it('determina el tipo por los bytes y evita una extensión ejecutable al descargar', () => {
    const [file] = prepareDocuments([{ buffer: png, originalname: 'factura.html', mimetype: 'text/html', size: png.length }]);
    expect(file.mimeType).toBe('image/png'); expect(file.fileName).toBe('factura.html.png');
  });
  it('conserva caracteres españoles y elimina rutas y caracteres de control', () => {
    const [file] = prepareDocuments([{ buffer: png, originalname: Buffer.from('C:\\documentos\\facturación\r\n.png', 'utf8').toString('latin1'), mimetype: 'image/png', size: png.length }]);
    expect(file.fileName).toBe('facturación.png');
  });
});
