import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAnyPermission } from '@/lib/tenant';

/**
 * GET /api/accounting/chart — devuelve el plan de cuentas en forma de árbol.
 * Las cuentas padre (isPosting=false) agrupan a las hojas (isPosting=true).
 */
export async function GET(req: NextRequest) {
  void req;
  const result = await requireAnyPermission(['treasury:view', 'treasury:manage', 'reports:view']);
  if ('error' in result) return result.error;
  const { tenant } = result;

  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { code: 'asc' },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parentId: true,
      isPosting: true,
      active: true,
    },
  });

  // Construir árbol
  type Node = (typeof accounts)[number] & { children: Node[] };
  const map = new Map<string, Node>();
  const roots: Node[] = [];
  for (const a of accounts) {
    map.set(a.id, { ...a, children: [] });
  }
  for (const a of accounts) {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return NextResponse.json({ accounts, tree: roots });
}
