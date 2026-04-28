import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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
    const hasBalance = searchParams.get('hasBalance') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20');
    const page = parseInt(searchParams.get('page') || '1');

    const where: Prisma.CustomerWhereInput = {
      companyId: tenant.companyId,
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { nit: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (hasBalance) {
      where.balance = { gt: 0 };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip: (page - 1) * limit,
        include: {
          sales: {
            where: { status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, total: true, createdAt: true }
          }
        }
      }),
      prisma.customer.count({ where }),
    ]);

    return NextResponse.json({ data: customers, total });
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
