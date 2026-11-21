// 로컬 시연용 규칙 사전. AI 키가 없을 때 쓰는 규칙 기반 분석의 근거이며,
// 입력에서 "명시된 표현"만 찾는다. 원인·의도를 추정하는 규칙은 두지 않는다.

/** 활동(현재 무엇을 하던 중인지) */
export const ACTIVITIES = [
  { label: '식사', category: 'MEAL', re: /(밥|식사|점심|저녁밥|아침밥|반찬|식판|숟가락|젓가락|간식|먹|국을|국에)/, terms: ['식사', '밥', '반찬', '식판', '먹'] },
  { label: '수면', category: 'DAILY_ROUTINE_SLEEP', re: /(잠(?!시|깐)|자려|자지\s*않|잠들|깼|깨서|깨어|깨면|밤에|새벽에|수면|낮잠|졸려|재우)/, terms: ['수면', '잠을', '잠들', '자기 전', '자다가'] },
  { label: '화장실', category: 'HYGIENE_TOILETING_DRESSING', re: /(화장실|소변|대변|기저귀|변기|용변)/, terms: ['화장실', '소변', '변기'] },
  { label: '씻기', category: 'HYGIENE_TOILETING_DRESSING', re: /(목욕|샤워|씻|양치|머리를?\s*감)/, terms: ['목욕', '샤워', '씻', '양치'] },
  { label: '옷 입기', category: 'HYGIENE_TOILETING_DRESSING', re: /(옷을?|갈아입|단추|양말|신발을?\s*신)/, terms: ['옷', '갈아입'] },
  { label: '복약', category: 'HEALTH_SAFETY_INFO', re: /(약을|약 먹|복약|약봉지)/, terms: ['약', '복약'] },
  { label: '외출·이동', category: 'DAILY_ROUTINE_SLEEP', re: /(외출|산책|버스|지하철|차를?\s*타|밖에\s*나가)/, terms: ['외출', '산책'] },
  { label: '놀이·여가', category: 'LIKES_DISLIKES', re: /(놀이|그림|색칠|블록|퍼즐|TV|티비|텔레비전|유튜브|음악을?\s*듣)/, terms: ['놀이', '그림', 'TV', '음악'] },
];

/** 관찰 행동(입력에 명시된 행동 표현) */
export const BEHAVIORS = [
  { label: '식사 거부', category: 'MEAL', re: /(먹(으려고|으려|지)\s*(하지\s*)?않|안\s*먹|밥을?\s*거부|식사를?\s*거부|먹기를?\s*거부)/, terms: ['거부', '안 먹'] },
  { label: '고개 돌림', category: 'COMMUNICATION', re: /고개를?\s*(계속\s*|자꾸\s*)?돌/, terms: ['고개'] },
  { label: '밀어냄', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(밀어\s*(내|냈|냄|버)|밀었|밀쳐)/, terms: ['밀어'] },
  { label: '소리 지름', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(소리를?\s*(크게\s*)?(지르|질러|질렀)|소리\s*쳐|비명)/, terms: ['소리', '소리를 지'] },
  { label: '귀를 막음', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /귀를?\s*(손으로\s*)?막/, terms: ['귀를 막', '귀'] },
  { label: '울음', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(울(어|고|었|음|기|먹)|눈물)/, terms: ['울'] },
  { label: '때리거나 자해하는 행동', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(때리|때려|때렸|머리를?\s*(박|치|쳐)|할퀴|깨물)/, terms: ['때리', '머리를'] },
  { label: '물건 던짐', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(던지|던져|던졌)/, terms: ['던지', '던져'] },
  { label: '돌아다니거나 나가려 함', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(돌아다니|뛰쳐|나가려|문을\s*열려)/, terms: ['돌아다니', '나가려'] },
  { label: '손을 흔들거나 몸을 흔듦', category: 'ANXIETY_CHALLENGING_BEHAVIOR', re: /(몸을?\s*(앞뒤로\s*)?흔들|손을?\s*(계속\s*)?흔들|손뼉)/, terms: ['흔들'] },
  { label: '잠들지 못함', category: 'DAILY_ROUTINE_SLEEP', re: /(잠을?\s*(못|안)\s*자|안\s*자려|잠들지\s*(못|않)|자다가\s*깼|자꾸\s*깨)/, terms: ['잠', '깨'] },
  { label: '특정 부위를 만지거나 문지름', category: 'PAIN_DISCOMFORT_SIGN', re: /(배|머리|이|귀|발|손|얼굴)를?\s*(자꾸\s*|계속\s*)?(만지|문지르|문질|잡고|감싸)/, terms: ['만지', '문지르'] },
  { label: '아파하는 모습', category: 'PAIN_DISCOMFORT_SIGN', re: /(아파|아프|통증|찡그|인상을?\s*써)/, terms: ['아파', '아프', '찡그'] },
  { label: '거부 표현', category: 'OWN_WISH', re: /(거부|싫다고|싫어(해|했|하)|안\s*하려|하기\s*싫)/, terms: ['거부', '싫어'] },
];

