// 규칙 기반 분석기 (AI 키가 없을 때의 로컬 시연용).
// 원칙: 입력에 명시된 표현만 구조화하고, 원인·의도·차이를 추정하지 않는다.
import { CATEGORIES, categoryByCode } from '../categories';
import {
  ACTIVITIES, BEHAVIORS, OBJECTS, RESPONSE_RE, OUTCOME_POS_RE, OUTCOME_NEG_RE, MEDICAL_RE,
  USUAL_RE, TIME_RE, QUESTION_RE, NEW_SITUATION_MARKER_RE, STOPWORDS, stripParticle,
} from './lexicon';

const SINGLE_CHAR_OK = new Set(['밥', '먹']);

export function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function rawTokens(text) {
  return normalizeText(text)
    .split(/[^0-9A-Za-z가-힣]+/)
    .map((t) => stripParticle(t))
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && /[가-힣A-Za-z]/.test(t));
}

/** 현재 상황 입력 구조화 (WF-01 3단계) */
export function extractSituation(input) {
  const text = normalizeText(input);
  const activities = ACTIVITIES.filter((a) => a.re.test(text));
  const behaviors = BEHAVIORS.filter((b) => b.re.test(text));
  const objects = OBJECTS.filter((o) => text.includes(o));
  const usual = text.match(USUAL_RE);
  const time = text.match(TIME_RE);
  const medicalMatch = text.match(MEDICAL_RE);

  // "식사 거부"가 잡혔다면 일반 "거부 표현"은 중복이므로 뺀다.
  const behaviorLabels = behaviors.map((b) => b.label).filter((l, _, all) => !(l === '거부 표현' && all.includes('식사 거부')));
  const primaryActivity = activities[0] || null;

  const categoryScores: Record<string, number> = {};
  const add = (code, w) => { if (code) categoryScores[code] = (categoryScores[code] || 0) + w; };
  activities.forEach((a) => add(a.category, 2));
  behaviors.forEach((b) => add(b.category, 1));

  const keywords = new Set<string>();
  activities.forEach((a) => a.terms.forEach((t) => keywords.add(t)));
  behaviors.forEach((b) => b.terms.forEach((t) => keywords.add(t)));
  objects.forEach((o) => keywords.add(o));
  Object.keys(categoryScores).forEach((c) => keywords.add(categoryByCode(c).name));
  rawTokens(text).slice(0, 8).forEach((t) => keywords.add(t));
  // 한 글자 검색어는 다른 단어 안에서 우연히 일치하기 쉬워(예: '잠' ⊂ '잠시') 일부만 허용한다.
  for (const k of [...keywords]) if (k.length < 2 && !SINGLE_CHAR_OK.has(k)) keywords.delete(k);

  const clear = text.length >= 6 && (activities.length > 0 || behaviors.length > 0 || objects.length > 0);
  return {
    summary: text.length > 60 ? `${text.slice(0, 60)}…` : text,
    activity: primaryActivity?.label || null,
    activityCategory: primaryActivity?.category || null,
    otherActivities: activities.slice(1).map((a) => a.label),
    observedBehavior: behaviorLabels,
    details: objects,
    usualBehaviorMentioned: usual ? usual[0].replace(/[,\s]+$/, '') : null,
    timeMentioned: time ? time[0] : null,
    categoryScores,
    keywords: [...keywords],
    medical: { flag: Boolean(medicalMatch), matched: medicalMatch ? medicalMatch[0] : null },
    clarification: clear
      ? { needed: false, question: null }
      : { needed: true, question: '어떤 활동 중에 어떤 행동이 보였는지 조금 더 알려 주세요. (예: "점심 식사 중 식판을 밀어내요")' },
  };
}

/** 검색 쿼리 키워드 (후속 질문 등) */
export function extractKeywords(text) {
  return extractSituation(text).keywords;
}

function polarity(sentence) {
  if (OUTCOME_NEG_RE.test(sentence)) return 'neg';
  if (OUTCOME_POS_RE.test(sentence)) return 'pos';
  return null;
}

/**
 * 같은 대상(물건·자극)에 대해 한쪽은 긍정 결과, 다른 쪽은 부정 결과를 적은 근거 쌍을 상충으로 표시한다.
 * 어느 쪽이 맞는지는 판단하지 않는다.
 */
export function detectConflicts(evidence) {
  const conflicts: { evidenceRefs: string[]; topic: string; description: string }[] = [];
  for (let i = 0; i < evidence.length; i += 1) {
    for (let j = i + 1; j < evidence.length; j += 1) {
      const a = evidence[i];
      const b = evidence[j];
      for (const obj of OBJECTS) {
        if (obj.length < 2 || !a.excerpt.includes(obj) || !b.excerpt.includes(obj)) continue;
        const pa = polarity(a.excerpt);
        const pb = polarity(b.excerpt);
        if (pa && pb && pa !== pb) {
          conflicts.push({ evidenceRefs: [a.evidenceId, b.evidenceId], topic: obj, description: `'${obj}'에 대한 기록이 서로 다릅니다.` });
          break;
        }
      }
    }
  }
  return conflicts;
}

