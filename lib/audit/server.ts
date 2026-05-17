import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

/**
 * 서버측 감사(audit) 로그 작성 헬퍼 — Admin SDK 전용.
 *
 * 설계 결정:
 *  - 최상위 컬렉션 `audit/{autoId}`. 사용자 서브컬렉션(users/{uid}/audit) 대신
 *    독립 컬렉션을 선택한 이유는, account/delete 흐름에서 사용자 문서가 통째로
 *    삭제되어도 감사 추적이 남아야 하기 때문(=append-only, 사용자 삭제와 독립
 *    수명). 보안 룰에서 사용자는 본인 uid 이벤트만 read 가능.
 *  - 클라이언트 write는 firestore.rules에서 차단됨. 모든 작성은 본 헬퍼를 거쳐
 *    Admin SDK로 들어간다.
 *  - 실패는 throw하지 않는다 — 감사 기록 실패가 본 비즈니스 작업(예: 사진 발급,
 *    계정 삭제)을 차단해선 안 된다. 실패 시 console.error로만 남기고 호출자는
 *    정상 흐름을 계속 진행한다. (실패 알람은 Vercel 로그/모니터링에서 수집)
 *  - meta는 PII 최소화. 이메일·이름·실제 사진 URL은 적지 않는다. 식별자(uid)는
 *    상위 필드로 분리되어 있고, meta에는 count/stage/date/angle 같은 비식별
 *    부가정보만.
 *
 * 보존 정책 (관련 결정 — 본 모듈 외):
 *  - PIPA §29 안전성확보조치: 접속기록 최소 3년 보존 권고. Firestore audit 컬렉션은
 *    별도 TTL/cron 없이 무제한 보존 (저장 비용 vs 추적 가치 — 1인 운영자 규모에서는
 *    무제한이 합리적). 향후 규모 증가 시 retention cron 도입 검토.
 */

export type AuditEvent =
  // 사진 관련
  | 'photo.upload'
  | 'photo.delete'
  | 'photo.signed_url_issued'
  // 인증 관련
  | 'auth.signin'
  | 'auth.signout'
  // 계정 라이프사이클
  | 'account.deleted'
  | 'account.abandoned'
  // 동의
  | 'consent.granted'
  | 'consent.withdrawn'
  // 운영자 break-glass (수동 기록)
  | 'admin.access';

export type AuditSource = 'client' | 'server';

export type AuditMeta = Record<string, string | number | boolean | null>;

export interface AuditInput {
  uid: string;
  event: AuditEvent;
  /** 기본값 'server'. 클라이언트 호출 엔드포인트에서 'client'를 명시한다. */
  source?: AuditSource;
  /** PII 최소화. count, stage, date, angle 등 비식별 부가정보만. */
  meta?: AuditMeta;
}

/**
 * 감사 이벤트를 Firestore `audit` 컬렉션에 기록한다.
 *
 * 실패해도 throw하지 않는다 — 호출자는 await만 하고 정상 흐름을 계속한다.
 * 호출 패턴 예:
 *   await recordAuditEvent({ uid, event: 'photo.signed_url_issued', meta: { count } });
 *   return NextResponse.json(...);
 */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  try {
    const { uid, event, source = 'server', meta = {} } = input;
    await adminDb()
      .collection('audit')
      .add({
        uid,
        event,
        occurredAt: FieldValue.serverTimestamp(),
        source,
        meta,
      });
  } catch (err) {
    // 절대 throw 금지. 감사 실패가 비즈니스 작업을 차단하면 안 된다.
    // Vercel Function 로그에 수집되어 운영자가 사후 점검할 수 있다.
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit] failed to record event="${input.event}" uid="${input.uid}": ${message}`,
    );
  }
}
