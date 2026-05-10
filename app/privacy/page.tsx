import type { Metadata } from 'next';
import { LegalPage } from '@/app/_legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy · Skin Diary',
};

export default function PrivacyRoute() {
  return <LegalPage ns="legal.privacy" />;
}
