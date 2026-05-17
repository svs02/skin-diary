import type { Metadata } from 'next';
import { LegalPage } from '@/app/_legal/LegalPage';

export const metadata: Metadata = {
  title: 'Sensitive Photo Consent · Skin Diary',
};

export default function SensitivePhotoRoute() {
  return <LegalPage ns="legal.sensitivePhoto" />;
}
