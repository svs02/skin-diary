# Skin Diary — GCP 인프라 보안 강화 체크리스트

대상: 1인 운영자 (svs02po@gmail.com)
목적: Skin Diary Production GCP 프로젝트의 권한·감사·키 관리 표준화
실행 환경: GCP Console + 로컬 `gcloud` CLI
예상 소요: 약 3~4시간 (Section 1~7 순차 진행)

> 본 문서는 **순서대로** 진행해야 합니다. 특히 Section 2(개인계정 IAM 축소)는 Section 1·7이 검증된 이후에만 수행하세요. 그렇지 않으면 운영자 본인이 콘솔에서 락아웃될 수 있습니다.

---

## 0. 사전 준비

### 0.1 로컬 CLI 인증

```bash
# gcloud SDK 최신화
gcloud components update

# 운영자 본인 Google 계정으로 로그인
gcloud auth login

# 프로젝트 컨텍스트 설정 (실제 PROJECT_ID로 치환)
gcloud config set project skin-diary-prod

# 현재 컨텍스트 확인
gcloud config list
gcloud auth list
```

### 0.2 본 문서에서 사용하는 변수

| 변수 | 예시 값 | 설명 |
|---|---|---|
| `PROJECT_ID` | `skin-diary-prod` | GCP 프로젝트 ID |
| `PROJECT_NUMBER` | `123456789012` | 프로젝트 번호 (`gcloud projects describe $PROJECT_ID --format="value(projectNumber)"`) |
| `BUCKET_NAME` | `skin-diary-prod.appspot.com` | Firebase Storage 기본 버킷 |
| `OPERATOR_EMAIL` | `svs02po@gmail.com` | 운영자 본인 계정 |
| `GITHUB_REPO` | `DkrabbitLuke/skin_diary` | GitHub 저장소 |
| `REGION` | `asia-northeast3` | 기본 리전 (서울) |

이후 모든 명령에서 `$PROJECT_ID` 등은 실제 값으로 치환하세요.

### 0.3 필요한 API 활성화

```bash
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com \
  logging.googleapis.com \
  bigquery.googleapis.com \
  monitoring.googleapis.com \
  privilegedaccessmanager.googleapis.com \
  sts.googleapis.com \
  --project=$PROJECT_ID
```

### 다음 단계 확인

- [ ] `gcloud auth list`에서 운영자 본인 계정이 ACTIVE
- [ ] `gcloud config get-value project`가 `skin-diary-prod`
- [ ] 위 API 활성화 명령이 에러 없이 완료됨

---

## 1. 서비스 계정 분리 (목적별 최소권한 SA 2개)

기존에는 `firebase-adminsdk-*@PROJECT_ID.iam.gserviceaccount.com` 한 개의 SA가 Storage 전체 + Firestore 전체 권한을 보유합니다. 이를 **목적별로 분리**하여 키 유출 시 영향을 격리합니다.

### 1.1 `sa-signed-url` 생성 (Signed URL 발급 전용)

```bash
# SA 생성
gcloud iam service-accounts create sa-signed-url \
  --display-name="Signed URL Issuer (Storage read-only via signed URL)" \
  --description="Issues V4 signed URLs for /{uid}/{date}/{angle}.jpg only. No direct object access." \
  --project=$PROJECT_ID

# Self-impersonation (signBlob 호출에 필요)
gcloud iam service-accounts add-iam-policy-binding \
  sa-signed-url@${PROJECT_ID}.iam.gserviceaccount.com \
  --member="serviceAccount:sa-signed-url@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=$PROJECT_ID

# 버킷 read 권한 (객체 메타데이터 조회용 — 실제 다운로드는 signed URL 통과)
gcloud storage buckets add-iam-policy-binding gs://${BUCKET_NAME} \
  --member="serviceAccount:sa-signed-url@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"
```

### 1.2 `sa-user-deletion` 생성 (계정 삭제 시 객체 일괄 삭제 전용)

