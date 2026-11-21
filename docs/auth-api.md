# A 인증·세션 API (시연용)

로그인·로그아웃·로그인 상태 조회·역할 확인 API입니다. 화면은 포함하지 않습니다. 저장소는 서버 메모리이며 서버를 다시 시작하면 모든 세션이 사라집니다. 계정과 값은 모두 합성 시연 데이터입니다.

## 공통 규칙

- 성공 응답은 `{ "data": … }`, 실패 응답은 `{ "error": "한국어 메시지" }`입니다(D의 `/api/care/*`와 같은 형식).
- 세션은 **HttpOnly 쿠키** `baton_session`(SameSite=Strict, 8시간, HTTPS 프록시 뒤에서는 Secure)입니다. 화면 코드가 토큰을 직접 다루지 않으며, 같은 출처의 `fetch`는 쿠키를 자동으로 보냅니다. 새로고침해도 유지됩니다.
- `POST`는 같은 출처에서 보낸 요청만 받습니다(다른 출처의 `Origin`은 403). 본문은 `Content-Type: application/json`, 최대 2KB입니다.
- 로그인 실패가 1분에 10회를 넘으면 429를 돌려줍니다.
- 로그인 세션이 있으면 `/api/care/*`도 그 사용자로 처리합니다. 세션이 없을 때만 기존 `X-Demo-User` 헤더를 받습니다(D 화면·테스트 호환용이며 이후 제거 대상).

## 시연 계정

모든 비밀번호는 `demo-1234`입니다. `user_id`는 D의 시연 사용자와 같습니다.

| 아이디 | 역할 | 이름 | 소속 |
| --- | --- | --- | --- |
| `guardian` | `guardian` | 시연 보호자 | – |
| `caregiver` | `caregiver` | 김지현 | 시연용 동남권 긴급돌봄센터 |
| `center` | `center_admin` | 동남권 센터 관리자 | 시연용 동남권 긴급돌봄센터 |
| `caregiver-sos` | `caregiver` | 박서준 | 시연용 돌봄SOS센터 |
| `center-sos` | `center_admin` | 돌봄SOS 센터 관리자 | 시연용 돌봄SOS센터 |

## API

| 메서드·경로 | 용도 | 성공 | 실패 |
| --- | --- | --- | --- |
| `GET /api/auth/demo-accounts` | 로그인 화면 미리 채우기용 시연 계정 목록 | 200 | 404(`AUTH_EXPOSE_DEMO_ACCOUNTS=off`일 때) |
| `POST /api/auth/login` | 로그인, 쿠키 발급 | 200 | 400 형식 오류 · 401 계정 불일치 · 403 다른 출처 · 413 · 429 |
| `GET /api/auth/session` | 로그인 상태·역할·돌봄 대상 조회 | 200 | 401 로그인 필요 |
| `GET /api/auth/check-role?roles=guardian,caregiver` | 역할 확인(화면 접근 제어) | 200 | 400 roles 오류 · 401 · 403 역할 다름 |
| `POST /api/auth/signup` | 회원가입(보호자·돌봄 선생님), 가입 즉시 로그인 | 201 | 400 입력 오류(`field` 포함) · 403 · 409 이미 가입한 전화번호 · 413 · 429 · 503 |
| `POST /api/auth/recipient` | 가입한 보호자의 돌봄 대상 이름 저장(온보딩 1/4) | 200 | 400 · 401 · 403 보호자 아님·시연 계정 |
| `POST /api/auth/logout` | 서버 세션 삭제, 쿠키 제거 | 200(로그인 안 했어도 200) | 403 다른 출처 |

허용하지 않은 메서드는 405와 `Allow` 헤더, 없는 경로는 404입니다.

### 로그인 흐름과 회원가입 흐름

- **로그인:** 아이디(전화번호 또는 시연 아이디)와 비밀번호로 `POST /api/auth/login` → 역할별 홈. 기존 계정은 온보딩을 거치지 않습니다.
- **회원가입:** `POST /api/auth/signup` → 쿠키 발급(가입 즉시 로그인) → 보호자는 온보딩(아이 기본 정보 → 증명사진 → 캐릭터 → 질문지), 돌봄 선생님은 홈. 온보딩 입력값은 이 기기에만 저장하고, 서버에는 `POST /api/auth/recipient`로 돌봄 대상 이름만 보냅니다.

### 회원가입 요청

```http
POST /api/auth/signup
Content-Type: application/json

{ "role": "guardian", "display_name": "가상보호자", "phone": "010-0000-0001", "password": "8자 이상", "agree": true }
```

