import { describe, it, expect } from 'vitest';
import {
  flattenForExport,
  nextSortDirection,
  calcTotalPages,
  type DataTableColumnLike,
} from '../data-table.helpers';

// Tipo local de Row para tests — alias del shape esperado.
type DataTableColumn<T> = DataTableColumnLike<T>;

/**
 * Fase 22a · Tests mínimos del DataTable.
 *
 * El componente JSX se valida con typecheck (TS). Estos tests cubren la
 * lógica pura de export (helper flattenForExport) y casos críticos
 * (accessor con tipos no string, fallback a row[key], orden de columnas).
 *
 * Cuando se introduzca testing-library (Fase 25), se sumarán tests de
 * render, paginación, sort y selección sobre el componente completo.
 */

interface Row {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

describe('DataTable · flattenForExport', () => {
  const rows: Row[] = [
    { id: '1', name: 'Café', price: 12.5, active: true },
    { id: '2', name: 'Pan', price: 5, active: false },
  ];

  it('genera header desde columns.header', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Nombre' },
      { key: 'price', header: 'Precio' },
    ];
    const { header } = flattenForExport(rows, cols);
    expect(header).toEqual(['ID', 'Nombre', 'Precio']);
  });

  it('usa exportValue cuando está definido', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nombre' },
      {
        key: 'price',
        header: 'Precio',
        exportValue: (r) => `Q${r.price.toFixed(2)}`,
      },
    ];
    const { body } = flattenForExport(rows, cols);
    expect(body[0]).toEqual(['Café', 'Q12.50']);
    expect(body[1]).toEqual(['Pan', 'Q5.00']);
  });

  it('usa accessor string-like cuando no hay exportValue', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nombre', accessor: (r) => r.name.toUpperCase() },
    ];
    const { body } = flattenForExport(rows, cols);
    expect(body[0]).toEqual(['CAFÉ']);
    expect(body[1]).toEqual(['PAN']);
  });

  it('fallback a row[key] cuando accessor devuelve nodo no string', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nombre' },
    ];
    const { body } = flattenForExport(rows, cols);
    expect(body[0]).toEqual(['Café']);
  });

  it('devuelve string vacío para valores null/undefined', () => {
    const sparseRows = [{ id: '1' } as Row];
    const cols: DataTableColumn<Row>[] = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Nombre' },
    ];
    const { body } = flattenForExport(sparseRows, cols);
    expect(body[0]).toEqual(['1', '']);
  });

  it('cubre 0 filas sin reventar', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Nombre' },
    ];
    const { header, body } = flattenForExport([], cols);
    expect(header).toEqual(['ID', 'Nombre']);
    expect(body).toEqual([]);
  });
});

describe('DataTable · nextSortDirection', () => {
  it('primer click en columna → asc', () => {
    expect(nextSortDirection({ key: null, direction: null }, 'name')).toBe('asc');
  });

  it('asc en misma columna → desc', () => {
    expect(nextSortDirection({ key: 'name', direction: 'asc' }, 'name')).toBe('desc');
  });

  it('desc en misma columna → asc (toggle)', () => {
    expect(nextSortDirection({ key: 'name', direction: 'desc' }, 'name')).toBe('asc');
  });

  it('cambiar de columna → asc', () => {
    expect(nextSortDirection({ key: 'name', direction: 'asc' }, 'price')).toBe('asc');
  });
});

describe('DataTable · calcTotalPages', () => {
  it('cero registros → 1 página', () => {
    expect(calcTotalPages(0, 20)).toBe(1);
  });

  it('redondea hacia arriba', () => {
    expect(calcTotalPages(25, 10)).toBe(3);
    expect(calcTotalPages(100, 20)).toBe(5);
    expect(calcTotalPages(101, 20)).toBe(6);
  });

  it('protege contra pageSize=0', () => {
    expect(calcTotalPages(50, 0)).toBe(1);
  });
});