```bash
gcloud iam service-accounts create sa-user-deletion \
  --display-name="User Deletion Worker (prefix-scoped delete)" \
  --description="Deletes /{uid}/** when user requests account deletion. Firestore + Storage limited scope." \
  --project=$PROJECT_ID

# Storage 객체 관리 권한 (IAM Condition으로 prefix 제한)
# 주의: Condition 표현식이 길어 백슬래시 줄바꿈 사용
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sa-user-deletion@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" \
  --condition='expression=resource.name.startsWith("projects/_/buckets/'${BUCKET_NAME}'/objects/"),title=bucket-scoped,description=Only this bucket'

# Firestore 쓰기 권한
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sa-user-deletion@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### 1.3 기존 `firebase-adminsdk-*` SA에서 마이그레이션

현재 Vercel `FIREBASE_ADMIN_*` 환경변수가 기본 Admin SA를 가리킨다면, Section 7에서 새 SA 키로 교체합니다. **이 단계에서는 SA만 만들어두고 키는 아직 생성하지 마세요** — Section 7에서 안전하게 회전합니다.

### 1.4 권한 검증

```bash
# 두 SA가 존재하는지 확인
gcloud iam service-accounts list --project=$PROJECT_ID \
  --filter="email:(sa-signed-url OR sa-user-deletion)"

# sa-user-deletion에 부여된 Role 확인
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:sa-user-deletion@${PROJECT_ID}.iam.gserviceaccount.com" \
  --format="table(bindings.role,bindings.condition.expression)"
```

### 다음 단계 확인

- [ ] `sa-signed-url`, `sa-user-deletion` 모두 SA 목록에 나타남
- [ ] `sa-user-deletion`에 `roles/storage.objectAdmin` (Condition 포함), `roles/datastore.user` 부여됨
- [ ] **아직 키 JSON은 생성하지 않음** (Section 7에서 진행)

---

## 2. 운영자 개인계정 IAM 축소

> ⚠️ **경고: 이 단계는 Section 1과 Section 7이 완료되어 새 SA 키가 Vercel에서 정상 동작함이 검증된 이후에만 진행하세요.** 운영자 본인의 `roles/owner`를 잘못 제거하면 GCP 콘솔에서 락아웃됩니다.

### 2.1 현재 운영자 권한 목록 확인

```bash
gcloud projects get-iam-policy $PROJECT_ID \
  --format=json \
  --flatten='bindings' \
  --filter="bindings.members:user:${OPERATOR_EMAIL}" \
  | jq '.[] | {role: .bindings.role, condition: .bindings.condition}'
```

출력에서 다음 Role이 있는지 확인:
- `roles/owner` — **유지 권장** (1인 운영자 락아웃 방지)
- `roles/editor` — 광범위, 가능하면 제거
- `roles/storage.admin` — 제거 (PAM grant로 임시 부여)
- `roles/datastore.owner` — 제거 (필요 시 PAM)

### 2.2 권장 운영 정책 (1인 운영자 현실)

전제: **Owner는 유지하되, Storage·Firestore 데이터 직접 접근은 PAM grant로만 임시 부여**하는 정책을 채택.

이유:
- 완전한 Owner 제거는 break-glass 계정 없이 위험
- Owner 권한 자체는 감사 로그에 기록되므로 사용 추적 가능
- Storage/Firestore 직접 read를 PAM 경유로 제한하면 데이터 사고 영향 최소화

### 2.3 평시 추가 Role 부여 (읽기 중심)

```bash
# Firebase Console 조회
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/firebase.viewer"

# 로그 조회
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/logging.viewer"

# 모니터링 조회
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/monitoring.viewer"

# SA 키 회전을 위한 권한 (Section 7에서 사용)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/iam.serviceAccountKeyAdmin"
```

### 2.4 광범위 Role 제거 (선택적, 신중하게)

> ⚠️ **위험 명령**: 아래는 `roles/editor`가 부여되어 있는 경우의 예시입니다. **`roles/owner`는 제거하지 마세요.**

```bash
# Editor 제거 (Owner 보유 중이라면 안전)
gcloud projects remove-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/editor"

# Storage Admin 직접 부여 제거 (PAM grant로 대체)
gcloud projects remove-iam-policy-binding $PROJECT_ID \
  --member="user:${OPERATOR_EMAIL}" \
  --role="roles/storage.admin"
