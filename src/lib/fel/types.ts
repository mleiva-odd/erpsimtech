/**
 * Tipos públicos del módulo FEL (Facturación Electrónica Guatemala).
 *
 * Toda la app debe consumir estos tipos en lugar de hablar directamente con
 * los providers concretos. `resolveProvider` (en `./factory.ts`) devuelve un
 * `FelProvider` según la configuración de la empresa.
 *
 * Spec de referencia SAT:
 *   https://portal.sat.gob.gt/portal/factura-electronica/
 */

/**
 * Alias semántico que matchea el nombre del enum en el brief de Fase 16.
 * En el schema Prisma el enum se llama `FelProvider` por razones históricas
 * (Fase 13 ya lo había declarado). Acá exponemos `FelProviderType` como
 * sinónimo de tipo TS para mayor claridad.
 */
export type FelProviderType = 'NONE' | 'MOCK' | 'INFILE' | 'DIGIFACT';

/** Régimen tributario del emisor. Determina la tasa de IVA aplicable. */
export type TaxRegimeCode = 'GENERAL' | 'PEQUENO_CONTRIBUYENTE';

/** Tipos de documento tributario SAT. */
export type TaxDocumentTypeCode = 'FACT' | 'NCRE' | 'NDEB';

/** Datos del emisor en el DTE. Snapshot al momento de certificar. */
export interface FelEmisor {
  nit: string;
  nombre: string;
  codigoEstablecimiento: string; // ej. "1" para sucursal principal
  nombreComercial?: string;
  direccion?: string;
  taxRegime: TaxRegimeCode;
  affiliation?: string; // "GEN" para General; "PEQ" para Pequeño Contribuyente
}

/** Datos del receptor en el DTE. "CF" si Consumidor Final. */
export interface FelReceptor {
  nit: string; // "CF" o NIT GT con dígito verificador
  nombre: string;
  direccion?: string;
}

/** Ítem línea del DTE — ya con IVA calculado. */
export interface FelItem {
  numeroLinea: number;
  bienOServicio: 'B' | 'S'; // Bien | Servicio
  codigoItem: string;       // SKU o ID
  descripcion: string;
  cantidad: number;
  unidadMedida?: string;    // ej "UNI", "KG"
  precioUnitario: number;   // antes de IVA si NO incluido
  descuento: number;        // monto en GTQ
  /** Subtotal de la línea ANTES de IVA (qty*price - discount). */
  precio: number;
  /** Tasa aplicada (0 si exento, 0.12 General, 0.05 Pequeño). */
  taxRate: number;
  /** Monto de IVA de la línea. */
  iva: number;
  /** Total de la línea (precio + iva). */
  total: number;
  isTaxExempt: boolean;
}

/** Totales agregados del DTE. */
export interface FelTotales {
  granTotal: number;
  totalIva: number;
  totalGravado: number;
  totalExento: number;
}

/** Input al certificar un DTE. */
export interface CertifyInput {
  type: TaxDocumentTypeCode;
  /** Prefijo de la serie autorizada SAT (ej "A"). */
  seriePrefix: string;
  /** Correlativo asignado dentro de la serie (1, 2, 3, ...). */
  numero: number;
  fechaEmision: Date;
  emisor: FelEmisor;
  receptor: FelReceptor;
  items: FelItem[];
  totales: FelTotales;
  /** Para NCRE/NDEB: referencia al DTE original que se ajusta. */
  documentoReferencia?: {
    uuid: string;
    serie: string;
    numero: number;
    fechaEmision: Date;
    motivo: string;
  };
  /** ID interno del documento (para idempotencia y trazabilidad). */
  internalId: string;
}

/** Respuesta exitosa del provider tras certificar. */
export interface CertifyOutput {
  ok: true;
  uuid: string;                 // UUID asignado por SAT
  autorizacion: string;         // Número de autorización (legible)
  fechaCertificacion: Date;
  hashCertificacion: string;
  xmlFirmado: string;           // XML completo certificado
  providerName: FelProviderType;
  providerResponseRaw: unknown; // raw response del provider (para auditoría)
}

/** Respuesta de error del provider. */
export interface CertifyError {
  ok: false;
  code: string;
  message: string;
  providerResponseRaw?: unknown;
}

export type CertifyResult = CertifyOutput | CertifyError;

/** Input al anular un DTE. */
export interface CancelInput {
  uuid: string;
  motivoAnulacion: string;
  fechaAnulacion: Date;
  emisorNit: string;
}

/** Respuesta del provider al anular. */
export interface CancelResult {
  ok: boolean;
  uuid?: string;          // UUID de la operación de anulación
  fechaAnulacion?: Date;
  providerResponseRaw?: unknown;
  errorCode?: string;
  errorMessage?: string;
}

/** Errores tipados del módulo FEL. */
export class FelError extends Error {
  status: number;
  code: string;
  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'FelError';
    this.status = options.status ?? 500;
    this.code = options.code ?? 'FEL_ERROR';
  }
}

/** Interface común que todos los providers FEL deben implementar. */
export interface FelProvider {
  readonly name: FelProviderType;
  certify(input: CertifyInput): Promise<CertifyResult>;
  cancel(input: CancelInput): Promise<CancelResult>;
}
