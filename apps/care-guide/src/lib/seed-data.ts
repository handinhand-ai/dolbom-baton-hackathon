// 합성 시연 데이터. 실제 인물·기관·연락처가 아니다. 이름 옆에 (가상)을 붙여 구분한다.
const ALL = ['COMMUNICATION', 'ANXIETY_CHALLENGING_BEHAVIOR', 'PAIN_DISCOMFORT_SIGN', 'HEALTH_SAFETY_INFO', 'MEAL', 'HYGIENE_TOILETING_DRESSING', 'DAILY_ROUTINE_SLEEP', 'LIKES_DISLIKES', 'OWN_WISH'];

export const SEED = {
  staff: [
    { staffId: 'staff_demo_01', displayName: '종사자 A (가상)', role: 'caregiver' },
    { staffId: 'staff_demo_02', displayName: '종사자 B (가상)', role: 'caregiver' },
  ],
  recipients: [
    // 홈 화면에 보이는 성별·키·몸무게·인상착의는 보호자가 입력한 값이라는 가정의 합성 데이터다.
    { recipientId: 'rec_demo_01', displayName: '민준 (가상)', basicInfo: { age: 24, sex: '남', heightCm: 172, weightKg: 65, impression: '보통 체형의 약간 아담한 인상이에요', note: '합성 시연 데이터' } },
    { recipientId: 'rec_demo_02', displayName: '서연 (가상)', basicInfo: { age: 31, note: '합성 시연 데이터' } },
    { recipientId: 'rec_demo_03', displayName: '도윤 (가상)', basicInfo: { age: 19, note: '합성 시연 데이터 · 데모 종사자 A에게 권한 없음' } },
  ],
  access: [
    { staffId: 'staff_demo_01', recipientId: 'rec_demo_01', allowed: ALL },
    // 서연: 보호자가 '건강 안전 정보'를 공유하지 않은 상황 (선택 공유 범위 시연)
    { staffId: 'staff_demo_01', recipientId: 'rec_demo_02', allowed: ALL.filter((c) => c !== 'HEALTH_SAFETY_INFO') },
    // 도윤: 종사자 B에게만 권한. 종사자 A 화면·검색에 절대 나오면 안 된다.
    { staffId: 'staff_demo_02', recipientId: 'rec_demo_03', allowed: ALL },
  ],
  guides: [
    ['rec_demo_01', 'COMMUNICATION', '말보다 몸짓과 손짓으로 표현합니다. 원하는 것이 있으면 손으로 가리킵니다. 짧은 문장으로 천천히 말해 주세요.', '2026-10-28T10:00:00+09:00'],
    ['rec_demo_01', 'ANXIETY_CHALLENGING_BEHAVIOR', '큰 소리가 나면 귀를 막고 소리를 지를 수 있습니다. 조용한 곳으로 함께 이동해 주세요. 헤드폰을 쓰면 진정돼요.', '2026-10-28T10:05:00+09:00'],
    ['rec_demo_01', 'PAIN_DISCOMFORT_SIGN', '아플 때 말로 표현하지 못하고, 아픈 곳을 자꾸 만지거나 문지릅니다.', '2026-10-28T10:10:00+09:00'],
    ['rec_demo_01', 'HEALTH_SAFETY_INFO', '땅콩 알레르기가 있습니다(합성 예시). 약은 처방전 기준으로 보호자가 준비한 것만 드립니다. 비상 연락은 센터 비상연락망을 따릅니다.', '2026-10-28T10:15:00+09:00'],
    ['rec_demo_01', 'MEAL', '숟가락으로 혼자 먹을 수 있습니다. 국에 밥을 말아 먹는 것을 좋아합니다. 반찬 냄새가 강하면 고개를 돌리기도 합니다.', '2026-10-29T09:00:00+09:00'],
    ['rec_demo_01', 'HYGIENE_TOILETING_DRESSING', '화장실은 혼자 갑니다. 옷 단추를 채울 때는 도움이 필요합니다.', '2026-10-29T09:05:00+09:00'],
    // rec_demo_01 의 '하루 일과·수면'은 미작성 (보호자 확인 필요 시연)
    ['rec_demo_01', 'LIKES_DISLIKES', '좋아하는 것: 기차 그림, 잔잔한 음악. 싫어하는 것: 큰 소리, 사람이 많은 곳.', '2026-10-29T09:10:00+09:00'],
    ['rec_demo_01', 'OWN_WISH', '두 가지 중에서 고르게 하면 스스로 선택합니다. 그림 카드를 함께 보여 주세요.', '2026-10-29T09:15:00+09:00'],
    ['rec_demo_02', 'COMMUNICATION', '간단한 말로 대화할 수 있습니다. 질문은 한 번에 하나씩 해 주세요.', '2026-11-01T11:00:00+09:00'],
    ['rec_demo_02', 'DAILY_ROUTINE_SLEEP', '잠들기 전 잔잔한 음악을 20분 듣는 순서가 있습니다.', '2026-11-01T11:05:00+09:00'],
    ['rec_demo_02', 'HEALTH_SAFETY_INFO', '[비공유 항목] 종사자 A에게 공유되지 않은 합성 건강 정보입니다.', '2026-11-01T11:10:00+09:00'],
    ['rec_demo_03', 'LIKES_DISLIKES', '[도윤 전용] 산책과 헤드폰으로 음악 듣기를 좋아합니다. 식사 때 소리를 지르면 창가 자리로 옮겨 줍니다.', '2026-11-03T10:00:00+09:00'],
  ],
  records: [
    {
      recipientId: 'rec_demo_01', author: 'staff_demo_02', observedAt: '2026-11-02T12:20:00+09:00', confirmedAt: '2026-11-02T12:40:00+09:00',
      source: '점심 때 식판을 밀어냈는데 잠깐 쉬고 좋아하는 반찬부터 주니까 다시 먹었어요.',
      text: '점심 식사 때 식판을 밀어냈으나, 잠시 쉰 뒤 좋아하는 반찬부터 제공하자 다시 식사를 시작함.',
      observation: ['식판을 밀어냄'], response: ['잠시 휴식', '좋아하는 반찬부터 제공'], outcome: '다시 식사를 시작함',
      primary: 'MEAL', related: ['ANXIETY_CHALLENGING_BEHAVIOR'],
    },
    {
      recipientId: 'rec_demo_01', author: 'staff_demo_02', observedAt: '2026-11-05T15:10:00+09:00', confirmedAt: '2026-11-05T15:30:00+09:00',
      source: '복도에서 큰 소리 나니까 귀 막고 소리 질렀어요. 헤드폰 씌워 주니 10분쯤 뒤에 진정됐어요.',
      text: '복도에서 큰 소리가 나자 귀를 막고 소리를 지름. 헤드폰을 씌워 주자 10분쯤 뒤 진정됨.',
      observation: ['큰 소리에 귀를 막음', '소리를 지름'], response: ['헤드폰 제공'], outcome: '10분쯤 뒤 진정됨',
      primary: 'ANXIETY_CHALLENGING_BEHAVIOR', related: ['LIKES_DISLIKES'],
    },
    {
      recipientId: 'rec_demo_01', author: 'staff_demo_02', observedAt: '2026-11-08T10:00:00+09:00', confirmedAt: '2026-11-08T10:15:00+09:00',
      source: '물 마시고 싶을 때 컵을 가리켰어요. 컵 보여 주면서 물? 하고 물어보니 고개를 끄덕였어요.',
      text: '물을 마시고 싶을 때 컵을 가리킴. 컵을 보여 주며 "물?" 하고 묻자 고개를 끄덕임.',
      observation: ['컵을 가리킴'], response: ['컵을 보여 주며 질문'], outcome: '고개를 끄덕임',
      primary: 'COMMUNICATION', related: [],
    },
    {
      recipientId: 'rec_demo_01', author: 'staff_demo_02', observedAt: '2026-11-12T19:00:00+09:00', confirmedAt: '2026-11-12T19:20:00+09:00',
      source: 'TV 소리가 커지니까 귀를 막았어요. 헤드폰 씌우자 오히려 벗어 던지고 소리를 더 크게 질렀어요. 조용한 방으로 옮기니 괜찮아졌어요.',
      text: 'TV 소리가 커지자 귀를 막음. 헤드폰을 씌우자 오히려 벗어 던지고 소리를 더 크게 지름. 조용한 방으로 옮기자 괜찮아짐.',
      observation: ['TV 소리에 귀를 막음'], response: ['헤드폰 제공', '조용한 방으로 이동'], outcome: '헤드폰은 벗어 던짐, 조용한 방에서 괜찮아짐',
      primary: 'ANXIETY_CHALLENGING_BEHAVIOR', related: [],
    },
    {
      recipientId: 'rec_demo_02', author: 'staff_demo_02', observedAt: '2026-11-10T23:30:00+09:00', confirmedAt: '2026-11-11T07:00:00+09:00',
      source: '밤에 자다가 깼을 때 조명 낮추고 음악 틀어 주니까 다시 잠들었어요.',
      text: '밤에 자다가 깼을 때 조명을 낮추고 음악을 틀어 주자 다시 잠듦.',
      observation: ['자다가 깸'], response: ['조명을 낮춤', '음악을 틀어 줌'], outcome: '다시 잠듦',
      primary: 'DAILY_ROUTINE_SLEEP', related: [],
    },
    {
      recipientId: 'rec_demo_03', author: 'staff_demo_02', observedAt: '2026-11-09T12:00:00+09:00', confirmedAt: '2026-11-09T12:30:00+09:00',
      source: '[도윤 전용] 식사 중 소리를 질러서 창가로 옮겨 주니 다시 먹었어요.',
      text: '[도윤 전용] 식사 중 소리를 질러 창가 자리로 옮겨 주자 다시 식사함.',
      observation: ['식사 중 소리를 지름'], response: ['창가 자리로 이동'], outcome: '다시 식사함',
      primary: 'MEAL', related: [],
    },
  ],
};
