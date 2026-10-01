import type {Metadata} from 'next';

import {MemberCenter} from '@/components/account/MemberCenter';

export const metadata: Metadata = {
  robots: {index: false, follow: false}
};

export default function AccountPage() {
  return <MemberCenter />;
}
