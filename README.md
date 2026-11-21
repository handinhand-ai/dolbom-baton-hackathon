# 돌봄바통 — 해커톤 시작본

발달장애인 긴급돌봄 상황에서 보호자가 확인한 돌봄 경험을 필요한 돌봄자에게 전달하는 서비스의 **개발 시작본**입니다.

## 현재 포함된 범위

- Node.js 22 기반 개발용 HTTP 서버 및 `GET /api/health`
- 한국어 기본 웹 화면과 공통 응답 스키마
- 기본 문법 검사 및 HTTP 테스트
- 개발 에이전트·GitHub 협업 안내와 작업 템플릿
- 서비스 기획 개요와 기술 스택 검토 문서

기본 시작본과 C의 보호자·종사자 기록 시연을 포함합니다. 실제 구현·계약·테스트 범위는 작업별 PR에서 검토합니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. 이 시작본의 기본 서버는 외부 런타임 패키지가 필요하지 않습니다.

```powershell
npm run dev
```

브라우저에서 `http://127.0.0.1:3000`에 접속하면 돌봄바통 시연 홈이 열립니다. 종료는 `Ctrl+C`입니다. 기본 시작 화면을 확인하려면 `npm start`를 실행합니다.

## C 기록과 설명서 연결 시연

`npm run dev`로 실행한 서버에서 `/`와 `/c-demo` 모두 시연 홈으로 연결됩니다. 다른 포트에서 실행하려면 `PORT`를 지정합니다.

1. 홈에서 바로 시작합니다. **마이페이지 → 역할 바꾸기**에서 보호자나 종사자 화면으로 이동할 수 있습니다. 보호자는 **글로 기록하기**로 설명서 후보를 저장하고, **아이 맡기기**에서 종사자에게 질문을 보냅니다.
2. 홈의 마이크를 눌러 녹음하고 한 번 더 눌러 끝냅니다. 받아쓴 질문으로 설문을 조회하며, 문장을 고쳐서 다시 검색할 수 있습니다.
3. 종사자는 **돌봄 일지 → 기록 남기기**에서 ‘드라이기를 약하게 트니 괜찮았어요’를 기록하고, 저장된 일지에서 **보호자께 보내기**를 누릅니다. 보호자는 **돌봄 카드 → 설명서 후보**에서 해당 후보를 봅니다.

탭은 보호자 **홈 / 돌봄 카드 / 아이 맡기기 / 마이페이지**, 종사자 **홈 / 돌봄 카드 / 돌봄 일지 / 마이페이지**입니다. 현재 시연에서 아이 맡기기는 배정 종사자에게 질문하는 흐름을 제공하며, 본인 인증·온보딩·센터 신청과 설명서 승인 화면은 별도 파트의 연결이 필요합니다.

시연 역할은 마이페이지에서 바꿉니다. 프로필 표시 이름, 캐릭터 배경과 글자 크기는 브라우저에 저장되며, **기록 백업하기**는 현재 역할과 대상의 기록·질문을 JSON 파일로 내려받습니다.

### 음성 질문과 Supabase 돌봄 카드