export function looksLikeQuestion(text) {
  return QUESTION_RE.test(normalizeText(text));
}

/** 후속 대화에서 새 상황일 가능성 판별 (최종 결정은 사용자가 한다) */
export function classifyFollowUp(activeSituation, text) {
  const info = extractSituation(text);
  const hasObservation = info.observedBehavior.length > 0;
  const differentActivity = info.activityCategory && activeSituation?.activityCategory && info.activityCategory !== activeSituation.activityCategory;
  const marker = NEW_SITUATION_MARKER_RE.test(text);
  // 질문이 아니라 새로 본 행동을 알리는 말이고, 지금 상황의 행동과 겹치지 않으면 새 상황일 수 있다.
  const prior = new Set(activeSituation?.observedBehavior || []);
  const newObservation = hasObservation && !looksLikeQuestion(text) && !info.observedBehavior.some((b) => prior.has(b));
  if (hasObservation && (differentActivity || marker || newObservation)) {
    return { type: 'possible_new_situation', reason: differentActivity ? `현재 상황(${activeSituation.activity || '이전 상황'})과 다른 활동(${info.activity})의 관찰이 포함되어 있어요.` : '새로운 관찰 내용이 포함되어 있어요.' };
  }
  const experience = !looksLikeQuestion(text) && RESPONSE_RE.test(text) && (OUTCOME_POS_RE.test(text) || OUTCOME_NEG_RE.test(text));
  return { type: experience ? 'experience_statement' : 'follow_up', reason: null };
}

const SPLIT_AFTER = /((?:주|하|보여|틀어|건네|씌우|드리)니까?|(?:하|주|건네|보여\s*주|씌우|드리|틀어\s*주)자|더니|지만|는데|은데|고\s*나서|고나서|한\s*뒤에?|한\s*후에?|다가)(\s+)/g;

function splitClauses(text) {
  return normalizeText(text)
    .replace(SPLIT_AFTER, '$1|')
    .split(/\||[,.!?。]\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** WF-03 경험 구조화: 관찰·대응·결과를 원문 표현 그대로 나눈다. */
export function structureExperience(rawText: string, hintCategory: string | null = null) {
  const text = normalizeText(rawText);
  const clauses = splitClauses(text);
  const observation: string[] = [];
  const response: string[] = [];
  const result: string[] = [];
  let seenResponse = false;
  for (const c of clauses) {
    const isResp = RESPONSE_RE.test(c);
    const isOutcome = OUTCOME_POS_RE.test(c) || OUTCOME_NEG_RE.test(c);
    if (isResp) { response.push(c); seenResponse = true; continue; }
    if (seenResponse && isOutcome) { result.push(c); continue; }
    observation.push(c);
  }

  const info = extractSituation(text);
  const scores = { ...info.categoryScores };
  const add = (code, w) => { scores[code] = (scores[code] || 0) + w; };
  if (/(진정|안정|불안|흥분)/.test(text)) add('ANXIETY_CHALLENGING_BEHAVIOR', 1);
  if (/(좋아하는|좋아해|싫어하는|싫어해)/.test(text)) add('LIKES_DISLIKES', 1);
  if (/(손짓|몸짓|가리키|표현|말로|그림카드|그림 카드)/.test(text)) add('COMMUNICATION', 1);
  if (hintCategory) add(hintCategory, 2);

  const ranked = CATEGORIES.map((c) => ({ code: c.code, score: scores[c.code] || 0 }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || categoryByCode(a.code).order - categoryByCode(b.code).order);
  const top = ranked[0];
  const tie = ranked.length > 1 && ranked[1].score === top.score;
  const missing: string[] = [];
  if (observation.length === 0) missing.push('관찰한 행동·상황');
  if (response.length === 0) missing.push('실제로 한 대응');
  if (response.length > 0 && result.length === 0) missing.push('대응 후 결과');

  return {
    content: /[.!?]$/.test(text) ? text : `${text}.`,
    observation,
    response,
    result: result.join(' ') || null,
    context: { time: info.timeMentioned },
    emotionOrExpression: null,
    category: top?.code || null,
    relatedCategories: ranked.slice(1, 3).map((r) => r.code),
    classificationReason: top
      ? `입력에서 ${categoryByCode(top.code).name} 관련 표현이 확인되었습니다 (규칙 점수 기반).`
      : '분류할 수 있는 표현을 찾지 못했습니다. 항목을 직접 선택해 주세요.',
    confidenceLevel: !top ? 'none' : tie || top.score < 2 ? 'low' : 'medium',
    needsCategorySelection: !top || tie,
    missingInformation: missing,
    unconfirmedCause: '원인은 입력에서 확인되지 않아 기록하지 않습니다.',
  };
}