```

### 다음 단계 확인

- [ ] `roles/owner`는 유지됨 (락아웃 방지)
- [ ] `roles/firebase.viewer`, `roles/logging.viewer`, `roles/monitoring.viewer`, `roles/iam.serviceAccountKeyAdmin` 부여됨
- [ ] Console에서 Firebase 대시보드 정상 조회 가능

---

## 3. Audit Log 활성화

기본적으로 GCP는 Admin Activity 로그만 자동 수집합니다. **Data Access 로그**(객체 read, document read)는 명시적으로 켜야 합니다.

### 3.1 Console 경로 (권장)

1. GCP Console → **IAM & Admin** → **Audit Logs**
2. 서비스 필터에 `Cloud Storage` 입력 → 행 선택
3. 우측 패널에서 다음 체크박스 활성화:
   - `Admin Read`
   - `Data Read`
   - `Data Write`
4. **SAVE** 클릭
5. 같은 방식으로 `Cloud Firestore` 서비스도 동일하게 설정

### 3.2 BigQuery Log Sink 생성

```bash
# 1. 데이터셋 생성 (위치는 멀티리전 권장)
bq --location=asia-northeast3 mk \
  --dataset \
  --default_table_expiration=7776000 \
  --description="Audit logs (90 day retention)" \
  ${PROJECT_ID}:audit_logs

# default_table_expiration=7776000초 = 90일 자동 만료

# 2. 로그 싱크 생성
gcloud logging sinks create audit_logs_sink \
  bigquery.googleapis.com/projects/${PROJECT_ID}/datasets/audit_logs \
  --log-filter='protoPayload.@type="type.googleapis.com/google.cloud.audit.AuditLog" AND (resource.type="gcs_bucket" OR resource.type="audited_resource" OR resource.type="firestore_database")' \
  --project=$PROJECT_ID

# 3. 싱크가 사용하는 writer SA에 BigQuery 권한 부여
SINK_WRITER=$(gcloud logging sinks describe audit_logs_sink \
  --project=$PROJECT_ID --format="value(writerIdentity)")
echo "Sink writer: $SINK_WRITER"

bq add-iam-policy-binding \
  --member="$SINK_WRITER" \
  --role="roles/bigquery.dataEditor" \
  ${PROJECT_ID}:audit_logs
```

### 3.3 검증 쿼리 (BigQuery 콘솔에서 실행)

```sql
-- 최근 1시간 Storage read 이벤트
SELECT
  timestamp,
  protopayload_auditlog.authenticationInfo.principalEmail AS who,
  protopayload_auditlog.methodName AS method,
  protopayload_auditlog.resourceName AS resource
FROM `PROJECT_ID.audit_logs.cloudaudit_googleapis_com_data_access`
WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
ORDER BY timestamp DESC
LIMIT 50;
```

(테이블이 처음 생성되기까지 최대 10분 소요)

### 다음 단계 확인

- [ ] IAM & Admin → Audit Logs에서 Storage·Firestore의 Data Read/Write 체크박스 표시됨
- [ ] BigQuery `audit_logs` 데이터셋 존재
- [ ] 10~30분 후 `cloudaudit_googleapis_com_data_access` 테이블 자동 생성됨
- [ ] 위 검증 쿼리에서 본인 콘솔 접속 로그가 나타남

---

## 4. Privileged Access Manager (PAM) 설정

PAM은 평시 권한이 없는 운영자가 사고·디버깅 시 **시간 제한·기록 남는 방식으로 권한을 셀프 승인**받게 합니다.

### 4.1 Entitlement 생성 (Console)

1. Console → **Security** → **Privileged Access Manager** → **Entitlements**
2. **CREATE ENTITLEMENT** 클릭
3. 설정값:
   - **Name**: `emergency-storage-read`
   - **Scope**: Project = `$PROJECT_ID`
   - **Eligible principals**: User → `$OPERATOR_EMAIL`
   - **Roles**:
     - `roles/storage.objectViewer`
     - IAM Condition (Add): `resource.name.startsWith("projects/_/buckets/${BUCKET_NAME}/objects/")`
   - **Maximum request duration**: `2 hours`
   - **Justification required**: ON
   - **Approval workflow**: `Self-approval` (1인 운영자)
   - **MFA required**: ON
4. **CREATE** 클릭

### 4.2 Firestore용 Entitlement (별도 생성)

같은 절차로 한 번 더:
- **Name**: `emergency-firestore-read`
- **Roles**: `roles/datastore.viewer`
- **Maximum duration**: `2 hours`

### 4.3 사용 방법 (사고 시)

1. Console → PAM → **Grants** → `MY GRANTS` → `REQUEST ACCESS`
2. Entitlement 선택 → Justification 입력 (예: "user report incident #42 investigation")
3. Duration 선택 → SUBMIT
4. 자동 승인됨 → 해당 시간 동안만 Storage read 가능
5. 만료 후 자동 회수 — 별도 작업 불필요

### 다음 단계 확인

- [ ] 두 Entitlement 모두 Entitlements 목록에 STATE=AVAILABLE
- [ ] 테스트로 한 번 grant 요청 → 2시간 짧게 받아보기 → 만료 확인
- [ ] BigQuery audit_logs에서 grant 사용 기록 확인

---

## 5. Workload Identity Federation (GitHub Actions)

현재 `.github/workflows/firebase-rules.yml`이 SA 키 JSON을 GitHub Secrets에 저장 중이라면, **장기 키 = 유출 위험**입니다. WIF로 마이그레이션하여 단기 토큰만 사용합니다.

### 5.1 Workload Identity Pool 생성

```bash
# Pool 생성
gcloud iam workload-identity-pools create "github-pool" \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub Actions Pool"

