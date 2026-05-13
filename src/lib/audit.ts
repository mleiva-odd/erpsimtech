import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type AuditAction =
  | 'SALE_CREATED'
  | 'SALE_VOIDED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'STOCK_TRANSFER'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'SETTINGS_UPDATED'
  | 'CASH_REGISTER_OPENED'
  | 'CASH_REGISTER_CLOSED'
  | 'CASH_TRANSACTION_RECORDED'
  | 'COMPANY_CREATED'
  | 'COMPANY_SUSPENDED'
  | 'SUBSCRIPTION_CHANGED'
  | 'SALE_RETURNED'
  | 'STOCK_RECEIVED'
  | 'INVENTORY_ADJUSTMENT'
  | 'INVENTORY_ADJUSTED'
  | 'STOCK_TRANSFER_SENT'
  | 'STOCK_TRANSFER_RECEIVED'
  | 'STOCK_TRANSFER_CANCELLED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'CUSTOMER_DELETED'
  | 'CUSTOMER_PAYMENT_RECORDED'
  | 'PAYMENT_RECEIVED'
  | 'SYSTEM_CLEANUP'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'EMPLOYEE_CREATED'
  | 'EMPLOYEE_UPDATED'
  | 'EMPLOYEE_DEACTIVATED'
  | 'PURCHASE_CANCELLED'
  // Fase 16 · Facturación Electrónica (FEL)
  | 'FEL_CERTIFY'
  | 'FEL_CANCEL'
  | 'FEL_CERTIFY_NCRE'
  | 'FEL_CERTIFY_NDEB'
  // Fase 18 · Planilla Guatemala
  | 'PAYROLL_CREATED'
  | 'PAYROLL_RECALCULATED'
  | 'PAYROLL_APPROVED'
  | 'PAYROLL_PAID'
  | 'PAYROLL_ITEM_UPDATED'
  | 'EMPLOYEE_TERMINATED'
  | 'EMP_LOAN_CREATED'
  | 'EMP_LOAN_CANCELLED'
  // Fase 19 · Compras enterprise
  | 'PURCHASE_REQUEST_CREATED'
  | 'PURCHASE_REQUEST_APPROVED'
  | 'PURCHASE_REQUEST_REJECTED'
  | 'PURCHASE_REQUEST_CONVERTED'
  | 'PURCHASE_APPROVED'
  | 'PURCHASE_GRN_CREATED'
  | 'PURCHASE_INVOICE_REGISTERED'
  | 'PURCHASE_CREDIT_NOTE_REGISTERED'
  | 'RFQ_CREATED'
  | 'RFQ_QUOTE_REGISTERED'
  | 'RFQ_AWARDED'
  // Fase 20 · Ventas enterprise
  | 'SALE_ORDER_ACCEPTED'
  | 'SALE_QUOTE_CANCELLED'
  | 'SALE_ORDER_CANCELLED'
  | 'SALE_DELIVERED'
  | 'SALE_INVOICED';

interface AuditLogParams {
  companyId: string;
  branchId?: string;
  userId: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
}

export async function createAuditLog({
  companyId,
  branchId,
  userId,
  action,
  entity,
  entityId,
  details,
}: AuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        companyId,
        branchId: branchId || undefined,
        userId,
        action,
        entity,
        entityId,
        changes: details ?? undefined,
      },
    });
  } catch (error) {
    // Audit failures should not break the main flow
    console.error('Audit log error:', error);
  }
}