서버의 `.env.local`에 `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 오디오는 메모리에서만 처리하고, 서버가 OpenAI 음성 변환에 전달합니다. 화면에서 재생할 수 있는 녹음은 탭의 임시 데이터입니다.

질문과 돌봄 카드는 `dolbom_demo.questionnaire_answer`와 `questionnaire_answer_option`을 읽고, 질문·선택지 정의에서 표시할 문구를 가져옵니다. 카드를 열거나 화면으로 돌아오면 조회하고, 열어 둔 동안 5초마다 갱신합니다. 민준은 A·B 통합 브랜치에서 확인된 설문 UUID를 사용합니다. 이서진 시연 대상은 실제 매핑을 확인한 후 `C_QUESTIONNAIRE_RECIPIENT_GUARDIAN_2`에 지정합니다.

| 경로 | 요청 및 동작 |
| --- | --- |
| `POST /api/ai/structure` | `{ care_recipient_id, text }`를 분류합니다. 결과의 `source_text`는 원문의 일부입니다. 종사자 제안은 공유된 확정 설명서 항목과 비교합니다. |
| `POST /api/ai/transcribe` | WebM, MP4, Ogg 또는 WAV 녹음의 본문을 받아 한국어 질문을 텍스트로 반환합니다. |
| `GET /api/c/manual` | 현재 돌봄 대상의 확정 항목을 반환합니다. 종사자에게는 활성 배정 범위 안에서 공유된 카테고리만 반환합니다. |
| `GET /api/c/records` | 카테고리 7개, 현재 역할·대상 ID, 해당 보호자 또는 종사자 자신의 배정 기록을 반환합니다. |
| `POST /api/c/records` | `{ care_recipient_id, source_text, items: [{ text, source_text, category, importance }] }`를 검증합니다. 바깥쪽 `source_text`는 입력 전체입니다. 항목별 근거는 입력의 일부여야 하며 생략하면 입력 전체를 씁니다. UUID `Idempotency-Key`로 재시도를 식별합니다. |
| `POST /api/ai/ask` | `{ care_recipient_id, question }`을 받아 공유된 확정 항목의 원문과 근거 ID·카테고리·날짜를 반환합니다. 해당 근거가 없으면 `no_record`입니다. |
| `POST /api/c/handbacks` | `{ care_recipient_id, record_id }`의 종사자 기록을 B 후보로 보냅니다. |

### 보호자가 종사자에게 공통 질문 보내기

1. **보호자** 역할을 고른 뒤 **보호자 선택**에서 김지현 또는 이서진을 선택합니다. **종사자에게 질문하기**에서 질문을 보내면 해당 돌봄 대상에 배정된 시연 종사자에게 전달됩니다.
2. **종사자** 역할로 바꾸고 **배정된 돌봄 대상**을 확인한 뒤 **보호자가 보낸 질문**에서 답변을 보냅니다.
3. 보호자로 돌아가면 이름별 답변과 완료 인원이 나타납니다. 역할을 바꾸지 않은 상태에서는 **목록 새로고침**으로 최신 답변을 볼 수 있습니다.

`GET /api/c/questions`는 현재 역할이 볼 수 있는 질문과 답변을 조회합니다. `POST /api/c/questions`는 보호자의 `{ care_recipient_id, text }`와 UUID `Idempotency-Key`를 받아 활성 배정 종사자당 한 건씩 전달합니다. `POST /api/c/question-replies`는 종사자의 `{ care_recipient_id, question_id, text }`를 본인 배정에 한 건만 기록합니다.

실제 A·D 모듈에 붙일 때는 `createApp({ careQuestions: createCareQuestions({ getSession, listAssignments }) })`를 사용합니다. `listAssignments(session, care_recipient_id)`는 D의 배정 ID·기간·상태·대상 ID·종사자 ID 및 조회에 사용할 `caregiver_name`을 제공합니다. 질문과 답변은 지금 서버 메모리에 저장됩니다. 아래 Postgres 옵션은 C 확인 기록에 적용됩니다.

### A·B·D 서버 연결

`createApp({ careRecords: createCareRecords({ getSession, getAssignment, listConfirmedItems, createManualCandidates }) })`에 실제 모듈을 연결합니다.

- A의 `getSession(request)`은 요청의 인증을 확인하고 `{ user_id, role, care_recipient_id }`를 반환합니다. 보호자 대상은 A가 소유권을 확인한 값이어야 합니다.
- D의 `getAssignment(session, care_recipient_id)`은 `care_assignments` 행에 연결 신청의 `shared_categories`를 합쳐 반환합니다. C도 종사자·대상·상태·기간을 확인합니다.
- B의 `listConfirmedItems(care_recipient_id, session)`은 항목의 ID·대상·상태·카테고리·문장·`last_updated`를 제공합니다. C는 대상과 공유 카테고리 및 확정 상태를 다시 검사합니다.
- B의 `createManualCandidates(session, items)`는 C가 전달한 UUID를 사용해 같은 요청을 중복 적재하지 않아야 합니다. `display_order`, `last_updated`와 이후 확정 상태는 B가 관리합니다.

시연 역할 전환과 후보 목록 경로는 시연 모드에서 열립니다. `npm run dev`에서 기본으로 활성화되며, `npm start`에서는 `C_RECORDS_DEMO=1`로 활성화할 수 있습니다. 기본 저장소는 메모리입니다. 실제 A·B·D 모듈은 별도로 연결해야 합니다.

### 기존 Supabase 프로젝트에서 C 기록 저장

1. 승인 후 프로젝트의 SQL Editor에서 `supabase/migrations/20261121_care_records.sql`을 실행합니다. 이 파일은 `public.care_records`만 생성합니다.
2. Supabase **Connect → Session pooler**에서 Postgres 접속 문자열을 받아 이 저장소에서 Git이 무시하는 `.env.local`에 `DATABASE_URL`로 저장합니다. DB 비밀번호는 브라우저 설정이나 채팅에 넣지 않습니다.
3. `npm ci` 후 macOS에서 아래처럼 실행하고 `http://127.0.0.1:3003/c-demo`를 엽니다.

