import { describe, it, expect } from 'vitest';
import { weightedAverageCost } from '../cost';

describe('weightedAverageCost', () => {
  it('stock=0 + entrada normal → costo = costoNuevo', () => {
    expect(weightedAverageCost(0, 0, 10, 100)).toBe(100);
  });

  it('stock>0 + entrada normal → promedio ponderado', () => {
    // 10 unidades a Q100 + 10 a Q200 = (1000 + 2000) / 20 = 150
    expect(weightedAverageCost(10, 100, 10, 200)).toBe(150);
  });

  it('stock=5 + entrada de 5 a precio mayor → promedio justo en el medio', () => {
    expect(weightedAverageCost(5, 80, 5, 120)).toBe(100);
  });

  it('stock=0 + entrada=0 → devuelve costoAnterior', () => {
    // No hay forma de promediar nada; respetar el costo previo.
    expect(weightedAverageCost(0, 50, 0, 999)).toBe(50);
  });

  it('entrada cantidad negativa → no cambia el costo', () => {
    expect(weightedAverageCost(10, 100, -5, 200)).toBe(100);
  });

  it('costoNuevo = 0 (entrada gratis tipo bonificación) → no contamina el WAC', () => {
    // Entrada de 5 unidades con costo 0: si promediáramos, bajaría el costo
    // artificialmente. Decisión de diseño: ignorar entradas con costo 0.
    expect(weightedAverageCost(10, 100, 5, 0)).toBe(100);
  });

  it('stock negativo previo + entrada normal → asume costoNuevo', () => {
    // Si por algún error el stock previo es negativo, no hay forma de
    // promediar contra él; usamos directamente el costo nuevo.
    expect(weightedAverageCost(-5, 999, 10, 50)).toBe(50);
  });

  it('múltiples iteraciones reproducen el WAC clásico', () => {
    // Simulamos 3 compras consecutivas:
    //   10 @ 100  → cost=100, stock=10
    //   +10 @ 200 → cost=150, stock=20
    //   +5  @ 300 → cost=(20*150 + 5*300) / 25 = (3000 + 1500) / 25 = 180
    let cost = 0;
    let stock = 0;
    cost = weightedAverageCost(stock, cost, 10, 100);
    stock += 10;
    expect(cost).toBe(100);

    cost = weightedAverageCost(stock, cost, 10, 200);
    stock += 10;
    expect(cost).toBe(150);

    cost = weightedAverageCost(stock, cost, 5, 300);
    stock += 5;
    expect(cost).toBe(180);
  });
});