/** 대상·자극·물건 (검색어로 사용) */
export const OBJECTS = ['헤드폰', '이어폰', '큰 소리', '소음', '소리', '음악', 'TV', '물', '반찬', '국', '숟가락', '그림카드', '그림 카드', '몸짓', '손짓', '담요', '인형', '조명', '불빛', '사람이 많', '낯선', '줄 서', '기다리'];

export const RESPONSE_RE = /(주니|주자|줬|줘|주고|주면|드리|제공|건네|건넸|보여\s*주|보여줬|틀어|씌우|씌웠|쉬게|쉬고|쉬었|기다리|기다렸|안아|달래|데려|옮겨|바꿔|줄이|줄였|껐|끄고|낮추|낮췄|설명|말해\s*주|알려\s*주|권하|권했|먼저\s*(주|제공|건네)|자리를?\s*옮|조용한\s*곳)/;
export const OUTCOME_POS_RE = /(진정|괜찮아|괜찮았|편안|좋아했|다시\s*(먹|시작|식사)|시작했|잘\s*먹|먹었|마셨|잠들|잤|웃|멈췄|그쳤|줄었|조용해|안정)/;
export const OUTCOME_NEG_RE = /(오히려|더\s*심해|심해졌|더\s*크게|벗어\s*던|던졌|던지고|계속\s*울|거부했|싫어했|효과가?\s*없)/;

export const MEDICAL_RE = /(열이|발열|고열|체온|경련|발작|피가|피를|출혈|숨을?\s*(잘\s*)?(못|안)|숨이|호흡|토했|구토|토해|토를|쓰러|의식|기절|다쳤|상처|부었|부어|약을?\s*(더|얼마나|몇)|용량|복용량|진단|처방|병원에|응급|알레르기\s*반응|두드러기)/;

export const USUAL_RE = /평소(에는|엔|에|처럼|와\s*달리|랑\s*다르게)?\s*([^.!?]{1,40}?)(는데|지만|었는데|았는데|던데|인데|데,)/;
export const TIME_RE = /(아침|점심|저녁|밤|새벽|오전|오후|자기\s*전|식사\s*후|식후)(\s*\d{1,2}\s*시(\s*\d{1,2}\s*분)?)?|\d{1,2}\s*시(\s*\d{1,2}\s*분)?/;

export const QUESTION_RE = /([?？]\s*$|(까|나요|니|냐|어때|뭐|무엇|어떻게|왜|언제|어디|있어\??$|있나|할까|될까|되나|돼\?|알려\s*줘|알려\s*주세요|방법)\s*[?？]?\s*$)/;
export const NEW_SITUATION_MARKER_RE = /(이번에는|이번엔|새로운\s*상황|다른\s*상황|지금은|방금|갑자기)/;

export const STOPWORDS = new Set([
  '오늘', '지금', '계속', '자꾸', '그리고', '너무', '조금', '많이', '정말', '진짜', '그냥', '어떻게', '뭐', '왜', '이거', '그거', '저거',
  '있어', '있어요', '했어', '했어요', '해요', '하고', '해서', '하는', '하면', '있는', '없어', '같아', '같아요', '그래서', '근데', '그런데',
  '평소', '평소에는', '평소엔', '처음', '처음에는', '다시', '잠깐', '잠시', '아까', '방금', '이번', '이번엔', '이제', '혹시',
]);

const PARTICLES = ['에서는', '에게서', '으로는', '이랑은', '이에요', '에서', '에게', '한테', '으로', '하고', '처럼', '까지', '부터', '이랑', '이가', '이는', '이를', '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '의', '랑', '요'];

export function stripParticle(token) {
  for (const p of PARTICLES) {
    if (token.length > p.length + 1 && token.endsWith(p)) return token.slice(0, -p.length);
  }
  return token;
}
