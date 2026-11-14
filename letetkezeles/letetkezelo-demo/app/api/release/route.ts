import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-06-24.dahlia',
});

export async function POST(req: Request) {
  try {
    const { connectedAccountId, amount, transferGroup } = await req.json();

    // 10% marad a platformnál, 90% megy a munkavállalónak
    const workerAmount = Math.floor(amount * 0.9);

    const transfer = await stripe.transfers.create({
      amount: workerAmount,
      currency: 'huf',
      destination: connectedAccountId, 
      transfer_group: transferGroup,
    });

    return NextResponse.json({ 
      success: true, 
      transferId: transfer.id 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}