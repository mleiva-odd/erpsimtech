import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireTenant } from '@/lib/tenant';
import { z } from 'zod';

const createCustomerSchema = z.object({
  name: z.string().min(2, 'El nombre es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  nit: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  creditLimit: z.number().min(0, 'El límite no puede ser negativo').optional().default(0),
});

export async function GET(request: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const customers = await prisma.customer.findMany({
      where: {
        companyId: tenant.companyId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { nit: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Error fetching customers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await requireTenant();
  if ('error' in result) return result.error;
  const { tenant } = result;

  try {
    const body = await request.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, phone, nit, address, creditLimit } = parsed.data;

    const newCustomer = await prisma.customer.create({
      data: {
        companyId: tenant.companyId,
        name,
        email: email || null,
        phone: phone || null,
        nit: nit || null,
        address: address || null,
        creditLimit: creditLimit,
        balance: 0,
      },
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Error creating customer' }, { status: 500 });
  }
}
