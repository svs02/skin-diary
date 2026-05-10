import type { Metadata } from 'next';
import { LegalPage } from '@/app/_legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms · Skin Diary',
};

export default function TermsRoute() {
  return <LegalPage ns="legal.terms" />;
}
