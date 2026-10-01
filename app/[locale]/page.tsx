import {setRequestLocale} from 'next-intl/server';

import {BookingForm} from '@/components/booking/BookingForm';

type Props = {
  params: Promise<{locale: string}>;
};

export default async function HomePage({params}: Props) {
  const {locale} = await params;
  setRequestLocale(locale);

  return <BookingForm />;
}
