import { TopNav } from './TopNav';
import { Hero } from './Hero';
import { WhatItIs } from './WhatItIs';
import { HowItWorks } from './HowItWorks';
import { WhyAndPrivacy } from './WhyAndPrivacy';
import { CtaFooter } from './CtaFooter';

/**
 * Marketing landing root. Pure server component. The wrapper paints a
 * marketing-only light surface using inline hex so the user theme toggle
 * cannot bleed into this page.
 */
export function MarketingPage() {
  return (
    <div
      data-marketing
      className="flex min-h-dvh w-full flex-col bg-[#FBFBFD] text-[#1D1D1F]"
    >
      <TopNav />
      <main className="flex-1">
        <Hero />
        <WhatItIs />
        <HowItWorks />
        <WhyAndPrivacy />
      </main>
      <CtaFooter />
    </div>
  );
}
