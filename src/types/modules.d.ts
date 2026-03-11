declare module "pdf-parse" {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(buffer: Buffer, options?: Record<string, unknown>): Promise<PDFData>;
  export = pdfParse;
}

declare module "officeparser" {
  export function parseOfficeAsync(buffer: Buffer | string): Promise<string>;
}
