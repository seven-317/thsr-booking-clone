import type {Metadata} from 'next';
import {setRequestLocale} from 'next-intl/server';

import {BookingCheckout} from '@/components/booking/BookingCheckout';

type Props = {
  params: Promise<{locale: string}>;
};

export const metadata: Metadata = {
  robots: {index: false, follow: false}
};

export default async function CheckoutPage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);
  return <BookingCheckout />;
}
