// Legacy redirect — remove after 2026-06-05 (4 weeks deprecation window).
import { redirect } from 'next/navigation';

// /today는 BottomTabBar 1번 슬롯이 /overview로 이동하면서 폐기됨.
// 외부 북마크/공유 링크 호환을 위해 한시적으로 /overview로 위임한다 (CLAUDE.md §5.2).
export default function TodayPage() {
  redirect('/overview');
}
