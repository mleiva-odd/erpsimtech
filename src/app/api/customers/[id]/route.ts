import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';

// Actualizar Cliente Existente
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await req.json();
    const { name, email, phone, nit, address, creditLimit } = body;

    const customer = await prisma.customer.update({
      where: {
        id: resolvedParams.id,
        companyId: session.user.companyId,
      },
      data: {
        name,
        email: email || null,
        phone: phone || null,
        nit: nit || null,
        address: address || null,
        creditLimit: Number(creditLimit) || 0,
      },
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    return NextResponse.json({ error: 'Error al actualizar cliente' }, { status: 500 });
  }
}

// Opcional: Eliminar Cliente
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    await prisma.customer.delete({
      where: {
        id: resolvedParams.id,
        companyId: session.user.companyId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: 'Error al eliminar cliente, puede tener historial' }, { status: 500 });
  }
}
