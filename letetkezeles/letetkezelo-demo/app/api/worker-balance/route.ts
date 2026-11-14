import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-06-24.dahlia',
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'Hiányzik az accountId paraméter.' },
        { status: 400 }
      );
    }

    // Az első {} a kérés törzse (a balance.retrieve-nek nincs saját paramétere),
    // a második objektum mondja meg, hogy a connected account nevében kérdezzünk.
    const balance = await stripe.balance.retrieve(
      {},
      { stripeAccount: accountId }
    );

    const availableHuf = balance.available.find((b) => b.currency === 'huf')?.amount ?? 0;
    const pendingHuf = balance.pending.find((b) => b.currency === 'huf')?.amount ?? 0;

    return NextResponse.json({
      success: true,
      available: availableHuf / 100,
      pending: pendingHuf / 100,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}