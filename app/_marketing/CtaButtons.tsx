import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

type Size = 'lg' | 'md';

const SHARED =
  'inline-flex w-full sm:w-auto items-center justify-center whitespace-nowrap rounded-full ' +
  'transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-[3px] ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBFBFD] ' +
  'dark:focus-visible:ring-offset-black';

const PRIMARY_COLOR =
  'bg-[#0071E3] text-white hover:bg-[#0077ED] active:bg-[#006EDB] ' +
  'focus-visible:ring-[#0071E3]/35 ' +
  'dark:bg-[#4A8FE8] dark:hover:bg-[#5A9BEE] dark:active:bg-[#3A82E0]';

export async function CtaButtons({ size = 'lg' }: { size?: Size } = {}) {
  const t = await getTranslations('marketing.hero');
  const sizing =
    size === 'lg'
      ? 'h-[44px] min-w-[140px] px-[22px] text-[17px] font-normal tracking-[-0.022em]'
      : 'h-[38px] min-w-[120px] px-[18px] text-[15px] font-normal tracking-[-0.01em]';

  return (
    <Link href="/login" className={`${SHARED} ${sizing} ${PRIMARY_COLOR}`}>
      {t('ctaPrimary')}
    </Link>
  );
}