# Pool ID 저장
WIF_POOL_ID=$(gcloud iam workload-identity-pools describe "github-pool" \
  --project=$PROJECT_ID \
  --location="global" \
  --format="value(name)")
echo "Pool ID: $WIF_POOL_ID"
```

### 5.2 OIDC Provider 생성 (GitHub 한정, repo·ref 조건)

```bash
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

### 5.3 배포용 SA 생성 + WIF 연결

```bash
# 배포 전용 SA
gcloud iam service-accounts create sa-github-deploy \
  --display-name="GitHub Actions Deployer (rules deploy)" \
  --project=$PROJECT_ID

# Firebase Rules 배포 권한
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sa-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/firebaserules.admin"

# WIF로 이 SA를 impersonate할 수 있도록 허용
gcloud iam service-accounts add-iam-policy-binding \
  sa-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WIF_POOL_ID}/attribute.repository/${GITHUB_REPO}"
```

### 5.4 GitHub Actions 워크플로우 수정

`.github/workflows/firebase-rules.yml`을 다음과 같이 수정:

```yaml
permissions:
  id-token: write  # OIDC 토큰 발급에 필수
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/providers/github-provider
          service_account: sa-github-deploy@PROJECT_ID.iam.gserviceaccount.com

      - uses: w9jds/firebase-action@master
        with:
          args: deploy --only firestore:rules,storage
```

`PROJECT_NUMBER`, `PROJECT_ID`는 실제 값으로 치환.

### 5.5 GitHub Secrets 정리

1. GitHub 저장소 → Settings → Secrets and variables → Actions
2. 기존 `FIREBASE_SERVICE_ACCOUNT` 또는 `GCP_SA_KEY` 등의 SA 키 JSON Secret을 **DELETE**
3. WIF는 별도 Secret이 필요 없음 (워크플로우 파일에 평문 가능)

### 다음 단계 확인

- [ ] PR을 만들어 firebase-rules 워크플로우가 WIF로 통과
- [ ] GitHub Secrets에서 SA 키 JSON 제거됨
- [ ] BigQuery audit_logs에서 `sa-github-deploy` impersonation 기록 확인

---

## 6. Monitoring & Alerts

비정상 접근을 감지하기 위해 Log-based Metric + Alert Policy를 설정합니다.

### 6.1 알람 A: Signed URL SA 비정상 발급 (분당 50개 초과 distinct uid)

#### 6.1.1 Log-based Metric 생성

1. Console → **Logging** → **Logs-based Metrics** → **CREATE METRIC**
2. **Counter** 선택
3. 설정값:
   - **Name**: `signed_url_issuances`
   - **Filter**:
     ```
     protoPayload.serviceName="iamcredentials.googleapis.com"
     protoPayload.methodName="SignBlob"
     protoPayload.authenticationInfo.principalEmail="sa-signed-url@PROJECT_ID.iam.gserviceaccount.com"
     ```
   - **Labels**: 추가
     - `uid_prefix` = `EXTRACT(protoPayload.request.payload)` (또는 가능하면 resource path에서 추출하는 정규식)
4. **CREATE METRIC**

