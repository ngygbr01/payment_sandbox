'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

// IDE ÍRD A SAJÁT PUBLIKUS KULCSODAT!
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

// 1. MUNKAVÁLLALÓK JSON ADATBÁZISA
const WORKERS = [
  { id: 'acct_1TqcFOFEtEW9HbHe', name: 'Gabesz' },
  { id: 'acct_1TppGVFEtEc3lu3M', name: 'Ádi' }
];

// TYPESCRIPT TÍPUS DEFINÍCIÓ A HIBÁK ELKERÜLÉSÉRE
type Order = {
  id: string;
  amount: number;
  status: string;
  workerId: string;
  workerName: string;
};

function EscrowApp() {
  const stripe = useStripe();
  const elements = useElements();

  const [status, setStatus] = useState<string>('');
  const [amount, setAmount] = useState<number>(10000);

  // Kiválasztott munkavállaló állapota (alapból az első a listából)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(WORKERS[0].id);

  // 1. LÉPÉS: Alapértelmezett állapot beállítása (ez fut le a szerveren és a legelső betöltéskor)
  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ORDER_100',
      amount: 15000,
      status: 'Letétben',
      workerId: 'acct_1TqcFOFEtEW9HbHe',
      workerName: 'Gabesz'
    }
  ]);

  // Egy flag, amivel figyeljük, hogy az oldal teljesen betöltött-e a böngészőben
  const [isMounted, setIsMounted] = useState(false);

  // 2. LÉPÉS: Adatok betöltése a localStorage-ből, MIUTÁN az oldal már megjelent
  useEffect(() => {
    setIsMounted(true); // Jelezzük, hogy a kliensen vagyunk
    const saved = localStorage.getItem('escrow_orders');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) {
          setOrders(parsed);
        }
      } catch {
        // Hiba esetén marad az alapértelmezett lista
      }
    }
  }, []);

  // 3. LÉPÉS: Adatok mentése a localStorage-be (de csak akkor, ha már betöltöttünk mindent)
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('escrow_orders', JSON.stringify(orders));
    }
  }, [orders, isMounted]);
  
  const [workerBalances, setWorkerBalances] = useState<Record<string, { available: number; pending: number } | null>>({});

  const fetchWorkerBalances = async () => {
    for (const worker of WORKERS) {
      try {
        const res = await fetch(`/api/worker-balance?accountId=${worker.id}`);
        const data = await res.json();
        if (data.success) {
          setWorkerBalances((prev) => ({
            ...prev,
            [worker.id]: { available: data.available, pending: data.pending },
          }));
        }
      } catch {
        // ha egy fiók lekérdezése hibázik, a többit még próbáljuk
      }
    }
  };

  // Az orders lista minden változáskor mentődik, hogy frissítés után is megmaradjon
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('escrow_orders', JSON.stringify(orders));
    }
  }, [orders]);

  // Automatikus platform egyenleg feltöltés az oldal betöltésekor
  useEffect(() => {
    const autoTopUp = async () => {
      try {
        await fetch('/api/topup', { method: 'POST' });
        console.log("✅ Platform egyenleg feltöltve!");
      } catch (err) {}
    };
    autoTopUp();
    fetchWorkerBalances(); // Egyenlegek kezdeti betöltése
  }, []);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    if (amount < 175) {
      setStatus('❌ Hiba: Az összegnek legalább 175 Ft-nak kell lennie!');
      return;
    }

    setStatus('Fizetés inicializálása...');
    const orderId = `ORDER_${Math.floor(Math.random() * 10000)}`;

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Math.floor(amount * 100), transferGroup: orderId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setStatus('Banki jóváhagyás folyamatban...');

      const cardElement = elements.getElement(CardElement);
      const confirmResult = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardElement! },
      });

      if (confirmResult.error) {
        setStatus(`❌ Sikertelen fizetés: ${confirmResult.error.message}`);
      } else {
        setStatus(`✅ Sikeres fizetés! ${amount} Ft letétbe helyezve.`);

        const selectedWorker = WORKERS.find(w => w.id === selectedWorkerId);

        setOrders([...orders, {
          id: orderId,
          amount: amount,
          status: 'Letétben',
          workerId: selectedWorkerId,
          workerName: selectedWorker?.name || 'Ismeretlen'
        }]);

        fetchWorkerBalances(); 
      }
    } catch (err: any) {
      setStatus(`❌ Hiba a fizetésnél: ${err.message}`);
    }
  };

  const handleRelease = async (orderId: string, orderAmount: number, workerAccountId: string) => {
    setStatus(`${orderId} kiutalása folyamatban...`);
    try {
      const res = await fetch('/api/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectedAccountId: workerAccountId,
          amount: Math.floor(orderAmount * 100),
          transferGroup: orderId
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus(`✅ ${orderAmount} Ft sikeresen kiutalva a munkavállalónak!`);
        setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'Kiutalva' } : o));
        fetchWorkerBalances();
      } else {
        setStatus(`❌ Hiba az utaláskor: ${data.error}`);
      }
    } catch (err) {
      setStatus('❌ Hálózati hiba utaláskor.');
    }
  };

  return (
    <div style={{ padding: '40px 20px', fontFamily: 'Arial, sans-serif', maxWidth: '900px', margin: '0 auto', color: '#333' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#111' }}>Letétkezelő Rendszer Demo</h1>

      <div style={{ minHeight: '50px', marginBottom: '30px', padding: '15px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', color: '#0369a1', fontWeight: 'bold' }}>
        {status ? status : 'Várakozás a műveletre...'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>

        {/* MEGRENDELŐI ŰRLAP */}
        <div style={{ padding: '25px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>1. Új megbízás kifizetése (Megrendelő)</h2>

          <form onSubmit={handlePaymentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#475569' }}>Kiválasztott munkavállaló:</label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  style={{ padding: '10px', fontSize: '16px', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', width: '200px', backgroundColor: '#fff' }}
                >
                  {WORKERS.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#475569' }}>Összeg (HUF) - Min. 175 Ft:</label>
                <input
                  type="number"
                  min="175"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  style={{ padding: '10px', fontSize: '16px', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', width: '150px' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#475569' }}>Bankkártya adatok (Teszt: 4242...):</label>
              <div style={{ padding: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc', maxWidth: '400px' }}>
                <CardElement
                  options={{
                    hidePostalCode: true,
                    style: { base: { fontSize: '16px', color: '#0f172a', '::placeholder': { color: '#94a3b8' } } }
                  }}
                />
              </div>
            </div>

            <button type="submit" disabled={!stripe} style={{ padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', alignSelf: 'flex-start' }}>
              Fizetés letétbe helyezése
            </button>
          </form>
        </div>

        {/* MUNKAVÁLLALÓI EGYENLEGEK */}
        <div style={{ padding: '25px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#0f172a' }}>Munkavállalói egyenlegek (Stripe balance)</h2>
            <button
              onClick={fetchWorkerBalances}
              style={{ padding: '6px 14px', backgroundColor: '#e2e8f0', color: '#334155', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}
            >
              🔄 Frissítés
            </button>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {WORKERS.map((worker) => {
              const balance = workerBalances[worker.id];
              return (
                <div key={worker.id} style={{ padding: '15px 20px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '200px' }}>
                  <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '6px' }}>{worker.name}</div>
                  {balance ? (
                    <>
                      <div style={{ color: '#166534', fontSize: '14px' }}>
                        Elérhető: {balance.available.toLocaleString('hu-HU')} Ft
                      </div>
                      <div style={{ color: '#854d0e', fontSize: '14px' }}>
                        Függőben: {balance.pending.toLocaleString('hu-HU')} Ft
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>Betöltés...</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ADMIN TÁBLÁZAT */}
        <div style={{ padding: '25px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: '0', marginBottom: '20px', color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>2. Megbízások kezelése (Admin)</h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>ID</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>Munkavállaló</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>Összeg</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>Státusz</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1', color: '#334155' }}>Akció</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '15px 12px', color: '#0f172a', fontWeight: '500' }}>{order.id}</td>
                    <td style={{ padding: '15px 12px', color: '#0f172a', fontWeight: 'bold' }}>{order.workerName}</td>
                    <td style={{ padding: '15px 12px', color: '#0f172a' }}>{order.amount} Ft</td>
                    <td style={{ padding: '15px 12px' }}>
                      <span style={{ padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', backgroundColor: order.status === 'Letétben' ? '#fef08a' : '#bbf7d0', color: order.status === 'Letétben' ? '#854d0e' : '#166534' }}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '15px 12px' }}>
                      {order.status === 'Letétben' && (
                        <button
                          onClick={() => handleRelease(order.id, order.amount, order.workerId)}
                          style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#ffffff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        >
                          Kiutalás
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function AppWrapper() {
  return (
    <Elements stripe={stripePromise}>
      <EscrowApp />
    </Elements>
  );
}