// app/api/topup/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-06-24.dahlia',
});

export async function POST() {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 50000000, // 500.000 Ft, minor unitban
      currency: 'huf',
      payment_method: 'pm_card_bypassPendingInternational',
      payment_method_types: ['card'],
      confirm: true,
      description: 'Teszt platform egyenleg azonnali feltöltése',
    });

    return NextResponse.json({
      success: true,
      message: 'Platform egyenleg feltöltve 500.000 Ft-tal!',
      status: paymentIntent.status,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}