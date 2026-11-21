# B 질문지 API와 데모 DB 계약

보호자 로그인 세션과 Supabase 질문지를 연결하는 시연용 API입니다. 질문 정의는 DB에서 동적으로 조회하므로 활성 질문이 추가되면 화면의 질문 수와 진행률도 함께 늘어납니다.

## 화면 흐름

1. `/` 또는 `/a/`에서 보호자 계정으로 로그인합니다.
2. 보호자 하단 탭의 `설명서`를 엽니다.
3. 서버가 로그인 세션의 `care_recipient_id`를 확인합니다.
4. 질문·선택지와 기존 답변을 불러옵니다.
5. 마지막 질문에서 답변을 저장합니다.

브라우저는 `care_recipient_id`를 저장 요청에 넣지 않습니다. 서버가 HttpOnly 세션 쿠키로 로그인 보호자의 돌봄 대상을 결정합니다.

## API

| 메서드·경로 | 용도 | 로그인 |
| --- | --- | --- |
| `GET /api/questionnaire` | 활성 질문과 선택지 조회 | 공개 시연 조회 |
| `GET /api/questionnaire/answers` | 현재 보호자 대상의 기존 답변 조회 | 보호자 필요 |
| `PUT /api/questionnaire/answers` | 현재 보호자 대상의 전체 답변 저장 | 보호자 필요 |

저장 요청 형식:

```json
{
  "answers": [
    {
      "question_id": "q-health-safety",
      "answer_text": "아침 약은 요거트에 섞으면 잘 먹어요.",
      "option_ids": ["opt-morning", "opt-mix-food"]
    }
  ]
}
```

## Supabase 테이블

- `dolbom_demo.questionnaire_question`
- `dolbom_demo.questionnaire_option`
- `dolbom_demo.questionnaire_answer`
- `dolbom_demo.questionnaire_answer_option`

답변은 `care_recipient_id uuid + question_id text` 조합으로 한 건만 유지합니다. 선택지는 답변을 다시 저장할 때 기존 연결을 지운 뒤 현재 선택값으로 교체합니다.

## 데모 한계

- 로그인과 사용자·돌봄 대상 데이터는 서버 메모리의 합성 데이터입니다.
- 답변 테이블 정책은 `anon`, `authenticated` 역할에 전체 접근을 허용하는 해커톤 데모용입니다.
- 실제 개인정보를 저장하지 않습니다.
- 운영 환경에서는 Supabase Auth 사용자와 돌봄 대상의 소유 관계를 RLS에서 검증해야 합니다.
