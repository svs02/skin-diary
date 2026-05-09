import { redirect } from 'next/navigation';
import { todayKey } from '@/lib/utils/dateKey';

// /today는 BottomTabBar의 진입점. 실제 화면은 /record/[date]가 담당하며,
// 여기서는 앱 타임존(America/Vancouver) 기준 오늘 dateKey로 위임한다 (CLAUDE.md §5.2, §5.5).
export default function TodayPage() {
  redirect(`/record/${todayKey()}`);
}
