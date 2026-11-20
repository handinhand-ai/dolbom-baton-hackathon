async function showHealth() {
  const output = document.getElementById('health');
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Health request failed');
    const health = await response.json();
    if (health.status !== 'ok' || health.mode !== 'skeleton') {
      throw new Error('Unexpected health response');
    }
    output.textContent = '서버 연결 정상 · 개발용 스켈레톤';
  } catch {
    output.textContent = '서버 연결을 확인할 수 없습니다. 실행 상태를 확인해 주세요.';
  }
}

showHealth();