#### 6.1.2 Alert Policy 생성

1. Console → **Monitoring** → **Alerting** → **CREATE POLICY**
2. **Add condition**:
   - Metric: `logging.googleapis.com/user/signed_url_issuances`
   - Aggregation: `count` over `1 minute`
   - Threshold: `> 50`
3. **Notification channels**: 운영자 이메일 추가
4. **Policy name**: `signed-url-burst`
5. SAVE

### 6.2 알람 B: 운영자 개인계정의 직접 Storage 접근 (PAM 미경유)

#### 6.2.1 Log-based Metric 생성

1. Logging → Logs-based Metrics → CREATE METRIC
2. 설정값:
   - **Name**: `operator_direct_storage_access`
   - **Filter**:
     ```
     protoPayload.serviceName="storage.googleapis.com"
     (protoPayload.methodName="storage.objects.get" OR protoPayload.methodName="storage.objects.list")
     protoPayload.authenticationInfo.principalEmail="svs02po@gmail.com"
     NOT protoPayload.authorizationInfo.granted="false"
     ```
   - 주의: PAM grant 중에는 principal에 변동이 없으므로, 운영자가 평소 PAM 없이는 권한이 없어야 이 Metric이 의미를 가짐 (Section 2 완료 후)
3. CREATE METRIC

#### 6.2.2 Alert Policy 생성

1. Monitoring → Alerting → CREATE POLICY
2. Metric: `logging.googleapis.com/user/operator_direct_storage_access`
3. Threshold: `>= 1` (한 번이라도 발생 시 즉시 알림)
4. Notification channels: 운영자 이메일
5. **Policy name**: `operator-unexpected-access`
6. SAVE

### 6.3 알림 채널 등록

Console → Monitoring → Alerting → **Notification channels** → **ADD NEW**
- Type: Email
- Address: `$OPERATOR_EMAIL`
- **TEST** 버튼으로 수신 검증

### 다음 단계 확인

- [ ] 두 Log-based Metric 생성됨 (1시간 후 데이터 누적 확인)
- [ ] 두 Alert Policy 생성·활성화됨
- [ ] 알림 채널 테스트 메일 수신됨

---

## 7. Vercel 환경변수 교체 (SA 키 회전 절차)

> ⚠️ **이 단계는 평일 트래픽 낮은 시간대에 진행. 5번 검증을 반드시 통과한 후 8번 구 키 삭제로 넘어가세요.**

### 7.1 새 SA 키 생성 (Console)

1. Console → IAM & Admin → **Service Accounts** → `sa-signed-url@...`
2. **KEYS** 탭 → **ADD KEY** → **Create new key** → JSON
3. 다운로드 즉시 안전한 위치(예: 1Password)에 보관
4. 다운로드한 JSON 파일은 **절대 git에 커밋하지 말 것** (`.gitignore`에 이미 포함되어 있는지 확인)

### 7.2 Vercel 환경변수 추가 (기존 값을 덮어쓰기 전, 별도 키로 먼저 검증)

```bash
# Vercel CLI 인증
vercel login

# 프로젝트 디렉토리에서
cd /Users/admin/Desktop/PP/skin_diary

# 새 키를 production에 추가 (sensitive)
vercel env add FIREBASE_ADMIN_PRIVATE_KEY production
# → 프롬프트에 JSON의 private_key 값 붙여넣기 (개행은 \n 문자로 유지)

vercel env add FIREBASE_ADMIN_CLIENT_EMAIL production
# → sa-signed-url@PROJECT_ID.iam.gserviceaccount.com

vercel env add FIREBASE_ADMIN_PROJECT_ID production
# → skin-diary-prod
```

### 7.3 재배포 및 검증

```bash
# Production 재배포
vercel --prod
```

검증:
- [ ] 운영자 본인 계정으로 로그인 → 오늘 사진 업로드 정상
- [ ] 어제 사진 조회 정상 (Signed URL 발급 동작)
- [ ] Vercel Function Logs에 `permission denied` 없음
- [ ] BigQuery audit_logs에 `sa-signed-url`의 `SignBlob` 호출 기록됨

### 7.4 24시간 모니터링 후 구 SA 키 삭제

24시간 동안 에러 없음을 확인한 후:

