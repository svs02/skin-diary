#!/usr/bin/env bash
set -euo pipefail

ROUTING="$(cd "$(dirname "$0")/.." && pwd)/agent-routing.md"
[ -f "$ROUTING" ] || exit 0

cat <<EOF
<system-reminder>
사용자의 이번 요청을 분석해 아래 라우팅 표에서 일치하는 트리거를 찾고, 해당 에이전트를 Agent 도구로 호출하라. 병렬 호출 후보가 둘 이상이면 **한 어시스턴트 메시지 안에 여러 Agent 호출을 묶어 동시 실행**한다. 호출하지 않을 거면 자기검열 규칙에 따라 응답 첫 줄에 사유를 명시하라.

$(cat "$ROUTING")
</system-reminder>
EOF
