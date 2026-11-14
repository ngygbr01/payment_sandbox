import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-06-24.dahlia',
});

export async function POST(req: Request) {
  try {
    const { amount, transferGroup } = await req.json();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'huf',
      payment_method_types: ['card'],
      transfer_group: transferGroup,
    });

    return NextResponse.json({ 
      success: true, 
      clientSecret: paymentIntent.client_secret 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}