```bash
C_RECORDS_DEMO=1 C_RECORDS_STORAGE=postgres PORT=3003 node --env-file=.env.local --watch apps/api/src/index.mjs
```

서버는 시작할 때 테이블과 열의 접근을 확인합니다. 이 모드에서는 보호자와 종사자의 확인 기록 및 전송 상태만 Postgres에 남습니다. 역할·배정 및 B의 후보 목록은 여전히 로컬 시연용이며, 질의응답 이력은 저장하지 않습니다. 합성 데이터만 사용합니다.

## 검증

```powershell
npm run check
npm test
```

실행 여부와 결과는 별도로 기록합니다. 현재 사용자가 확인할 실제 테스트 결과가 없는 경우, 테스트가 통과했다고 가정하지 않습니다.

## 폴더 구조

| 경로 | 용도 |
| --- | --- |
| `apps/api/src/` | 개발용 기본 HTTP 서버 |
| `apps/web/public/` | 기본 안내 웹 화면 |
| `packages/contracts/` | 공통 상태 확인 스키마 |
| `scripts/` | 문법 검사 |
| `tests/` | 기본 HTTP 테스트 |
| `docs/planning/` | 기획·기술 스택의 검토용 요약 |
| `AGENTS.md` | 공통 개발·협업 규칙 |
| `CLAUDE.md` | Claude용 공통 규칙 진입점 |

## 협업 원칙

모든 팀원과 팀장에게 `feature/* → Push → PR → 팀장 검토 → main`을 적용합니다. 세부 작업 하나당 독립 브랜치·PR을 만들고, 첫 유의미한 Push 직후 PR을 생성합니다. 미완료 작업은 Draft PR로 유지합니다. PR·CI 및 테스트 결과를 검토한 후 팀장이 최종 병합합니다. 이 규칙은 GitHub 권한 제어와 별개이며, 새 저장소에서 실제 보호 설정을 확인해야 합니다.

## 개인정보 및 AI

실제 돌봄 기록·음성·연락처·자격 증명은 이 시작본에 포함하지 않습니다. 시연에는 합성 데이터만 사용합니다. AI는 보호자가 확인한 사실과 공유 권한 범위 안에서 동작해야 하며, 의료 판단을 생성하지 않도록 별도 검증이 필요합니다.

## 배포

이 시작본은 해커톤 GitHub 저장소에서 관리합니다. 운영 배포는 아직 수행하지 않았으며, 배포 대상과 유료 API 사용은 별도의 검토·승인을 거쳐 결정합니다.

푸시 테스트