- `role`: `guardian` 또는 `caregiver`(센터 관리자는 가입할 수 없습니다).
- 돌봄 선생님은 `center_id`(`GET /api/care/centers`의 id)와 `caregiver_type`(긴급돌봄센터 종사자·돌봄SOS 매니저·활동지원사·특수학교 선생님·민간돌봄 봉사자·기타)을 함께 보냅니다.
- 전화번호는 숫자만 남겨 아이디로 씁니다(`010-0000-0001`과 `01000000001`은 같은 계정). 비밀번호는 8~72자이고 scrypt 해시로만 보관하며 응답에 포함하지 않습니다. 응답 `data`는 세션 정보(로그인 응답과 같은 모양)입니다.
- 입력 오류는 `{ "error": "…", "field": "phone" }` 형태로 필드를 알려 줍니다. 계정을 만드는 시도가 1분에 10번을 넘으면 429입니다.
- 이 서비스는 시연용이라 실제 이름·전화번호 대신 가상의 값을 쓰도록 안내합니다.

### 요청·응답 예시

```http
POST /api/auth/login
Content-Type: application/json

{ "username": "guardian", "password": "demo-1234" }
```

```http
HTTP/1.1 200 OK
Set-Cookie: baton_session=7b0c…; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800

{ "data": {
  "user_id": "00000000-0000-4000-8000-000000000001",
  "role": "guardian",
  "display_name": "시연 보호자",
  "relation": "어머니",
  "caregiver_type": null,
  "center_id": null,
  "center_name": null,
  "care_recipient_id": "00000000-0000-4000-8000-0000000000a1",
  "care_recipient": { "id": "00000000-0000-4000-8000-0000000000a1", "name": "민준(시연)" }
} }
```

`GET /api/auth/session`과 로그인 응답의 `data`는 같은 모양이며 [`packages/contracts/auth-session.schema.json`](../packages/contracts/auth-session.schema.json)에 정의되어 있습니다. 모든 필드가 항상 있고 해당 없으면 `null`입니다.

```http
GET /api/auth/check-role?roles=caregiver,center_admin
→ 200 { "data": { "allowed": true, "role": "caregiver" } }
→ 403 { "error": "이 화면을 볼 수 있는 역할이 아니에요." }
```

### 역할별 반환값

| 역할 | `care_recipient_id` / `care_recipient` | 그 밖의 값 |
| --- | --- | --- |
| `guardian` | 본인 돌봄 대상(시연: 민준(시연)) | `relation`(어머니 등) |
| `caregiver` | **지금 열람 가능한 첫 배정 대상**(D의 배정이 없으면 `null`) | `caregiver_type`, `center_id`, `center_name` |
| `center_admin` | 항상 `null` | `center_id`, `center_name` |

`care_recipient_id`가 `null`이면 보호자는 홈으로, 종사자는 "아직 배정된 대상이 없어요" 화면으로 안내합니다. 배정이 없는 종사자도 로그인은 성공합니다.

## 화면에서 쓰는 방법

```js
// 진입 시: 로그인 상태 확인
const response = await fetch('/api/auth/session');
if (response.status === 401) location.hash = '#/login';
const { data: session } = await response.json();

// 로그인
const login = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});

// 로그아웃
await fetch('/api/auth/logout', { method: 'POST' });
```

역할별 시작 화면 제안: `guardian` → 보호자 홈, `caregiver` → 종사자 홈, `center_admin` → 센터 화면. 다른 역할의 화면 주소로 들어오면 `check-role`이 403이므로 자기 홈으로 보냅니다.

## 서버 코드에서 세션 쓰기

다른 모듈은 `authStore.userIdFor(readSessionToken(request))`로 로그인 사용자 ID를 얻습니다(`apps/api/src/auth/`). D의 `handleCareRequest`는 `sessionUserId` 인자로 이미 연결되어 있습니다.

## 한계

- 메모리 저장소라 서버 재시작·여러 인스턴스(서버리스) 사이에서 세션이 공유되지 않습니다.
- 시연 계정 비밀번호는 모두 같고, `/api/auth/demo-accounts`가 이를 공개합니다. 시연이 아닌 환경에서는 `AUTH_EXPOSE_DEMO_ACCOUNTS=off`로 끄고 실제 인증으로 교체해야 합니다.
- 회원가입 계정도 서버 메모리에만 있어 서버를 다시 시작하면 사라집니다(시연 데이터 초기화에는 남습니다). 전화번호 인증, 비밀번호 변경·찾기, 탈퇴, Supabase Auth 연동은 구현하지 않았습니다.
- 가입한 사용자는 D의 역할 데이터에 등록되며(`registerUser`), 공개 시연 사용자 목록(`/api/care/demo-users`)에는 나오지 않습니다.
