type OrderStatus = 'PENDING' | 'PAID' | 'RELEASED';

interface Order {
  id: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentIntentId?: string;
  transferId?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __escrowOrders: Map<string, Order> | undefined;
}

// globalThis-re tesszük, hogy Next.js dev módban (hot reload) is megmaradjon
const orders = globalThis.__escrowOrders ?? new Map<string, Order>();
globalThis.__escrowOrders = orders;

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function setOrder(order: Order): void {
  orders.set(order.id, order);
}