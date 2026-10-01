import type {Metadata} from 'next';

import {BookingDetails} from '@/components/booking/BookingDetails';

type Props = {params: Promise<{bookingNumber: string}>};

export const metadata: Metadata = {
  robots: {index: false, follow: false}
};

export default async function BookingDetailPage({params}: Props) {
  const {bookingNumber} = await params;
  return <BookingDetails bookingNumber={bookingNumber} />;
}
