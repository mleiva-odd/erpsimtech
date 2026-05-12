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
  | 'FEL_CERTIFY_NDEB';

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