1. Console → IAM & Admin → Service Accounts → 구 `firebase-adminsdk-*` SA
2. KEYS 탭 → 사용 중이던 키 옆 점 3개 → **Delete key**
3. 확인

### 7.5 회전 주기

- **90일마다** 위 절차 반복
- Google Calendar 또는 작업 관리 도구에 반복 일정 등록 권장
- 차회 회전 예정일: 본 작업일 + 90일

### 다음 단계 확인

- [ ] Vercel Production 배포 정상
- [ ] 사진 업로드·조회 24시간 안정 동작
- [ ] 구 키 삭제 완료
- [ ] 90일 후 회전 일정이 캘린더에 등록됨

---

## 8. 검증 체크리스트 (전체 작업 완료 후)

다음 5개 시나리오가 **모두 통과**해야 본 체크리스트 완료입니다.

### 8.1 평시 직접 접근 차단

1. Console → Storage Browser → `gs://${BUCKET_NAME}` → 임의 객체 클릭
2. **Authenticated URL** 다운로드 시도
3. 기대 결과: **403 Forbidden 또는 권한 없음 메시지**

### 8.2 PAM 임시 권한 부여

1. PAM → MY GRANTS → REQUEST ACCESS → `emergency-storage-read` → Justification 입력 → 2시간 요청
2. 자동 승인 후 다시 8.1 시도 → **성공 (다운로드 가능)**
3. 2시간 후 또는 grant 회수 후 다시 시도 → **403 복귀**

### 8.3 감사 로그 기록 확인

BigQuery에서 다음 쿼리 실행:

```sql
SELECT
  timestamp,
  protopayload_auditlog.authenticationInfo.principalEmail AS who,
  protopayload_auditlog.methodName AS method,
  protopayload_auditlog.resourceName AS resource
FROM `PROJECT_ID.audit_logs.cloudaudit_googleapis_com_data_access`
WHERE protopayload_auditlog.authenticationInfo.principalEmail = "svs02po@gmail.com"
  AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR)
ORDER BY timestamp DESC;
```

기대 결과: 8.1·8.2의 행위 모두 행으로 기록됨

### 8.4 Production 서비스 정상

- [ ] 운영자 본인 앱 로그인 → 오늘 사진 업로드 성공
- [ ] 과거 날짜 사진 조회 성공
- [ ] 계정 삭제 시뮬레이션(테스트 계정으로) → `/{uid}/**` 객체·문서 모두 삭제

### 8.5 알람 동작 테스트

- 알림 채널 TEST 버튼 → 메일 수신
- (선택) 일부러 Signed URL을 1분 내 50개 이상 발급 → `signed-url-burst` 알람 발송 확인

---

## 9. 비용 영향

| 항목 | 월 예상 비용 (USD) | 비고 |
|---|---|---|
| Cloud Audit Logs (Admin Activity) | $0 | 무료 |
| Cloud Audit Logs (Data Access) | ~$0 | Skin Diary 트래픽 규모에서 미미 |
| BigQuery Log Sink 저장 | ~$0.10 | 90일 보관 + 압축 |
| BigQuery 쿼리 | ~$0 | 운영자 본인 ad-hoc 조회 위주, 1TB 무료 |
| Privileged Access Manager | $0 | GA·무료 |
| Workload Identity Federation | $0 | 무료 |
| Cloud Monitoring | $0 | 150 MiB/월 무료 |
| **합계** | **~$0 ~ $2 / 월** | |

비용 알림: GCP Console → Billing → Budgets & alerts에서 `$5/월` 임계치로 알림 권장.

---

## 10. 완료 후 정기 작업

| 주기 | 작업 |
|---|---|
| 매일 | (자동) 알람 메일 수신 확인 |
| 매주 | BigQuery audit_logs에서 `who`별 distinct method 요약 쿼리 1회 |
| 매월 | PAM Entitlement 사용 이력 검토 |
| 90일 | SA 키 회전 (Section 7) |
| 6개월 | IAM 권한 전체 재확인 (`gcloud projects get-iam-policy`) |
| 1년 | 본 체크리스트 전체 재검토 — 운영 규모 변화에 따라 자동화·외부 키 관리(KMS, Secret Manager) 도입 검토 |

---

문서 버전: v1.0 (2026-05-15)
다음 리뷰 예정: 2026-08-13 (90일 후)
