'use client';
// 기록 후보 확인·수정 → 확인 체크 후에만 저장 (FR-309, EX-06). 저장해도 공식 가이드는 바뀌지 않는다.
import { useState } from 'react';
import { useApp } from './AppProvider';
import { api, fmtDate, fmtTime } from './client';
import { ErrorBox, Loading } from './ui';

const split = (v: string) => v.split('/').map((s) => s.trim()).filter(Boolean);
const INPUT_LABEL: Record<string, string> = { text: '글', voice_transcribed: '말 (받아쓴 글)', quick_button: '빠른 기록' };

export function DraftEditor({ rid, recipient, draft, onSaved, onCancel }: { rid: string; recipient: any; draft: any; onSaved: () => void; onCancel: () => void }) {
  const { categories } = useApp();
  const p = draft.proposal;
  const shared = new Set<string>(recipient.sharedCategories);
  const [category, setCategory] = useState<string>(p.category || '');
  const [related, setRelated] = useState<string[]>(p.relatedCategories || []);
  const [content, setContent] = useState<string>(p.content);
  const [obs, setObs] = useState<string>(p.observation.join(' / '));
  const [resp, setResp] = useState<string>(p.response.join(' / '));
  const [result, setResult] = useState<string>(p.result || '');
  const [confirmed, setConfirmed] = useState(false);
  const [guideReq, setGuideReq] = useState(false);
  const [version, setVersion] = useState<number>(draft.version);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; saved?: any; message?: string }>({ kind: 'idle' });
  const locked = state.kind === 'saved';
  const canSave = confirmed && Boolean(category) && Boolean(content.trim()) && state.kind !== 'saving' && !locked;

  async function save() {
    setState({ kind: 'saving' });
    try {
      const patched = await api(`/api/v1/care-record-drafts/${draft.draftId}`, {
        method: 'PATCH',
        body: {
          recipientId: rid, version, content: content.trim(), category: category || null,
          relatedCategories: related.filter((c) => c !== category),
          observation: split(obs), response: split(resp), result: result.trim() || null, reviewed: true,
        },
      });
      setVersion(patched.version);
      const saved = await api(`/api/v1/care-record-drafts/${draft.draftId}/save`, { method: 'POST', body: { recipientId: rid, requestGuideUpdate: guideReq } });
      setState({ kind: 'saved', saved });
      onSaved();
    } catch (e: any) {
      setState({ kind: 'error', message: e.message });
    }
  }

  async function cancel() {
    try { await api(`/api/v1/care-record-drafts/${draft.draftId}/discard`, { method: 'POST', body: {} }); } catch { /* 이미 처리됨 */ }
    onCancel();
  }

  const statusChip = locked ? <span className="chip solid">저장 완료</span>
    : confirmed ? <span className="chip mint">확인 완료 · 저장 전</span> : <span className="chip butter">확인 전</span>;

  return (
    <section className="card" aria-labelledby="h-draft" style={{ marginTop: 16 }}>
      <div className="row"><h2 id="h-draft" className="grow" style={{ margin: 0 }}>이렇게 정리했어요</h2>{statusChip}</div>
      <p className="small muted">{draft.engine === 'local-rules' ? '규칙 기반 데모 · 원문 문장을 그대로 써요' : `AI 정리 · ${draft.engine}`} · 아직 저장되지 않았어요</p>
      {p.needsCategorySelection
        ? <div className="notice warn"><strong>항목을 골라 주세요 · </strong>{p.classificationReason || '분류가 확실하지 않아요.'}</div>
        : <p className="small">✦ {p.classificationReason}</p>}
      {draft.similarRecords?.length > 0 && (
        <div className="notice info"><strong>비슷한 기록이 있어요 · </strong>같은 내용인지 직접 확인해 주세요.
          {draft.similarRecords.map((s: any) => <div key={s.recordId} className="small">{s.content} ({fmtDate(s.createdAt)})</div>)}
        </div>
      )}

      <label htmlFor="cat" className="field-label">주 항목</label>
      <select id="cat" value={category} disabled={locked} onChange={(e) => setCategory(e.target.value)}>
        <option value="">항목을 골라 주세요</option>
        {categories.map((c) => <option key={c.code} value={c.code}>{c.name}{shared.has(c.code) ? '' : ' (공유 안 됨)'}</option>)}
      </select>
      <details><summary>관련 항목 고르기</summary>
        <div className="cat-check">
          {categories.map((c) => (
            <label key={c.code} className="check">
              <input type="checkbox" disabled={locked} checked={related.includes(c.code)}
                onChange={(e) => setRelated((xs) => (e.target.checked ? [...xs, c.code] : xs.filter((x) => x !== c.code)))} />
              {c.name}
            </label>
          ))}
        </div>
      </details>
      <label htmlFor="content" className="field-label">정리된 기록</label>
      <textarea id="content" value={content} disabled={locked} onChange={(e) => setContent(e.target.value)} />
      <label htmlFor="obs" className="field-label">본 것 (여러 개는 / 로 나눠요)</label>
      <input id="obs" type="text" value={obs} disabled={locked} onChange={(e) => setObs(e.target.value)} />
      <label htmlFor="resp" className="field-label">실제로 한 것</label>
      <input id="resp" type="text" value={resp} disabled={locked} onChange={(e) => setResp(e.target.value)} />
      <label htmlFor="result" className="field-label">그 뒤 모습</label>
      <input id="result" type="text" value={result} disabled={locked} onChange={(e) => setResult(e.target.value)} />
      {p.missingInformation?.length > 0 && <p className="small muted">빠진 정보: {p.missingInformation.join(', ')} · 아는 만큼만 채워 주세요</p>}
      <details><summary>원래 입력 보기</summary>
        <p>{draft.rawInput.text}</p>
        <p className="src">{INPUT_LABEL[draft.rawInput.inputType]}{draft.rawInput.activityHint ? ` · 빠른 기록: ${draft.rawInput.activityHint}` : ''} · 받아쓴 원문은 그대로 보관돼요 (음성 파일은 저장하지 않아요)</p>
      </details>

      <div className="card soft" style={{ marginTop: 14 }}>
        <label className="check"><input type="checkbox" checked={confirmed} disabled={locked} onChange={(e) => setConfirmed(e.target.checked)} />본 것·한 것·결과·항목을 확인했어요</label>
        <label className="check"><input type="checkbox" checked={guideReq} disabled={locked} onChange={(e) => setGuideReq(e.target.checked)} />보호자에게 새 정보로 보내기 (보호자가 넣기로 해야 설명서에 반영)</label>
      </div>
      <div className="stack">
        <button className="primary big" disabled={!canSave} onClick={save}>확인하고 저장</button>
        {!locked && <button className="ghost" onClick={cancel}>저장하지 않을래요</button>}
      </div>
      <div aria-live="polite">
        {state.kind === 'saving' && <Loading text="저장하는 중" />}
        {state.kind === 'error' && <ErrorBox message={state.message || ''}><p className="small">입력과 고친 내용은 그대로 남아 있어요. 다시 시도해 주세요.</p></ErrorBox>}
        {state.kind === 'saved' && (
          <div className="notice ok" role="status">
            <strong>저장했어요 · </strong>{state.saved.categoryName} · {fmtTime(state.saved.createdAt)} · {state.saved.author.label}
            <p>설명서(공식 가이드)는 바뀌지 않았어요.{state.saved.guideUpdateRequest ? ' 보호자에게 새 정보로 보냈어요. 보호자가 넣기로 해야 설명서에 들어가요.' : ''}</p>
          </div>
        )}
      </div>
    </section>
  );
}
